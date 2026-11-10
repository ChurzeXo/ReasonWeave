/**
 * adr-parser.mjs
 *
 * 负责健壮解析 ADR 架构规约文件：
 * 1. 状态行（Status）与 🔒Frozen 检查
 * 2. ## Implementation Status 落地状态节与表格抽取
 * 3. ## Invariants 不变量抽取，实行严格的边界正则匹配（防 H-1 误伤 H-10 / H-1-OBSOLETE）
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * 转义正则特殊字符
 */
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 构造严格词界匹配正则
 * 确保 targetId 前后不能是字母、数字、下划线或连字符
 * 例如 targetId = "H-1"，绝不能匹配 "H-10" 或 "H-1-OBSOLETE" 或 "MY_H-1"
 */
export function makeStrictBoundaryRegex(targetId, flags = 'g') {
  const escaped = escapeRegex(targetId);
  return new RegExp(`(?<=^|[^a-zA-Z0-9_-])${escaped}(?=$|[^a-zA-Z0-9_-])`, flags);
}

/**
 * 测试文本中是否包含指定的不变量 ID（严格边界）
 */
export function containsStrictInvariant(text, targetId) {
  const regex = makeStrictBoundaryRegex(targetId, '');
  return regex.test(text);
}

/**
 * 递归查找可能包含 ADR 的目录
 */
export function findAdrFiles(repoRoot) {
  const candidateDirs = [
    path.join(repoRoot, 'group', 'architecture', 'adr'),
    path.join(repoRoot, 'docs', 'adr'),
    path.join(repoRoot, 'adr'),
    path.join(repoRoot, 'docs', 'proposals'),
  ];

  const results = [];
  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
            if (/ADR-\d+/i.test(entry.name) || /^\d{4}-/i.test(entry.name)) {
              results.push(path.join(dir, entry.name));
            }
          }
        }
      } catch (err) {
        // ignore read error
      }
    }
  }
  return results;
}

/**
 * 解析单个 ADR Markdown 文件内容
 */
export function parseAdrContent(content, filePath = '') {
  const lines = content.split('\n');

  // 1. 抽取 ADR 编号与标题
  let adrId = '';
  let title = '';

  const filename = filePath ? path.basename(filePath) : '';
  const fileMatch = filename.match(/(ADR-\d+)/i);
  if (fileMatch) {
    adrId = fileMatch[1].toUpperCase();
  }

  // 扫描前 30 行获取标题和状态
  let status = 'Unknown';
  let isFrozen = false;

  for (let i = 0; i < Math.min(lines.length, 35); i++) {
    const line = lines[i].trim();
    if (!title && line.startsWith('# ')) {
      title = line.replace(/^#\s*/, '').trim();
      if (!adrId) {
        const idMatch = title.match(/(ADR-\d+)/i);
        if (idMatch) adrId = idMatch[1].toUpperCase();
      }
    }
    // 匹配状态行，如: - **状态（Status）**：Proposed / 🔒 Frozen
    if (/^\s*[-*]?\s*\**状态.*?\**\s*[:：]/i.test(line) || /^\s*[-*]?\s*\**Status\**\s*[:：]/i.test(line)) {
      status = line.replace(/^.*?[:：]\s*/, '').trim();
      if (status.includes('🔒') || /Frozen/i.test(status)) {
        isFrozen = true;
      }
    }
  }

  if (!adrId) {
    adrId = 'ADR-UNKNOWN';
  }

  // 2. 状态节定位：## Implementation Status
  let hasImplementationStatus = false;
  let implementationItems = [];

  // 3. 不变量节定位：## Invariants / ## Consequences / Invariants
  let hasInvariantsSection = false;
  let invariants = [];

  let currentSection = '';
  let inTable = false;
  let tableHeader = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 识别二级或三级标题
    const headerMatch = trimmed.match(/^#{2,3}\s+(.+)$/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim();
      inTable = false;
      tableHeader = [];

      if (/Implementation\s+Status/i.test(currentSection) || /落地情况/i.test(currentSection)) {
        hasImplementationStatus = true;
      }
      if (/Invariants?/i.test(currentSection) || /不可变量/i.test(currentSection)) {
        hasInvariantsSection = true;
      }
      continue;
    }

    // 解析 Implementation Status 节的表格
    if (/Implementation\s+Status/i.test(currentSection) || /落地情况/i.test(currentSection)) {
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());
        if (cells.every((c) => /^[-:]+$/.test(c))) {
          // 分隔行
          inTable = true;
          continue;
        }
        if (!inTable) {
          tableHeader = cells;
          continue;
        }
        // 表格数据行
        if (inTable && cells.length >= 2) {
          const itemCol = cells[0];
          const statusCol = cells[1];
          const noteCol = cells[2] || '';

          let normalizedStatus = 'in_progress';
          if (statusCol.includes('✅') || /已实现|Done|Wired/i.test(statusCol)) {
            normalizedStatus = 'verified';
          } else if (statusCol.includes('❌') || /未实现|Unwired/i.test(statusCol)) {
            normalizedStatus = 'unwired';
          } else if (statusCol.includes('⚠️') || /未固化|进行中|In\s*Progress/i.test(statusCol)) {
            normalizedStatus = 'in_progress';
          }

          implementationItems.push({
            name: itemCol,
            rawStatus: statusCol,
            status: normalizedStatus,
            note: noteCol,
          });
        }
      }
    }

    // 解析 Invariants 节的不变量标识 (如 H-1, H-2, Gate1, D3, INV-01)
    if (/Invariants?/i.test(currentSection) || /不可变量/i.test(currentSection)) {
      // 常见形式：
      // - **H-1**: 零唤醒...
      // 1. H-1 (零唤醒...)
      // - H-1: ...
      // - Gate1: ...
      const invMatch = trimmed.match(/^[-*\d.]+\s*(?:\*\*)?([A-Za-z0-9_-]+)(?:\*\*)?\s*[:：(（]\s*(.*)$/);
      if (invMatch) {
        const localId = invMatch[1].trim();
        const desc = invMatch[2].replace(/[)）]$/, '').trim();
        // 过滤普通英文词汇，只接纳典型不变量 ID 格式：H-1, H-2, Gate1, D3, INV-xx, 类似命名
        if (/^(?:[A-Z]-\d+|Gate\d+|[A-Z]\d+|INV-[A-Za-z0-9_-]+)$/i.test(localId)) {
          const canonicalId = `${adrId}:${localId}`;
          invariants.push({
            localId,
            canonicalId,
            description: desc,
            line: i + 1,
          });
        }
      }
    }
  }

  return {
    filePath,
    adrId,
    title,
    status,
    isFrozen,
    hasImplementationStatus,
    implementationItems,
    hasInvariantsSection,
    invariants,
  };
}

/**
 * 解析文件路径下的 ADR
 */
export function parseAdrFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return parseAdrContent(content, filePath);
}
