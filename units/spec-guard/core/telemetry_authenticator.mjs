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
import { findAdrFiles, parseAdrFile, loadOverlayConfig } from './adr-parser.mjs';

/**
 * 量化指标正则：匹配延迟、吞吐、内存、精度等量化数值与关键字
 */
export const QUANTITATIVE_METRICS_REGEX = /(?:\b\d+(?:\.\d+)?\s*(?:ms|MB|GB|FPS|Tokens?|tok|KB|μs|us)\b|\b\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?\s*s\b|\bP95\b|\bP99\b|\bINT8\b)/gi;

/**
 * 实测基准上下文线索关键字（避免将背景设备参数如 4GB RAM 或章节序号误判为实测基准声明）
 */
const MEASUREMENT_CONTEXT_REGEX = /(?:实测|基准|均值|P95|P99|INT8|冷启|推理|拟合斜率|准确率|Top-?1|ECE|Latency|Throughput|Tokens?\/s|FPS|软拷贝|基线|Benchmark|Spike|采样|常驻)/i;

/**
 * 非实测声明关键字（背景规模估计、环境剩余空间、约数预估、设计约束等）
 */
const NON_MEASUREMENT_REGEX = /(?:预估|估算|估计|空间|剩余|磁盘|背景|约在|大约|approx|\bestimate\b|历史开发机|开发环境|方案比较|方案对比|备选方案|方案优点|可执行文件大小|下载规模|模型规模|权重规模|宽限|强杀|软取消|硬取消)/i;

/**
 * 非实测章节标题正则（方案比较、备选方案、方案考量、方案优缺点、设计约束等，默认不作为实测基准声明章节）
 */
const NON_MEASUREMENT_SECTION_REGEX = /(?:方案比较|方案对比|备选方案|Alternatives|方案优点|方案缺点|Pros|Cons|Advantages|Trade-offs|背景|Context|约束|Constraints|设计原则|Principles)/i;

/**
 * 强实测断言关键字（若行内明确标明实测/Benchmark，即使含阈值也不整行丢弃）
 */
const STRONG_MEASUREMENT_REGEX = /(?:实测|基准数据|Benchmark|压测结果|测试数据|真实测量)/i;

/**
 * 实测基准章节标题正则
 */
const MEASUREMENT_SECTION_REGEX = /(?:Implementation\s+Status|落地情况|Benchmark|基准|实测|Evaluation|性能|Spike|测试数据|压测|^\s*验证\s*$)/i;

/**
 * 提取某字符位置所在的自然子句或表格单元格
 */
function getSurroundingClause(line, matchIndex, matchLength) {
  let start = matchIndex;
  while (start > 0) {
    const ch = line[start - 1];
    if (ch === '，' || ch === '；' || ch === '。' || ch === ';' || ch === '|' || ch === '(' || ch === '（' || ch === '\t') {
      break;
    }
    start--;
  }

  let end = matchIndex + matchLength;
  while (end < line.length) {
    const ch = line[end];
    if (ch === '，' || ch === '；' || ch === '。' || ch === ';' || ch === '|' || ch === ')' || ch === '）' || ch === '\t') {
      break;
    }
    end++;
  }

  return line.slice(start, end).trim();
}

/**
 * 判定某个具体的量化数值是否属于非测量语境（设计约束、约数预估、环境描述等）
 * 严格遵从 ADR-0013 / ADR-064：
 * 1. 若数值具备强实测断言且无约束/约数修饰，绝不误杀；
 * 2. 精确区分约数 (约 100GB, ~2MB)、范围约束 (30–60s 软取消宽限要求)、惩罚阈值 (禁止 10s 强杀)、阈值指标 (超时阈值 100ms)；
 * 3. 同行混合实测与约束时，逐指标精细过滤，坚决不以整行整段宽泛忽略掩盖断链。
 */
