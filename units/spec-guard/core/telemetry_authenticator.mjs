/**
 * telemetry_authenticator.mjs
 *
 * 负责 ADR 实测数据自述与机器信任根对账 (spec-guard v2.0):
 * 1. 扫描 ADR 表格与正文中的量化性能指标 (ms, s, MB, FPS, %, Tokens, P95, P99, INT8 等)
 * 2. 检查 ADR 是否绑定机器信任根 (evidence_ref: evidence/*.json 与 digest: sha256:...)
 * 3. 校验凭据文件 SHA-256 哈希完整性，严禁用裸 signature 占位符跳过哈希校验
 * 4. 容差恒等于 0%：逐指标全量对账，所有 ADR 声明数值必须在凭据 JSON 中精确命中
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
 * 实测基准上下文线索关键字（避免将背景设备参数如 4GB RAM 或章节序号误判为实测基准声明）
 */
const MEASUREMENT_CONTEXT_REGEX = /(?:实测|基准|均值|P95|P99|INT8|冷启|推理|拟合斜率|准确率|Top-?1|ECE|Latency|Throughput|Tokens?\/s|FPS|耗时|执行时间|软拷贝|基线|Benchmark|Spike)/i;

/**
 * 实测基准章节标题正则
 */
const MEASUREMENT_SECTION_REGEX = /(?:Implementation\s+Status|落地情况|Benchmark|基准|实测|Evaluation|性能|Spike|测试数据|压测)/i;

/**
 * 提取文本中出现的量化性能指标（具备上下文感知能力）
 */
export function extractTelemetryMetrics(content) {
  const lines = content.split('\n');
  const metrics = [];
  let currentSection = '';

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();

    // 跟踪当前章节标题
    const headerMatch = trimmed.match(/^#{2,4}\s+(.+)$/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim();
      continue;
    }

    // 忽略日期行，如 2026-11-14
    if (/^\s*[-*]?\s*\**.*?(?:日期|Date).*?\**\s*[:：]/i.test(line)) {
      continue;
    }

    // 上下文判断：必须处于测量节内，或该行明确包含实测/性能/基准关键词
    const inMeasurementSection = MEASUREMENT_SECTION_REGEX.test(currentSection);
    const hasMeasurementKeyword = MEASUREMENT_CONTEXT_REGEX.test(line);

    if (!inMeasurementSection && !hasMeasurementKeyword) {
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
  let totalVerifiedMetrics = 0;

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

    // 强制机器 SHA-256 完整性摘要检验（严禁以裸 signature 占位符跳过哈希校验）
    if (!declaredDigest) {
      allFilesValid = false;
      details.push(`凭证 ${refPath} 缺少机器哈希摘要或数字签名 (缺少机器 SHA-256 哈希摘要 digest: sha256:...)，严禁以裸 signature 占位符跳过机器信任根`);
      continue;
    }

    if (declaredDigest.toLowerCase() !== actualDigest.toLowerCase()) {
      allFilesValid = false;
      details.push(`凭证 ${refPath} 哈希不匹配 (期望: ${declaredDigest}, 实际: ${actualDigest})`);
      continue;
    }

    // 5. 数据真实性判定：逐指标全量 0% 强对账（所有 ADR 声明的数值必须全量在凭据 JSON 中命中）
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
    const jsonNumbers = Array.from(jsonNumericMap.values());

    const matchedMetrics = [];
    const unmatchedMetrics = [];

    for (const m of rawMetrics) {
      // 排除分位标称/精度标签（如 P95, P99, INT8, FP16 等，其数值由紧随的实测数值表征）
      if (/^(?:P\d+|INT\d+|FP\d+)$/i.test(m.metric)) {
        matchedMetrics.push(m.metric);
        continue;
      }

      const numMatch = m.metric.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) {
        const val = parseFloat(numMatch[1]);
        const hit = jsonNumbers.some((jsonVal) => {
          return Math.abs(jsonVal - val) < 1e-6 || String(jsonVal) === numMatch[1];
        });
        if (hit) {
          matchedMetrics.push(m.metric);
        } else {
          unmatchedMetrics.push(m.metric);
        }
      }
    }

    // 0% 容差铁律：所有 ADR 文本中提取的量化实测指标必须 100% 在凭据 JSON 中命中，但凡有 1 处未命中即判 FAIL 阻断
    if (unmatchedMetrics.length > 0) {
      allFilesValid = false;
      details.push(
        `凭证 ${refPath} 实测数值与 ADR 文本自述数值脱节，存在 ${unmatchedMetrics.length} 处未验证指标 (${unmatchedMetrics.slice(0, 5).join(', ')})，违反 0% 容差铁律 (容差 $0%)`
      );
    } else {
      totalVerifiedMetrics += matchedMetrics.length;
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
    reason: `✅ 机器信任根验签通过 (SHA-256: ${primaryActualDigest.slice(0, 8)}... | 全部 ${totalVerifiedMetrics} 处实测指标 0% 容差对账吻合)`,
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
