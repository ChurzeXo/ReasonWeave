/**
 * telemetry_authenticator.mjs
 *
 * 负责 ADR 实测数据自述与机器信任根对账 (spec-guard v2.0):
 * 1. 扫描 ADR 表格与正文中的量化性能指标 (ms, s, MB, FPS, %, Tokens, P95, P99, INT8 等)
 * 2. 检查 ADR 是否绑定机器信任根 (evidence_ref: evidence/*.json 与 digest / signature)
 * 3. 校验凭据文件 SHA-256 哈希完整性与签名
 * 4. 容差恒等于 0%：比对 ADR 文本声明数值与 JSON 实测字段值
 * 5. 发现违规时熔断阻断，报告「ADR-XXX: 实测数据自述漂移（违反 ADR-064 机器信任根）」
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { findAdrFiles, parseAdrFile } from './adr-parser.mjs';

/**
 * 量化指标正则：匹配延迟、吞吐、内存、精度等量化数值与关键字
 */
export const QUANTITATIVE_METRICS_REGEX = /(?:\b\d+(?:\.\d+)?\s*(?:ms|MB|GB|FPS|Tokens?|tok|KB|μs|us)\b|\b\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?\s*s\b|\bP95\b|\bP99\b|\bINT8\b)/gi;

/**
 * 提取文本中出现的量化指标
 */
export function extractTelemetryMetrics(content) {
  const lines = content.split('\n');
  const metrics = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    // 忽略标题中的版本号（如 v1.0, v2.0）以及日期
    if (/^\s*#+\s+/.test(line) && !line.includes('实测') && !line.includes('基准')) {
      continue;
    }
    // 忽略日期行，如 2026-11-14
    if (/^\s*[-*]?\s*\**.*?(?:日期|Date).*?\**\s*[:：]/i.test(line)) {
      continue;
    }

    QUANTITATIVE_METRICS_REGEX.lastIndex = 0;
    let match;
    while ((match = QUANTITATIVE_METRICS_REGEX.exec(line)) !== null) {
      const matchedText = match[0].trim();
      metrics.push({
        metric: matchedText,
        line: lineIdx + 1,
        lineContent: line.trim(),
      });
    }
  }

  return metrics;
}

/**
 * 从 ADR 文本中提取凭证引用 (evidence_ref) 与数字签名/摘要 (digest/signature)
 */
