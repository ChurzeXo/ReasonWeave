/**
 * Core Solver Engine (统一求解器引擎)
 *
 * 协调 BlobReader, InvertedIndex, Classifier 与 Adapters 进行全仓求值。
 */

import { BlobReader } from './blob-reader.mjs';
import { InvertedIndex } from './inverted-index.mjs';
import { Classifier } from './classifier.mjs';
import crypto from 'node:crypto';

export class Solver {
  /**
   * @param {object} [options]
   * @param {string} [options.repoDir=process.cwd()]
   * @param {string} [options.ref='HEAD']
   * @param {Array<any>} [options.adapters=[]]
   */
  constructor(options = {}) {
    this.repoDir = options.repoDir || process.cwd();
    this.ref = options.ref || 'HEAD';
    this.adapters = options.adapters || [];
    this.reader = new BlobReader(this.repoDir, this.ref);
    this.index = new InvertedIndex();
  }

  /**
   * 初始化并索引全量 Git HEAD 文本 Blobs
   * @param {function(string): boolean} [filterFn]
   * @param {Map<string, string>|Record<string, string>} [extraBlobs] 内存附加文件注入
   */
  buildIndex(filterFn = null, extraBlobs = null) {
    const textBlobs = this.reader.loadAllTextBlobs(filterFn);
    this.index.clear();
    this.index.indexAll(textBlobs);

    if (extraBlobs) {
      if (extraBlobs instanceof Map) {
        this.index.indexAll(extraBlobs);
      } else {
        const extraMap = new Map(Object.entries(extraBlobs));
        this.index.indexAll(extraMap);
      }
    }

    return {
      indexedFiles: this.index.totalIndexedFiles,
      indexedLines: this.index.totalIndexedLines,
    };
  }

  /**
   * 执行全量求解
   * @param {object} [opts]
   * @param {boolean} [opts.includeAlive=false] 是否包含在用符号
   * @param {boolean} [opts.rebuildIndex=true] 是否重建索引
   * @param {Map<string, string>|Record<string, string>} [opts.extraBlobs]
   * @returns {object} candidates.json schema output
   */
  solve(opts = {}) {
    const includeAlive = opts.includeAlive || false;
    if (opts.rebuildIndex !== false) {
      this.buildIndex(opts.filterFn || null, opts.extraBlobs || null);
    }

    const headCommit = this.reader.getHeadCommit();
    const activeAdapters = this.adapters.filter(a => a.detect(this.reader));

    const rawCandidates = [];
    let hasReflectionRisk = false;

    for (const adapter of activeAdapters) {
      const candidates = adapter.extractCandidates(this.reader);
      rawCandidates.push(...candidates.map(c => ({ ...c, adapterId: adapter.id })));
      if (adapter.detectReflectionUsage && adapter.detectReflectionUsage(this.reader)) {
        hasReflectionRisk = true;
      }
    }

    const evaluated = [];

    for (const cand of rawCandidates) {
      // 排除自身声明文件路径
      const ownPaths = new Set(cand.qualifierPaths || [cand.primaryPath]);

      // 收集候选名称和符号的匹配引用
      const refs = [];
      const tokensToSearch = new Set();
      if (cand.name) tokensToSearch.add(cand.name);
      if (cand.symbol) tokensToSearch.add(cand.symbol);
      if (cand.resType && cand.name) {
        tokensToSearch.add(`@${cand.resType}/${cand.name}`);
        tokensToSearch.add(`R.${cand.resType}.${cand.name}`);
      }

      for (const tok of tokensToSearch) {
        const matches = this.index.lookup(tok);
        for (const m of matches) {
          if (!ownPaths.has(m.path)) {
            refs.push(m);
          }
        }
      }

      // 去重
      const uniqueRefs = [];
      const seen = new Set();
      for (const r of refs) {
        const key = `${r.path}:${r.lineNo}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueRefs.push(r);
        }
      }

      const evalResult = Classifier.evaluate(uniqueRefs);

      let status = 'CONFIRMED_ORPHAN';
      let confidence = 1.0;
      const reasons = [];

      if (evalResult.isAlive) {
        status = 'ALIVE';
        confidence = 0.0;
        reasons.push(`Referenced in ${evalResult.strongCount} code lines and ${evalResult.mediumCount} resource lines`);
      } else if (hasReflectionRisk) {
        // Fail-Closed: 动态反射风险时降级为待证
        status = 'PENDING_VERIFICATION';
        confidence = 0.65;
        reasons.push('No direct static references found, but dynamic reflection patterns detected in codebase');
      } else if (evalResult.hasWeakDocOnly) {
        status = 'CONFIRMED_ORPHAN';
        confidence = 0.95;
        reasons.push(`No code/resource references. Only referenced in ${evalResult.weakCount} doc/comment lines`);
      } else {
        status = 'CONFIRMED_ORPHAN';
        confidence = 1.0;
        reasons.push('Zero references across all codebase files');
      }

      const weakRefs = evalResult.classified
        .filter(c => c.kind === 'WEAK_DOC')
        .map(c => ({
          path: c.path,
          line_no: c.lineNo,
          content: c.lineText,
          classification: c.kind,
        }));

      evaluated.push({
        id: cand.id,
        type: cand.isFamily ? 'asset_resource_family' : 'asset_resource',
        stack: cand.adapterId || 'general',
        name: cand.name,
        symbol: cand.symbol || cand.name,
        path: cand.primaryPath,
        qualifier_paths: cand.qualifierPaths || [cand.primaryPath],
        line_no: cand.lineNo || 1,
        status,
        confidence,
        reasons,
        weak_references: weakRefs,
      });
    }

    // 确定性排序 (S3 逐字节一致保证)
    evaluated.sort((a, b) => {
      if (a.path !== b.path) return a.path.localeCompare(b.path);
      if (a.line_no !== b.line_no) return a.line_no - b.line_no;
      return a.name.localeCompare(b.name);
    });

    const filtered = includeAlive ? evaluated : evaluated.filter(c => c.status !== 'ALIVE');
    const confirmedCount = filtered.filter(c => c.status === 'CONFIRMED_ORPHAN').length;
    const pendingCount = filtered.filter(c => c.status === 'PENDING_VERIFICATION').length;

    return {
      $schema: 'https://lab.agent.toolkit/schemas/orphan-candidates-v1.json',
      version: '1.0.0',
      generated_at: new Date().toISOString(),
      commit_sha: headCommit,
      summary: {
        total_scanned_files: this.index.totalIndexedFiles,
        total_candidates: filtered.length,
        confirmed_orphans: confirmedCount,
        pending_verification: pendingCount,
      },
      candidates: filtered,
    };
  }

  /**
   * 计算输出对象的确定性 SHA-256 哈希
   * @param {object} result
   * @returns {string}
   */
  static computeDeterministicHash(result) {
    // 剔除易变的时间戳字段
    const clone = {
      ...result,
      generated_at: 'STABLE_REPRODUCIBILITY_TIMESTAMP',
    };
    const jsonStr = JSON.stringify(clone, Object.keys(clone).sort(), 2);
    return crypto.createHash('sha256').update(jsonStr).digest('hex');
  }
}
