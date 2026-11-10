/**
 * scanner.mjs
 *
 * 源码多语言规约与断言扫描器：
 * 1. 扫描 @Invariant 注解与注释，提取 Invariant ID（严格边界正则，防 H-1 误伤 H-10）
 * 2. 扫描 @ContractOnly 契约沙箱标记（保护未接线原型）
 * 3. 区分生产与测试环境（No-Cheat Rule：测试调用严禁计入生产接线）
 * 4. 启发式空壳接线探针（对 void/Unit 副作用函数输出 WARN 级审计，不硬阻断）
 */

import fs from 'node:fs';
import path from 'node:path';
import { makeStrictBoundaryRegex } from './adr-parser.mjs';

const TEST_PATH_PATTERNS = [
  /(?:^|[\\/])(?:src[\\/])?test(?:s)?[\\/]/i,
  /(?:^|[\\/])androidTest[\\/]/i,
  /__tests__[\\/]/i,
  /_test\.go$/i,
  /\.(?:test|spec)\.[jt]sx?$/i,
  /^test_.*\.py$/i,
  /.*_test\.py$/i,
];

/**
 * 判断是否为测试文件
 */
export function isTestPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return TEST_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * 正则匹配多语言 Invariant 声明
 */
const INVARIANT_PATTERNS = [
  // Kotlin/Java/TS: @Invariant("ADR-060:H-1") or @Invariant(id = "ADR-060:H-1")
  /@Invariant\s*\(\s*(?:id\s*=\s*)?["']([^"']+)["']/g,
  // JUnit5 @Tag("INV:ADR-060:H-1")
  /@Tag\s*\(\s*["']INV:([^"']+)["']/g,
  // Python: @pytest.mark.invariant("ADR-060:H-1") or @invariant("ADR-060:H-1")
  /@(?:pytest\.mark\.)?invariant\s*\(\s*["']([^"']+)["']/g,
  // Comment forms across Go, Python, TS, Rust:
  // // Invariant: ADR-060:H-1
  // # Invariant: ADR-060:H-1
  // // [INVARIANT: ADR-060:H-1]
  // # [INVARIANT: ADR-060:H-1]
  // // @invariant ADR-060:H-1
  /(?:\/\/|#)\s*(?:@invariant(?:\s+|:\s*)|\[INVARIANT:\s*|Invariant:\s*)([A-Za-z0-9_:-]+)/gi,
  // Rust: #[doc = "invariant: ADR-060:H-1"]
  /#\[doc\s*=\s*["'].*?invariant:\s*([A-Za-z0-9_:-]+).*?["']\]/gi,
];

/**
 * 正则匹配多语言 ContractOnly 声明
 */
const CONTRACT_ONLY_PATTERNS = [
  // Kotlin: @ContractOnly(adr = "ADR-060", expire = "2026-12-01", reason = "...")
  /@ContractOnly\s*\(([^)]*)\)/g,
  // Python: @contract_only(adr="ADR-060", ...)
  /@contract_only\s*\(([^)]*)\)/g,
  // Comments: // [CONTRACT-ONLY: ADR-060, expire: 2026-12-01]
  /(?:\/\/|#)\s*\[CONTRACT-ONLY:\s*([^\]]+)\]/gi,
  // TS: /** @contractOnly ADR-060 ... */
  /@contractOnly\s+([^\n*]+)/gi,
];

/**
 * 扫描单个文件的内容
 */
export function scanFileContent(content, relativePath) {
  const isTest = isTestPath(relativePath);
  const invariants = [];
  const contracts = [];
  const lines = content.split('\n');

  // 1. 扫描 Invariant
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    for (const pattern of INVARIANT_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const rawId = match[1].trim();
        // 严格检验 ID 格式 (e.g. ADR-060:H-1 or H-1 or Gate1)
        if (/^[A-Za-z0-9_:-]+$/.test(rawId)) {
          invariants.push({
            id: rawId,
            file: relativePath,
            line: lineIdx + 1,
            isTest,
            lineContent: line.trim(),
          });
        }
      }
    }

    // 2. 扫描 ContractOnly
    for (const pattern of CONTRACT_ONLY_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const payload = match[1].trim();
        let adr = '';
        let expire = '';
        let reason = '';

        const adrMatch = payload.match(/(?:adr\s*=\s*["']?|ADR-)([^"',\s)]+)/i);
        if (adrMatch) {
          adr = adrMatch[0].includes('ADR-') ? (adrMatch[1].startsWith('ADR-') ? adrMatch[1] : 'ADR-' + adrMatch[1]) : adrMatch[1];
        }

        const expireMatch = payload.match(/expire(?:After)?\s*[:=]\s*["']?(\d{4}-\d{2}-\d{2})["']?/i);
        if (expireMatch) {
          expire = expireMatch[1];
        }

        contracts.push({
          adr: adr || 'ADR-UNKNOWN',
          expire,
          reason,
          file: relativePath,
          line: lineIdx + 1,
          isTest,
          lineContent: line.trim(),
        });
      }
    }
  }

  return {
    relativePath,
    isTest,
    invariants,
    contracts,
  };
}

/**
 * 递归扫描项目代码库
 */
export function scanRepository(repoRoot, options = {}) {
  const ignoreDirs = new Set([
    '.git',
    'node_modules',
    'dist',
    'build',
    '.worktrees',
    '.workbuddy',
    '.idea',
    '.vscode',
    'coverage',
    '.codegraph',
  ]);

  const targetExtensions = new Set([
    '.kt',
    '.java',
    '.py',
    '.go',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.rs',
  ]);

  const foundInvariants = [];
  const foundContracts = [];
  const scannedFiles = [];

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name)) {
          walk(path.join(currentDir, entry.name));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (targetExtensions.has(ext)) {
          const fullPath = path.join(currentDir, entry.name);
          const relPath = path.relative(repoRoot, fullPath);
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const fileResult = scanFileContent(content, relPath);
            scannedFiles.push(relPath);
            foundInvariants.push(...fileResult.invariants);
            foundContracts.push(...fileResult.contracts);
          } catch {
            // ignore read error
          }
        }
      }
    }
  }

  walk(repoRoot);

  return {
    repoRoot,
    scannedFiles,
    scannedFilesCount: scannedFiles.length,
    invariants: foundInvariants,
    contracts: foundContracts,
  };
}

