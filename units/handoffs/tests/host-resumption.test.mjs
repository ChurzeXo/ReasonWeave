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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baton-host-resumption-'));
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
    BATON_SESSION_ID: 'sess-host-auto',
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

  const waitForExit = (proc) => {
    if (proc.exitCode !== null) return Promise.resolve(proc.exitCode);
    return new Promise(resolve => proc.once('close', resolve));
  };

  const cleanup = () => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  };

  return { tmpDir, runBaton, spawnBaton, waitForExit, cleanup };
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

describe('Host Background Task & Autonomous Resumption Suite (v2.42.0)', () => {
  it('Case 1: Tier-1 Reactive Host (Antigravity) Autonomous Resumption End-to-End Simulation', async () => {
    const sandbox = createTestSandbox();
    try {
      const sessionId = 'sess-antigravity-001';
      // 1. 发起方在 Tier-1 宿主环境中建单并转递监听
      const newRes = await sandbox.runBaton(['new', 'audit', 'task', '测试反应式宿主自主唤醒续办'], {
        env: { ANTIGRAVITY_AGENT: '1', BATON_SESSION_ID: sessionId, HANDOFF_LANE: 'impl' }
      });
      assert.equal(newRes.code, 0, 'baton new should succeed');
      const ticketId = extractTicketId(newRes.stdout);
      assert.ok(ticketId, `ticket id should be extracted from: ${newRes.stdout}`);

      // 发起方启动 forward --wait，配置为后台任务
      const forwardProc = sandbox.spawnBaton(['forward', ticketId, '--wait', '--timeout', '5s', '--interval', '200ms'], {
        env: { ANTIGRAVITY_AGENT: '1', BATON_SESSION_ID: sessionId, HANDOFF_LANE: 'impl', BATON_SETTLE_DELAY: '100ms' }
      });
      let forwardOutput = '';
      forwardProc.stdout.on('data', d => forwardOutput += d.toString());
      forwardProc.stderr.on('data', d => forwardOutput += d.toString());

      // 确保监听启动并确认感知到 Tier-1 宿主
      await new Promise((resolve) => {
        const check = () => {
          if (forwardOutput.includes('Antigravity') || forwardProc.exitCode !== null) return resolve();
          setTimeout(check, 50);
        };
        check();
      });
      assert.match(forwardOutput, /Google Antigravity|支持宿主后台任务事件驱动自主唤醒/);

      // 2. 接收方（audit）入站查待办并交付回执
      const auditStatus = await sandbox.runBaton(['status', '--as', 'audit'], {
        env: { BATON_SESSION_ID: 'sess-audit-worker', HANDOFF_LANE: 'audit' }
      });
      assert.equal(auditStatus.code, 0);

      // 获取 audit nonce
      const showRes = await sandbox.runBaton(['show', ticketId], {
        env: { BATON_SESSION_ID: 'sess-audit-worker', HANDOFF_LANE: 'audit' }
      });
      const nonceMatch = showRes.stdout.match(/Audit Nonce:\s*([A-Za-z0-9_-]+)/);
      const auditNonce = nonceMatch ? nonceMatch[1] : undefined;

      const receiptBody = '## 状态 / 结论\n- **结论**：PASS\n\n## 验证\n测试通过\n';
      const receiptArgs = ['receipt', ticketId, '-n', receiptBody, '--deliver', '--as', 'audit', '--evidence-paths', 'README.md'];
      if (auditNonce) receiptArgs.push('--audit-nonce', auditNonce);
      else receiptArgs.push('--auto-nonce');

      const receiptRes = await sandbox.runBaton(receiptArgs, {
        env: { BATON_SESSION_ID: 'sess-audit-worker', HANDOFF_LANE: 'audit' }
      });
      assert.equal(receiptRes.code, 0, `baton receipt should succeed: ${receiptRes.stderr || receiptRes.stdout}`);

      // 3. 发起方的 forwardProc 监听应自动 Exit 0 唤醒
      const exitCode = await sandbox.waitForExit(forwardProc);
      assert.equal(exitCode, 0, 'baton forward --wait should exit 0 upon delivery');
      assert.match(forwardOutput, /交付已就绪|执行方会话已平息|Delivered/);

      // 4. 模拟宿主响应后台任务完成事件唤醒原发起会话：
      // 发起方执行会话恢复首要动作：baton status --current
      const resumeStatus = await sandbox.runBaton(['status', '--current'], {
        env: { ANTIGRAVITY_AGENT: '1', BATON_SESSION_ID: sessionId, HANDOFF_LANE: 'impl' }
      });
      assert.equal(resumeStatus.code, 0);
      assert.match(resumeStatus.stdout, /已交付（待验收）|Delivered \(Pending Acceptance\)/);
      assert.match(resumeStatus.stdout, /等发起方【impl】实测验收|awaiting initiator \[impl\] verification/);

      // 5. 发起方无缝进入独立实测并 close 闭环
      const closeRes = await sandbox.runBaton(['close', ticketId, '-n', '已独立实测验证无误，自动续办闭环', '--as', 'impl'], {
        env: { ANTIGRAVITY_AGENT: '1', BATON_SESSION_ID: sessionId, HANDOFF_LANE: 'impl' }
      });
      assert.equal(closeRes.code, 0, `baton close should succeed: ${closeRes.stderr || closeRes.stdout}`);

      // 6. 最终验证工单已闭环
      const finalStatus = await sandbox.runBaton(['status', '--current'], {
        env: { ANTIGRAVITY_AGENT: '1', BATON_SESSION_ID: sessionId, HANDOFF_LANE: 'impl' }
      });
      assert.match(finalStatus.stdout, /当前会话无关联待办工单|No active tickets|已闭环|In Progress: 0/);
    } finally {
      sandbox.cleanup();
    }
  });

  it('Case 2: Tier-2 Shell-Session Host (e.g. CodeBuddy) Downgrade & Session Resume Simulation', async () => {
    const sandbox = createTestSandbox();
    try {
      const sessionId = 'cb-session-test-8888';
      // 1. 发起方在 CodeBuddy 宿主环境中建单并转递
      const newRes = await sandbox.runBaton(['new', 'audit', 'task', '测试CodeBuddy降级与恢复续办'], {
        env: { CODEBUDDY_SESSION_ID: sessionId, HANDOFF_LANE: 'impl' }
      });
      assert.equal(newRes.code, 0);
      const ticketId = extractTicketId(newRes.stdout);
      assert.ok(ticketId);

      // 启动 wait，检查 Tier-2 降级感知输出
      const waitProc = sandbox.spawnBaton(['wait', ticketId, '--timeout', '5s', '--interval', '200ms'], {
        env: { CODEBUDDY_SESSION_ID: sessionId, HANDOFF_LANE: 'impl', BATON_SETTLE_DELAY: '100ms' }
      });
      let waitOutput = '';
      waitProc.stdout.on('data', d => waitOutput += d.toString());
      waitProc.stderr.on('data', d => waitOutput += d.toString());

      await new Promise((resolve) => {
        const check = () => {
          if (waitOutput.includes('CodeBuddy') || waitProc.exitCode !== null) return resolve();
          setTimeout(check, 50);
        };
        check();
      });
      // 断言感知到 Tier-2 普通 Shell 宿主并打印降级提醒
      assert.match(waitOutput, /CodeBuddy/);
      assert.match(waitOutput, /普通 Shell 会话/);
      assert.match(waitOutput, /严禁将 exec_command session_id 误当成自动唤醒保证/);

      // 2. 对端提交回执并交付
      await sandbox.runBaton(['status', '--as', 'audit'], {
        env: { CODEBUDDY_SESSION_ID: 'cb-audit-sess-222', HANDOFF_LANE: 'audit' }
      });
      const receiptRes = await sandbox.runBaton([
        'receipt', ticketId,
        '-n', '## 状态 / 结论\n- **结论**：PASS\n\n## 验证\n测试通过\n',
        '--deliver',
        '--as', 'audit',
        '--auto-nonce',
        '--evidence-paths', 'README.md'
      ], {
        env: { CODEBUDDY_SESSION_ID: 'cb-audit-sess-222', HANDOFF_LANE: 'audit' }
      });
      assert.equal(receiptRes.code, 0);

      // wait 进程检测到交付后正常退出，退出前打印宿主续办提示
      const exitCode = await sandbox.waitForExit(waitProc);
      assert.equal(exitCode, 0);
      assert.match(waitOutput, /宿主续办提示/);
      assert.match(waitOutput, /Agent 须优先执行 baton status --current 自动续办，严禁向用户索要回执/);

      // 3. 模拟人类发送任意唤醒，发起方恢复交互并执行 baton status --as impl --current
      const resumeStatus = await sandbox.runBaton(['status', '--as', 'impl', '--current'], {
        env: { CODEBUDDY_SESSION_ID: sessionId, HANDOFF_LANE: 'impl' }
      });
      assert.equal(resumeStatus.code, 0);
      // 核心断言：必须显示待我方实测验收，绝不可说“没有待处理交接”！
      assert.match(resumeStatus.stdout, /已交付待我方实测验收|Delivered, awaiting my verification/);
      assert.match(resumeStatus.stdout, /baton show/);
      assert.match(resumeStatus.stdout, /baton close/);
    } finally {
      sandbox.cleanup();
    }
  });

  it('Case 3: Symmetrical Status Visibility between Initiator and Executor for Delivered Tickets', async () => {
    const sandbox = createTestSandbox();
    try {
      const sessionId = 'sess-symm-3333';
      const newRes = await sandbox.runBaton(['new', 'audit', 'task', '测试交付态看板对称可见性'], {
        env: { BATON_SESSION_ID: sessionId, HANDOFF_LANE: 'impl' }
      });
      assert.equal(newRes.code, 0);
      const ticketId = extractTicketId(newRes.stdout);
      assert.ok(ticketId);

      // 前置查状态
      await sandbox.runBaton(['status', '--as', 'audit'], {
        env: { BATON_SESSION_ID: 'sess-symm-audit', HANDOFF_LANE: 'audit' }
      });

      // audit 交付回执
      const receiptRes = await sandbox.runBaton([
        'receipt', ticketId,
        '-n', '## 状态 / 结论\n- **结论**：PASS\n\n## 验证\n验证通过\n',
        '--deliver',
        '--as', 'audit',
        '--auto-nonce',
        '--evidence-paths', 'README.md'
      ], {
        env: { BATON_SESSION_ID: 'sess-symm-audit', HANDOFF_LANE: 'audit' }
      });
      assert.equal(receiptRes.code, 0);

      // 视角 A: 发起方（impl）查看板
      const implStatus = await sandbox.runBaton(['status', '--as', 'impl'], {
        env: { BATON_SESSION_ID: sessionId, HANDOFF_LANE: 'impl' }
      });
      assert.match(implStatus.stdout, /已交付待我方实测验收（1）:|Delivered, awaiting my verification \(1\):/);
      assert.match(implStatus.stdout, /baton show/);

      // 视角 B: 执行方（audit）查看板
      const auditStatus = await sandbox.runBaton(['status', '--as', 'audit'], {
        env: { BATON_SESSION_ID: 'sess-symm-audit', HANDOFF_LANE: 'audit' }
      });
      // 执行方应看到我方已交付等对方验收，而不是被当成我方的待办行动项
      assert.match(auditStatus.stdout, /我方已终态交付（等待发起方实测验收 · 1）:|Delivered by me \(awaiting initiator verification · 1\):/);
      assert.match(auditStatus.stdout, /已终态交付给发起方 lane=impl|Delivered to initiator lane=impl/);
    } finally {
      sandbox.cleanup();
    }
  });

  it('Case 4: Host Capabilities Matrix Verification across Environments', async () => {
    const sandbox = createTestSandbox();
    try {
      const newRes = await sandbox.runBaton(['new', 'audit', 'task', '能力感知测试工单'], {
        env: { BATON_SESSION_ID: 'sess-cap-test' }
      });
      const ticketId = extractTicketId(newRes.stdout);
      assert.ok(ticketId);

      // 测试不同环境变量下的 wait 启动 Banner 探测
      const testWaitBanner = async (env) => {
        const proc = sandbox.spawnBaton(['wait', ticketId, '--timeout', '200ms'], { env: { BATON_SESSION_ID: 'sess-cap-test', ...env } });
        let out = '';
        proc.stdout.on('data', d => {
          out += d.toString();
          if (out.includes('Host Capability') || out.includes('宿主能力感知')) {
            proc.kill();
          }
        });
        proc.stderr.on('data', d => out += d.toString());
        await new Promise(r => proc.on('close', r));
        return out;
      };

      // 1. Antigravity: Tier 1
      const outAntigravity = await testWaitBanner({ ANTIGRAVITY_AGENT: '1' });
      assert.match(outAntigravity, /Google Antigravity/);
      assert.match(outAntigravity, /支持宿主后台任务事件驱动自主唤醒/);

      // 2. CodeBuddy: Tier 2
      const outCodebuddy = await testWaitBanner({ CODEBUDDY_SESSION_ID: 'cb-123' });
      assert.match(outCodebuddy, /CodeBuddy/);
      assert.match(outCodebuddy, /普通 Shell 会话/);

      // 3. WorkBuddy: Tier 2
      const outWorkbuddy = await testWaitBanner({ WORKBUDDY_SESSION_ID: 'wb-123' });
      assert.match(outWorkbuddy, /WorkBuddy/);
      assert.match(outWorkbuddy, /普通 Shell 会话/);

      // 4. Claude Code: Tier 2
      const outClaude = await testWaitBanner({ CLAUDE_SESSION_ID: 'cl-123' });
      assert.match(outClaude, /Claude Code/);
      assert.match(outClaude, /普通 Shell 会话/);

      // 5. Cursor: Tier 2
      const outCursor = await testWaitBanner({ CURSOR_AGENT: '1' });
      assert.match(outCursor, /Cursor/);
      assert.match(outCursor, /普通 Shell 会话/);
    } finally {
      sandbox.cleanup();
    }
  });
});
