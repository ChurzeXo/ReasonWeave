/**
 * Git Blob Reader (Read-Only Invariant Core)
 *
 * 遵循「只读第一 (Read-Only Invariant)」原则：
 * 1. 恒基于 Git HEAD blob 流式加载，严禁依赖脏工作树；
 * 2. 读取过程绝对零污染工作树，严禁在被测仓库生成任何临时文件。
 */

import { execSync, execFileSync } from 'node:child_process';
import path from 'node:path';

export class BlobReader {
  /**
   * @param {string} [repoDir=process.cwd()] 仓库根目录
   * @param {string} [ref='HEAD'] 目标 Git 引用或提交哈希
   */
  constructor(repoDir = process.cwd(), ref = 'HEAD') {
    this.repoDir = path.resolve(repoDir);
    this.ref = ref;
    this._blobList = null;
    this._headCommit = null;
    this._cache = new Map();
  }

  /**
   * 获取当前引用的完整 Commit SHA
   * @returns {string}
   */
  getHeadCommit() {
    if (this._headCommit) return this._headCommit;
    try {
      this._headCommit = execSync(`git rev-parse ${this.ref}`, {
        cwd: this.repoDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
    } catch {
      this._headCommit = '0000000000000000000000000000000000000000';
    }
    return this._headCommit;
  }

  /**
   * 列出所有被 Git 跟踪的 Blob 列表 (基于 HEAD)
   * @param {function(string): boolean} [filterFn] 路径过滤条件
   * @returns {Array<{ path: string, mode: string, type: string, oid: string }>}
   */
  listBlobs(filterFn = null) {
    if (this._blobList) {
      if (filterFn) return this._blobList.filter(b => filterFn(b.path));
      return this._blobList;
    }

    try {
      const raw = execSync(`git ls-tree -r -z ${this.ref}`, {
        cwd: this.repoDir,
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'ignore'],
      });

      const entries = [];
      let start = 0;
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] === 0) { // NUL byte delimiter
          const slice = raw.subarray(start, i).toString('utf8');
          start = i + 1;
          if (!slice) continue;

          const tabIndex = slice.indexOf('\t');
          if (tabIndex === -1) continue;
          const meta = slice.slice(0, tabIndex).trim();
          const filePath = slice.slice(tabIndex + 1);

          const parts = meta.split(/\s+/);
          if (parts.length >= 3 && parts[1] === 'blob') {
            entries.push({
              mode: parts[0],
              type: parts[1],
              oid: parts[2],
              path: filePath,
            });
          }
        }
      }

      this._blobList = entries;
      if (filterFn) return this._blobList.filter(b => filterFn(b.path));
      return this._blobList;
    } catch (err) {
      // 非 git 仓库或异常时降级返回空
      this._blobList = [];
      return this._blobList;
    }
  }

  /**
   * 读取单个 Blob 的文本内容（基于 oid 或 path）
   * @param {string} filePath 文件相对路径
   * @param {string} [oid] Blob OID
   * @returns {string}
   */
  readBlobText(filePath, oid = null) {
    if (this._cache.has(filePath)) {
      return this._cache.get(filePath);
    }

    let targetOid = oid;
    if (!targetOid) {
      const found = this.listBlobs().find(b => b.path === filePath);
      if (!found) return '';
      targetOid = found.oid;
    }

    try {
      const content = execFileSync('git', ['cat-file', '-p', targetOid], {
        cwd: this.repoDir,
        maxBuffer: 32 * 1024 * 1024,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      this._cache.set(filePath, content);
      return content;
    } catch {
      return '';
    }
  }

  /**
   * 批量加载并填充所有过滤后的 Blob 内容至内存
   * @param {function(string): boolean} [filterFn] 过滤器
   * @returns {Map<string, string>} filePath -> content
   */
  loadAllTextBlobs(filterFn = null) {
    const blobs = this.listBlobs(filterFn);
    const map = new Map();
    for (const b of blobs) {
      const text = this.readBlobText(b.path, b.oid);
      map.set(b.path, text);
    }
    return map;
  }
}
