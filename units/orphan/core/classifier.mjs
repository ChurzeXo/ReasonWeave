/**
 * Reference Classifier (引用三分类器)
 *
 * 将行级命中细分为：
 * 1. Code 引用 (STRONG_CODE) - 代码符号、import、方法调用、类继承等强绑定；
 * 2. Resource 引用 (MEDIUM_RESOURCE) - 布局绑定、XML/JSON 资产引用、路由表；
 * 3. Doc/Comment 引用 (WEAK_DOC) - Markdown、文本说明、行内注释等弱引用。
 */

import path from 'node:path';

export const ReferenceKind = {
  STRONG_CODE: 'STRONG_CODE',
  MEDIUM_RESOURCE: 'MEDIUM_RESOURCE',
  WEAK_DOC: 'WEAK_DOC',
};

const DOC_EXTS = new Set([
  '.md', '.markdown', '.txt', '.rst', '.adoc', '.doc', '.docx'
]);

const RESOURCE_EXTS = new Set([
  '.xml', '.json', '.yaml', '.yml', '.html', '.htm', '.css', '.scss', '.toml', '.properties'
]);

const CODE_EXTS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.kt', '.java', '.py', '.rs', '.go', '.swift',
  '.c', '.cpp', '.cc', '.h', '.hpp', '.m', '.mm'
]);

export class Classifier {
  /**
   * 判定单条引用的类型
   * @param {{ path: string, lineNo: number, lineText: string }} ref
   * @returns {string} ReferenceKind
   */
  static classifySingle(ref) {
    const ext = path.extname(ref.path).toLowerCase();
    const text = ref.lineText.trim();

    // 1. 文档文件一律归为弱引用
    if (DOC_EXTS.has(ext) || ref.path.includes('/docs/') || ref.path.includes('/doc/')) {
      return ReferenceKind.WEAK_DOC;
    }

    // 2. 检查是否为纯注释行
    if (
      text.startsWith('//') ||
      text.startsWith('#') ||
      text.startsWith('*') ||
      text.startsWith('/*') ||
      text.startsWith('<!--')
    ) {
      return ReferenceKind.WEAK_DOC;
    }

    // 3. 资源文件
    if (RESOURCE_EXTS.has(ext)) {
      return ReferenceKind.MEDIUM_RESOURCE;
    }

    // 4. 代码文件
    if (CODE_EXTS.has(ext)) {
      return ReferenceKind.STRONG_CODE;
    }

    // 默认降级为资源引用
    return ReferenceKind.MEDIUM_RESOURCE;
  }

  /**
   * 聚合分析某个候选符号的所有引用列表
   * @param {Array<{ path: string, lineNo: number, lineText: string }>} references
   * @returns {{
   *   isAlive: boolean,
   *   hasStrongCode: boolean,
   *   hasMediumResource: boolean,
   *   hasWeakDocOnly: boolean,
   *   strongCount: number,
   *   mediumCount: number,
   *   weakCount: number,
   *   classified: Array<{ path: string, lineNo: number, lineText: string, kind: string }>
   * }}
   */
  static evaluate(references) {
    const classified = references.map(ref => ({
      ...ref,
      kind: Classifier.classifySingle(ref),
    }));

    let strongCount = 0;
    let mediumCount = 0;
    let weakCount = 0;

    for (const item of classified) {
      if (item.kind === ReferenceKind.STRONG_CODE) strongCount++;
      else if (item.kind === ReferenceKind.MEDIUM_RESOURCE) mediumCount++;
      else if (item.kind === ReferenceKind.WEAK_DOC) weakCount++;
    }

    const hasStrongCode = strongCount > 0;
    const hasMediumResource = mediumCount > 0;
    const isAlive = hasStrongCode || hasMediumResource;
    const hasWeakDocOnly = !isAlive && weakCount > 0;

    return {
      isAlive,
      hasStrongCode,
      hasMediumResource,
      hasWeakDocOnly,
      strongCount,
      mediumCount,
      weakCount,
      classified,
    };
  }
}
