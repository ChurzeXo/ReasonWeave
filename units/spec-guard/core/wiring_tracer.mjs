/**
 * wiring_tracer.mjs
 *
 * 负责 ADR 物理代码接线探测与孤儿决策防卫 (spec-guard v2.0):
 * 1. 从 ADR 决策节 (## 2. Decision) 提取核心架构符号、类名、函数与引擎编号 (支持反引号与自然语言实体)
 * 2. 严格排除测试目录 (src/test/, tests/, __tests__ 等)，贯彻 No-Cheat 防作弊铁律
 * 3. 在生产源码目录中反查符号存活性与物理接线
 * 4. 若 ADR 已标记 🔒Frozen 但生产代码零符号命中，判定为孤儿决策 (ORPHAN_DECISION) 并熔断阻断
 */

import fs from 'node:fs';
import path from 'node:path';
import { findAdrFiles, parseAdrFile, escapeRegex } from './adr-parser.mjs';
import { scanRepository, isTestPath } from './scanner.mjs';

/**
 * 通用停用词/无业务属性词汇（避免将通用关键字误当作架构实体）
 */
const STOP_WORDS = new Set([
  'true', 'false', 'null', 'undefined', 'void', 'unit', 'string', 'int', 'boolean', 'float',
  'any', 'id', 'try', 'catch', 'finally', 'try-finally', 'return', 'import', 'export', 'package',
  'class', 'interface', 'type', 'val', 'var', 'let', 'const', 'def', 'fun', 'fn', 'function',
  'sha256', 'digest', 'hash', 'signature', 'apache-2.0', 'mit', 'agpl-3.0', 'gpl',
  'cpu', 'gpu', 'npu', 'ram', 'rom', 'dom', 'a11y', 'ocr', 'mcp', 'api', 'uri', 'url',
  'p95', 'p99', 'int8', 'fp32', 'fp16', 'ms', 'mb', 'fps',
]);

/**
 * 从 ADR 内容中定位 Decision 节并提取候选代码实体符号
 */
