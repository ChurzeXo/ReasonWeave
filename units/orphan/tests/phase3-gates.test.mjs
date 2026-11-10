/**
 * Unit Tests for units/orphan Phase 3 Gates (DiffChecker, Cleaner, Preflight Hook)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DiffChecker } from '../core/diff-checker.mjs';
import { Cleaner } from '../core/cleaner.mjs';

test('DiffChecker: parseDiff correctly extracts added lines and new files', () => {
  const sampleDiff = `
diff --git a/src/new_module.py b/src/new_module.py
new file mode 100644
--- /dev/null
+++ b/src/new_module.py
@@ -0,0 +1,5 @@
+def brand_new_function():
+    pass
+
+class BrandNewClass:
+    pass
diff --git a/src/existing.ts b/src/existing.ts
--- a/src/existing.ts
+++ b/src/existing.ts
@@ -10,0 +11,2 @@
+export const NEW_EXPORT = 42;
+export function newHelper() {}
`;

  const parsed = DiffChecker.parseDiff(sampleDiff);
  assert.equal(parsed.length, 2, 'Should parse 2 files from diff');

  const pyFile = parsed.find(f => f.path === 'src/new_module.py');
  assert.ok(pyFile);
  assert.equal(pyFile.isNewFile, true);
  assert.equal(pyFile.addedLines.length, 5);

  const tsFile = parsed.find(f => f.path === 'src/existing.ts');
  assert.ok(tsFile);
  assert.equal(tsFile.isNewFile, false);
  assert.equal(tsFile.addedLines.length, 2);
  assert.equal(tsFile.addedLines[0].text, 'export const NEW_EXPORT = 42;');
});

test('DiffChecker: extractAddedCandidates extracts Python & TS candidate declarations', () => {
  const checker = new DiffChecker();

  const pyCandidates = checker.extractAddedCandidates('src/util.py', [
    { lineNo: 1, text: 'def orphan_calc():' },
    { lineNo: 2, text: '    return 1' },
    { lineNo: 3, text: 'def test_something():' },
    { lineNo: 4, text: '    pass' },
  ], false);

  const orphanCalc = pyCandidates.find(c => c.name === 'orphan_calc');
  assert.ok(orphanCalc);
  assert.equal(orphanCalc.isProtected, false);

  const testSomething = pyCandidates.find(c => c.name === 'test_something');
  assert.ok(testSomething);
  assert.equal(testSomething.isProtected, true, 'pytest test_* should be protected');

  const tsCandidates = checker.extractAddedCandidates('src/index.ts', [
    { lineNo: 10, text: 'export function activeApi() {}' },
    { lineNo: 11, text: 'export const STALE_TOKEN = "xyz";' },
  ], false);

  assert.equal(tsCandidates.length, 2);
  assert.equal(tsCandidates[0].name, 'activeApi');
  assert.equal(tsCandidates[1].name, 'STALE_TOKEN');
});

test('Cleaner: dry-run generates unified diff without modifying files', () => {
  const tmpDir = path.join(process.cwd(), '.tmp_test_cleaner_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const testFile = path.join(tmpDir, 'service.py');
  const initialContent = [
    'def active_function():',
    '    return "active"',
    '',
    'def orphan_dead_function():',
    '    return "dead"',
    '',
    'def another_active():',
    '    return "ok"',
  ].join('\n');

  fs.writeFileSync(testFile, initialContent, 'utf8');

  try {
    const cleaner = new Cleaner({
      repoDir: tmpDir,
      dryRun: true,
    });

    const candidates = [
      {
        id: 'orphan-1',
        name: 'orphan_dead_function',
        type: 'function',
        path: 'service.py',
        line_no: 4,
        status: 'CONFIRMED_ORPHAN',
      },
    ];

    const result = cleaner.clean(candidates);
    assert.equal(result.dryRun, true);
    assert.equal(result.cleanedCount, 1);
    assert.ok(result.unifiedDiff.includes('-def orphan_dead_function():'));
    assert.ok(result.unifiedDiff.includes('diff --git a/service.py b/service.py'));

    // Assert that file on disk is strictly untouched
    const currentDiskContent = fs.readFileSync(testFile, 'utf8');
    assert.equal(currentDiskContent, initialContent, 'Dry-run must not modify file content on disk');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Preflight Hook: 30-orphan-guard script executes with exit 0 on clean state', () => {
  const hookScript = path.join(process.cwd(), 'units/orphan/templates/pre-commit.d/30-orphan-guard');
  assert.ok(fs.existsSync(hookScript), '30-orphan-guard template must exist');

  const out = execFileSync('bash', [hookScript], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
  });

  assert.ok(out.includes('Orphan Check-Diff') || out.includes('增量防腐门禁检查'));
});
