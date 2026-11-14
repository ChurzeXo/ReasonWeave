import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
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

  it('4. 审计方（to_lane=audit）可直接对 forwarded 工单执行 reject 打回整改并轮转 Nonce', () => {
    const res = runBaton(tmpDir, 'new audit task "待整改任务" --from impl');
    const id = res.stdout.match(/(audit-\d+-\d+-task)/)[1];
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

    // impl 完成整改后重新 forward，清除 rejected_by 锁并重回 audit 待办
    const reforwardRes = runBaton(tmpDir, `forward ${id} --no-wait`, { HANDOFF_LANE: 'impl' });
    assert.equal(reforwardRes.status, 0);

    const statusAfterReforward = runBaton(tmpDir, 'status --for audit');
    assert.match(statusAfterReforward.stdout, /(?:待 audit 处理|Pending for audit)/i);
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

  it('7. 普通实现执行方（impl 等）越权 reject 必须被严格拦截', () => {
    const res = runBaton(tmpDir, 'new impl task "实现功能模块" --from audit');
    const id = res.stdout.match(/(impl-\d+-\d+-task)/)[1];

    // 普通执行方（impl）尝试对发给自己的工单执行 reject
    const illegalReject = runBaton(tmpDir, `reject ${id} -n "我不做，打回" --by impl`);
    assert.notEqual(illegalReject.status, 0, '执行方不得越权 reject');
    assert.match(illegalReject.stderr + illegalReject.stdout, /(?:越界驳回|仅允许由发起方或审计方)/);
  });

  it('8. Audit Nonce 缺失诊断与受控重签 (baton nonce <id> 与 baton show <id> --nonce)', () => {
    const res = runBaton(tmpDir, 'new audit task "测试 Nonce 完整生命周期" --from impl');
    const id = res.stdout.match(/(audit-\d+-\d+-task)/)[1];
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
    const implId = implRes.stdout.match(/(impl-\d+-\d+-task)/)[1];
    const illegalNonce = runBaton(tmpDir, `nonce ${implId}`);
    assert.notEqual(illegalNonce.status, 0);
    assert.match(illegalNonce.stderr, /非审计工单/);
  });

  it('9. baton check --fix 自动补发缺失的 Audit Nonce', () => {
    const res = runBaton(tmpDir, 'new audit task "测试 check --fix 补发 Nonce" --from impl');
    const id = res.stdout.match(/(audit-\d+-\d+-task)/)[1];
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
    const id = res.stdout.match(/(audit-\d+-\d+-task)/)[1];

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
    const id = res.stdout.match(/(audit-\d+-\d+-task)/)[1];

    // 显式开启 HANDOFF_STATUS_GATE=on，模拟未看 status 视图的全新冷启动环境
    const rejectRes = runBaton(tmpDir, `reject ${id} -n "发现重大缺陷立即打回" --by audit`, {
      HANDOFF_STATUS_GATE: 'on'
    });
    assert.equal(rejectRes.status, 0, `reject 应当拥有无条件安全下车通道: ${rejectRes.stderr}\n${rejectRes.stdout}`);
    assert.match(rejectRes.stdout, /已驳回退回/);
  });

  it('12. [Phase 1] 发起方（from_lane）可主动驳回/撤回已派发工单，严禁静默跳过', () => {
    const res = runBaton(tmpDir, 'new impl task "实现某模块" --from audit');
    const id = res.stdout.match(/(impl-\d+-\d+-task)/)[1];

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
    const id = res.stdout.match(/(impl-\d+-\d+-task)/)[1];

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
      HANDOFF_LANE: ''
    });
    assert.equal(acceptRes.status, 0, `使用 --as audit 验收闭环应成功: ${acceptRes.stderr}\n${acceptRes.stdout}`);
    assert.match(acceptRes.stdout, /已审计闭环/);

    const showClosed = runBaton(tmpDir, `show ${id}`);
    assert.match(showClosed.stdout, /status:\s*closed/);
  });

  it('14. [Phase 2] 同会话多工单并发流转：同一对话内无缝处理不同角色的多个工单', () => {
    // 同一环境下创建两个不同方向的工单
    const resA = runBaton(tmpDir, 'new impl task "工单 A: 待 impl 处理" --from audit');
    const idA = resA.stdout.match(/(impl-\d+-\d+-task)/)[1];

    const resB = runBaton(tmpDir, 'new audit task "工单 B: 待 audit 审计" --from impl');
    const idB = resB.stdout.match(/(audit-\d+-\d+-task)/)[1];
    const nonceB = runBaton(tmpDir, `show ${idB} --nonce`).stdout.trim();

    // 在同一个没有任何环境变量切换的环境中：
    // 1. Agent 以 impl 身份交付工单 A
    const delivA = runBaton(tmpDir, `receipt ${idA} -n "## 状态 / 结论\\n- **结论**：PASS" --as impl --deliver --evidence-paths "README.md"`, { HANDOFF_LANE: '' });
    assert.equal(delivA.status, 0);

    // 2. Agent 紧接着以 audit 身份对工单 B 执行驳回打回整改
    const rejectB = runBaton(tmpDir, `reject ${idB} -n "缺少边界用例，打回" --as audit`, { HANDOFF_LANE: '' });
    assert.equal(rejectB.status, 0);
    assert.match(rejectB.stdout, /已驳回退回/);

    // 3. Agent 再次以 audit 身份对刚才交付的工单 A 执行最终验收闭环
    const acceptA = runBaton(tmpDir, `accept ${idA} -n "审计通过" --as audit`, { HANDOFF_LANE: '' });
    assert.equal(acceptA.status, 0);
    assert.match(acceptA.stdout, /已审计闭环/);

    // 4. status --as audit 能够准确查出工单 B 处于「我方已驳回退回」，工单 A 已经闭环
    const statusAudit = runBaton(tmpDir, 'status --as audit', { HANDOFF_LANE: '' });
    assert.equal(statusAudit.status, 0);
    assert.match(statusAudit.stdout, /(?:我方已驳回退回|My rejections awaiting revision)/i);
  });

  it('15. [Phase 2] --as 越权防护依然生效：冒充或非指定角色操作严密拦截', () => {
    const res = runBaton(tmpDir, 'new impl task "测试越权拦截" --from audit');
    const id = res.stdout.match(/(impl-\d+-\d+-task)/)[1];

    // 1. 尝试使用 --as audit（发起方）自填回执，必须被拦截
    const illegalReceipt = runBaton(tmpDir, `receipt ${id} -n "## 状态 / 结论\\n- **结论**：PASS" --as audit --evidence-paths "README.md"`, { HANDOFF_LANE: '' });
    assert.notEqual(illegalReceipt.status, 0, '发起方自填回执必须被拦截');
    assert.match(illegalReceipt.stderr + illegalReceipt.stdout, /(?:禁止自填回执|不是该交接指定接收方)/);

    // 2. 正常以 --as impl 写回执并交付
    const okDeliver = runBaton(tmpDir, `receipt ${id} -n "## 状态 / 结论\\n- **结论**：PASS" --as impl --deliver --evidence-paths "README.md"`, { HANDOFF_LANE: '' });
    assert.equal(okDeliver.status, 0);

    // 3. 尝试使用 --as impl（执行方）自我闭环，必须被拦截
    const illegalAccept = runBaton(tmpDir, `accept ${id} -n "我自己验收通过" --as impl`, { HANDOFF_LANE: '' });
    assert.notEqual(illegalAccept.status, 0, '执行方禁止自我闭环');
    assert.match(illegalAccept.stderr + illegalAccept.stdout, /(?:执行方禁止自审自闭环|不是发起方)/);
  });

  it('16. [Phase 3] 同跨仓数据模型归一化：统一使用 needs_change 并无缝兼容历史 needs_iggle_change', () => {
    const res = runBaton(tmpDir, 'new impl task "测试数据模型归一化" --from audit');
    const id = res.stdout.match(/(impl-\d+-\d+-task)/)[1];

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
    const id = res.stdout.match(/(impl-\d+-\d+-task)/)[1];

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
    assert.match(doctorRes.stdout, /桩版本 == 引擎版本 \(v2\.29\.0\)/);

    // 3. 验证接入桩内容体积与规范：去恐吓化且长度显著精简
    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    const agentsContent = fs.readFileSync(agentsPath, 'utf-8');
    assert.match(agentsContent, /handoff-stub:v2\.1/);
    assert.match(agentsContent, /v2\.29\.0/);
    assert.match(agentsContent, /--as <lane>/);
    // 接入桩正文应保持轻量韧性（小于 2500 字符，去恐吓化）
    const stubMatch = agentsContent.match(/<!-- handoff-stub:v2\.1 begin -->([\s\S]*?)<!-- handoff-stub:v2\.1 end -->/);
    assert.ok(stubMatch, '必须找到接入桩标记');
    assert.ok(stubMatch[1].length < 2500, `接入桩应保持轻量，当前长度: ${stubMatch[1].length}`);
  });

  it('18. 连续多轮驳回历史无损继承与防冲刷（防模板空标题冲刷、精准小节定位追加）', () => {
    const tmpDir = createTestRepo();
    const res = runBaton(tmpDir, 'new impl task "测试多轮驳回历史保护" --from audit');
    const id = res.stdout.match(/(impl-\d+-\d+-task)/)[1];

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
    const m = res.stdout.match(/(impl-\d+-\d+-task)/);
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

  it('20. CLI 版本一致性与多语言帮助（--version / -v / BATON_LANG=en 均统一为 v2.29.0，无 v2.20.0 漂移）', () => {
    const tmpDir = createTestRepo();

    // 1. --version 与 -v
    const verRes = runBaton(tmpDir, '--version');
    assert.equal(verRes.status, 0);
    assert.ok(verRes.stdout.includes('v2.29.0'), '应当输出 v2.29.0');
    assert.ok(!verRes.stdout.includes('v2.20.0'), '严禁输出 v2.20.0');

    const vRes = runBaton(tmpDir, '-v');
    assert.equal(vRes.status, 0);
    assert.ok(vRes.stdout.includes('v2.29.0'), '-v 应当输出 v2.29.0');

    const versionRes = runBaton(tmpDir, 'version');
    assert.equal(versionRes.status, 0);
    assert.ok(versionRes.stdout.includes('v2.29.0'), 'version 应当输出 v2.29.0');

    // 2. 英文环境下的 help 与默认输出
    const enHelpRes = runBaton(tmpDir, '--help', { BATON_LANG: 'en' });
    assert.equal(enHelpRes.status, 0);
    assert.ok(enHelpRes.stdout.includes('CLI · v2.29.0'), '英文帮助中必须展示 v2.29.0');
    assert.ok(!enHelpRes.stdout.includes('v2.20.0'), '英文帮助严禁硬编码残留旧版本 v2.20.0');
    assert.ok(enHelpRes.stdout.includes('baton reopen'), '英文帮助应包含 reopen 命令');
    assert.ok(enHelpRes.stdout.includes('baton throttle'), '英文帮助应包含 throttle 命令');
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

    const checkRes = runBaton(tmpDir, 'check', { PATH: customPath });
    assert.equal(checkRes.status, 0, `check 应当成功通过（不被外部 handoff 别名阻断）: ${checkRes.stderr}\n${checkRes.stdout}`);
    assert.ok(/⚠️.*\[CLI\] handoff 别名/i.test(checkRes.stdout), '应当以 warning 提示 handoff 别名异常，而非作为阻塞性 problem');
  });
});
