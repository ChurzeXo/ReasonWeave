/**
 * matrix-checker.mjs
 *
 * 核心对账矩阵计算引擎（Code-as-Spec-Matrix）：
 * 1. 内存动态汇聚 ADR 规约、源码断言、沙箱标记与可选 Overlay 配置
 * 2. 严格词界对账：ADR Invariant ↔ Code Assertion ↔ Production Wiring
 * 3. 漂移（Drift）与孤儿断言（Orphan Assertions）精确识别
 * 4. 产出结构化审计数据与 Markdown/终端报告
 */

import fs from 'node:fs';
import path from 'node:path';
import { findAdrFiles, parseAdrFile, containsStrictInvariant } from './adr-parser.mjs';
import { scanRepository, analyzeSymbolWiring } from './scanner.mjs';
import { verifyAllAdrsTelemetry } from './telemetry_authenticator.mjs';
import { traceAllAdrsWiring } from './wiring_tracer.mjs';

/**
 * 读取可选的 spec-matrix.overlay.yml 文件
 */
export function loadOverlayConfig(repoRoot, customPath = '') {
  const candidatePaths = [
    customPath ? path.resolve(repoRoot, customPath) : '',
    path.join(repoRoot, 'spec-matrix.overlay.yml'),
    path.join(repoRoot, 'spec-matrix.yml'),
    path.join(repoRoot, '.spec-matrix.yml'),
  ].filter(Boolean);

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        // 轻量提取 YAML 中的 invariants 节（避免必须依赖第三方 js-yaml）
        return parseSimpleYamlOverlay(content);
      } catch (err) {
        // ignore overlay parse failure
      }
    }
  }
  return { invariants: [] };
}

/**
 * 极简 YAML 提取器（提取 id, name, status, cross_repo_contracts 与 production.symbols 字段）
 */
function parseSimpleYamlOverlay(yamlContent) {
  const invariants = [];
  const lines = yamlContent.split('\n');
  let currentInv = null;
  let inSymbols = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- id:')) {
      if (currentInv) invariants.push(currentInv);
      const idMatch = trimmed.match(/- id:\s*["']?([^"']+)["']?/);
      currentInv = { id: idMatch ? idMatch[1] : '', isOverlay: true, productionSymbols: [] };
      inSymbols = false;
    } else if (currentInv) {
      if (trimmed.startsWith('name:')) {
        const m = trimmed.match(/name:\s*["']?([^"']+)["']?/);
        if (m) currentInv.name = m[1];
        inSymbols = false;
      } else if (trimmed.startsWith('status:')) {
        const m = trimmed.match(/status:\s*["']?([^"']+)["']?/);
        if (m) currentInv.status = m[1];
        inSymbols = false;
      } else if (trimmed.startsWith('symbols:')) {
        inSymbols = true;
      } else if (inSymbols && trimmed.startsWith('-')) {
        const symMatch = trimmed.match(/-\s*["']?([^"'\s]+)["']?/);
        if (symMatch) {
          let rawSym = symMatch[1];
          if (rawSym.includes('#')) {
            rawSym = rawSym.split('#')[1];
          }
          currentInv.productionSymbols.push(rawSym);
        }
      } else if (!trimmed.startsWith('-')) {
        inSymbols = false;
      }
    }
  }
  if (currentInv) invariants.push(currentInv);
  return { invariants };
}

/**
 * 核心对账计算：动态生成 Code-as-Spec-Matrix 并比对
 */
