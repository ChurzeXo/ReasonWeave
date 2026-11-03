#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNITS_DIR = path.join(PKG_ROOT, 'units');

const args = process.argv.slice(2);
const command = args[0] || 'help';

function showHelp() {
  console.log(`
Lab Agent Engineering Toolkit (AEF v1.0)

用法:
  lab list                列出所有可用工程能力 Unit
  lab path [unit]         获取某个 Unit (或 lab 根目录) 的安装绝对路径
  lab doctor              自检本地环境（node, git, opengrep 等前置依赖）
  lab help                显示帮助信息

直接子命令 CLI:
  handoff                 调用工作流跨仓/仓内交接中枢
  adr-init                初始化项目架构决策记录 (ADR)
`);
}

function listUnits() {
  console.log('\n📦 可用工程单元 (Units):');
  const units = [
    { name: 'handoffs', desc: '跨仓/仓内工作流交接中枢与 CLI 引擎' },
    { name: 'preflight', desc: '仓库不变量探针与提交门禁' },
    { name: 'review-gate', desc: 'SAST 静态扫描 (OpenGrep) 与代码评审防线' },
    { name: 'adr', desc: '架构决策记录机制 (light/standard/frozen)' },
    { name: 'backlog', desc: '待办捕获制度 (一任务一文件)' },
    { name: 'playbook', desc: 'Agent Engineering Framework (AEF) 完整方法论' },
  ];
  for (const u of units) {
    console.log(`  - \x1b[36m${u.name.padEnd(14)}\x1b[0m ${u.desc}`);
  }
  console.log(`\n使用 "lab path <unit>" 查看对应物理路径。\n`);
}

function getPath(unitName) {
  if (!unitName) {
    console.log(PKG_ROOT);
    return;
  }
  const target = path.join(UNITS_DIR, unitName);
  if (fs.existsSync(target)) {
    console.log(target);
  } else {
    console.error(`错误: 未找到 Unit "${unitName}"。`);
    process.exit(1);
  }
}

function doctor() {
  console.log('\n🔍 正在检查环境依赖:\n');
  const checks = [
    { name: 'Node.js (>=18)', cmd: 'node -v', required: true },
    { name: 'Git', cmd: 'git --version', required: true },
    { name: 'OpenGrep (review-gate L1)', cmd: 'opengrep --version', required: false },
  ];

  for (const c of checks) {
    try {
      const out = execSync(c.cmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      console.log(`  ✅ \x1b[32m${c.name.padEnd(28)}\x1b[0m: ${out}`);
    } catch {
      if (c.required) {
        console.log(`  ❌ \x1b[31m${c.name.padEnd(28)}\x1b[0m: 未安装或不在 PATH 中 (必需)`);
      } else {
        console.log(`  ⚠️  \x1b[33m${c.name.padEnd(28)}\x1b[0m: 未安装 (可选，仅 review-gate 扫描需要)`);
      }
    }
  }
  console.log();
}

switch (command) {
  case 'list':
  case 'ls':
    listUnits();
    break;
  case 'path':
    getPath(args[1]);
    break;
  case 'doctor':
  case 'check':
    doctor();
    break;
  case 'help':
  case '--help':
  case '-h':
  default:
    showHelp();
    break;
}