/**
 * 检索符号调用点并执行防伪 / 空壳接线启发式分析
 *
 * @param {string} symbolName 待检查的生产函数/符号名（如 "shouldTriggerScheduledCheck"）
 * @param {string} repoRoot 仓库根目录
 */
export function analyzeSymbolWiring(symbolName, repoRoot) {
  const scanRes = scanRepository(repoRoot);
  const escapedSymbol = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 严格调用匹配正则: symbol(...)
  const callRegex = new RegExp(`(?<=^|[^a-zA-Z0-9_])${escapedSymbol}\\s*\\(`, 'g');
  // 严格声明行匹配正则: fun symbol / def symbol / val symbol = / let symbol =
  const declRegex = new RegExp(`(?:fun|def|func|function|fn)\\s+(?:[A-Za-z0-9_.]+\\.)?${escapedSymbol}\\b|(?:val|var|const|let)\\s+${escapedSymbol}\\s*[:=]`);

  const prodCallers = [];
  const testCallers = [];
  const warnings = [];

  for (const relFile of scanRes.scannedFiles) {
    const fullPath = path.join(repoRoot, relFile);
    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const isTest = isTestPath(relFile);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 排除符号本身的声明行
      if (declRegex.test(line)) {
        continue;
      }

      callRegex.lastIndex = 0;
      if (callRegex.test(line)) {
        const callsite = {
          file: relFile,
          line: i + 1,
          content: line.trim(),
          isTest,
        };

        if (isTest) {
          testCallers.push(callsite);
        } else {
          prodCallers.push(callsite);

          // 启发式空壳接线探针（针对副作用函数）：
          // 若调用语句为独立行（纯单行无前置条件或赋值），输出 WARN 级提示，不硬报错
          const trimmed = line.trim();
          if (trimmed.startsWith(symbolName) || trimmed.startsWith('this.' + symbolName)) {
            warnings.push({
              level: 'WARN',
              type: 'SUSPICIOUS_UNCHECKED_CALL',
              message: `符号 ${symbolName} 在 ${relFile}:${i + 1} 作为独立语句调用，请确认是否具备业务前置互锁（如温控/Idle）判断。`,
              callsite,
            });
          }
        }
      }
    }
  }

  // 判定接线状态（No-Cheat Rule：测试调用一律不计入生产可达性）
  let wiringStatus = 'unwired';
  if (prodCallers.length > 0) {
    wiringStatus = 'wired';
  } else if (testCallers.length > 0) {
    wiringStatus = 'test_only';
  }

  return {
    symbolName,
    wiringStatus,
    prodCallers,
    testCallers,
    warnings,
  };
}
