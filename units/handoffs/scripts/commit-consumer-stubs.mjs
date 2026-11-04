#!/usr/bin/env node
/**
 * 6 大下游消费方接入桩精准提交脚本
 * 针对 iggle, Swoop, Prospero, Tappy, 一期一卉花, WarmTag：
 * 仅暂存并提交 Handoff 接入桩相关文件（AGENTS.md, CLAUDE.md, README.md），
 * 绝不触碰工作区中其它未相关的修改。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TARGET_REPOS = [
  { name: 'iggle', path: '/Users/churze/Documents/iggle' },
  { name: 'Swoop', path: '/Users/churze/Documents/Swoop' },
  { name: 'Prospero', path: '/Users/churze/Documents/Prospero' },
  { name: 'Tappy', path: '/Users/churze/Documents/Developer/Tappy' },
  { name: '一期一卉花', path: '/Users/churze/Documents/Developer/一期一卉花' },
  { name: 'WarmTag', path: '/Users/churze/Documents/WarmTag' },
];

const STUB_FILES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md'];
const COMMIT_MSG = 'chore(handoff): upgrade handoff stub to v2.15.0 with intra-repo prompt exemption';

console.log('🚀 开始为 6 大下游消费方精准提交 Handoff v2.15.0 接入桩（含 AGENTS/CLAUDE/GEMINI）...\n');

const results = [];

for (const repo of TARGET_REPOS) {
  console.log(`--------------------------------------------------`);
  console.log(`📦 处理仓库: ${repo.name} (${repo.path})`);

  if (!fs.existsSync(repo.path)) {
    console.log(`⚠️ 目录不存在，跳过`);
    results.push({ name: repo.name, status: 'SKIPPED_NOT_FOUND' });
    continue;
  }

  // 1. 检查桩文件是否存在并改动
  const filesToStage = [];
  for (const f of STUB_FILES) {
    const full = path.join(repo.path, f);
    if (!fs.existsSync(full)) continue;

    // 检查是否有 diff 或未跟踪
    try {
      const statusOut = execFileSync('git', ['status', '--porcelain', '--', f], { cwd: repo.path, encoding: 'utf8' }).trim();
      if (statusOut) {
        filesToStage.push(f);
      }
    } catch (e) {
      console.error(`  - 检查 ${f} 失败: ${e.message}`);
    }
  }

  if (filesToStage.length === 0) {
    console.log(`ℹ️ 无接入桩文件变动，无需提交。`);
    results.push({ name: repo.name, status: 'NO_CHANGES' });
    continue;
  }

  console.log(`  - 待暂存桩文件: ${filesToStage.join(', ')}`);

  try {
    // 2. 精准 git add
    execFileSync('git', ['add', '--', ...filesToStage], { cwd: repo.path });

    // 3. 执行提交
    execFileSync('git', ['commit', '-m', COMMIT_MSG], { cwd: repo.path });

    // 4. 获取最新 commit sha
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo.path, encoding: 'utf8' }).trim();
    console.log(`  ✅ 提交成功: [${sha}] ${COMMIT_MSG}`);
    results.push({ name: repo.name, status: 'COMMITTED', sha, files: filesToStage });
  } catch (err) {
    console.error(`  ❌ 提交失败: ${err.message}`);
    results.push({ name: repo.name, status: 'FAILED', error: err.message });
  }
}

console.log(`\n================== 消费方处理总结 ==================`);
for (const r of results) {
  if (r.status === 'COMMITTED') {
    console.log(`✅ [${r.name}] 成功提交 (${r.sha}) -> ${r.files.join(', ')}`);
  } else if (r.status === 'NO_CHANGES') {
    console.log(`ℹ️ [${r.name}] 无变动（已是最新）`);
  } else {
    console.log(`❌ [${r.name}] 异常: ${r.status}`);
  }
}
console.log(`====================================================\n`);