export function buildAndCheckMatrix(repoRoot, options = {}) {
  // 1. 扫描所有 ADR
  const adrFilePaths = findAdrFiles(repoRoot);
  const parsedAdrs = adrFilePaths.map((p) => parseAdrFile(p));

  // 2. 扫描源码中所有的 @Invariant 与 @ContractOnly 声明
  const scanResult = scanRepository(repoRoot);
  const codeInvariants = scanResult.invariants;
  const codeContracts = scanResult.contracts;

  // 3. 读取 Overlay 覆盖层配置
  const overlay = loadOverlayConfig(repoRoot, options.overlay);

  // 建立全局对账账本
  const adrReports = [];
  const allKnownInvariantIds = new Set();

  let totalInvariantsCount = 0;
  let verifiedCount = 0;
  let sandboxedCount = 0;
  let inProgressCount = 0;
  let driftCount = 0;
  const unwiredInvariants = [];

  for (const adr of parsedAdrs) {
    const adrId = adr.adrId;
    const invResults = [];

    // 收集 ADR 中声明的不变量
    for (const inv of adr.invariants) {
      totalInvariantsCount++;
      allKnownInvariantIds.add(inv.canonicalId);
      allKnownInvariantIds.add(inv.localId);

      // 在源码中严格匹配绑定的断言（严格边界，且防跨 ADR 串标）
      const matchingAssertions = codeInvariants.filter((item) => {
        // 若断言 ID 包含 ADR 前缀（如 "ADR-060:H-1"）
        if (item.id.includes(':')) {
          const [prefix, local] = item.id.split(':');
          if (prefix.toUpperCase() !== adrId.toUpperCase()) {
            return false;
          }
          return local === inv.localId || containsStrictInvariant(local, inv.localId);
        }
        // 若断言 ID 仅有局部名（如 "H-1"），仅当文件名包含该 ADR 编号时方认可
        return (item.id === inv.localId || containsStrictInvariant(item.id, inv.localId)) &&
               item.file.toLowerCase().includes(adrId.toLowerCase());
      });

      // 检查是否有对应的 ContractOnly 沙箱保护
      const matchingContracts = codeContracts.filter((c) => {
        return c.adr === adrId || containsStrictInvariant(c.adr, adrId);
      });

      // 检查 Overlay 是否有额外契约状态补充
      const overlayItem = overlay.invariants.find((o) => o.id === inv.canonicalId || o.id === inv.localId);

      // 检查关联的生产符号（来自 Overlay、生产代码中的 @Invariant 声明、或测试显式 targetSymbol）
      const associatedSymbols = new Set();
      if (overlayItem && overlayItem.productionSymbols) {
        for (const s of overlayItem.productionSymbols) associatedSymbols.add(s);
      }
      for (const a of matchingAssertions) {
        if (!a.isTest && a.symbolName) {
          associatedSymbols.add(a.symbolName);
        }
        if (a.targetSymbol) {
          associatedSymbols.add(a.targetSymbol);
        }
      }

      // 如果仅有单测标注且没有显式符号，扫描测试声明或非 test 开头符号
      if (associatedSymbols.size === 0 && matchingAssertions.some((a) => a.isTest)) {
        for (const a of matchingAssertions.filter((a) => a.isTest)) {
          if (a.symbolName && !a.symbolName.startsWith('test')) {
            associatedSymbols.add(a.symbolName);
          }
        }
      }

      let symbolWiringInfo = null;
      let hasZeroCallers = false;

      if (associatedSymbols.size > 0) {
        for (const sym of associatedSymbols) {
          const wiring = analyzeSymbolWiring(sym, repoRoot);
          symbolWiringInfo = {
            symbolName: sym,
            productionCallerCount: wiring.prodCallers.length,
            testCallerCount: wiring.testCallers.length,
            wiringStatus: wiring.wiringStatus,
            productionCallers: wiring.prodCallers,
            testCallers: wiring.testCallers,
          };

          if (wiring.prodCallers.length === 0) {
            hasZeroCallers = true;
            unwiredInvariants.push({
              invariantId: inv.canonicalId,
              localId: inv.localId,
              adrId,
              symbolName: sym,
              testCallers: wiring.testCallers,
            });
          }
        }
      }

      // 状态裁定
      let finalStatus = 'in_progress';
      let statusReason = '';

      if (options.checkCallers && hasZeroCallers) {
        finalStatus = 'unwired';
        statusReason = `🚨 架构函数未在生产关键链路接线 (Zero Production Callers: ${symbolWiringInfo?.symbolName || 'unknown'})`;
      } else if (matchingAssertions.length > 0) {
        // 拥有机器断言
        const testAssertions = matchingAssertions.filter((a) => a.isTest);
        if (matchingContracts.length > 0) {
          finalStatus = 'sandboxed';
          statusReason = `沙箱保护（@ContractOnly，等待接线闭环）`;
          sandboxedCount++;
        } else if (adr.isFrozen && testAssertions.length > 0) {
          finalStatus = 'verified';
          statusReason = `机判断言就绪 (${testAssertions.length} 处断言)`;
          verifiedCount++;
        } else {
          finalStatus = 'in_progress';
          statusReason = `断言已就绪，等待 ADR 验收与生产接线`;
          inProgressCount++;
        }
      } else {
        // 零断言
        if (adr.isFrozen) {
          finalStatus = 'drift_detected';
          statusReason = `🚨 规约已 🔒Frozen 但代码中零断言覆盖！`;
          driftCount++;
        } else {
          finalStatus = 'in_progress';
          statusReason = `暂无对应 @Invariant 机器断言`;
          inProgressCount++;
        }
      }

      if (overlayItem && overlayItem.status) {
        statusReason += ` (Overlay 标注: ${overlayItem.status})`;
      }
      if (symbolWiringInfo && !hasZeroCallers) {
        statusReason += ` [生产接线: ${symbolWiringInfo.productionCallerCount} 处]`;
      }

      invResults.push({
        invariantId: inv.canonicalId,
        localId: inv.localId,
        description: inv.description,
        status: finalStatus,
        statusReason,
        assertionsCount: matchingAssertions.length,
        assertions: matchingAssertions,
        contracts: matchingContracts,
        symbolWiring: symbolWiringInfo,
      });
    }

    adrReports.push({
      adr,
      invariants: invResults,
      hasInvariants: adr.invariants.length > 0,
      implementationStatusMissing: adr.isFrozen && !adr.hasImplementationStatus,
    });
  }

  // 4. 识别孤儿断言（代码写了 @Invariant 但 ADR 根本未定义）
  const orphanAssertions = [];
  for (const item of codeInvariants) {
    let recognized = false;
    for (const known of allKnownInvariantIds) {
      if (item.id === known || containsStrictInvariant(item.id, known)) {
        recognized = true;
        break;
      }
    }
    if (!recognized) {
      orphanAssertions.push(item);
    }
  }

  const coveragePercent = totalInvariantsCount > 0 ? Math.round(((verifiedCount + sandboxedCount) / totalInvariantsCount) * 100) : 100;

  return {
    repoRoot,
    scannedFilesCount: scanResult.scannedFilesCount,
    adrsCount: parsedAdrs.length,
    adrReports,
    totalInvariantsCount,
    verifiedCount,
    sandboxedCount,
    inProgressCount,
    driftCount,
    coveragePercent,
    orphanAssertions,
    unwiredInvariants,
    isHealthy: driftCount === 0 && orphanAssertions.length === 0 && (!options.checkCallers || unwiredInvariants.length === 0),
  };
}

