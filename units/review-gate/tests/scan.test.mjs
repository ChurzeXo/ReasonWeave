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
      const data = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
      assert.equal(data.engine, 'opengrep', 'Output JSON should contain engine: opengrep');
      assert.equal(data.fallback, false, 'Output JSON should contain fallback: false');
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
      const dataPen = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
      assert.equal(dataPen.engine, 'opengrep', 'Output JSON in penetration mode should contain engine: opengrep');
      assert.equal(dataPen.fallback, false, 'Output JSON in penetration mode should contain fallback: false');
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

  test('pre-commit ruff fallback parses JSON array correctly and blocks new findings', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precommit-ruff-'));
    try {
      execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'pipe' });

      // 准备基线文件
      fs.mkdirSync(path.join(tmpDir, 'review-gate/baseline'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'review-gate/baseline/baseline.json'), JSON.stringify({ results: [] }));

      // 创建一个 mock ruff 返回 S102 漏洞
      const mockBinDir = path.join(tmpDir, 'bin');
      fs.mkdirSync(mockBinDir, { recursive: true });
      const mockRuff = path.join(mockBinDir, 'ruff');
      fs.writeFileSync(
        mockRuff,
        `#!/bin/sh
echo '[{"code":"S102","filename":"'"$tmpDir"'/test.py","message":"Use of exec","location":{"row":1,"column":1},"end_location":{"row":1,"column":10}}]'
exit 1
`,
        { mode: 0o755 }
      );

      // 创建并暂存 test.py
      fs.writeFileSync(path.join(tmpDir, 'test.py'), 'exec("bad")\n');
      execSync('git add test.py', { cwd: tmpDir, stdio: 'pipe' });

      // 运行 pre-commit，验证它捕获到了 Ruff 的新发现并阻断 (Exit 1)
      let failed = false;
      try {
        execSync(
          `OPENGREP_BIN=/tmp/nonexistent PATH="${mockBinDir}:$PATH" bash "${preCommit}"`,
          { cwd: tmpDir, stdio: 'pipe', encoding: 'utf8' }
        );
      } catch (err) {
        failed = true;
        const out = (err.stdout || '') + (err.stderr || '');
        assert.match(out, /Ruff Bandit gate: 1 new finding\(s\) beyond accepted baseline/);
      }
      assert.ok(failed, 'pre-commit under ruff fallback must block when new finding exists');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('pre-commit scans staged blob in git index, ignoring post-stage modifications in working tree', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precommit-staged-'));
    try {
      execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'pipe' });

      fs.mkdirSync(path.join(tmpDir, 'review-gate/baseline'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'review-gate/baseline/baseline.json'), JSON.stringify({ results: [] }));

      const mockBinDir = path.join(tmpDir, 'bin');
      fs.mkdirSync(mockBinDir, { recursive: true });
      const mockRuff = path.join(mockBinDir, 'ruff');
      fs.writeFileSync(
        mockRuff,
        `#!/bin/sh
cat <<EOF
[{"code":"S102","filename":"$1","message":"Use of exec","location":{"row":1,"column":1},"end_location":{"row":1,"column":10}}]
EOF
exit 1
`,
        { mode: 0o755 }
      );

      // 1. 危险内容暂存到 index
      fs.writeFileSync(path.join(tmpDir, 'vuln.py'), 'exec("staged_vulnerability")\n');
      execSync('git add vuln.py', { cwd: tmpDir, stdio: 'pipe' });

      // 2. 工作区立刻修改为干净代码（但未 git add）
      fs.writeFileSync(path.join(tmpDir, 'vuln.py'), '# safe code in working tree\n');

      // 3. 运行 pre-commit：必须依然能够检测到暂存区中的漏洞并拦截！
      let failed = false;
      try {
        execSync(
          `OPENGREP_BIN=/tmp/nonexistent PATH="${mockBinDir}:$PATH" bash "${preCommit}"`,
          { cwd: tmpDir, stdio: 'pipe', encoding: 'utf8' }
        );
      } catch (err) {
        failed = true;
        const out = (err.stdout || '') + (err.stderr || '');
        assert.match(out, /Ruff Bandit gate: 1 new finding\(s\) beyond accepted baseline/);
      }
      assert.ok(failed, 'pre-commit must scan git index blob and block even if working tree is clean');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('clean-runner preserves multiline script blocks without breaking on newlines', () => {
    const cleanRunnerPath = path.resolve('units/review-gate/clean-runner.mjs');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-runner-test-'));
    try {
      execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'pipe' });

      // 创建一个工单文件包含多行验收判据代码块（有 cd 和多行命令）
      const handoffsDir = path.join(tmpDir, '.handoffs/handoffs');
      fs.mkdirSync(handoffsDir, { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'subdir'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'subdir/file.txt'), 'hello');

      const ticketContent = `---
id: TICKET-TEST-001
---
## 验收判据
\`\`\`bash
cd subdir
test -f file.txt
\`\`\`
`;
      fs.writeFileSync(path.join(handoffsDir, 'TICKET-TEST-001.md'), ticketContent);

      const out = execSync(
        `node "${cleanRunnerPath}" run TICKET-TEST-001 --json`,
        { cwd: tmpDir, encoding: 'utf8', stdio: 'pipe' }
      );
      const parsed = JSON.parse(out);
      assert.equal(parsed.allPassed, true, 'Multiline cd + test -f file.txt block must execute in single shell and pass');
      assert.equal(parsed.results.length, 1, 'Should execute as 1 consolidated script block rather than splitting lines');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
