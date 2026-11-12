import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const HANDOFF_BIN = path.resolve('units/handoffs/handoff.mjs');

function createTestRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baton-audit-test-'));
  // init git repo
  execSync('git init -b main', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git config user.name "Test Runner"', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' });
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test Repo\n');
  execSync('git add README.md && git commit -m "initial commit"', { cwd: tmpDir, stdio: 'ignore' });

  // init intra-repo baton hub
  const hubConfig = {
    mode: 'intra-repo',
    project: 'test-project',
    targets: ['core'],
    lanes: ['impl', 'audit'],
    types: ['task', 'bug', 'feature'],
    workspace_default: 'same',
    close_policy: 'sender'
  };
  fs.mkdirSync(path.join(tmpDir, '.handoffs'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.handoffs', '.handoff-hub.json'), JSON.stringify(hubConfig, null, 2));
  fs.mkdirSync(path.join(tmpDir, '.handoffs', 'handoffs'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.handoffs', 'receipts'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.handoffs', 'logs'), { recursive: true });

  return tmpDir;
}

function runBaton(tmpDir, args, extraEnv = {}) {
  try {
    const out = execSync(`node ${HANDOFF_BIN} ${args}`, {
      cwd: tmpDir,
      encoding: 'utf-8',
      env: { ...process.env, CI: 'true', BATON_NO_NOTIFY: '1', HANDOFF_STATUS_GATE: 'off', HANDOFF_LANE: 'audit', ...extraEnv }
    });
    return { status: 0, stdout: out, stderr: '' };
  } catch (err) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : ''
    };
  }
}