function isNonMeasurementMetricContext(line, match, matchedText, currentSection) {
  const matchIndex = match.index;
  const matchLength = matchedText.length;
  const clause = getSurroundingClause(line, matchIndex, matchLength);

  const prefix = line.slice(Math.max(0, matchIndex - 35), matchIndex);
  const suffix = line.slice(matchIndex + matchLength, Math.min(line.length, matchIndex + matchLength + 35));

  // 1. 约数修饰检查：数值前带有 约、大约、大致、约为、预估、估计、估算、~、≈
  // 注意：排除 410~460ms 中的 460ms（410~ 为基准实测区间下限，由数字结尾，不是约数前缀）
  const hasApproxPrefix =
    /(?:约|大约|大致|约为|预估|估计|估算)\s*$/i.test(prefix) ||
    (/(?:~|≈)\s*$/i.test(prefix) && !/\d\s*[~≈]\s*$/.test(prefix));
  const hasApproxSuffix = /^\s*(?:左右|上下)/i.test(suffix);

  if (hasApproxPrefix || hasApproxSuffix) {
    if (!STRONG_MEASUREMENT_REGEX.test(clause)) {
      return true;
    }
  }

  // 2. 纪律约束修饰检查：禁止、强杀、宽限、软取消、硬取消
  const hasConstraintPrefix = /(?:禁止|强杀|宽限|软取消|硬取消)\s*$/i.test(prefix);
  const hasConstraintSuffix = /^\s*(?:软取消|硬取消|宽限|强杀)/i.test(suffix);
  const hasConstraintInClause = /(?:宽限|强杀|禁止\s*\d+\s*s|软取消|硬取消)/i.test(clause);

  if (hasConstraintPrefix || hasConstraintSuffix || (hasConstraintInClause && !STRONG_MEASUREMENT_REGEX.test(clause))) {
    return true;
  }

  // 3. 范围约束：例如 30–60s 软取消宽限要求（30– 引导且后缀包含约束/要求）
  const isRangeWithConstraint =
    /\d+\s*[-–—~至到]\s*$/i.test(prefix) &&
    /(?:宽限|强杀|禁止|软取消|硬取消)/i.test(suffix);
  if (isRangeWithConstraint && !STRONG_MEASUREMENT_REGEX.test(clause)) {
    return true;
  }

  // 4. 环境硬件与体积估计子句：历史开发机、C 盘剩余、模型下载规模、可执行文件大小
  const hasEnvOrScaleInClause = /(?:历史开发机|开发环境|历史机型|历史环境|C\s*盘|D\s*盘|剩余空间|剩余|下载规模|模型规模|权重规模|可执行文件大小|二进制体积)/i.test(clause);
  if (hasEnvOrScaleInClause && !STRONG_MEASUREMENT_REGEX.test(clause)) {
    return true;
  }

  // 5. 非测量章节（方案比较、方案优点、备选方案、设计约束等）且子句未显式带有强实测声明
  if (NON_MEASUREMENT_SECTION_REGEX.test(currentSection) && !STRONG_MEASUREMENT_REGEX.test(clause)) {
    return true;
  }

  return false;
}

/**
 * 提取文本中出现的量化性能指标（具备上下文感知能力与豁免规则）
 */
