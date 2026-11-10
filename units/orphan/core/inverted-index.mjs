/**
 * In-Memory Line-Level Inverted Index (内存行级倒排索引)
 *
 * 为全仓跨语言引用提供毫秒级逆向检索与精确行级证据追溯。
 */

export class InvertedIndex {
  constructor() {
    /** @type {Map<string, Array<{ path: string, lineNo: number, lineText: string }>>} */
    this.tokenMap = new Map();
    this.totalIndexedFiles = 0;
    this.totalIndexedLines = 0;
  }

  /**
   * 提取行内所有有效 Token (包括驼峰、下划线分词与整体标识符)
   * @param {string} line
   * @returns {Set<string>}
   */
  static extractTokens(line) {
    const tokens = new Set();
    if (!line) return tokens;

    // 匹配常规标识符与 XML/资源引用模式
    const matches = line.match(/[a-zA-Z0-9_$-]+/g);
    if (!matches) return tokens;

    for (const raw of matches) {
      if (raw.length < 2) continue;
      tokens.add(raw);

      // 处理下划线与中划线切分
      if (raw.includes('_') || raw.includes('-')) {
        const parts = raw.split(/[-_]+/);
        for (const p of parts) {
          if (p.length >= 2) tokens.add(p);
        }
      }

      // 处理驼峰切分 (e.g. MySpecialComponent -> My, Special, Component)
      const camelParts = raw.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
      if (camelParts.length > 1) {
        for (const cp of camelParts) {
          if (cp.length >= 2) tokens.add(cp);
        }
      }
    }

    return tokens;
  }

  /**
   * 将一个文件的全量文本行索引进倒排索引
   * @param {string} filePath 相对文件路径
   * @param {string} content 文件文本内容
   */
  indexFile(filePath, content) {
    if (!content) return;
    this.totalIndexedFiles++;

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1;
      const lineText = lines[i];
      this.totalIndexedLines++;

      const tokens = InvertedIndex.extractTokens(lineText);
      for (const tok of tokens) {
        let list = this.tokenMap.get(tok);
        if (!list) {
          list = [];
          this.tokenMap.set(tok, list);
        }
        list.push({
          path: filePath,
          lineNo,
          lineText: lineText.trim(),
        });
      }
    }
  }

  /**
   * 批量索引 Map<filePath, content>
   * @param {Map<string, string>} filesMap
   */
  indexAll(filesMap) {
    for (const [filePath, content] of filesMap.entries()) {
      this.indexFile(filePath, content);
    }
  }

  /**
   * 精确查询某个 Token 的所有行级命中引用
   * @param {string} token 目标符号
   * @param {string} [excludePath] 排除自身声明所在文件
   * @returns {Array<{ path: string, lineNo: number, lineText: string }>}
   */
  lookup(token, excludePath = null) {
    const list = this.tokenMap.get(token);
    if (!list) return [];
    if (!excludePath) return list;
    return list.filter(item => item.path !== excludePath);
  }

  /**
   * 检查某个 Token 是否在倒排索引中出现
   * @param {string} token
   * @param {string} [excludePath]
   * @returns {boolean}
   */
  has(token, excludePath = null) {
    return this.lookup(token, excludePath).length > 0;
  }

  /**
   * 清空索引
   */
  clear() {
    this.tokenMap.clear();
    this.totalIndexedFiles = 0;
    this.totalIndexedLines = 0;
  }
}
