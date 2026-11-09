#!/usr/bin/env node
/**
 * baton-worktree / units/worktree
 * 基于 Git Worktree 的物理目录隔离调度引擎
 * AEF / Lab Agent Engineering Toolkit
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const command = args[0] || 'help';

function runCmd(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (err) {
    if (options.ignoreError) return null;
    const stderr = err.stderr ? err.stderr.toString() : '';
    throw new Error(`Command failed: ${cmd}\n${stderr || err.message}`);
  }
}

function getRepoRoot() {
  const root = runCmd('git rev-parse --show-toplevel', { ignoreError: true });
  if (!root) {
    console.error('❌ 错误: 当前目录不在 Git 仓库管理下，无法使用 worktree 隔离。');
    process.exit(1);
  }
  return path.resolve(root);
}

function sanitizeId(id) {
  if (!id) return '';
  return String(id).trim().replace(/[^a-zA-Z0-9._-]/g, '-');
}

function ensureGitignore(repoRoot) {
  const gitignorePath = path.join(repoRoot, '.gitignore');
  const entry = '.worktrees/';
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `# Baton / Lab Worktrees\n${entry}\n`, 'utf-8');
    return;
  }
  const content = fs.readFileSync(gitignorePath, 'utf-8');
  const lines = content.split('\n').map((l) => l.trim());
  if (!lines.includes('.worktrees/') && !lines.includes('.worktrees')) {
    const appendContent = content.endsWith('\n')
      ? `\n# Baton / Lab Worktrees\n${entry}\n`
      : `\n\n# Baton / Lab Worktrees\n${entry}\n`;
    fs.appendFileSync(gitignorePath, appendContent, 'utf-8');
  }
}

function setupSharedCaches(repoRoot, targetPath) {
  const sharedDirs = ['node_modules', 'target', '.venv'];
  const mounted = [];

  for (const dir of sharedDirs) {
    const srcPath = path.join(repoRoot, dir);
    const destPath = path.join(targetPath, dir);

    if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
      try {
        fs.symlinkSync(srcPath, destPath, 'dir');
        mounted.push(dir);
      } catch (e) {
        // 软链接创建失败时降级忽略，不阻断主流程
      }
    }
  }
  return mounted;
}

function allocate(ticketId, options = {}) {
  const cleanId = sanitizeId(ticketId);
  if (!cleanId) {
    console.error('❌ 错误: 必须指定工单 ID (ticket-id)。');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  ensureGitignore(repoRoot);

  const worktreesDir = path.join(repoRoot, '.worktrees');
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  const targetPath = path.join(worktreesDir, cleanId);
  const branchName = `ticket/${cleanId}`;
  const baseBranch = options.base || 'HEAD';

  // 1. 检查是否已经存在于 git worktree 清单
  const worktreeList = runCmd('git worktree list --porcelain', { ignoreError: true }) || '';
  const isAlreadyAllocated = worktreeList.includes(`worktree ${targetPath}`);

  if (isAlreadyAllocated && fs.existsSync(targetPath)) {
    const mounted = setupSharedCaches(repoRoot, targetPath);
    if (options.json) {
      console.log(JSON.stringify({ status: 'existing', path: targetPath, branch: branchName, mounted }));
    } else {
      console.log(`ℹ️ 工单隔离区已存在: \x1b[36m${targetPath}\x1b[0m (分支: ${branchName})`);
    }
    return targetPath;
  }

  // 2. 检查分支是否已存在
  const branchExists = runCmd(`git rev-parse --verify refs/heads/${branchName}`, { ignoreError: true });

  try {
    if (branchExists) {
      runCmd(`git worktree add "${targetPath}" "${branchName}"`);
    } else {
      runCmd(`git worktree add -b "${branchName}" "${targetPath}" "${baseBranch}"`);
    }
  } catch (err) {
    console.error(`❌ 分配 Worktree 失败: ${err.message}`);
    process.exit(1);
  }

  // 3. 挂载共享依赖缓存
  const mounted = setupSharedCaches(repoRoot, targetPath);

  if (options.json) {
    console.log(JSON.stringify({ status: 'allocated', path: targetPath, branch: branchName, mounted }));
  } else {
    console.log(`\n✅ 成功分配物理隔离工作区:`);
    console.log(`  • 路径: \x1b[32m${targetPath}\x1b[0m`);
    console.log(`  • 分支: \x1b[36m${branchName}\x1b[0m (基于 ${baseBranch})`);
    if (mounted.length > 0) {
      console.log(`  • 依赖缓存共享软链: ${mounted.join(', ')}`);
    }
    console.log(`\n提示: 针对该工单的修改应在上述隔离目录内执行。\n`);
  }

  return targetPath;
}

function prune(ticketId, options = {}) {
  const cleanId = sanitizeId(ticketId);
  if (!cleanId) {
    console.error('❌ 错误: 必须指定工单 ID (ticket-id)。');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const targetPath = path.join(repoRoot, '.worktrees', cleanId);
  const branchName = `ticket/${cleanId}`;

  // 1. 检查是否存在该 worktree
  const worktreeList = runCmd('git worktree list --porcelain', { ignoreError: true }) || '';
  const existsInList = worktreeList.includes(`worktree ${targetPath}`);

  if (existsInList || fs.existsSync(targetPath)) {
    const forceFlag = options.force ? '--force' : '';
    try {
      runCmd(`git worktree remove ${forceFlag} "${targetPath}"`);
    } catch (err) {
      if (options.force) {
        fs.rmSync(targetPath, { recursive: true, force: true });
        runCmd('git worktree prune', { ignoreError: true });
      } else {
        console.error(`❌ 回收失败 (存在未提交改动): ${err.message}\n若确认丢弃，请加 --force 强制回收。`);
        process.exit(1);
      }
    }
  }

  // 2. 清理分支
  const branchExists = runCmd(`git rev-parse --verify refs/heads/${branchName}`, { ignoreError: true });
  if (branchExists) {
    const delFlag = options.force ? '-D' : '-d';
    try {
      runCmd(`git branch ${delFlag} "${branchName}"`);
    } catch {
      // 若无法安全删除分支且未加 force，提示用户
    }
  }

  runCmd('git worktree prune', { ignoreError: true });

  if (options.json) {
    console.log(JSON.stringify({ status: 'pruned', ticketId: cleanId }));
  } else {
    console.log(`\n🧹 已成功回收工单 [${cleanId}] 的隔离工作区与临时分支。`);
  }
}

function list(options = {}) {
  const repoRoot = getRepoRoot();
  const rawList = runCmd('git worktree list --porcelain', { ignoreError: true }) || '';
  const entries = [];
  const blocks = rawList.split('\n\n').filter(Boolean);

  const worktreeBase = path.join(repoRoot, '.worktrees');

  for (const block of blocks) {
    const lines = block.split('\n');
    let wtPath = '';
    let head = '';
    let branch = '';

    for (const line of lines) {
      if (line.startsWith('worktree ')) wtPath = line.replace('worktree ', '').trim();
      if (line.startsWith('HEAD ')) head = line.replace('HEAD ', '').trim();
      if (line.startsWith('branch ')) branch = line.replace('branch ', '').trim();
    }

    if (wtPath.startsWith(worktreeBase)) {
      const ticketId = path.basename(wtPath);
      entries.push({ ticketId, path: wtPath, head: head.substring(0, 7), branch });
    }
  }

  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log(`\n📋 当前活动 Agent 隔离工作区 (${entries.length} 个):`);
  if (entries.length === 0) {
    console.log('  (暂无活动的隔离工作区)\n');
    return;
  }

  console.log('─'.repeat(70));
  for (const e of entries) {
    console.log(`• 工单 ID: \x1b[36m${e.ticketId.padEnd(16)}\x1b[0m 分支: ${e.branch || 'detached'} (${e.head})`);
    console.log(`  物理路径: ${e.path}`);
  }
  console.log('─'.repeat(70) + '\n');
}

function status(ticketId) {
  const cleanId = sanitizeId(ticketId);
  const repoRoot = getRepoRoot();
  const targetPath = path.join(repoRoot, '.worktrees', cleanId);

  if (!fs.existsSync(targetPath)) {
    console.error(`❌ 未找到工单 [${cleanId}] 的隔离目录: ${targetPath}`);
    process.exit(1);
  }

  console.log(`\n🔍 工单 [${cleanId}] 隔离区改动状态 (${targetPath}):`);
  const statusOut = runCmd(`git -C "${targetPath}" status --short`);
  if (!statusOut) {
    console.log('  (工作目录干净，无未提交改动)\n');
  } else {
    console.log(statusOut + '\n');
  }
}

function cleanAll(options = {}) {
  const repoRoot = getRepoRoot();
  const worktreeBase = path.join(repoRoot, '.worktrees');
  if (!fs.existsSync(worktreeBase)) {
    console.log('ℹ️ 无隔离目录需要清理。');
    return;
  }

  const items = fs.readdirSync(worktreeBase);
  console.log(`🧹 正在扫描并清理 ${items.length} 个工作区...`);
  for (const item of items) {
    prune(item, options);
  }
  console.log('✅ 全部清理完毕。\n');
}

function showHelp() {
  console.log(`
Baton Worktree CLI — Agent 物理隔离调度引擎 (units/worktree v0.1.0)

用法:
  baton-worktree allocate <ticket-id> [--base <branch>] [--json]
      为指定工单分配独立的物理工作区 (.worktrees/<ticket-id>)，
      自动维护 .gitignore 并挂载依赖缓存软链。

  baton-worktree prune <ticket-id> [--force] [--json]
      安全回收指定工单的隔离工作区与关联分支。

  baton-worktree list [--json]
      列出当前仓库所有由 Agent 隔离的工作区。

  baton-worktree status <ticket-id>
      检视指定隔离区内的代码变更状态。

  baton-worktree clean-all [--force]
      清理当前仓库所有的 Agent 隔离区。

  baton-worktree help
      显示帮助信息。
`);
}

// CLI 解析分发
const isJson = args.includes('--json');
const isForce = args.includes('--force');
const baseIndex = args.indexOf('--base');
const baseBranch = baseIndex !== -1 ? args[baseIndex + 1] : undefined;

switch (command) {
  case 'allocate':
  case 'alloc':
    allocate(args[1], { base: baseBranch, json: isJson });
    break;
  case 'prune':
  case 'rm':
    prune(args[1], { force: isForce, json: isJson });
    break;
  case 'list':
  case 'ls':
    list({ json: isJson });
    break;
  case 'status':
    status(args[1]);
    break;
  case 'clean-all':
    cleanAll({ force: isForce });
    break;
  case 'help':
  case '--help':
  case '-h':
  default:
    showHelp();
    break;
}
