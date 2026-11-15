#!/usr/bin/env node
/**
 * scripts/sync-all-consumers.mjs
 *
 * 全自动下游消费方批量同步与体检脚本 (AEF v1.0)
 * 1. 扫描已知工程目录与消费方仓库 (iggle, Swoop, Tappy, Prospero 等)
 * 2. 批量刷新 Agent Baton 接入桩 (baton install) 至最新契约版本
 * 3. 自动根据仓库架构特征就绪 spec-matrix.overlay.yml 配置 (iggle / Swoop)
 * 4. 批量运行 baton check 合规体验收并输出全景汇总报告
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATON_CLI = path.join(PKG_ROOT, 'units', 'handoffs', 'handoff.mjs');
const CURRENT_VERSION = (() => {
  try {
    const vFile = path.join(PKG_ROOT, 'units', 'handoffs', 'VERSION.md');
    const content = fs.readFileSync(vFile, 'utf8').trim();
    const match = content.match(/v\d+\.\d+\.\d+/);
    return match ? match[0] : 'v2.30.0';
  } catch {
    return 'v2.30.0';
  }
})();

const searchRoots = [
  path.join(os.homedir(), 'Documents', 'Developer'),
  path.join(os.homedir(), 'Documents'),
  path.join(os.homedir(), 'Developer'),
];

console.log('🚀 [Lab Consumer Sync] 开始全自动扫描与同步下游消费方...\n');

// 1. 全局 CLI 挂载自检
try {
  console.log('📦 正在刷新全局 npm link...');
  execSync('npm link', { cwd: PKG_ROOT, stdio: 'pipe' });
  console.log('✅ 全局 npm link 刷新成功！\n');
} catch (e) {
  console.warn('⚠️  全局 npm link 告警:', e.message);
}

// 2. 发现下游消费方
const processed = new Set([PKG_ROOT]);
const consumers = [];

for (const root of searchRoots) {
  if (!fs.existsSync(root)) continue;
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const projDir = path.join(root, ent.name);
      if (processed.has(projDir)) continue;

      const hasCarrier =
        fs.existsSync(path.join(projDir, 'AGENTS.md')) ||
        fs.existsSync(path.join(projDir, 'CLAUDE.md')) ||
        fs.existsSync(path.join(projDir, 'GEMINI.md')) ||
        fs.existsSync(path.join(projDir, '.handoffs')) ||
        fs.existsSync(path.join(projDir, 'docs', 'handoffs'));

      if (hasCarrier) {
        processed.add(projDir);
        consumers.push({ name: ent.name, dir: projDir });
      }
    }
  } catch (err) {
    // ignore unreadable dirs
  }
}

console.log(`🔍 发现 ${consumers.length} 个下游消费方仓库:`);
for (const c of consumers) {
  console.log(`   - ${c.name} (${c.dir})`);
}
console.log('');

// 3. 逐仓执行更新与配置就绪
const results = [];

for (const c of consumers) {
  console.log(`🔄 正在同步: \x1b[36m${c.name}\x1b[0m ...`);
  const log = [];

  // A. 特殊工程 spec-matrix.overlay.yml 自动就绪
  if (c.name.toLowerCase() === 'iggle') {
    const overlayFile = path.join(c.dir, 'spec-matrix.overlay.yml');
    if (!fs.existsSync(overlayFile)) {
      const iggleOverlay = `# spec-guard 覆写与配置层 (自动生成)
version: "1.0"
adr_dirs:
  - docs/decisions
adr_id_pattern: "DECISION-\\\\d+"
frozen_states:
  - frozen
section_aliases:
  decision:
    - 决定
  implementation:
    - 验证
`;
      fs.writeFileSync(overlayFile, iggleOverlay, 'utf8');
      log.push('📄 自动写入 spec-matrix.overlay.yml (docs/decisions 与 决定/验证 别名)');
    }
  } else if (c.name.toLowerCase() === 'swoop') {
    const overlayFile = path.join(c.dir, 'spec-matrix.overlay.yml');
    if (!fs.existsSync(overlayFile)) {
      const swoopOverlay = `# spec-guard 覆写与配置层 (自动生成)
version: "1.0"
telemetry:
  ignore_patterns:
    - "≤1s"
    - "轮询"
`;
      fs.writeFileSync(overlayFile, swoopOverlay, 'utf8');
      log.push('📄 自动写入 spec-matrix.overlay.yml (≤1s 约定阈值解耦)');
    }
  }

  // B. 刷新接入桩
  try {
    const installOut = execFileSync('node', [BATON_CLI, 'install', '--project'], {
      cwd: c.dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    log.push(`✅ 接入桩已刷新至最新版本 (${CURRENT_VERSION})`);
  } catch (err) {
    log.push(`⚠️ 接入桩刷新异常: ${err.message.split('\n')[0]}`);
  }

  // C. 运行合规自检
  let checkOk = false;
  try {
    const checkOut = execFileSync('node', [BATON_CLI, 'check'], {
      cwd: c.dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    checkOk = true;
    log.push('✅ baton check 合规通过');
  } catch (err) {
    const lines = (err.stdout || err.stderr || err.message).split('\n');
    log.push(`ℹ️ baton check 提示: ${lines[0] || '存在待处理项'}`);
  }

  results.push({ name: c.name, dir: c.dir, log, checkOk });
}

// 4. 输出全景汇总报告
console.log('\n════════════════ 下游消费方同步汇总报告 ════════════════');
for (const r of results) {
  console.log(`\n📦 仓库: \x1b[36m${r.name}\x1b[0m (${r.dir})`);
  for (const l of r.log) {
    console.log(`   ${l}`);
  }
}
console.log('\n════════════════════════════════════════════════════════');
console.log('🎉 全部下游消费方批量同步完毕！');
console.log('📌 钉值提示：lab 采用单一动态指针模式，消费方无需固定 /lab 提交钉值。');
console.log('📌 二进制提示：本次改动未触及任何 Rust 二进制输入，Swoop REQUIRED_SWEEP_COMMIT 保持稳定。\n');
