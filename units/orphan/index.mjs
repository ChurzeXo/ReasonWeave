/**
 * Lab Agent Engineering Toolkit - Orphan Unit
 *
 * 导出符号引用分类器与生产调用者判定接口
 */

import fs from 'node:fs';
import path from 'node:path';
import { InvertedIndex } from './core/inverted-index.mjs';
import { Classifier, ReferenceKind, CallerKind, isTestPath } from './core/classifier.mjs';
import { Solver } from './core/solver.mjs';
import { BlobReader } from './core/blob-reader.mjs';

export {
  InvertedIndex,
  Classifier,
  ReferenceKind,
  CallerKind,
  isTestPath,
  Solver,
  BlobReader,
};

/**
 * 快速判定或统计某个符号在项目中的生产调用者分布
 * @param {string} symbolName 待检查的符号名
 * @param {object} [options]
 * @param {string} [options.repoRoot=process.cwd()] 仓库根目录
 * @param {InvertedIndex} [options.index] 可复用的倒排索引实例
 * @param {Map<string, string>} [options.filesMap] 可注入的内存文件映射
 * @param {Array<string>} [options.excludePaths=[]] 排除的文件路径
 * @returns {{
 *   symbolName: string,
 *   wiringStatus: 'wired' | 'test_only' | 'unwired',
 *   productionCallerCount: number,
 *   testCallerCount: number,
 *   docReferenceCount: number,
 *   productionCallers: Array<{ path: string, lineNo: number, lineText: string }>,
 *   testCallers: Array<{ path: string, lineNo: number, lineText: string }>,
 *   docReferences: Array<{ path: string, lineNo: number, lineText: string }>,
 *   isWiredInProduction: boolean,
 *   isTestOnly: boolean,
 *   isCompletelyOrphan: boolean,
 * }}
 */
export function countProductionCallers(symbolName, options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  let index = options.index;

  if (!index) {
    index = new InvertedIndex();
    if (options.filesMap) {
      index.indexAll(options.filesMap);
    } else {
      const ignoreDirs = new Set(['.git', 'node_modules', 'dist', 'build', '.worktrees', '.venv', 'venv']);
      function walk(dir) {
        let entries;
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (!ignoreDirs.has(entry.name)) {
              walk(path.join(dir, entry.name));
            }
          } else if (entry.isFile()) {
            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(repoRoot, fullPath);
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              index.indexFile(relPath, content);
            } catch {
              // ignore
            }
          }
        }
      }
      walk(repoRoot);
    }
  }

  // 使用倒排索引精准检索符号命中的行
  const hits = index.lookup(symbolName) || [];

  // 严格调用过滤：确保行内确实出现 symbolName(...) 或引用
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const callRegex = new RegExp(`(?<=^|[^a-zA-Z0-9_])${escaped}\\s*(?:\\(|$)`, 'g');

  const filteredHits = hits.filter((h) => {
    callRegex.lastIndex = 0;
    return callRegex.test(h.lineText);
  });

  const evaluation = Classifier.evaluateCallers(filteredHits, {
    excludePaths: options.excludePaths || [],
    symbolName,
  });

  return {
    symbolName,
    ...evaluation,
  };
}
