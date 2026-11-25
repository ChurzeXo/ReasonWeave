import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HANDOFF_BIN = path.resolve(__dirname, '../handoff.mjs');

function createTestSandbox() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baton-audit-nogo-'));
  execSync('git init -b main', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git config user.name "Test Runner"', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' });
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test Repo\n');
  execSync('git add README.md && git commit -m "initial commit"', { cwd: tmpDir, stdio: 'ignore' });

  const hubConfig = {
    mode: 'intra-repo',
    project: 'test-sandbox',
    lanes: ['impl', 'audit', 'pm'],
    types: ['task', 'bug', 'feature'],
    workspace_default: 'same',
    close_policy: 'sender'
  };
  fs.mkdirSync(path.join(tmpDir, '.handoffs'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.handoffs', '.handoff-hub.json'), JSON.stringify(hubConfig, null, 2));
  fs.mkdirSync(path.join(tmpDir, '.handoffs', 'handoffs'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.handoffs', 'receipts'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.handoffs', 'logs'), { recursive: true });

  const cleanEnv = {
    PATH: process.env.PATH,
    HOME: tmpDir,
    NODE_ENV: 'test',
    BATON_SESSION_ID: 'sess-test-auto',
    BATON_SETTLE_DELAY: '150ms'
  };

  const runBaton = (args, options = {}) => {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [HANDOFF_BIN, ...args], {
        cwd: tmpDir,
        env: { ...cleanEnv, ...(options.env || {}) },
        stdio: 'pipe'
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => stdout += d.toString());
      child.stderr.on('data', d => stderr += d.toString());
      child.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
    });
  };

  const spawnBaton = (args, options = {}) => {
    return spawn(process.execPath, [HANDOFF_BIN, ...args], {
      cwd: tmpDir,
      env: { ...cleanEnv, ...(options.env || {}) },
      stdio: 'pipe'
    });
  };

  const cleanup = () => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  };

  return { tmpDir, runBaton, spawnBaton, cleanup };
}

function extractTicketId(str) {
  if (!str) return null;
  const m0 = str.match(/(?:Created Intra-Repo Baton|已创建仓内交接)\s+([A-Za-z0-9_-]+)/);
  if (m0) return m0[1];
  const m1 = str.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/);
  if (m1) return m1[1];
  const m2 = str.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-\d{2})?)/i);
  if (m2) return m2[1];
  const m3 = str.match(/(session-[A-Za-z0-9_-]+)/i);
  if (m3) return m3[1];
  return null;
}