export function extractDecisionSymbols(content) {
  const lines = content.split('\n');
  let inDecision = false;
  const decisionLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{2,3}\s+(?:\d+\.?\s*)?(?:Decision|决策内容|决策)/i.test(trimmed)) {
      inDecision = true;
      continue;
    }
    // 遇到下一个同级二级标题时退出
    if (inDecision && /^##\s+[^#]/.test(trimmed) && !/Decision|决策/i.test(trimmed)) {
      inDecision = false;
      break;
    }
    if (inDecision) {
      decisionLines.push(trimmed);
    }
  }

  const decisionText = decisionLines.join('\n');
  const symbols = new Set();

  // 1. 匹配反引号内的代码实体 `...`
  const backtickRegex = /`([^`]+)`/g;
  let match;

  while ((match = backtickRegex.exec(decisionText)) !== null) {
    const raw = match[1].trim();

    // 排除 URL 与路径
    if (/^https?:\/\//i.test(raw) || /^git\s+/i.test(raw) || /^cd\s+/i.test(raw)) {
      continue;
    }

    // 若包含文件扩展名 (如 ScreenshotBufferSpike.kt / host_probe.py / contracts.ts)
    const fileExtMatch = raw.match(/([A-Za-z0-9_-]+)\.(?:kt|java|py|go|ts|tsx|js|mjs|rs)$/);
    if (fileExtMatch) {
      const baseName = fileExtMatch[1];
      if (!STOP_WORDS.has(baseName.toLowerCase()) && baseName.length >= 3) {
        symbols.add(baseName);
      }
      continue;
    }

    // 若是方法调用 (如 hardwareBuffer.close() 或 click_candidate())
    const methodMatch = raw.match(/^([A-Za-z0-9_]+)(?:\.([A-Za-z0-9_]+))?\s*\(/);
    if (methodMatch) {
      const first = methodMatch[1];
      const second = methodMatch[2];
      if (first && !STOP_WORDS.has(first.toLowerCase()) && first.length >= 3) {
        symbols.add(first);
      }
      if (second && !STOP_WORDS.has(second.toLowerCase()) && second.length >= 3) {
        symbols.add(second);
      }
      continue;
    }

    // 若是属性/字段或类型 (如 Bitmap.Config.HARDWARE 或 Candidate.id)
    if (raw.includes('.')) {
      const parts = raw.split('.');
      for (const p of parts) {
        if (/^[A-Za-z0-9_]+$/.test(p) && !STOP_WORDS.has(p.toLowerCase()) && p.length >= 3) {
          symbols.add(p);
        }
      }
      continue;
    }

    // 匹配常规合法标识符 (CamelCase, snake_case, PascalCase, 或 E8/G0 编号)
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) {
      if (!STOP_WORDS.has(raw.toLowerCase()) && raw.length >= 2) {
        symbols.add(raw);
      }
      continue;
    }
  }

  // 2. 补充：从自然语言文本中抽取未包裹反引号的大写驼峰实体标识符 (如 QuantumGhostEngine, PhotonDispatcher)
  const pascalRegex = /\b([A-Z][a-zA-Z0-9_]{3,})\b/g;
  let pMatch;
  while ((pMatch = pascalRegex.exec(decisionText)) !== null) {
    const raw = pMatch[1];
    if (
      !STOP_WORDS.has(raw.toLowerCase()) &&
      !/^(Context|Decision|Consequences|Invariants|Status|Redmi|Android|Linux|Kotlin|Python|Java|Apple|Docker)$/i.test(raw)
    ) {
      symbols.add(raw);
    }
  }

  return Array.from(symbols);
}

/**
 * 预热加载生产代码文件缓存，避免成千上万次磁盘 I/O
 */
export function loadProductionFilesCache(repoRoot, scannedRepo = null) {
  const repoScan = scannedRepo || scanRepository(repoRoot);
  const prodFiles = repoScan.scannedFiles.filter((f) => !isTestPath(f));
  const fileCache = [];

  for (const relFile of prodFiles) {
    try {
      const fullPath = path.join(repoRoot, relFile);
      const content = fs.readFileSync(fullPath, 'utf8');
      fileCache.push({
        file: relFile,
        lines: content.split('\n'),
      });
    } catch {
      // ignore read error
    }
  }

  return { repoScan, fileCache };
}

/**
 * 针对单个 ADR 执行生产代码物理接线与符号存活性探测
 */
export function traceAdrWiring(adrData, repoRoot, scannedRepo = null, fileCache = null) {
  const adrId = adrData.adrId || 'ADR-UNKNOWN';
  const filePath = adrData.filePath || '';
  const isFrozen = !!adrData.isFrozen;
  const content = typeof adrData.content === 'string' ? adrData.content : fs.readFileSync(filePath, 'utf8');

  // 1. 抽取决策核心符号
  const candidateSymbols = extractDecisionSymbols(content);

  // 2. 加载或复用生产文件内存缓存 (No-Cheat: 严格排除测试代码)
  let cache = fileCache;
  if (!cache) {
    const loaded = loadProductionFilesCache(repoRoot, scannedRepo);
    cache = loaded.fileCache;
  }

  const wiredSymbols = [];
  const unwiredSymbols = [];
  const symbolDetails = {};

  for (const sym of candidateSymbols) {
    const escaped = escapeRegex(sym);
    const regex = new RegExp(`(?<=^|[^a-zA-Z0-9_])${escaped}(?=$|[^a-zA-Z0-9_])`);

    let hitCount = 0;
    const hitLocations = [];

    for (const cached of cache) {
      for (let lineIdx = 0; lineIdx < cached.lines.length; lineIdx++) {
        const line = cached.lines[lineIdx];
        if (regex.test(line)) {
          hitCount++;
          if (hitLocations.length < 5) {
            hitLocations.push({ file: cached.file, line: lineIdx + 1 });
          }
        }
      }
    }

    if (hitCount > 0) {
      wiredSymbols.push(sym);
      symbolDetails[sym] = { hitCount, status: 'WIRED', locations: hitLocations };
    } else {
      unwiredSymbols.push(sym);
      symbolDetails[sym] = { hitCount: 0, status: 'UNWIRED', locations: [] };
    }
  }

  // 3. 判定 ADR 整体物理接线状态 (🔒Frozen ADR 严禁因格式不合规而静默豁免)
  let status = 'PASS';
  let reason = '';
  let isOrphan = false;

  if (candidateSymbols.length === 0) {
    if (isFrozen) {
      status = 'FAIL';
      isOrphan = true;
      reason = `🚨 孤儿决策 (ORPHAN_DECISION): 规约已 🔒Frozen 但 Decision 节未声明任何可机检的架构代码实体符号！`;
    } else {
      status = 'SKIPPED';
      reason = 'Decision 节未提取到独立架构符号或无需生产接线';
    }
  } else if (isFrozen && wiredSymbols.length === 0) {
    status = 'FAIL';
    isOrphan = true;
    reason = `🚨 孤儿决策 (ORPHAN_DECISION): 规约已 🔒Frozen 但核心决策符号 (${candidateSymbols.slice(0, 5).join(', ')}) 在生产代码中零命中！`;
  } else if (wiredSymbols.length === 0) {
    status = 'UNWIRED';
    reason = `未接线草案: 生产代码暂无决策符号命中 (0/${candidateSymbols.length})`;
  } else {
    status = 'PASS';
    reason = `✅ 物理接线存活 (${wiredSymbols.length}/${candidateSymbols.length} 符号在生产代码中命中)`;
  }

  return {
    adrId,
    filePath,
    isFrozen,
    candidateSymbols,
    candidateSymbolsCount: candidateSymbols.length,
    wiredSymbols,
    unwiredSymbols,
    wiredCount: wiredSymbols.length,
    unwiredCount: unwiredSymbols.length,
    status,
    isOrphan,
    reason,
    symbolDetails,
  };
}

/**
 * 批量检查全仓 ADR 的物理接线状态
 */
export function traceAllAdrsWiring(repoRoot, options = {}) {
  const adrPaths = findAdrFiles(repoRoot);
  const targetId = options.targetAdrId ? options.targetAdrId.toUpperCase() : null;

  // 预热加载一次生产文件缓存
  const { repoScan, fileCache } = loadProductionFilesCache(repoRoot, options.scannedRepo);

  const reports = [];
  let frozenAdrsCount = 0;
  let orphanAdrsCount = 0;
  let passedCount = 0;

  for (const adrPath of adrPaths) {
    const parsed = parseAdrFile(adrPath);
    if (targetId && parsed.adrId.toUpperCase() !== targetId) {
      continue;
    }

    if (parsed.isFrozen) {
      frozenAdrsCount++;
    }

    const report = traceAdrWiring(parsed, repoRoot, repoScan, fileCache);
    reports.push(report);

    if (report.isOrphan) {
      orphanAdrsCount++;
    }
    if (report.status === 'PASS') {
      passedCount++;
    }
  }

  return {
    repoRoot,
    totalAdrs: adrPaths.length,
    frozenAdrsCount,
    orphanAdrsCount,
    passedCount,
    reports,
    isHealthy: orphanAdrsCount === 0,
  };
}
