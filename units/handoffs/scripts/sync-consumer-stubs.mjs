#!/usr/bin/env node
/**
 * 下游消费方接入桩一键刷新脚本
 * 遍历已知工程目录，执行 handoff install 批量更新接入桩至最新契约版本 (v2.14.0)。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const CLI = path.resolve('units/handoffs/handoff.mjs');
const searchRoots = [
  path.join(os.homedir(), 'Documents/Developer'),
  path.join(os.homedir(), 'Documents'),
  path.join(os.homedir(), 'Developer'),
];

const processed = new Set();
const updated = [];
const skipped = [];

console.log('🚀 开始扫描下游消费方仓库以刷新 Handoff 接入桩...');

for (const root of searchRoots) {
  if (!fs.existsSync(root)) continue;
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const projDir = path.join(root, ent.name);
      if (processed.has(projDir)) continue;

      const hasCarrier = fs.existsSync(path.join(projDir, 'AGENTS.md')) ||
                         fs.existsSync(path.join(projDir, 'CLAUDE.md')) ||
                         fs.existsSync(path.join(projDir, '.handoffs'));

      if (!hasCarrier) continue;
      processed.add(projDir);

      try {
        const out = execFileSync('node', [CLI, 'install', '--project'], {
          cwd: projDir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe']
        });
        updated.push({ dir: projDir, out: out.trim() });
      } catch (err) {
        skipped.push({ dir: projDir, err: err.message });
      }
    }
  } catch {}
}

console.log(`\n================ 刷新完成报告 ================`);
console.log(`✅ 成功更新 (${updated.length} 个项目):`);
for (const u of updated) {
  console.log(`  - ${u.dir}`);
}
if (skipped.length) {
  console.log(`⚠️ 跳过/失败 (${skipped.length} 个项目):`);
  for (const s of skipped) {
    console.log(`  - ${s.dir}: ${s.err}`);
  }
}
console.log(`==============================================\n`);
