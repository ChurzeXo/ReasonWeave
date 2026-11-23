import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractTaskBrief } from '../bin/task-brief.mjs';
import { generateReviewPackage } from '../bin/review-package.mjs';

function createTestGitRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reasonweave-pipeline-test-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: tmp, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Tester'], { cwd: tmp, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: tmp, stdio: 'ignore' });

  // Initial commit
  fs.writeFileSync(path.join(tmp, 'file1.txt'), 'Initial text\n');
  execFileSync('git', ['add', '.'], { cwd: tmp, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: tmp, stdio: 'ignore' });
  const baseSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmp, encoding: 'utf8' }).trim();

  // Commit 1
  fs.writeFileSync(path.join(tmp, 'file1.txt'), 'Updated text\n');
  fs.writeFileSync(path.join(tmp, 'file2.txt'), 'New file\n');
  execFileSync('git', ['add', '.'], { cwd: tmp, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'Task 1: Add file2 and update file1'], { cwd: tmp, stdio: 'ignore' });

  // Commit 2
  fs.writeFileSync(path.join(tmp, 'file2.txt'), 'New file with extra line\n');
  execFileSync('git', ['add', '.'], { cwd: tmp, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'Task 1: Refine file2'], { cwd: tmp, stdio: 'ignore' });
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmp, encoding: 'utf8' }).trim();

  return {
    dir: tmp,
    baseSha,
    headSha,
    cleanup: () => {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {}
    },
  };
}

describe('units/skills: 零污染流水线切片工具测试 (ADR-0015)', () => {
  describe('extractTaskBrief (task-brief)', () => {
    const samplePlan = `
# Implementation Plan

## Overview
Some introductory text.

## Task 1: Setup infrastructure
- Create directory structure
- Configure build tools

\`\`\`markdown
# Task 99 inside code fence should be ignored
\`\`\`

## Task 2: Implement core algorithm
- Write failing tests first
- Implement function \`compute()\`
- Verify with 100 cases

### Task 2.1: Optimize memory
- Add cache

## Task 3: Final verification
- Run all tests
`;

    it('能精确提取指定 Task 的完整正文与子任务', () => {
      const res = extractTaskBrief(samplePlan, '2');
      assert.ok(res.found);
      assert.match(res.content, /## Task 2: Implement core algorithm/);
      assert.match(res.content, /Implement function `compute\(\)`/);
      assert.match(res.content, /### Task 2.1: Optimize memory/);
      assert.doesNotMatch(res.content, /## Task 3: Final verification/);
    });

    it('忽略代码块内伪造的 Task 标题', () => {
      const res = extractTaskBrief(samplePlan, '1');
      assert.ok(res.found);
      assert.match(res.content, /## Task 1: Setup infrastructure/);
      assert.doesNotMatch(res.content, /## Task 2/);
      assert.ok(!res.availableTasks.includes('99'), '代码块内的 Task 99 不应被当作真实任务');
    });

    it('查询不存在的 Task 时返回 found: false 并提供可用任务清单', () => {
      const res = extractTaskBrief(samplePlan, '404');
      assert.equal(res.found, false);
      assert.ok(res.availableTasks.includes('1'));
      assert.ok(res.availableTasks.includes('2'));
      assert.ok(res.availableTasks.includes('3'));
    });
  });

  describe('generateReviewPackage (review-package)', () => {
    it('跨多 Commit 生成完备的 Diff 审查包', () => {
      const repo = createTestGitRepo();
      try {
        const pkg = generateReviewPackage(repo.baseSha, repo.headSha, { cwd: repo.dir });
        assert.equal(pkg.commitCount, 2);
        assert.match(pkg.content, /# Review Package:/);
        assert.match(pkg.content, /## Commits/);
        assert.match(pkg.content, /Task 1: Add file2/);
        assert.match(pkg.content, /Task 1: Refine file2/);
        assert.match(pkg.content, /## Files Changed/);
        assert.match(pkg.content, /file1\.txt/);
        assert.match(pkg.content, /file2\.txt/);
        assert.match(pkg.content, /## Net Diff/);
      } finally {
        repo.cleanup();
      }
    });

    it('若 HEAD 不是 BASE 的后代则抛出异常阻断', () => {
      const repo = createTestGitRepo();
      try {
        assert.throws(
          () => generateReviewPackage(repo.headSha, repo.baseSha, { cwd: repo.dir }),
          /HEAD 不是 BASE 的后代提交/
        );
      } finally {
        repo.cleanup();
      }
    });
  });
});