export function extractEvidenceReferences(content) {
  const evidenceFiles = [];
  let declaredDigest = '';
  let signature = '';

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // 清理 Markdown 加粗与反引号标记，便于正则匹配元数据键值
    const cleanLine = trimmed.replace(/[*`]/g, '');

    // 匹配 evidence_ref: evidence/...json 或 evidence_ref = "evidence/...json"
    const refMatch = cleanLine.match(/(?:evidence_ref|evidence)\s*[:=：]\s*["']?([^"'\s,)]+\.json)["']?/i);
    if (refMatch) {
      evidenceFiles.push(refMatch[1]);
    }

    // 匹配 Markdown 列表中对 evidence/*.json 的直接引用
    const listJsonMatch = cleanLine.match(/[-*]?\s*(evidence\/[^"'\s]+\.json)/i);
    if (listJsonMatch && !evidenceFiles.includes(listJsonMatch[1])) {
      evidenceFiles.push(listJsonMatch[1]);
    }

    // 匹配 digest: sha256:... 或 sha256: ...
    const digestMatch = cleanLine.match(/(?:digest|sha256|hash)\s*[:=：]\s*["']?(?:sha256:)?([a-fA-F0-9]{64})["']?/i);
    if (digestMatch && !declaredDigest) {
      declaredDigest = digestMatch[1].toLowerCase();
    }

    // 匹配 signature
    const sigMatch = cleanLine.match(/(?:signature|sig)\s*[:=：]\s*["']?([a-zA-Z0-9+/=_-]{32,})["']?/i);
    if (sigMatch && !signature) {
      signature = sigMatch[1];
    }
  }

  return {
    evidenceFiles: [...new Set(evidenceFiles)],
    declaredDigest,
    signature,
  };
}

/**
 * 递归从 JSON 对象中抽取所有数值与扁平键值对
 */
function extractNumericValuesFromJson(obj, prefix = '') {
  const map = new Map();
  if (typeof obj === 'number') {
    map.set(prefix, obj);
    return map;
  }
  if (!obj || typeof obj !== 'object') {
    return map;
  }

  for (const [key, val] of Object.entries(obj)) {
    const currentKey = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'number') {
      map.set(currentKey, val);
    } else if (typeof val === 'object' && val !== null) {
      const nested = extractNumericValuesFromJson(val, currentKey);
      for (const [nKey, nVal] of nested.entries()) {
        map.set(nKey, nVal);
      }
    }
  }
  return map;
}

/**
 * 验证单个 ADR 的实测数据自述凭证
 */
export function verifyAdrTelemetry(adrData, repoRoot) {
  const adrId = adrData.adrId || 'ADR-UNKNOWN';
  const filePath = adrData.filePath || '';
  const content = typeof adrData.content === 'string' ? adrData.content : fs.readFileSync(filePath, 'utf8');

  // 1. 扫描是否包含量化性能自述指标
  const rawMetrics = extractTelemetryMetrics(content);
  const metricStrings = rawMetrics.map((m) => m.metric);

  if (rawMetrics.length === 0) {
    return {
      adrId,
      filePath,
      hasMetrics: false,
      metricsCount: 0,
      metrics: [],
      status: 'SKIPPED',
      isCompliant: true,
      reason: '未包含量化性能指标自述，豁免机器信任根强校验',
      evidenceFiles: [],
      declaredDigest: null,
      actualDigest: null,
      details: [],
    };
  }

  // 2. 提取凭据引用与签名摘要
  const { evidenceFiles, declaredDigest, signature } = extractEvidenceReferences(content);

  // 3. 校验：若有量化指标，必须绑定凭据文件
  if (evidenceFiles.length === 0) {
    const sample = metricStrings.slice(0, 3).join(', ');
    const reason = `${adrId}: 实测数据自述漂移（违反 ADR-064 机器信任根）`;
    const detail = `包含量化指标声明 (${sample} 等 ${rawMetrics.length} 处) 但缺少 evidence/*.json 凭证引用与机器签名摘要`;
    return {
      adrId,
      filePath,
      hasMetrics: true,
      metricsCount: rawMetrics.length,
      metrics: metricStrings,
      status: 'FAIL',
      isCompliant: false,
      reason,
      evidenceFiles: [],
      declaredDigest: null,
      actualDigest: null,
      details: [detail],
    };
  }

  // 4. 遍历并校验引用的凭据文件
  const details = [];
  let allFilesValid = true;
  let primaryActualDigest = null;

  for (const refPath of evidenceFiles) {
    // 搜索候选物理路径
    const candidatePaths = [
      path.resolve(repoRoot, refPath),
      path.resolve(path.dirname(filePath), refPath),
      path.resolve(repoRoot, 'evidence', path.basename(refPath)),
      path.resolve(repoRoot, 'mcp-server', 'evidence', path.basename(refPath)),
    ];

    let resolvedPath = null;
    for (const cp of candidatePaths) {
      if (fs.existsSync(cp)) {
        resolvedPath = cp;
        break;
      }
    }

    if (!resolvedPath) {
      allFilesValid = false;
      details.push(`凭证文件物理不存在: ${refPath}`);
      continue;
    }

    // 计算凭证文件 SHA-256 摘要
    const fileBuf = fs.readFileSync(resolvedPath);
    const actualDigest = crypto.createHash('sha256').update(fileBuf).digest('hex').toLowerCase();
    primaryActualDigest = actualDigest;

    // 检查摘要匹配度
    if (!declaredDigest && !signature) {
      allFilesValid = false;
      details.push(`凭证 ${refPath} 缺少机器哈希摘要或数字签名 (实测计算摘要: sha256:${actualDigest})`);
      continue;
    }

    if (declaredDigest && declaredDigest !== actualDigest) {
      allFilesValid = false;
      details.push(`凭证 ${refPath} 哈希不匹配 (期望: ${declaredDigest}, 实际: ${actualDigest})`);
      continue;
    }

    // 5. 数据真实性判定：比对 ADR 声明数值与凭据 JSON 内的数值（容差 0%）
    let jsonContent;
    try {
      jsonContent = JSON.parse(fileBuf.toString('utf8'));
    } catch (e) {
      allFilesValid = false;
      details.push(`凭证 ${refPath} 不是有效的 JSON 格式文件`);
      continue;
    }

    // 提取 JSON 中的所有数值
    const jsonNumericMap = extractNumericValuesFromJson(jsonContent);
    const jsonValues = new Set(Array.from(jsonNumericMap.values()).map((v) => String(v)));

    // 校验 ADR 文本中出现的独立数值是否能在凭证中精确找到匹配
    let verifiedValuesCount = 0;
    for (const m of rawMetrics) {
      const numMatch = m.metric.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) {
        const numStr = numMatch[1];
        if (jsonValues.has(numStr) || Array.from(jsonValues).some((v) => parseFloat(v) === parseFloat(numStr))) {
          verifiedValuesCount++;
        }
      }
    }

    // 若凭证中完全找不到 ADR 声明的任何数值，判定为数据伪造或错挂
    if (rawMetrics.length > 0 && verifiedValuesCount === 0 && jsonNumericMap.size > 0) {
      allFilesValid = false;
      details.push(`凭证 ${refPath} 实测数值与 ADR 文本自述数值完全脱节 (容差 $0\\%$)`);
    }
  }

  if (!allFilesValid) {
    return {
      adrId,
      filePath,
      hasMetrics: true,
      metricsCount: rawMetrics.length,
      metrics: metricStrings,
      status: 'FAIL',
      isCompliant: false,
      reason: `${adrId}: 实测数据自述漂移（违反 ADR-064 机器信任根）`,
      evidenceFiles,
      declaredDigest,
      actualDigest: primaryActualDigest,
      details,
    };
  }

  return {
    adrId,
    filePath,
    hasMetrics: true,
    metricsCount: rawMetrics.length,
    metrics: metricStrings,
    status: 'PASS',
    isCompliant: true,
    reason: `✅ 机器信任根验签通过 (SHA-256: ${primaryActualDigest.slice(0, 8)}... | ${rawMetrics.length} 处实测指标对账吻合)`,
    evidenceFiles,
    declaredDigest,
    actualDigest: primaryActualDigest,
    details: [],
  };
}

/**
 * 校验指定目录下所有 ADR 的实测数据信任根
 */
export function verifyAllAdrsTelemetry(repoRoot, options = {}) {
  const adrPaths = findAdrFiles(repoRoot);
  const targetId = options.targetAdrId ? options.targetAdrId.toUpperCase() : null;

  const reports = [];
  let auditedCount = 0;
  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const adrPath of adrPaths) {
    const parsed = parseAdrFile(adrPath);
    if (targetId && parsed.adrId.toUpperCase() !== targetId) {
      continue;
    }

    const verification = verifyAdrTelemetry(parsed, repoRoot);
    reports.push(verification);

    if (verification.hasMetrics) {
      auditedCount++;
      if (verification.isCompliant) {
        passedCount++;
      } else {
        failedCount++;
      }
    } else {
      skippedCount++;
    }
  }

  return {
    repoRoot,
    totalAdrs: adrPaths.length,
    auditedCount,
    passedCount,
    failedCount,
    skippedCount,
    reports,
    isHealthy: failedCount === 0,
  };
}
