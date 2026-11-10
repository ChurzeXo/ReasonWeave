/**
 * Unit Tests for units/orphan Phase 2 Multi-stack Adapters (Python & Web/TS)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Solver } from '../core/solver.mjs';
import { PythonAdapter } from '../adapters/python/index.mjs';
import { WebAdapter } from '../adapters/web/index.mjs';
import { SolverProtocol } from '../core/protocol-s1-s3.mjs';

// Mock Reader for isolated in-memory testing
function createMockReader(blobsMap) {
  const blobs = Object.entries(blobsMap).map(([p, text]) => ({
    path: p,
    mode: '100644',
    type: 'blob',
    oid: 'mock-oid-' + p,
  }));

  return {
    getHeadCommit: () => 'mock-commit-sha-40chars-hexadecimal1234567890',
    listBlobs: (fn) => (fn ? blobs.filter(b => fn(b.path)) : blobs),
    readBlobText: (p) => blobsMap[p] || '',
    loadAllTextBlobs: (fn) => {
      const map = new Map();
      for (const [p, text] of Object.entries(blobsMap)) {
        if (!fn || fn(p)) map.set(p, text);
      }
      return map;
    },
  };
}

test('PythonAdapter: __all__ export protection', () => {
  const adapter = new PythonAdapter();
  const mockReader = createMockReader({
    'src/module.py': `
__all__ = ['exported_api', 'PublicClass']

def exported_api():
    pass

class PublicClass:
    pass

def unexported_dead_func():
    pass
`,
  });

  const candidates = adapter.extractCandidates(mockReader);
  const exported = candidates.find(c => c.name === 'exported_api');
  const pubClass = candidates.find(c => c.name === 'PublicClass');
  const unexported = candidates.find(c => c.name === 'unexported_dead_func');

  assert.ok(exported, 'exported_api should be extracted');
  assert.equal(exported.isProtected, true, 'exported_api should be protected via __all__');
  assert.ok(pubClass, 'PublicClass should be extracted');
  assert.equal(pubClass.isProtected, true, 'PublicClass should be protected via __all__');

  assert.ok(unexported, 'unexported_dead_func should be extracted');
  assert.equal(unexported.isProtected, false, 'unexported_dead_func should not be protected');
});

test('PythonAdapter: pytest functions, magic methods and route decorators protection', () => {
  const adapter = new PythonAdapter();
  const mockReader = createMockReader({
    'tests/test_api.py': `
def test_user_login():
    pass

class TestUserModel:
    pass

def helper_test_utility():
    pass
`,
    'src/app.py': `
@app.get('/health')
def health_check():
    return {'status': 'ok'}

class Item:
    def __init__(self):
        pass

    def __repr__(self):
        return 'Item'
`,
  });

  const candidates = adapter.extractCandidates(mockReader);

  const testFunc = candidates.find(c => c.name === 'test_user_login');
  assert.ok(testFunc);
  assert.equal(testFunc.isProtected, true, 'test_* functions should be protected');

  const testClass = candidates.find(c => c.name === 'TestUserModel');
  assert.ok(testClass);
  assert.equal(testClass.isProtected, true, 'Test* classes should be protected');

  const routeHandler = candidates.find(c => c.name === 'health_check');
  assert.ok(routeHandler);
  assert.equal(routeHandler.isProtected, true, '@app.get route handler should be protected');

  const magicInit = candidates.find(c => c.name === '__init__');
  if (magicInit) {
    assert.equal(magicInit.isProtected, true, '__init__ magic method should be protected');
  }
});

test('PythonAdapter: getattr/importlib dynamic reflection Fail-Closed downgrade', () => {
  const adapter = new PythonAdapter();
  const mockReaderWithReflection = createMockReader({
    'src/dispatcher.py': `
import importlib

def dispatch(handler_name):
    func = getattr(handlers, handler_name)
    return func()
`,
  });

  assert.equal(adapter.detectReflectionUsage(mockReaderWithReflection), true, 'Should detect getattr dynamic reflection');

  const mockReaderClean = createMockReader({
    'src/static_service.py': `
def direct_calc():
    return 42
`,
  });
  assert.equal(adapter.detectReflectionUsage(mockReaderClean), false, 'Clean code should not flag reflection');
});

test('WebAdapter: package.json entrypoints protection', () => {
  const adapter = new WebAdapter();
  const mockReader = createMockReader({
    'package.json': JSON.stringify({
      name: 'my-lib',
      main: './dist/index.js',
      module: './src/index.ts',
      bin: {
        'my-cli': './bin/cli.js',
      },
      exports: {
        '.': './src/index.ts',
        './utils': './src/utils/index.ts',
      },
    }),
    'src/index.ts': `
export function publicApi() {}
export const VERSION = '1.0.0';
`,
    'bin/cli.js': `
export function runCli() {}
`,
    'src/internal.ts': `
export function internalHelper() {}
export function unusedFunction() {}
`,
  });

  const candidates = adapter.extractCandidates(mockReader);

  const publicApi = candidates.find(c => c.name === 'publicApi');
  assert.ok(publicApi, 'publicApi should be extracted');
  assert.equal(publicApi.isProtected, true, 'publicApi in src/index.ts should be protected by package.json exports');

  const runCli = candidates.find(c => c.name === 'runCli');
  assert.ok(runCli, 'runCli should be extracted');
  assert.equal(runCli.isProtected, true, 'runCli in bin/cli.js should be protected by package.json bin');

  const unusedFunc = candidates.find(c => c.name === 'unusedFunction');
  assert.ok(unusedFunc, 'unusedFunction should be extracted');
  assert.equal(unusedFunc.isProtected, false, 'Internal export should not be protected by default');
});

test('WebAdapter: unreferenced internal export detected as CONFIRMED_ORPHAN', () => {
  const adapter = new WebAdapter();
  const blobsMap = {
    'package.json': JSON.stringify({
      name: 'app',
      main: './src/index.ts',
    }),
    'src/index.ts': `
import { usedHelper } from './internal.ts';
export function main() {
    usedHelper();
}
`,
    'src/internal.ts': `
export function usedHelper() { return 1; }
export function unreferencedDeadExport() { return 2; }
`,
  };

  const solver = new Solver({
    repoDir: process.cwd(),
    ref: 'HEAD',
    adapters: [adapter],
  });

  // Inject mock blobs into solver
  solver.reader = createMockReader(blobsMap);

  const result = solver.solve({ includeAlive: false });
  const deadExport = result.candidates.find(c => c.name === 'unreferencedDeadExport');
  assert.ok(deadExport, 'unreferencedDeadExport should be in orphan candidates');
  assert.equal(deadExport.status, 'CONFIRMED_ORPHAN', 'Unreferenced internal export should be CONFIRMED_ORPHAN');

  const usedHelper = result.candidates.find(c => c.name === 'usedHelper');
  assert.equal(usedHelper, undefined, 'usedHelper is imported in index.ts and should not be an orphan');
});

test('WebAdapter: dynamic import() expression Fail-Closed downgrade', () => {
  const adapter = new WebAdapter();
  const mockReaderWithDynamicImport = createMockReader({
    'src/loader.ts': `
async function loadPlugin(pluginName: string) {
    const mod = await import(\`./plugins/\${pluginName}\`);
    return mod;
}
`,
  });

  assert.equal(adapter.detectReflectionUsage(mockReaderWithDynamicImport), true, 'Dynamic import expression should trigger reflection flag');

  const mockReaderStatic = createMockReader({
    'src/static.ts': `
import { a } from './a';
`,
  });
  assert.equal(adapter.detectReflectionUsage(mockReaderStatic), false, 'Static import should not trigger reflection');
});

test('SolverProtocol S1-S3 suite remains 100% green', async () => {
  const selfTest = await SolverProtocol.runSelfTest({ verbose: false });
  assert.equal(selfTest.passed, true, 'S1-S3 protocol should pass cleanly');
  assert.equal(selfTest.s1.passed, true, 'S1 injection test must pass');
  assert.equal(selfTest.s2.passed, true, 'S2 in-use protection test must pass');
  assert.equal(selfTest.s3.passed, true, 'S3 byte-level reproducibility test must pass');
});
