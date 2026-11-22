import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function readSemVer(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const m = content.match(/v?(\d+\.\d+\.\d+)/);
  assert.ok(m, `Could not parse SemVer from ${filePath}: ${content}`);
  return m[1];
}

const PKG = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

const CLI_TARGETS = [
  {
    name: 'lab',
    binPath: path.join(REPO_ROOT, 'bin', 'lab.mjs'),
    expectedVersion: PKG.version,
    sourceFile: 'package.json',
  },
  {
    name: 'baton (units/handoffs)',
    binPath: path.join(REPO_ROOT, 'units', 'handoffs', 'handoff.mjs'),
    expectedVersion: readSemVer(path.join(REPO_ROOT, 'units', 'handoffs', 'VERSION.md')),
    sourceFile: 'units/handoffs/VERSION.md',
  },
  {
    name: 'lab-orphan (units/orphan)',
    binPath: path.join(REPO_ROOT, 'units', 'orphan', 'bin', 'lab-orphan.mjs'),
    expectedVersion: readSemVer(path.join(REPO_ROOT, 'units', 'orphan', 'VERSION.md')),
    sourceFile: 'units/orphan/VERSION.md',
  },
  {
    name: 'spec-guard (units/spec-guard)',
    binPath: path.join(REPO_ROOT, 'units', 'spec-guard', 'bin', 'spec-guard.mjs'),
    expectedVersion: readSemVer(path.join(REPO_ROOT, 'units', 'spec-guard', 'VERSION.md')),
    sourceFile: 'units/spec-guard/VERSION.md',
  },
  {
    name: 'baton-worktree (units/worktree)',
    binPath: path.join(REPO_ROOT, 'units', 'worktree', 'worktree.mjs'),
    expectedVersion: readSemVer(path.join(REPO_ROOT, 'units', 'worktree', 'VERSION.md')),
    sourceFile: 'units/worktree/VERSION.md',
  },
  {
    name: 'baton-audit-runner (units/review-gate)',
    binPath: path.join(REPO_ROOT, 'units', 'review-gate', 'clean-runner.mjs'),
    expectedVersion: readSemVer(path.join(REPO_ROOT, 'units', 'review-gate', 'VERSION.md')),
    sourceFile: 'units/review-gate/VERSION.md',
  },
];

describe('全 CLI 对称契约与版本单一事实源（SSOT）门禁测试', () => {
  for (const target of CLI_TARGETS) {
    describe(`CLI 契约: ${target.name}`, () => {
      it(`支持 --version 与 -v 选项，且版本精准对齐 ${target.sourceFile} (v${target.expectedVersion})`, () => {
        for (const flag of ['--version', '-v']) {
          const out = execSync(`node "${target.binPath}" ${flag}`, {
            encoding: 'utf8',
            stdio: 'pipe',
          }).trim();
          assert.match(
            out,
            new RegExp(`v?${target.expectedVersion.replace(/\./g, '\\.')}`),
            `${target.name} ${flag} 输出 (${out}) 未包含预期版本 v${target.expectedVersion}`
          );
        }
      });

      it(`支持 --help 与 -h 选项，且帮助 Banner 版本不发生硬编码漂移`, () => {
        for (const flag of ['--help', '-h']) {
          const out = execSync(`node "${target.binPath}" ${flag}`, {
            encoding: 'utf8',
            stdio: 'pipe',
          }).trim();
          assert.match(
            out,
            new RegExp(`v?${target.expectedVersion.replace(/\./g, '\\.')}`),
            `${target.name} ${flag} 帮助文本未包含预期版本 v${target.expectedVersion}`
          );
        }
      });

      it(`在外部工作区运行 (cwd: /tmp) 时路径解析正常，无模块丢失崩溃`, () => {
        const out = execSync(`node "${target.binPath}" --version`, {
          cwd: os.tmpdir(),
          encoding: 'utf8',
          stdio: 'pipe',
        }).trim();
        assert.match(
          out,
          new RegExp(`v?${target.expectedVersion.replace(/\./g, '\\.')}`),
          `从 ${os.tmpdir()} 跨目录调用 ${target.name} 失败`
        );
      });
    });
  }
});
