#!/usr/bin/env node

/**
 * spec-guard CLI
 *
 * 全局架构漂移与规约守卫命令行工具
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAndCheckMatrix, formatConsoleReport, generateAdrAuditReport } from '../core/matrix-checker.mjs';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES_DIR = path.join(PKG_ROOT, 'templates');

const args = process.argv.slice(2);
const command = args[0] || 'check';

function printHelp() {
  console.log(`
🛡️  spec-guard (drift-gate) - 架构规约与漂移守卫 CLI (v1.0.0)

用法:
  spec-guard check [options]           对账全仓规约断言覆盖率与架构漂移
  spec-guard audit-adr <ADR-ID>        输出指定 ADR 的机器审计证据报告
  spec-guard init                      在当前项目初始化 spec-guard 规约配置
  spec-guard help                      显示帮助信息

选项:
  --strict                             严格模式：存在漂移或孤儿断言时 Exit 1 (适合 CI)
  --overlay <path>                     指定自定义 spec-matrix.overlay.yml 路径
  --json                               以 JSON 格式输出对账矩阵原始数据
  --out <file>                         将审计报告输出到指定文件
`);
}

function handleInit() {
  const cwd = process.cwd();
  console.log(`\n🚀 正在当前目录初始化 spec-guard 规约配置: ${cwd}`);

  const overlayTarget = path.join(cwd, 'spec-matrix.overlay.yml');
  const overlaySource = path.join(TEMPLATES_DIR, 'spec-matrix.overlay.yml');

  if (!fs.existsSync(overlayTarget) && fs.existsSync(overlaySource)) {
    fs.copyFileSync(overlaySource, overlayTarget);
    console.log(`  ✅ 已创建可选跨端契约覆写层: spec-matrix.overlay.yml`);
  } else {
    console.log(`  ℹ️  spec-matrix.overlay.yml 已存在或跳过`);
  }

  // 检查是否配置了 pre-commit
  const hooksDir = path.join(cwd, '.githooks', 'pre-commit.d');
  if (fs.existsSync(hooksDir)) {
    const hookTarget = path.join(hooksDir, '15-spec-guard');
    const hookSource = path.join(TEMPLATES_DIR, 'pre-commit.d', '15-spec-guard');
    if (!fs.existsSync(hookTarget) && fs.existsSync(hookSource)) {
      fs.copyFileSync(hookSource, hookTarget);
      fs.chmodSync(hookTarget, 0o755);
      console.log(`  ✅ 已将轻量门禁接入 .githooks/pre-commit.d/15-spec-guard`);
    }
  }

  console.log(`
🎉 spec-guard 初始化完成！
- 默认推行 Code-as-Spec-Matrix，请在单测中直接使用 @Invariant("ADR-XXX:H-Y") 标注；
- 运行 "spec-guard check" 即可随时对账架构覆盖率。\n`);
}

function handleCheck() {
  const cwd = process.cwd();
  const isStrict = args.includes('--strict');
  const isJson = args.includes('--json');

  let overlayPath = '';
  const overlayIdx = args.indexOf('--overlay');
  if (overlayIdx !== -1 && args[overlayIdx + 1]) {
    overlayPath = args[overlayIdx + 1];
  }

  const result = buildAndCheckMatrix(cwd, { overlay: overlayPath });

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatConsoleReport(result));
  }

  if (isStrict && !result.isHealthy) {
    console.error(`\x1b[31m❌ [spec-guard --strict] 严格模式检查失败：检测到未修复的架构漂移或孤儿断言！\x1b[0m\n`);
    process.exit(1);
  }
}

function handleAuditAdr(adrId) {
  if (!adrId) {
    console.error('错误: 请提供 ADR 编号，例如 "spec-guard audit-adr ADR-060"');
    process.exit(1);
  }

  const cwd = process.cwd();
  const result = buildAndCheckMatrix(cwd);
  const report = generateAdrAuditReport(result, adrId);

  const outIdx = args.indexOf('--out');
  if (outIdx !== -1 && args[outIdx + 1]) {
    const outFile = path.resolve(cwd, args[outIdx + 1]);
    fs.writeFileSync(outFile, report, 'utf8');
    console.log(`✅ 审计报告已写入: ${outFile}`);
  } else {
    console.log('\n' + report);
  }
}

switch (command) {
  case 'init':
    handleInit();
    break;
  case 'check':
    handleCheck();
    break;
  case 'audit-adr':
    handleAuditAdr(args[1]);
    break;
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  default:
    if (command.startsWith('ADR-')) {
      handleAuditAdr(command);
    } else {
      console.error(`未知命令: ${command}`);
      printHelp();
      process.exit(1);
    }
    break;
}
