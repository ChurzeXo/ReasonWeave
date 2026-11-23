import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.resolve(__dirname, '..', 'skills.mjs');
const VERSION_FILE = path.resolve(__dirname, '..', 'VERSION.md');

function readVersion() {
  const content = fs.readFileSync(VERSION_FILE, 'utf8').trim();
  const m = content.match(/v?(\d+\.\d+\.\d+)/);
  return m ? m[1] : '0.1.0';
}

function createSandbox() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reasonweave-skills-test-'));
  return {
    dir: tmp,
    cleanup: () => {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {}
    },
  };
}

describe('units/skills: CLI 物理契约与沙箱安装测试 (ADR-0013 / ADR-0015)', () => {
  const expectedVersion = readVersion();

  it('支持 --version 与 -v 选项，且版本与 VERSION.md 严格一致', () => {
    const out1 = execFileSync(process.execPath, [CLI_PATH, '--version'], { encoding: 'utf8' }).trim();
    assert.equal(out1, `v${expectedVersion}`);

    const out2 = execFileSync(process.execPath, [CLI_PATH, '-v'], { encoding: 'utf8' }).trim();
    assert.equal(out2, `v${expectedVersion}`);
  });

  it('支持 --help 与 -h 选项，退出码为 0', () => {
    const out1 = execFileSync(process.execPath, [CLI_PATH, '--help'], { encoding: 'utf8' });
    assert.match(out1, /ReasonWeave Skills CLI/);
    assert.match(out1, /用法:/);

    const out2 = execFileSync(process.execPath, [CLI_PATH, '-h'], { encoding: 'utf8' });
    assert.match(out2, /ReasonWeave Skills CLI/);
  });

  it('在外部工作区 (cwd: /tmp) 运行 list 正常输出且退出码为 0', () => {
    const out = execFileSync(process.execPath, [CLI_PATH, 'list'], {
      cwd: os.tmpdir(),
      encoding: 'utf8',
    });
    assert.match(out, /systematic-debugging/);
    assert.match(out, /test-driven-development/);
    assert.match(out, /verification-before-completion/);
    assert.match(out, /brainstorming/);
  });

  it('check 子命令通过且 Exit 0', () => {
    const out = execFileSync(process.execPath, [CLI_PATH, 'check'], { encoding: 'utf8' });
    assert.match(out, /正在核验官方微观技能规范/);
    assert.match(out, /✅ systematic-debugging/);
  });

  it('install --project 在沙箱中正确挂载 .agents/skills/ 软链', () => {
    const sandbox = createSandbox();
    try {
      execFileSync(process.execPath, [CLI_PATH, 'install', '--project'], {
        cwd: sandbox.dir,
        encoding: 'utf8',
      });

      const installedSkillsDir = path.join(sandbox.dir, '.agents', 'skills');
      assert.ok(fs.existsSync(installedSkillsDir));

      const installed = fs.readdirSync(installedSkillsDir);
      assert.ok(installed.includes('systematic-debugging'));
      assert.ok(installed.includes('test-driven-development'));

      const skillFile = path.join(installedSkillsDir, 'systematic-debugging', 'SKILL.md');
      assert.ok(fs.existsSync(skillFile));
    } finally {
      sandbox.cleanup();
    }
  });

  it('install --copy 在沙箱中完成物理拷贝', () => {
    const sandbox = createSandbox();
    try {
      execFileSync(process.execPath, [CLI_PATH, 'install', '--project', '--copy'], {
        cwd: sandbox.dir,
        encoding: 'utf8',
      });

      const skillDir = path.join(sandbox.dir, '.agents', 'skills', 'brainstorming');
      const stat = fs.lstatSync(skillDir);
      assert.ok(!stat.isSymbolicLink(), '应当为物理目录而非软链');
      assert.ok(fs.existsSync(path.join(skillDir, 'SKILL.md')));
    } finally {
      sandbox.cleanup();
    }
  });
});
