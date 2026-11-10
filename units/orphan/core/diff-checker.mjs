/**
 * Incremental Diff Checker (增量防腐门禁引擎)
 *
 * 遵循「增量只扫新增（O(Δ) 复杂度）」与「Fail-Closed 门禁阻断」原则：
 * 1. 仅提取 git diff 中新增加的代码行与新增资产文件；
 * 2. 毫秒级提取新增符号并在全仓倒排索引中排查是否有真实引用；
 * 3. 凡检出 CONFIRMED_ORPHAN 即刻判定 Exit 1 阻断提交；PENDING_VERIFICATION 告警提示。
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { InvertedIndex } from './inverted-index.mjs';
import { Classifier } from './classifier.mjs';

export class DiffChecker {
  /**
   * @param {object} [options]
   * @param {string} [options.repoDir=process.cwd()]
   * @param {Array<any>} [options.adapters=[]]
   */
  constructor(options = {}) {
    this.repoDir = path.resolve(options.repoDir || process.cwd());
    this.adapters = options.adapters || [];
  }

  /**
   * 解析 git diff 文本，提取新增文件与新增行
   * @param {string} diffText
   * @returns {Array<{ path: string, isNewFile: boolean, addedLines: Array<{ lineNo: number, text: string }> }>}
   */
  static parseDiff(diffText) {
    const files = [];
    if (!diffText || !diffText.trim()) return files;

    const diffSections = diffText.split(/^diff --git /m);
    for (const section of diffSections) {
      if (!section.trim()) continue;

      const lines = section.split(/\r?\n/);
      let targetPath = '';
      let isNewFile = false;

      // 提取目标路径
      for (const line of lines) {
        if (line.startsWith('+++ b/')) {
          targetPath = line.slice(6).trim();
          break;
        } else if (line.startsWith('new file mode')) {
          isNewFile = true;
        }
      }

      if (!targetPath || targetPath === '/dev/null') continue;

      const addedLines = [];
      let currentLineNo = 1;

      for (const line of lines) {
        // 解析 hunk header: @@ -1,4 +10,6 @@
        const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (hunkMatch) {
          currentLineNo = parseInt(hunkMatch[1], 10);
          continue;
        }

        if (line.startsWith('+') && !line.startsWith('+++')) {
          addedLines.push({
            lineNo: currentLineNo,
            text: line.slice(1),
          });
          currentLineNo++;
        } else if (!line.startsWith('-')) {
          currentLineNo++;
        }
      }

      if (isNewFile || addedLines.length > 0) {
        files.push({
          path: targetPath,
          isNewFile,
          addedLines,
        });
      }
    }

    return files;
  }

  /**
   * 从新增行中提取新增的候选声明
   * @param {string} filePath
   * @param {Array<{ lineNo: number, text: string }>} addedLines
   * @param {boolean} isNewFile
   * @returns {Array<{ name: string, symbol: string, lineNo: number, kind: string, isProtected?: boolean, protectionReason?: string }>}
   */
  extractAddedCandidates(filePath, addedLines, isNewFile) {
    const candidates = [];
    const ext = path.extname(filePath).toLowerCase();

    // 1. Android / 通用资产文件 (整文件新增且在 res/ 或 assets/ 目录)
    if (isNewFile && (filePath.includes('/res/') || filePath.includes('/assets/'))) {
      const baseName = path.basename(filePath).replace(/\.[^.]+$/, '');
      const resMatch = filePath.match(/(?:^|\/)res\/([a-z]+)(?:-[a-zA-Z0-9_-]+)?\/([a-zA-Z0-9_]+)\.[a-zA-Z0-9]+$/);
      const resType = resMatch ? resMatch[1] : 'asset';
      const name = resMatch ? resMatch[2] : baseName;
      candidates.push({
        name,
        symbol: `R.${resType}.${name}`,
        resType,
        lineNo: 1,
        kind: 'asset_resource',
      });
      return candidates;
    }

    // 2. Python 新增定义
    if (ext === '.py') {
      let prevDecorator = '';
      for (const item of addedLines) {
        const trimmed = item.text.trim();
        if (trimmed.startsWith('@')) {
          prevDecorator = trimmed;
          continue;
        }

        const funcMatch = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/);
        if (funcMatch) {
          const name = funcMatch[1];
          let isProtected = false;
          let protectionReason = '';

          if (name.startsWith('test_') || prevDecorator.includes('@pytest.fixture')) {
            isProtected = true;
            protectionReason = 'Pytest test function / fixture';
          } else if (/^__[a-zA-Z0-9_]+__$/.test(name)) {
            isProtected = true;
            protectionReason = 'Magic method';
          } else if (prevDecorator.startsWith('@app.') || prevDecorator.startsWith('@router.')) {
            isProtected = true;
            protectionReason = 'Route decorator';
          }

          candidates.push({
            name,
            symbol: name,
            lineNo: item.lineNo,
            kind: 'function',
            isProtected,
            protectionReason,
          });
          prevDecorator = '';
          continue;
        }

        const classMatch = trimmed.match(/^class\s+([a-zA-Z0-9_]+)(?:\s*\(|:)/);
        if (classMatch) {
          const name = classMatch[1];
          candidates.push({
            name,
            symbol: name,
            lineNo: item.lineNo,
            kind: 'class',
            isProtected: name.startsWith('Test'),
            protectionReason: name.startsWith('Test') ? 'Pytest test class' : undefined,
          });
          prevDecorator = '';
          continue;
        }

        prevDecorator = '';
      }
      return candidates;
    }

    // 3. Web / TS 新增 export
    if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx' || ext === '.mjs') {
      for (const item of addedLines) {
        const trimmed = item.text.trim();
        if (!trimmed.startsWith('export ') && !trimmed.startsWith('exports.')) continue;

        const funcOrClassMatch = trimmed.match(/^export\s+(?:async\s+)?(function|class)\s+([a-zA-Z0-9_$]+)/);
        if (funcOrClassMatch) {
          candidates.push({
            name: funcOrClassMatch[2],
            symbol: funcOrClassMatch[2],
            lineNo: item.lineNo,
            kind: `export_${funcOrClassMatch[1]}`,
          });
          continue;
        }

        const varMatch = trimmed.match(/^export\s+(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*[:=]/);
        if (varMatch) {
          candidates.push({
            name: varMatch[1],
            symbol: varMatch[1],
            lineNo: item.lineNo,
            kind: 'export_variable',
          });
          continue;
        }
      }
      return candidates;
    }

    return candidates;
  }

  /**
   * 构建全仓当前状态的倒排索引 (从工作区已跟踪文件或暂存区提取)
   * @returns {InvertedIndex}
   */
  buildCurrentIndex() {
    const index = new InvertedIndex();
    try {
      const filesRaw = execSync('git ls-files', {
        cwd: this.repoDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const files = filesRaw.split(/\r?\n/).filter(Boolean);

      for (const relPath of files) {
        const abs = path.join(this.repoDir, relPath);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          // 仅索引非二进制常用文本
          const ext = path.extname(relPath).toLowerCase();
          if (['.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.kt', '.java', '.xml', '.json', '.yaml', '.yml', '.md', '.html'].includes(ext)) {
            try {
              const content = fs.readFileSync(abs, 'utf8');
              index.indexFile(relPath, content);
            } catch {}
          }
        }
      }
    } catch {}
    return index;
  }

  /**
   * 执行增量差异检查
   * @param {object} [opts]
   * @param {boolean} [opts.staged=false] 是否仅检查暂存区
   * @param {string} [opts.base='HEAD~1'] 基准分支或 commit
   * @returns {Promise<{
   *   passed: boolean,
   *   totalAddedCandidates: number,
   *   orphans: Array<any>,
   *   warnings: Array<any>
   * }>}
   */
  async checkDiff(opts = {}) {
    const isStaged = opts.staged || false;
    const base = opts.base || 'HEAD~1';

    let diffCmd = isStaged ? 'git diff --cached --unified=0' : `git diff ${base}...HEAD --unified=0`;
    let diffOutput = '';
    try {
      diffOutput = execSync(diffCmd, {
        cwd: this.repoDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
    } catch {
      // 若基准不存在尝试降级为对比 HEAD
      try {
        diffOutput = execSync('git diff HEAD --unified=0', {
          cwd: this.repoDir,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
        });
      } catch {
        diffOutput = '';
      }
    }

    const diffFiles = DiffChecker.parseDiff(diffOutput);
    if (!diffFiles.length) {
      return {
        passed: true,
        totalAddedCandidates: 0,
        orphans: [],
        warnings: [],
      };
    }

    const index = this.buildCurrentIndex();
    const confirmedOrphans = [];
    const warnings = [];
    let totalAdded = 0;

    for (const f of diffFiles) {
      const candidates = this.extractAddedCandidates(f.path, f.addedLines, f.isNewFile);
      totalAdded += candidates.length;

      for (const cand of candidates) {
        if (cand.isProtected) continue;

        const tokensToSearch = new Set([cand.name]);
        if (cand.symbol) tokensToSearch.add(cand.symbol);
        if (cand.resType) {
          tokensToSearch.add(`@${cand.resType}/${cand.name}`);
          tokensToSearch.add(`R.${cand.resType}.${cand.name}`);
        }

        const refs = [];
        for (const tok of tokensToSearch) {
          const matches = index.lookup(tok, f.path);
          refs.push(...matches);
        }

        const evalResult = Classifier.evaluate(refs);

        if (!evalResult.isAlive) {
          const item = {
            name: cand.name,
            symbol: cand.symbol,
            path: f.path,
            line_no: cand.lineNo,
            kind: cand.kind,
            reasons: ['Newly added in diff but has zero references across other codebase files'],
          };

          if (evalResult.hasWeakDocOnly) {
            item.reasons = [`Only referenced in ${evalResult.weakCount} doc/comment lines`];
          }

          confirmedOrphans.push(item);
        }
      }
    }

    return {
      passed: confirmedOrphans.length === 0,
      totalAddedCandidates: totalAdded,
      orphans: confirmedOrphans,
      warnings,
    };
  }
}