describe('Agent Baton: Audit Receipt & Nonce Lifecycle Test Suite', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTestRepo();
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1. 派发 audit 工单自动生成 Audit Nonce，show 与 status --for audit 可见', () => {
    const res = runBaton(tmpDir, 'new audit task "审计 Redmi 12C 驱动" --from impl');
    assert.equal(res.status, 0, `new should succeed: ${res.stderr}\n${res.stdout}`);
    const match = res.stdout.match(/(audit-\d+-\d+-task)/);
    assert.ok(match, '应匹配到工单 ID');
    const id = match[1];

    // check show
    const showRes = runBaton(tmpDir, `show ${id}`);
    assert.equal(showRes.status, 0);
    assert.match(showRes.stdout, /audit_nonce:/);

    // check show --nonce
    const nonceRes = runBaton(tmpDir, `show ${id} --nonce`);
    assert.equal(nonceRes.status, 0);
    const nonce = nonceRes.stdout.trim();
    assert.ok(nonce.length >= 16, `nonce 应具备有效长度: ${nonce}`);

    // check status --for audit contains Nonce
    const statusForAudit = runBaton(tmpDir, 'status --for audit');
    assert.equal(statusForAudit.status, 0);
    assert.ok(statusForAudit.stdout.includes(nonce), 'status --for audit 应展示 nonce');
  });

  it('2. to_lane=audit 提交回执强制核验 Nonce：缺 Nonce、伪造 Nonce 或跨工单 Nonce 均硬拒', () => {
    const res1 = runBaton(tmpDir, 'new audit task "任务 1" --from impl');
    const id1 = res1.stdout.match(/(audit-\d+-\d+-task)/)[1];
    const res2 = runBaton(tmpDir, 'new audit task "任务 2" --from impl');
    const id2 = res2.stdout.match(/(audit-\d+-\d+-task)/)[1];

    const nonce1 = runBaton(tmpDir, `show ${id1} --nonce`).stdout.trim();
    const nonce2 = runBaton(tmpDir, `show ${id2} --nonce`).stdout.trim();

    // 缺少 nonce 提交回执
    const noNonce = runBaton(tmpDir, `receipt ${id1} -n "## 状态 / 结论\\n- **结论**：PASS" --evidence-paths "README.md"`);
    assert.notEqual(noNonce.status, 0, '缺 nonce 应被拒绝');
    assert.match(noNonce.stderr + noNonce.stdout, /Audit Nonce/);

    // 伪造 nonce 提交回执
    const fakeNonce = runBaton(tmpDir, `receipt ${id1} -n "## 状态 / 结论\\n- **结论**：PASS" --audit-nonce "fake-nonce-12345" --evidence-paths "README.md"`);
    assert.notEqual(fakeNonce.status, 0, '伪造 nonce 应被拒绝');
    assert.match(fakeNonce.stderr + fakeNonce.stdout, /Audit Nonce/);

    // 跨工单 nonce 提交回执（用 task 2 的 nonce 填给 task 1）
    const crossNonce = runBaton(tmpDir, `receipt ${id1} -n "## 状态 / 结论\\n- **结论**：PASS" --audit-nonce "${nonce2}" --evidence-paths "README.md"`);
    assert.notEqual(crossNonce.status, 0, '跨工单 nonce 应被拒绝');
    assert.match(crossNonce.stderr + crossNonce.stdout, /Audit Nonce/);

    // 正确 nonce 提交回执
    const valid = runBaton(tmpDir, `receipt ${id1} -n "## 状态 / 结论\\n- **结论**：PASS" --audit-nonce "${nonce1}" --evidence-paths "README.md"`);
    assert.equal(valid.status, 0, `正确 nonce 提交应成功: ${valid.stderr}`);
  });

  it('3. INCOMPLETE / NO-GO 审计回执状态一致性与防抢跑交付拦截', () => {
    const res = runBaton(tmpDir, 'new audit task "真机验收" --from impl');
    const id = res.stdout.match(/(audit-\d+-\d+-task)/)[1];
    const nonce = runBaton(tmpDir, `show ${id} --nonce`).stdout.trim();

    // 提交受阻回执（INCOMPLETE / NO-GO，缺失真机条件）
    const receiptContent = `## 状态 / 结论\\n- **结论**：INCOMPLETE / NO-GO\\n- **说明**：缺失 Redmi 12C 真机环境，挂起等待。`;
    const rRes = runBaton(tmpDir, `receipt ${id} -n "${receiptContent}" --audit-nonce "${nonce}" --evidence-note "真机缺席挂起"`);
    assert.equal(rRes.status, 0, `受阻回执登记应成功: ${rRes.stderr}`);

    // 验证工单、回执和 journal 状态一致性：needs_change 必须为 true
    const showRes = runBaton(tmpDir, `show ${id}`);
    assert.match(showRes.stdout, /needs_change:\s*true/);

    const ticketPath = path.join(tmpDir, '.handoffs', 'handoffs', `${id}.md`);
    const receiptPath = path.join(tmpDir, '.handoffs', 'receipts', `${id}-resp.md`);
    const ticketContent = fs.readFileSync(ticketPath, 'utf-8');
    const receiptActual = fs.readFileSync(receiptPath, 'utf-8');

    assert.match(ticketContent, /needs_change:\s*true/);
    assert.match(receiptActual, /needs_change:\s*true/);

    // 验证 state-journal.jsonl 记录
    const journalPath = path.join(tmpDir, '.handoffs', 'logs', 'state-journal.jsonl');
    const journalLines = fs.readFileSync(journalPath, 'utf-8').trim().split('\n').map(JSON.parse);
    const receiptEvent = journalLines.find(e => e.op === 'receipt' && e.id === id);
    assert.ok(receiptEvent, 'journal 应包含 receipt 事件');
    assert.equal(receiptEvent.needs_change, true, 'journal 中 needs_change 必须为 true');

    // 验证 status 展现：必须分流至 recvBlocked（审计未通过/受阻待处理），不得分流至 recvReady（待终态交付）
    const statusForAudit = runBaton(tmpDir, 'status --for audit');
    assert.equal(statusForAudit.status, 0);
    assert.match(statusForAudit.stdout, /(?:审计未通过\/受阻待处理|Incomplete \/ Blocked \/ Revision Needed)/);
    assert.doesNotMatch(statusForAudit.stdout, /(?:已写回执待终态交付|Draft receipts awaiting final delivery)/);
    assert.match(statusForAudit.stdout, /(?:严禁执行 deliver|do not deliver)/);

    // 验证全局 status 不报超时告警
    const globalStatus = runBaton(tmpDir, 'status');
    assert.doesNotMatch(globalStatus.stdout, /(?:received 超时|received >10m without deliver)/);

    // 验证 deliver 强拦截：严禁将 INCOMPLETE / NO-GO 或 needs_change:true 标记 deliver
    const deliverRes = runBaton(tmpDir, `deliver ${id}`);
    assert.notEqual(deliverRes.status, 0, 'deliver 必须被硬性拒绝');
    assert.match(deliverRes.stderr + deliverRes.stdout, /(?:拒绝交付|禁止交付|未通过|严禁执行 deliver)/);
  });

  it('4. 审计方（to_lane=audit）可直接执行 reject 打回整改并轮转 Nonce', () => {
    const res = runBaton(tmpDir, 'new audit task "待整改任务" --from impl');
    const id = res.stdout.match(/(audit-\d+-\d+-task)/)[1];
    const initialNonce = runBaton(tmpDir, `show ${id} --nonce`).stdout.trim();

    // 审计方直接打回整改
    const rejectRes = runBaton(tmpDir, `reject ${id} -n "缺少真机环境与自动化测试用例" --by audit`);
    assert.equal(rejectRes.status, 0, `reject 应成功: ${rejectRes.stderr}\n${rejectRes.stdout}`);

    const showAfterReject = runBaton(tmpDir, `show ${id}`);
    assert.match(showAfterReject.stdout, /rejected_at:/);
    assert.match(showAfterReject.stdout, /reject_count:\s*1/);
    assert.match(showAfterReject.stdout, /needs_change:\s*true/);

    // 此时 status --for impl 应将工单视作收到驳回待整改
    const statusForImpl = runBaton(tmpDir, 'status --for impl');
    assert.match(statusForImpl.stdout, /(?:待整改|reopen|revision)/i);

    // 驳回已自动轮转 Audit Nonce
    const newNonce = runBaton(tmpDir, `show ${id} --nonce`).stdout.trim();
    assert.notEqual(newNonce, initialNonce, 'reject 必须轮转并生成新的 audit_nonce');
  });

  it('5. baton check <id> 单工单定向校验与 --fix 历史漂移自愈', () => {
    const res = runBaton(tmpDir, 'new audit task "定向校验与修复" --from impl');
    const id = res.stdout.match(/(audit-\d+-\d+-task)/)[1];
    const nonce = runBaton(tmpDir, `show ${id} --nonce`).stdout.trim();

    // 先写一份正常回执
    const rRes = runBaton(tmpDir, `receipt ${id} -n "## 状态 / 结论\\n- **结论**：PASS" --audit-nonce "${nonce}" --evidence-paths "README.md"`);
    assert.equal(rRes.status, 0);

    // 单工单定向 check 应顺利通过
    const checkSingle = runBaton(tmpDir, `check ${id}`);
    assert.equal(checkSingle.status, 0, `check ${id} 应通过: ${checkSingle.stderr}\n${checkSingle.stdout}`);

    // 人为模拟历史数据漂移：回执文件被人为改成 needs_change: true，但工单文件仍为 false
    const receiptPath = path.join(tmpDir, '.handoffs', 'receipts', `${id}-resp.md`);
    let rContent = fs.readFileSync(receiptPath, 'utf-8');
    rContent = rContent.replace('needs_change: false', 'needs_change: true');
    fs.writeFileSync(receiptPath, rContent, 'utf-8');

    // 此时 check 应该能检测出漂移
    const checkDrift = runBaton(tmpDir, `check ${id}`);
    assert.notEqual(checkDrift.status, 0, '检测到 needs_change 漂移时 check 应当报错');
    assert.match(checkDrift.stderr + checkDrift.stdout, /needs_change 不一致/);

    // 运行 baton check <id> --fix 进行自愈
    const fixRes = runBaton(tmpDir, `check ${id} --fix`);
    assert.equal(fixRes.status, 0, `check --fix 应执行成功: ${fixRes.stderr}\n${fixRes.stdout}`);
    assert.match(fixRes.stdout, /已安全修复 needs_change 一致性/);

    // 验证工单文件已同步修复为 true
    const ticketPath = path.join(tmpDir, '.handoffs', 'handoffs', `${id}.md`);
    const fixedTicket = fs.readFileSync(ticketPath, 'utf-8');
    assert.match(fixedTicket, /needs_change:\s*true/);

    // 再次定向 check 应完全通过
    const checkAfterFix = runBaton(tmpDir, `check ${id}`);
    assert.equal(checkAfterFix.status, 0, '修复后定向 check 应恢复 exit 0');
  });

  it('6. Double-Blind (物理双盲) Fail-Closed 门禁与思维链脱敏验证', () => {
    const res = runBaton(tmpDir, 'new audit task "双盲脱敏测试" --from impl');
    const id = res.stdout.match(/(audit-\d+-\d+-task)/)[1];
    const ticketPath = path.join(tmpDir, '.handoffs', 'handoffs', `${id}.md`);

    // 1. 无验收判据时运行 forward --blind，必须 Fail-Closed 报错退出
    let content = fs.readFileSync(ticketPath, 'utf-8');
    content = content.replace(/## 验收判据[\s\S]*?(?=\n## |$)/, '');
    fs.writeFileSync(ticketPath, content, 'utf-8');

    const failForward = runBaton(tmpDir, `forward ${id} --blind --no-wait`);
    assert.notEqual(failForward.status, 0, '缺少验收判据时 forward --blind 必须 Fail-Closed');
    assert.match(failForward.stderr, /(?:双盲脱敏门禁|Double-Blind Gate)/);

    // 2. 注入思维链与自辩内容及有效验收判据
    const rawWithExcuses = `---
handoff_id: ${id}
mode: intra-repo
from_lane: impl
to_lane: audit
status: draft
---

# 双盲脱敏测试

<thinking>
这是我不该给审计方看到的思维链过程...
</thinking>

## 目标
测试双盲脱敏。

## 自辩
这部分是开发过程中的诉苦和辩解，不应给第三方看。

## 验收判据
- [ ] 判据 1：测试通过
`;
    fs.writeFileSync(ticketPath, rawWithExcuses, 'utf-8');

    // 3. 执行 forward --blind
    const okForward = runBaton(tmpDir, `forward ${id} --blind --no-wait`);
    assert.equal(okForward.status, 0, `forward --blind 应当成功: ${okForward.stderr}\n${okForward.stdout}`);
    assert.match(okForward.stdout, /(?:物理双盲已生效|Double-Blind Active)/);

    // 4. 验证思维链与自辩小节被物理净化，且 frontmatter 烙印 blind: true
    const sanitized = fs.readFileSync(ticketPath, 'utf-8');
    assert.match(sanitized, /blind:\s*true/);
    assert.doesNotMatch(sanitized, /<thinking>/);
    assert.doesNotMatch(sanitized, /## 自辩/);
    assert.match(sanitized, /## 验收判据/);

    // 5. 验证 status 视图与 show 视图呈现 [Blind: true]
    const showRes = runBaton(tmpDir, `show ${id}`);
    assert.match(showRes.stdout, /- blind:\s*true/);

    const statusRes = runBaton(tmpDir, 'status');
    assert.match(statusRes.stdout, /\[Blind:\s*true\]/);

    // 6. 验证 prompt 包含物理双盲提示
    const promptRes = runBaton(tmpDir, `prompt ${id}`);
    assert.match(promptRes.stdout, /(?:物理双盲审计模式已开启|Double-Blind Audit Active)/);
  });
});
