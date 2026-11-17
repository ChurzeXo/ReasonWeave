import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync, spawn } from 'node:child_process';

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


function extractTicketId(str) {
  const m = str && str.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/);
  return m ? m[1] : null;
}
function runBaton(tmpDir, args, extraEnv = {}) {
  const asMatch = args.match(/--as\s+([a-zA-Z0-9_-]+)/);
  const defaultLane = asMatch ? asMatch[1] : 'audit';
  try {
    const out = execSync(`node ${HANDOFF_BIN} ${args}`, {
      cwd: tmpDir,
      encoding: 'utf-8',
      env: { ...process.env, CI: 'true', BATON_NO_NOTIFY: '1', HANDOFF_STATUS_GATE: 'off', HANDOFF_LANE: defaultLane, ...extraEnv }
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
    const match = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/);
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
    const id1 = res1.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];
    const res2 = runBaton(tmpDir, 'new audit task "任务 2" --from impl');
    const id2 = res2.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

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
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];
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

  it('4. 审计方（to_lane=audit）可直接对 forwarded 工单执行 reject 打回整改并轮转 Nonce', () => {
    const res = runBaton(tmpDir, 'new audit task "待整改任务" --from impl');
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];
    const initialNonce = runBaton(tmpDir, `show ${id} --nonce`).stdout.trim();

    // 先转递工单，使其确定处于 forwarded 状态
    const forwardRes = runBaton(tmpDir, `forward ${id} --no-wait`);
    assert.equal(forwardRes.status, 0);

    const showForwarded = runBaton(tmpDir, `show ${id}`);
    assert.match(showForwarded.stdout, /status:\s*forwarded/);

    // 审计方直接打回整改（必须成功驳回，严禁静默报已是 forwarded 跳过）
    const rejectRes = runBaton(tmpDir, `reject ${id} -n "缺少真机环境与自动化测试用例" --by audit`);
    assert.equal(rejectRes.status, 0, `reject 应成功: ${rejectRes.stderr}\n${rejectRes.stdout}`);
    assert.match(rejectRes.stdout, /已驳回退回/);
    assert.doesNotMatch(rejectRes.stdout, /跳过/);

    const showAfterReject = runBaton(tmpDir, `show ${id}`);
    assert.match(showAfterReject.stdout, /rejected_at:/);
    assert.match(showAfterReject.stdout, /rejected_by:\s*audit/);
    assert.match(showAfterReject.stdout, /reject_count:\s*1/);
    assert.match(showAfterReject.stdout, /needs_change:\s*true/);

    // 驳回后生成的回执文件合规且 check <id> 必须通过
    const checkAfterReject = runBaton(tmpDir, `check ${id}`);
    assert.equal(checkAfterReject.status, 0, `check 应通过: ${checkAfterReject.stderr}\n${checkAfterReject.stdout}`);

    // status --for audit 应显示在「我方已驳回退回」，且不得出现在「待 audit 处理」
    const statusForAudit = runBaton(tmpDir, 'status --for audit');
    assert.match(statusForAudit.stdout, /(?:我方已驳回退回|My rejections awaiting revision)/i);
    assert.doesNotMatch(statusForAudit.stdout, /(?:待 audit 处理|Pending for audit)/i);

    // 此时 status --for impl 应将工单视作收到驳回待整改
    const statusForImpl = runBaton(tmpDir, 'status --for impl');
    assert.match(statusForImpl.stdout, /(?:收到驳回待整改|Rejections received awaiting revision)/i);

    // 驳回已自动轮转 Audit Nonce
    const newNonce = runBaton(tmpDir, `show ${id} --nonce`).stdout.trim();
    assert.notEqual(newNonce, initialNonce, 'reject 必须轮转并生成新的 audit_nonce');

    // impl 执行 forward（如挂起监听），在尚未完成交付前，绝不可误入待 audit 处理
    const reforwardRes = runBaton(tmpDir, `forward ${id} --no-wait`, { HANDOFF_LANE: 'impl' });
    assert.equal(reforwardRes.status, 0);

    const statusAfterReforward = runBaton(tmpDir, 'status --for audit');
    assert.match(statusAfterReforward.stdout, /(?:我方已驳回退回|My rejections awaiting revision)/i);
    assert.doesNotMatch(statusAfterReforward.stdout, /(?:待 audit 处理|Pending for audit)/i);
  });

  it('5. baton check <id> 单工单定向校验与 --fix 历史漂移自愈', () => {
    const res = runBaton(tmpDir, 'new audit task "定向校验与修复" --from impl');
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];
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
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];
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

  it('7. 普通实现执行方（impl 等）越权 reject 必须被严格拦截', () => {
    const res = runBaton(tmpDir, 'new impl task "实现功能模块" --from audit');
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 普通执行方（impl）尝试对发给自己的工单执行 reject
    const illegalReject = runBaton(tmpDir, `reject ${id} -n "我不做，打回" --by impl`, { HANDOFF_LANE: '' });
    assert.notEqual(illegalReject.status, 0, '执行方不得越权 reject');
    assert.match(illegalReject.stderr + illegalReject.stdout, /(?:越界驳回|仅允许由发起方或审计方|CROSS_LANE_IMPERSONATION_BLOCKED)/);
  });

  it('8. Audit Nonce 缺失诊断与受控重签 (baton nonce <id> 与 baton show <id> --nonce)', () => {
    const res = runBaton(tmpDir, 'new audit task "测试 Nonce 完整生命周期" --from impl');
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];
    const ticketPath = path.join(tmpDir, '.handoffs', 'handoffs', `${id}.md`);

    // 人为模拟工单缺少 audit_nonce
    let content = fs.readFileSync(ticketPath, 'utf-8');
    content = content.replace(/audit_nonce:[^\n]+\n/, '');
    fs.writeFileSync(ticketPath, content, 'utf-8');

    // show --nonce 缺 nonce 时必须 exit 1 报错，严禁 exit 0 输出空行
    const failShow = runBaton(tmpDir, `show ${id} --nonce`);
    assert.notEqual(failShow.status, 0, '缺 nonce 时 show --nonce 必须返回非 0');
    assert.match(failShow.stderr, /(?:缺少 Audit Nonce|reissue)/);

    // status --for audit 应显示 Nonce 缺失告警
    const statusForAudit = runBaton(tmpDir, 'status --for audit');
    assert.match(statusForAudit.stdout, /(?:Nonce 缺失|reissue)/);

    // 执行 baton nonce <id> --reissue 受控补发
    const reissueRes = runBaton(tmpDir, `nonce ${id} --reissue`);
    assert.equal(reissueRes.status, 0, 'nonce --reissue 必须成功');
    const newNonce = reissueRes.stdout.trim();
    assert.ok(newNonce.startsWith('AUDIT-'), '应签发有效格式的 Audit Nonce');

    // 重新运行 show --nonce 必须顺利返回新签发的 nonce
    const okShow = runBaton(tmpDir, `show ${id} --nonce`);
    assert.equal(okShow.status, 0);
    assert.equal(okShow.stdout.trim(), newNonce);

    // 针对非 audit 工单调用 baton nonce 必须拦截
    const implRes = runBaton(tmpDir, 'new impl task "普通任务" --from audit');
    const implId = implRes.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];
    const illegalNonce = runBaton(tmpDir, `nonce ${implId}`);
    assert.notEqual(illegalNonce.status, 0);
    assert.match(illegalNonce.stderr, /非审计工单/);
  });

  it('9. baton check --fix 自动补发缺失的 Audit Nonce', () => {
    const res = runBaton(tmpDir, 'new audit task "测试 check --fix 补发 Nonce" --from impl');
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];
    const ticketPath = path.join(tmpDir, '.handoffs', 'handoffs', `${id}.md`);

    // 人为抹除 audit_nonce
    let content = fs.readFileSync(ticketPath, 'utf-8');
    content = content.replace(/audit_nonce:[^\n]+\n/, '');
    fs.writeFileSync(ticketPath, content, 'utf-8');

    // 运行 check --fix 自动自愈
    const fixRes = runBaton(tmpDir, `check ${id} --fix`);
    assert.equal(fixRes.status, 0);
    assert.match(fixRes.stdout, /补发缺失的 Audit Nonce/);

    // 验证工单已被注入有效 Nonce
    const nonceAfterFix = runBaton(tmpDir, `show ${id} --nonce`).stdout.trim();
    assert.ok(nonceAfterFix.startsWith('AUDIT-'));
  });

  it('10. [Phase 1] 审计防伪门禁解耦：受阻/NO-GO草稿回执豁免 Nonce 登记，但交付闸门严格拦截', () => {
    const res = runBaton(tmpDir, 'new audit task "测试受阻草稿回执豁免 Nonce" --from impl');
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 登记未通过/受阻回执（不带 --audit-nonce 且未带 --deliver）
    const draftRes = runBaton(tmpDir, `receipt ${id} -n "## 状态 / 结论\\n- **结论**：INCOMPLETE / NO-GO\\n- **说明**：硬件环境缺失暂不交付" --evidence-note "环境缺失"`);
    assert.equal(draftRes.status, 0, `负向草稿回执应允许免 Nonce 登记: ${draftRes.stderr}\n${draftRes.stdout}`);
    assert.match(draftRes.stdout, /已登记仓内回执/);

    // 回执状态已成为 received，needs_change: true
    const showRes = runBaton(tmpDir, `show ${id}`);
    assert.match(showRes.stdout, /status:\s*received/);
    assert.match(showRes.stdout, /needs_change:\s*true/);

    // 尝试直接调用 deliver 进行终态交付，必须被交付闸门拦截
    const deliverRes = runBaton(tmpDir, `deliver ${id}`);
    assert.notEqual(deliverRes.status, 0, '受阻或缺 Nonce 的交付必须被拦截');
    assert.match(deliverRes.stderr + deliverRes.stdout, /(?:拒绝交付|Audit Nonce)/);
  });

  it('11. [Phase 1] 无条件安全下车通道：reject 与 reopen 永远豁免状态快照门禁', () => {
    const res = runBaton(tmpDir, 'new audit task "测试下车通道豁免" --from impl');
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 显式开启 HANDOFF_STATUS_GATE=on，模拟未看 status 视图的全新冷启动环境
    const rejectRes = runBaton(tmpDir, `reject ${id} -n "发现重大缺陷立即打回" --by audit`, {
      HANDOFF_STATUS_GATE: 'on'
    });
    assert.equal(rejectRes.status, 0, `reject 应当拥有无条件安全下车通道: ${rejectRes.stderr}\n${rejectRes.stdout}`);
    assert.match(rejectRes.stdout, /已驳回退回/);
  });

  it('12. [Phase 1] 发起方（from_lane）可主动驳回/撤回已派发工单，严禁静默跳过', () => {
    const res = runBaton(tmpDir, 'new impl task "实现某模块" --from audit');
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 发起方（audit）主动打回已转递给 impl 的工单
    const fromReject = runBaton(tmpDir, `reject ${id} -n "需求变更有重大调整，撤回重新规划" --by audit`);
    assert.equal(fromReject.status, 0, `发起方驳回应成功: ${fromReject.stderr}\n${fromReject.stdout}`);
    assert.match(fromReject.stdout, /已驳回退回/);

    const showRes = runBaton(tmpDir, `show ${id}`);
    assert.match(showRes.stdout, /rejected_by:\s*audit/);
    assert.match(showRes.stdout, /needs_change:\s*true/);
  });

  it('13. [Phase 2] --as <lane> 显式身份：脱离 HANDOFF_LANE 环境变量完成回执、交付与闭环', () => {
    // 创建一个 from=audit, to=impl 的工单
    const res = runBaton(tmpDir, 'new impl task "实现数据解析器" --from audit');
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 在完全清空 HANDOFF_LANE 环境变量的环境下，通过 --as impl 登记回执并交付
    const receiptRes = runBaton(tmpDir, `receipt ${id} -n "## 状态 / 结论\\n- **结论**：PASS\\n## 交付物\\n- 完成解析器实现" --as impl --deliver --evidence-paths "README.md"`, {
      HANDOFF_LANE: ''
    });
    assert.equal(receiptRes.status, 0, `使用 --as impl 回执与交付应成功: ${receiptRes.stderr}\n${receiptRes.stdout}`);
    assert.match(receiptRes.stdout, /交付成功/);

    // 验证回执中的 author_lane 与 delivered_by_lane 记录为 impl
    const receiptContent = fs.readFileSync(path.join(tmpDir, '.handoffs', 'receipts', `${id}-resp.md`), 'utf-8');
    assert.match(receiptContent, /author_lane:\s*impl/);
    assert.match(receiptContent, /delivered_by_lane:\s*impl/);

    // 在同一清空环境变量的环境下，通过 --as audit 进行发起方验收闭环
    const acceptRes = runBaton(tmpDir, `accept ${id} -n "解析器功能完整且测试通过" --as audit`, {
      HANDOFF_LANE: '',
      BATON_SESSION_ID: 'audit-acceptor-session'
    });
    assert.equal(acceptRes.status, 0, `使用 --as audit 验收闭环应成功: ${acceptRes.stderr}\n${acceptRes.stdout}`);
    assert.match(acceptRes.stdout, /已审计闭环/);

    const showClosed = runBaton(tmpDir, `show ${id}`);
    assert.match(showClosed.stdout, /status:\s*closed/);
  });

  it('14. [Phase 2] 同会话多工单并发流转：同一对话内无缝处理不同角色的多个工单', () => {
    // 同一环境下创建两个不同方向的工单
    const resA = runBaton(tmpDir, 'new impl task "工单 A: 待 impl 处理" --from audit');
    const idA = resA.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    const resB = runBaton(tmpDir, 'new audit task "工单 B: 待 audit 审计" --from impl');
    const idB = resB.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];
    const nonceB = runBaton(tmpDir, `show ${idB} --nonce`).stdout.trim();

    // 在同一个没有任何环境变量切换的环境中：
    // 1. Agent 以 impl 身份交付工单 A
    const delivA = runBaton(tmpDir, `receipt ${idA} -n "## 状态 / 结论\\n- **结论**：PASS" --as impl --deliver --evidence-paths "README.md"`, { HANDOFF_LANE: '' });
    assert.equal(delivA.status, 0);

    // 2. Agent 紧接着以 audit 身份对工单 B 执行驳回打回整改
    const rejectB = runBaton(tmpDir, `reject ${idB} -n "缺少边界用例，打回" --as audit`, { HANDOFF_LANE: '' });
    assert.equal(rejectB.status, 0);
    assert.match(rejectB.stdout, /已驳回退回/);

    // 3. 审计方会话对刚才交付的工单 A 执行最终验收闭环（利益冲突隔离：严禁实现方会话自审自闭环）
    const acceptA = runBaton(tmpDir, `accept ${idA} -n "审计通过" --as audit`, { HANDOFF_LANE: '', BATON_SESSION_ID: 'audit-session' });
    assert.equal(acceptA.status, 0);
    assert.match(acceptA.stdout, /已审计闭环/);

    // 4. status --as audit 能够准确查出工单 B 处于「我方已驳回退回」，工单 A 已经闭环
    const statusAudit = runBaton(tmpDir, 'status --as audit', { HANDOFF_LANE: '' });
    assert.equal(statusAudit.status, 0);
    assert.match(statusAudit.stdout, /(?:我方已驳回退回|My rejections awaiting revision)/i);
  });

  it('15. [Phase 2] --as 越权防护依然生效：冒充或非指定角色操作严密拦截', () => {
    const res = runBaton(tmpDir, 'new impl task "测试越权拦截" --from audit');
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 1. 尝试使用 --as audit（发起方）自填回执，必须被拦截
    const illegalReceipt = runBaton(tmpDir, `receipt ${id} -n "## 状态 / 结论\\n- **结论**：PASS" --as audit --evidence-paths "README.md"`, { HANDOFF_LANE: '' });
    assert.notEqual(illegalReceipt.status, 0, '发起方自填回执必须被拦截');
    assert.match(illegalReceipt.stderr + illegalReceipt.stdout, /(?:禁止自填回执|不是该交接指定接收方)/);

    // 2. 正常以 --as impl 写回执并交付
    const okDeliver = runBaton(tmpDir, `receipt ${id} -n "## 状态 / 结论\\n- **结论**：PASS" --as impl --deliver --evidence-paths "README.md"`, {
      HANDOFF_LANE: '',
      BATON_SESSION_ID: 'impl-executor-session'
    });
    assert.equal(okDeliver.status, 0);

    // 3. 尝试使用 --as impl（执行方）自我闭环，必须被拦截
    const illegalAccept = runBaton(tmpDir, `accept ${id} -n "我自己验收通过" --as impl`, { HANDOFF_LANE: '' });
    assert.notEqual(illegalAccept.status, 0, '执行方禁止自我闭环');
    assert.match(illegalAccept.stderr + illegalAccept.stdout, /(?:执行方禁止自审自闭环|不是发起方)/);
  });

  it('16. [Phase 3] 同跨仓数据模型归一化：统一使用 needs_change 并无缝兼容历史 needs_iggle_change', () => {
    const res = runBaton(tmpDir, 'new impl task "测试数据模型归一化" --from audit');
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 登记一份正常交付回执
    const okDeliver = runBaton(tmpDir, `receipt ${id} -n "## 状态 / 结论\\n- **结论**：PASS" --as impl --deliver --evidence-paths "README.md"`, { HANDOFF_LANE: '' });
    assert.equal(okDeliver.status, 0);

    // 人为模拟历史遗留文件：仅含 needs_iggle_change: true，缺失 needs_change
    const ticketPath = path.join(tmpDir, '.handoffs', 'handoffs', `${id}.md`);
    let content = fs.readFileSync(ticketPath, 'utf-8');
    content = content.replace(/needs_change:[^\n]+\n/, 'needs_iggle_change: true\n');
    fs.writeFileSync(ticketPath, content, 'utf-8');

    // baton show <id> 应能正确读取归一化后的 needs_change: true 并兼容展示
    const showRes = runBaton(tmpDir, `show ${id}`);
    assert.equal(showRes.status, 0);
    assert.match(showRes.stdout, /needs_change:\s*true/);

    // 运行 baton check <id>，由于回执为 false，工单通过历史字段解析出 true，应精准检出不一致
    const checkDrift = runBaton(tmpDir, `check ${id}`);
    assert.notEqual(checkDrift.status, 0, '应检出 needs_change 与历史 needs_iggle_change 对账漂移');
    assert.match(checkDrift.stderr + checkDrift.stdout, /needs_change 不一致/);

    // 运行 check --fix，自动自愈对齐为规范的 needs_change
    const fixRes = runBaton(tmpDir, `check ${id} --fix`);
    assert.equal(fixRes.status, 0);

    const checkFixed = runBaton(tmpDir, `check ${id}`);
    assert.equal(checkFixed.status, 0, '自愈后 check 必须顺利通过 exit 0');
  });

  it('17. [Phase 4] 运行时确定性自愈与轻量韧性接入桩（v2.29.0）', () => {
    // 1. 验证错误自愈引导：报错中必须包含明确可复制的一键自愈命令
    const res = runBaton(tmpDir, 'new impl task "测试自愈命令与轻量桩" --from audit');
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 1.1 内容门禁未过时的自愈引导
    const badContentReceipt = runBaton(tmpDir, `receipt ${id} -n "缺少锚节与证据" --as impl`, { HANDOFF_LANE: '' });
    assert.notEqual(badContentReceipt.status, 0);
    assert.match(badContentReceipt.stderr + badContentReceipt.stdout, /👉 可运行:\s*baton receipt/, '内容门禁未过时必须提供自愈建议');

    // 1.2 状态快照未读/过期时的自愈引导
    // 清除 os.tmpdir() 中的 status stamp 模拟未查验状态
    fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('handoff-last-status-')).forEach(f => {
      try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch {}
    });
    const unreadAccept = runBaton(tmpDir, `accept ${id} -n "验收通过" --as audit`, {
      HANDOFF_STATUS_GATE: 'on',
      HANDOFF_LANE: '',
    });
    assert.notEqual(unreadAccept.status, 0);
    assert.match(unreadAccept.stderr + unreadAccept.stdout, /👉 可运行:\s*baton status/, '状态门禁未过时必须提供自愈建议');

    // 2. 验证轻量韧性接入桩安装与 doctor 检测
    const installRes = runBaton(tmpDir, 'install --project');
    assert.equal(installRes.status, 0);

    const doctorRes = runBaton(tmpDir, 'doctor');
    assert.equal(doctorRes.status, 0);
    assert.match(doctorRes.stdout, /桩版本 == 引擎版本 \(v2\.35\.2\)/);

    // 3. 验证接入桩内容体积与规范：去恐吓化且长度显著精简
    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    const agentsContent = fs.readFileSync(agentsPath, 'utf-8');
    assert.match(agentsContent, /handoff-stub:v2\.1/);
    assert.match(agentsContent, /v2\.35\.2/);
    assert.match(agentsContent, /--as <lane>/);
    // 接入桩正文应保持轻量韧性（小于 4200 字符，远小于旧版 8000+ 字符，去恐吓化）
    const stubMatch = agentsContent.match(/<!-- handoff-stub:v2\.1 begin -->([\s\S]*?)<!-- handoff-stub:v2\.1 end -->/);
    assert.ok(stubMatch, '必须找到接入桩标记');
    assert.ok(stubMatch[1].length < 4200, `接入桩应保持轻量，当前长度: ${stubMatch[1].length}`);
  });

  it('18. 连续多轮驳回历史无损继承与防冲刷（防模板空标题冲刷、精准小节定位追加）', () => {
    const tmpDir = createTestRepo();
    const res = runBaton(tmpDir, 'new impl task "测试多轮驳回历史保护" --from audit');
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 1. 第 1 轮驳回
    const rej1 = runBaton(tmpDir, `reject ${id} -n "第1轮驳回：缺少真机用例" --as audit`);
    assert.equal(rej1.status, 0);

    const rPath = path.join(tmpDir, '.handoffs', 'receipts', `${id}-resp.md`);
    assert.ok(fs.existsSync(rPath), '第1轮驳回应自动创建回执');
    let rContent = fs.readFileSync(rPath, 'utf-8');
    assert.match(rContent, /第1轮驳回：缺少真机用例/);

    // 2. 执行方收到驳回后进行整改，提交回执（模拟 Agent 模板自带空 ## 驳回记录 和后续章节）并交付
    fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'export const a = 1;');
    const receiptBody1 = [
      '## 状态 / 结论',
      '- **结论**：PASS',
      '',
      '## 驳回记录',
      '',
      '## 验收证据',
      '- Modified Paths: index.ts',
      '- Result Output: 100% pass',
      '',
      '## 遗留与建议',
      '- 无',
    ].join('\n');

    const receipt1 = runBaton(tmpDir, `receipt ${id} -n "${receiptBody1}" --evidence-paths "index.ts" --deliver --as impl`, { HANDOFF_LANE: '' });
    assert.equal(receipt1.status, 0, `第1次整改交付应当成功: ${receipt1.stderr}\n${receipt1.stdout}`);

    rContent = fs.readFileSync(rPath, 'utf-8');
    assert.match(rContent, /第1轮驳回：缺少真机用例/, '模板带有空标题时历史第1轮记录不能被抹除');

    // 3. 审计方进行第 2 轮驳回：验证第2轮记录精准追加在 ## 驳回记录 小节内，且在 ## 验收证据 之前
    const rej2 = runBaton(tmpDir, `reject ${id} -n "第2轮驳回：单元测试未覆盖边界" --as audit`);
    assert.equal(rej2.status, 0);

    rContent = fs.readFileSync(rPath, 'utf-8');
    assert.match(rContent, /第1轮驳回：缺少真机用例/, '第1轮驳回记录必须保留');
    assert.match(rContent, /第2轮驳回：单元测试未覆盖边界/, '第2轮驳回记录必须追加');

    // 检查小节顺序：第2轮驳回必须在 ## 验收证据 之前！
    const rejSectionIdx2 = rContent.indexOf('## 驳回记录');
    const rej2Idx = rContent.indexOf('第2轮驳回：单元测试未覆盖边界');
    const evidenceIdx2 = rContent.indexOf('## 验收证据');

    assert.ok(rejSectionIdx2 < rej2Idx, '第2轮驳回必须在 ## 驳回记录 小节之后');
    assert.ok(rej2Idx < evidenceIdx2, '第2轮驳回必须在 ## 验收证据 之前，严禁盲目追加至文末！');

    // 4. 执行方进行第 2 次整改并交付（这次不带 ## 驳回记录 节，测试缺省自动继承）
    fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'export const a = 2;\nexport const b = 3;');
    const receiptBody2 = [
      '## 状态 / 结论',
      '- **结论**：PASS (Second Try)',
      '',
      '## 验收证据',
      '- Modified Paths: index.ts',
      '- Result Output: 100% pass',
    ].join('\n');

    const receipt2 = runBaton(tmpDir, `receipt ${id} -n "${receiptBody2}" --evidence-paths "index.ts" --deliver --as impl`, { HANDOFF_LANE: '' });
    assert.equal(receipt2.status, 0);

    rContent = fs.readFileSync(rPath, 'utf-8');
    assert.match(rContent, /第1轮驳回：缺少真机用例/, '第2次整改必须继承第1轮驳回');
    assert.match(rContent, /第2轮驳回：单元测试未覆盖边界/, '第2次整改必须继承第2轮驳回');

    // 5. 审计方进行第 3 轮驳回
    const rej3 = runBaton(tmpDir, `reject ${id} -n "第3轮驳回：发现性能退化" --as audit`);
    assert.equal(rej3.status, 0);

    rContent = fs.readFileSync(rPath, 'utf-8');
    assert.match(rContent, /第1轮驳回：缺少真机用例/);
    assert.match(rContent, /第2轮驳回：单元测试未覆盖边界/);
    assert.match(rContent, /第3轮驳回：发现性能退化/);
  });

  it('19. Windows CRLF 换行符全生命周期无感兼容（frontmatter/正文剥离/交付状态）', () => {
    // 1. 创建工单
    const res = runBaton(tmpDir, 'new impl task "测试 Windows 平台换行符" --from lead', { HANDOFF_LANE: 'lead' });
    assert.equal(res.status, 0);
    const m = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/);
    assert.ok(m, '应匹配到工单 ID');
    const id = m[1];
    const ticketPath = path.join(tmpDir, '.handoffs', 'handoffs', `${id}.md`);

    // 强行将工单换行符转换为 CRLF (\r\n) 模拟 Windows Git checkout
    let content = fs.readFileSync(ticketPath, 'utf8');
    content = content.replace(/\r?\n/g, '\r\n');
    fs.writeFileSync(ticketPath, content, 'utf8');
    assert.ok(content.includes('\r\n'), '工单文件必须包含 CRLF');

    // 2. 状态查看验证
    const statusRes = runBaton(tmpDir, 'status', { HANDOFF_LANE: 'impl' });
    assert.equal(statusRes.status, 0);
    assert.ok(statusRes.stdout.includes(id), 'status 应正常解析 CRLF 工单 ID');

    // 3. show 验证
    const showRes = runBaton(tmpDir, `show ${id}`, { HANDOFF_LANE: 'impl' });
    assert.equal(showRes.status, 0);
    assert.ok(showRes.stdout.includes('- status: draft'), 'show 应在 CRLF 下正确提取状态');
    assert.ok(showRes.stdout.includes('- to_lane: impl'), 'show 应在 CRLF 下正确提取接收方');

    // 4. 提交带有 CRLF 的回执
    const receiptBody = [
      '## 状态 / 结论',
      '- **结论**：PASS',
      '- **修复状态**：完成',
      '',
      '## 验收证据',
      '- paths: README.md'
    ].join('\r\n');

    const receiptRes = runBaton(tmpDir, `receipt ${id} -n "${receiptBody}" --evidence-paths "README.md" --deliver --as impl`, { HANDOFF_LANE: '' });
    assert.equal(receiptRes.status, 0, `receipt deliver 应该成功: ${receiptRes.stderr}\n${receiptRes.stdout}`);

    // 将回执文件也转换为纯 CRLF
    const rPath = path.join(tmpDir, '.handoffs', 'receipts', `${id}-resp.md`);
    let rContent = fs.readFileSync(rPath, 'utf8');
    rContent = rContent.replace(/\r?\n/g, '\r\n');
    fs.writeFileSync(rPath, rContent, 'utf8');

    // 5. 验收方 status 检查交付状态
    const statusDelivered = runBaton(tmpDir, 'status', { HANDOFF_LANE: 'lead' });
    assert.equal(statusDelivered.status, 0);
    assert.ok(/delivered|待我方验收/i.test(statusDelivered.stdout), 'CRLF 回执应正常被判定为 delivered 态');
  });

  it('20. CLI 版本一致性与多语言帮助（--version / -v / BATON_LANG=en 均统一为 v2.35.2，无 v2.20.0 漂移）', () => {
    const tmpDir = createTestRepo();

    // 1. --version 与 -v
    const verRes = runBaton(tmpDir, '--version');
    assert.equal(verRes.status, 0);
    assert.ok(verRes.stdout.includes('v2.35.2'), '应当输出 v2.35.2');
    assert.ok(!verRes.stdout.includes('v2.20.0'), '严禁输出 v2.20.0');

    const vRes = runBaton(tmpDir, '-v');
    assert.equal(vRes.status, 0);
    assert.ok(vRes.stdout.includes('v2.35.2'), '-v 应当输出 v2.35.2');

    const versionRes = runBaton(tmpDir, 'version');
    assert.equal(versionRes.status, 0);
    assert.ok(versionRes.stdout.includes('v2.35.2'), 'version 应当输出 v2.35.2');

    // 2. 英文环境下的 help 与默认输出
    const enHelpRes = runBaton(tmpDir, '--help', { BATON_LANG: 'en' });
    assert.equal(enHelpRes.status, 0);
    assert.ok(enHelpRes.stdout.includes('CLI · v2.35.2'), '英文帮助中必须展示 v2.35.2');
    assert.ok(!enHelpRes.stdout.includes('v2.20.0'), '英文帮助严禁硬编码残留旧版本 v2.20.0');
    assert.ok(enHelpRes.stdout.includes('baton reopen'), '英文帮助应包含 reopen 命令');
    assert.ok(enHelpRes.stdout.includes('baton throttle'), '英文帮助应包含 throttle 命令');
    assert.ok(enHelpRes.stdout.includes('baton lane'), '英文帮助应包含 lane 命令');
  });

  it('21. CLI 可达性门禁韧性（baton 主命令正常但 handoff 别名指向外部目录时降级为 warning，不阻断 check 收尾）', () => {
    const tmpDir = createTestRepo();

    // 创建模拟外部软件目录（如 WorkBuddy node 目录）
    const fakeExternalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-workbuddy-bin-'));
    const fakeHandoff = path.join(fakeExternalDir, 'handoff');
    fs.writeFileSync(fakeHandoff, '#!/bin/sh\necho "legacy handoff"\n', { mode: 0o755 });

    // 创建模拟正确指向中央引擎的 baton shim 目录
    const fakeBatonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-central-bin-'));
    const fakeBaton = path.join(fakeBatonDir, 'baton');
    try {
      fs.symlinkSync(HANDOFF_BIN, fakeBaton);
    } catch {
      fs.writeFileSync(fakeBaton, `#!/bin/sh\nnode "${HANDOFF_BIN}" "$@"\n`, { mode: 0o755 });
    }

    // 设置 PATH: 包含 fakeBatonDir（baton 正常）与 fakeExternalDir（handoff 别名漂移）
    const customPath = `${fakeBatonDir}${path.delimiter}${fakeExternalDir}${path.delimiter}${process.env.PATH}`;

    const checkRes = runBaton(tmpDir, 'check', { PATH: customPath, HOME: tmpDir });
    assert.equal(checkRes.status, 0, `check 应当成功通过（不被外部 handoff 别名阻断）: ${checkRes.stderr}\n${checkRes.stdout}`);
    assert.ok(/⚠️.*\[CLI\] handoff 别名/i.test(checkRes.stdout), '应当以 warning 提示 handoff 别名异常，而非作为阻塞性 problem');
  });

  it('22. 后台监听守护防堆叠与平息熔断（Mac / Windows 防卡顿发烫安全防护）', () => {
    const tmpDir = createTestRepo();
    const res = runBaton(tmpDir, 'new impl task "测试后台节能与防堆叠" --from audit');
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 1. 模拟旧的 watcher 僵死残留于 .watch/<id>.json
    const watchDir = path.join(tmpDir, '.handoffs', '.watch');
    fs.mkdirSync(watchDir, { recursive: true });
    const watchFile = path.join(watchDir, `${id}.json`);
    const fakePid = 999999; // 不存在的假 PID
    fs.writeFileSync(watchFile, JSON.stringify({ id, pid: fakePid, started_at: new Date().toISOString() }), 'utf8');

    // 2. 派发回执交付并运行 wait，应自愈接管/清除陈旧注册表并秒级交付就绪 Exit 0
    runBaton(tmpDir, `receipt ${id} -n "## 状态 / 结论\\n- **结论**：PASS" --evidence-note "测试通过" --deliver --as impl`);
    const waitRes = runBaton(tmpDir, `wait ${id} --settle 100ms`);
    assert.equal(waitRes.status, 0, `wait 应成功退出: ${waitRes.stderr}\n${waitRes.stdout}`);
    assert.ok(/交付已就绪|处于终态/i.test(waitRes.stdout), '回执到达后应秒级唤醒');
  });

  it('23. [v2.30.0] 多模型多窗口协同实战加固（forward --async并发解耦、批量派发、智能推导--as闭环、--auto-nonce自动绑定、Round自增与status --active聚焦）', () => {
    const tmpDir = createTestRepo();

    // 1. 测试并发创建与批量转递 / --async 选项
    const resA = runBaton(tmpDir, 'new audit task "审计工单A" --from arch');
    const idA = resA.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];
    const resB = runBaton(tmpDir, 'new audit task "审计工单B" --from arch');
    const idB = resB.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 工单初始 round 应当为 1
    const showInitA = runBaton(tmpDir, `show ${idA}`);
    assert.ok(showInitA.stdout.includes('- round: 1'), '初始工单 round 应为 1');

    // 2. 单工单使用 --async 逃逸监听在 Agent 环境下必须被 Fail-Closed 拦截并提示原子步骤
    const fwdAsyncRes = runBaton(tmpDir, `forward ${idA} --async`, { CI: 'false', BATON_AGENT_HOST: 'antigravity' });
    assert.notEqual(fwdAsyncRes.status, 0, '单工单严禁使用 --async 逃逸监听');
    assert.match(fwdAsyncRes.stderr + fwdAsyncRes.stdout, /(?:单工单严禁使用 --async 逃逸监听|prohibited for single ticket)/);
    // 前置门禁防御断言：被拦截时工单状态不得被脏写为 forwarded，依然保持 draft 态
    const showAfterBlock = runBaton(tmpDir, `show ${idA}`);
    assert.match(showAfterBlock.stdout, /status:\s*draft/);

    // 3. 批量转递：baton forward <idA> <idB> --async 一次性转递多张工单（多工单合法放行并发）
    const fwdBatchRes = runBaton(tmpDir, `forward ${idA} ${idB} --async`, { BATON_AGENT_HOST: '' });
    assert.equal(fwdBatchRes.status, 0);
    assert.ok(fwdBatchRes.stdout.includes(`已标记转递: ${idA}`));
    assert.ok(fwdBatchRes.stdout.includes(`已标记转递: ${idB}`));
    assert.ok(fwdBatchRes.stdout.includes('异步并发派发模式') || fwdBatchRes.stdout.includes('Async Dispatch Mode'), '应进入异步并发派发模式');
    assert.ok(fwdBatchRes.stdout.includes(`baton wait`), '应建议后续运行 baton wait 进行聚合监听平账');

    // 4. 测试 --auto-nonce：审计方无需手动复制 Nonce，直接 --auto-nonce 自动绑定最新令牌并成功交付
    const receiptRes = runBaton(tmpDir, `receipt ${idA} -n "## 状态 / 结论\\n- **结论**：PASS" --evidence-note "红队用例全通" --auto-nonce --deliver --as audit`, { HANDOFF_LANE: '', BATON_SESSION_ID: 'audit-actor-session' });
    assert.equal(receiptRes.status, 0, `receipt --auto-nonce 应该成功: ${receiptRes.stderr}\n${receiptRes.stdout}`);
    assert.ok(receiptRes.stdout.includes('--auto-nonce'), '应当触发 --auto-nonce 自动绑定');

    // 5. 测试智能身份推导闭环（修复回声报错）：发起方未传 --as 且环境变量为空时，智能推导为 from_lane 成功闭环
    const closeRes = runBaton(tmpDir, `close ${idA} -n "实测核验证讫"`, { HANDOFF_LANE: '', BATON_SESSION_ID: 'sender-actor-session' });
    assert.equal(closeRes.status, 0, `close 未传 --as 应智能推导发起方身份成功闭环: ${closeRes.stderr}\n${closeRes.stdout}`);
    assert.ok(closeRes.stdout.includes('智能推导执行身份') || closeRes.stdout.includes('Auto Identity'), '应当输出智能推导提示');

    // 6. 测试驳回后 round 自动自增标定与轮转
    const resReject = runBaton(tmpDir, `reject ${idB} -n "用例 TC-02 未阻断" --as audit`);
    assert.equal(resReject.status, 0);
    const showRejectedB = runBaton(tmpDir, `show ${idB}`);
    assert.ok(showRejectedB.stdout.includes('- round: 2'), '驳回后工单 round 应当自动自增为 2');

    // 7. 测试 status --active 聚焦模式
    const statusActiveRes = runBaton(tmpDir, 'status --active');
    assert.equal(statusActiveRes.status, 0);
    assert.ok(statusActiveRes.stdout.includes(idB), '活跃工单应当展示在 status --active 中');
  });

  it('24. [v2.31.0] WorkBuddy 红队双盲实战建议加固（结论硬锚点校验、128-bit 强随机 Nonce、多发起方身份歧义防御、status --active 抬头口径）', () => {
    const tmpDir = createTestRepo();

    // 1. 验证 128-bit 强随机 Nonce (32 字符 hex)
    const resA = runBaton(tmpDir, 'new audit task "测试128位Nonce" --from arch');
    const idA = resA.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];
    const showNonceRes = runBaton(tmpDir, `show ${idA} --nonce`);
    assert.equal(showNonceRes.status, 0);
    const nonce = showNonceRes.stdout.trim();
    assert.ok(nonce.startsWith('AUDIT-'), '应当为标准 Audit Nonce 格式');
    const hexPart = nonce.split('-').pop();
    assert.equal(hexPart.length, 32, 'Nonce 随机熵应为 32 字符 hex (128-bit)');

    // 2. 验证结论硬锚点校验：仅有 ## 修复状态 却缺少 ## 结论 / Verdict 时，拒绝落盘与交付
    const noConclRes = runBaton(tmpDir, `receipt ${idA} -n "## 修复状态\\n- 已完成修复" --as audit --evidence-note "说明"`);
    assert.notEqual(noConclRes.status, 0, '缺少结论锚节及结论行应当硬拦截落盘');
    assert.match(noConclRes.stderr + noConclRes.stdout, /缺明确结论行/);

    // 3. 正确写入结论后允许落盘并交付
    const okReceiptRes = runBaton(tmpDir, `receipt ${idA} -n "## 结论 (Verdict)\\n- **结论**：PASS\\n## 修复状态\\n- 修复完成" --as audit --auto-nonce --deliver --evidence-note "说明"`);
    assert.equal(okReceiptRes.status, 0, `带明确结论的回执应当成功交付: ${okReceiptRes.stderr}\n${okReceiptRes.stdout}`);

    // 4. 验证多发起方身份歧义防御：声明了多个发起方（如 from_lane: "arch, sec"）时，禁止静默推导，强制使用 --as <lane>
    const hFilePath = path.join(tmpDir, '.handoffs', 'handoffs', `${idA}.md`);
    let hContent = fs.readFileSync(hFilePath, 'utf8');
    hContent = hContent.replace(/from_lane:\s*arch/, 'from_lane: arch, sec');
    fs.writeFileSync(hFilePath, hContent, 'utf8');

    const ambiguousClose = runBaton(tmpDir, `close ${idA} -n "闭环"`, { HANDOFF_LANE: '' });
    assert.notEqual(ambiguousClose.status, 0, '多发起方存在歧义时应拦截推导');
    assert.match(ambiguousClose.stderr + ambiguousClose.stdout, /身份歧义/);

    const explicitClose = runBaton(tmpDir, `close ${idA} -n "闭环" --as arch`, { HANDOFF_LANE: '' });
    assert.equal(explicitClose.status, 0, `显式声明 --as arch 应当成功闭环: ${explicitClose.stderr}\n${explicitClose.stdout}`);

    // 5. 验证 status --active 聚焦抬头口径
    const statusRes = runBaton(tmpDir, 'status --active');
    assert.equal(statusRes.status, 0);
    assert.ok(statusRes.stdout.includes('项活跃') || statusRes.stdout.includes('active'), '应当使用活跃聚焦口径');
  });

  it('25. [v2.31.1] 工单轮次 round 计步单一事实源与 baton forward 幂等性自愈（消除双重计步与 Nonce 覆盖错位）', () => {
    const tmpDir = createTestRepo();

    // 1. 创建 audit 工单，初始状态 round = 1
    const resA = runBaton(tmpDir, 'new audit task "测试工单轮次单一事实源与幂等性" --from impl');
    const idA = resA.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];
    const initialNonce = runBaton(tmpDir, `show ${idA} --nonce`).stdout.trim();

    const showInit = runBaton(tmpDir, `show ${idA}`);
    assert.ok(showInit.stdout.includes('- round: 1'), '初始 round 应为 1');

    // 2. 审计方驳回第 1 次 (reject #1)：开启 Round 2 并轮转 Nonce
    const rej1 = runBaton(tmpDir, `reject ${idA} -n "第1轮驳回：用例未覆盖边界" --as audit`);
    assert.equal(rej1.status, 0);

    const showAfterRej1 = runBaton(tmpDir, `show ${idA}`);
    assert.ok(showAfterRej1.stdout.includes('- round: 2'), '驳回后工单应自增为 Round 2');
    assert.ok(showAfterRej1.stdout.includes('- rejected_by: audit'), '工单应记录 rejected_by: audit');
    const nonceAfterRej1 = runBaton(tmpDir, `show ${idA} --nonce`).stdout.trim();
    assert.notEqual(nonceAfterRej1, initialNonce, '驳回必须签发全新 Audit Nonce');

    // 3. 执行方修复后调用 baton forward：
    // 核心断言：round 必须严格保持为 2（严禁双重计步二次 +1 变成 3）
    // 核心断言：audit_nonce 必须严格保持为驳回时签发的 nonceAfterRej1（严禁再次轮转覆盖导致与提示词错位）
    // 核心断言：rejected_by 和 rejected_at 必须被闭环清空
    const fwd1 = runBaton(tmpDir, `forward ${idA} --no-wait`, { HANDOFF_LANE: 'impl' });
    assert.equal(fwd1.status, 0);

    const hFilePath = path.join(tmpDir, '.handoffs', 'handoffs', `${idA}.md`);
    const hContent1 = fs.readFileSync(hFilePath, 'utf8');
    assert.match(hContent1, /round:\s*2/, 'forward 后 round 必须保持为 2，严禁虚增为 3');
    assert.match(hContent1, new RegExp(`audit_nonce:\\s*${nonceAfterRej1}`), 'forward 后 Nonce 必须保持驳回时签发的令牌，严禁覆盖');
    assert.match(hContent1, /rejected_by:\s*['"]?['"]?\n/, 'forward 必须清空 rejected_by');
    assert.match(hContent1, /rejected_at:\s*['"]?['"]?\n/, 'forward 必须清空 rejected_at');

    // 4. 执行方由于参数修正连续多次调用 baton forward（幂等性验证）：
    const fwdRetry = runBaton(tmpDir, `forward ${idA} --no-wait`, { HANDOFF_LANE: 'impl' });
    assert.equal(fwdRetry.status, 0);

    const hContentRetry = fs.readFileSync(hFilePath, 'utf8');
    assert.match(hContentRetry, /round:\s*2/, '连续多次 forward 后 round 依然严格保持为 2（幂等性）');
    assert.match(hContentRetry, new RegExp(`audit_nonce:\\s*${nonceAfterRej1}`), '连续多次 forward 后 Nonce 依然保持不变（幂等性）');

    // 5. 验证此时使用 reject 签发的 Nonce (nonceAfterRej1) 交付能够完全通过
    fs.writeFileSync(path.join(tmpDir, 'fix.ts'), 'export const fixed = true;');
    const receiptRes = runBaton(tmpDir, `receipt ${idA} -n "## 结论 (Verdict)\\n- **结论**：PASS\\n## 修复说明\\n- 修复完成" --audit-nonce "${nonceAfterRej1}" --evidence-paths "fix.ts" --deliver --as audit`, { HANDOFF_LANE: 'audit' });
    assert.equal(receiptRes.status, 0, `使用 reject 签发的 Nonce 交付必须成功: ${receiptRes.stderr}\n${receiptRes.stdout}`);

    // 6. 模拟第 2 次驳回 (reject #2)
    const rej2 = runBaton(tmpDir, `reject ${idA} -n "第2轮驳回：发现性能回退" --as audit`, { HANDOFF_LANE: 'audit' });
    assert.equal(rej2.status, 0);

    const showAfterRej2 = runBaton(tmpDir, `show ${idA}`);
    assert.ok(showAfterRej2.stdout.includes('- round: 3'), '第2次驳回后工单应自增为 Round 3');
    const nonceAfterRej2 = runBaton(tmpDir, `show ${idA} --nonce`).stdout.trim();
    assert.notEqual(nonceAfterRej2, nonceAfterRej1, '第2次驳回必须签发全新 Round 3 Nonce');

    // 7. 再次 forward：依然保持 Round 3 与当前 Nonce
    const fwd2 = runBaton(tmpDir, `forward ${idA} --no-wait`, { HANDOFF_LANE: 'impl' });
    assert.equal(fwd2.status, 0);

    const hContent2 = fs.readFileSync(hFilePath, 'utf8');
    assert.match(hContent2, /round:\s*3/, '第2次驳回后 forward 依然严格保持为 Round 3，严禁虚增');
    assert.match(hContent2, new RegExp(`audit_nonce:\\s*${nonceAfterRej2}`), '第2次驳回后 forward Nonce 保持 Round 3 令牌');
  });

  it('26. [v2.31.1] cmdForward 写入流水追溯与 handoff status 驳回归属确定性回退（消除被驳回工单因 forward 误入待审计待办）', () => {
    const tmpDir = createTestRepo();

    // 1. 创建 audit 工单，from_lane: impl, to_lane: audit
    const resA = runBaton(tmpDir, 'new audit task "测试驳回后重新转递归属与流水" --from impl');
    const idA = resA.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 2. 审计方驳回工单
    const rejRes = runBaton(tmpDir, `reject ${idA} -n "专项双盲用例未覆盖" --as audit`);
    assert.equal(rejRes.status, 0);

    // 3. 验证 status --for audit：工单出现在我方已驳回中，不在待 audit 处理中
    const stAudit1 = runBaton(tmpDir, 'status --for audit');
    assert.equal(stAudit1.status, 0);
    assert.ok(stAudit1.stdout.includes(idA), '工单应列出在 status --for audit 中');
    assert.ok(stAudit1.stdout.includes('我方已驳回退回') || stAudit1.stdout.includes('My rejections awaiting revision'), '应当归入我方已驳回退回');
    assert.ok(!stAudit1.stdout.includes(`待 audit 处理（1）`) && !stAudit1.stdout.includes(`Pending for audit (1)`), '绝对不可错分至待 audit 处理待办');

    // 4. 执行方（或发起方）执行 baton forward（模拟整改后重转或挂起后台监听）
    const fwdRes = runBaton(tmpDir, `forward ${idA} --no-wait`, { HANDOFF_LANE: 'impl' });
    assert.equal(fwdRes.status, 0);

    // 4.1 核心断言：state-journal.jsonl 必须新增一条 op: 'forward' 记录，且具备可追溯性
    const journalPath = path.join(tmpDir, '.handoffs', 'logs', 'state-journal.jsonl');
    assert.ok(fs.existsSync(journalPath), 'state-journal.jsonl 必须存在');
    const journalLines = fs.readFileSync(journalPath, 'utf8').trim().split('\n').map(JSON.parse);
    const forwardEvents = journalLines.filter(ev => ev.id === idA && ev.op === 'forward');
    assert.ok(forwardEvents.length >= 1, 'state-journal 必须记录 forward 事件流水');
    assert.equal(forwardEvents[forwardEvents.length - 1].to_status, 'forwarded');

    // 4.2 核心断言：即使工单被 forward 清除了 rejected_by，status --for audit 依然能通过流水回溯归属！
    // 严禁错分到「待 audit 处理」，必须坚守在「我方已驳回退回」中！
    const stAudit2 = runBaton(tmpDir, 'status --for audit');
    assert.equal(stAudit2.status, 0);
    assert.ok(stAudit2.stdout.includes('我方已驳回退回') || stAudit2.stdout.includes('My rejections awaiting revision'), 'forward 后依然必须判定为我方已驳回退回（等待对方整改交付）');
    assert.ok(!stAudit2.stdout.includes(`待 audit 处理（1）`) && !stAudit2.stdout.includes(`Pending for audit (1)`), 'forward 后严禁误入待 audit 处理待办！');

    // 4.3 核心断言：status --for impl 必须正确归入「收到驳回待整改」
    const stImpl = runBaton(tmpDir, 'status --for impl');
    assert.equal(stImpl.status, 0);
    assert.ok(stImpl.stdout.includes('收到驳回待整改') || stImpl.stdout.includes('Rejections received awaiting revision'), '发起方视角必须归入收到驳回待整改');
  });

  it('27. [v2.32.0] 环境变量强绑定门禁（Fail-Closed：HANDOFF_LANE=arch 时严禁使用 --as audit 随意漂移）', () => {
    const tmpDir = createTestRepo();
    const resA = runBaton(tmpDir, 'new audit task "测试环境变量强绑定" --from arch', { HANDOFF_LANE: 'arch' });
    const idA = resA.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 当环境绑定了 HANDOFF_LANE=arch 时，尝试伪装为 audit 必须被拦截
    const fakeRes = runBaton(tmpDir, `receipt ${idA} -n "## 结论 (Verdict)\\n- **结论**：PASS" --as audit --evidence-note "说明"`, { HANDOFF_LANE: 'arch' });
    assert.notEqual(fakeRes.status, 0, '跨角色伪装必须被非0拦截');
    assert.match(fakeRes.stderr + fakeRes.stdout, /CROSS_LANE_IMPERSONATION_BLOCKED/);
    assert.match(fakeRes.stderr + fakeRes.stdout, /HANDOFF_LANE=arch/);

    // 当环境绑定一致（--as arch）时放行通过该层门禁
    const sameRes = runBaton(tmpDir, `show ${idA}`, { HANDOFF_LANE: 'arch' });
    assert.equal(sameRes.status, 0);
  });

  it('28. [v2.32.0] 会话身份锁与利益冲突拦截（Anti-Self-Closing Guarantee：会话绑定发起方时严禁伪装目标方交付）', () => {
    const tmpDir = createTestRepo();
    const sessionId = 'test-session-' + Date.now();
    const sessionEnv = { BATON_SESSION_ID: sessionId, HANDOFF_LANE: '' };

    // 1. 在当前会话下显式锁定身份为 arch (发起方)
    const laneBind = runBaton(tmpDir, 'lane arch', sessionEnv);
    assert.equal(laneBind.status, 0);
    assert.ok(laneBind.stdout.includes('arch'));

    // 2. 创建 to_lane: audit 工单
    const resA = runBaton(tmpDir, 'new audit task "测试会话利益冲突" --from arch', sessionEnv);
    const idA = resA.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 3. 当前会话 (arch) 尝试使用 --as audit 提交交付回执
    const fakeDeliver = runBaton(tmpDir, `receipt ${idA} -n "## 结论 (Verdict)\\n- **结论**：PASS" --deliver --as audit --evidence-note "说明"`, sessionEnv);
    assert.notEqual(fakeDeliver.status, 0, '发起方会话伪装目标方交付必须硬拦截');
    assert.match(fakeDeliver.stderr + fakeDeliver.stdout, /CROSS_LANE_IMPERSONATION_BLOCKED/);
    assert.match(fakeDeliver.stderr + fakeDeliver.stdout, /禁止发起方 \(arch\) 伪装为目标方 \(audit\) 交付/);

    // 4. 反向测试：若当前会话绑定为 audit，尝试 --as arch 闭环验收工单
    const auditSessionId = 'audit-session-' + Date.now();
    const auditSessionEnv = { BATON_SESSION_ID: auditSessionId, HANDOFF_LANE: '' };
    runBaton(tmpDir, 'lane audit', auditSessionEnv);

    const fakeClose = runBaton(tmpDir, `close ${idA} -n "自审自闭环" --as arch`, auditSessionEnv);
    assert.notEqual(fakeClose.status, 0, '目标方会话伪装发起方闭环必须硬拦截');
    assert.match(fakeClose.stderr + fakeClose.stdout, /CROSS_LANE_IMPERSONATION_BLOCKED/);
    assert.match(fakeClose.stderr + fakeClose.stdout, /禁止目标方 \(audit\) 伪装为发起方 \(arch\) 验收闭环/);
  });

  it('29. [v2.32.0] 密码学 Audit Token 与签章防伪（防共享磁盘明文 Nonce 窃取交付）', () => {
    const tmpDir = createTestRepo();

    // 1. 创建 audit 工单，获取明文 Nonce
    const resA = runBaton(tmpDir, 'new audit task "测试私钥签章防伪" --from arch', { HANDOFF_LANE: 'arch' });
    const idA = resA.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];
    const plainNonce = runBaton(tmpDir, `show ${idA} --nonce`, { HANDOFF_LANE: 'arch' }).stdout.trim();

    // 2. 非 audit 角色尝试调用 --auto-nonce 或提交回执：硬拦截
    const illicitAutoNonce = runBaton(tmpDir, `receipt ${idA} -n "## 结论 (Verdict)\\n- **结论**：PASS" --auto-nonce --deliver --as impl`, { HANDOFF_LANE: 'impl' });
    assert.notEqual(illicitAutoNonce.status, 0);
    assert.match(illicitAutoNonce.stderr + illicitAutoNonce.stdout, /防提前闭环|越权拦截：--auto-nonce/);

    // 3. 正常 audit 角色执行交付：自动生成 audit.token 与 audit_sig 签章
    const okDeliver = runBaton(tmpDir, `receipt ${idA} -n "## 结论 (Verdict)\\n- **结论**：PASS" --evidence-note "红队用例全通" --auto-nonce --deliver --as audit`, { HANDOFF_LANE: 'audit' });
    assert.equal(okDeliver.status, 0, `audit 交付应成功: ${okDeliver.stderr}\n${okDeliver.stdout}`);

    // 验证 .secrets/audit.token 已生成且受限
    const tokenFile = path.join(tmpDir, '.handoffs', '.secrets', 'audit.token');
    assert.ok(fs.existsSync(tokenFile), '必须生成 audit.token 私钥凭据');

    // 验证回执 frontmatter 写入了 audit_sig
    const rFile = path.join(tmpDir, '.handoffs', 'receipts', `${idA}-resp.md`);
    const rContent = fs.readFileSync(rFile, 'utf8');
    assert.match(rContent, /audit_sig:\s*[0-9a-f]{64}/, '回执必须写入 64 字符 HMAC-SHA256 签章');

    // 4. 伪造签章测试：若有人恶意修改 audit_sig，deliver 必须失败
    const tampered = rContent.replace(/audit_sig:\s*[0-9a-f]{64}/, 'audit_sig: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    fs.writeFileSync(rFile, tampered, 'utf8');
    // 把工单状态回退为 received 重新尝试 deliver
    const hFile = path.join(tmpDir, '.handoffs', 'handoffs', `${idA}.md`);
    fs.writeFileSync(hFile, fs.readFileSync(hFile, 'utf8').replace(/status:\s*delivered/, 'status: received'), 'utf8');

    const fakeSigDeliver = runBaton(tmpDir, `deliver ${idA} --as impl`, { HANDOFF_LANE: 'impl' });
    assert.notEqual(fakeSigDeliver.status, 0);
    assert.match(fakeSigDeliver.stderr + fakeSigDeliver.stdout, /越界交付|AUDIT_CREDENTIAL_DENIED|缺少或伪造审计私钥签章/);
  });

  it('30. [v2.33.0] 结构化卡片提示词排版、Round 单行有标题与 baton lane CLI 自助管理', () => {
    const tmpDir = createTestRepo();
    const resA = runBaton(tmpDir, 'new audit task "测试提示词卡片化" --from arch', { HANDOFF_LANE: 'arch' });
    const idA = resA.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 1. 验证 baton prompt 输出为通俗结构化卡片，去除口号式警示
    const promptRes = runBaton(tmpDir, `prompt ${idA}`, { HANDOFF_LANE: 'arch' });
    assert.equal(promptRes.status, 0);
    const fmA = fs.readFileSync(path.join(tmpDir, '.handoffs', 'handoffs', `${idA}.md`), 'utf8');
    const promptIdA = (fmA.match(/conversation_id:\s*([^\r\n]+)/) || [])[1] || idA;
    assert.ok(promptRes.stdout.includes('请 [Audit] 接单：') || promptRes.stdout.includes('请 [审计方] 接单：') || promptRes.stdout.includes('Please [Audit] take handoff:'), '提示词首行必须是请角色接单');
    assert.ok(promptRes.stdout.includes('[任务主题] 测试提示词卡片化') || promptRes.stdout.includes('[Task Topic] 测试提示词卡片化'), '提示词必须包含纯净任务主题行');
    assert.ok(promptRes.stdout.includes(`[工单编号] [${promptIdA}]`) || promptRes.stdout.includes(`[Ticket ID] [${promptIdA}]`), '提示词必须包含工单编号');
    assert.ok(promptRes.stdout.includes('[工单路径]') || promptRes.stdout.includes('[Ticket Path]'), '提示词必须包含工单路径');
    assert.ok(!promptRes.stdout.includes('【身份警示：你是接收方'), '提示词中已剥离身份警示口号');

    // 1.1 验证当 Round > 1 时，[任务轮次] 单独成行且有标题
    const hFile = path.join(tmpDir, '.handoffs', 'handoffs', `${idA}.md`);
    const hContent = fs.readFileSync(hFile, 'utf8').replace(/round:\s*1/, 'round: 2');
    fs.writeFileSync(hFile, hContent, 'utf8');
    const promptRound2 = runBaton(tmpDir, `prompt ${idA}`, { HANDOFF_LANE: 'arch' });
    assert.ok(promptRound2.stdout.includes('[任务轮次] Round 2（第 2 轮复审）') || promptRound2.stdout.includes('[Task Round] Round 2 (Review Round 2)'), 'Round 2 必须作为独立标题行呈现');

    // 2. 验证 baton lane 指令
    const sId = 'sess-test-' + Date.now();
    const sEnv = { BATON_SESSION_ID: sId, HANDOFF_LANE: '' };

    // 2.1 绑定 lane
    const setRes = runBaton(tmpDir, 'lane test-runner', sEnv);
    assert.equal(setRes.status, 0);
    assert.ok(setRes.stdout.includes('test-runner'));

    // 2.2 查看 lane (--json)
    const viewJson = runBaton(tmpDir, 'lane --json', sEnv);
    assert.equal(viewJson.status, 0);
    const parsed = JSON.parse(viewJson.stdout);
    assert.equal(parsed.session_lane, 'test-runner');
    assert.equal(parsed.effective_lane, 'test-runner');

    // 2.3 清除 lane (--clear)
    const clearRes = runBaton(tmpDir, 'lane --clear', sEnv);
    assert.equal(clearRes.status, 0);
    const viewAfterClear = runBaton(tmpDir, 'lane --json', sEnv);
    const parsedAfter = JSON.parse(viewAfterClear.stdout);
    assert.equal(parsedAfter.session_lane, null);
    assert.equal(parsedAfter.effective_lane, 'unbound');
  });

  it('31. [v2.34.0] 单工单严禁 --async 逃逸监听硬门禁、转递前置门禁防御与未监听借据系统（Unwatched Debt Guard）', () => {
    const tmpDir = createTestRepo();

    // 1. 创建单份工单
    const resA = runBaton(tmpDir, 'new audit task "审计单单A" --from impl');
    const idA = resA.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 2. 在 Agent 托管环境下裸调用 forward（未指定 --wait、--async、--no-wait），必须物理门禁拦截退出 1，且工单不得被脏写
    const bareFwd = runBaton(tmpDir, `forward ${idA}`, { BATON_AGENT_HOST: 'antigravity' });
    assert.notEqual(bareFwd.status, 0, 'Agent 环境下裸 forward 必须拦截');
    assert.match(bareFwd.stderr + bareFwd.stdout, /必须挂起监听探针|Background Listener Required/);
    const showBare = runBaton(tmpDir, `show ${idA}`);
    assert.match(showBare.stdout, /status:\s*draft/, '前置门禁拦截时严禁脏写工单状态为 forwarded');

    // 3. 在 Agent 托管环境下对单工单使用 --async 逃逸，必须物理拦截退出 1
    const singleAsync = runBaton(tmpDir, `forward ${idA} --async`, { BATON_AGENT_HOST: 'antigravity' });
    assert.notEqual(singleAsync.status, 0, '单工单严禁使用 --async');
    assert.match(singleAsync.stderr + singleAsync.stdout, /单工单严禁使用 --async 逃逸监听|prohibited for single ticket/);
    const showAsync = runBaton(tmpDir, `show ${idA}`);
    assert.match(showAsync.stdout, /status:\s*draft/, '前置门禁拦截时严禁脏写工单状态为 forwarded');

    // 4. 创建第二份工单，测试批量并发派发（ids.length > 1）：合法放行并记入借据
    const resB = runBaton(tmpDir, 'new audit task "审计单单B" --from impl');
    const idB = resB.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    const batchRes = runBaton(tmpDir, `forward ${idA} ${idB} --async`, { BATON_AGENT_HOST: 'antigravity' });
    assert.equal(batchRes.status, 0, '多工单允许使用 --async 并发派发');
    assert.match(batchRes.stdout, /异步并发派发模式|Async Dispatch Mode/);

    // 验证借据文件 unwatched_debt.json 已落盘
    const debtFile = path.join(tmpDir, '.handoffs', '.watch', 'unwatched_debt.json');
    assert.ok(fs.existsSync(debtFile), '未监听借据文件必须存在');
    const debtData = JSON.parse(fs.readFileSync(debtFile, 'utf8'));
    assert.ok(debtData.some(d => d.id === idA), '借据中必须包含 idA');
    assert.ok(debtData.some(d => d.id === idB), '借据中必须包含 idB');

    // 5. 在借据未平账时，若试图再次 forward 新工单，必须实施未清偿借据门禁拦截
    const resC = runBaton(tmpDir, 'new audit task "审计单单C" --from impl');
    const idC = resC.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];
    const blockedByDebt = runBaton(tmpDir, `forward ${idC} --wait`, { BATON_AGENT_HOST: 'antigravity' });
    assert.notEqual(blockedByDebt.status, 0, '存在未清偿借据时必须拦截后续派发');
    assert.match(blockedByDebt.stderr + blockedByDebt.stdout, /未清偿监听借据拦截|Unwatched Debt Gate Blocked/);

    // 6. 验证 reportUnwatchedPending / baton check 输出一键平账命令
    const checkRes = runBaton(tmpDir, 'check', { HOME: tmpDir });
    assert.match(checkRes.stdout, /一键启动后台监听平账|Start background listener/);

    // 7. 模拟通过 mock watcher 启动监听接管并核销平账
    const watchDir = path.join(tmpDir, '.handoffs', '.watch');
    fs.writeFileSync(path.join(watchDir, `${idA}.json`), JSON.stringify({ id: idA, pid: process.pid, started_at: new Date().toISOString() }), 'utf8');
    fs.writeFileSync(path.join(watchDir, `${idB}.json`), JSON.stringify({ id: idB, pid: process.pid, started_at: new Date().toISOString() }), 'utf8');

    // 再次派发 idC 带 --no-wait：此时 activeDebts 已被活跃 watcher 自动平账，顺利放行
    const passAfterDebtCleared = runBaton(tmpDir, `forward ${idC} --no-wait`, { BATON_AGENT_HOST: 'antigravity' });
    assert.equal(passAfterDebtCleared.status, 0, '借据平账后派发顺利放行');
  });

  it('32. [v2.35.0] 新版工单 ID 引擎 (<PROJECT>-YYYYMMDD-HHMM)、一单到底在多轮中 ID 恒定，与任务主题母题恒定 (sanitizeTaskTopic 强力剥离轮次噪音)', () => {
    const tmpDir = createTestRepo();

    // 1. 验证默认生成的工单 ID 格式为 <PROJECT>-YYYYMMDD-HHMM
    const res = runBaton(tmpDir, 'new audit task "ADR-073专项C-多轨EventInbox幂等去重与防风暴双盲审计" --from impl');
    assert.equal(res.status, 0);
    const m = res.stdout.match(/Created Intra-Repo Baton (TEST-PROJECT-\d{8}-\d{4}(?:-\d{2})?)/);
    assert.ok(m, '新建工单应默认生成形如 TEST-PROJECT-YYYYMMDD-HHMM 的格式');
    const id = m[1];

    // 2. 模拟工单标题被意外追加轮次噪音 (如 · Round 2、[Round 2])
    const ticketFile = path.join(tmpDir, '.handoffs', 'handoffs', `${id}.md`);
    let content = fs.readFileSync(ticketFile, 'utf8');
    content = content.replace(/# .*/, '# ADR-073专项C-多轨EventInbox幂等去重与防风暴双盲审计 · Round 2 (修复xx问题)');
    fs.writeFileSync(ticketFile, content, 'utf8');

    // 3. 验证 prompt 产出的提示词中 [任务主题] 必须纯净剔除轮次噪音
    const promptRes = runBaton(tmpDir, `prompt ${id}`, { BATON_LANG: 'zh' });
    assert.equal(promptRes.status, 0);
    assert.match(promptRes.stdout, /\[任务主题\] ADR-073专项C-多轨EventInbox幂等去重与防风暴双盲审计/);
    assert.ok(!promptRes.stdout.includes('· Round 2'), '任务主题严禁包含 · Round 2 噪音');
    assert.ok(!promptRes.stdout.includes('修复xx问题'), '任务主题严禁包含修复噪音');

    // 4. 转递工单 (Round 1)
    const fwdRes = runBaton(tmpDir, `forward ${id} --no-wait`, { BATON_AGENT_HOST: 'antigravity' });
    assert.equal(fwdRes.status, 0);

    // 5. 审计方驳回打回整改 (进入 Round 2)
    const rejectRes = runBaton(tmpDir, `reject ${id} -n "验收未通过，需修复幂等锁逻辑" --as audit`, { BATON_LANG: 'zh' });
    assert.equal(rejectRes.status, 0);

    // 6. 验证驳回裁决提示词（简洁单行：审计完成，裁决 NO-GO；严禁接收方输出多行出站交接卡片）
    assert.match(rejectRes.stdout, /审计完成，裁决 NO-GO（工单已退回实现方进入 Round 2）/);
    assert.doesNotMatch(rejectRes.stdout, /\[任务主题\]/);
    assert.doesNotMatch(rejectRes.stdout, /\[工单编号\]/);
    assert.doesNotMatch(rejectRes.stdout, /\[驳回角色\]/);
    assert.doesNotMatch(rejectRes.stdout, /\[驳回理由\]/);

    // 验证发起方 A 重新出站转递时计算并呈现完整的 Round 2 交接卡片
    const fwdRound2 = runBaton(tmpDir, `forward ${id} --no-wait`, { BATON_AGENT_HOST: 'antigravity', BATON_LANG: 'zh' });
    assert.equal(fwdRound2.status, 0);
    const promptRound2 = runBaton(tmpDir, `prompt ${id}`, { BATON_LANG: 'zh' });
    assert.match(promptRound2.stdout, /\[任务轮次\] Round 2（第 2 轮复审）/);
    assert.match(promptRound2.stdout, /\[任务主题\] ADR-073专项C-多轨EventInbox幂等去重与防风暴双盲审计/);

    // 验证驳回理由精准写入工单与回执
    const ticketBody = fs.readFileSync(path.join(tmpDir, '.handoffs', 'handoffs', `${id}.md`), 'utf8');
    assert.match(ticketBody, /## 驳回记录/);
    assert.match(ticketBody, /验收未通过，需修复幂等锁逻辑/);

    // 7. 一单到底验证：工单文件、工单 ID 在 Round 2 保持唯一恒定
    const showRound2 = runBaton(tmpDir, `show ${id}`);
    assert.equal(showRound2.status, 0);
    assert.match(showRound2.stdout, /round:\s*2/);
    assert.match(showRound2.stdout, new RegExp(`^#\\s*${id}`, 'm'));

    // 8. 验证 --legacy-id / BATON_LEGACY_ID=1 回退支持
    const legacyRes = runBaton(tmpDir, 'new audit task "老格式兼容测试" --from impl --legacy-id');
    assert.equal(legacyRes.status, 0);
    assert.match(legacyRes.stdout, /Created Intra-Repo Baton audit-\d{8}-\d{2}-task/, '应成功生成老格式 ID');
  });

  it('33. [v2.35.0] 会话亲和性机制 (Session Affinity · conversation_id 固化、出站提示词锚定、状态看板打标与 --current 亲和性过滤)', () => {
    const tmpDir = createTestRepo();
    const sessionA = 'session-alpha-11112222';
    const sessionB = 'session-beta-33334444';

    // 1. 会话 A 发起工单 A：Frontmatter 自动固化 conversation_id
    const resA = runBaton(tmpDir, 'new audit task "会话A的主线任务" --from impl', { BATON_SESSION_ID: sessionA });
    assert.equal(resA.status, 0);
    const idA = extractTicketId(resA.stdout);
    assert.ok(idA, '工单 A 必须成功创建');

    const fileA = path.join(tmpDir, '.handoffs', 'handoffs', `${idA}.md`);
    const contentA = fs.readFileSync(fileA, 'utf8');
    assert.match(contentA, new RegExp(`conversation_id:\\s*${sessionA}`), '工单 A frontmatter 必须固化 conversation_id');

    // 2. 验证 show 包含 conversation_id
    const showA = runBaton(tmpDir, `show ${idA}`, { BATON_SESSION_ID: sessionA });
    assert.match(showA.stdout, new RegExp(`conversation_id:\\s*${sessionA}`));

    // 3. 验证 prompt 提示词中 [工单编号] 锚定 conversation_id（消除冗余独立行）
    const promptZh = runBaton(tmpDir, `prompt ${idA}`, { BATON_SESSION_ID: sessionA, BATON_LANG: 'zh' });
    assert.match(promptZh.stdout, new RegExp(`\\[工单编号\\] \\[${sessionA}\\]`), '中文提示词中 [工单编号] 必须使用 conversation_id');

    const promptEn = runBaton(tmpDir, `prompt ${idA}`, { BATON_SESSION_ID: sessionA, BATON_LANG: 'en' });
    assert.match(promptEn.stdout, new RegExp(`\\[Ticket ID\\] \\[${sessionA}\\]`), '英文提示词中 [Ticket ID] 必须使用 conversation_id');

    // 4. 会话 B 发起工单 B
    const resB = runBaton(tmpDir, 'new audit task "会话B的独立任务" --from impl', { BATON_SESSION_ID: sessionB });
    assert.equal(resB.status, 0);
    const idB = extractTicketId(resB.stdout);
    assert.ok(idB, '工单 B 必须成功创建');

    // 5. 在会话 A 环境下执行 baton status：
    //    工单 A 标记为 [本对话]，工单 B 明确标记为 [外部对话: sessio...]
    const statusInA = runBaton(tmpDir, 'status', { BATON_SESSION_ID: sessionA, BATON_LANG: 'zh' });
    assert.equal(statusInA.status, 0);
    assert.match(statusInA.stdout, new RegExp(`${idA}[\\s\\S]*?\\[本对话\\]`), '会话A中的工单A应标记为 [本对话]');
    assert.match(statusInA.stdout, new RegExp(`${idB}[\\s\\S]*?\\[外部对话:\\s*${sessionB.slice(0, 8)}\\]`), '异源工单B应标记为 [外部对话: 前8位]');

    // 6. 验证 --current / --mine 亲和性过滤：只拉取本会话工单，彻底阻断串扰
    const currentInA = runBaton(tmpDir, 'status --current', { BATON_SESSION_ID: sessionA, BATON_LANG: 'zh' });
    assert.equal(currentInA.status, 0);
    assert.ok(currentInA.stdout.includes(idA), 'status --current 必须包含本会话工单 A');
    assert.ok(!currentInA.stdout.includes(idB), 'status --current 严禁包含外部会话工单 B');
    assert.match(currentInA.stdout, /本会话过滤/);

    const mineInA = runBaton(tmpDir, 'status --mine', { BATON_SESSION_ID: sessionA, BATON_LANG: 'zh' });
    assert.equal(mineInA.status, 0);
    assert.ok(mineInA.stdout.includes(idA), 'status --mine 必须包含本会话工单 A');
    assert.ok(!mineInA.stdout.includes(idB), 'status --mine 严禁包含外部会话工单 B');

    // 7. 多轮流转只读锁定：在另一会话转递工单 A，conversation_id 依然锁定为 sessionA
    const fwdRes = runBaton(tmpDir, `forward ${idA} --no-wait`, { BATON_SESSION_ID: 'session-gamma-77778888', BATON_AGENT_HOST: 'antigravity' });
    assert.equal(fwdRes.status, 0);
    const contentAAfterFwd = fs.readFileSync(fileA, 'utf8');
    assert.match(contentAAfterFwd, new RegExp(`conversation_id:\\s*${sessionA}`), '多轮流转中 conversation_id 必须只读锁定');

    // 8. 存量工单自愈支持：若工单无 conversation_id，baton check --fix 自动补齐
    const legacyFile = path.join(tmpDir, '.handoffs', 'handoffs', `${idA}.md`);
    let legacyContent = fs.readFileSync(legacyFile, 'utf8');
    legacyContent = legacyContent.replace(/conversation_id:.*\n/, '');
    fs.writeFileSync(legacyFile, legacyContent, 'utf8');
    assert.ok(!fs.readFileSync(legacyFile, 'utf8').includes('conversation_id:'), '已剥除 conversation_id 模拟存量工单');

    const fixRes = runBaton(tmpDir, `check ${idA} --fix`, { BATON_SESSION_ID: sessionA });
    assert.equal(fixRes.status, 0);
    assert.match(fixRes.stdout, /已安全补齐缺失的 conversation_id/);
    assert.match(fs.readFileSync(legacyFile, 'utf8'), new RegExp(`conversation_id:\\s*${sessionA}`));

    // 9. 智能工单 ID 解析器双向反查：以 conversation_id 作为入参，各 CLI 子命令无感透明解析
    const showByConv = runBaton(tmpDir, `show ${sessionA}`);
    assert.equal(showByConv.status, 0);
    assert.match(showByConv.stdout, new RegExp(`#\\s*${idA}`));

    const promptByConv = runBaton(tmpDir, `prompt ${sessionA}`, { BATON_LANG: 'zh' });
    assert.equal(promptByConv.status, 0);
    assert.match(promptByConv.stdout, /会话A的主线任务/);
  });

  it('34. [v2.35.1] 跨会话监听多实例安全共存与孤儿精准抑制（Session Affinity & Multi-Window Concurrent Listening）', async () => {
    const tmpDir = createTestRepo();
    const res = runBaton(tmpDir, 'new impl task "测试多窗口并发监听协同" --from audit');
    const id = res.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];

    // 1. 模拟窗口 A (会话 session-A) 正在运行监听
    const sessionA = 'session-window-A-11112222';
    const sessionB = 'session-window-B-33334444';
    const watchDir = path.join(tmpDir, '.handoffs', '.watch');
    fs.mkdirSync(watchDir, { recursive: true });
    const watchFile = path.join(watchDir, `${id}.json`);

    // 启动一个常驻后台存活的真实进程代表窗口 A
    const childA = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true,
      stdio: 'ignore'
    });
    childA.unref();

    try {
      // 写入窗口 A 的监听记录
      fs.writeFileSync(watchFile, JSON.stringify({
        id,
        pid: childA.pid,
        session_id: sessionA,
        conversation_id: sessionA,
        started_at: new Date().toISOString(),
        watchers: [{
          pid: childA.pid,
          session_id: sessionA,
          conversation_id: sessionA,
          started_at: new Date().toISOString()
        }]
      }, null, 2), 'utf8');

      // 2. 窗口 B (会话 session-B) 启动工单监听（工单处于 forwarded 态，timeout 200ms）
      const waitResB = runBaton(tmpDir, `wait ${id} --timeout 200ms`, {
        BATON_SESSION_ID: sessionB,
        BATON_LANG: 'zh',
        HOME: tmpDir
      });

      assert.ok(waitResB.stdout.includes('多端协同监听') || waitResB.stderr.includes('多端协同监听') || waitResB.stdout.includes('Handoff Wait'), '应触发多端监听逻辑');

      // 核心断言：窗口 A 的进程绝对没有被 SIGTERM 杀死（依然存活！）
      let childAAlive = false;
      try {
        process.kill(childA.pid, 0);
        childAAlive = true;
      } catch {}
      assert.ok(childAAlive, '跨会话并发监听时，窗口 B 绝对严禁杀死窗口 A 的监听进程！');

      // 3. 验证同会话孤儿抑制（同会话内重复开启监听，应杀死旧孤儿）
      // 模拟窗口 A 在 sessionA 下再次启动监听，此时 childA 应被安全接管并杀死
      runBaton(tmpDir, `wait ${id} --timeout 200ms`, {
        BATON_SESSION_ID: sessionA,
        BATON_LANG: 'zh',
        HOME: tmpDir
      });

      // 短暂等待 SIGTERM 信号传递
      await new Promise(r => setTimeout(r, 100));

      let childAAfterSameSession = false;
      try {
        process.kill(childA.pid, 0);
        childAAfterSameSession = true;
      } catch {}
      assert.ok(!childAAfterSameSession, '同会话内重复开启监听，应当精准终止本会话旧孤儿进程！');
    } finally {
      try { process.kill(childA.pid, 'SIGKILL'); } catch {}
    }
  });

  it('35. [v2.35.2] 入站回执/裁决提示词极简化与出站 Round 轮次专属计算（Inbound Concise Verdict Prompt & Outbound Round SSOT）', () => {
    const tmpDir = createTestRepo();

    // 1. 发起方 A 创建工单并转递
    const newRes = runBaton(tmpDir, 'new audit task "测试回执提示词极简化" --from impl');
    const id = newRes.stdout.match(/([A-Za-z0-9_-]+-\d{8}-(?:(?:\d{2}-(?:task|bug|feature|question|continuation))|(?:\d{4,6}(?:-\d{2})?)))/)[1];
    runBaton(tmpDir, `forward ${id} --no-wait`, { BATON_AGENT_HOST: 'antigravity' });

    // 2. 接收方 B (audit) 裁决驳回 (NO-GO)
    const rejectRes = runBaton(tmpDir, `reject ${id} -n "判据不满足，打回重构" --as audit`, { BATON_LANG: 'zh' });
    assert.equal(rejectRes.status, 0);
    // 核心断言：输出简洁单行裁决提示词，严禁输出多行出站交接卡片
    assert.match(rejectRes.stdout, /审计完成，裁决 NO-GO（工单已退回实现方进入 Round 2）/);
    assert.doesNotMatch(rejectRes.stdout, /请 \[实现方\] 接单：/);
    assert.doesNotMatch(rejectRes.stdout, /\[任务主题\]/);

    // 3. 发起方 A 重新出站转递，计算并输出 Round 2 完整交接卡片
    const fwdRes = runBaton(tmpDir, `forward ${id} --no-wait`, { BATON_AGENT_HOST: 'antigravity', BATON_LANG: 'zh' });
    assert.equal(fwdRes.status, 0);
    const promptRes = runBaton(tmpDir, `prompt ${id}`, { BATON_LANG: 'zh' });
    assert.match(promptRes.stdout, /\[任务轮次\] Round 2（第 2 轮复审）/);
    assert.match(promptRes.stdout, /请 \[审计方\] 接单：/);

    // 4. 接收方 B (audit) 重新复审通过并交付 (GO)
    const nonce = runBaton(tmpDir, `show ${id} --nonce`).stdout.trim();
    const deliverRes = runBaton(tmpDir, `receipt ${id} -n "## 状态 / 结论\\n- **结论**：PASS\\n## 说明\\n已全量通过" --deliver --as audit --audit-nonce "${nonce}" --evidence-note "复审全通"`, { BATON_LANG: 'zh' });
    assert.equal(deliverRes.status, 0);
    // 核心断言：audit 交付输出单行 "审计完成，裁决 GO"，严禁输出多行交接卡片
    assert.match(deliverRes.stdout, /审计完成，裁决 GO/);
    assert.doesNotMatch(deliverRes.stdout, /请 \[发起方\] 查收/);
  });
});
