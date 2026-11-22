import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { OrphanDepsSolver } from '../core/orphan-deps.mjs';

describe('OrphanDepsSolver & Secrets Scanner (ADR-0011 / ADR-0012)', () => {
  test('detects orphan dependencies in Python requirements.txt', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-py-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'requirements.txt'),
        'requests>=2.28.0\nflask==2.3.0\nnumpy\npython-dotenv>=1.0.0\n'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'main.py'),
        'import requests\nfrom dotenv import load_dotenv\nload_dotenv()\n'
      );

      // 初始化临时 git 仓库以供 getTrackedFiles 识别
      execSync('git init && git add .', { cwd: tmpDir, stdio: 'pipe' });

      const solver = new OrphanDepsSolver({ repoDir: tmpDir });
      const results = await solver.scan();

      assert.equal(results.length, 1);
      const pyResult = results[0];
      assert.equal(pyResult.manifest, 'requirements.txt');
      assert.equal(pyResult.total_declared, 4);
      // flask 与 numpy 未导入，requests 与 python-dotenv (dotenv) 应被保留
      assert.ok(pyResult.orphans.includes('flask'));
      assert.ok(pyResult.orphans.includes('numpy'));
      assert.equal(pyResult.orphans.length, 2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('detects orphan dependencies in Node package.json', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-node-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'test-app',
          dependencies: {
            lodash: '^4.17.21',
            express: '^4.18.2',
            chalk: '^5.0.0'
          }
        }, null, 2)
      );
      fs.writeFileSync(
        path.join(tmpDir, 'index.mjs'),
        'import _ from "lodash";\nconsole.log(_);\n'
      );

      execSync('git init && git add .', { cwd: tmpDir, stdio: 'pipe' });

      const solver = new OrphanDepsSolver({ repoDir: tmpDir });
      const results = await solver.scan();

      assert.equal(results.length, 1);
      const nodeResult = results[0];
      assert.equal(nodeResult.manifest, 'package.json');
      assert.equal(nodeResult.total_declared, 3);
      assert.ok(nodeResult.orphans.includes('express'));
      assert.ok(nodeResult.orphans.includes('chalk'));
      assert.ok(!nodeResult.orphans.includes('lodash'));
      assert.equal(nodeResult.orphans.length, 2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('scanSecrets detects real high-entropy tokens and ignores dummy placeholders', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-test-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'config.py'),
        '# Valid high-entropy fake token\n' +
        'ghp_token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz"\n' +
        '# Placeholder token should be ignored\n' +
        'dummy_token = "your-token-here"\n' +
        'test_key = "dummy_key_placeholder"\n'
      );

      execSync('git init && git add .', { cwd: tmpDir, stdio: 'pipe' });

      const solver = new OrphanDepsSolver({ repoDir: tmpDir });
      const findings = solver.scanSecrets();

      assert.equal(findings.length, 1);
      assert.equal(findings[0].file, 'config.py');
      assert.match(findings[0].match, /ghp_1234567890/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('CLI --strict gate exits with code 1 upon findings', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-gate-'));
    const cliPath = path.resolve('units/orphan/bin/lab-orphan.mjs');

    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'gate-test',
          dependencies: { unused_pkg: '^1.0.0' }
        }, null, 2)
      );
      fs.writeFileSync(path.join(tmpDir, 'index.js'), 'console.log("hello");\n');
      execSync('git init && git add .', { cwd: tmpDir, stdio: 'pipe' });

      // 无 --strict 时 exit 0
      assert.doesNotThrow(() => {
        execSync(`node "${cliPath}" check-deps`, { cwd: tmpDir, stdio: 'pipe' });
      });

      // 带 --strict 时触发门禁 exit 1
      assert.throws(() => {
        execSync(`node "${cliPath}" check-deps --strict`, { cwd: tmpDir, stdio: 'pipe' });
      }, (err) => err.status === 1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
