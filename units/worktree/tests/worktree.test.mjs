import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

describe('units/worktree: 隔离与回收诚实状态测试', () => {
  const worktreeBin = path.resolve('units/worktree/worktree.mjs');

  it('prune 在分支无法安全删除时真实反映状态，不瞒报成功', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-'));
    try {
      execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'pipe' });

      // 创建初始提交
      fs.writeFileSync(path.join(tmpDir, 'init.txt'), 'base');
      execSync('git add init.txt && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });

      const ticketId = 'TASK-001';
      // 1. 分配 worktree
      execSync(`node "${worktreeBin}" allocate ${ticketId}`, { cwd: tmpDir, stdio: 'pipe' });

      const wtPath = path.join(tmpDir, '.worktrees', ticketId);
      assert.ok(fs.existsSync(wtPath), 'Worktree directory should be created');

      // 2. 在 worktree 中产生未合并提交
      fs.writeFileSync(path.join(wtPath, 'feature.txt'), 'feature branch commit');
      execSync('git add feature.txt && git commit -m "work in progress"', { cwd: wtPath, stdio: 'pipe' });

      // 3. 执行 prune (不带 --force)
      const pruneOut = execSync(`node "${worktreeBin}" prune ${ticketId} --json`, {
        cwd: tmpDir,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      const parsed = JSON.parse(pruneOut);
      assert.equal(parsed.status, 'worktree_removed_branch_retained');
      assert.equal(parsed.branchPruned, false);
      assert.ok(parsed.branchPruneError, 'Should report branch prune error');

      // 4. 带 --force 执行 prune
      const forceOut = execSync(`node "${worktreeBin}" prune ${ticketId} --force --json`, {
        cwd: tmpDir,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      const forceParsed = JSON.parse(forceOut);
      assert.equal(forceParsed.status, 'pruned');
      assert.equal(forceParsed.branchPruned, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
