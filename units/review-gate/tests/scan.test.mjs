import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Review-Gate Scan.sh Tests', () => {
  const scanSh = path.resolve('units/review-gate/templates/scan.sh');
  const preCommit = path.resolve('units/review-gate/templates/pre-commit');

  test('scan.sh and pre-commit pass bash -n syntax checks', () => {
    assert.doesNotThrow(() => {
      execSync(`bash -n "${scanSh}"`, { stdio: 'pipe' });
      execSync(`bash -n "${preCommit}"`, { stdio: 'pipe' });
    });
  });

  test('scan.sh contains anti-suppression flags', () => {
    const content = fs.readFileSync(scanSh, 'utf8');
    assert.match(content, /no-suppress/);
    assert.match(content, /disable-nosem/);
  });

  test('scan.sh default mode runs under /bin/bash without unbound variable crash', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-og-def-'));
    const mockOg = path.join(tmpDir, 'opengrep');
    const argsFile = path.join(tmpDir, 'args.txt');
    const tmpOut = path.join(tmpDir, 'out.json');

    try {
      // 模拟 opengrep 二进制，捕捉 scan.sh 在 /bin/bash (bash 3.2) 下的真实参数展开
      fs.writeFileSync(
        mockOg,
        `#!/bin/sh
echo "$@" > "${argsFile}"
out=""
prev=""
for a in "$@"; do
  if [ "$prev" = "--output" ]; then
    out="$a"
  fi
  prev="$a"
done
if [ -n "$out" ]; then
  echo '{"results":[],"version":"1.30.2"}' > "$out"
fi
exit 0
`,
        { mode: 0o755 }
      );

      const stdout = execSync(
        `OPENGREP_BIN="${mockOg}" /bin/bash "${scanSh}" "${tmpOut}"`,
        { stdio: 'pipe', encoding: 'utf8' }
      );

      assert.match(stdout, /wrote .* \(engine: opengrep\)/);
      assert.ok(fs.existsSync(tmpOut), 'Output file should be written');
      const recordedArgs = fs.readFileSync(argsFile, 'utf8');
      assert.ok(!recordedArgs.includes('--disable-nosem'), 'Default mode should not include --disable-nosem');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('scan.sh penetration mode (--no-suppress) passes --disable-nosem under /bin/bash', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-og-pen-'));
    const mockOg = path.join(tmpDir, 'opengrep');
    const argsFile = path.join(tmpDir, 'args.txt');
    const tmpOut = path.join(tmpDir, 'out.json');

    try {
      fs.writeFileSync(
        mockOg,
        `#!/bin/sh
echo "$@" > "${argsFile}"
out=""
prev=""
for a in "$@"; do
  if [ "$prev" = "--output" ]; then
    out="$a"
  fi
  prev="$a"
done
if [ -n "$out" ]; then
  echo '{"results":[],"version":"1.30.2"}' > "$out"
fi
exit 0
`,
        { mode: 0o755 }
      );

      const stdout = execSync(
        `OPENGREP_BIN="${mockOg}" /bin/bash "${scanSh}" --no-suppress "${tmpOut}"`,
        { stdio: 'pipe', encoding: 'utf8' }
      );

      assert.match(stdout, /Anti-Suppression 穿透模式/);
      assert.match(stdout, /wrote .* \(engine: opengrep\)/);
      assert.ok(fs.existsSync(tmpOut), 'Output file should be written');
      const recordedArgs = fs.readFileSync(argsFile, 'utf8');
      assert.ok(recordedArgs.includes('--disable-nosem'), 'Penetration mode must include --disable-nosem');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('scan.sh fallback honest metadata output in JSON', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-ruff-'));
    const mockRuff = path.join(tmpDir, 'ruff');
    const tmpOut = path.join(tmpDir, 'fallback-out.json');

    try {
      fs.writeFileSync(
        mockRuff,
        '#!/bin/sh\necho \'[{"code":"S102","filename":"vuln.py","message":"Use of exec","location":{"row":1,"column":1},"end_location":{"row":1,"column":10}}]\'\n',
        { mode: 0o755 }
      );

      execSync(
        `OPENGREP_BIN=/tmp/nonexistent PATH="${tmpDir}:$PATH" /bin/bash "${scanSh}" "${tmpOut}"`,
        { stdio: 'pipe', encoding: 'utf8' }
      );

      assert.ok(fs.existsSync(tmpOut), 'Fallback output file should be written');
      const data = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
      assert.equal(data.engine, 'fallback-ruff-bandit');
      assert.equal(data.fallback, true);
      assert.ok(Array.isArray(data.results));
      assert.equal(data.results[0].check_id, 'S102');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
