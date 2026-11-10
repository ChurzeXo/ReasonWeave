/**
 * Safe Pruner / Cleaner (安全修剪清理器)
 *
 * 遵循「只读演练（Dry-Run by Default）」与「精确 Diff 生成」原则：
 * 1. 默认仅生成 patch / diff 预览，绝对零污染磁盘；
 * 2. 仅对 CONFIRMED_ORPHAN 执行清理；
 * 3. 支持整文件级孤儿资产删除与代码符号级精确剪枝。
 */

import fs from 'node:fs';
import path from 'node:path';

export class Cleaner {
  /**
   * @param {object} [options]
   * @param {string} [options.repoDir=process.cwd()]
   * @param {boolean} [options.dryRun=true]
   */
  constructor(options = {}) {
    this.repoDir = path.resolve(options.repoDir || process.cwd());
    this.dryRun = options.dryRun !== false; // 默认开启 dry-run
  }

  /**
   * 为整文件孤儿生成 patch diff
   * @param {string} relPath
   * @returns {string}
   */
  _generateFileDeletionDiff(relPath) {
    return [
      `diff --git a/${relPath} b/${relPath}`,
      `deleted file mode 100644`,
      `--- a/${relPath}`,
      `+++ /dev/null`,
      `@@ -1 +0,0 @@`,
      `-<binary/text content deleted>`,
    ].join('\n');
  }

  /**
   * 为代码符号级孤儿生成行级删除 diff
   * @param {string} relPath
   * @param {string} symbolName
   * @param {number} [lineNo=1]
   * @param {boolean} [apply=false]
   * @returns {{ diff: string, removedLines: number }}
   */
  _generateSymbolPruneDiff(relPath, symbolName, lineNo = 1, apply = false) {
    const absPath = path.join(this.repoDir, relPath);
    if (!fs.existsSync(absPath)) return { diff: '', removedLines: 0 };

    const content = fs.readFileSync(absPath, 'utf8');
    const lines = content.split(/\r?\n/);

    // 找到定义起始行
    let startIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(symbolName) && (
        lines[i].match(new RegExp(`(?:def|class|export|const|let|var|function)\\s+${symbolName}\\b`)) ||
        lines[i].match(new RegExp(`\\b${symbolName}\\s*[:=]`))
      )) {
        startIdx = i;
        break;
      }
    }

    if (startIdx === -1) return { diff: '', removedLines: 0 };

    // 寻找缩进或花括号界限估算函数/类体结束
    let endIdx = startIdx;
    const baseIndent = lines[startIdx].match(/^\s*/)[0].length;

    // 探测块结束
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const currentIndent = line.match(/^\s*/)[0].length;
      if (currentIndent <= baseIndent && !line.trim().startsWith('}') && !line.trim().startsWith(')')) {
        break;
      }
      endIdx = i;
      if (line.trim() === '}' && currentIndent === baseIndent) break;
    }

    const removedHunk = lines.slice(startIdx, endIdx + 1);
    const diffLines = [
      `diff --git a/${relPath} b/${relPath}`,
      `--- a/${relPath}`,
      `+++ b/${relPath}`,
      `@@ -${startIdx + 1},${removedHunk.length} +${startIdx + 1},0 @@`,
      ...removedHunk.map(l => `-${l}`),
    ];

    if (apply && !this.dryRun) {
      lines.splice(startIdx, removedHunk.length);
      fs.writeFileSync(absPath, lines.join('\n'), 'utf8');
    }

    return {
      diff: diffLines.join('\n'),
      removedLines: removedHunk.length,
    };
  }

  /**
   * 执行安全清理演练或应用
   * @param {Array<any>} candidates 候选孤儿列表 (candidates.json)
   * @returns {{
   *   dryRun: boolean,
   *   totalCandidates: number,
   *   cleanedCount: number,
   *   patches: Array<{ path: string, type: string, diff: string }>,
   *   unifiedDiff: string
   * }}
   */
  clean(candidates) {
    const confirmed = (candidates || []).filter(c => c.status === 'CONFIRMED_ORPHAN');
    const patches = [];
    let cleanedCount = 0;

    for (const item of confirmed) {
      const relPath = item.path;
      const absPath = path.join(this.repoDir, relPath);

      // 1. 整文件资产孤儿 (asset_resource / asset_resource_family)
      if (item.type === 'asset_resource' || item.type === 'asset_resource_family') {
        const pathsToDelete = item.qualifier_paths || [relPath];
        for (const p of pathsToDelete) {
          const diff = this._generateFileDeletionDiff(p);
          patches.push({
            path: p,
            type: 'file_deletion',
            diff,
          });
          cleanedCount++;
          if (!this.dryRun) {
            const abs = path.join(this.repoDir, p);
            if (fs.existsSync(abs)) fs.unlinkSync(abs);
          }
        }
        continue;
      }

      // 2. 代码符号孤儿 (function / class / export_*)
      const pruneResult = this._generateSymbolPruneDiff(relPath, item.name, item.line_no || 1, !this.dryRun);
      if (pruneResult.diff) {
        patches.push({
          path: relPath,
          type: 'symbol_prune',
          diff: pruneResult.diff,
        });
        cleanedCount++;
      }
    }

    const unifiedDiff = patches.map(p => p.diff).join('\n\n');

    return {
      dryRun: this.dryRun,
      totalCandidates: confirmed.length,
      cleanedCount,
      patches,
      unifiedDiff,
    };
  }
}
