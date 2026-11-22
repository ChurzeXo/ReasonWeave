import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.resolve(__dirname, '..', 'handoff.mjs');

function createTestRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baton-profile-test-'));
  // 初始化最小 git 仓库
  execSync('git init -b main', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git config user.name "Test Runner"', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' });
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test Repo\n');
  fs.writeFileSync(path.join(tmpDir, 'index.js'), 'console.log("hello");\n');
  execSync('git add README.md index.js && git commit -m "initial commit"', { cwd: tmpDir, stdio: 'ignore' });

  // 初始化仓内 Baton Hub 夹具
  const hubConfig = {
    mode: 'intra-repo',
    project: 'test-project',
    targets: ['core'],
    lanes: ['impl', 'audit'],
    types: ['task', 'bug', 'feature'],
    workspace_default: 'same',
    close_policy: 'sender'
  };
  fs.mkdirSync(path.join(tmpDir, '.handoffs', 'handoffs'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.handoffs', 'receipts'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.handoffs', 'logs'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.handoffs', '.handoff-hub.json'), JSON.stringify(hubConfig, null, 2));

  return tmpDir;
}

function extractTicketId(str) {
  if (!str) return null;
  const m0 = str.match(/(?:Created Intra-Repo Baton|已创建仓内交接)\s+([A-Za-z0-9_-]+)/i);
  if (m0) return m0[1];
  const m1 = str.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-\d{2})?)/i);
  if (m1) return m1[1];
  const m2 = str.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/i);
  if (m2) return m2[1];
  const m3 = str.match(/(session-[A-Za-z0-9_-]+)/i);
  if (m3) return m3[1];
  return null;
}

function runBaton(tmpDir, cmdArgs, extraEnv = {}) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.BATON_SESSION_ID;
  delete cleanEnv.ANTIGRAVITY_CONVERSATION_ID;
  delete cleanEnv.CURSOR_CONVERSATION_ID;
  delete cleanEnv.CLAUDE_CONVERSATION_ID;
  delete cleanEnv.CLAUDE_SESSION_ID;
  delete cleanEnv.WORKBUDDY_CONVERSATION_ID;
  delete cleanEnv.WORKBUDDY_SESSION_ID;
  delete cleanEnv.CODEBUDDY_CONVERSATION_ID;
  delete cleanEnv.CODEBUDDY_SESSION_ID;
  delete cleanEnv.CODEBUDDY_SANDBOX_BROKER_SESSION_ID;
  delete cleanEnv.WORKBUDDY_SANDBOX_BROKER_SESSION_ID;
  delete cleanEnv.WINDSURF_CONVERSATION_ID;
  delete cleanEnv.TERM_SESSION_ID;
  delete cleanEnv.SESSION_ID;
  delete cleanEnv.BAGGAGE;
  delete cleanEnv.BATON_ID_FORMAT;

  const envObj = {
    ...cleanEnv,
    CI: 'true',
    BATON_NO_NOTIFY: '1',
    HANDOFF_STATUS_GATE: 'off',
    ...extraEnv,
  };

  return execSync(`node "${CLI_PATH}" ${cmdArgs}`, {
    cwd: tmpDir,
    encoding: 'utf8',
    stdio: 'pipe',
    env: envObj,
  });
}

describe('Tool Profile Enforcement (ADR-0012 §2.6 / ADR-0009 反假接线)', () => {
  test('--profile readonly creates ticket with tool_profile: readonly', () => {
    const tmpDir = createTestRepo();
    try {
      const rawOut = runBaton(tmpDir, 'new audit task "Test Profile Readonly" --profile readonly');
      const ticketId = extractTicketId(rawOut);
      assert.ok(ticketId, `Should extract created ticket ID from: ${rawOut}`);
      const ticketPath = path.join(tmpDir, '.handoffs', 'handoffs', `${ticketId}.md`);

      assert.ok(fs.existsSync(ticketPath), `Ticket file should exist at ${ticketPath}`);
      const content = fs.readFileSync(ticketPath, 'utf8');
      assert.match(content, /tool_profile: readonly/);

      // 核验 baton show 展示
      const showOut = runBaton(tmpDir, `show ${ticketId}`);
      assert.match(showOut, /tool_profile: readonly \(只读探查：严格禁止修改生产源码\)/);

      // 核验 prompt card 生成展示
      const promptOut = runBaton(tmpDir, `prompt ${ticketId}`);
      assert.match(promptOut, /tool_profile=readonly/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('tool_profile=readonly blocks receipt claiming production code mutations', () => {
    const tmpDir = createTestRepo();
    try {
      const rawOut = runBaton(tmpDir, 'new audit task "Test Readonly Violation" --profile readonly');
      const ticketId = extractTicketId(rawOut);
      assert.ok(ticketId, `Should extract created ticket ID from: ${rawOut}`);
      const ticketPath = path.join(tmpDir, '.handoffs', 'handoffs', `${ticketId}.md`);
      const respPath = path.join(tmpDir, '.handoffs', 'receipts', `${ticketId}-resp.md`);

      // 试图提交包含生产代码改动 (index.js) 的回执，必须被门禁拦截
      assert.throws(() => {
        runBaton(tmpDir, `receipt ${ticketId} -n "## 结论\\n- **结论**：PASS" --as audit --auto-nonce --evidence-paths "index.js"`);
      }, (err) => {
        return err.status === 1 || err.stderr?.includes('Tool Profile 约束违例');
      });

      // 提交只读探查报告与证据 (.handoffs/reviews/test-evidence.log)，必须被允许
      const testEvidencePath = path.join(tmpDir, '.handoffs', 'reviews', 'test-evidence.log');
      fs.mkdirSync(path.dirname(testEvidencePath), { recursive: true });
      fs.writeFileSync(testEvidencePath, 'Sample test evidence output');

      assert.doesNotThrow(() => {
        runBaton(tmpDir, `receipt ${ticketId} -n "## 结论\\n- **结论**：PASS" --as audit --auto-nonce --evidence-paths ".handoffs/reviews/test-evidence.log"`);
      });
      assert.ok(fs.existsSync(respPath), 'Readonly receipt should be created successfully');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