describe('Audit NO-GO & Rejection Autonomous Wakeup Comprehensive Suite', () => {
  it('Case 1: baton reject immediately wakes up baton forward --wait', async () => {
    const sandbox = createTestSandbox();
    try {
      const newRes = await sandbox.runBaton(['new', 'audit', 'task', '测试工单驳回退回']);
      assert.equal(newRes.code, 0, 'baton new should succeed');
      const ticketId = extractTicketId(newRes.stdout);
      assert.ok(ticketId, `ticket id should be extracted from: ${newRes.stdout}`);

      // 发起方启动 forward --wait
      const forwardProc = sandbox.spawnBaton(['forward', ticketId, '--wait', '--timeout', '5s']);
      let forwardOutput = '';
      forwardProc.stdout.on('data', d => forwardOutput += d.toString());
      forwardProc.stderr.on('data', d => forwardOutput += d.toString());

      // 等待 300ms 确保监听启动
      await new Promise(r => setTimeout(r, 300));

      // 审计方执行 reject
      const rejRes = await sandbox.runBaton(['reject', ticketId, '-n', '代码缺少边界单测，驳回进入Round 2', '--as', 'audit']);
      assert.equal(rejRes.code, 0, 'baton reject should succeed');

      // forwardProc 应该在超时前正常 Exit 0 唤醒
      const exitCode = await new Promise(r => forwardProc.on('close', r));
      assert.equal(exitCode, 0, 'baton forward --wait should wake up with code 0 on rejection');
      assert.match(forwardOutput, /工单被驳回退回|对端已驳回工单/);
    } finally {
      sandbox.cleanup();
    }
  });

  it('Case 2: baton receipt with NO-GO (exempt from audit_nonce) immediately wakes up baton forward --wait', async () => {
    const sandbox = createTestSandbox();
    try {
      const newRes = await sandbox.runBaton(['new', 'audit', 'task', '测试未带Nonce的负向回执自动唤醒'], {
        env: { BATON_SESSION_ID: 'sess-case2' }
      });
      assert.equal(newRes.code, 0);
      const ticketId = extractTicketId(newRes.stdout);
      assert.ok(ticketId);

      // 满足「先查状态」前置门禁
      await sandbox.runBaton(['status', '--as', 'audit'], {
        env: { BATON_SESSION_ID: 'sess-audit-receiver', HANDOFF_LANE: 'audit' }
      });

      // 发起方启动 forward --wait
      const forwardProc = sandbox.spawnBaton(['forward', ticketId, '--wait', '--timeout', '5s', '--interval', '200ms'], {
        env: { BATON_SESSION_ID: 'sess-case2', BATON_SETTLE_DELAY: '100ms' }
      });
      let forwardOutput = '';
      forwardProc.stdout.on('data', d => forwardOutput += d.toString());
      forwardProc.stderr.on('data', d => forwardOutput += d.toString());

      await new Promise(r => setTimeout(r, 600));

      // 审计方登记 NO-GO 回执，不传 --audit-nonce（附带 --evidence-note 满足回执内容门禁）
      const nogoText = `## 状态 / 结论\n- **结论**：REJECTED / NO-GO\n- **说明**：实测发现逻辑死锁，裁决不通过。\n\n## 审查记录\n- 失败用例复现。`;
      const receiptRes = await sandbox.runBaton(['receipt', ticketId, '-n', nogoText, '--evidence-note', '实测复现死锁用例', '--as', 'audit'], {
        env: { BATON_SESSION_ID: 'sess-audit-receiver', HANDOFF_LANE: 'audit' }
      });
      assert.equal(receiptRes.code, 0, `baton receipt without nonce should be allowed for NO-GO: ${receiptRes.stderr}`);

      // 验证 forward 探针能被正确唤醒（过去会一直挂起直至超时！）
      const exitCode = await new Promise(r => forwardProc.on('close', r));
      assert.equal(exitCode, 0, 'baton forward --wait must wake up when negative receipt is settled');
      assert.match(forwardOutput, /回执未通过唤醒|检测到交接/);
    } finally {
      sandbox.cleanup();
    }
  });

  it('Case 3: baton forward supports --settle flag without confusing duration as ticket id', async () => {
    const sandbox = createTestSandbox();
    try {
      const newRes = await sandbox.runBaton(['new', 'audit', 'task', '测试forward settle参数支持']);
      assert.equal(newRes.code, 0);
      const ticketId = extractTicketId(newRes.stdout);
      assert.ok(ticketId);

      // 使用 --settle 200ms
      const forwardProc = sandbox.spawnBaton(['forward', ticketId, '--wait', '--timeout', '4s', '--settle', '200ms']);
      let forwardOutput = '';
      forwardProc.stdout.on('data', d => forwardOutput += d.toString());
      forwardProc.stderr.on('data', d => forwardOutput += d.toString());

      await new Promise(r => setTimeout(r, 300));

      // 触发 reject
      await sandbox.runBaton(['reject', ticketId, '-n', '驳回测试', '--as', 'audit']);

      const exitCode = await new Promise(r => forwardProc.on('close', r));
      assert.equal(exitCode, 0, 'forward with --settle 200ms should parse flags correctly and exit 0');
      assert.doesNotMatch(forwardOutput, /找不到交接.*200ms/, 'duration flag must not be mistaken as ticket id');
    } finally {
      sandbox.cleanup();
    }
  });

  it('Case 4: atomic write in reject ensures no half-written frontmatter', async () => {
    const sandbox = createTestSandbox();
    try {
      const newRes = await sandbox.runBaton(['new', 'audit', 'task', '测试原子写入']);
      assert.equal(newRes.code, 0);
      const ticketId = extractTicketId(newRes.stdout);
      assert.ok(ticketId);

      const rejRes = await sandbox.runBaton(['reject', ticketId, '-n', '原子性验证驳回', '--as', 'audit']);
      assert.equal(rejRes.code, 0);

      const ticketPath = path.join(sandbox.tmpDir, '.handoffs', 'handoffs', `${ticketId}.md`);
      const content = fs.readFileSync(ticketPath, 'utf8');

      // 验证工单 frontmatter 完整且已包含 rejected_at 和 round: 2
      assert.match(content, /rejected_at:/);
      assert.match(content, /round:\s*2/);
      assert.match(content, /## 驳回记录/);
    } finally {
      sandbox.cleanup();
    }
  });
});
