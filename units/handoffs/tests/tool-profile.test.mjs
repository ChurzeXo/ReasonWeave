import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Tool Profile Enforcement (ADR-0012 §2.6 / ADR-0009 反假接线)', () => {
  const cliPath = path.resolve('units/handoffs/handoff.mjs');
  const defaultEnv = { ...process.env, HANDOFF_STATUS_GATE: 'off' };

  test('--profile readonly creates ticket with tool_profile: readonly', () => {
    const rawOut = execSync(`node "${cliPath}" new audit task "Test Profile Readonly" --profile readonly`, {
      encoding: 'utf8',
      stdio: 'pipe',
      env: defaultEnv,
    });
    const match = rawOut.match(/([a-f0-9\-]+|audit-\d+-\d+-task)/i);
    assert.ok(match, 'Should extract created ticket ID');
    const ticketId = match[1];
    const ticketPath = path.resolve('.handoffs/handoffs', `${ticketId}.md`);

    try {
      assert.ok(fs.existsSync(ticketPath), 'Ticket file should exist');
      const content = fs.readFileSync(ticketPath, 'utf8');
      assert.match(content, /tool_profile: readonly/);

      // 核验 baton show 展示
      const showOut = execSync(`node "${cliPath}" show ${ticketId}`, { encoding: 'utf8', stdio: 'pipe', env: defaultEnv });
      assert.match(showOut, /tool_profile: readonly \(只读探查：严格禁止修改生产源码\)/);

      // 核验 prompt card 生成展示
      const promptOut = execSync(`node "${cliPath}" prompt ${ticketId}`, { encoding: 'utf8', stdio: 'pipe', env: defaultEnv });
      assert.match(promptOut, /tool_profile=readonly/);
    } finally {
      if (fs.existsSync(ticketPath)) fs.unlinkSync(ticketPath);
    }
  });

  test('tool_profile=readonly blocks receipt claiming production code mutations', () => {
    const rawOut = execSync(`node "${cliPath}" new audit task "Test Readonly Violation" --profile readonly`, {
      encoding: 'utf8',
      stdio: 'pipe',
      env: defaultEnv,
    });
    const match = rawOut.match(/([a-f0-9\-]+|audit-\d+-\d+-task)/i);
    assert.ok(match, 'Should extract created ticket ID');
    const ticketId = match[1];
    const ticketPath = path.resolve('.handoffs/handoffs', `${ticketId}.md`);
    const respPath = path.resolve('.handoffs/receipts', `${ticketId}-resp.md`);

    try {
      // 试图提交包含生产代码改动 (bin/lab.mjs) 的回执，必须被门禁拦截
      assert.throws(() => {
        execSync(
          `node "${cliPath}" receipt ${ticketId} -n "## 结论\\n- **结论**：PASS" --as audit --auto-nonce --evidence-paths "bin/lab.mjs"`,
          { encoding: 'utf8', stdio: 'pipe', env: defaultEnv }
        );
      }, (err) => {
        return err.status === 1 || err.stderr?.includes('Tool Profile 约束违例');
      });

      // 提交只读探查报告与证据 (.handoffs/reviews/test-evidence.log)，必须被允许
      const testEvidencePath = path.resolve('.handoffs/reviews', 'test-evidence.log');
      fs.mkdirSync(path.dirname(testEvidencePath), { recursive: true });
      fs.writeFileSync(testEvidencePath, 'Sample test evidence output');

      assert.doesNotThrow(() => {
        execSync(
          `node "${cliPath}" receipt ${ticketId} -n "## 结论\\n- **结论**：PASS" --as audit --auto-nonce --evidence-paths ".handoffs/reviews/test-evidence.log"`,
          { encoding: 'utf8', stdio: 'pipe', env: defaultEnv }
        );
      });
      assert.ok(fs.existsSync(respPath), 'Readonly receipt should be created successfully');
      if (fs.existsSync(testEvidencePath)) fs.unlinkSync(testEvidencePath);
    } finally {
      if (fs.existsSync(ticketPath)) fs.unlinkSync(ticketPath);
      if (fs.existsSync(respPath)) fs.unlinkSync(respPath);
    }
  });
});