/**
 * 格式化终端输出报告
 */
export function formatConsoleReport(matrixResult) {
  const lines = [];
  lines.push('\n🛡️  \x1b[1mSpec-Guard (Drift-Gate) 规约对账矩阵报告\x1b[0m');
  lines.push('═'.repeat(65));
  lines.push(`📁 扫描代码文件: ${matrixResult.scannedFilesCount} 个 | ADR 规约: ${matrixResult.adrsCount} 份`);
  lines.push(`📊 总不变量: ${matrixResult.totalInvariantsCount} | 已验证: \x1b[32m${matrixResult.verifiedCount}\x1b[0m | 沙箱隔离: \x1b[36m${matrixResult.sandboxedCount}\x1b[0m | 进行中: \x1b[33m${matrixResult.inProgressCount}\x1b[0m | 漂移: \x1b[31m${matrixResult.driftCount}\x1b[0m`);
  lines.push(`📈 规约断言有效覆盖率: \x1b[1m${matrixResult.coveragePercent}%\x1b[0m\n`);

  for (const rep of matrixResult.adrReports) {
    if (!rep.hasInvariants) continue;
    const adr = rep.adr;
    const frozenTag = adr.isFrozen ? '\x1b[35m[🔒Frozen]\x1b[0m' : `[${adr.status}]`;
    lines.push(`\x1b[1m${adr.adrId}\x1b[0m ${frozenTag} - ${adr.title}`);

    if (rep.implementationStatusMissing) {
      lines.push(`  \x1b[31m⚠️ 警告: 该 ADR 已标记 🔒Frozen 但缺少标准的 ## Implementation Status 段落！\x1b[0m`);
    }

    for (const inv of rep.invariants) {
      let icon = '⏳';
      let color = '\x1b[33m';
      if (inv.status === 'verified') {
        icon = '✅';
        color = '\x1b[32m';
      } else if (inv.status === 'sandboxed') {
        icon = '📦';
        color = '\x1b[36m';
      } else if (inv.status === 'drift_detected' || inv.status === 'unwired') {
        icon = '🚨';
        color = '\x1b[31m';
      }

      lines.push(`  ${icon} ${color}${inv.invariantId.padEnd(16)}\x1b[0m : ${inv.statusReason}`);
      for (const a of inv.assertions) {
        lines.push(`     └─ [Assertion] ${a.file}:${a.line}`);
      }
    }
    lines.push('');
  }

  if (matrixResult.orphanAssertions.length > 0) {
    lines.push(`\x1b[33m⚠️  发现 ${matrixResult.orphanAssertions.length} 处孤儿断言（代码标记了 @Invariant 但 ADR 规约中未定义）:\x1b[0m`);
    for (const o of matrixResult.orphanAssertions) {
      lines.push(`  - \x1b[33m${o.id}\x1b[0m at ${o.file}:${o.line}`);
    }
    lines.push('');
  }

  if (matrixResult.unwiredInvariants && matrixResult.unwiredInvariants.length > 0) {
    lines.push(`\x1b[31m🚨 架构函数未在生产关键链路接线 (Zero Production Callers):\x1b[0m`);
    for (const u of matrixResult.unwiredInvariants) {
      lines.push(`  - \x1b[31m${u.invariantId}\x1b[0m -> 符号 \x1b[1m${u.symbolName}\x1b[0m 生产调用数为 0 (单测调用数: ${u.testCallers.length})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 为单个 ADR 生成详细的 Markdown 机器审计对账报告
 */
export function generateAdrAuditReport(matrixResult, targetAdrId) {
  const normTarget = targetAdrId.toUpperCase();
  const rep = matrixResult.adrReports.find((r) => r.adr.adrId.toUpperCase() === normTarget);

  if (!rep) {
    return `# 审计报告：${targetAdrId} (未找到)\n\n在代码库中未扫描到 ${targetAdrId} 的 ADR 文件。\n`;
  }

  const adr = rep.adr;
  const lines = [];
  lines.push(`# 机器审计报告：${adr.adrId} 架构规约对账凭据`);
  lines.push(`\n- **规约标题**：${adr.title}`);
  lines.push(`- **当前状态**：${adr.status}`);
  lines.push(`- **审计时间**：${new Date().toISOString()}`);
  lines.push(`- **文件路径**：\`${adr.filePath}\``);
  lines.push(`- **Implementation Status 状态节**：${adr.hasImplementationStatus ? '✅ 规范完备' : '❌ 缺失'}`);
  lines.push('\n---\n');

  lines.push('## 1. 不变量与机器断言对账矩阵 (Triad Reconciliation)\n');
  lines.push('| 不变量 ID | 描述 | 状态 | 断言数 | 详情 / 证据位置 |');
  lines.push('|---|---|---|---|---|');

  for (const inv of rep.invariants) {
    const statusLabel =
      inv.status === 'verified'
        ? '✅ 已验证'
        : inv.status === 'sandboxed'
        ? '📦 沙箱隔离'
        : inv.status === 'drift_detected'
        ? '🚨 漂移脱节'
        : '⏳ 进行中';

    const evidence = inv.assertions.length > 0
      ? inv.assertions.map((a) => `\`${a.file}:${a.line}\``).join('<br>')
      : '无断言';

    lines.push(`| **${inv.invariantId}** | ${inv.description} | ${statusLabel} | ${inv.assertionsCount} | ${evidence} |`);
  }

  lines.push('\n## 2. 规约落地建议 (Verdict)\n');
  const allVerified = rep.invariants.length > 0 && rep.invariants.every((i) => i.status === 'verified');
  const hasDrift = rep.invariants.some((i) => i.status === 'drift_detected');

  // [C5 语义校验] 检查 Implementation Status 表格项是否存在未落地/部分实现项
  const hasUnfinishedImpl = adr.implementationItems && adr.implementationItems.some(
    (item) => item.status === 'unwired' || item.status === 'in_progress'
  );

  if (hasDrift) {
    lines.push('> ❌ **阻断判定**：检测到严重架构漂移！该规约声称生效或已 Frozen，但存在零断言覆盖的不变量。**严禁以“已实现”上报，严禁进行 Frozen 冻结签署**。\n');
  } else if (allVerified && adr.hasImplementationStatus && !hasUnfinishedImpl) {
    lines.push('> ✅ **合规建议**：所有声明的不变量均已绑定有效可机判断言，且落地状态节完备。具备由架构师及用户人工签署 `🔒Frozen` 的机器凭据。\n');
  } else {
    lines.push('> ⏳ **进行中判定**：规约部分能力处于逐步交付中（存在 ❌ 未接线 或 ⚠️ 部分实现 项）。请在 `## Implementation Status` 中如实跟踪，待全量落地后方可签署 Frozen 验收。\n');
  }

  return lines.join('\n');
}

/**
 * 构建断言、证据、接线三元全景对账矩阵 (Triad Matrix)
 */
export function buildFullTriadMatrix(repoRoot, options = {}) {
  const assertionMatrix = buildAndCheckMatrix(repoRoot, options);
  const telemetryMatrix = verifyAllAdrsTelemetry(repoRoot, options);
  const wiringMatrix = traceAllAdrsWiring(repoRoot, options);

  const triadRows = [];
  const adrMap = new Map();

  for (const rep of assertionMatrix.adrReports) {
    const id = rep.adr.adrId.toUpperCase();
    adrMap.set(id, {
      adrId: rep.adr.adrId,
      title: rep.adr.title,
      isFrozen: rep.adr.isFrozen,
      status: rep.adr.status,
      assertion: rep,
      telemetry: null,
      wiring: null,
    });
  }

  for (const t of telemetryMatrix.reports) {
    const id = t.adrId.toUpperCase();
    if (!adrMap.has(id)) {
      adrMap.set(id, {
        adrId: t.adrId,
        title: '',
        isFrozen: false,
        status: 'Unknown',
        assertion: null,
        telemetry: t,
        wiring: null,
      });
    } else {
      adrMap.get(id).telemetry = t;
    }
  }

  for (const w of wiringMatrix.reports) {
    const id = w.adrId.toUpperCase();
    if (!adrMap.has(id)) {
      adrMap.set(id, {
        adrId: w.adrId,
        title: '',
        isFrozen: w.isFrozen,
        status: w.isFrozen ? '🔒 Frozen' : 'Draft',
        assertion: null,
        telemetry: null,
        wiring: w,
      });
    } else {
      adrMap.get(id).wiring = w;
      if (w.isFrozen) adrMap.get(id).isFrozen = true;
    }
  }

  let totalAdrs = adrMap.size;
  let healthyAdrs = 0;
  let telemetryDriftCount = 0;
  let orphanDecisionCount = 0;
  let assertionDriftCount = assertionMatrix.driftCount;

  for (const [id, item] of adrMap.entries()) {
    let verdict = 'VERIFIED';
    let verdictIcon = '✅';
    let hasFailure = false;

    // 1. 断言状态
    let assertionSummary = '无不变量';
    if (item.assertion && item.assertion.invariants.length > 0) {
      const totalInv = item.assertion.invariants.length;
      const verifiedInv = item.assertion.invariants.filter((i) => i.status === 'verified').length;
      const hasDrift = item.assertion.invariants.some((i) => i.status === 'drift_detected');
      if (hasDrift) {
        assertionSummary = `🚨 漂移 (${verifiedInv}/${totalInv})`;
        verdict = 'DRIFT_DETECTED';
        verdictIcon = '🚨';
        hasFailure = true;
      } else if (verifiedInv === totalInv) {
        assertionSummary = `✅ 100% (${verifiedInv}/${totalInv})`;
      } else {
        assertionSummary = `⏳ ${Math.round((verifiedInv / totalInv) * 100)}% (${verifiedInv}/${totalInv})`;
        if (verdict === 'VERIFIED') verdict = 'IN_PROGRESS';
      }
    }

    // 2. 数据自述凭据状态
    let telemetrySummary = 'ℹ️ 豁免 (无量化)';
    if (item.telemetry && item.telemetry.hasMetrics) {
      if (item.telemetry.status === 'PASS') {
        telemetrySummary = `✅ 验签通过 (${item.telemetry.metricsCount}项)`;
      } else {
        telemetrySummary = `🚨 自述漂移 (违反 ADR-064)`;
        telemetryDriftCount++;
        verdict = 'TELEMETRY_DRIFT';
        verdictIcon = '🚨';
        hasFailure = true;
      }
    }

    // 3. 物理代码接线状态
    let wiringSummary = 'ℹ️ 无需接线';
    if (item.wiring && item.wiring.candidateSymbolsCount > 0) {
      if (item.wiring.status === 'FAIL' || item.wiring.isOrphan) {
        wiringSummary = `🚨 孤儿决策 (0/${item.wiring.candidateSymbolsCount})`;
        orphanDecisionCount++;
        verdict = 'ORPHAN_DECISION';
        verdictIcon = '🚨';
        hasFailure = true;
      } else if (item.wiring.status === 'PASS') {
        wiringSummary = `✅ 存活 (${item.wiring.wiredCount}/${item.wiring.candidateSymbolsCount})`;
      } else {
        wiringSummary = `⏳ 未接线 (0/${item.wiring.candidateSymbolsCount})`;
        if (verdict === 'VERIFIED') verdict = 'IN_PROGRESS';
      }
    }

    if (!hasFailure && verdict === 'VERIFIED') {
      healthyAdrs++;
    }

    triadRows.push({
      adrId: item.adrId,
      title: item.title,
      isFrozen: item.isFrozen,
      status: item.status,
      assertionSummary,
      telemetrySummary,
      wiringSummary,
      verdict,
      verdictIcon,
      hasFailure,
      item,
    });
  }

  // 排序
  triadRows.sort((a, b) => {
    const numA = parseInt((a.adrId.match(/\d+/) || [0])[0], 10);
    const numB = parseInt((b.adrId.match(/\d+/) || [0])[0], 10);
    return numA - numB;
  });

  const isHealthy = assertionDriftCount === 0 && telemetryDriftCount === 0 && orphanDecisionCount === 0;

  return {
    repoRoot,
    assertionMatrix,
    telemetryMatrix,
    wiringMatrix,
    triadRows,
    totalAdrs,
    healthyAdrs,
    assertionDriftCount,
    telemetryDriftCount,
    orphanDecisionCount,
    isHealthy,
  };
}

/**
 * 格式化全景对账热力表输出 (Triad Heatmap)
 */
export function formatTriadHeatmap(triadResult) {
  const lines = [];
  lines.push('\n🛡️  \x1b[1mSpec-Guard (Drift-Gate) v2.0 - 全景对账热力表 (Triad Heatmap)\x1b[0m');
  lines.push('═'.repeat(96));
  lines.push(
    `📊 规约总数: ${triadResult.totalAdrs} | 断言漂移: \x1b[31m${triadResult.assertionDriftCount}\x1b[0m | 数据漂移: \x1b[31m${triadResult.telemetryDriftCount}\x1b[0m | 孤儿决策: \x1b[31m${triadResult.orphanDecisionCount}\x1b[0m`
  );
  lines.push('─'.repeat(96));

  // 表头
  const colAdr = 'ADR 编号'.padEnd(10);
  const colStatus = '规约状态'.padEnd(12);
  const colAss = '断言 (Assertion)'.padEnd(20);
  const colTel = '证据 (Evidence)'.padEnd(28);
  const colWir = '接线 (Wiring)'.padEnd(16);
  const colVer = '综合裁决';

  lines.push(`\x1b[1m${colAdr} | ${colStatus} | ${colAss} | ${colTel} | ${colWir} | ${colVer}\x1b[0m`);
  lines.push('─'.repeat(96));

  for (const row of triadResult.triadRows) {
    const frozenTag = row.isFrozen ? '[🔒Frozen]' : '[Draft]';
    const statusCol = frozenTag.padEnd(10);
    const adrCol = row.adrId.padEnd(10);
    const assCol = row.assertionSummary.padEnd(18);
    const telCol = row.telemetrySummary.padEnd(26);
    const wirCol = row.wiringSummary.padEnd(14);

    let verdictColor = '\x1b[32m';
    if (row.verdict === 'DRIFT_DETECTED' || row.verdict === 'TELEMETRY_DRIFT' || row.verdict === 'ORPHAN_DECISION') {
      verdictColor = '\x1b[31m';
    } else if (row.verdict === 'IN_PROGRESS') {
      verdictColor = '\x1b[33m';
    }

    lines.push(
      `${adrCol} | ${statusCol} | ${assCol} | ${telCol} | ${wirCol} | ${verdictColor}${row.verdictIcon} ${row.verdict}\x1b[0m`
    );
  }

  lines.push('═'.repeat(96));
  if (triadResult.isHealthy) {
    lines.push('\x1b[32m✅ 全景三元对账检查通过！无断言漂移、无实测数据伪造、无孤儿冻结决策。\x1b[0m\n');
  } else {
    lines.push('\x1b[31m❌ 全景三元对账门禁阻断！发现存在断言脱节、实测数据伪造或孤儿冻结决策。\x1b[0m\n');
  }

  return lines.join('\n');
}
