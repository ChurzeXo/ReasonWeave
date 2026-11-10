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
import { scanRepository } from './scanner.mjs';

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
 * 极简 YAML 提取器（提取 id, name, status, cross_repo_contracts 等基础字段）
 */
function parseSimpleYamlOverlay(yamlContent) {
  const invariants = [];
  const lines = yamlContent.split('\n');
  let currentInv = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- id:')) {
      if (currentInv) invariants.push(currentInv);
      const idMatch = trimmed.match(/- id:\s*["']?([^"']+)["']?/);
      currentInv = { id: idMatch ? idMatch[1] : '', isOverlay: true };
    } else if (currentInv) {
      if (trimmed.startsWith('name:')) {
        const m = trimmed.match(/name:\s*["']?([^"']+)["']?/);
        if (m) currentInv.name = m[1];
      } else if (trimmed.startsWith('status:')) {
        const m = trimmed.match(/status:\s*["']?([^"']+)["']?/);
        if (m) currentInv.status = m[1];
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

      // 状态裁定
      let finalStatus = 'in_progress';
      let statusReason = '';

      if (matchingAssertions.length > 0) {
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

      invResults.push({
        invariantId: inv.canonicalId,
        localId: inv.localId,
        description: inv.description,
        status: finalStatus,
        statusReason,
        assertionsCount: matchingAssertions.length,
        assertions: matchingAssertions,
        contracts: matchingContracts,
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
    isHealthy: driftCount === 0 && orphanAssertions.length === 0,
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
      } else if (inv.status === 'drift_detected') {
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

  if (hasDrift) {
    lines.push('> ❌ **阻断判定**：检测到严重架构漂移！该规约声称生效或已 Frozen，但存在零断言覆盖的不变量。**严禁以“已实现”上报，严禁进行 Frozen 冻结签署**。\n');
  } else if (allVerified && adr.hasImplementationStatus) {
    lines.push('> ✅ **合规建议**：所有声明的不变量均已绑定有效可机判断言，且落地状态节完备。具备由架构师及用户人工签署 `🔒Frozen` 的机器凭据。\n');
  } else {
    lines.push('> ⏳ **进行中判定**：规约部分能力处于契约沙箱验证或逐步交付中。请在 `## Implementation Status` 中如实登记已接线与未接线清单。\n');
  }

  return lines.join('\n');
}
