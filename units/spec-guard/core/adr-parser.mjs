/**
 * adr-parser.mjs
 *
 * 负责健壮解析 ADR 架构规约文件：
 * 1. 状态行（Status）与 🔒Frozen 检查（支持 frontmatter id / status 及自定义 frozen_states 映射）
 * 2. ## Implementation Status 落地状态节与表格抽取（支持节标题别名如 ## 验证）
 * 3. ## Invariants 不变量抽取，实行严格的边界正则匹配（防 H-1 误伤 H-10 / H-1-OBSOLETE）
 * 4. 支持项目侧配置 adr_dirs, adr_id_pattern, section_aliases
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
 * 极简 YAML 提取器（提取 invariants, adr_dirs, adr_id_pattern, frozen_states, section_aliases）
 */
export function parseSimpleYamlOverlay(yamlContent) {
  const config = {
    version: '1.0',
    adr_dirs: [],
    adr_id_pattern: '',
    frozen_states: [],
    section_aliases: {
      decision: [],
      implementation: [],
      invariants: [],
    },
    invariants: [],
  };

  const lines = yamlContent.split('\n');
  let currentSection = '';
  let currentSubSection = '';
  let currentInv = null;
  let inSymbols = false;

  for (const line of lines) {
    const rawLine = line.replace(/#.*$/, '');
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Top-level key
    const topMatch = rawLine.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (topMatch && !rawLine.startsWith(' ') && !rawLine.startsWith('\t')) {
      const key = topMatch[1].trim();
      const val = topMatch[2].trim();
      currentSection = key;
      currentSubSection = '';
      inSymbols = false;
      if (currentInv) {
        config.invariants.push(currentInv);
        currentInv = null;
      }

      if (key === 'version') {
        config.version = val.replace(/["']/g, '');
      } else if (key === 'adr_id_pattern') {
        config.adr_id_pattern = val.replace(/^["']|["']$/g, '').replace(/\\\\/g, '\\');
      }
      continue;
    }

    // Sub-keys under section_aliases
    if (currentSection === 'section_aliases') {
      const subMatch = rawLine.match(/^\s{1,4}([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (subMatch) {
        currentSubSection = subMatch[1].trim();
        continue;
      }
      if (currentSubSection && trimmed.startsWith('-')) {
        const itemVal = trimmed.replace(/^-\s*/, '').replace(/^["']|["']$/g, '').trim();
        if (!config.section_aliases[currentSubSection]) {
          config.section_aliases[currentSubSection] = [];
        }
        config.section_aliases[currentSubSection].push(itemVal);
        continue;
      }
    }

    // List items under adr_dirs
    if (currentSection === 'adr_dirs' && trimmed.startsWith('-')) {
      const dirVal = trimmed.replace(/^-\s*/, '').replace(/^["']|["']$/g, '').trim();
      config.adr_dirs.push(dirVal);
      continue;
    }

    // List items under frozen_states
    if (currentSection === 'frozen_states' && trimmed.startsWith('-')) {
      const stateVal = trimmed.replace(/^-\s*/, '').replace(/^["']|["']$/g, '').trim();
      config.frozen_states.push(stateVal);
      continue;
    }

    // Flat section aliases
    if (currentSection === 'decision_section_aliases' && trimmed.startsWith('-')) {
      config.section_aliases.decision.push(trimmed.replace(/^-\s*/, '').replace(/^["']|["']$/g, '').trim());
      continue;
    }
    if (currentSection === 'implementation_section_aliases' && trimmed.startsWith('-')) {
      config.section_aliases.implementation.push(trimmed.replace(/^-\s*/, '').replace(/^["']|["']$/g, '').trim());
      continue;
    }
    if (currentSection === 'invariants_section_aliases' && trimmed.startsWith('-')) {
      config.section_aliases.invariants.push(trimmed.replace(/^-\s*/, '').replace(/^["']|["']$/g, '').trim());
      continue;
    }

    // Invariants list parsing (preserves existing logic)
    if (currentSection === 'invariants') {
      if (trimmed.startsWith('- id:')) {
        if (currentInv) config.invariants.push(currentInv);
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
            if (rawSym.includes('#')) rawSym = rawSym.split('#')[1];
            currentInv.productionSymbols.push(rawSym);
          }
        }
      }
    }
  }

  if (currentInv) {
    config.invariants.push(currentInv);
  }

  return config;
}

/**
 * 读取可选的 spec-matrix.overlay.yml 文件
 */
export function loadOverlayConfig(repoRoot, customPath = '') {
  const candidatePaths = [
    customPath ? (path.isAbsolute(customPath) ? customPath : path.resolve(repoRoot, customPath)) : '',
    path.join(repoRoot, 'spec-matrix.overlay.yml'),
    path.join(repoRoot, 'spec-matrix.yml'),
    path.join(repoRoot, '.spec-matrix.yml'),
  ].filter(Boolean);

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        return parseSimpleYamlOverlay(content);
      } catch (err) {
        // ignore overlay parse failure
      }
    }
  }
  return {
    version: '1.0',
    adr_dirs: [],
    adr_id_pattern: '',
    frozen_states: [],
    section_aliases: { decision: [], implementation: [], invariants: [] },
    invariants: [],
  };
}

/**
 * 递归根据文件路径寻找工程根目录（包含 spec-matrix / .handoffs / .git 等）
 */
export function findRepoRootFromPath(startPath) {
  let curr = path.resolve(startPath);
  if (fs.existsSync(curr) && fs.statSync(curr).isFile()) {
    curr = path.dirname(curr);
  }
  while (curr && curr !== path.dirname(curr)) {
    if (
      fs.existsSync(path.join(curr, 'spec-matrix.overlay.yml')) ||
      fs.existsSync(path.join(curr, 'spec-matrix.yml')) ||
      fs.existsSync(path.join(curr, '.handoffs')) ||
      fs.existsSync(path.join(curr, '.git')) ||
      fs.existsSync(path.join(curr, 'package.json'))
    ) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return null;
}

/**
 * 查找可能包含 ADR 的目录与文件（支持项目侧配置与缺省四目录回退）
 */
export function findAdrFiles(repoRoot, options = {}) {
  let config = options;
  if (!config || (!config.adr_dirs && !config.adrDirs && !config.adr_id_pattern && !config.adrIdPattern)) {
    const loaded = loadOverlayConfig(repoRoot, options.overlayPath || options.overlay || '');
    config = { ...loaded, ...options };
  }

  const configuredDirs = (config.adr_dirs && config.adr_dirs.length > 0)
    ? config.adr_dirs
    : ((config.adrDirs && config.adrDirs.length > 0) ? config.adrDirs : null);

  const candidateDirs = configuredDirs
    ? configuredDirs.map((d) => path.resolve(repoRoot, d))
    : [
        path.join(repoRoot, 'group', 'architecture', 'adr'),
        path.join(repoRoot, 'docs', 'adr'),
        path.join(repoRoot, 'adr'),
        path.join(repoRoot, 'docs', 'proposals'),
      ];

  const idPattern = config.adr_id_pattern || config.adrIdPattern || null;
  const customIdRegex = idPattern ? new RegExp(idPattern, 'i') : null;

  const results = [];
  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
            let matched = false;
            if (customIdRegex) {
              matched = customIdRegex.test(entry.name);
            } else {
              matched = /ADR-\d+/i.test(entry.name) || /^\d{4}-/i.test(entry.name);
            }
            if (matched) {
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
export function parseAdrContent(content, filePath = '', options = {}) {
  let config = options;
  if (!config || Object.keys(config).length === 0) {
    if (filePath) {
      const root = findRepoRootFromPath(filePath);
      if (root) config = loadOverlayConfig(root);
    }
  }
  config = config || {};

  const lines = content.split('\n');

  // 1. 抽取 frontmatter
  let frontmatter = null;
  const fmM = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (fmM) {
    frontmatter = {};
    for (const l of fmM[1].split(/\r?\n/)) {
      const idx = l.indexOf(':');
      if (idx !== -1) {
        const k = l.slice(0, idx).trim();
        let v = l.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        frontmatter[k] = v;
      }
    }
  }

  // 2. 抽取 ADR 编号与标题
  let adrId = '';
  let title = '';

  const idPattern = config.adr_id_pattern || config.adrIdPattern || null;
  const idRegex = idPattern ? new RegExp(idPattern, 'i') : /(ADR-\d+)/i;

  if (frontmatter && frontmatter.id) {
    adrId = frontmatter.id.trim().toUpperCase();
  }

  const filename = filePath ? path.basename(filePath) : '';
  if (!adrId && filename) {
    const fileMatch = filename.match(idRegex);
    if (fileMatch) {
      adrId = (fileMatch[1] || fileMatch[0]).toUpperCase();
    }
  }

  let status = (frontmatter && frontmatter.status) ? frontmatter.status : 'Unknown';
  let isFrozen = false;

  const frozenStates = config.frozen_states || config.frozenStates || [];

  if (frontmatter && frontmatter.status) {
    const s = frontmatter.status.trim();
    if (frozenStates.length > 0) {
      isFrozen = frozenStates.some((fs) => fs.toLowerCase() === s.toLowerCase() || (fs === '🔒' && s.includes('🔒')));
    } else {
      isFrozen = s.includes('🔒') || /\bfrozen\b/i.test(s);
    }
  }

  // 扫描前 35 行获取标题和状态
  for (let i = 0; i < Math.min(lines.length, 35); i++) {
    const line = lines[i].trim();
    if (!title && line.startsWith('# ')) {
      title = line.replace(/^#\s*/, '').trim();
      if (!adrId) {
        const idMatch = title.match(idRegex);
        if (idMatch) adrId = (idMatch[1] || idMatch[0]).toUpperCase();
      }
    }
    // 匹配状态行，如: - **状态（Status）**：Proposed / 🔒 Frozen
    if (!frontmatter || !frontmatter.status) {
      if (/^\s*[-*]?\s*\**状态.*?\**\s*[:：]/i.test(line) || /^\s*[-*]?\s*\**Status\**\s*[:：]/i.test(line)) {
        status = line.replace(/^.*?[:：]\s*/, '').trim();
        if (frozenStates.length > 0) {
          isFrozen = frozenStates.some((fs) => fs.toLowerCase() === status.toLowerCase() || (fs === '🔒' && status.includes('🔒')));
        } else {
          if (status.includes('🔒') || /Frozen/i.test(status)) {
            isFrozen = true;
          }
        }
      }
    }
  }

  if (!adrId) {
    adrId = 'ADR-UNKNOWN';
  }

  // 3. 节标题别名匹配
  const secAliases = config.section_aliases || config.sectionAliases || {};
  const implAliases = [
    'Implementation\\s+Status',
    '落地情况',
    ...(secAliases.implementation || config.implementation_section_aliases || ['验证']),
  ];
  const invAliases = [
    'Invariants?',
    '不可变量',
    ...(secAliases.invariants || config.invariants_section_aliases || ['不变量']),
  ];

  const implRegex = new RegExp(implAliases.join('|'), 'i');
  const invRegex = new RegExp(invAliases.join('|'), 'i');

  let hasImplementationStatus = false;
  let implementationItems = [];

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

      if (implRegex.test(currentSection)) {
        hasImplementationStatus = true;
      }
      if (invRegex.test(currentSection)) {
        hasInvariantsSection = true;
      }
      continue;
    }

    // 解析 Implementation Status 节的表格
    if (implRegex.test(currentSection)) {
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
    if (invRegex.test(currentSection)) {
      const invMatch = trimmed.match(/^[-*\d.]+\s*(?:\*\*)?([A-Za-z0-9_-]+)(?:\*\*)?\s*[:：(（]\s*(.*)$/);
      if (invMatch) {
        const localId = invMatch[1].trim();
        const desc = invMatch[2].replace(/[)）]$/, '').trim();
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
export function parseAdrFile(filePath, options = {}) {
  const content = fs.readFileSync(filePath, 'utf8');
  return parseAdrContent(content, filePath, options);
}
