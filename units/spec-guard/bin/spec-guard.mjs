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
import { runMutationTest } from '../core/mutation-runner.mjs';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES_DIR = path.join(PKG_ROOT, 'templates');

const args = process.argv.slice(2);
const command = args[0] || 'check';

function printHelp() {
  console.log(`
🛡️  spec-guard (drift-gate) - 架构规约与漂移守卫 CLI (v1.1.0)

用法:
  spec-guard check [options]           对账全仓规约断言覆盖率与架构漂移
  spec-guard audit-adr <ADR-ID>        输出指定 ADR 的机器审计证据报告
  spec-guard mutate [options]          执行变异反向测试敏感度校验，防御回音壁假测试
  spec-guard init                      在当前项目初始化 spec-guard 规约配置
  spec-guard help                      显示帮助信息

选项:
  --strict                             严格模式：存在漂移或孤儿断言时 Exit 1 (适合 CI)
  --check-callers                      检查架构函数在非测试生产代码中的接线调用者数 (Production Callers >= 1)
  --overlay <path>                     指定自定义 spec-matrix.overlay.yml 路径
  --file <path>                        变异测试目标被测文件路径
  --cmd "<command>"                    变异测试执行命令
  --mutator <type>                     变异策略 (auto | endpoint | boolean | operator | return)
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
  const isCheckCallers = args.includes('--check-callers');
  const isJson = args.includes('--json');

  let overlayPath = '';
  const overlayIdx = args.indexOf('--overlay');
  if (overlayIdx !== -1 && args[overlayIdx + 1]) {
    overlayPath = args[overlayIdx + 1];
  }

  const result = buildAndCheckMatrix(cwd, {
    overlay: overlayPath,
    checkCallers: isCheckCallers,
  });

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatConsoleReport(result));
  }

  if (isCheckCallers && result.unwiredInvariants && result.unwiredInvariants.length > 0) {
    console.error(`\x1b[31m❌ [spec-guard --check-callers] 门禁阻断：检测到 ${result.unwiredInvariants.length} 处架构函数未在生产接线 (Zero Production Callers)！\x1b[0m\n`);
    process.exit(1);
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

  // [C5] 退出码严格判定：未找到 ADR、存在架构漂移、或覆盖率为 0% 时 Exit 1
  const rep = result.adrReports.find((r) => r.adr.adrId.toUpperCase() === adrId.toUpperCase());
  if (!rep || rep.invariants.length === 0 || rep.invariants.some((i) => i.status === 'drift_detected')) {
    process.exit(1);
  }
  const verifiedCount = rep.invariants.filter((i) => i.status === 'verified').length;
  if (rep.invariants.length > 0 && verifiedCount === 0) {
    process.exit(1);
  }
}

function handleMutate() {
  const cwd = process.cwd();
  const fileIdx = args.indexOf('--file') !== -1 ? args.indexOf('--file') : args.indexOf('--target');
  const targetFile = fileIdx !== -1 && args[fileIdx + 1] ? args[fileIdx + 1] : '';

  const cmdIdx = args.indexOf('--cmd');
  const testCmd = cmdIdx !== -1 && args[cmdIdx + 1] ? args[cmdIdx + 1] : '';

  const mutatorIdx = args.indexOf('--mutator');
  const mutator = mutatorIdx !== -1 && args[mutatorIdx + 1] ? args[mutatorIdx + 1] : 'auto';

  const isJson = args.includes('--json');

  if (!targetFile || !testCmd) {
    console.error('用法: spec-guard mutate --file <target-file> --cmd "<test-command>" [--mutator <type>]');
    process.exit(1);
  }

  const result = runMutationTest({
    repoRoot: cwd,
    targetFile,
    testCmd,
    mutator,
  });

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.status === 'MUTATION_KILLED') {
      console.log(`\n\x1b[32m${result.message}\x1b[0m\n`);
    } else {
      console.error(`\n\x1b[31m${result.message}\x1b[0m\n`);
    }
  }

  process.exit(result.exitCode);
}

switch (command) {
  case 'init':
    handleInit();
    break;
  case 'check':
    handleCheck();
    break;
  case 'mutate':
    handleMutate();
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