export function extractTelemetryMetrics(content, options = {}) {
  const lines = content.split('\n');
  const metrics = [];
  let currentSection = '';
  let inIgnoreBlock = false;

  const rawPatterns = [
    ...(options.ignorePatterns || []),
    ...(options.telemetry_ignore_patterns || []),
    ...(options.config?.telemetry_ignore_patterns || []),
    ...(options.config?.telemetry?.ignore_patterns || []),
  ];

  // 预编译忽略规则（支持纯字符串子串匹配或 /pattern/i 正则）
  const compiledIgnorePatterns = rawPatterns
    .map((pat) => {
      if (!pat) return null;
      if (pat instanceof RegExp) return pat;
      const str = String(pat).trim();
      if (str.startsWith('/') && str.endsWith('/') && str.length > 2) {
        try {
          return new RegExp(str.slice(1, -1), 'i');
        } catch (e) {
          return str;
        }
      }
      return str;
    })
    .filter(Boolean);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();

    // 0. 块级忽略注释检查 <!-- telemetry: ignore-start --> / <!-- telemetry: ignore-end -->
    if (/<!--\s*telemetry:\s*(?:ignore-start|skip-start)\s*-->/i.test(line)) {
      inIgnoreBlock = true;
      continue;
    }
    if (/<!--\s*telemetry:\s*(?:ignore-end|skip-end)\s*-->/i.test(line)) {
      inIgnoreBlock = false;
      continue;
    }
    if (inIgnoreBlock) {
      continue;
    }

    // 1. 行级内联忽略注释检查：<!-- telemetry: ignore --> / <!-- telemetry: skip --> / <!-- telemetry: convention -->
    if (
      /<!--\s*telemetry:\s*(?:ignore|skip|convention|exempt)\s*-->/i.test(line) ||
      /<!--\s*telemetry-ignore\s*-->/i.test(line)
    ) {
      continue;
    }

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

    // 上下文判断：必须处于测量节内（且排除非测量节），或该行明确包含实测/性能/基准关键词
    const inMeasurementSection = MEASUREMENT_SECTION_REGEX.test(currentSection) && !NON_MEASUREMENT_SECTION_REGEX.test(currentSection);
    const hasMeasurementKeyword = MEASUREMENT_CONTEXT_REGEX.test(line);

    if (!inMeasurementSection && !hasMeasurementKeyword) {
      continue;
    }

    // 若该行明确属于非测量章节、设计约束、背景说明或估计预估，且未附带强实测声明，则不作为实测性能指标提取
    if ((NON_MEASUREMENT_REGEX.test(line) || NON_MEASUREMENT_SECTION_REGEX.test(currentSection)) && !STRONG_MEASUREMENT_REGEX.test(line)) {
      continue;
    }

    // 2. 检查整行是否被行级正则模式显式忽略（如 ^...$）
    if (compiledIgnorePatterns.length > 0) {
      const wholeLineIgnored = compiledIgnorePatterns.some((p) => {
        if (p instanceof RegExp && p.source.startsWith('^')) {
          return p.test(line);
        }
        return p === line.trim();
      });
      if (wholeLineIgnored) {
        continue;
      }
    }

    QUANTITATIVE_METRICS_REGEX.lastIndex = 0;
    let match;
    while ((match = QUANTITATIVE_METRICS_REGEX.exec(line)) !== null) {
      const matchedText = match[0].trim();

      // 逐指标细粒度上下文判定：设计约束、阈值、约数、环境硬件描述在非强实测子句中不作为实测性能主张
      if (isNonMeasurementMetricContext(line, match, matchedText, currentSection)) {
        continue;
      }

      // 3. 检查具体提取出的 metric 是否命中 ignore_patterns（单指标精细化过滤，不误杀同行动态指标）
      if (compiledIgnorePatterns.length > 0) {
        const metricIgnored = compiledIgnorePatterns.some((p) => {
          if (p instanceof RegExp) {
            return p.test(matchedText);
          }
          const strPat = String(p).trim();
          if (matchedText === strPat) return true;
          if (line.includes(strPat)) {
            if (strPat.includes(matchedText) || matchedText.includes(strPat)) {
              return true;
            }
          }
          return false;
        });
        if (metricIgnored) {
          continue;
        }
      }

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
export function verifyAdrTelemetry(adrData, repoRoot, options = {}) {
  const adrId = adrData.adrId || 'ADR-UNKNOWN';
  const filePath = adrData.filePath || '';
  const content = typeof adrData.content === 'string' ? adrData.content : fs.readFileSync(filePath, 'utf8');

  // 0. 检查是否显式声明或配置豁免
  const exemptAdrs = [
    ...(options.exemptAdrs || []),
    ...(options.telemetry_exempt_adrs || []),
    ...(options.config?.telemetry_exempt_adrs || []),
    ...(options.config?.telemetry?.exempt_adrs || []),
  ].map((id) => String(id).toUpperCase());

  if (adrData.telemetryExempt || (adrId && exemptAdrs.includes(adrId.toUpperCase()))) {
    return {
      adrId,
      filePath,
      hasMetrics: false,
      metricsCount: 0,
      metrics: [],
      status: 'SKIPPED',
      isCompliant: true,
      reason: '声明或配置豁免（telemetry: exempt / telemetry_exempt_adrs），豁免机器信任根强校验',
      evidenceFiles: [],
      declaredDigest: null,
      actualDigest: null,
      details: [],
    };
  }

  // 1. 扫描是否包含量化性能自述指标
  const rawMetrics = extractTelemetryMetrics(content, options);
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
          // 1. 完全一致
          if (Math.abs(jsonVal - val) < 1e-6 || String(jsonVal) === numMatch[1]) {
            return true;
          }
          // 2. 四舍五入保留位数一致（人类可读文档四舍五入对账）
          const decimals = (numMatch[1].split('.')[1] || '').length;
          if (decimals > 0 && Math.abs(parseFloat(jsonVal.toFixed(decimals)) - val) < 1e-6) {
            return true;
          }
          return false;
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
  const config = options.config || loadOverlayConfig(repoRoot, options.overlay || options.overlayPath || '');
  const mergedOptions = { ...config, ...options };
  const adrPaths = findAdrFiles(repoRoot, mergedOptions);
  const targetId = options.targetAdrId ? options.targetAdrId.toUpperCase() : null;

  const reports = [];
  let auditedCount = 0;
  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const adrPath of adrPaths) {
    const parsed = parseAdrFile(adrPath, mergedOptions);
    if (targetId && parsed.adrId.toUpperCase() !== targetId) {
      continue;
    }

    const verification = verifyAdrTelemetry(parsed, repoRoot, mergedOptions);
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
