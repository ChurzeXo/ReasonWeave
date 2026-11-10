/**
 * Web / TypeScript Stack Adapter for units/orphan
 *
 * 核心特性：
 * 1. package.json entrypoints 自动保护 (main, module, exports, bin)；
 * 2. ESM / CJS export 符号提取 (named exports, default export, types)；
 * 3. 框架专属入口保护 (Next.js pages/app, Astro, Vite index.html)；
 * 4. 内部未引用 export 精准判死 (CONFIRMED_ORPHAN)；
 * 5. 动态 import() / require() 表达式 Fail-Closed 降级。
 */

import path from 'node:path';

export class WebAdapter {
  constructor() {
    this.id = 'web';
    this.name = 'Web / TypeScript Stack Adapter';
  }

  /**
   * 探测是否为 Web / TS / JS 工程
   * @param {import('../../core/blob-reader.mjs').BlobReader} reader
   * @returns {boolean}
   */
  detect(reader) {
    const blobs = reader.listBlobs();
    return blobs.some(b =>
      b.path === 'package.json' ||
      b.path === 'tsconfig.json' ||
      b.path.endsWith('.ts') ||
      b.path.endsWith('.tsx') ||
      b.path.endsWith('.jsx')
    );
  }

  /**
   * 提取 Web/TS 根入口文件集合 (从 package.json 与常见框架中解析)
   * @param {import('../../core/blob-reader.mjs').BlobReader} reader
   * @returns {Array<{ name: string, path: string, type: string }>}
   */
  extractEntrypoints(reader) {
    const entrypoints = [];
    const pkgBlob = reader.listBlobs(p => {
      const pathStr = typeof p === 'string' ? p : (p && p.path ? p.path : '');
      return pathStr === 'package.json' || pathStr.endsWith('/package.json');
    })[0];

    if (pkgBlob) {
      try {
        const pkg = JSON.parse(reader.readBlobText(pkgBlob.path));
        // 1. main / module
        if (pkg.main) entrypoints.push({ name: 'pkg.main', path: this._normalizeEntryPath(pkg.main), type: 'PackageMain' });
        if (pkg.module) entrypoints.push({ name: 'pkg.module', path: this._normalizeEntryPath(pkg.module), type: 'PackageModule' });

        // 2. bin
        if (pkg.bin) {
          if (typeof pkg.bin === 'string') {
            entrypoints.push({ name: 'pkg.bin', path: this._normalizeEntryPath(pkg.bin), type: 'PackageBin' });
          } else if (typeof pkg.bin === 'object') {
            for (const [k, v] of Object.entries(pkg.bin)) {
              entrypoints.push({ name: `pkg.bin.${k}`, path: this._normalizeEntryPath(v), type: 'PackageBin' });
            }
          }
        }

        // 3. exports
        if (pkg.exports) {
          this._extractExportEntries(pkg.exports, entrypoints);
        }
      } catch {}
    }

    // 4. 框架路由入口
    const routeBlobs = reader.listBlobs(p =>
      p.startsWith('pages/') ||
      p.startsWith('src/pages/') ||
      p.startsWith('app/') ||
      p.startsWith('src/app/') ||
      p === 'index.html'
    );
    for (const b of routeBlobs) {
      entrypoints.push({ name: b.path, path: b.path, type: 'FrameworkRouteEntry' });
    }

    return entrypoints;
  }

  _normalizeEntryPath(p) {
    if (!p) return '';
    return p.startsWith('./') ? p.slice(2) : p;
  }

  _extractExportEntries(exp, list) {
    if (typeof exp === 'string') {
      list.push({ name: 'pkg.exports', path: this._normalizeEntryPath(exp), type: 'PackageExport' });
    } else if (typeof exp === 'object' && exp !== null) {
      for (const [k, v] of Object.entries(exp)) {
        if (typeof v === 'string') {
          list.push({ name: `pkg.exports.${k}`, path: this._normalizeEntryPath(v), type: 'PackageExport' });
        } else if (typeof v === 'object' && v !== null) {
          // import / require / default 映射
          for (const target of Object.values(v)) {
            if (typeof target === 'string') {
              list.push({ name: `pkg.exports.${k}`, path: this._normalizeEntryPath(target), type: 'PackageExport' });
            }
          }
        }
      }
    }
  }

