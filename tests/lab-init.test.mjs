import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAB_BIN = path.join(PKG_ROOT, 'bin', 'lab.mjs');
const BATON_BIN = path.join(PKG_ROOT, 'units', 'handoffs', 'handoff.mjs');

describe('Lab AEF Toolkit: All-in-One init (lab init) 集成测试', () => {
  it('1. 一键初始化全新项目（骨架/事实源/ADR/待办/门禁/探针/全客户端桩）', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-init-test-'));

    try {
      // 1. 初始化 git 仓库
      execSync('git init -b main', { cwd: tmpDir, stdio: 'pipe' });

      // 2. 执行 lab init
      const initOut = execSync(`node ${LAB_BIN} init "AwesomeApp"`, {
        cwd: tmpDir,
        encoding: 'utf8',
        stdio: 'pipe',
      });

      assert.match(initOut, /全套工程规范一键初始化成功/);
      assert.match(initOut, /已就绪工程机件清单/);

      // 3. 验证核心事实源与宪法
      assert.ok(fs.existsSync(path.join(tmpDir, 'constitution.md')), 'constitution.md 必须存在');
      const constContent = fs.readFileSync(path.join(tmpDir, 'constitution.md'), 'utf8');
      assert.ok(constContent.includes('AwesomeApp'), '宪法中必须包含项目名');

      assert.ok(fs.existsSync(path.join(tmpDir, 'group', 'product', 'intent.md')), 'intent.md 必须存在');
      assert.ok(fs.existsSync(path.join(tmpDir, 'group', 'architecture', 'dependency-graph.md')), 'dependency-graph.md 必须存在');
      assert.ok(fs.existsSync(path.join(tmpDir, 'group', 'contracts', 'api.md')), 'api.md 必须存在');

      // 4. 验证 ADR 架构决策体系
      assert.ok(fs.existsSync(path.join(tmpDir, 'docs', 'adr', 'INDEX.md')), 'docs/adr/INDEX.md 必须存在');
      assert.ok(fs.existsSync(path.join(tmpDir, 'docs', 'adr', '0001-AwesomeApp-bootstrap.md')), '0001-AwesomeApp-bootstrap.md 必须存在');
      assert.ok(fs.existsSync(path.join(tmpDir, 'docs', 'adr', 'templates', 'adr-template.md')), 'adr-template.md 必须存在');

      // 5. 验证 Backlog 待办捕获
      assert.ok(fs.existsSync(path.join(tmpDir, 'docs', 'backlogs', 'IRONRULES.md')), 'IRONRULES.md 必须存在');
      assert.ok(fs.existsSync(path.join(tmpDir, 'docs', 'backlogs', 'template.md')), 'template.md 必须存在');

      // 6. 验证 Preflight 不变量探针与门禁
      assert.ok(fs.existsSync(path.join(tmpDir, 'scripts', 'preflight.sh')), 'scripts/preflight.sh 必须存在');
      assert.ok(fs.existsSync(path.join(tmpDir, 'preflight.conf')), 'preflight.conf 必须存在');
      assert.ok(fs.existsSync(path.join(tmpDir, '.githooks', 'pre-commit')), '.githooks/pre-commit 必须存在');
      assert.ok(fs.existsSync(path.join(tmpDir, '.githooks', 'pre-commit.d', '20-preflight')), '20-preflight 必须存在');
      assert.ok(fs.existsSync(path.join(tmpDir, '.githooks', 'pre-commit.d', '30-orphan-guard')), '30-orphan-guard 必须存在');

      // 7. 验证 Git 门禁自动挂载
      const hooksPath = execSync('git config core.hooksPath', { cwd: tmpDir, encoding: 'utf8' }).trim();
      assert.equal(hooksPath, '.githooks', 'core.hooksPath 必须自动指向 .githooks');

      // 8. 验证全客户端载体与 Baton 接入桩
      const agentsContent = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');
      assert.match(agentsContent, /handoff-stub:v2\.1 begin/, 'AGENTS.md 必须包含 Baton 接入桩');

      const codebuddyContent = fs.readFileSync(path.join(tmpDir, 'CODEBUDDY.md'), 'utf8');
      assert.match(codebuddyContent, /handoff-stub:v2\.1 begin/, 'CODEBUDDY.md 必须包含 Baton 接入桩');

      const cursorContent = fs.readFileSync(path.join(tmpDir, '.cursorrules'), 'utf8');
      assert.match(cursorContent, /handoff-stub:v2\.1 begin/, '.cursorrules 必须包含 Baton 接入桩');

      const copilotContent = fs.readFileSync(path.join(tmpDir, '.github', 'copilot-instructions.md'), 'utf8');
      assert.match(copilotContent, /handoff-stub:v2\.1 begin/, 'copilot-instructions.md 必须包含 Baton 接入桩');

      // 9. 验证 Baton check 与 Preflight 语法/运行通过
      const checkRes = execSync(`node ${BATON_BIN} check`, { cwd: tmpDir, encoding: 'utf8' });
      assert.match(checkRes, /check 通过/);

      const preflightRes = execSync('bash scripts/preflight.sh', { cwd: tmpDir, encoding: 'utf8' });
      assert.match(preflightRes, /preflight @/);

      // 10. 验证幂等性（再次执行不会损坏现有工程）
      const reinitOut = execSync(`node ${LAB_BIN} init`, { cwd: tmpDir, encoding: 'utf8' });
      assert.match(reinitOut, /一键初始化成功/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('2. 在已有业务仓非破坏性一键引入 AEF 机件 (Existing Project Non-destructive Injection)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-init-existing-'));

    try {
      execSync('git init -b main', { cwd: tmpDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'my-legacy-app', version: '0.1.0' }, null, 2));
      fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Legacy App\nExisting documentation\n');
      fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Existing Rules\nExisting custom guidelines\n');
      execSync('git add . && git commit -m "initial commit"', { cwd: tmpDir, stdio: 'pipe' });

      // 运行 lab init
      const out = execSync(`node ${LAB_BIN} init`, { cwd: tmpDir, encoding: 'utf8' });
      assert.match(out, /全套工程规范一键初始化成功/);

      // 验证未覆盖现有文件，但成功注入了接入桩
      const agents = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');
      assert.ok(agents.includes('Existing custom guidelines'), '已有自定义指南不得被冲掉');
      assert.match(agents, /handoff-stub:v2\.1 begin/, '必须无缝注入 Baton 接入桩');

      // 验证门禁与探针已到位
      assert.ok(fs.existsSync(path.join(tmpDir, 'scripts', 'preflight.sh')));
      assert.ok(fs.existsSync(path.join(tmpDir, '.githooks', 'pre-commit')));
      assert.equal(execSync('git config core.hooksPath', { cwd: tmpDir, encoding: 'utf8' }).trim(), '.githooks');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('3. lab zspec init 别名无缝向后兼容', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-zspec-test-'));

    try {
      execSync('git init -b main', { cwd: tmpDir, stdio: 'pipe' });
      const out = execSync(`node ${LAB_BIN} zspec init "ZSpecApp"`, { cwd: tmpDir, encoding: 'utf8' });
      assert.match(out, /全套工程规范一键初始化成功/);
      assert.ok(fs.existsSync(path.join(tmpDir, 'constitution.md')));
      assert.ok(fs.existsSync(path.join(tmpDir, '.handoffs', '.handoff-hub.json')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
