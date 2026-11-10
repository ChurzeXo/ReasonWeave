/**
 * Python Stack Adapter for units/orphan
 *
 * 核心特性：
 * 1. AST / 正则符号提取 (top-level functions, classes, constants)；
 * 2. `__all__` 显式导出列表保护；
 * 3. pytest 测试发现机制保护 (test_* 函数, Test* 类, @pytest.fixture)；
 * 4. 魔术方法保护 (__init__, __repr__, __str__ 等)；
 * 5. Web 框架路由保护 (@app.*, @router.*, @bp.*, @click.*, @cli.*)；
 * 6. 动态调用 (getattr, setattr, importlib) Fail-Closed 降级。
 */

import path from 'node:path';

export class PythonAdapter {
  constructor() {
    this.id = 'python';
    this.name = 'Python Stack Adapter';
  }

  /**
   * 探测是否为 Python 项目
   * @param {import('../../core/blob-reader.mjs').BlobReader} reader
   * @returns {boolean}
   */
  detect(reader) {
    const blobs = reader.listBlobs();
    return blobs.some(b =>
      b.path.endsWith('.py') ||
      b.path.endsWith('pyproject.toml') ||
      b.path.endsWith('setup.py') ||
      b.path.endsWith('requirements.txt')
    );
  }

  /**
   * 提取 Python 根入口 (pyproject.toml scripts, setup.py console_scripts, __main__.py)
   * @param {import('../../core/blob-reader.mjs').BlobReader} reader
   * @returns {Array<{ name: string, path: string, type: string }>}
   */
  extractEntrypoints(reader) {
    const entrypoints = [];
    const pyprojectBlobs = reader.listBlobs(p => p.endsWith('pyproject.toml'));
    for (const b of pyprojectBlobs) {
      const text = reader.readBlobText(b.path);
      // 匹配 scripts: name = "module:func"
      const scriptSectionMatch = text.match(/\[(?:project\.scripts|tool\.poetry\.scripts)\]([\s\S]*?)(?:\[|$)/);
      if (scriptSectionMatch) {
        const lines = scriptSectionMatch[1].split('\n');
        for (const line of lines) {
          const m = line.match(/^\s*([a-zA-Z0-9_-]+)\s*=\s*["']([^"']+)["']/);
          if (m) {
            entrypoints.push({ name: m[1], target: m[2], path: b.path, type: 'ProjectScript' });
          }
        }
      }
    }

    const mainBlobs = reader.listBlobs(p => p.endsWith('__main__.py') || p === 'app.py' || p === 'main.py');
    for (const b of mainBlobs) {
      entrypoints.push({ name: path.basename(b.path), path: b.path, type: 'MainExecutable' });
    }

    return entrypoints;
  }

  /**
   * 提取 Python 符号声明及豁免/保护标记
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
    const pyBlobs = reader.listBlobs(p =>
      p.endsWith('.py') &&
      !p.includes('/site-packages/') &&
      !p.includes('/.venv/') &&
      !p.includes('/venv/') &&
      !p.includes('/__pycache__/')
    );

    const candidates = [];

    for (const b of pyBlobs) {
      const text = reader.readBlobText(b.path);
      if (!text) continue;

      const lines = text.split(/\r?\n/);
      const isTestFile = b.path.includes('test_') || b.path.includes('_test.py') || b.path.includes('/tests/');

      // 1. 提取 __all__ 声明的保护名单
      const allExportedNames = new Set();
      const allMatch = text.match(/__all__\s*=\s*[[({]([\s\S]*?)[\])}]/);
      if (allMatch) {
        const items = allMatch[1].match(/["']([a-zA-Z0-9_]+)["']/g);
        if (items) {
          for (const it of items) {
            allExportedNames.add(it.replace(/["']/g, ''));
          }
        }
      }

      // 2. 逐行提取顶层定义 (函数, 类, 装饰器)
      let prevDecorator = '';
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNo = i + 1;
        const trimmed = line.trim();

        if (trimmed.startsWith('@')) {
          prevDecorator = trimmed;
          continue;
        }

        // 顶层函数: def func(...) 或 async def func(...)
        const funcMatch = line.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/);
        if (funcMatch) {
          const name = funcMatch[1];
          let isProtected = false;
          let protectionReason = '';

          // 规则 1: __all__ 导出保护
          if (allExportedNames.has(name)) {
            isProtected = true;
            protectionReason = 'Protected: Explicitly exported in __all__';
          }
          // 规则 2: pytest 测试发现机制保护 (test_* 函数 或 @pytest.fixture)
          else if (name.startsWith('test_') || (isTestFile && name.startsWith('test_')) || prevDecorator.includes('@pytest.fixture')) {
            isProtected = true;
            protectionReason = 'Protected: Pytest test function or fixture';
          }
          // 规则 3: 魔术方法 (__init__, __str__, __repr__ 等)
          else if (/^__[a-zA-Z0-9_]+__$/.test(name)) {
            isProtected = true;
            protectionReason = 'Protected: Python magic method';
          }
          // 规则 4: Web 框架路由或 CLI 装饰器 (@app.*, @router.*, @bp.*, @click.*)
          else if (
            prevDecorator.startsWith('@app.') ||
            prevDecorator.startsWith('@router.') ||
            prevDecorator.startsWith('@bp.') ||
            prevDecorator.startsWith('@click.') ||
            prevDecorator.startsWith('@cli.') ||
            prevDecorator.startsWith('@celery.')
          ) {
            isProtected = true;
            protectionReason = `Protected: Framework route/command decorator (${prevDecorator})`;
          }

          candidates.push({
            id: `orphan-py-func-${path.basename(b.path, '.py')}-${name}`,
            name,
            symbol: name,
            primaryPath: b.path,
            qualifierPaths: [b.path],
            lineNo,
            kind: 'function',
            isProtected,
            protectionReason,
          });

          prevDecorator = '';
          continue;
        }

        // 顶层类: class ClassName(...)
        const classMatch = line.match(/^class\s+([a-zA-Z0-9_]+)(?:\s*\(|:)/);
        if (classMatch) {
          const name = classMatch[1];
          let isProtected = false;
          let protectionReason = '';

          if (allExportedNames.has(name)) {
            isProtected = true;
            protectionReason = 'Protected: Explicitly exported in __all__';
          } else if (isTestFile && name.startsWith('Test')) {
            isProtected = true;
            protectionReason = 'Protected: Pytest test class';
          }

          candidates.push({
            id: `orphan-py-class-${path.basename(b.path, '.py')}-${name}`,
            name,
            symbol: name,
            primaryPath: b.path,
            qualifierPaths: [b.path],
            lineNo,
            kind: 'class',
            isProtected,
            protectionReason,
          });

          prevDecorator = '';
          continue;
        }

        prevDecorator = '';
      }
    }

    return candidates;
  }

  /**
   * 检查是否包含 getattr / setattr / importlib 等动态反射加载模式 (Fail-Closed)
   * @param {import('../../core/blob-reader.mjs').BlobReader} reader
   * @returns {boolean}
   */
  detectReflectionUsage(reader) {
    const pyBlobs = reader.listBlobs(p => p.endsWith('.py'));
    for (const b of pyBlobs) {
      const text = reader.readBlobText(b.path);
      if (
        text.includes('getattr(') ||
        text.includes('setattr(') ||
        text.includes('importlib.import_module(') ||
        text.includes('__import__(')
      ) {
        return true;
      }
    }
    return false;
  }
}
