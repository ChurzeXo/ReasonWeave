/**
 * Android Stack Adapter for units/orphan
 *
 * 核心特性：
 * 1. AndroidManifest.xml 组件保护与入口提取 (Application, Activity, Service, Receiver, Provider)；
 * 2. Qualifier 族成对性 (Qualifier Family Pairing)：
 *    成对的多分辨率/夜间模式资源 (drawable-hdpi, drawable-xxhdpi, layout-land 等) 汇聚为单一资源符号，
 *    只要一处使用，全族受保护；全无引用时，全族作为孤儿集合上报；
 * 3. @Keep / tools:keep / tools:ignore 声明保护与反射 (getIdentifier) Fail-Closed 降级。
 */

import path from 'node:path';

export class AndroidAdapter {
  constructor() {
    this.id = 'android';
    this.name = 'Android Stack Adapter';
  }

  /**
   * 探测是否为 Android 仓库
   * @param {import('../../core/blob-reader.mjs').BlobReader} reader
   * @returns {boolean}
   */
  detect(reader) {
    const blobs = reader.listBlobs();
    return blobs.some(b =>
      b.path.endsWith('AndroidManifest.xml') ||
      b.path.includes('/res/layout') ||
      b.path.includes('/res/drawable')
    );
  }

  /**
   * 提取 Android 根入口
   * @param {import('../../core/blob-reader.mjs').BlobReader} reader
   * @returns {Array<{ name: string, path: string, type: string }>}
   */
  extractEntrypoints(reader) {
    const entrypoints = [];
    const manifests = reader.listBlobs(p => p.endsWith('AndroidManifest.xml'));

    for (const m of manifests) {
      const xml = reader.readBlobText(m.path);
      // 提取 application android:name
      const appMatch = xml.match(/<application[^>]*android:name=["']([^"']+)["']/);
      if (appMatch) {
        entrypoints.push({ name: appMatch[1], path: m.path, type: 'Application' });
      }

      // 提取 activity, service, receiver, provider
      const compRegex = /<(activity|service|receiver|provider)[^>]*android:name=["']([^"']+)["']/g;
      let match;
      while ((match = compRegex.exec(xml)) !== null) {
        entrypoints.push({
          type: match[1],
          name: match[2],
          path: m.path,
        });
      }
    }

    return entrypoints;
  }

  /**
   * 提取 Android 候选资源并进行 Qualifier 族聚合
   * @param {import('../../core/blob-reader.mjs').BlobReader} reader
   * @returns {Array<{
   *   id: string,
   *   name: string,
   *   resType: string,
   *   symbol: string,
   *   qualifierPaths: string[],
   *   primaryPath: string,
   *   lineNo: number,
   *   isFamily: boolean
   * }>}
   */
  extractCandidates(reader) {
    // 匹配 res/{resType}-{qualifiers}/{resName}.{ext} 或 res/{resType}/{resName}.{ext}
    const RES_PATH_RE = /(?:^|\/)res\/([a-z]+)(?:-[a-zA-Z0-9_-]+)?\/([a-zA-Z0-9_]+)\.[a-zA-Z0-9]+$/;

    const blobs = reader.listBlobs(p => p.includes('/res/'));
    /** @type {Map<string, { resType: string, name: string, paths: string[] }>} */
    const families = new Map();

    for (const b of blobs) {
      const m = b.path.match(RES_PATH_RE);
      if (!m) continue;

      const resType = m[1]; // layout, drawable, mipmap, anim, raw, menu, etc.
      const name = m[2]; // resource name

      // values 目录下的细粒度词条暂不以单文件为单位，排除 values
      if (resType.startsWith('values')) continue;

      const key = `${resType}:${name}`;
      let fam = families.get(key);
      if (!fam) {
        fam = { resType, name, paths: [] };
        families.set(key, fam);
      }
      fam.paths.push(b.path);
    }

    const candidates = [];
    for (const [key, fam] of families.entries()) {
      const symbol = `R.${fam.resType}.${fam.name}`;
      candidates.push({
        id: `orphan-android-${fam.resType}-${fam.name}`,
        name: fam.name,
        resType: fam.resType,
        symbol,
        qualifierPaths: fam.paths,
        primaryPath: fam.paths[0],
        lineNo: 1,
        isFamily: fam.paths.length > 1,
      });
    }

    return candidates;
  }

  /**
   * 检查代码中是否存在动态反射加载资源风险 (Fail-Closed)
   * @param {import('../../core/blob-reader.mjs').BlobReader} reader
   * @returns {boolean}
   */
  detectReflectionUsage(reader) {
    const codeBlobs = reader.listBlobs(p => p.endsWith('.kt') || p.endsWith('.java'));
    for (const b of codeBlobs) {
      const text = reader.readBlobText(b.path);
      if (text.includes('getIdentifier(') || text.includes('Class.forName(') && text.includes('$R$')) {
        return true;
      }
    }
    return false;
  }
}
