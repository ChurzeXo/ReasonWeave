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

export const CallerKind = {
  PRODUCTION_CALLER: 'PRODUCTION_CALLER',
  TEST_CALLER: 'TEST_CALLER',
  DOC_CALLER: 'DOC_CALLER',
};

export const TEST_PATH_PATTERNS = [
  /(?:^|[\\/])(?:src[\\/])?test(?:s)?[\\/]/i,
  /(?:^|[\\/])androidTest[\\/]/i,
  /__tests__[\\/]/i,
  /_test\.go$/i,
  /\.(?:test|spec)\.[jt]sx?$/i,
  /^test_.*\.py$/i,
  /.*_test\.py$/i,
];

/**
 * 判断路径是否属于测试范围
 * @param {string} filePath 相对或绝对路径
 * @returns {boolean}
 */
export function isTestPath(filePath) {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, '/');
  return TEST_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

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

  /**
   * 判定路径是否属于测试范围
   * @param {string} filePath
   * @returns {boolean}
   */
  static isTestPath(filePath) {
    return isTestPath(filePath);
  }

  /**
   * 判定引用是否来自生产代码
   * @param {{ path: string, lineNo: number, lineText: string }} ref
   * @returns {boolean}
   */
  static isProductionCaller(ref) {
    const kind = Classifier.classifySingle(ref);
    if (kind === ReferenceKind.WEAK_DOC) return false;
    return !isTestPath(ref.path);
  }

  /**
   * 判定引用是否来自测试代码
   * @param {{ path: string, lineNo: number, lineText: string }} ref
   * @returns {boolean}
   */
  static isTestCaller(ref) {
    const kind = Classifier.classifySingle(ref);
    if (kind === ReferenceKind.WEAK_DOC) return false;
    return isTestPath(ref.path);
  }

  /**
   * 将引用精准分类为 PRODUCTION_CALLER | TEST_CALLER | DOC_CALLER
   * @param {{ path: string, lineNo: number, lineText: string }} ref
   * @returns {string} CallerKind
   */
  static classifyCaller(ref) {
    const kind = Classifier.classifySingle(ref);
    if (kind === ReferenceKind.WEAK_DOC) return CallerKind.DOC_CALLER;
    return isTestPath(ref.path) ? CallerKind.TEST_CALLER : CallerKind.PRODUCTION_CALLER;
  }

  /**
   * 聚合评估某个符号的所有调用者分布（区分生产接线与单测自测）
   * @param {Array<{ path: string, lineNo: number, lineText: string }>} references
   * @param {object} [opts]
   * @param {Array<string>} [opts.excludePaths=[]] 排除的文件路径列表
   * @param {string} [opts.symbolName=''] 符号名称（用于过滤自身声明行）
   * @returns {{
   *   productionCallerCount: number,
   *   testCallerCount: number,
   *   docReferenceCount: number,
   *   productionCallers: Array<{ path: string, lineNo: number, lineText: string }>,
   *   testCallers: Array<{ path: string, lineNo: number, lineText: string }>,
   *   docReferences: Array<{ path: string, lineNo: number, lineText: string }>,
   *   wiringStatus: 'wired' | 'test_only' | 'unwired',
   *   isWiredInProduction: boolean,
   *   isTestOnly: boolean,
   *   isCompletelyOrphan: boolean,
   * }}
   */
  static evaluateCallers(references, { excludePaths = [], symbolName = '' } = {}) {
    const excludeSet = new Set(excludePaths.map((p) => p.replace(/\\/g, '/')));
    const escapedSymbol = symbolName ? symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
    const declRegex = escapedSymbol
      ? new RegExp(`(?:fun|def|func|function|fn)\\s+(?:[A-Za-z0-9_.]+\\.)?${escapedSymbol}\\b|(?:val|var|const|let)\\s+${escapedSymbol}\\s*[:=]`)
      : null;

    const productionCallers = [];
    const testCallers = [];
    const docReferences = [];

    for (const ref of references) {
      const normPath = ref.path.replace(/\\/g, '/');
      if (excludeSet.has(normPath)) continue;

      // 排除符号声明行自身
      if (declRegex && declRegex.test(ref.lineText)) {
        continue;
      }

      const callerKind = Classifier.classifyCaller(ref);
      if (callerKind === CallerKind.PRODUCTION_CALLER) {
        productionCallers.push(ref);
      } else if (callerKind === CallerKind.TEST_CALLER) {
        testCallers.push(ref);
      } else {
        docReferences.push(ref);
      }
    }

    const isWiredInProduction = productionCallers.length > 0;
    const isTestOnly = productionCallers.length === 0 && testCallers.length > 0;
    const isCompletelyOrphan = productionCallers.length === 0 && testCallers.length === 0;

    let wiringStatus = 'unwired';
    if (isWiredInProduction) {
      wiringStatus = 'wired';
    } else if (isTestOnly) {
      wiringStatus = 'test_only';
    }

    return {
      productionCallerCount: productionCallers.length,
      testCallerCount: testCallers.length,
      docReferenceCount: docReferences.length,
      productionCallers,
      testCallers,
      docReferences,
      wiringStatus,
      isWiredInProduction,
      isTestOnly,
      isCompletelyOrphan,
    };
  }
}
