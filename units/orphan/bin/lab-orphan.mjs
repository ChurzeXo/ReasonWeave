#!/usr/bin/env node

/**
 * lab-orphan CLI — 全局死代码与孤儿资产清道夫 (units/orphan)
 */

import fs from 'node:fs';
import path from 'node:path';
import { Solver } from '../core/solver.mjs';
import { SolverProtocol } from '../core/protocol-s1-s3.mjs';
import { DiffChecker } from '../core/diff-checker.mjs';
import { Cleaner } from '../core/cleaner.mjs';
import { AndroidAdapter } from '../adapters/android/index.mjs';
import { PythonAdapter } from '../adapters/python/index.mjs';
import { WebAdapter } from '../adapters/web/index.mjs';
import { OrphanDepsSolver } from '../core/orphan-deps.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'help';

function showHelp() {
  console.log(`
lab-orphan CLI — 全局死代码与孤儿资产清道夫 (units/orphan v1.0.0)

用法:
  lab orphan test-solver                运行 S1-S3 求解器自检协议 (注入假死检出/在用保护/逐字节一致)
  lab orphan scan [选项]                全量扫描当前 HEAD，探测死代码与孤儿资产
  lab orphan check-diff [选项]          增量提交门禁校验 (检测本次改动是否引入新孤儿)
  lab orphan check-deps [--strict]      扫描依赖清单 (requirements.txt / package.json) 探测未导入孤儿包
  lab orphan scan-secrets [--strict]    扫描零调用假凭证与硬编码高熵 Token (支持 --strict 阻断退出)
  lab orphan clean [选项]               受控安全清理 (支持 dry-run 演练)
  lab orphan help                       显示本帮助信息

check-deps / scan-secrets 选项:
  --strict                       门禁阻断模式：检出孤儿依赖或可疑凭证时以 exit 1 非零状态码退出

scan 选项:
  --out <file>                   指定候选结果写入路径 (默认: stdout 打印概要)
  --json                         以标准 JSON 格式输出 candidates.json 结构
  --stack <android|python|web|auto>  显式指定技术栈适配器 (默认: auto 自动探测)
  --include-alive                在输出中同时包含仍在使用的活跃符号

check-diff 选项:
  --staged               仅检查暂存区改动
  --base <commit/branch> 指定比对基准 (默认: HEAD~1 或 origin/main)

clean 选项:
  --candidates <file>    指定 candidates.json 候选清单文件
  --dry-run              仅模拟演练，不实际删除物理文件 (默认开启)
`);
}

async function runTestSolver() {
  const result = await SolverProtocol.runSelfTest({
    repoDir: process.cwd(),
    verbose: true,
  });
  if (!result.passed) {
    process.exit(1);
  }
}