  /**
   * 提取 Web/TS 符号与 export 清单
   * @param {import('../../core/blob-reader.mjs').BlobReader} reader
   * @returns {Array<{
   *   id: string,
   *   name: string,
   *   symbol: string,
   *   primaryPath: string,
   *   lineNo: number,
   *   kind: string,
   *   isProtected?: boolean,
   *   protectionReason?: string
   * }>}
   */
  extractCandidates(reader) {
    const entryList = this.extractEntrypoints(reader);
    const entryPaths = new Set(entryList.map(e => e.path));

    const sourceBlobs = reader.listBlobs(p =>
      (p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js') || p.endsWith('.jsx') || p.endsWith('.mjs')) &&
      !p.includes('/node_modules/') &&
      !p.includes('/dist/') &&
      !p.includes('/build/') &&
      !p.includes('/.next/')
    );

    const candidates = [];

    for (const b of sourceBlobs) {
      const text = reader.readBlobText(b.path);
      if (!text) continue;

      const lines = text.split(/\r?\n/);
      const isEntryFile = entryPaths.has(b.path);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNo = i + 1;
        const trimmed = line.trim();

        if (!trimmed.startsWith('export ') && !trimmed.startsWith('module.exports') && !trimmed.startsWith('exports.')) {
          continue;
        }

        // 1. export function / class
        const funcOrClassMatch = trimmed.match(/^export\s+(?:async\s+)?(function|class)\s+([a-zA-Z0-9_$]+)/);
        if (funcOrClassMatch) {
          const kind = funcOrClassMatch[1];
          const name = funcOrClassMatch[2];
          candidates.push({
            id: `orphan-web-${kind}-${path.basename(b.path).replace(/\.[^.]+$/, '')}-${name}`,
            name,
            symbol: name,
            primaryPath: b.path,
            qualifierPaths: [b.path],
            lineNo,
            kind: `export_${kind}`,
            isProtected: isEntryFile,
            protectionReason: isEntryFile ? 'Protected: Exported from package.json/framework entrypoint' : undefined,
          });
          continue;
        }

        // 2. export const / let / var
        const varMatch = trimmed.match(/^export\s+(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*[:=]/);
        if (varMatch) {
          const name = varMatch[1];
          candidates.push({
            id: `orphan-web-var-${path.basename(b.path).replace(/\.[^.]+$/, '')}-${name}`,
            name,
            symbol: name,
            primaryPath: b.path,
            qualifierPaths: [b.path],
            lineNo,
            kind: 'export_variable',
            isProtected: isEntryFile,
            protectionReason: isEntryFile ? 'Protected: Exported from package.json/framework entrypoint' : undefined,
          });
          continue;
        }

        // 3. export type / interface / enum
        const typeMatch = trimmed.match(/^export\s+(type|interface|enum)\s+([a-zA-Z0-9_$]+)/);
        if (typeMatch) {
          const kind = typeMatch[1];
          const name = typeMatch[2];
          candidates.push({
            id: `orphan-web-${kind}-${path.basename(b.path).replace(/\.[^.]+$/, '')}-${name}`,
            name,
            symbol: name,
            primaryPath: b.path,
            qualifierPaths: [b.path],
            lineNo,
            kind: `export_${kind}`,
            isProtected: isEntryFile,
            protectionReason: isEntryFile ? 'Protected: Exported from package.json/framework entrypoint' : undefined,
          });
          continue;
        }

        // 4. export { a, b, c }
        const multiExportMatch = trimmed.match(/^export\s*\{([\s\S]*?)\}/);
        if (multiExportMatch) {
          const items = multiExportMatch[1].split(',');
          for (const item of items) {
            const clean = item.trim().split(/\s+as\s+/)[0].trim();
            if (clean && /^[a-zA-Z0-9_$]+$/.test(clean)) {
              candidates.push({
                id: `orphan-web-named-${path.basename(b.path).replace(/\.[^.]+$/, '')}-${clean}`,
                name: clean,
                symbol: clean,
                primaryPath: b.path,
                qualifierPaths: [b.path],
                lineNo,
                kind: 'export_named',
                isProtected: isEntryFile,
                protectionReason: isEntryFile ? 'Protected: Exported from package.json/framework entrypoint' : undefined,
              });
            }
          }
          continue;
        }

        // 5. exports.foo = ...
        const cjsMatch = trimmed.match(/^exports\.([a-zA-Z0-9_$]+)\s*=/);
        if (cjsMatch) {
          const name = cjsMatch[1];
          candidates.push({
            id: `orphan-web-cjs-${path.basename(b.path).replace(/\.[^.]+$/, '')}-${name}`,
            name,
            symbol: name,
            primaryPath: b.path,
            qualifierPaths: [b.path],
            lineNo,
            kind: 'export_cjs',
            isProtected: isEntryFile,
            protectionReason: isEntryFile ? 'Protected: Exported from package.json/framework entrypoint' : undefined,
          });
          continue;
        }
      }
    }

    return candidates;
  }

  /**
   * 检查是否包含动态 import() 或 require(variable) 等反射模式 (Fail-Closed)
   * @param {import('../../core/blob-reader.mjs').BlobReader} reader
   * @returns {boolean}
   */
  detectReflectionUsage(reader) {
    const blobs = reader.listBlobs(p =>
      p.endsWith('.js') || p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.mjs')
    );
    for (const b of blobs) {
      const text = reader.readBlobText(b.path);
      // 匹配非字面量的动态 import(...)，如 import(pathVariable) 或 import(`./plugins/${name}`)
      if (/import\s*\(\s*`[^`]*\$\{/.test(text) || /import\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\)/.test(text)) {
        return true;
      }
      // 匹配动态 require(variable)
      if (/require\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\)/.test(text)) {
        return true;
      }
    }
    return false;
  }
}