async function runScan() {
  const isJson = args.includes('--json');
  const includeAlive = args.includes('--include-alive');
  const outIdx = args.indexOf('--out');
  const outFile = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : null;
  const stackIdx = args.indexOf('--stack');
  const stack = stackIdx !== -1 && args[stackIdx + 1] ? args[stackIdx + 1] : 'auto';

  const solver = new Solver({
    repoDir: process.cwd(),
    ref: 'HEAD',
    adapters: [new AndroidAdapter(), new PythonAdapter(), new WebAdapter()],
  });

  const result = solver.solve({ includeAlive, stack });

  if (outFile) {
    const absPath = path.resolve(process.cwd(), outFile);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`\n📄 扫描产物已保存至: ${outFile}`);
  }

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n🔍 Orphan Scan 扫描结果摘要:`);
  console.log(`  - 扫描 Git Commit: ${result.commit_sha}`);
  console.log(`  - 索引有效文件:   ${result.summary.total_scanned_files} 个`);
  console.log(`  - 检出孤儿候选:   ${result.summary.total_candidates} 个`);
  console.log(`  - 确认可删孤儿:   ${result.summary.confirmed_orphans} 个`);
  console.log(`  - 待证疑似项目:   ${result.summary.pending_verification} 个`);

  if (result.candidates.length > 0) {
    console.log(`\n📋 候选清单示例 (前 5 条):`);
    for (const c of result.candidates.slice(0, 5)) {
      console.log(`  [${c.status}] \x1b[33m${c.name}\x1b[0m (${c.path}) - confidence: ${c.confidence}`);
      for (const r of c.reasons) console.log(`      ↳ ${r}`);
    }
  } else {
    console.log(`\n✨ 未在当前仓库中检测到任何未引用孤儿资产！`);
  }
  console.log();
}

async function runCheckDiff() {
  const isStaged = args.includes('--staged');
  const isJson = args.includes('--json');
  const baseIdx = args.indexOf('--base');
  const base = baseIdx !== -1 && args[baseIdx + 1] ? args[baseIdx + 1] : 'HEAD~1';

  const checker = new DiffChecker({
    repoDir: process.cwd(),
    adapters: [new AndroidAdapter(), new PythonAdapter(), new WebAdapter()],
  });

  const result = await checker.checkDiff({ staged: isStaged, base });

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.passed ? 0 : 1);
  }

  console.log(`\n🛡️  Orphan Check-Diff 增量防腐门禁检查:`);
  console.log(`  - 检查模式:       ${isStaged ? 'Staged 暂存区' : `Base 对比 (${base})`}`);
  console.log(`  - 发现新增符号:   ${result.totalAddedCandidates} 个`);
  console.log(`  - 拦截新增孤儿:   ${result.orphans.length} 个`);

  if (result.orphans.length > 0) {
    console.error(`\n❌ [提交阻断] 本次改动引入了零引用的孤儿代码或资产：`);
    for (const o of result.orphans) {
      console.error(`  - \x1b[31m${o.name}\x1b[0m (${o.path}:${o.line_no}) [${o.kind}]`);
      for (const r of o.reasons) console.error(`      ↳ ${r}`);
    }
    console.error(`\n💡 提示: 请在提交前删除该死代码，或在引用方接入调用，或显式标注保护规则。\n`);
    process.exit(1);
  }

  console.log(`  ✅ 增量检查通过：本次提交未引入任何未引用的孤儿资产。\n`);
  process.exit(0);
}

async function runClean() {
  const isDryRun = args.includes('--dry-run') || !args.includes('--force');
  const candIdx = args.indexOf('--candidates');
  const candFile = candIdx !== -1 && args[candIdx + 1] ? args[candIdx + 1] : null;

  console.log(`\n🧹 Orphan Clean 安全修剪清理器 ${isDryRun ? '(模拟演练 Dry-Run)' : ''}:`);

  let candidates = [];
  if (candFile && fs.existsSync(candFile)) {
    const raw = JSON.parse(fs.readFileSync(candFile, 'utf8'));
    candidates = raw.candidates || [];
  } else {
    // 自动扫描当前 HEAD 生成候选
    console.log(`  未指定 --candidates 文件，自动执行全量扫描寻找 CONFIRMED_ORPHAN...`);
    const solver = new Solver({
      repoDir: process.cwd(),
      ref: 'HEAD',
      adapters: [new AndroidAdapter(), new PythonAdapter(), new WebAdapter()],
    });
    const scanResult = solver.solve({ includeAlive: false });
    candidates = scanResult.candidates || [];
  }

  const cleaner = new Cleaner({
    repoDir: process.cwd(),
    dryRun: isDryRun,
  });

  const result = cleaner.clean(candidates);
  console.log(`  - 可清理孤儿项: ${result.totalCandidates} 项`);
  console.log(`  - 生成修剪补丁: ${result.cleanedCount} 处`);

  if (result.patches.length > 0) {
    console.log(`\n📋 补丁预览 (前 2 个 Patch):`);
    for (const p of result.patches.slice(0, 2)) {
      console.log(`\n--- Patch for ${p.path} [${p.type}] ---`);
      console.log(p.diff);
    }
    if (result.patches.length > 2) {
      console.log(`\n... 其余 ${result.patches.length - 2} 处补丁已省略。`);
    }
  }

  if (isDryRun) {
    console.log(`\n✨ [Dry-Run 演练完成] 磁盘文件保持零修改。若确认应用清理，请带上 --force 参数。\n`);
  } else {
    console.log(`\n✅ 清理已写入磁盘并落地。\n`);
  }
}

async function runCheckDeps() {
  const isStrict = args.includes('--strict') || args.includes('--fail-on-orphans');
  const solver = new OrphanDepsSolver({ repoDir: process.cwd() });
  const results = await solver.scan();
  if (results.length === 0) {
    console.log('✅ 未发现受支持的依赖清单文件 (requirements.txt / package.json)。');
    return;
  }

  let totalOrphans = 0;
  for (const r of results) {
    console.log(`\n📦 [依赖清单] ${r.manifest} (${r.type})`);
    console.log(`   - 声明总数: ${r.total_declared}，在用导入: ${r.active_imported}，孤儿依赖: ${r.orphans.length}`);
    if (r.orphans.length > 0) {
      totalOrphans += r.orphans.length;
      console.log(`   ⚠️  未导入的孤儿第三方包 (0 import 引用):`);
      for (const p of r.orphans) {
        console.log(`      - ${p}`);
      }
    } else {
      console.log(`   ✅ 无孤儿依赖，全部声明均被源码 import。`);
    }
  }

  if (totalOrphans > 0) {
    console.log(`\n💡 提示: 请先清理上述未导入的 ${totalOrphans} 个孤儿依赖，可物理消除虚假 CVE 报警风暴 (ADR-0011)。`);
    if (isStrict) {
      console.error(`\n❌ [Gate Block] --strict 门禁生效：存在 ${totalOrphans} 个未导入孤儿依赖，阻断退出。`);
      process.exit(1);
    }
  }
}

async function runScanSecrets() {
  const isStrict = args.includes('--strict') || args.includes('--fail-on-findings');
  const solver = new OrphanDepsSolver({ repoDir: process.cwd() });
  const findings = solver.scanSecrets();
  if (findings.length === 0) {
    console.log('✅ 未发现硬编码可疑凭证或高熵 Token。');
    return;
  }

  console.log(`\n🔍 发现 ${findings.length} 处可疑硬编码凭证:`);
  for (const f of findings) {
    console.log(`   - ${f.file}:${f.line} -> ${f.match.slice(0, 40)}...`);
  }
  if (isStrict) {
    console.error(`\n❌ [Gate Block] --strict 门禁生效：检出 ${findings.length} 处硬编码凭证/高熵 Token，阻断退出。`);
    process.exit(1);
  }
}

// ── 路由执行 ──────────────────────────────────────────────────────────
switch (command) {
  case 'test-solver':
  case 'test':
    await runTestSolver();
    break;
  case 'scan':
    await runScan();
    break;
  case 'check-diff':
    await runCheckDiff();
    break;
  case 'check-deps':
  case 'orphan-deps':
    await runCheckDeps();
    break;
  case 'scan-secrets':
  case 'secrets':
    await runScanSecrets();
    break;
  case 'clean':
    await runClean();
    break;
  case 'help':
  case '--help':
  case '-h':
  default:
    showHelp();
    break;
}
