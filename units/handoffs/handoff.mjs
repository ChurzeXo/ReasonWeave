#!/usr/bin/env node
// Handoff Hub CLI —— 交接枢纽**引擎**（无 / 命令；散文触发：用户说「请 <方> 收交接 <Path>」或「处理交接 <Path>」，Agent 按 Path + 意图路由到对应 op）。
// 子命令（`handoff <子命令>` = PATH shim 指向本文件；兜底/自愈 `node handoff.mjs <子命令>` / `node handoff.mjs link`）：
//   handoff new <target> <type> <标题...>       创建交接（自动生成 <ID> + frontmatter + 骨架）
//   handoff status [--json]                      查看未闭环摘要（委托 handoff-status.mjs）
//   handoff accept <id> -n "<验收结论>"           审计闭环：received → closed（close 为同义别名）
//   handoff reject <id> -n "<驳回理由>"           审计驳回：received → forwarded 退回继续改
//   handoff receipt <id> [-n "<回执正文>"] [--needs-change]   登记回执并把交接翻成 received（-n 即回执正文，落盘）
//   handoff forward <id>                         标记已转递（你已发给依赖方）
//   handoff open <id>                            在 macOS 默认编辑器打开交接文件
//   handoff show <id>                            triage 视图：frontmatter + 节标题 + 首行（不 dump 全文）
//   handoff wait <id> [--timeout <dur>]          后台监听回执到达（支持跨仓与同仓多窗口，收到回执 Exit 0 唤醒）
//
// 契约 v2.10「先查状态」门禁：receipt/accept/reject 前须在同一 hub 内跑过 handoff status
// （默认 60 分钟窗口；豁免 HANDOFF_STATUS_GATE=off，调整 HANDOFF_STATUS_WINDOW_MIN=<分钟>）。
// 回执正文：receipt -n "<回执>" 会落盘为正文；check 对契约生效日后的回执做正文要素校验。
//
// 根目录由脚本自身位置推导，整个 hub 目录可整体移动而不失灵。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync, spawn } from 'node:child_process';

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const BATON_VERSION = (() => {
  try {
    const vPath = path.join(SCRIPT_ROOT, 'VERSION.md');
    if (fs.existsSync(vPath)) {
      const line = fs.readFileSync(vPath, 'utf8').trim().split('\n')[0];
      const m = line.match(/v?(\d+\.\d+\.\d+)/);
      if (m) return m[1];
    }
  } catch {}
  return '2.38.1';
})();

// ── Workspace Provider 扩展驱动挂载（微内核解耦 · ADR-0003）──────────────────
function resolveWorkspaceDriver() {
  if (process.env.BATON_WORKSPACE_DRIVER && fs.existsSync(process.env.BATON_WORKSPACE_DRIVER)) {
    return { type: 'script', cmd: process.execPath, args: [process.env.BATON_WORKSPACE_DRIVER] };
  }
  const localDriver = path.resolve(SCRIPT_ROOT, '..', 'worktree', 'worktree.mjs');
  if (fs.existsSync(localDriver)) {
    return { type: 'script', cmd: process.execPath, args: [localDriver] };
  }
  try {
    const whichCmd = process.platform === 'win32' ? 'where baton-worktree' : 'which baton-worktree';
    const binPath = execSync(whichCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0];
    if (binPath && fs.existsSync(binPath)) {
      return { type: 'bin', cmd: binPath, args: [] };
    }
  } catch {}
  return null;
}

function invokeWorkspaceDriver(action, ticketId, extraArgs = []) {
  const driver = resolveWorkspaceDriver();
  if (!driver) return null;
  try {
    const allArgs = [...driver.args, action, ticketId, ...extraArgs];
    const out = execFileSync(driver.cmd, allArgs, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return out;
  } catch (err) {
    return { error: err.message };
  }
}

// ── 作用域根解析（仓内模式 ⊃ 同工作区，提案 PROPOSAL-2026-10-09-intra-repo-mode.md）──
// 模式由「解析到的根」推断：命中 `.handoff-hub.json` ⇒ 仓内模式（intra-repo）；否则回退 lab Hub（cross）。
// 关键不变量：当前全网没有任何 `.handoff-hub.json` 存在 ⇒ resolveRoot 恒回退 lab Hub，跨仓行为逐字不变。
function loadHubConfig(root) {
  const p = path.join(root, '.handoff-hub.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.error(`解析 .handoff-hub.json 失败: ${p}\n${e.message}`); process.exit(2); }
}
function flagValue(args, name) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1]) return args[i + 1];
    if (args[i].startsWith(name + '=')) return args[i].slice(name.length + 1);
  }
  return undefined;
}
function resolveRoot(args) {
  // 1. 显式 --root <path> / --root=<path>（须含 .handoff-hub.json）
  const rv = flagValue(args, '--root');
  if (rv) {
    const cfg = loadHubConfig(rv);
    if (!cfg) { console.error(`--root 指定的目录不含 .handoff-hub.json，不是合法仓内子 Hub: ${rv}`); process.exit(2); }
    return { root: rv, mode: cfg.mode || 'intra-repo', config: cfg };
  }
  // 2. 环境变量 BATON_ROOT / HANDOFF_ROOT（CI / 脚本用）
  const envRoot = process.env.BATON_ROOT || process.env.HANDOFF_ROOT;
  if (envRoot) {
    const cfg = loadHubConfig(envRoot);
    if (cfg) return { root: envRoot, mode: 'intra-repo', config: cfg };
  }
  // 3. 从 cwd 逐级上溯，找含 .handoff-hub.json 的目录 ⇒ 仓内模式
  //    子 Hub 默认在 `<repo>/.handoffs/`（含 .handoff-hub.json），故同时查 `dir/.handoff-hub.json` 与 `dir/.handoffs/.handoff-hub.json`。
  let dir = process.cwd();
  for (;;) {
    const nested = path.join(dir, '.handoffs', '.handoff-hub.json');
    if (fs.existsSync(nested)) return { root: path.join(dir, '.handoffs'), mode: 'intra-repo', config: loadHubConfig(path.join(dir, '.handoffs')) };
    const direct = path.join(dir, '.handoff-hub.json');
    if (fs.existsSync(direct)) return { root: dir, mode: 'intra-repo', config: loadHubConfig(dir) };
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // 4. 都不命中 ⇒ 回退 lab Hub（跨仓模式）
  return { root: SCRIPT_ROOT, mode: 'cross', config: loadHubConfig(SCRIPT_ROOT) };
}

const R = resolveRoot(process.argv.slice(2));
const ROOT = R.root;
const MODE = R.mode;
const HUB_CONFIG = R.config;
const H_DIR = path.join(ROOT, 'handoffs');
const R_DIR = path.join(ROOT, 'receipts');
const STATUS_JS = path.join(SCRIPT_ROOT, 'handoff-status.mjs');

// ── 「先查状态」前置门禁（契约 v2.10）────────────────────────────────────────
// 病根：提示词写了「动手前必先 handoff status」，但那只是自律，无机制。agent 新窗口
// 直接对某 ID 跑 receipt/accept/reject 时，CLI 一律放行——「忘了先查状态」由此发生。
// 治法：status 跑过即落一个时间戳；写动作（receipt/accept/reject）前校验该戳在窗口内，否则拒绝。
// 为什么戳存 tmpdir 而非 ROOT：仓内模式的 ROOT 是随代码提交的 .handoffs/，写戳会污染仓库工作树；
// 按 ROOT 哈希分文件，多 hub 互不干扰。为什么默认 60 分钟：覆盖「查状态 → 干活 → 回执」的常规会话；
// 长任务请在动手前重跑一次 status（廉价、幂等），或显式放宽窗口。
const STATUS_STAMP = path.join(
  os.tmpdir(),
  'handoff-last-status-' + crypto.createHash('sha1').update(ROOT).digest('hex').slice(0, 12) + '.json',
);
const STATUS_WINDOW_MIN = (() => {
  const v = parseInt(process.env.HANDOFF_STATUS_WINDOW_MIN || '', 10);
  return Number.isFinite(v) && v > 0 ? v : 60;
})();
function recordStatusSeen() {
  try { fs.writeFileSync(STATUS_STAMP, JSON.stringify({ ts: Date.now(), mode: MODE, root: ROOT }), 'utf8'); } catch { /* 戳写失败不阻断 status 本身 */ }
}

// ── 「物理工作区沙箱」前置门禁（契约 v2.26.0）──────────────────────────────────
// 病根：Agent 在执行长链路或多仓任务时，下意识切换目录至外部仓库（cd <外部仓>），
// 导致身份漂移、跨仓越权改码改工单。
// 治法：当设置 BATON_WORKSPACE_JAIL 或 BATON_ALLOWED_ROOT 时，写动作（new/receipt/deliver/accept/reject/reopen/forward）
// 强制比对当前 process.cwd() 与解析到的 ROOT 是否在被允许的工作区内部，否则 Exit 1 物理阻断。
function assertWorkspaceJail(op) {
  const allowed = process.env.BATON_WORKSPACE_JAIL || process.env.BATON_ALLOWED_ROOT;
  if (!allowed) return;
  const absAllowed = path.resolve(allowed);
  const absRoot = path.resolve(ROOT);
  const absCwd = path.resolve(process.cwd());

  const isCwdAllowed = absCwd === absAllowed || absCwd.startsWith(absAllowed + path.sep);
  const isRootAllowed = absRoot === absAllowed || absRoot.startsWith(absAllowed + path.sep);

  if (!isCwdAllowed || !isRootAllowed) {
    console.error(`❌ [跨仓阻断] 工作区沙箱越界违规 (BATON_WORKSPACE_JAIL · v2.26.0):
   - 允许工作区根: ${absAllowed}
   - 当前工作目录: ${absCwd}
   - 目标工单路径: ${absRoot}
   当前动作 [${op}] 被拒！当前 Agent 会话被严格绑定在 ${absAllowed}，禁止跨仓对外部仓库执行工单写操作。
   如需跨仓处理，请在目标仓库专属 Agent 窗口中执行。`);
    process.exit(1);
  }
}

/** 写动作前置断言：无新鲜 status 戳即拒绝（可用 HANDOFF_STATUS_GATE=off 豁免）。 */
function assertStatusFresh(op) {
  assertWorkspaceJail(op);
  if (process.env.HANDOFF_STATUS_GATE === 'off') return;
  let ts = NaN;
  try { ts = Number(JSON.parse(fs.readFileSync(STATUS_STAMP, 'utf8')).ts); } catch { /* 无戳 = 从未跑 */ }
  const ageMin = Number.isFinite(ts) ? (Date.now() - ts) / 60000 : Infinity;
  if (ageMin <= STATUS_WINDOW_MIN) return;
  // 长任务收尾宽容自愈（Auto-Refresh on Fresh Op）：
  // 若执行方会话之前确实执行过 status（isFinite(ts)），仅因任务深度编码/长自测导致超过窗口（如 > 60m）：
  // 在执行收尾性质操作（receipt/deliver）时，自动为其续期一次快照时间戳，避免长任务收尾被粗暴打断。
  if (Number.isFinite(ts) && (op === 'receipt' || op === 'deliver' || op === 'reject' || op === 'reopen')) {
    recordStatusSeen();
    console.log(`ℹ️ [状态快照自动续期] 最近一次 status 查验在 ${Math.round(ageMin)} 分钟前（超过 ${STATUS_WINDOW_MIN} 分钟），已为当前 ${op} 操作自动续期。`);
    return;
  }
  // 无条件安全下车通道（Unconditional Egress Gate · ADR-0008）：
  // 驳回（reject）与追回（reopen）是纠错动作，任何时候绝不因未看 status 视图而被阻断。
  if (op === 'reject' || op === 'reopen') {
    recordStatusSeen();
    return;
  }
  const seen = Number.isFinite(ts) ? `最近一次在 ${Math.round(ageMin)} 分钟前跑过` : '本会话从未跑过';
  console.error(`❌ 「先查状态」前置门禁未过：执行 ${op} 前必须先看「进行中」清单（${seen} handoff status，要求 ${STATUS_WINDOW_MIN} 分钟内）。`);
  console.error(`   👉 可运行: baton status（或 handoff status）查看当前待办工单。`);
  console.error(`   （豁免：HANDOFF_STATUS_GATE=off；调整窗口：HANDOFF_STATUS_WINDOW_MIN=<分钟>）`);
  process.exit(1);
}
function ensureTrailingNewline(s) { return /\n$/.test(s) ? s : s + '\n'; }

const TARGETS = new Set(
  HUB_CONFIG && Array.isArray(HUB_CONFIG.targets) && HUB_CONFIG.targets.length
    ? HUB_CONFIG.targets.map(s => String(s).toLowerCase())
    : (MODE === 'intra-repo' ? [] : ['frontend', 'backend', 'mobile', 'lab'])
);
const TARGET_LABELS = {
  frontend: 'Frontend Web',
  backend: 'Backend API',
  mobile: 'Mobile Client',
  ...(HUB_CONFIG && HUB_CONFIG.target_labels ? HUB_CONFIG.target_labels : {})
};
const TYPES = new Set(['bug', 'feature', 'breaking', 'question']);
// 仓内模式类型（提案 §5.1）：task/bug/feature/question/continuation（continuation = 续接新窗口，后继会话闭环）
const INTRA_TYPES = new Set(['task', 'bug', 'feature', 'question', 'continuation']);
const INTRA_ID_RE = /^(?!README)(?!.*-resp\.md$)([A-Za-z0-9_-]+)\.md$/i;
const INTRA_RESP_RE = /^(?!README)([A-Za-z0-9_-]+)-resp\.md$/i;

// ── 语言与国际化侦测（Locale & i18n Detection）───────────────────────────
function detectLang() {
  if (process.env.BATON_LANG || process.env.HANDOFF_LANG) {
    const l = (process.env.BATON_LANG || process.env.HANDOFF_LANG).toLowerCase();
    return l.startsWith('zh') ? 'zh' : 'en';
  }
  if (HUB_CONFIG && (HUB_CONFIG.locale || HUB_CONFIG.lang)) {
    return String(HUB_CONFIG.locale || HUB_CONFIG.lang).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  const allLabels = [
    ...Object.values((HUB_CONFIG && (HUB_CONFIG.lane_labels || HUB_CONFIG.lane_roles)) || {}),
    ...Object.values((HUB_CONFIG && HUB_CONFIG.target_labels) || {})
  ];
  if (allLabels.some(r => /[\u4e00-\u9fa5]/.test(String(r)))) {
    return 'zh';
  }
  const envLang = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '';
  if (envLang.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  // 检查当前工程主指令文件（AGENTS.md / CLAUDE.md / README.md）是否包含中文语料
  for (const f of ['AGENTS.md', 'CLAUDE.md', 'README.md']) {
    try {
      const p = path.join(process.cwd(), f);
      if (fs.existsSync(p)) {
        const head = fs.readFileSync(p, 'utf8').slice(0, 3000);
        if (/[\u4e00-\u9fa5]/.test(head)) return 'zh';
      }
    } catch {}
  }
  return 'en';
}

const DEFAULT_LANE_ROLES_ZH = {
  impl: '实现方',
  audit: '审计方',
  arch: '架构设计方',
  design: '架构设计方',
};

const DEFAULT_LANE_ROLES_EN = {
  impl: 'Implementation',
  audit: 'Audit',
  arch: 'Architecture',
  design: 'Architecture',
};

// ── 仓内 lane → 自然工程师角色（Lane Identifier → Engineer Role · v2.13）────────
// 同仓提示词严禁把项目名 / lane slug 当成沟通角色（如「请 Tappy 收交接」「请 impl lane 收交接」）。
// 一律用自然角色表达：默认映射 + .handoff-hub.json 的 lane_labels 显式覆盖，缺省回退默认映射。
const DEFAULT_LANE_ROLES = {
  impl: '实现方',
  audit: '审计方',
  arch: '架构设计方',
  design: '架构设计方',
};
/** 解析 lane 的自然角色名：.handoff-hub.json 的 lane_labels 优先，否则默认映射；未知 lane 原样回退 slug。 */
function resolveLaneRole(lane) {
  const l = String(lane || '').toLowerCase();
  if (!l) return '';
  const cfg = (HUB_CONFIG && HUB_CONFIG.lane_labels) || null;
  if (cfg && Object.prototype.hasOwnProperty.call(cfg, l) && cfg[l]) return String(cfg[l]);
  const defaultRoles = detectLang() === 'zh' ? DEFAULT_LANE_ROLES_ZH : DEFAULT_LANE_ROLES_EN;
  if (defaultRoles[l]) return defaultRoles[l];
  return lane; // 未知 lane：slug 仍可用，不臆造角色
}

/** 判定是否处于 AI Agent 托管环境中（用于判定宿主特征，不再隐式改变 --daemon 语义）。
 *
 * 核心原理：
 * 1. AI 客户端（如 Google Antigravity、Claude Code、Cursor、Windsurf 等）通过托管子进程树
 *    （Managed Subprocess / Background Task）实现长任务挂起与 Exit 0 零 Token 反应式唤醒。
 * 2. 在 Agent 宿主环境中执行 detached+unref 脱钩会导致宿主误判任务结束、丢失进程树句柄且无法唤醒。
 * 3. 探针按环境变量与管道特征智能感知宿主，支持 BATON_MANAGED_MODE 强行指定（1=托管, 0=脱钩）。
 * 4. 显式 --daemon 在 Agent 环境下不再降级为阻塞假成功，直接报错退出并提示改用宿主后台任务；
 *    脱钩后门：BATON_MANAGED_MODE=0 可强制允许脱钩。
 */
function isAgentEnvironment() {
  if (process.env.BATON_MANAGED_MODE === '0') return false;
  if (process.env.BATON_MANAGED_MODE === '1') return true;
  return Boolean(
    process.env.ANTIGRAVITY_AGENT ||
    process.env.BATON_AGENT_HOST ||
    process.env.CLAUDE_CODE ||
    process.env.CLAUDE_SESSION_ID ||
    process.env.CURSOR_AGENT ||
    process.env.WORKBUDDY_AGENT ||
    process.env.WORKBUDDY_SESSION_ID ||
    process.env.CODEBUDDY_SESSION_ID ||
    process.env.CODEBUDDY_CONVERSATION_ID ||
    process.env.CODEBUDDY_SANDBOX_BROKER_SESSION_ID ||
    process.env.WORKBUDDY_SANDBOX_BROKER_SESSION_ID ||
    process.env.AI_AGENT ||
    process.env.CONTINUE_GLOBAL_DIR ||
    process.env.WINDSURF_AGENT ||
    (!process.stdout.isTTY && !process.env.BATON_DAEMON)
  );
}

/** 当地日期（不是 UTC）。
 *
 * 为什么必须按当地日期：原实现用 `new Date().toISOString()`（UTC），
 * 在 UTC+8 的 00:00–08:00 之间操作会被记成**前一天**——
 * 实测：当地 2026-08-31 07:20 跑 `close`，`closed` 被写成 `2026-08-30`，
 * 交接看起来像「当天创建当天闭环」。交接日期是溯源依据，错了就是错了。 */
/** 交接正文骨架（精简版 · 契约 v2.6）。
 *
 * 为什么砍掉「现象/最小复现/预期vs实际/根因证据/影响面/UI耦合」那一大串：
 * 那些节会把背景与论证吸进交接正文，实测长到 240 行 / 14KB —— 任何会话打开它都要
 * 先吞掉上万 token，而其中大半是「为什么这么做」的论证，不是「要做什么」的规格。
 * 论证归 reviews/，交接只留可执行的规格 + 机器可判的验收判据 + 外链。 */
/** 回执正文骨架 —— 已「去骨架化」（契约 v2.10）。
 *
 * 病根：CLI 曾内嵌 R_BODY（状态 / 改动 / 非显然决策 / 实测值 / 验证 / 部署提示 / 外链），与声明的
 * 唯一源 RESPONSE-TEMPLATE.md（关联 / 修复状态 / 根因确认 / 实际改动 / 影响面 / 验证 / 版本·commit /
 * 部署提示 / 转递提示词）节名不一致——同一份「回执长什么样」两处维护，必然漂移
 * （DESIGN.md:27/43「回执规范唯一源 = RESPONSE-TEMPLATE.md」；CHANGELOG v2.8 已把「CLI 模板与
 * RESPONSE-TEMPLATE 双份维护」列为病根）。另 v2.6 精简骨架还硬编了「需 iggle 改动」，非 iggle 发起方会串味。
 * 治法：CLI 只落**指针桩**——正文细则一律以唯一来源为准，桩内仅保留机器可判的锚节（修复状态 / 结论），
 * 供 check 判「回执已开写」。不再复制任何节定义与写法指引。 */
function receiptStub(id, authorLabel) {
  return `
# 回执：<主题>（${authorLabel}）

> 正文按 **RESPONSE-TEMPLATE.md** 撰写（回执规范唯一来源）；本文件仅占位，勿当完整规范。
> 落点：receipts/${id}-resp.md
> check 硬校验锚：非空正文 + 含 ## 节 + 「修复状态 / 结论」锚节 + 「## 转递提示词」节（v2.11）。

## 修复状态
（待填：✅ 已修复 / 🟡 部分修复 / ⚪ 无法复现 / ⛔ 设计如此 / 🔁 转为需求 · 是否需发起方改动：是/否）

## 结论
（待填：一句话结论）
`;
}

/** 仓内回执骨架 —— 同样去骨架化（契约 v2.10）。
 *
 * 病根：仓内 receipt 原先以**空 body** 落盘（writeFM(rFile, rFm, '')），连骨架都不给——漏节无从察觉；
 * 补骨架时也不得再制造第二份竞争规范（见 receiptStub）。仓内回执按 README「frontmatter 五字段 + 结论」，
 * 故指针桩只留「结论」锚节，正文细则以交接「给执行方」节 + 本仓 .handoffs/README.md 为准。 */
function receiptStubIntra(id, lane) {
  return `
# 回执：<主题>（lane: ${lane || '（未填）'}）

> 正文按交接文档「给执行方」节 + 本仓 .handoffs/README.md 撰写；跨仓规范见 RESPONSE-TEMPLATE.md。
> 落点：receipts/${id}-resp.md
> （v2.15.0 减负：仓内同工作区已有状态机监听与自动唤醒，免写「## 转递提示词」节，登记回执自动唤醒发起方）

## 修复状态
- 状态：✅ 已完成
- 是否需发起方改动：否

## 结论
（待填：一句话结论）

## 验证
（待填：实测命令与结果）
`;
}


/** 回执正文要素校验的生效日（契约 v2.10）。
 *
 * 为什么按日期切存量：check 新增「回执正文要素」硬校验后，2026-10-13 之前的历史回执
 * 大量缺节（且多已闭环）——全量硬校验会让 check 立刻红、把历史证据打成不合规（同 reportSize /
 * reportMissingReceiptPrompt 的存量处理原则：存量是历史，不回改，只约束生效后的新回执）。
 * 为什么 2026-10-13：本校验落地当日；当日及之后新建的回执均须满足「非空 body + 含 ## 节 + 含状态/结论节」。 */
// ── 回执门禁「存量豁免」判定键（AR-F1 / P0 · v2.12.4 热修批次）──────────────────
// 病根：三处门禁原先都以回执**自声明**的 `date` 判存量豁免——而 `date` 属待校验工件自身字段，
// 执行方只要不写 `date`、或写个早于阈值的日期，就能让「正文锚节 / 转递提示词 / evidence」整组
// 豁免：伪回执照样穿过 `accept` 与 `check`。豁免的**本意**是「阈值日**前新建**的回执不回改」，
// 实现却等价于「回执**自称**阈值日前」——自证即循环信任（v2.12.3 立此门禁正是为拦 2026-10-13
// goods-stores 伪回执，该洞使其形同虚设）。
// 治法（fail-closed）：豁免键改取**所属交接的 created**（交接由发起方创建，非执行方自证），
// 并与回执自声明 `date` 取**较晚者**（防「新回执借旧交接洗白」）；交接不可解析时回退回执 `date`；
// 两者皆无或非规范 ISO ⇒ **不豁免、须受检**。
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 取所属交接的创建日（YYYY-MM-DD）；不可解析返回 null。 */
function handoffCreated(id) {
  if (!id) return null;
  try {
    const fm = readFM(fs.readFileSync(path.join(H_DIR, `${id}.md`), 'utf8'));
    const c = fm?.created || fm?.created_at;
    return c ? String(c).slice(0, 10) : null;
  } catch { return null; }
}
/** 门禁生效日 = max(交接 created, 回执 date)；都不可得 ⇒ null（⇒ 不豁免）。 */
function gateDate(fm) {
  const hc = handoffCreated(fm?.handoff_id);
  const rd = fm?.date ? String(fm.date).slice(0, 10) : '';
  const a = ISO_DATE_RE.test(String(hc || '')) ? String(hc) : null;
  const b = ISO_DATE_RE.test(rd) ? rd : null;
  if (a && b) return a > b ? a : b;
  return a || b;
}
/** 存量豁免：仅当生效日是规范 ISO 且严格早于阈值；否则受检（含 null —— fail-closed）。 */
function exemptBy(date, since) {
  return ISO_DATE_RE.test(String(date || '')) && String(date) < since;
}
function stripFM(content) {
  if (!content) return '';
  const norm = String(content).replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  return norm.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

const RECEIPT_BODY_SINCE = '2026-10-13';
/** 回执正文要素是否达标。唯一源 = RESPONSE-TEMPLATE.md（锚节「修复状态」）；此处兼容仓内「结论」锚节
 *  与历史 v2.6 骨架的「状态」别名——存量回执不回改，只约束契约生效日（RECEIPT_BODY_SINCE）后的新回执。
 *  归一化：支持跨平台 Windows CMD/PowerShell 换行与转义字符（\r\n 与字面量 \n 归一），杜绝内容门禁误杀。 */
function receiptBodyProblems(raw) {
  const norm = String(raw || '').replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  const body = stripFM(norm);
  const problems = [];
  if (!body.trim()) problems.push('正文为空');
  if (!/^##\s+\S/m.test(body)) problems.push('无任何 ## 节');
  if (!/^##\s*(?:.*(?:结论|Verdict|Conclusion)|状态\s*[/／]\s*结论)/im.test(body) && !/^##\s*(?:状态|修复状态|Status|Fix Status|Implementation Status|Results)/im.test(body)) {
    problems.push('缺状态/结论节（Status / Verdict anchor section missing）');
  }
  const concl = extractConclusion(body);
  if (!concl) {
    problems.push('缺明确结论行（须包含结论锚节并在节内声明「- **结论**：...」或明确结论，如 PASS / Accepted / Verified / REJECTED 等）');
  }
  return problems;
}
/** check 内对单份回执做正文要素校验（存量豁免：仅契约生效日 RECEIPT_BODY_SINCE 起的回执受硬约束）。 */
function checkReceiptBody(f, fm, raw, problems) {
  const made = gateDate(fm); // AR-F1：不再用回执自声明 date 判豁免
  if (exemptBy(made, RECEIPT_BODY_SINCE)) return;
  for (const p of receiptBodyProblems(raw)) {
    problems.push(`[回执] ${p} — 契约 v2.10 起回执正文须非空且含状态/结论节: ${f}`);
  }
}

/** 回执「转递提示词」节的硬校验生效日（契约 v2.11）。
 *
 * 病根：契约声明「回执规范唯一源 = RESPONSE-TEMPLATE.md」，但 Hub 自己发布的可复制载体
 * （STUB_BLOCK / AGENT-GUIDE 回执模板）漏列「转递提示词」节，且该节长期只由
 * reportMissingReceiptPrompt 非阻断软提示兜底——agent 照抄漏节载体即漏写（同 DESIGN.md:181
 * 「骨架外 = 没有」的事故条件重演）。
 * 治法：把该节与锚节一起升为 check 硬校验；阈值日（RECEIPT_PROMPT_SINCE）起的新回执缺失即
 * exit≠0；存量（阈值日前）豁免，避免历史证据被打成不合规（同 RECEIPT_BODY_SINCE 原则）。
 * 免转递豁免：仅跨仓 COREML-*（同工作区侧免转递）契约明载不产出转递提示词；仓内
 * workspace=same 回执仍须含「## 转递提示词」节——任务转递免的是「搬工作树」，回执交付行
 * （通知发起方审计）不豁免（DESIGN §1 / RESPONSE-TEMPLATE:112）。 */
const RECEIPT_PROMPT_SINCE = '2026-10-13';
/** 取回执中所有名为 <title>（允许后缀）的 ## 节的**正文行数组**（不含标题行）。
 *  逐行切分实现：跨语言可移植，且不受 JS 无 \Z、$ 受 m 标志影响等正则方言差异坑影响。 */
function receiptSections(raw, title) {
  const norm = String(raw || '').replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  const lines = norm.split('\n');
  const headRe = new RegExp('^##[ \\t]*.*(?:' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i');
  const anyHeadRe = /^##[ \t]/;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!headRe.test(lines[i])) continue;
    const body = [];
    for (let j = i + 1; j < lines.length && !anyHeadRe.test(lines[j]); j++) body.push(lines[j]);
    out.push(body.join('\n'));
  }
  return out;
}
function checkReceiptPrompt(f, fm, raw, problems) {
  const made = gateDate(fm); // AR-F1：不再用回执自声明 date 判豁免
  if (exemptBy(made, RECEIPT_PROMPT_SINCE)) return; // 存量豁免（键 = 交接 created）
  if (f.startsWith('COREML-')) return; // 跨仓同工作区侧免转递（历史豁免，COREML-* 专属）
  // 仓内模式（v2.15.0 减负）：已有 handoff wait 状态机后台监听与响应式自动唤醒，
  // 彻底废除仓内回执必须含「## 转递提示词」节的盲肠要求，免除复制粘贴传话仪式。
  if (MODE === 'intra-repo' || fm?.mode === 'intra-repo' || fm?.workspace === 'same' || fm?.workspace === 'worktree') return;
  // 标题允许带后缀（如「## 转递提示词（必含 · 供用户原样复制）」），故不锚行尾。
  // 逐行切分取节体——不用正则前瞻：JS 无 \Z（那是 Python），照搬会在 JS 里退化成字面「Z」而匹配失败。
  const secs = receiptSections(raw, '转递提示词');
  if (!secs.length) {
    problems.push(`[回执] 缺「## 转递提示词」节 — 契约 v2.11 起跨仓/异工作区/仓内同工作区回执须含该节（COREML-* 除外）: ${f}`);
    return;
  }
  // AR-②：只验节名存在会被「空壳节」蒙混（曾有一份回执节名为空、交付行写在另一个重复节里，
  // check 照过）。故再验**至少一个节内含标准可复制交付行**（新式「请收 <仓> 回执：」或旧式「登记回执：」）。
  const LINE_RE = /^[ \t]*(?:请【[^】]*】查收【[^】]*】回执(?:[ \t]*\[[^\]]+\])?[ \t]*[：:]|请收[ \t]*\S+[ \t]*回执(?:[ \t]*\[[^\]]+\])?[ \t]*[：:]|登记回执(?:[ \t]*\[[^\]]+\])?[ \t]*[：:]|审计完成[，,]裁决|交付完成[，,]回执已就绪|Audit complete|Delivery complete)/m;
  const hasLine = secs.some(b => LINE_RE.test(b));
  if (!hasLine) {
    problems.push(`[回执] 「## 转递提示词」节为空 — 须含一行可复制交付行（「请收 <写回执仓> 回执：<路径>（…）」或旧式「登记回执：<路径>」）: ${f}`);
  }
}

// ── 回执「内容完整性」门禁（P0-c · 契约 v2.12.3）──────────────────────────────
// 病根：2026-10-13 一期一卉花 goods-stores-20261013-01-task-resp 伪回执——frontmatter 与
// 「## 转递提示词」齐全、check 能过，但声称新增的目录/提交均不存在；engine 无一步核内容即放行。
// 治法：回执须声明可核验 evidence（路径存在性 + 提交存在性），落盘 / 闭环 / check 三处机器校验。
// 边界（P3 可证伪优先）：仓内 cwd=仓 ⇒ 路径/提交可硬核；跨仓目标仓不可达（含未声明 evidence_repo，
// 此时 cwd=Hub 非执行方仓）⇒ 降级 warn 不硬拦，
// 可用 HANDOFF_REPO_ROOTS=key=path,... 提供本地仓根以启用硬核。存量（生效日前）豁免，不回改历史。
const EVIDENCE_SINCE = '2026-10-14';
// 相关性（提交须触及声称路径）是**新增子门禁**，故有自己的生效日：存量回执的既有声明不回改，
// 只约束生效日后的新回执——与 RECEIPT_BODY_SINCE / RECEIPT_PROMPT_SINCE / EVIDENCE_SINCE 同款存量豁免。
const RELEVANCE_SINCE = '2026-10-15';
function parseRepoRoots() {
  const m = new Map();
  for (const pair of String(process.env.HANDOFF_REPO_ROOTS || '').split(',')) {
    const i = pair.indexOf('=');
    if (i > 0) m.set(pair.slice(0, i).trim().toLowerCase(), pair.slice(i + 1).trim());
  }
  return m;
}
// repoKey 缺省 ⇒ cwd（仓内模式即目标仓）；否则查 HANDOFF_REPO_ROOTS 或直接当路径；不可解析返回 null。
function resolveRepoRoot(repoKey) {
  if (!repoKey) return process.cwd();
  const k = String(repoKey).toLowerCase();
  const roots = parseRepoRoots();
  // AR-F4：配置命中也须存在性校验——原先直接返回配置值，配错/未挂载时被当作「可达」⇒ 硬核
  // ⇒ 全部提交判不存在而硬拦，违背契约「目标仓不可达 ⇒ 降级 warn 不硬拦」。
  if (roots.has(k)) {
    const p = roots.get(k);
    try { if (p && fs.existsSync(p)) return p; } catch {}
    return null;
  }
  try { if (fs.existsSync(repoKey)) return repoKey; } catch {}
  return null;
}
// 归一化 evidence：兼容「CLI flag 扁平串」与「frontmatter 字段」两种来源。
function normalizeEvidence(src) {
  const toList = (v) => Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,;]/).map(s => s.trim()).filter(Boolean);
  return {
    repo: src.evidence_repo || src.repo || undefined,
    commits: toList(src.evidence_commits != null ? src.evidence_commits : src.commits),
    paths: toList(src.evidence_paths != null ? src.evidence_paths : src.paths),
    note: src.evidence_note || src.note || undefined,
  };
}
// 由 CLI flag 生成 frontmatter 字段（仅在有值时落，避免污染无关回执）。
function evidenceFM(ev) {
  const fm = {};
  if (ev.commits) fm.evidence_commits = ev.commits;
  if (ev.paths) fm.evidence_paths = ev.paths;
  if (ev.repo) fm.evidence_repo = ev.repo;
  if (ev.note) fm.evidence_note = ev.note;
  return fm;
}
// evidence 校验：problems=阻断，warnings=不阻断提示。requireEvidence 仅仓内强制声明。
function evidenceProblems(ev, date, ctx, problems, warnings) {
  if (exemptBy(date, EVIDENCE_SINCE)) return; // 存量豁免（键由调用方传 gateDate；缺日期 ⇒ 不豁免）
  const fileSuffix = ctx.file ? `: ${ctx.file}` : '';
  const requireEvidence = ctx.mode === 'intra-repo';
  const hasAny = ev.commits.length || ev.paths.length || ev.note;
  if (!hasAny) {
    if (requireEvidence) problems.push(`缺 evidence：仓内新回执须声明可核验证据（--evidence-paths / --evidence-commits / --evidence-note）${fileSuffix}`);
    return;
  }
  // 跨仓回执未声明 evidence_repo：cwd=Hub 并非执行方仓库（Hub 常为非 git 仓），拿 Hub 的 git
  // 核验执行方提交/路径是错靶（2026-10-14 SWOOP-20261014-03 误红：aff2ad8 本为 Swoop 真实提交，
  // 仅漏声明 evidence_repo）。降级 warn、不硬拦，对齐上方「跨仓目标仓不可达 ⇒ 降级 warn」与
  // README「跨仓配 HANDOFF_REPO_ROOTS 后才硬核」。仓内模式 cwd 即执行方仓库，不走此分支，硬核验不变。
  if (ctx.mode !== 'intra-repo' && !ev.repo) {
    warnings.push(`跨仓回执未声明 evidence_repo：无法定位提交/路径所属仓（cwd=Hub 非执行方仓），跳过硬核验；补 --evidence-repo 或配 HANDOFF_REPO_ROOTS 后可硬核`);
    return;
  }
  const root = resolveRepoRoot(ev.repo);
  if (root === null) {
    warnings.push(`evidence 目标仓不可解析（repo=${ev.repo || 'cwd'}）：跳过路径/提交核验；跨仓可用 HANDOFF_REPO_ROOTS=key=path,... 配置`);
    return;
  }
  for (const sha of ev.commits) {
    try { execFileSync('git', ['-C', root, 'cat-file', '-e', sha], { stdio: 'ignore' }); }
    catch { problems.push(`evidence 提交不存在: ${sha}（root=${root}）${fileSuffix}`); }
  }
  for (const rel of ev.paths) {
    let ok = false;
    try {
      const rootAbs = path.resolve(root);
      const resolved = path.resolve(rootAbs, rel);
      // AR-F5：path.join 不 confine，足够深的 ../ 可逃逸到仓外存在的文件而蒙混过关
      if (resolved !== rootAbs && !resolved.startsWith(rootAbs + path.sep)) {
        problems.push(`evidence 路径越出仓根: ${rel}（root=${root}）${fileSuffix}`);
        continue;
      }
      ok = fs.existsSync(resolved);
    } catch {}
    if (!ok) problems.push(`evidence 路径不存在: ${rel}（root=${root}）${fileSuffix}`);
  }
  // 相关性：声称提交是否真的改动了声称路径（防「真实但无关」的凑数证据）。
  // 两个先决修正（否则只会有假阳性、无法硬核）：
  // ① 遍历**全部**声明提交——原先只看 commits[0]，多提交回执必误报（如桩提交与回执提交分两次入库）；
  // ② -c core.quotePath=false——否则中文路径被 git 转成八进制（"docs/\346\216\245..."），与回执里的
  //    UTF-8 字面量永不相等 ⇒ 中文路径恒误报。
  // RELEVANCE_SINCE 起提升为**硬校验**（新回执）；此前存量仍只 warn，不回改历史。
  if (ev.commits.length && ev.paths.length) {
    try {
      // AR-F7：屏蔽 stderr——提交不存在时 git 会把 fatal: ambiguous argument 打到控制台
      const names = execFileSync('git', ['-C', root, '-c', 'core.quotePath=false', 'show', '--name-only', '--pretty=format:', ...ev.commits], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const touched = names.split('\n').map(s => s.trim()).filter(Boolean);
      for (const rel of ev.paths) {
        if (!touched.some(t => t === rel || rel.startsWith(t) || t.startsWith(rel))) {
          const msg = `evidence 提交未触及声称路径: ${ev.commits.join(',')} 均未改动 ${rel}（root=${root}）`;
          if (exemptBy(date, RELEVANCE_SINCE)) warnings.push(msg + '（存量豁免，供人工复核）');
          else problems.push(msg + fileSuffix);
        }
      }
    } catch { /* git 不可用 / 非 git 仓 → 跳过 best-effort */ }
  }
}
// 回执内容门禁：正文锚节 + 转递提示词节（复用 check 的阈值/豁免逻辑）+ evidence。供 receipt/accept/reject 复用。
function receiptContentGate(id, body, ctx) {
  const problems = [], warnings = [];
  // AR-F1：门禁生效日取 max(交接 created, 传入 date)，不再单信回执自声明 date
  const gate = gateDate({ handoff_id: id, date: ctx.date });
  const fmForCheck = { date: gate };
  checkReceiptBody(id, fmForCheck, body, problems);
  checkReceiptPrompt(id, fmForCheck, body, problems);
  evidenceProblems(ctx.evidence, gate, ctx, problems, warnings);
  return { problems, warnings };
}

const H_BODY = `
# <TITLE> (<DIR>)

## 目标（1–3 行）
<要做成什么样。背景 / 根因 / 论证一律写 reviews/ 或设计文档，此处只放路径 + 一句结论。>

## 边界（表 · 谁改 / 谁只读）
| 文件:行号 | 改什么 |
|---|---|

## 验收判据（机器可判）
- [ ] <命令或字段，能明确判是/否>

## 口径与不变式（比率指标必填）
<分母是什么；有不变式就写等式。不写会被下游当别的含义引用。>

## 给执行方（回执时机 + 写法）
- 闭环点：<做到什么程度才写回执>
- 不写回执的中途态：<…>
- 回执落点：receipts/<交接ID>-resp.md，frontmatter 四字段 handoff_id / from_repo / to_repo / date
- 回执格式与结尾话术：按 $(lab path handoffs)/RESPONSE-TEMPLATE.md（单一来源）
- **执行方不 accept/reject**（只交回执 receipt）；发起方收回执=审计，通过才闭环，不过则 reject 退回

## 外链
- 背景 / 复盘：<reviews/ 路径>
- 契约 / 设计：<docs/ 路径>

> 体积预算：正文 ≤60 行 / ≤4KB。超限 = 把该放外链的内容抄进来了。
`;

// 仓内模式交接骨架（intra-repo）：去掉跨仓转递语境，强调同工作区归属纪律与「执行方不 accept/reject」
const H_BODY_INTRA = `
# <TITLE> (to_lane: <LANE>)

## 目标（1–3 行）
<要做成什么样。背景 / 根因 / 论证一律写 reviews/ 或设计文档，此处只放路径 + 一句结论。>

## 边界（表 · 谁改 / 谁只读）
| 文件:行号 | 改什么 |
|---|---|

## 验收判据（机器可判）
- [ ] <命令或字段，能明确判是/否>

## 口径与不变式（比率指标必填）
<分母是什么；有不变式就写等式。不写会被下游当别的含义引用。>

## 给执行方（回执时机 + 写法）
- 闭环点：<做到什么程度才写回执>
- 不写回执的中途态：<…>
- 回执落点：receipts/<交接ID>-resp.md，frontmatter：handoff_id / mode / from_lane / to_lane / needs_change / date
- 回执格式与结尾话术：按 $(lab path handoffs)/RESPONSE-TEMPLATE.md（单一来源）
- **执行方不 accept/reject**（只交回执 receipt）；发起 lane 收回执=审计，通过才闭环，不过则 reject 退回
- 同工作区（workspace=same）协作：共享工作树就地修改，发起方已挂起后台监听（0-Token 待机），执行方提交回执后自动唤醒发起方闭环
<AUDIT_NOTE>
## 外链
- 背景 / 复盘：<reviews/ 路径>
- 契约 / 设计：<docs/ 路径>

> 体积预算：正文 ≤60 行 / ≤4KB。
`;

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function todayYMD() { return todayISO().replace(/-/g, ''); }

// 通用序号：前缀即 TARGET（跨仓）或 LANE（仓内），大小写原样保留
function nextSeqFor(prefix, ymd) {
  const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-' + ymd + '-(\\d{2})-', 'i');
  let max = 0;
  try {
    for (const f of fs.readdirSync(H_DIR)) {
      const m = f.match(re);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  } catch {}
  return String(max + 1).padStart(2, '0');
}

// 项目代号 + 时间戳 工单 ID 生成器（v2.35.0 · 彻底消除角色倒错与跨天序号混淆）
function generateTimestampId(prefix) {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ymdhm = `${yyyy}${mm}${dd}-${hh}${min}`;
  const baseId = `${prefix}-${ymdhm}`;
  const baseFile = path.join(H_DIR, `${baseId}.md`);
  if (!fs.existsSync(baseFile)) {
    return baseId;
  }
  // 同一分钟内并发创建则自增追加后缀 -01, -02...
  let seq = 1;
  while (fs.existsSync(path.join(H_DIR, `${baseId}-${String(seq).padStart(2, '0')}.md`))) {
    seq++;
  }
  return `${baseId}-${String(seq).padStart(2, '0')}`;
}

// 全局唯一会话 ID 引擎（v2.36.0 强制）：工单 ID 必须为会话 ID，彻底消除物理 ID 与会话 ID 分裂
function generateConversationIdTicket() {
  const sess = getSessionId();
  const hasRealSession = sess && sess !== 'global' && !sess.startsWith('ppid-');
  const baseId = hasRealSession ? sess : crypto.randomUUID();
  let candidate = baseId;
  const baseFile = path.join(H_DIR, `${candidate}.md`);
  if (!fs.existsSync(baseFile)) {
    return candidate;
  }
  // 同一会话若已存在历史工单，追加序号后缀保持唯一
  let seq = 1;
  while (fs.existsSync(path.join(H_DIR, `${baseId}-${String(seq).padStart(2, '0')}.md`))) {
    seq++;
  }
  return `${baseId}-${String(seq).padStart(2, '0')}`;
}

// 智能工单 ID 解析器（支持直接工单 ID 或通过 conversation_id / 前缀双向反查）
function resolveTicketId(id) {
  if (!id) return id;
  const clean = String(id).trim().replace(/\.md$/, '').replace(/-resp$/, '');
  const direct = path.join(H_DIR, `${clean}.md`);
  if (fs.existsSync(direct)) return clean;
  // 支持通过 conversation_id 或 UUID 前缀反查工单 ID
  if (fs.existsSync(H_DIR)) {
    try {
      const files = fs.readdirSync(H_DIR).filter(f => f.endsWith('.md') && f.toUpperCase() !== 'README.MD');
      const matches = [];
      for (const f of files) {
        try {
          const raw = fs.readFileSync(path.join(H_DIR, f), 'utf8');
          const fm = readFM(raw);
          if (fm && fm.conversation_id) {
            if (fm.conversation_id === clean || fm.conversation_id.startsWith(clean)) {
              matches.push(fm.handoff_id || f.replace(/\.md$/, ''));
            }
          }
        } catch {}
      }
      if (matches.length > 0) {
        matches.sort();
        return matches[matches.length - 1];
      }
    } catch {}
  }
  return clean;
}

function readFM(content) {
  if (!content) return null;
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const obj = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':'); if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v === 'true') v = true; else if (v === 'false') v = false;
    obj[k] = v;
  }
  // ADR-0008 Phase 3: 统一数据模型归一化（将历史分化字段 needs_iggle_change 自动对齐为 needs_change）
  if (obj.needs_change === undefined && obj.needs_iggle_change !== undefined) {
    obj.needs_change = obj.needs_iggle_change;
  }
  return obj;
}

function fmtVal(v) {
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string' && (/[:#]/.test(v) || v === '')) return `'${v}'`;
  return v;
}

/** 原子写入文件（write tmp + rename），防止并发或意外中断写半截 */
function writeAtomic(file, content) {
  const dir = path.dirname(file);
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch {}
  const tmp = path.join(dir, `.${path.basename(file)}.tmp.${process.pid}.${Date.now()}`);
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.copyFileSync(tmp, file);
    try { fs.unlinkSync(tmp); } catch {}
  }
}

/** 工单级原子文件锁，防止并发读改写导致状态覆盖撕裂 */
function withTicketLock(id, fn) {
  if (!id) return fn();
  const locksDir = path.join(ROOT, '.locks');
  try { if (!fs.existsSync(locksDir)) fs.mkdirSync(locksDir, { recursive: true }); } catch {}
  const lockDir = path.join(locksDir, `${id}.lock`);
  const maxWaitMs = 4000;
  const start = Date.now();
  let acquired = false;

  while (Date.now() - start < maxWaitMs) {
    try {
      fs.mkdirSync(lockDir);
      acquired = true;
      break;
    } catch (e) {
      if (e.code === 'EEXIST') {
        try {
          const st = fs.statSync(lockDir);
          if (Date.now() - st.mtimeMs > 8000) {
            try { fs.rmdirSync(lockDir); } catch {}
          }
        } catch {}
        try {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
        } catch {
          const endWait = Date.now() + 40;
          while (Date.now() < endWait) {}
        }
      } else {
        break;
      }
    }
  }

  try {
    return fn();
  } finally {
    if (acquired) {
      try { fs.rmdirSync(lockDir); } catch {}
    }
  }
}

/** 状态机跃迁结构化流水日志（append-only Journal，供审计定责追溯） */
function logStateJournal(id, op, details = {}) {
  try {
    const logDir = path.join(ROOT, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const journalFile = path.join(logDir, 'state-journal.jsonl');
    const entry = {
      ts: new Date().toISOString(),
      id,
      op,
      pid: process.pid,
      lane: (process.env.HANDOFF_LANE || '').toLowerCase(),
      ...details
    };
    fs.appendFileSync(journalFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch {}
}

/** 严密判定回执结论是否为驳回/不通过（首词导向，安全排除 Verified 携带 Fail-Open 或 0 fail 等技术名词） */
function isVerdictRejected(verdict) {
  if (!verdict) return false;
  const s = String(verdict).trim();
  // 1. 若显式声明 Verified / Accepted / 通过 / 合规，判定为通过（不被后续技术名词如 Fail-Open 误伤）
  if (/^(?:verified|accepted|passed|pass|通过|合规)\b/i.test(s)) {
    return false;
  }
  // 2. 显式驳回/拒绝字样
  if (/\b(?:rejected|no-go)\b/i.test(s) || /^(?:reject|fail|failed)\b/i.test(s) || /驳回|不通过|未通过/.test(s)) {
    return true;
  }
  // 3. 包含 fail 单词，但排除技术术语（fail-open / fail-closed）及否定项（0 fail / no failures）
  if (/\bfail(?:ed|ure)?s?\b/i.test(s)) {
    if (/(?:fail-open|fail-closed|0\s*fail|no\s*fail|zero\s*fail)/i.test(s)) return false;
    return true;
  }
  return false;
}

/** 判定回执结论是否为受阻/待外部条件/未完成 */
function isVerdictBlocked(verdict) {
  if (!verdict) return false;
  const s = String(verdict).trim();
  if (/^(?:verified|accepted|passed|pass|通过|合规)\b/i.test(s)) {
    return false;
  }
  if (/\b(?:incomplete|blocked|waiting|hold)\b/i.test(s) || /受阻|待条件|未完成|真机未到位|等待外部/.test(s)) {
    return true;
  }
  return false;
}

/** 签发一次性高熵 Audit Nonce（128-bit 密码学随机，任务绑定防伪与完整性令牌） */
function generateAuditNonce(id) {
  const ymd = todayYMD();
  const rand = crypto.randomBytes(16).toString('hex');
  const slug = id ? id.split('-')[0] : 'audit';
  return `AUDIT-${ymd}-${slug}-${rand}`;
}

// ── 会话环境身份锁与审计私钥签名凭据（ADR-0010 · 防伪装漂移与私钥签名凭据） ──
const SESSIONS_DIR = path.join(ROOT, '.sessions');
const SECRETS_DIR = path.join(ROOT, '.secrets');

const KNOWN_SESSION_ENV_KEYS = [
  'BATON_SESSION_ID',
  'ANTIGRAVITY_CONVERSATION_ID',
  'CURSOR_CONVERSATION_ID',
  'CLAUDE_CONVERSATION_ID',
  'CLAUDE_SESSION_ID',
  'WORKBUDDY_CONVERSATION_ID',
  'WORKBUDDY_SESSION_ID',
  'CODEBUDDY_CONVERSATION_ID',
  'CODEBUDDY_SESSION_ID',
  'CODEBUDDY_SANDBOX_BROKER_SESSION_ID',
  'WORKBUDDY_SANDBOX_BROKER_SESSION_ID',
  'WINDSURF_CONVERSATION_ID',
  'TERM_SESSION_ID',
  'SESSION_ID',
];

const IGNORED_OS_SESSION_ENV_KEYS = new Set([
  'XDG_SESSION_ID',
  'GNOME_DESKTOP_SESSION_ID',
  'DESKTOP_SESSION_ID',
  'KDE_SESSION_ID',
  'SSH_SESSION_ID',
  'AWS_SESSION_ID',
]);

/** 从 W3C BAGGAGE 提取兜底会话 ID（如 codebuddy.session_id=...） */
function extractBaggageSessionId(baggage) {
  if (!baggage || typeof baggage !== 'string') return '';
  for (const part of baggage.split(',')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const k = part.slice(0, eqIdx).trim().toLowerCase();
    if (k === 'codebuddy.session_id' || k === 'workbuddy.session_id' || k === 'session_id') {
      let v = part.slice(eqIdx + 1).split(';')[0].trim();
      try { v = decodeURIComponent(v); } catch {}
      if (v) return v;
    }
  }
  return '';
}

/** 检测环境中是否存在未被 getSessionId() 识别的疑似宿主会话 ID */
function detectUnrecognizedSessionEnv() {
  const found = [];
  for (const [k, v] of Object.entries(process.env)) {
    if (!v || !String(v).trim()) continue;
    if (KNOWN_SESSION_ENV_KEYS.includes(k) || IGNORED_OS_SESSION_ENV_KEYS.has(k)) continue;
    if (/^(?:.*_)?(?:SESSION_ID|CONVERSATION_ID)$/i.test(k)) {
      found.push(k);
    }
  }
  const baggage = process.env.BAGGAGE;
  if (baggage && typeof baggage === 'string') {
    for (const part of baggage.split(',')) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const bk = part.slice(0, eqIdx).trim();
      const bv = part.slice(eqIdx + 1).split(';')[0].trim();
      if (!bv) continue;
      const bkLower = bk.toLowerCase();
      if (
        bkLower !== 'codebuddy.session_id' &&
        bkLower !== 'workbuddy.session_id' &&
        bkLower !== 'session_id' &&
        /(?:^|[._-])(?:session_id|conversation_id)$/i.test(bk)
      ) {
        found.push(`BAGGAGE:${bk}`);
      }
    }
  }
  return found;
}

function getSessionId() {
  for (const k of KNOWN_SESSION_ENV_KEYS) {
    if (process.env[k]) return String(process.env[k]).replace(/[^a-zA-Z0-9_-]/g, '_');
  }
  const baggageId = extractBaggageSessionId(process.env.BAGGAGE);
  if (baggageId) return String(baggageId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const ppid = process.ppid || 'global';
  return `ppid-${ppid}`;
}

/** Fail-closed 检测：真实会话 ID 存在但未被识别时阻断，防止静默退化 timestamp/ppid */
function assertNoUnrecognizedSession(op, args = []) {
  if (args.includes('--force-session') || process.env.BATON_FORCE_SESSION === '1') return;
  const sess = getSessionId();
  if (sess && sess !== 'global' && !sess.startsWith('ppid-')) return;
  const unrecognized = detectUnrecognizedSessionEnv();
  if (unrecognized.length === 0) return;
  const isZh = detectLang() === 'zh';
  if (isZh) {
    console.error(`\n❌ 未识别的宿主会话 ID (UNRECOGNIZED_SESSION_ID):`);
    console.error(`   执行 [${op}] 时检测到疑似宿主会话变量 [${unrecognized.join(', ')}]，但未被 getSessionId() 识别。`);
    console.error(`   已实施 fail-closed 阻断，防止静默退化为 timestamp/ppid 导致双 ID 分裂或跨会话门禁失效。`);
    console.error(`   👉 请升级 baton，或通过 BATON_SESSION_ID=<id> / --force-session 显式指定。\n`);
  } else {
    console.error(`\n❌ Unrecognized Host Session ID (UNRECOGNIZED_SESSION_ID):`);
    console.error(`   Detected session-like env [${unrecognized.join(', ')}] during [${op}], but it is not recognized by getSessionId().`);
    console.error(`   Fail-closed to prevent silent fallback to timestamp/ppid. Pass BATON_SESSION_ID=<id> or --force-session.\n`);
  }
  process.exit(1);
}

function getSessionLane() {
  try {
    const k = getSessionId();
    const f = path.join(SESSIONS_DIR, `${k}.json`);
    if (fs.existsSync(f)) {
      const data = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (data && data.lane) return String(data.lane).toLowerCase();
    }
  } catch {}
  return '';
}

/** 跨会话操作硬门禁（Anti-Cross-Session Hard Gate · v2.36.0 宪法 T6）：
 *  严禁跨会话处理工单。发起方推进（forward）、闭环（accept）、重开（reopen）仅限原工单归属会话执行。 */
function assertSessionAffinity(fm, op, id, args = []) {
  if (args.includes('--force-session') || process.env.BATON_FORCE_SESSION === '1') {
    return;
  }
  assertNoUnrecognizedSession(op, args);
  const curSession = getSessionId();
  // 仅在真实 AI 会话环境下实施物理阻断；纯终端人工交互（ppid/global）放行
  if (!curSession || curSession === 'global' || curSession.startsWith('ppid-')) {
    return;
  }
  const ticketSession = fm?.conversation_id || id;
  // 若工单并非在某个特定真实会话中创建（例如纯终端/ppid/global），允许被当前真实会话接管处理
  if (!ticketSession || ticketSession === 'global' || ticketSession.startsWith('ppid-')) {
    return;
  }
  if (ticketSession && curSession !== ticketSession && !ticketSession.startsWith(curSession) && !curSession.startsWith(ticketSession)) {
    const isZh = detectLang() === 'zh';
    if (isZh) {
      console.error(`\n❌ 跨会话操作拦截 (CROSS_SESSION_MUTATION_BLOCKED):`);
      console.error(`   工单 [${id}] 归属于会话 [${ticketSession}]，当前活跃会话为 [${curSession}]。`);
      console.error(`   根据 AEF 最高工程宪法（防串扰与会话隔离铁律），严禁跨会话处理或推进外部工单！`);
      console.error(`   👉 请切换至原发起会话（${ticketSession}）执行 ${op}，或在终端使用 --force-session 显式覆盖。\n`);
    } else {
      console.error(`\n❌ Cross-Session Mutation Blocked (CROSS_SESSION_MUTATION_BLOCKED):`);
      console.error(`   Ticket [${id}] belongs to session [${ticketSession}], but current session is [${curSession}].`);
      console.error(`   Cross-session ticket mutation is strictly prohibited (use --force-session to bypass).\n`);
    }
    process.exit(1);
  }
}

function setSessionLane(lane) {
  if (!lane) return;
  try {
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    const k = getSessionId();
    const f = path.join(SESSIONS_DIR, `${k}.json`);
    fs.writeFileSync(f, JSON.stringify({ lane: String(lane).toLowerCase(), ppid: process.ppid, ts: new Date().toISOString() }, null, 2), 'utf8');
  } catch {}
}

function clearSessionLane() {
  try {
    const k = getSessionId();
    const f = path.join(SESSIONS_DIR, `${k}.json`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  } catch {}
}

/** 获取或生成审计私钥凭据（.handoffs/.secrets/audit.token 或 BATON_AUDIT_TOKEN） */
function getAuditSecretToken(opts = {}) {
  const { requireAuditLane = false, currentLane = '' } = opts;
  if (requireAuditLane && currentLane !== 'audit') {
    return null;
  }
  if (process.env.BATON_AUDIT_TOKEN) {
    return process.env.BATON_AUDIT_TOKEN.trim();
  }
  try {
    if (!fs.existsSync(SECRETS_DIR)) {
      fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
      try { fs.writeFileSync(path.join(SECRETS_DIR, '.gitignore'), '*\n', 'utf8'); } catch {}
    }
    const tokenFile = path.join(SECRETS_DIR, 'audit.token');
    if (fs.existsSync(tokenFile)) {
      const content = fs.readFileSync(tokenFile, 'utf8').trim();
      if (content) return content;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(tokenFile, generated + '\n', { encoding: 'utf8', mode: 0o600 });
    return generated;
  } catch {
    return '';
  }
}

/** 计算审计私钥密码学签章 */
function computeAuditSignature(token, ticketId, round, nonce) {
  if (!token || !ticketId || !nonce) return '';
  return crypto.createHmac('sha256', token).update(`${ticketId}:${round || 1}:${nonce}`).digest('hex');
}

/**
 * 确定性解析当前执行身份，并执行环境锁与利益冲突门禁校验
 * @param {string} asInput - 命令行传入的 --as / --by 参数
 * @param {object} ctx - 上下文 { fromLane, toLane, op, ticketId }
 */
function resolveExecutionLane(asInput, ctx = {}) {
  const envLane = (process.env.HANDOFF_LANE || '').toLowerCase().trim();
  const sessionLane = getSessionLane();
  const reqLane = (asInput || '').toLowerCase().trim();
  const { fromLane = '', toLane = '', op = '', ticketId = '' } = ctx;
  const fromLanes = fromLane.split(/[,/]/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const targetToLane = toLane.toLowerCase().trim();

  // 1. 环境变量强绑定门禁（Fail-Closed）：
  // 若环境设置了 HANDOFF_LANE，必须严格以环境变量为准，严禁通过 --as 随意漂移到其他角色
  if (envLane) {
    if (reqLane && reqLane !== envLane) {
      console.error(`❌ 跨角色伪装拦截 (CROSS_LANE_IMPERSONATION_BLOCKED): 当前环境已绑定身份 HANDOFF_LANE=${envLane}，严禁使用 --as ${reqLane} 伪装其他角色执行操作！`);
      console.error(`   👉 若需切换角色，请先在终端中显式 export HANDOFF_LANE=${reqLane}`);
      process.exit(1);
    }
    return envLane;
  }

  // 2. 会话身份锁与利益冲突门禁：
  if (reqLane) {
    // 利益冲突硬门禁（Anti-Self-Closing Guarantee）：
    // 若当前会话此前已绑定为发起方 (fromLane)，执行敏感交付命令（deliver / receipt 且正向或 --deliver）时，严禁伪装为 toLane
    if (sessionLane && sessionLane !== reqLane) {
      if (fromLanes.includes(sessionLane) && reqLane === targetToLane) {
        if (op === 'deliver' || op === 'receipt') {
          console.error(`❌ 跨角色伪装拦截 (CROSS_LANE_IMPERSONATION_BLOCKED): 禁止发起方 (${sessionLane}) 伪装为目标方 (${targetToLane}) 交付！`);
          console.error(`   👉 这是 AEF 最高宪法级门禁（禁止自我闭环）。当前会话已绑定为发起方，严禁越权代办审计或验收交付。`);
          process.exit(1);
        }
      }
      if (targetToLane && sessionLane === targetToLane && fromLanes.includes(reqLane)) {
        if (op === 'accept') {
          console.error(`❌ 跨角色伪装拦截 (CROSS_LANE_IMPERSONATION_BLOCKED): 禁止目标方 (${sessionLane}) 伪装为发起方 (${reqLane}) 验收闭环！`);
          console.error(`   👉 这是 AEF 最高宪法级门禁（禁止自我闭环）。当前会话已绑定为执行方，严禁自审自闭环。`);
          process.exit(1);
        }
      }
    }
    // 关键加固：若当前会话此前已绑定角色，严禁通过单次命令的 --as 篡改已锁定的会话身份！
    // 只有在未锁定的会话中，初次操作才允许自动赋锁；若要更改锁，必须显式调用 baton lane <lane>
    if (!sessionLane) {
      setSessionLane(reqLane);
    }
    return reqLane;
  }

  // 3. 未传 --as，使用当前会话绑定身份
  if (sessionLane) {
    return sessionLane;
  }

  return '';
}

/** 会话身份锁 CLI 管理命令（ADR-0010） */
function cmdLane(args) {
  const isZh = detectLang() === 'zh';
  const isClear = args.includes('--clear') || args.includes('-c');
  const isJson = args.includes('--json');
  const targetLane = args.find(a => !a.startsWith('-'));

  if (isClear) {
    clearSessionLane();
    if (isJson) {
      console.log(JSON.stringify({ ok: true, cleared: true }));
    } else {
      console.log(isZh ? '✅ 已清除当前会话身份锁。' : '✅ Cleared current session lane binding.');
    }
    return;
  }

  if (targetLane) {
    const laneNorm = targetLane.toLowerCase().trim();
    setSessionLane(laneNorm);
    if (isJson) {
      console.log(JSON.stringify({ ok: true, session_id: getSessionId(), lane: laneNorm }));
    } else {
      console.log(isZh ? `✅ 当前会话身份已锁定为: ${laneNorm}` : `✅ Current session lane bound to: ${laneNorm}`);
    }
    return;
  }

  // 查看当前身份状态
  const envLane = (process.env.HANDOFF_LANE || '').toLowerCase().trim();
  const sessionLane = getSessionLane();
  const sessionId = getSessionId();
  const effectiveLane = envLane || sessionLane || 'unbound';

  if (isJson) {
    console.log(JSON.stringify({
      session_id: sessionId,
      env_lane: envLane || null,
      session_lane: sessionLane || null,
      effective_lane: effectiveLane
    }, null, 2));
    return;
  }

  if (isZh) {
    console.log(`🔐 Agent Baton 会话身份状态:`);
    console.log(`   Session ID:     ${sessionId}`);
    console.log(`   环境绑定:       ${envLane ? envLane + ' (HANDOFF_LANE)' : '未设置'}`);
    console.log(`   会话锁 (本地):  ${sessionLane || '未绑定'}`);
    console.log(`   当前生效角色:   ${effectiveLane}`);
    console.log(`\n💡 提示:`);
    console.log(`   锁定当前身份:   baton lane <lane>`);
    console.log(`   清除会话锁:     baton lane --clear`);
  } else {
    console.log(`🔐 Agent Baton Session Lane Status:`);
    console.log(`   Session ID:     ${sessionId}`);
    console.log(`   Environment:    ${envLane ? envLane + ' (HANDOFF_LANE)' : 'unset'}`);
    console.log(`   Session Lock:   ${sessionLane || 'unbound'}`);
    console.log(`   Effective Lane: ${effectiveLane}`);
    console.log(`\n💡 Tip:`);
    console.log(`   Bind session:   baton lane <lane>`);
    console.log(`   Clear session:  baton lane --clear`);
  }
}

/** 物理脱敏清洗：剥离 <thinking> 标签、<thought> 标签以及主观自辩小节 */
function sanitizeBlindContent(rawBody) {
  let cleaned = rawBody || '';
  // 1. 物理清洗 <thinking>...</thinking> 与 <thought>...</thought>（含未闭合的情形）
  cleaned = cleaned.replace(/<(?:thinking|thought)>[\s\S]*?(?:<\/(?:thinking|thought)>|$)/gi, '');
  // 2. 物理清洗主观自辩/过程思考小节（如 ## 自辩、## 思考过程、## 辩解 等）
  cleaned = cleaned.replace(/(?:^|\n)##\s*(?:自辩|思考过程|实现过程自辩|开发心路|心路历程|过程推演|辩解|Excuses?|Thought Process)[^\n]*\n+[\s\S]*?(?=\n##\s+|$)/gi, '\n');
  return cleaned.trim();
}

/** 提取剔除驳回记录后的纯净正文，用于判定执行方是否有实质代码/说明整改 */
function getCleanBody(body) {
  return (body || '')
    .replace(/(?:^|\n)## (?:驳回记录|Rejection Record)[\s\S]*?(?=\n## (?!驳回记录|Rejection Record)|$)/i, '')
    .trim();
}

/** 计算正文摘要指纹，用于判定回执在驳回后是否发生实质整改 */
function hashContent(text) {
  return crypto.createHash('sha256').update(String(text || '').trim()).digest('hex').slice(0, 16);
}

/** 从回执正文中提取「驳回记录」小节，防止被覆写抹除 */
function extractRejectionRecord(body) {
  if (!body) return '';
  const m = body.match(/(?:^|\n)(## (?:驳回记录|Rejection Record)[\s\S]*?)(?=\n## (?!驳回记录|Rejection Record)|$)/i);
  return m ? m[1].trim() : '';
}

/** 将驳回条目安全且精准地追加进回执文本的「驳回记录」小节内（确保位置正确且不被后续其他小节截断） */
function insertRejectionEntry(raw, entry) {
  const cleanEntry = String(entry || '').trim();
  if (!cleanEntry) return raw;
  const rejSectionRegex = /(?:^|\n)(## (?:驳回记录|Rejection Record)[\s\S]*?)(?=\n## (?!驳回记录|Rejection Record)|$)/i;
  const m = raw.match(rejSectionRegex);
  if (!m) {
    return raw.replace(/\n*$/, '\n') + `\n## 驳回记录\n${cleanEntry}\n`;
  }
  const sectionContent = m[1];
  const sectionStart = m.index + (m[0].startsWith('\n') ? 1 : 0);
  const sectionEnd = sectionStart + sectionContent.length;

  const coreText = cleanEntry.replace(/[-*#\s]/g, '');
  const sectionClean = sectionContent.replace(/[-*#\s]/g, '');
  if (sectionClean.includes(coreText)) {
    return raw;
  }

  const updatedSection = sectionContent.replace(/\n*$/, '\n') + `${cleanEntry}\n`;
  return raw.slice(0, sectionStart) + updatedSection + raw.slice(sectionEnd);
}

/** 解析驳回小节内的独立条目列表 */
function parseRejectionEntries(secText) {
  if (!secText) return [];
  const body = secText.replace(/^##\s*(?:驳回记录|Rejection Record)[^\n]*\n?/i, '').trim();
  if (!body || body === '（无）' || body === '(None)' || body === '无') return [];

  const lines = body.split('\n');
  const entries = [];
  let current = [];

  for (const line of lines) {
    const isNewEntry = /^[-*]\s*(?:日期|Date|[0-9]{4}-[0-9]{2}-[0-9]{2})[：:]/i.test(line.trim()) ||
                       /^###?\s*(?:第\s*[0-9一二三四五六七八九十]+\s*次|Round\s*[0-9]+)/i.test(line.trim());
    if (isNewEntry && current.length > 0) {
      entries.push(current.join('\n').trim());
      current = [line];
    } else if (current.length === 0 && line.trim()) {
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0 && current.join('\n').trim()) {
    entries.push(current.join('\n').trim());
  }
  return entries.length > 0 ? entries : (body ? [body] : []);
}

/** 智能合并新旧回执的驳回记录小节：防静默抹除、防模板空标题冲刷、条目级合并去重 */
function mergeRejectionRecords(oldBody, newBody) {
  const oldSec = extractRejectionRecord(oldBody);
  if (!oldSec) return newBody;

  const newSec = extractRejectionRecord(newBody);
  if (!newSec) {
    return newBody.replace(/\n*$/, '\n\n') + oldSec + '\n';
  }

  const oldEntries = parseRejectionEntries(oldSec);
  if (oldEntries.length === 0) return newBody;

  const newEntries = parseRejectionEntries(newSec);
  if (newEntries.length === 0) {
    return newBody.replace(newSec, oldSec);
  }

  let updatedSec = newSec;
  for (const oldEntry of oldEntries) {
    const coreText = oldEntry.replace(/[-*#\s]/g, '');
    const currentSecClean = updatedSec.replace(/[-*#\s]/g, '');
    if (!currentSecClean.includes(coreText)) {
      updatedSec = insertRejectionEntry(updatedSec, oldEntry);
    }
  }
  return newBody.replace(newSec, updatedSec);
}

function writeFM(file, fm, body) {
  const fmStr = '---\n' + Object.entries(fm).map(([k, v]) => `${k}: ${fmtVal(v)}`).join('\n') + '\n---\n';
  writeAtomic(file, fmStr + (body || ''));
}

function setFM(file, patch) {
  const content = fs.readFileSync(file, 'utf8');
  const fm = readFM(content);
  if (!fm) throw new Error('无 frontmatter: ' + file);
  Object.assign(fm, patch);
  const body = stripFM(content);
  writeFM(file, fm, body);
}

function cmdNew(args) {
  assertWorkspaceJail('new');
  if (MODE === 'intra-repo') return cmdNewIntra(args);
  // ── 跨仓模式（逐字保留旧行为）──
  const [target, type, ...rest] = args;
  if (!target || !type) { console.error('用法: handoff new <target> <type> <标题...>'); process.exit(2); }
  if (!TARGETS.has(target.toLowerCase())) { console.error(`target 必须是 ${[...TARGETS].join(' / ')}`); process.exit(2); }
  if (!TYPES.has(type.toLowerCase())) { console.error(`type 必须是 ${[...TYPES].join(' / ')}`); process.exit(2); }
  const t = target.toLowerCase();
  const ty = type.toLowerCase();
  const title = rest.join(' ').trim() || '(无标题)';
  // 方向标签不猜发送方（2026-10-18 批次七修）：旧写法写死「iggle 是发起方」，hub 发起时整条链烙错章
  // （dirLabel → 回执 authorLabel → brief intro 三处同源）。发送方以转递话术 / frontmatter 为准。
  const dirLabel = `接收方 ${TARGET_LABELS[t] || t}`;
  let id;
  assertNoUnrecognizedSession('new', args);
  const sess = getSessionId();
  const hasRealSession = sess && sess !== 'global' && !sess.startsWith('ppid-');
  const idFormat = flagValue(args, '--id-format') || HUB_CONFIG.id_format || process.env.BATON_ID_FORMAT || (hasRealSession ? 'session' : 'timestamp');
  if (idFormat === 'legacy' || args.includes('--legacy-id') || process.env.BATON_LEGACY_ID === '1') {
    const ymd = todayYMD();
    const seq = nextSeqFor(t.toUpperCase(), ymd);
    id = `${t.toUpperCase()}-${ymd}-${seq}-${ty}`;
  } else if (idFormat === 'timestamp' || args.includes('--timestamp-id')) {
    id = generateTimestampId(t.toUpperCase());
  } else {
    id = generateConversationIdTicket();
  }
  const file = path.join(H_DIR, `${id}.md`);
  if (fs.existsSync(file)) { console.error('已存在: ' + file); process.exit(1); }
  const fm = {
    handoff_id: id,
    target: t,
    type: ty,
    status: 'draft',
    conversation_id: getSessionId(),
    round: 1,
    needs_change: false,
    needs_iggle_change: false, // 兼容历史消费方
    // ZSpec ④ 版本回流：common_version 为跨平台共享版本；platform_versions 为该平台专属版本
    // （形如 `swoop=6aad880;prospero=v2.3`，仅记录本交接依赖的维度）。版本变更时由 `handoff drift` 触发失效回流。
    common_version: 'v2.4',
    platform_versions: '',
    created: todayISO(),
    closed: '',
  };
  const body = H_BODY.replaceAll('<TITLE>', title).replaceAll('<DIR>', dirLabel);
  writeFM(file, fm, body);
  const isZh = detectLang() === 'zh';
  if (isZh) {
    console.log(`✅ 已创建交接 ${id}`);
    console.log(`   文件: ${file}`);
    console.log(`   👉 关键动作: 填写交接正文后，【必须立即执行】以下命令转递并挂起后台监听：`);
    console.log(`      baton forward ${id} --wait`);
    console.log(`      （一条命令完成标记转递、打印标准接单提示词与挂起后台监听；回执到达时 Exit 0 自动唤醒发起方闭环）`);
  } else {
    console.log(`✅ Created Cross-Repo Baton ${id}`);
    console.log(`   File: ${file}`);
    console.log(`   👉 Mandatory Next Step: After filling content, you MUST run:`);
    console.log(`      baton forward ${id} --wait`);
    console.log(`      (Marks forwarded, prints pass prompt, and listens in background for auto-wakeup upon receipt)`);
  }
}

// 仓内模式：new <lane> <type> "<标题>" —— lane = 接收通道（= 回执撰写方 = 文件名前缀）
function cmdNewIntra(args) {
  assertWorkspaceJail('new');
  const [lane, type, ...rest] = args;
  if (!lane || !type) { console.error('用法（仓内模式）: handoff new <lane> <type> <标题...>'); process.exit(2); }
  const lanes = new Set((HUB_CONFIG.lanes || []).map(s => String(s).toLowerCase()));
  if (lanes.size && !lanes.has(lane.toLowerCase())) {
    console.error(`lane 必须是 ${[...lanes].join(' / ')}（来自 .handoff-hub.json）`);
    process.exit(2);
  }
  // 防串味：lane 名不得与跨仓 TARGET 撞名（否则跨仓/仓内交接前缀不可区分）
  if (TARGETS.has(lane.toLowerCase())) {
    console.error(`lane 名「${lane}」与跨仓 TARGET 撞名，请改用其它 lane 名`);
    process.exit(2);
  }
  const types = new Set([...(HUB_CONFIG.types || []), ...INTRA_TYPES].map(s => String(s).toLowerCase()));
  if (!types.has(type.toLowerCase())) { console.error(`type 必须是 ${[...types].join(' / ')}`); process.exit(2); }
  const l = lane.toLowerCase();
  const ty = type.toLowerCase();
  let ws = HUB_CONFIG.workspace_default || 'same';
  let fromLane = process.env.HANDOFF_LANE || '';
  let toolProfile = 'full';
  const restClean = [];
  for (let i = 0; i < rest.length; i++) {
    if ((rest[i] === '--workspace' || rest[i] === '-ws') && rest[i + 1]) {
      const candidate = rest[i + 1].toLowerCase();
      if (['same', 'separate', 'worktree'].includes(candidate)) {
        ws = candidate;
      }
      i++;
    } else if (rest[i] === '--profile' && rest[i + 1]) {
      toolProfile = rest[i + 1].toLowerCase();
      i++;
    } else if (rest[i].startsWith('--profile=')) {
      toolProfile = rest[i].slice('--profile='.length).toLowerCase();
    } else if ((rest[i] === '--from' || rest[i] === '-from') && rest[i + 1]) {
      fromLane = rest[i + 1].toLowerCase();
      i++;
    } else if (rest[i].startsWith('--from=')) {
      fromLane = rest[i].slice('--from='.length).toLowerCase();
    } else {
      restClean.push(rest[i]);
    }
  }
  const title = restClean.join(' ').trim() || '(无标题)';
  let id;
  assertNoUnrecognizedSession('new', args);
  const sess = getSessionId();
  const hasRealSession = sess && sess !== 'global' && !sess.startsWith('ppid-');
  const idFormat = flagValue(args, '--id-format') || HUB_CONFIG.id_format || process.env.BATON_ID_FORMAT || (hasRealSession ? 'session' : 'timestamp');
  if (idFormat === 'legacy' || args.includes('--legacy-id') || process.env.BATON_LEGACY_ID === '1') {
    const ymd = todayYMD();
    const seq = nextSeqFor(l, ymd);
    id = `${l}-${ymd}-${seq}-${ty}`;
  } else if (idFormat === 'timestamp' || args.includes('--timestamp-id')) {
    const projectCode = String(HUB_CONFIG.project || path.basename(path.resolve(ROOT, '..')) || 'BATON').toUpperCase();
    id = generateTimestampId(projectCode);
  } else {
    id = generateConversationIdTicket();
  }
  const file = path.join(H_DIR, `${id}.md`);
  if (fs.existsSync(file)) { console.error('已存在: ' + file); process.exit(1); }
  // 审计动作契约（v2.13）：to_lane=audit 时把强制审计动作注入交接文档「给执行方」节，
  // 让审计 agent 读到的就是约束本身（严禁仅静态读码、独立执行验收判据）。
  const auditNote = (l === 'audit')
    ? '\n**审计动作契约（v2.13 · to_lane=audit）**：你即审计方，**严禁仅静态读码**——必须在终端**独立执行**下方「验收判据」中的**所有测试与校验命令**，以实测输出为唯一准绳，**严禁采信自报**（执行方回执里的「已通过」一律视为待验证声明，不采信）。'
    : '';
  const fm = {
    handoff_id: id,
    mode: 'intra-repo',
    project: HUB_CONFIG.project || '',
    from_lane: fromLane,
    to_lane: l,
    workspace: ws,
    timing: 'sequential',
    type: ty,
    status: 'draft',
    conversation_id: getSessionId(),
    round: 1,
    needs_change: false,
    created: todayISO(),
    closed: '',
  };
  if (toolProfile !== 'full') {
    fm.tool_profile = toolProfile;
  }
  if (l === 'audit') {
    fm.audit_nonce = generateAuditNonce(id);
  }
  const body = H_BODY_INTRA.replaceAll('<TITLE>', title).replaceAll('<LANE>', l).replaceAll('<WS>', ws).replaceAll('<AUDIT_NOTE>', auditNote);
  writeFM(file, fm, body);
  const isZh = detectLang() === 'zh';
  if (isZh) {
    console.log(`✅ 已创建仓内交接 ${id}（lane=${l} · workspace=${ws}）`);
    console.log(`   文件: ${file}`);
    console.log(`   👉 关键动作: 填写交接正文后，【必须立即执行】以下命令转递并挂起后台监听：`);
    console.log(`      baton forward ${id} --wait`);
    console.log(`      （一条命令完成标记转递、打印标准接单提示词与挂起后台监听；回执到达时 Exit 0 自动唤醒发起方闭环）`);
  } else {
    console.log(`✅ Created Intra-Repo Baton ${id} (lane=${l}, workspace=${ws})`);
    console.log(`   File: ${file}`);
    console.log(`   👉 Mandatory Next Step: After filling content, you MUST run:`);
    console.log(`      baton forward ${id} --wait`);
    console.log(`      (Marks forwarded, prints pass prompt, and listens in background for auto-wakeup upon receipt)`);
  }
}

function cmdStatus(args) {
  // 把解析到的根与模式显式传给 handoff-status.mjs，使其成为确定性入口（仓内根 ≠ 脚本目录）
  const filtered = args.filter(a => a !== '--root' && a !== '--mode' && !a.startsWith('--root=') && !a.startsWith('--mode='));
  try {
    // stdio 显式全 pipe：execFileSync 默认会把子进程 stderr 透传给父进程，与 catch 里的输出重复
    const out = execFileSync(process.execPath, [STATUS_JS, '--root', ROOT, '--mode', MODE, ...filtered], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    process.stdout.write(out);
  } catch (e) {
    // 子进程非零退出（如 --for 非法：跨仓 target / 仓内 lane 校验不过）时 execFileSync 会连栈抛出——
    // 把 stderr 原样透出、按子进程退出码收尾（2026-10-18 修；原行为 = 干净消息后跟一坨 Node 栈转储）。
    if (e && e.stderr) process.stderr.write(e.stderr);
    process.exit(typeof e?.status === 'number' ? e.status : 1);
  }
  recordStatusSeen();
}

/** close_policy 方向断言：把「谁闭环」从死字段变活（提案 §7 close_policy=self）。
 *
 * 仓内 `.handoff-hub.json` 的 close_policy 决定 continuation（续接新窗口）的闭环责任方：
 *   - `sender`（默认）：闭环方 = 发起方 `from_lane`；
 *   - `self`：continuation 由**后继会话**（`to_lane`，真正完成工作的一方）闭环，而非发起方。
 * 跨仓模式无 lane/close_policy 概念，本断言只作用于仓内模式（跨仓直接跳过）。
 * CLI 无法强验「我是谁」，故用 `--by <lane>` 让调用方**显式声明**闭环身份：
 *   - `self` + continuation → **硬校验**（`--by` 必填且 == `to_lane`）；
 *   - 其余 → `--by` 可选，提供时软校验（不匹配仅警告，避免误伤存量/迁移）。 */
function resolveCloseParty(fm) {
  const policy = (HUB_CONFIG && HUB_CONFIG.close_policy) || 'sender';
  const isContinuation = String(fm?.type || '').toLowerCase() === 'continuation';
  const strict = isContinuation && policy === 'self';
  const party = strict ? String(fm?.to_lane || '') : String(fm?.from_lane || '');
  return { policy, isContinuation, strict, party };
}
function assertCloseDirection(id, fm, args) {
  if (MODE !== 'intra-repo') return; // 跨仓无 lane/close_policy，跳过
  const byIdx = args.indexOf('--by');
  const by = byIdx !== -1 ? String(args[byIdx + 1] || '').trim() : '';
  const { policy, isContinuation, strict, party } = resolveCloseParty(fm);
  if (strict) {
    if (!by) {
      console.error(`❌ close_policy=self：continuation「${id}」由后继会话闭环，须声明 --by <to_lane>（本条 to_lane=${party || '（未填）'}）。`);
      process.exit(1);
    }
    if (by.toLowerCase() !== party.toLowerCase()) {
      console.error(`❌ close_policy=self：continuation 由后继会话（to_lane=${party}）闭环，但 --by=${by} 不匹配。`);
      process.exit(1);
    }
    console.log(`ℹ️ close_policy=self：由后继会话 ${party} 闭环（continuation 续接语义）。`);
  } else if (by && party && by.toLowerCase() !== party.toLowerCase()) {
    console.warn(`⚠️ 闭环方 --by=${by} ≠ 责任方 ${party}（close_policy=${policy}）；软校验，继续执行。`);
  }
}

/** 审计闭环（accept）：发起方收回执 + 独立实测通过 ⇒ received → closed。
 *
 * 与「交回执 receipt（执行方）」严格区分：accept/reject 是**发起方**的动作——
 * 发起方收回执即审计，通过则一次闭环（不再有单独的 close 步骤），不过则 reject 退回。
 * `close` 保留为 accept 同义别名（历史交接文档大量写「handoff close」，迁移平滑）。 */
function cmdAccept(args) {
  const noteIdx = args.indexOf('-n');
  const note = noteIdx !== -1 ? args[noteIdx + 1]?.trim() : undefined;
  const byIdx = args.indexOf('--by');
  const asIdx = args.indexOf('--as');
  const asLane = asIdx !== -1 ? args[asIdx + 1]?.trim() : (byIdx !== -1 ? args[byIdx + 1]?.trim() : undefined);
  const skipIdx = new Set();
  if (noteIdx !== -1) { skipIdx.add(noteIdx); skipIdx.add(noteIdx + 1); }
  if (byIdx !== -1) { skipIdx.add(byIdx); skipIdx.add(byIdx + 1); }
  if (asIdx !== -1) { skipIdx.add(asIdx); skipIdx.add(asIdx + 1); }
  const rawId = args.find((a, i) => !a.startsWith('-') && !skipIdx.has(i));
  if (!rawId || !note) {
    console.error('用法: handoff accept <id> -n "<验收结论>" [--as <lane>]（close 为同义别名）');
    // 2026-10-18 修：仓内没有「依赖方 / 本仓适配」概念（双方是同仓 lane），责任描述按模式分支
    console.error(MODE === 'intra-repo'
      ? '验收门禁：闭环必须留验收证据（核实接收 lane 的改动 + 验证结论），无结论不允许闭环。'
      : '验收门禁：闭环必须留验收证据（核实依赖方改动 + 本仓适配 + 验证结论），无结论不允许闭环。');
    process.exit(2);
  }
  const id = resolveTicketId(rawId);
  const file = path.join(H_DIR, `${id}.md`);
  if (!fs.existsSync(file)) { console.error('找不到交接: ' + file); process.exit(1); }
  assertStatusFresh('accept');

  return withTicketLock(id, () => {
    const content = fs.readFileSync(file, 'utf8');
    const fm = readFM(content);
    assertSessionAffinity(fm, 'accept', id, args);
    const st = fm?.status;

    // 身份门禁（P0-3 修复 / ADR-0008 Phase 2 显式声明）：闭环（accept）是发起方的特权，执行方禁止自审自闭环
    if (MODE === 'intra-repo') {
      const fromLaneRaw = String(fm?.from_lane || '').toLowerCase();
      const fromLanes = fromLaneRaw.split(/[,/]/).map(s => s.trim()).filter(Boolean);
      let cur = resolveExecutionLane(asLane, { fromLane: fm?.from_lane, toLane: fm?.to_lane, op: 'accept', ticketId: id });
      if (!cur) {
        if (fromLanes.length === 1) {
          cur = fromLanes[0];
          const isZh = detectLang() === 'zh';
          console.log(isZh
            ? `ℹ️ [智能推导执行身份] 未声明 --as，当前工单有唯一发起方，自动绑定执行身份: --as ${cur}`
            : `ℹ️ [Auto Identity] Inferred executor role: --as ${cur}`);
        } else if (fromLanes.length > 1) {
          console.error(`❌ 身份歧义：工单声明了多个发起方（${fromLaneRaw}），无法自动推导身份，请使用 --as <lane> 显式声明身份执行。`);
          process.exit(1);
        } else {
          console.error(`❌ 越界闭环：未声明执行身份。闭环（accept）是发起方的特权，请使用 --as <lane> 声明身份，或声明 export HANDOFF_LANE=<lane> 后执行。`);
          process.exit(1);
        }
      }
      if (!fromLanes.includes(cur)) {
        console.error(`❌ 越界闭环：当前执行身份 lane=${cur} 不是发起方 from_lane=${fromLaneRaw}。执行方禁止自审自闭环。`);
        process.exit(1);
      }
    }

    // 状态转换合法性内联（v2.18 · 五态流转）：闭环只允许 delivered → closed（或历史存量 received → closed，须经独立验收）
    if (st === 'draft' || st === 'forwarded') {
      console.error(`❌ 交接 ${id} 当前为 ${st}，尚未完成交付（delivered），不能闭环。请等待执行方: baton deliver ${id}（或 baton receipt ${id} --deliver）`);
      process.exit(1);
    }
    if (st === 'closed') {
      console.log(`↩️ ${id} 已闭环，跳过。`);
      return;
    }

    // P0-a：闭环前置内容门禁——delivered/received 必有回执，且该回执须过「锚节 + 转递提示词 + evidence」，否则拒绝闭环。
    const rFile = path.join(R_DIR, `${id}-resp.md`);
    if (!fs.existsSync(rFile)) { console.error(`❌ 找不到回执: ${rFile}（delivered/received 状态应已有回执）`); process.exit(1); }
    const rRaw = fs.readFileSync(rFile, 'utf8');
    const rFm = readFM(rRaw) || {};

    // 终态交付硬门禁（v2.18 · 防抢跑闭环）：缺 delivered_at 拒绝闭环（杜绝执行方会话未结束即被抢先闭环）
    const deliveredAt = fm.delivered_at || rFm.delivered_at;
    const isLegacy = (fm.created && fm.created < '2026-11-08') || args.includes('--legacy-exempt');
    if (!deliveredAt && !isLegacy) {
      console.error(`❌ 防抢跑闭环：交接 ${id} 尚未收到执行方的显式交付声明（缺 delivered_at），拒绝闭环。`);
      console.error(`   执行方必须在完成自检与证据提交后执行: baton deliver ${id} 确认终态交付。`);
      console.error(`   （若为历史存量交接，可追加 --legacy-exempt 豁免）`);
      process.exit(1);
    }

    // 驳回时序门禁（P0-1 修复）：若曾被驳回，新交付时间必须晚于驳回时间
    if (fm.rejected_at) {
      if (!deliveredAt || new Date(deliveredAt) <= new Date(fm.rejected_at)) {
        console.error(`❌ 驳回未闭合：交接曾于 ${fm.rejected_at} 被驳回，其后未见有效的新交付（delivered_at: ${deliveredAt || '空'}），拒绝闭环。`);
        process.exit(1);
      }
    }

    // 防提前闭环（v2.13/v2.18）：若回执 author/author_lane 为发起方，属自填回执，拒绝据此闭环。
    if (MODE === 'intra-repo' && rFm.author_lane && fm.from_lane && String(rFm.author_lane).toLowerCase() === String(fm.from_lane).toLowerCase()) {
      console.error(`❌ 防提前闭环：回执 author_lane=${rFm.author_lane} 即发起方 from_lane=${fm.from_lane}，属发起方自填回执，拒绝据此闭环。`);
      process.exit(1);
    }
    if (MODE !== 'intra-repo' && rFm.author_repo && fm.source_repo && String(rFm.author_repo).toLowerCase() === String(fm.source_repo).toLowerCase()) {
      console.error(`❌ 防提前闭环：回执 author_repo=${rFm.author_repo} 即发起方 source_repo=${fm.source_repo}，属发起方自填回执，拒绝据此闭环。`);
      process.exit(1);
    }

    const rBody = stripFM(rRaw);

    // 回执结论门禁（P0-1 修复）：回执最新结论为 REJECTED / NO-GO / INCOMPLETE 等不通过或受阻字样，硬拒闭环
    const concl = extractConclusion(rBody);
    if (isVerdictRejected(concl) || isVerdictBlocked(concl)) {
      console.error(`❌ 回执结论未通过/受阻：回执当前结论为「${concl}」，不可闭环。`);
      console.error(`   若已完成整改，请执行方更新回执结论并重新交付；若需执行方整改，请执行 baton reject ${id} -n "<驳回理由>"。`);
      process.exit(1);
    }

    // 审计防伪令牌门禁：to_lane=audit 必须携带签发的一致 Audit Nonce
    if (MODE === 'intra-repo' && String(fm.to_lane || '').toLowerCase() === 'audit') {
      if (fm.audit_nonce && (!rFm.audit_nonce || rFm.audit_nonce !== fm.audit_nonce)) {
        console.error(`❌ 审计防伪门禁：回执记录的 Audit Nonce (${rFm.audit_nonce || '空'}) 与工单签发令牌 (${fm.audit_nonce}) 不一致，拒绝闭环。`);
        process.exit(1);
      }
    }

    // 双盲声明防伪核验：若闭环说明或回执声称双盲，核实是否确已物理脱敏
    const noteAndVerdict = ((note || '') + ' ' + (concl || '')).toLowerCase();
    if (noteAndVerdict.includes('双盲') || noteAndVerdict.includes('double-blind') || noteAndVerdict.includes('double blind')) {
      if (fm.blind !== true && rFm.blind !== true) {
        console.warn(`⚠️ [双盲声明核验] 验收说明或回执中声称了双盲，但该工单在派发转递时未设置 blind: true（未执行物理脱敏）。请避免将非物理脱敏任务表述为物理双盲。`);
      }
    }

    // 未决变更门禁（P1-4 修复）：工单或回执仍标记 needs_change=true，禁止直接闭环
    if (Boolean(rFm.needs_change || fm.needs_change)) {
      console.error(`❌ 存在未决变更：工单或回执仍标记 needs_change=true，禁止直接闭环。`);
      process.exit(1);
    }

    const ws = MODE === 'intra-repo' ? (fm.workspace || rFm.workspace || 'same') : undefined;
    const gate = receiptContentGate(id, rBody, { mode: MODE, workspace: ws, date: rFm.date, evidence: normalizeEvidence(rFm) });
    for (const w of gate.warnings) console.warn('⚠️ ' + w);
    if (gate.problems.length) {
      console.error(`❌ 回执未过内容门禁，拒绝闭环（${gate.problems.length} 项）：`);
      for (const p of gate.problems) console.error('  - ' + p);
      console.error(`   若判为伪回执请 handoff reject ${id} -n "<理由>" 退回；若仅缺证据请执行方补 handoff receipt ${id} -n "..." --evidence-paths "..." 后再闭环。`);
      process.exit(1);
    }
    // close_policy 方向断言（self+continuation 硬校验后继会话身份）
    assertCloseDirection(id, fm, args);
    // 验收记录节标题统一「验收记录（闭环依据）」，不写死任何一方（原跨仓写死 iggle，Tappy 等非 iggle 发起方会烙错章）
    if (!/^## (验收记录|Audit Record|Acceptance Record)/im.test(content)) {
      const appended = content.replace(/\n*$/, '\n') + `\n## 验收记录（闭环依据）\n- 日期：${todayISO()}\n- 结论：${note}\n`;
      fs.writeFileSync(file, appended, 'utf8');
    }
    const now = new Date().toISOString();
    const updateFM = { status: 'closed', closed: todayISO(), accepted_at: now };
    if (deliveredAt) updateFM.delivered_at = deliveredAt;
    setFM(file, updateFM);
    logStateJournal(id, 'accept', { from_status: st, to_status: 'closed', accepted_at: now, note });
    console.log(`✅ 已审计闭环: ${id}（验收记录已写入交接文档）`);

    // 清理注册表避免孤儿文件 (D2)
    const watchFile = path.join(ROOT, '.watch', `${id}.json`);
    try { if (fs.existsSync(watchFile)) fs.unlinkSync(watchFile); } catch {}

    // ── Worktree 生命周期回收（微内核驱动挂载）──
    if (fm.workspace === 'worktree') {
      if (args.includes('--prune-worktree') || args.includes('-p')) {
        const pOut = invokeWorkspaceDriver('prune', id, ['--force']);
        if (!pOut?.error) {
          console.log(`🧹 [Worktree 回收] 已自动清理工单 [${id}] 的隔离工作树与临时分支。`);
        }
      } else {
        console.log(`ℹ️ [Worktree 提示] 本工单运行于隔离工作树，可执行 baton-worktree prune ${id} 回收磁盘空间（或在 close 时加 --prune-worktree）。`);
      }
    }
  });
}

/** 审计驳回（reject）：发起方收回执后实测不过 ⇒ received → forwarded（退回执行方继续改）。
 * 驳回理由追加进回执文件「驳回记录」节（回执是执行方产物，驳回是发起方反馈，落同一文件便于对账）；
 * 状态翻 forwarded 表达「待执行方继续改」。 */
function cmdReject(args) {
  const noteIdx = args.indexOf('-n');
  const rawNote = noteIdx !== -1 ? args[noteIdx + 1]?.trim() : undefined;
  const note = rawNote !== undefined ? rawNote.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n') : undefined;
  const byIdx = args.indexOf('--by');
  const asIdx = args.indexOf('--as');
  const byArg = byIdx !== -1 ? args[byIdx + 1]?.trim() : undefined;
  const asArg = asIdx !== -1 ? args[asIdx + 1]?.trim() : undefined;
  const skipIdx = new Set();
  if (noteIdx !== -1) { skipIdx.add(noteIdx); skipIdx.add(noteIdx + 1); }
  if (byIdx !== -1) { skipIdx.add(byIdx); skipIdx.add(byIdx + 1); }
  if (asIdx !== -1) { skipIdx.add(asIdx); skipIdx.add(asIdx + 1); }
  const rawId = args.find((a, i) => !a.startsWith('-') && !skipIdx.has(i));
  if (!rawId || !note) {
    console.error('用法: handoff reject <id> -n "<驳回理由>" [--as <lane> | --by <lane>]');
    console.error('驳回门禁：审计不通过必须写清驳回理由（缺什么 / 差在哪），无理由不允许退回。');
    process.exit(2);
  }
  const id = resolveTicketId(rawId);
  const file = path.join(H_DIR, `${id}.md`);
  if (!fs.existsSync(file)) { console.error('找不到交接: ' + file); process.exit(1); }
  assertStatusFresh('reject');

  return withTicketLock(id, () => {
    const rawH = fs.readFileSync(file, 'utf8');
    const hFm = readFM(rawH);
    const st = hFm?.status;

    // 身份门禁：允许发起方驳回执行方交付，亦允许审计方（to_lane=audit）对被审工单给出驳回裁决
    let cur = resolveExecutionLane(asArg || byArg, { fromLane: hFm?.from_lane, toLane: hFm?.to_lane, op: 'reject', ticketId: id });
    let isFromLane = false;
    let isAuditor = false;
    if (MODE === 'intra-repo') {
      const fromLaneRaw = String(hFm?.from_lane || '').toLowerCase();
      const toLaneRaw = String(hFm?.to_lane || '').toLowerCase();
      const fromLanes = fromLaneRaw.split(/[,/]/).map(s => s.trim()).filter(Boolean);
      if (!cur) {
        if (st === 'delivered' || st === 'received') {
          if (fromLanes.length === 1) {
            cur = fromLanes[0];
            const isZh = detectLang() === 'zh';
            console.log(isZh
              ? `ℹ️ [智能推导执行身份] 未声明 --as，当前处于交付验收阶段，自动绑定发起方身份: --as ${cur}`
              : `ℹ️ [Auto Identity] Inferred rejector role: --as ${cur}`);
          } else if (fromLanes.length > 1) {
            console.error(`❌ 身份歧义：工单声明了多个发起方（${fromLaneRaw}），无法自动推导身份，请使用 --as <lane> 显式声明身份执行。`);
            process.exit(1);
          } else {
            console.error(`❌ 越界驳回：未声明执行身份。请使用 --as <lane> 声明身份，或声明 export HANDOFF_LANE=<lane> 后执行。`);
            process.exit(1);
          }
        } else if (st === 'forwarded' && toLaneRaw === 'audit') {
          cur = 'audit';
          const isZh = detectLang() === 'zh';
          console.log(isZh
            ? `ℹ️ [智能推导执行身份] 未声明 --as，当前处于审计前置核验阶段，自动绑定审计方身份: --as audit`
            : `ℹ️ [Auto Identity] Inferred rejector role: --as audit`);
        } else {
          console.error(`❌ 越界驳回：未声明执行身份。请使用 --as <lane>（如 --as ${fromLaneRaw || toLaneRaw}）声明身份，或声明 export HANDOFF_LANE=${fromLaneRaw || toLaneRaw} 后执行。`);
          process.exit(1);
        }
      }
      isFromLane = fromLanes.includes(cur);
      isAuditor = (cur === toLaneRaw && toLaneRaw === 'audit');
      if (!isFromLane && !isAuditor) {
        console.error(`❌ 越界驳回：当前执行身份 lane=${cur} 既非发起方 from_lane=${fromLaneRaw}，亦非审计方 to_lane=${toLaneRaw}。驳回仅允许由发起方或审计方执行。`);
        process.exit(1);
      }
    } else {
      isFromLane = true;
    }

    if (st === 'draft' && !isAuditor && !isFromLane) {
      console.error(`❌ 交接 ${id} 当前为 draft，尚无登记回执或交付，不能驳回${fs.existsSync(path.join(R_DIR, `${id}-resp.md`)) ? `；检测到回执文件，请先 baton deliver ${id} 交付后再核验驳回` : ''}。`);
      process.exit(1);
    }
    if (st === 'closed') {
      console.error(`❌ 交接 ${id} 已闭环（closed），不可再驳回。若需追回误闭环工单请使用: baton reopen ${id} -n "<重开理由>"`);
      process.exit(1);
    }
    if (st === 'forwarded' && !isAuditor && hFm?.rejected_by === cur) {
      console.log(`↩️ ${id} 已由我方驳回退回（待执行方继续改），跳过。`);
      return;
    }

    // P0-a（信息面）：reject 前把回执内容门禁发现的问题打出来，辅助审计判定（不阻断——reject 本身即纠正动作）
    {
      const rFile0 = path.join(R_DIR, `${id}-resp.md`);
      if (fs.existsSync(rFile0)) {
        const rRaw0 = fs.readFileSync(rFile0, 'utf8');
        const rFm0 = readFM(rRaw0) || {};
        const rBody0 = stripFM(rRaw0);
        const ws0 = MODE === 'intra-repo' ? (hFm?.workspace || rFm0.workspace || 'same') : undefined;
        const g0 = receiptContentGate(id, rBody0, { mode: MODE, workspace: ws0, date: rFm0.date, evidence: normalizeEvidence(rFm0) });
        if (g0.problems.length) { console.log(`ℹ️ 回执内容门禁发现 ${g0.problems.length} 项（可作本次驳回依据）：`); for (const p of g0.problems) console.log('   - ' + p); }
      }
    }

    const rFile = path.join(R_DIR, `${id}-resp.md`);
    let rHash = '';
    const nextRound = (Number(hFm?.round) || 1) + 1;
    const rejEntry = `- 日期：${todayISO()}\n- 理由：${note}\n`;
    const rejTicketEntry = `- 轮次：Round ${nextRound}（驳回方: ${cur}）\n- 日期：${todayISO()}\n- 理由：${note}\n`;
    const updatedTicket = insertRejectionEntry(rawH, rejTicketEntry);
    fs.writeFileSync(file, updatedTicket, 'utf8');

    if (fs.existsSync(rFile)) {
      const rRaw = fs.readFileSync(rFile, 'utf8');
      const rBody = stripFM(rRaw);
      rHash = hashContent(getCleanBody(rBody));
      const updatedRaw = insertRejectionEntry(rRaw, rejEntry);
      fs.writeFileSync(rFile, updatedRaw, 'utf8');
      const rFmOld = readFM(rRaw) || {};
      const rUpdates = { delivered_at: '', delivered_by_lane: '', needs_change: true, audit_nonce: '' };
      if (!rFmOld.evidence_note && (!rFmOld.evidence_paths || !rFmOld.evidence_paths.length) && (!rFmOld.evidence_commits || !rFmOld.evidence_commits.length)) {
        rUpdates.evidence_note = `审计方驳回退回：${note}`;
      }
      // 回执清空交付状态并标记需整改，重置 audit_nonce
      setFM(rFile, rUpdates);
    } else {
      fs.writeFileSync(rFile, `---\nhandoff_id: ${id}\nmode: ${MODE}\nfrom_lane: ${hFm?.to_lane || 'audit'}\nto_lane: ${hFm?.from_lane || 'impl'}\nneeds_change: true\ndate: ${todayISO()}\nevidence_note: 审计方驳回退回：${note}\n---\n\n## 状态 / 结论\n- **结论**：REJECTED / NO-GO\n- **说明**：工单被审计方直接驳回退回整改。\n\n## 驳回记录\n${rejEntry}`, 'utf8');
    }

    const rejectTime = new Date().toISOString();
    const curCount = Number(hFm?.reject_count || 0) + 1;
    const updateReject = {
      status: 'forwarded',
      delivered_at: '',
      accepted_at: '',
      rejected_at: rejectTime,
      rejected_by: cur,
      rejected_receipt_hash: rHash,
      reject_count: curCount,
      round: nextRound,
      needs_change: true
    };
    if (MODE === 'intra-repo' && String(hFm?.to_lane || '').toLowerCase() === 'audit') {
      updateReject.audit_nonce = generateAuditNonce(id);
      const isZh = detectLang() === 'zh';
      console.log(isZh
        ? `ℹ️ 工单已进入 Round ${nextRound}，已轮转全新 Audit Nonce: ${updateReject.audit_nonce}`
        : `ℹ️ Ticket entered Round ${nextRound}, rotated new Audit Nonce: ${updateReject.audit_nonce}`);
    }
    setFM(file, updateReject);
    logStateJournal(id, 'reject', {
      from_status: st,
      to_status: 'forwarded',
      rejected_at: rejectTime,
      note,
      reject_count: curCount,
      rejected_by: cur,
      audit_nonce: updateReject.audit_nonce
    });
    console.log(`✅ 已驳回退回: ${id} → forwarded（驳回理由已写入工单与回执）`);
    if (MODE === 'intra-repo') {
      const isZh = detectLang() === 'zh';
      const rejectorRole = resolveLaneRole(cur) || (isZh ? '驳回方' : 'Rejector');
      const targetLane = (isAuditor || !isFromLane) ? (hFm?.from_lane || 'impl') : (hFm?.to_lane || 'impl');
      const targetRole = resolveLaneRole(targetLane) || (isZh ? '实现方' : 'Implementer');
      let verdictLine;
      if (cur === 'audit') {
        verdictLine = isZh
          ? `审计完成，裁决 NO-GO（工单已退回${targetRole}进入 Round ${nextRound}）`
          : `Audit complete, verdict NO-GO (Ticket returned to ${targetRole} entering Round ${nextRound})`;
      } else if (isFromLane) {
        verdictLine = isZh
          ? `${rejectorRole}验收未通过，裁决 NO-GO（工单已退回${targetRole}进入 Round ${nextRound}）`
          : `${rejectorRole} verification failed, verdict NO-GO (Ticket returned to ${targetRole} entering Round ${nextRound})`;
      } else {
        verdictLine = isZh
          ? `${rejectorRole}驳回退回，裁决 NO-GO（工单已退回${targetRole}进入 Round ${nextRound}）`
          : `${rejectorRole} rejected, verdict NO-GO (Ticket returned to ${targetRole} entering Round ${nextRound})`;
      }
      if (isZh) {
        console.log(`\nℹ️ 裁决收尾（接收方回复末尾仅单行纯文本，无需标题与代码块）:`);
        console.log(verdictLine + '\n');
      } else {
        console.log(`\nℹ️ Verdict Epilogue (Receiver outputs single plain-text line at the end, no headers or code blocks):`);
        console.log(verdictLine + '\n');
      }
    }
  });
}

/** 审计重开（reopen · P1-5）：针对误闭环工单提供安全追回通道，消除永久假绿灯 */
function cmdReopen(args) {
  const noteIdx = args.indexOf('-n');
  const note = noteIdx !== -1 ? args[noteIdx + 1]?.trim() : undefined;
  const asIdx = args.indexOf('--as');
  const byIdx = args.indexOf('--by');
  const asLane = asIdx !== -1 ? args[asIdx + 1]?.trim() : (byIdx !== -1 ? args[byIdx + 1]?.trim() : undefined);
  const skipIdx = new Set();
  if (noteIdx !== -1) { skipIdx.add(noteIdx); skipIdx.add(noteIdx + 1); }
  if (asIdx !== -1) { skipIdx.add(asIdx); skipIdx.add(asIdx + 1); }
  if (byIdx !== -1) { skipIdx.add(byIdx); skipIdx.add(byIdx + 1); }
  const rawId = args.find((a, i) => !a.startsWith('-') && !skipIdx.has(i));
  if (!rawId || !note) {
    console.error('用法: baton reopen <id> -n "<重开理由>" [--as <lane>]');
    console.error('重开门禁：误闭环重开必须写清重开理由（为何追回 / 发现了什么遗漏），无理由不允许重开。');
    process.exit(2);
  }
  const id = resolveTicketId(rawId);
  const file = path.join(H_DIR, `${id}.md`);
  if (!fs.existsSync(file)) { console.error('找不到交接: ' + file); process.exit(1); }
  assertStatusFresh('reopen');

  return withTicketLock(id, () => {
    const content = fs.readFileSync(file, 'utf8');
    const fm = readFM(content);
    if (!fm) { console.error('工单损坏: ' + file); process.exit(1); }
    assertSessionAffinity(fm, 'reopen', id, args);
    if (fm.status !== 'closed') {
      console.error(`❌ 工单 ${id} 当前状态为 ${fm.status}，仅 closed 状态允许重开。`);
      process.exit(1);
    }
    if (MODE === 'intra-repo') {
      const fromLane = String(fm.from_lane || '').toLowerCase();
      const cur = (asLane || process.env.HANDOFF_LANE || '').toLowerCase();
      if (cur && cur !== fromLane) {
        console.error(`❌ 越界重开：当前执行身份 lane=${cur} 不是发起方 from_lane=${fromLane}。仅发起方可重开工单。`);
        process.exit(1);
      }
    }
    const now = new Date().toISOString();
    const appended = content.replace(/\n*$/, '\n') + `\n## 重开记录\n- 日期：${todayISO()}\n- 理由：${note}\n`;
    fs.writeFileSync(file, appended, 'utf8');
    const updateReopen = { status: 'forwarded', closed: '', accepted_at: '', delivered_at: '', reopened_at: now, needs_change: true };
    if (MODE === 'intra-repo' && String(fm.to_lane || '').toLowerCase() === 'audit') {
      updateReopen.audit_nonce = generateAuditNonce(id);
    }
    setFM(file, updateReopen);
    logStateJournal(id, 'reopen', { from_status: 'closed', to_status: 'forwarded', reopened_at: now, note, audit_nonce: updateReopen.audit_nonce });
    console.log(`✅ 已重开交接: ${id} → forwarded（状态已打回，验收与闭环时间戳已清除，重开理由已记录）`);
  });
}

/** 写回执文件（v2.25 · 保护既有回执、备份防丢失、继承驳回记录）。 */
function writeReceiptFile(rFile, rFm, note, skeleton) {
  if (note !== undefined) {
    const cleanNote = typeof note === 'string' ? note.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n') : note;
    if (!fs.existsSync(rFile)) {
      writeFM(rFile, { ...rFm, date: todayISO() }, ensureTrailingNewline(cleanNote));
      return;
    }
    const oldRaw = fs.readFileSync(rFile, 'utf8');
    const fm = readFM(oldRaw) || {};
    const oldBody = stripFM(oldRaw);

    // 自动备份防覆盖丢失 (P0-2)
    try {
      const bakFile = rFile.replace(/\.md$/, '.bak.md');
      fs.writeFileSync(bakFile, oldRaw, 'utf8');
    } catch {}

    // 保护旧回执中的「## 驳回记录」：若新 note 未包含驳回记录，自动继承保留；若包含则条目级合并，严禁静默抹除历史 (P0-2)
    let finalBody = ensureTrailingNewline(cleanNote);
    finalBody = mergeRejectionRecords(oldBody, finalBody);

    // 继承 needs_change：若原先是 true 且新入参未显式设为 false，保持 true (P1-4)
    const mergedNeedsChange = rFm.needs_change !== undefined ? rFm.needs_change : Boolean(fm.needs_change);

    const mergedFM = { ...fm, ...rFm, needs_change: mergedNeedsChange };
    writeFM(rFile, mergedFM, finalBody);
    return;
  }
  if (!fs.existsSync(rFile)) { writeFM(rFile, { ...rFm, date: todayISO() }, skeleton); return; }
  setFM(rFile, rFm);
}

/** 从回执正文抽取一行「结论」摘要（唯一依据 RESPONSE-TEMPLATE.md 的 ## 结论 (Verdict) 硬锚节；优先提取「- **结论**：...」或首个非空行）。 */
function extractConclusion(raw) {
  if (!raw) return '';
  const norm = String(raw).replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  for (const t of ['结论', 'Conclusion', 'Verdict']) {
    for (const body of receiptSections(norm, t)) {
      const lines = body.split('\n').map(s => s.trim()).filter(Boolean);
      for (const l of lines) {
        if (l.startsWith('#')) continue;
        const match = l.match(/^(?:[-*]\s*)?(?:\*\*)?(?:结论|Conclusion|Verdict|Status|状态)(?:\*\*)?[：:]\s*(.*)$/i);
        if (match && match[1]) {
          const val = match[1].trim();
          return val.length > 50 ? val.slice(0, 50) + '…' : val;
        }
      }
      for (const l of lines) {
        if (l.startsWith('#') || l.startsWith('>')) continue;
        const listMatch = l.match(/^[-*]\s+(.*)$/);
        if (listMatch && listMatch[1] && !listMatch[1].startsWith('**说明**') && !listMatch[1].startsWith('**Note**')) {
          const val = listMatch[1].trim();
          return val.length > 50 ? val.slice(0, 50) + '…' : val;
        }
        if (!l.startsWith('-') && !l.startsWith('*')) {
          return l.length > 50 ? l.slice(0, 50) + '…' : l;
        }
      }
    }
  }
  return '';
}

/** P1（v2.12.4 热修批次）：handoff receipt 成功后，直接在控制台打印可复制「回执交付行」，
 *  与 cmdPrompt 对 separate 的交接提示词对称——免得 agent 自己手拼（易漏路径/体积/needs_change）。
 *  跨仓：detectRepo→TARGET_LABELS 拼仓库标签（跨仓方向以仓库为角色，不在本次修改范围）；
 *  **仓内（v2.13 修复）：严禁 detectRepo 拼仓库名**，改读回执 frontmatter 的 from_lane/to_lane，
 *  用 resolveLaneRole 拼自然角色（杜绝「请收 Tappy 回执」式把项目名当沟通角色的事故）。 */
function printReceiptDeliveryLine(rFile, needsChange, isDelivered = false) {
  let lines = 0, bytes = 0, fromLane = '', toLane = '', rawText = '', ticketId = '';
  try {
    const buf = fs.readFileSync(rFile);
    bytes = buf.length;
    const text = buf.toString('utf8');
    rawText = text;
    lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    const fm = readFM(text) || {};
    fromLane = fm.from_lane || '';
    toLane = fm.to_lane || '';
    ticketId = fm.handoff_id || path.basename(rFile).replace(/-resp\.md$/, '');
    if (fm.delivered_at) isDelivered = true;
  } catch { /* 读不到不阻断主流程 */ }
  const flag = needsChange ? '是' : '否';
  const display = rFile.startsWith(os.homedir()) ? '~' + rFile.slice(os.homedir().length) : rFile;
  const isZh = detectLang() === 'zh';
  if (MODE === 'intra-repo') {
    const toRole = resolveLaneRole(toLane) || toLane || (isZh ? '发起方' : 'Initiator');
    const fromRole = resolveLaneRole(fromLane) || fromLane || (isZh ? '本方' : 'Executor');
    if (isDelivered) {
      console.log(`\n✅ 仓内终态交付已生效 [${ticketId}]（状态推进为 delivered，后台监听已自动感知平息并唤醒发起方/审计方进行独立验收闭环）。`);
      const verdictLine = fromLane === 'audit'
        ? (isZh ? `审计完成，裁决 GO` : `Audit complete, verdict GO`)
        : (isZh ? `交付完成，回执已就绪 [${ticketId}]：${display}` : `Delivery complete, receipt ready [${ticketId}]: ${display}`);
      if (isZh) {
        console.log(`\nℹ️ 交付收尾（接收方回复末尾仅单行纯文本，无需标题与代码块）:`);
        console.log(verdictLine + '\n');
      } else {
        console.log(`\nℹ️ Delivery Epilogue (Receiver outputs single plain-text line at the end, no headers or code blocks):`);
        console.log(verdictLine + '\n');
      }
    } else {
      const waitNotice = needsChange
        ? `（status: received · 需整改/受阻待处理，严禁 deliver）`
        : `（status: received）。注意：自检全通后还需 baton deliver ${ticketId} 才会唤醒发起方。`;
      console.log(`\n✅ 仓内回执已登记为草稿 [${ticketId}]${waitNotice}\n`);
    }
    return;
  }
  console.log(`\n📋 回执交付行（复制给发起方 Agent，一行即完整）:\n`);
  const repo = detectRepo(process.cwd());
  const label = repo ? (TARGET_LABELS[repo] || repo) : (path.basename(process.cwd()) || '本仓');
  console.log(`请收 ${label} 回执 [${ticketId}]：${display}（${lines} 行 / ${bytes} 字节 · 需发起方改动：${flag}）`);
  console.log(`\n（接收方注 · 勿复制给发起方：该行触发「收回执」路由——发起方读回执并审计；内容已闭环时，回复里要说清「接下来由谁处理、我这边是否还动」，不要写「无需转递」这类看不出责任主体的说法。）`);
}

function cmdReceipt(args) {
  const explicitDeliver = args.includes('--deliver');
  const isDraft = args.includes('--draft');
  const hasNeedsChange = args.includes('--needs-change');
  const hasNoNeedsChange = args.includes('--no-needs-change');
  const isAutoNonce = args.includes('--auto-nonce');
  const auditNonceInput = flagValue(args, '--audit-nonce');
  const asInput = flagValue(args, '--as') || flagValue(args, '--by');
  const noteIdx = args.indexOf('-n');
  const rawNote = noteIdx !== -1 ? args[noteIdx + 1]?.trim() : undefined;
  const note = rawNote !== undefined ? rawNote.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n') : undefined;
  // evidence flags（P0-c）：CLI 传入可核验证据，落进 frontmatter 供门禁/check 校验
  const evidenceFlags = {
    commits: flagValue(args, '--evidence-commits'),
    paths: flagValue(args, '--evidence-paths'),
    repo: flagValue(args, '--evidence-repo'),
    note: flagValue(args, '--evidence-note'),
  };
  // 稳健取 id：跳过「带值 flag」的值位（-n 与 evidence 系列），避免把 flag 值误当 id
  const valFlags = ['-n', '--evidence-commits', '--evidence-paths', '--evidence-repo', '--evidence-note', '--audit-nonce', '--as', '--by'];
  const valueIdx = new Set();
  for (let i = 0; i < args.length; i++) if (valFlags.includes(args[i])) valueIdx.add(i + 1);
  const rawId = args.find((a, i) => !a.startsWith('-') && !valueIdx.has(i));
  if (!rawId) { console.error('用法: handoff receipt <id> [-n "<回执正文>"] [--deliver|--draft] [--as <lane>] [--needs-change] [--no-needs-change] [--audit-nonce "<nonce>"] [--evidence-paths "a,b"] [--evidence-commits "sha"] [--evidence-repo key] [--evidence-note "..."]'); process.exit(2); }
  const id = resolveTicketId(rawId);
  const hFile = path.join(H_DIR, `${id}.md`);
  if (!fs.existsSync(hFile)) { console.error('找不到交接: ' + hFile); process.exit(1); }
  assertStatusFresh('receipt');

  return withTicketLock(id, () => {
    const hFm = readFM(fs.readFileSync(hFile, 'utf8'));
    const st = hFm?.status;
    // 防提前闭环（v2.13 / v2.25 P0-3 强化 / ADR-0008 Phase 2 显式声明）：发起方禁止自填回执，且仓内模式强制校验执行身份
    const cur = resolveExecutionLane(asInput, { fromLane: hFm?.from_lane, toLane: hFm?.to_lane, op: explicitDeliver ? 'deliver' : 'receipt', ticketId: id });
    if (MODE === 'intra-repo') {
      const toLane = String(hFm?.to_lane || '').toLowerCase();
      const fromLane = String(hFm?.from_lane || '').toLowerCase();
      if (!cur) {
        console.error(`❌ 防提前闭环：未声明执行身份，无法核验回执撰写方身份（拒绝匿名回执）。`);
        console.error(`   请使用 --as ${toLane} 显式声明身份，或在窗口声明 export HANDOFF_LANE=${toLane}。`);
        process.exit(1);
      }
      if (cur === fromLane && fromLane) {
        console.error(`❌ 防提前闭环：当前执行身份 lane=${cur} 即发起方（from_lane），禁止自填回执。回执必须由接收方 to_lane=${toLane}（${resolveLaneRole(toLane)}）独立撰写，否则破坏独立审计制衡。`);
        process.exit(1);
      }
      if (cur !== toLane) {
        console.error(`❌ 防提前闭环：当前执行身份 lane=${cur} 不是该交接指定接收方 to_lane=${toLane}（${resolveLaneRole(toLane)}）；回执须由接收方撰写，越界写回执会污染审计。`);
        process.exit(1);
      }
    }
    // 状态转换合法性内联（v2.6；v2.12.5 放开 draft）：draft/forwarded → received。
    if (st === 'draft') {
      console.log(`ℹ️ ${id} 仍为 draft（发起方未跑可选标记 forward）→ 直接登记回执（draft → received）。`);
    }
    if (st === 'closed') {
      console.error(`❌ 交接 ${id} 已闭环（closed），不可再回执。`);
      process.exit(1);
    }
    // P0-b：落盘前内容门禁——带 -n 的实际正文须过「锚节 + 转递提示词 + evidence」，缺即拒收、不落盘、不翻状态
    if (note !== undefined) {
      const ws = MODE === 'intra-repo' ? (hFm.workspace || 'same') : undefined;
      const ctx = { mode: MODE, workspace: ws, date: todayISO(), evidence: normalizeEvidence(evidenceFlags) };
      const { problems, warnings } = receiptContentGate(id, note, ctx);
      for (const w of warnings) console.warn('⚠️ ' + w);
      if (problems.length) {
        console.error(`❌ 回执未过内容门禁，拒绝落盘（${problems.length} 项）：`);
        for (const p of problems) console.error('  - ' + p);
        console.error(`   👉 可运行: baton receipt ${id} -n "## 状态 / 结论\\n- **结论**：PASS" --evidence-paths "<文件路径>"`);
        console.error(`   （或附说明：--evidence-note "说明原因"）`);
        process.exit(1);
      }
    }

    // tool_profile=readonly 约束门禁 (ADR-0012 §2.6 / ADR-0009 反假接线)
    if (hFm?.tool_profile === 'readonly') {
      const pathsStr = evidenceFlags.paths || '';
      const evPaths = pathsStr.split(',').map(s => s.trim()).filter(Boolean);
      const forbiddenMutations = evPaths.filter(p => {
        const clean = p.replace(/^[+~]/, '');
        if (clean.startsWith('.handoffs/') || clean.startsWith('specs/') || clean.startsWith('/tmp/') || clean.startsWith('tmp/')) return false;
        return !clean.endsWith('.log') && !clean.endsWith('.json') && !clean.endsWith('.txt') && !clean.endsWith('.md');
      });
      if (forbiddenMutations.length > 0) {
        console.error(`❌ [Tool Profile 约束违例] 工单声明 tool_profile=readonly（只读探查），但回执 evidence_paths 包含生产代码修改: [${forbiddenMutations.join(', ')}]`);
        console.error(`   只读工单严禁提交代码改动，仅允许只读探测与回执/证据交付。`);
        process.exit(1);
      }
    }

    const rFile = path.join(R_DIR, `${id}-resp.md`);
    let existingRFm = null;
    let existingRBody = '';
    if (fs.existsSync(rFile)) {
      try {
        const rRaw = fs.readFileSync(rFile, 'utf8');
        existingRFm = readFM(rRaw) || {};
        existingRBody = stripFM(rRaw);
      } catch {}
    }
    const bodyToCheck = note !== undefined ? note : existingRBody;
    const concl = extractConclusion(bodyToCheck);

    // 严谨计算 needs_change：明确入参 > 显式新正文结论 > 既有回执 frontmatter > 存量正文结论 > 工单继承
    let needsChange = false;
    if (hasNeedsChange) {
      needsChange = true;
    } else if (hasNoNeedsChange) {
      needsChange = false;
    } else if (note !== undefined && concl) {
      needsChange = (isVerdictRejected(concl) || isVerdictBlocked(concl));
    } else if (existingRFm && existingRFm.needs_change !== undefined) {
      needsChange = Boolean(existingRFm.needs_change);
    } else if (isVerdictRejected(concl) || isVerdictBlocked(concl)) {
      needsChange = true;
    } else if (hFm && hFm.needs_change !== undefined) {
      needsChange = Boolean(hFm.needs_change);
    }

    const isPositiveVerdict = concl && !isVerdictRejected(concl) && !isVerdictBlocked(concl);
    // 鲁棒性默认自动交付：当回执正文明确且结论正向且无变更时，默认直接交付，彻底解决 Agent 漏传 --deliver 导致 wait 挂死
    const shouldDeliver = !isDraft && (explicitDeliver || Boolean(note !== undefined && isPositiveVerdict && !needsChange));

    // 审计防伪门禁 (Audit Nonce · ADR-0008 交付中间件解耦与下车通道)：
    // 针对 to_lane=audit 实施任务绑定与防伪核验。
    // 防作弊核心目标：杜绝未经审计的伪造 PASS 验收与抢跑交付。
    // 1. 若结论为 PASS / 正向结论，或显式触发交付（shouldDeliver），必须核验 Audit Nonce；
    // 2. 若结论为受阻 / NO-GO / INCOMPLETE，或未通过草稿，允许无阻碍登记，畅通下车通道。
    let finalAuditNonce = auditNonceInput || (existingRFm && existingRFm.audit_nonce) || '';
    let finalAuditSig = (existingRFm && existingRFm.audit_sig) || '';
    if (MODE === 'intra-repo' && String(hFm?.to_lane || '').toLowerCase() === 'audit') {
      let expectedNonce = hFm.audit_nonce;
      if (!expectedNonce) {
        // 存量工单或未初始化：补签令牌并写入工单
        expectedNonce = generateAuditNonce(id);
        setFM(hFile, { audit_nonce: expectedNonce });
        console.log(`ℹ️ 补发审计防伪令牌 (Audit Nonce): ${expectedNonce}`);
      }
      if (isAutoNonce) {
        if (cur !== 'audit') {
          console.error(`❌ 越权拦截：--auto-nonce 自动绑定令牌仅限目标审计方 (to_lane=audit) 授权使用。当前执行身份 lane=${cur || '未声明'} 禁止调用！`);
          process.exit(1);
        }
        finalAuditNonce = expectedNonce;
        const isZh = detectLang() === 'zh';
        console.log(isZh
          ? `ℹ️ [--auto-nonce 自动绑定] 已自动获取工单最新 Audit Nonce: ${finalAuditNonce}`
          : `ℹ️ [--auto-nonce] Bound active Audit Nonce: ${finalAuditNonce}`);
      }
      const isPositiveVerdict = concl && !isVerdictRejected(concl) && !isVerdictBlocked(concl);
      const mustEnforceNonce = shouldDeliver || isPositiveVerdict;

      if (mustEnforceNonce) {
        if (!finalAuditNonce) {
          console.error(`❌ 审计防伪门禁：工单 to_lane=audit ${shouldDeliver ? '交付' : '通过验收'}必须携带系统签发的 Audit Nonce。`);
          console.error(`   当前工单签发令牌：${expectedNonce}（可通过 baton show ${id} 查看）。`);
          console.error(`   请使用 --audit-nonce "${expectedNonce}" 提交，或在回执 frontmatter 写入 audit_nonce: ${expectedNonce}。`);
          process.exit(1);
        }
        if (finalAuditNonce !== expectedNonce) {
          const curRound = hFm.round || 1;
          console.error(`❌ 审计防伪门禁：提供的 Audit Nonce「${finalAuditNonce}」与该工单签发的「${expectedNonce}」不匹配，拒绝跨工单复用或伪造令牌。`);
          console.error(`   当前工单处于 Round ${curRound}，有效令牌为：${expectedNonce}`);
          console.error(`   👉 一键自愈：追加 --audit-nonce "${expectedNonce}"（或在同工作区授权下直接追加 --auto-nonce 自动绑定最新令牌）。`);
          process.exit(1);
        }

        // 私钥签章（ADR-0010）：必须由持有 audit.token 的 audit 角色完成私钥签章
        const auditToken = getAuditSecretToken({ requireAuditLane: true, currentLane: cur });
        if (!auditToken) {
          console.error(`❌ 审计私钥访问拒绝 (AUDIT_CREDENTIAL_DENIED): 仅允许持有审计私钥凭据的 audit 角色生成签章。当前角色 (${cur || '未声明'}) 无权使用 audit.token！`);
          console.error(`   严禁发起方或其他角色仅凭工单明文 Nonce 冒充签章通过验收。`);
          process.exit(1);
        }
        finalAuditSig = computeAuditSignature(auditToken, id, hFm.round || 1, expectedNonce);
      } else {
        // 负向结论（NO-GO / 受阻）或未通过草稿：若提供了 Nonce 则校验防跨工单伪造；未提供则友情提示并放行
        if (finalAuditNonce && finalAuditNonce !== expectedNonce) {
          const curRound = hFm.round || 1;
          console.error(`❌ 审计防伪门禁：提供的 Audit Nonce「${finalAuditNonce}」与该工单签发的「${expectedNonce}」不匹配，拒绝跨工单复用或伪造令牌。`);
          console.error(`   当前工单处于 Round ${curRound}，有效令牌为：${expectedNonce}`);
          console.error(`   👉 一键自愈：追加 --audit-nonce "${expectedNonce}"（或在同工作区授权下直接追加 --auto-nonce 自动绑定最新令牌）。`);
          process.exit(1);
        }
        if (!finalAuditNonce) {
          console.log(`ℹ️ [防伪提示] 当前为未通过/受阻回执（${concl || '未就绪'}），已豁免 Nonce 登记。后续通过验收并交付前需补齐 Audit Nonce (${expectedNonce})。`);
        }
        finalAuditSig = '';
      }
    }

    const evFM = evidenceFM(evidenceFlags);
    if (MODE === 'intra-repo') {
      // 仓内回执：方向由 frontmatter 的 from_lane / to_lane 决定，不写跨仓专属字段；date 补齐（与骨架五字段一致）
      const rFm = {
        handoff_id: id,
        mode: 'intra-repo',
        from_lane: hFm.to_lane || '',
        to_lane: hFm.from_lane || '',
        needs_change: needsChange,
        ...evFM
      };
      if (finalAuditNonce) rFm.audit_nonce = finalAuditNonce;
      if (finalAuditSig) rFm.audit_sig = finalAuditSig;
      if (hFm.blind) rFm.blind = true;
      // 记录撰写方 lane（防提前闭环的耐久证据）：闭环/check 侧可据此核验回执确由接收方撰写，非发起方自填。
      if (cur) rFm.author_lane = cur;
      writeReceiptFile(rFile, rFm, note, receiptStubIntra(id, hFm.from_lane || ''));
      setFM(hFile, { status: 'received', needs_change: needsChange });
      if (shouldDeliver) {
        cmdDeliver([id, '--as', cur]);
        return;
      }
      logStateJournal(id, 'receipt', {
        from_status: st,
        to_status: 'received',
        needs_change: needsChange,
        audit_nonce: finalAuditNonce || undefined,
        verdict: concl || undefined
      });
      console.log(`✅ 已登记仓内回执: ${rFile}`);
      console.log(`   交接 ${id} 状态更新为 received${needsChange ? '（需整改 / 未通过）' : ''}`);

      if (needsChange || isVerdictRejected(concl) || isVerdictBlocked(concl)) {
        console.log(`\n⚠️ 提示：回执已登记（status: received），结论为未通过/需改动（needs_change: true）。`);
        console.log(`   工单处于待整改/受阻状态，等待发起方处理或补充外部条件。严禁在未就绪时执行 baton deliver！\n`);
      } else {
        console.log(`\n💡 提示：回执已就绪（status: received）。注意：还需 baton deliver ${id} 才会唤醒发起方！自检全过并收尾时请运行该命令。\n`);
      }
      printReceiptDeliveryLine(rFile, needsChange, false);
      return;
    }
    // ── 跨仓模式（统一数据模型 · ADR-0008 Phase 3）──
    const rFm = { handoff_id: id, needs_change: needsChange, needs_iggle_change: needsChange, ...evFM };
    const hTarget = (hFm && hFm.target) || 'swoop';
    const authorLabel = `${TARGET_LABELS[hTarget] || hTarget} 侧回执`;
    writeReceiptFile(rFile, rFm, note, receiptStub(id, authorLabel));
    if (shouldDeliver) {
      cmdDeliver([id]);
      return;
    }
    setFM(hFile, { status: 'received', needs_change: needsChange, needs_iggle_change: needsChange });
    logStateJournal(id, 'receipt', { from_status: st, to_status: 'received', needs_change: needsChange, verdict: concl || undefined });
    console.log(`✅ 已登记回执: ${rFile}`);
    console.log(`   交接 ${id} 状态更新为 received${needsChange ? '（需发起方改动）' : ''}`);

    if (needsChange || isVerdictRejected(concl) || isVerdictBlocked(concl)) {
      console.log(`\n⚠️ 提示：回执已登记（status: received），结论为需发起方改动。严禁在未通过情况下执行 deliver！\n`);
    } else {
      console.log(`\n💡 提示：回执已登记（status: received）。注意：还需 baton deliver ${id} 才会唤醒发起方！自检全过并收尾时请运行该命令。\n`);
    }
    printReceiptDeliveryLine(rFile, needsChange, false);
  });
}

/** 执行方显式终态交付（deliver）：会话收尾且自检全过时宣布完成交付并落印 delivered_at，推进为 delivered 态 */
function cmdDeliver(args) {
  const noteIdx = args.indexOf('-n');
  const rawNote = noteIdx !== -1 ? args[noteIdx + 1]?.trim() : undefined;
  const note = rawNote !== undefined ? rawNote.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n') : undefined;
  const asInput = flagValue(args, '--as') || flagValue(args, '--by');
  const valFlags = ['-n', '--evidence-commits', '--evidence-paths', '--evidence-repo', '--evidence-note', '--as', '--by'];
  const valueIdx = new Set();
  for (let i = 0; i < args.length; i++) if (valFlags.includes(args[i])) valueIdx.add(i + 1);
  const rawId = args.find((a, i) => !a.startsWith('-') && !valueIdx.has(i));
  if (!rawId) {
    console.error('用法: baton deliver <id> [-n "<交付补充说明>"] [--as <lane>]');
    console.error('交付语义：由执行方在自检全过、会话收尾时显式提交终态交付，烙印 delivered_at 并通知发起方验收。');
    process.exit(2);
  }
  const id = resolveTicketId(rawId);
  const hFile = path.join(H_DIR, `${id}.md`);
  if (!fs.existsSync(hFile)) { console.error('找不到交接: ' + hFile); process.exit(1); }
  assertStatusFresh('deliver');

  return withTicketLock(id, () => {
    const hRaw = fs.readFileSync(hFile, 'utf8');
    const hFm = readFM(hRaw) || {};
    const st = hFm?.status;
    if (st === 'closed') {
      console.log(`↩️ ${id} 已闭环，跳过交付。`);
      return;
    }
    const rFile = path.join(R_DIR, `${id}-resp.md`);
    if (!fs.existsSync(rFile)) {
      console.error(`❌ 找不到回执: ${rFile}。交付前必须先撰写并登记回执（baton receipt ${id}）。`);
      process.exit(1);
    }
    const rRaw = fs.readFileSync(rFile, 'utf8');
    const rFm = readFM(rRaw) || {};

    // 防提前闭环与越界交付（P0-3 修复 / ADR-0008 Phase 2 显式声明）
    const cur = resolveExecutionLane(asInput, { fromLane: hFm?.from_lane, toLane: hFm?.to_lane, op: 'deliver', ticketId: id });
    if (MODE === 'intra-repo') {
      const toLane = String(hFm?.to_lane || '').toLowerCase();
      const fromLane = String(hFm?.from_lane || '').toLowerCase();
      if (!cur) {
        console.error(`❌ 未声明执行身份，无法确认执行方身份，拒绝交付。请使用 --as ${toLane} 声明身份，或声明 export HANDOFF_LANE=${toLane} 后再执行 deliver。`);
        process.exit(1);
      }
      if (cur === fromLane && fromLane) {
        console.error(`❌ 防提前闭环：当前执行身份 lane=${cur} 即发起方（from_lane），禁止代替执行方执行 deliver。`);
        process.exit(1);
      }
      if (cur !== toLane) {
        console.error(`❌ 越界交付：当前执行身份 lane=${cur} 不是该交接指定接收方 to_lane=${toLane}（${resolveLaneRole(toLane)}）。`);
        process.exit(1);
      }
    } else {
      const curRepo = detectRepo(process.cwd());
      if (curRepo && hFm.source_repo && curRepo === hFm.source_repo) {
        console.error(`❌ 防提前闭环：当前仓 ${curRepo} 即交接发起仓，禁止代替依赖方执行 deliver。`);
        process.exit(1);
      }
    }

    // 内容门禁校验
    const rBody = stripFM(rRaw);

    // 结论与受阻门禁：结论为未通过/受阻、缺少结论或 needs_change=true 时，硬阻断交付
    const concl = extractConclusion(rBody);
    if (!concl) {
      console.error(`❌ 拒绝交付：回执正文缺少明确结论（Verdict / Conclusion）。`);
      console.error(`   必须在回执包含 ## 结论 (Verdict) 锚节并声明明确结论（如 PASS / Verified / REJECTED 等），禁止以缺漏结论绕过门禁。`);
      process.exit(1);
    }
    if (isVerdictRejected(concl)) {
      console.error(`❌ 拒绝交付：回执当前结论为「${concl}」，整改或验收未通过，禁止交付。请整改更新结论后再交付。`);
      process.exit(1);
    }
    if (isVerdictBlocked(concl)) {
      console.error(`❌ 拒绝交付：回执当前结论为「${concl}」（受阻/外部条件未就绪），禁止作为终态交付。`);
      console.error(`   请待外部条件就绪后重新复验并更新结论，或由发起方/审计方退回整改。`);
      process.exit(1);
    }
    if (rFm.needs_change === true || hFm?.needs_change === true) {
      console.error(`❌ 拒绝交付：工单或回执仍标记 needs_change=true，整改未闭环，禁止作为终态交付。`);
      process.exit(1);
    }

    // 审计防伪门禁 (Audit Nonce Gate & Signature · ADR-0008 / ADR-0010 交付闸门)：to_lane=audit 交付前必须携带有效匹配的 Audit Nonce 与审计私钥签章
    if (MODE === 'intra-repo' && String(hFm?.to_lane || '').toLowerCase() === 'audit') {
      const expectedNonce = hFm.audit_nonce;
      let actualNonce = rFm.audit_nonce;
      if (args.includes('--auto-nonce') && expectedNonce) {
        if (cur !== 'audit') {
          console.error(`❌ 越权拦截：--auto-nonce 自动绑定令牌仅限目标审计方 (to_lane=audit) 授权使用。当前执行身份 lane=${cur || '未声明'} 禁止调用！`);
          process.exit(1);
        }
        actualNonce = expectedNonce;
        rFm.audit_nonce = expectedNonce;
        const isZh = detectLang() === 'zh';
        console.log(isZh
          ? `ℹ️ [--auto-nonce 自动绑定] 回执已自动同步工单最新 Audit Nonce: ${expectedNonce}`
          : `ℹ️ [--auto-nonce] Synced latest Audit Nonce: ${expectedNonce}`);
      }
      if (!expectedNonce || !actualNonce || actualNonce !== expectedNonce) {
        console.error(`❌ 审计防伪门禁：交付前必须在回执中携带系统签发的有效 Audit Nonce。`);
        console.error(`   工单签发令牌：${expectedNonce || '未签发'}，回执记录令牌：${actualNonce || '缺失'}。`);
        if (expectedNonce) {
          const curRound = hFm.round || 1;
          console.error(`   当前工单处于 Round ${curRound}，有效令牌为：${expectedNonce}`);
          console.error(`   请使用 baton receipt ${id} --audit-nonce "${expectedNonce}" 补齐后重新交付（或在 deliver 时追加 --auto-nonce 自动同步）。`);
        } else {
          console.error(`   请运行: baton nonce ${id} --reissue 重新签发有效令牌。`);
        }
        process.exit(1);
      }

      // 私钥签章校验（ADR-0010 交付闸门）
      const auditToken = getAuditSecretToken({ requireAuditLane: true, currentLane: cur });
      if (!auditToken) {
        console.error(`❌ 审计私钥访问拒绝 (AUDIT_CREDENTIAL_DENIED): 仅允许持有审计私钥凭据的 audit 角色进行终态交付。当前身份 lane=${cur || '未声明'} 无权访问 audit.token！`);
        console.error(`   严禁发起方或其他角色凭工单明文 Nonce 冒充签章交付。`);
        process.exit(1);
      }
      const expectedSig = computeAuditSignature(auditToken, id, hFm.round || 1, expectedNonce);
      if (!rFm.audit_sig || rFm.audit_sig !== expectedSig) {
        if (cur === 'audit') {
          rFm.audit_sig = expectedSig;
          setFM(rFile, { audit_sig: expectedSig });
        } else {
          console.error(`❌ 审计防伪门禁：缺少或伪造审计私钥签章 (audit_sig)。`);
          console.error(`   在同工作区模式下，通过验收必须使用 audit 角色专用私钥凭据签章交付，禁止发起方仅凭工单明文 Nonce 冒充签章！`);
          process.exit(1);
        }
      }
    }

    // 驳回封印门禁（S1 · P0-1 修复）：防空交付洗白
    if (hFm?.rejected_at) {
      // 检查回执正文自驳回后是否有实质变动（对比纯净正文，排除驳回记录本身）
      const curHash = hashContent(getCleanBody(rBody));
      if (hFm.rejected_receipt_hash && curHash === hFm.rejected_receipt_hash) {
        console.error(`❌ 驳回封印：交接 ${id} 曾于 ${hFm.rejected_at} 被驳回，当前回执正文与驳回时一致，未发生实质整改，禁止空交付。`);
        console.error(`   请针对驳回意见完成整改并更新回执正文后再执行 deliver。`);
        process.exit(1);
      }
    }

    const ws = MODE === 'intra-repo' ? (hFm.workspace || rFm.workspace || 'same') : undefined;
    const gate = receiptContentGate(id, rBody, { mode: MODE, workspace: ws, date: rFm.date, evidence: normalizeEvidence(rFm) });
    for (const w of gate.warnings) console.warn('⚠️ ' + w);
    if (gate.problems.length) {
      console.error(`❌ 回执未过内容门禁，拒绝交付（${gate.problems.length} 项）：`);
      for (const p of gate.problems) console.error('  - ' + p);
      process.exit(1);
    }

    const nowISO = new Date().toISOString();
    // 写入回执 frontmatter
    const updatedRFm = { ...rFm, delivered_at: nowISO, needs_change: false };
    if (cur) updatedRFm.delivered_by_lane = cur;
    writeReceiptFile(rFile, updatedRFm, undefined, rBody);

    // 写入交接 frontmatter（保留 rejected_at 供历史追溯与校验）
    const updateHFm = {
      status: 'delivered',
      delivered_at: nowISO,
      needs_change: false
    };
    if (note) updateHFm.delivery_note = note;
    setFM(hFile, updateHFm);
    logStateJournal(id, 'deliver', { from_status: st, to_status: 'delivered', delivered_at: nowISO, note });

    console.log(`🚀 [交付成功] 交接 ${id} 状态已推进为 delivered！`);
    console.log(`   交付时间: ${nowISO}`);
    console.log(`   执行方已确认终态交付。发起方/审计方后台 wait 探针将自动唤醒进行独立验收。`);
    printReceiptDeliveryLine(rFile, Boolean(hFm.needs_change || rFm.needs_change || rFm.needs_iggle_change), true);
  });
}

/** 将 wait 命令作为完全脱钩的独立后台守护进程启动（金蝉脱壳 · 0-阻塞瞬间退出）。
 * 核心原理：
 * 1. 使用 child_process.spawn 独立启动 Node 进程执行 baton wait <id> ...
 * 2. detached: true 创建新的进程组，不随父会话结束而终止。
 * 3. stdio 重定向至独立日志文件（避免标准 I/O 管道占有导致父进程挂起）。
 * 4. 调用 child.unref() 从父进程事件循环引用中剔除，允许父命令在 0.1 秒内安全退出。
 */
function spawnDaemonWait(idOrIds, extraArgs = []) {
  const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
  const isZh = detectLang() === 'zh';
  const logDir = path.join(ROOT, 'logs');
  try { fs.mkdirSync(logDir, { recursive: true }); } catch {}
  const logSlug = ids.join('-').slice(0, 40);
  const logFile = path.join(logDir, `wait-${logSlug}.log`);

  let outFd = 'ignore';
  let errFd = 'ignore';
  let openedFd = null;
  try {
    const fd = fs.openSync(logFile, 'a');
    outFd = fd;
    errFd = fd;
    openedFd = fd;
  } catch {}

  const cliPath = fs.realpathSync(process.argv[1]);
  const cleanArgs = extraArgs.filter(a => a !== '--daemon' && a !== '-d' && a !== '--wait' && a !== '-w' && a !== '--blind' && !ids.includes(a));
  const spawnArgs = [cliPath, 'wait', ...ids, ...cleanArgs];
  if (MODE === 'intra-repo') {
    spawnArgs.push('--root', ROOT);
  }

  const child = spawn(process.execPath, spawnArgs, {
    detached: true,
    stdio: ['ignore', outFd, errFd],
    cwd: ROOT,
    windowsHide: true,
    env: { ...process.env, BATON_DAEMON: '1' }
  });

  if (openedFd !== null) {
    try { fs.closeSync(openedFd); } catch {}
  }

  child.unref();

  if (isZh) {
    console.log(`🚀 [金蝉脱壳] 后台监听守护进程已成功启动并脱钩！`);
    console.log(`   - 守护进程 PID: ${child.pid}`);
    console.log(`   - 监听工单: ${ids.join(', ')}`);
    console.log(`   - 监听日志输出: ${logFile}`);
    console.log(`   - 命令已安全退出（耗时 < 0.1s），后台 0-Token 持续监听回执到达。\n`);
  } else {
    console.log(`🚀 [Daemon Detached] Background listener daemon launched and detached!`);
    console.log(`   - Daemon PID: ${child.pid}`);
    console.log(`   - Watching IDs: ${ids.join(', ')}`);
    console.log(`   - Log output: ${logFile}`);
    console.log(`   - Process safely exited (< 0.1s), listening in background with 0 tokens.\n`);
  }
}

// ── 未监听借据管理（Unwatched Debt Guard · v2.34.0）────────────────────────
// 病根：Agent 在派发工单时恐惧长时间同步等待，容易盲目使用 --async 逃逸监听；
// 导致工单状态已变为 forwarded，却未挂起任何后台 wait 探针，沦为无人唤醒的死局。
// 治法：
// 1. 单工单在 Agent 环境下严禁使用 --async（物理拦截退出 1，强制原子化一步到位运行 forward <id> --wait）；
// 2. 多单并发派发（ids.length > 1）合法放行 --async，但必须记录未监听借据（unwatched_debt.json）；
// 3. 借据未平账前，若再次尝试非 wait 转递，实施借据拦截；
// 4. 当 baton wait 启动并接管工单时，自动核销平账。

function getUnwatchedDebtFile() {
  return path.join(ROOT, '.watch', 'unwatched_debt.json');
}

function loadUnwatchedDebt() {
  const f = getUnwatchedDebtFile();
  if (!fs.existsSync(f)) return [];
  try {
    const raw = fs.readFileSync(f, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveUnwatchedDebt(debts) {
  const watchDir = path.join(ROOT, '.watch');
  try { fs.mkdirSync(watchDir, { recursive: true }); } catch {}
  const f = getUnwatchedDebtFile();
  if (!debts || !debts.length) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    return;
  }
  try {
    fs.writeFileSync(f, JSON.stringify(debts, null, 2), 'utf8');
  } catch {}
}

function recordUnwatchedDebt(ids) {
  const existing = loadUnwatchedDebt();
  const existingIds = new Set(existing.map(d => d.id));
  const now = new Date().toISOString();
  const sessionLane = getSessionLane() || '';
  for (const id of ids) {
    if (!existingIds.has(id)) {
      existing.push({
        id,
        created_at: now,
        from_lane: sessionLane
      });
      existingIds.add(id);
    }
  }
  saveUnwatchedDebt(existing);
}

function clearUnwatchedDebt(ids) {
  const removeSet = new Set(ids);
  const existing = loadUnwatchedDebt();
  const filtered = existing.filter(d => !removeSet.has(d.id));
  if (filtered.length !== existing.length) {
    saveUnwatchedDebt(filtered);
  }
}

function getActiveUnwatchedDebt() {
  const existing = loadUnwatchedDebt();
  if (!existing.length) return [];
  const watchDir = path.join(ROOT, '.watch');
  const valid = [];
  for (const d of existing) {
    const hFile = path.join(H_DIR, `${d.id}.md`);
    if (!fs.existsSync(hFile)) continue;
    try {
      const fm = readFM(fs.readFileSync(hFile, 'utf8'));
      if (!fm || fm.status !== 'forwarded') continue; // 已交付或已闭环
    } catch {
      continue;
    }
    // 检查是否存在存活的 watcher
    const wFile = path.join(watchDir, `${d.id}.json`);
    let isWatching = false;
    if (fs.existsSync(wFile)) {
      try {
        const wData = JSON.parse(fs.readFileSync(wFile, 'utf8'));
        if (wData) {
          if (Array.isArray(wData.watchers) && wData.watchers.length > 0) {
            for (const w of wData.watchers) {
              try {
                if (w && w.pid) {
                  process.kill(w.pid, 0);
                  isWatching = true;
                  break;
                }
              } catch {}
            }
          } else if (wData.pid) {
            process.kill(wData.pid, 0);
            isWatching = true;
          }
        }
      } catch {}
    }
    if (!isWatching) {
      valid.push(d);
    }
  }
  if (valid.length !== existing.length) {
    saveUnwatchedDebt(valid);
  }
  return valid;
}

async function cmdForward(args) {
  assertWorkspaceJail('forward');
  const isDaemon = args.includes('--daemon') || args.includes('-d');
  const shouldWait = args.includes('--wait') || args.includes('-w');
  const isAsync = args.includes('--async') || args.includes('--detach');
  const isBlind = args.includes('--blind') || args.includes('-b');
  const noWaitExplicit = args.includes('--no-wait');
  const valFlags = ['--timeout', '-t', '--interval', '-i'];
  const valueIdx = new Set();
  for (let i = 0; i < args.length; i++) if (valFlags.includes(args[i])) valueIdx.add(i + 1);
  const rawIds = args.filter((a, i) => !a.startsWith('-') && !valueIdx.has(i));

  if (!rawIds.length) {
    console.error('用法: baton forward <id1> [id2 ...] [--wait] [--async] [--daemon] [--blind]');
    process.exit(2);
  }
  const ids = rawIds.map(resolveTicketId);

  const isZh = detectLang() === 'zh';

  // ── 前置门禁校验（Fail-Closed · v2.34.0）：在变更任何工单状态前实施硬校验 ──
  if (isAgentEnvironment() && !noWaitExplicit) {
    if (!shouldWait && !isDaemon && !isAsync) {
      if (isZh) {
        console.error(`\n❌ [物理门禁拦截: 必须挂起监听探针] 检测到在 Agent 环境下转递未带 --wait 监听！`);
        console.error(`   真相提醒：Baton 是基于本地文件系统内核事件（fs.watch）的总线。对方一旦 deliver 立即毫秒级唤醒。`);
        console.error(`   严禁以为「外部客户端等不到」或担心长任务而跳过监听（跳过监听会导致工单沦为无人唤醒的孤儿）！`);
        console.error(`   👉 唯一标准姿势（一步到位）：请以宿主后台任务方式运行原子命令：`);
        console.error(`      baton forward ${ids.join(' ')} --wait`);
        console.error(`      （在 AI 宿主中配置 WaitMsBeforeAsync: 500 或后台任务运行，即可秒级打印交接提示词并自动挂起后台监听，回执到达时秒级唤醒）`);
        console.error(`   👉 多单并发：若需一次性派发多个工单，请运行 'baton forward <id1> <id2> ... --async' 解耦，最后统一运行 'baton wait ...' 监听`);
        console.error(`   （如确有特殊原因本次无需监听，请显式追加 --no-wait 声明豁免）\n`);
      } else {
        console.error(`\n❌ [Physical Gate Blocked: Background Listener Required] Detected 'forward' without '--wait' in an Agent environment!`);
        console.error(`   Never skip waiting assuming external clients cannot wake you up.`);
        console.error(`   👉 Standard approach: Run 'baton forward ${ids.join(' ')} --wait' as a host background task.`);
        console.error(`   👉 Concurrent batch: 'baton forward <id1> <id2> ... --async', then 'baton wait ...'`);
        console.error(`   (To explicitly bypass listener, pass --no-wait)\n`);
      }
      process.exit(1);
    }
    if (isAsync && ids.length === 1) {
      if (isZh) {
        console.error(`\n❌ [物理门禁拦截: 单工单严禁使用 --async 逃逸监听]`);
        console.error(`   检测到仅派发 1 份工单 (${ids[0]})。严禁使用 --async 将单工单派发拆分为「先 --async 后 wait」（该模式 100% 导致漏开监听）！`);
        console.error(`   👉 唯一标准姿势（一步到位）：请以宿主后台任务方式直接运行原子命令：`);
        console.error(`      baton forward ${ids[0]} --wait`);
        console.error(`      （在 AI 宿主中配置 WaitMsBeforeAsync: 500 或宿主后台任务运行，即可秒级打印交接提示词并自动挂起后台监听，回执到达时秒级唤醒）`);
        console.error(`   （如确系无需任何监听，请显式追加 --no-wait 声明豁免）\n`);
      } else {
        console.error(`\n❌ [Physical Gate Blocked: --async prohibited for single ticket]`);
        console.error(`   Detected only 1 ticket (${ids[0]}). Splitting single ticket into '--async' then 'wait' is strictly prohibited!`);
        console.error(`   👉 Standard approach: Run 'baton forward ${ids[0]} --wait' as a host background task.`);
        console.error(`   (To explicitly bypass listener, pass --no-wait)\n`);
      }
      process.exit(1);
    }

    // 检查历史未清偿借据（防止 Agent 连续多次 --async 派发却从不开监听）：
    const debts = getActiveUnwatchedDebt();
    if (debts.length > 0) {
      const debtIds = debts.map(d => d.id);
      if (isZh) {
        console.error(`\n❌ [未清偿监听借据拦截: 存在未挂起监听的已派发工单]`);
        console.error(`   检测到之前派发了 ${debtIds.length} 份工单但尚未挂起后台监听（严禁只改状态不挂监听）！`);
        console.error(`   未监听工单: ${debtIds.join(', ')}`);
        console.error(`   👉 唯一平账动作：请以宿主后台任务方式运行聚合监听：`);
        console.error(`      baton wait ${debtIds.join(' ')} --all`);
        console.error(`   （如确需豁免，请显式追加 --no-wait）\n`);
      } else {
        console.error(`\n❌ [Unwatched Debt Gate Blocked: Pending tickets without listener]`);
        console.error(`   Previous dispatched tickets have no active watcher: ${debtIds.join(', ')}`);
        console.error(`   👉 Please start aggregate listener:\n      baton wait ${debtIds.join(' ')} --all\n`);
      }
      process.exit(1);
    }
  }

  for (const id of ids) {
    const file = path.join(H_DIR, `${id}.md`);
    if (!fs.existsSync(file)) {
      console.error('找不到交接: ' + file);
      process.exit(1);
    }
    const fm = readFM(fs.readFileSync(file, 'utf8'));
    assertSessionAffinity(fm, 'forward', id, args);
    const toLane = String(fm?.to_lane || fm?.target || '').toLowerCase();
    const ticketFrom = String(fm?.from_lane || '').toLowerCase();
    if (!getSessionLane() && ticketFrom) {
      setSessionLane(ticketFrom);
    }

    if (fm.status === 'received' || fm.status === 'delivered' || fm.status === 'closed') {
      console.log(`⚠️ 交接 ${id} 当前状态为 ${fm.status}，已是更靠后状态，跳过翻 forwarded。`);
      if (MODE === 'intra-repo' && toLane === 'audit' && !fm?.audit_nonce) {
        const nonce = generateAuditNonce(id);
        setFM(file, { audit_nonce: nonce });
        console.log(isZh ? `ℹ️ 补发审计防伪令牌 (Audit Nonce): ${nonce}` : `ℹ️ Issued Audit Nonce: ${nonce}`);
      }
    } else {
      const forwardUpdates = { status: 'forwarded' };
      // 闭环清空驳回现场标记（消除粘性自增，确保 forward 幂等性）：
      // 轮次 round 与 audit_nonce 的单一事实源（SSOT）由 cmdReject 唯一掌控。
      // cmdForward 仅负责清除驳回现场标记并重新转递，严禁二次自增 round 或覆盖 Nonce。
      if (fm?.rejected_by || fm?.rejected_at) {
        forwardUpdates.rejected_by = '';
        forwardUpdates.rejected_at = '';
      }
      const roundFlag = flagValue(args, '--round');
      if (roundFlag && Number(roundFlag) > 0) {
        forwardUpdates.round = Number(roundFlag);
      } else if (!fm?.round) {
        forwardUpdates.round = 1;
      }
      if (!fm?.conversation_id) forwardUpdates.conversation_id = getSessionId();
      if (MODE === 'intra-repo' && toLane === 'audit' && !fm?.audit_nonce) {
        forwardUpdates.audit_nonce = generateAuditNonce(id);
      }
      if (isBlind) {
        const rawFull = fs.readFileSync(file, 'utf8');
        const bodyPart = stripFM(rawFull);
        // 双盲 Fail-Closed 门禁：必须声明客观验收判据
        if (!/(?:##\s*(?:验收判据|Criteria|Acceptance Criteria|判据))/i.test(bodyPart)) {
          console.error(isZh
            ? '❌ [双盲脱敏门禁] 缺少验收判据：工单未声明 ## 验收判据（双盲审计必须具备客观机器可判依据）。拒绝以双盲模式转递。'
            : '❌ [Double-Blind Gate] Missing acceptance criteria: ticket lacks ## Acceptance Criteria. Refusing to forward in blind mode.');
          process.exit(1);
        }
        const sanitizedBody = sanitizeBlindContent(bodyPart);
        forwardUpdates.blind = true;
        writeFM(file, { ...fm, ...forwardUpdates }, sanitizedBody);
        console.log(isZh
          ? `🔒 [物理双盲已生效] 已脱敏大模型思维链与主观自辩小节，工单已烙印 blind: true。`
          : `🔒 [Double-Blind Active] Sanitized subjective thinking & excuses; ticket marked blind: true.`);
      } else {
        if (toLane === 'audit') {
          console.warn(isZh
            ? `⚠️ [双盲警示] 派发至审计方（to_lane=audit）但未指定 --blind：本工单将不会进行物理双盲脱敏（不可声称为物理双盲审计）。如需双盲，请运行: baton forward ${id} --blind [--wait]`
            : `⚠️ [Double-Blind Notice] Dispatched to audit without --blind: ticket will not be sanitized.`);
        }
        setFM(file, forwardUpdates);
      }
      logStateJournal(id, 'forward', {
        from_status: fm.status,
        to_status: 'forwarded',
        blind: Boolean(isBlind),
        round: forwardUpdates.round || fm.round || 1,
        cleared_rejection: Boolean(fm?.rejected_by || fm?.rejected_at),
        rejected_by: fm?.rejected_by || undefined,
        rejected_at: fm?.rejected_at || undefined,
        audit_nonce: forwardUpdates.audit_nonce || fm?.audit_nonce
      });
      console.log(`✅ 已标记转递: ${id}`);
    }

    // ── Worktree 自动分配（微内核驱动挂载 · ADR-0003）──
    if (fm && fm.workspace === 'worktree') {
      const driver = resolveWorkspaceDriver();
      if (driver) {
        const out = invokeWorkspaceDriver('allocate', id, ['--json']);
        try {
          const json = typeof out === 'string' ? JSON.parse(out) : null;
          if (json && json.path) {
            if (isZh) {
              console.log(`🌳 [Worktree 物理隔离就绪] 已为工单分配专属工作树: \x1b[32m${json.path}\x1b[0m (分支: ${json.branch})`);
            } else {
              console.log(`🌳 [Worktree Ready] Allocated isolated workspace: \x1b[32m${json.path}\x1b[0m (branch: ${json.branch})`);
            }
          }
        } catch {}
      } else {
        if (isZh) {
          console.warn(`⚠️ [Worktree 提示] 工单声明了 workspace: worktree，但未探测到可用 Workspace Driver。请在隔离分支下执行，或安装 units/worktree。`);
        } else {
          console.warn(`⚠️ [Worktree Notice] Ticket declared workspace: worktree, but no Workspace Driver was found.`);
        }
      }
    }

    // 无论跨仓还是仓内（含 same / separate），一律输出标准交接提示词供一键复制
    cmdPrompt([id]);
  }

  if (isDaemon || shouldWait) {
    const waitArgs = args.filter(a => a !== '--wait' && a !== '-w' && a !== '--daemon' && a !== '-d' && a !== '--blind' && a !== '--async' && a !== '--detach' && !ids.includes(a));
    if (isDaemon && !isAgentEnvironment()) {
      // 人类交互终端显式指定 --daemon：走脱钩后台守护（秒退）
      spawnDaemonWait(ids, waitArgs);
    } else if (isDaemon && isAgentEnvironment()) {
      if (isZh) {
        console.error(`❌ [环境限制] 检测到 Agent 托管管道环境，--daemon 无法安全脱钩（可能导致长任务被宿主 SIGTERM 杀死或假成功）。\n   请以宿主后台任务方式运行 'baton wait ${ids.join(' ')}'（如 run_command async / background task），或移除 --daemon。\n   （如确需在宿主内强制脱钩，请设置环境变量 BATON_MANAGED_MODE=0）\n`);
      } else {
        console.error(`❌ [Host Restriction] Detected Agent managed environment: --daemon cannot safely detach.\n   Please run 'baton wait ${ids.join(' ')}' as a host background task, or remove --daemon.\n   (To force detach in an agent environment, set BATON_MANAGED_MODE=0)\n`);
      }
      process.exit(3);
    } else {
      // 托管环境或普通 --wait：直接调用 cmdWait，保持在宿主管道中供宿主平台接管并唤醒
      await cmdWait([...ids, ...waitArgs]);
    }
  } else if (isAsync) {
    recordUnwatchedDebt(ids);
    if (isZh) {
      console.log(`\n🔄 [异步并发派发模式] 已转递 ${ids.length} 份工单（无阻断秒退，已记录未监听借据）。`);
      console.log(`   可在派发完本轮所有工单后，启动后台聚合监听平账：`);
      console.log(`   👉 baton wait ${ids.join(' ')} [--all|--any] （请作为后台任务/Background Task 运行）\n`);
    } else {
      console.log(`\n🔄 [Async Dispatch Mode] Forwarded ${ids.length} ticket(s) (non-blocking, unwatched debt recorded).`);
      console.log(`   After dispatching all tickets, start aggregate background listener to clear debt:`);
      console.log(`   👉 baton wait ${ids.join(' ')} [--all|--any] (run as background task)\n`);
    }
  } else {
    if (isZh) {
      console.log(`\n👉 提示: 请立即启动后台监听: baton forward ${ids.join(' ')} --wait（由 AI 宿主托管或阻塞等待），以便在回执到达时自动唤醒。`);
    } else {
      console.log(`\n👉 Notice: Please start background listener immediately: baton forward ${ids.join(' ')} --wait (managed by agent host or blocking wait) to auto-wake upon receipt.`);
    }
  }
}

function cmdOpen(args) {
  const [rawId] = args;
  if (!rawId) { console.error('用法: handoff open <id>'); process.exit(2); }
  const id = resolveTicketId(rawId);
  const file = path.join(H_DIR, `${id}.md`);
  if (!fs.existsSync(file)) { console.error('找不到交接: ' + file); process.exit(1); }
  try { execFileSync('open', [file]); console.log('已打开: ' + file); }
  catch { console.log('打开失败（非 macOS？），路径: ' + file); }
}

/** 审计防伪挑战令牌管理 (baton nonce <id> [--reissue]) */
function cmdNonce(args) {
  const isReissue = args.includes('--reissue') || args.includes('--rotate') || args.includes('-r');
  const rawId = args.find(a => !a.startsWith('-'));
  if (!rawId) {
    console.error('用法: baton nonce <id> [--reissue]');
    console.error('查看或重签工单的 Audit Nonce 防伪挑战令牌。');
    process.exit(2);
  }
  const id = resolveTicketId(rawId);
  const file = path.join(H_DIR, `${id}.md`);
  if (!fs.existsSync(file)) {
    console.error('找不到交接: ' + file);
    process.exit(1);
  }
  const fm = readFM(fs.readFileSync(file, 'utf8'));
  if (!fm) { console.error('工单损坏: ' + file); process.exit(1); }
  const toLane = String(fm.to_lane || fm.target || '').toLowerCase();
  if (toLane !== 'audit') {
    console.error(`❌ 非审计工单：工单 ${id} 的 to_lane=${toLane}，并非 audit 工单，无需 Audit Nonce。`);
    process.exit(1);
  }

  if (isReissue || !fm.audit_nonce) {
    const newNonce = generateAuditNonce(id);
    const nextRound = isReissue ? ((Number(fm.round) || 1) + 1) : (Number(fm.round) || 1);
    setFM(file, { audit_nonce: newNonce, round: nextRound });
    logStateJournal(id, 'nonce_reissue', { audit_nonce: newNonce, round: nextRound });
    console.log(newNonce);
    return;
  }

  console.log(fm.audit_nonce);
}

/** triage 视图（proposal A · 最大单一杠杆）。
 *
 * 给单条交接/回执一个摘要视图：frontmatter + 各 `## 节` 标题 + 每节首行，**不 dump 全文**。
 * 支持 `handoffs/<ID>.md` 与 `receipts/<ID>-resp.md`（按 `<ID>-resp` 判定目录）。
 * 为什么只列元数据 + 节标题 + 首行：收/写/收回执前只需要「这份交接讲什么、该谁动」，
 * 不必为判断是否相关而吞掉整篇正文（P2 Path 定向：LLM 只读该份的摘要，仍按需 read 全文）。 */
function cmdShow(args) {
  const [rawId] = args.filter(a => !a.startsWith('-'));
  if (!rawId) { console.error('用法: handoff show <id> [--nonce]'); process.exit(2); }
  const isResp = rawId.endsWith('-resp');
  const id = resolveTicketId(rawId);
  const hFile = isResp ? path.join(R_DIR, `${id}-resp.md`) : path.join(H_DIR, `${id}.md`);
  if (!fs.existsSync(hFile)) { console.error('找不到: ' + hFile); process.exit(1); }
  const raw = fs.readFileSync(hFile, 'utf8');
  const fm = readFM(raw);
  if (args.includes('--nonce')) {
    const isReissue = args.includes('--reissue') || args.includes('--rotate') || args.includes('-r');
    const toLane = String(fm?.to_lane || fm?.target || '').toLowerCase();
    if (!fm?.audit_nonce) {
      if (isReissue && toLane === 'audit') {
        const newNonce = generateAuditNonce(id);
        setFM(hFile, { audit_nonce: newNonce });
        logStateJournal(id, 'nonce_reissue', { audit_nonce: newNonce });
        console.log(newNonce);
        return;
      }
      console.error(`❌ 工单 ${id} 缺少 Audit Nonce 防伪令牌。`);
      console.error(`   请运行: baton nonce ${id} --reissue（或 baton show ${id} --nonce --reissue）重新签发有效令牌。`);
      process.exit(1);
    }
    if (isReissue && toLane === 'audit') {
      const newNonce = generateAuditNonce(id);
      setFM(hFile, { audit_nonce: newNonce });
      logStateJournal(id, 'nonce_reissue', { audit_nonce: newNonce });
      console.log(newNonce);
      return;
    }
    console.log(fm.audit_nonce);
    return;
  }
  const body = stripFM(raw);
  console.log(`# ${id}`);
  const keys = isResp
    ? (MODE === 'intra-repo'
        ? ['handoff_id', 'mode', 'from_lane', 'to_lane', 'needs_change', 'audit_nonce', 'blind', 'date', 'delivered_at', 'delivered_by_lane']
        : ['handoff_id', 'needs_change', 'needs_iggle_change', 'from_repo', 'to_repo', 'date', 'delivered_at'])
    : (MODE === 'intra-repo'
        ? ['mode', 'project', 'from_lane', 'to_lane', 'conversation_id', 'workspace', 'timing', 'type', 'status', 'round', 'tool_profile', 'needs_change', 'audit_nonce', 'blind', 'reject_count', 'created', 'rejected_at', 'rejected_by', 'delivered_at', 'accepted_at', 'reopened_at', 'closed']
        : ['target', 'type', 'status', 'conversation_id', 'round', 'tool_profile', 'needs_change', 'needs_iggle_change', 'reject_count', 'created', 'rejected_at', 'rejected_by', 'delivered_at', 'accepted_at', 'reopened_at', 'closed']);
  for (const k of keys) {
    if (fm && fm[k] !== undefined && fm[k] !== '') {
      if (k === 'tool_profile') {
        console.log(`- tool_profile: ${fm[k]}${fm[k] === 'readonly' ? ' (只读探查：严格禁止修改生产源码)' : ''}`);
      } else if (k === 'blind' && fm[k]) {
        console.log(`- blind: ${fm[k]}${detectLang() === 'zh' ? ' (🔒 物理双盲审计：思维链与自辩已脱敏)' : ' (🔒 Double-Blind Audit Active)'}`);
      } else {
        console.log(`- ${k}: ${fm[k]}`);
      }
    }
  }
  // 若存在对应回执且有驳回记录，提取并展示最近驳回理由 (P1-2)
  if (!isResp) {
    const rFile = path.join(R_DIR, `${id}-resp.md`);
    if (fs.existsSync(rFile)) {
      const rRaw = fs.readFileSync(rFile, 'utf8');
      const rejRec = extractRejectionRecord(rRaw);
      if (rejRec) {
        console.log('\n⚠️ 最近驳回信息:');
        const lines = rejRec.split('\n').filter(l => l.trim() && !l.startsWith('##'));
        for (const l of lines.slice(-2)) console.log(`  ${l}`);
      }
    }
  }
  console.log('\n## 节结构（标题 + 首行）');
  const secs = body.split(/^## /m).slice(1);
  for (const s of secs) {
    const lines = s.split('\n');
    const title = lines[0].trim();
    const first = lines.find((l, i) => i > 0 && l.trim()) || '';
    console.log(`- ${title}${first ? '：' + first.trim().slice(0, 80) : ''}`);
  }
  console.log(`\n（全文: ${hFile}）`);
}

const STATUSES = new Set(['draft', 'forwarded', 'received', 'delivered', 'closed']);
// 由 TARGETS 派生（单源），避免 README/COMMANDS/正则多处枚举漂移
const TARGET_ALT = [...TARGETS].map(t => t.toUpperCase()).join('|');
const H_RE = new RegExp(`^(${TARGET_ALT})-\\d{8}-(?:(?:\\d{2}-(?:bug|feature|breaking|question))|(?:\\d{4,6}(?:-\\d{2})?))\\.md$`);
const R_RE = new RegExp(`^(${TARGET_ALT})-\\d{8}-(?:(?:\\d{2}-(?:bug|feature|breaking|question))|(?:\\d{4,6}(?:-\\d{2})?))-resp\\.md$`);
/** 转递提示词（v2.8.3 一行式 · 2026-09-10 与回执方向「请收」一行式对称）。
 *
 * 演进史：~24 行（内联步骤）→ 3 行指针版（v2.8）→ 散文 Path 定向版（2026-09-10）→ 一行式（v2.8.3）。
 * 一行式为什么成立：接收方名 + 动作（收交接）+ 路径已自含路由关键信息；回执规范/落点不在提示词里，
 * 因为交接骨架「给执行方」节与 handoff 技能路由本来就有（三重冗余砍成单一入口 + 文档内规范）。
 * 「请 <TARGET> 收」的点名列强于旧「（target: X）」括注：错投时接收方第一眼即见「不是给我的」，
 * 对 reverse 交接（提示词变「请 iggle 收交接」）同样成立。
 * 旧式「处理交接 <路径>」保留为合法触发（路由表双认），Swoop/prospero 记忆旧例句不致错。
 * <ID> / <TARGET> 占位符由 cmdPrompt 替换。 */
const PROMPT_TEMPLATE = `请 <TARGET> 收交接：${path.join(SCRIPT_ROOT, 'handoffs', '<ID>.md')}`;

function listMdFiles(dir, re) {
  try { return fs.readdirSync(dir).filter(f => re.test(f)).sort(); }
  catch { return []; }
}


// 已知标准桩 marker（按历史 → 最新排列）。
const STUB_MARKERS = [
  { begin: '<!-- handoff-stub:v2.0 begin -->', end: '<!-- handoff-stub:v2.0 end -->' },
  { begin: '<!-- handoff-stub:v2.1 begin -->', end: '<!-- handoff-stub:v2.1 end -->' },
];
const STUB_BEGIN = STUB_MARKERS[STUB_MARKERS.length - 1].begin;
const STUB_END = STUB_MARKERS[STUB_MARKERS.length - 1].end;
const STUB_MARKER_RE = /<!-- handoff-stub:v2\.\d+ begin -->[\s\S]*?<!-- handoff-stub:v2\.\d+ end -->/g;
const STUB_HEADING_RE = /(?:<!-- generated — do not edit -->\n)?(?:<!-- stub:sha256:[0-9a-f]+ -->\n)?### (?:Agent Baton \(Handoff\)|Handoff) (?:接入桩|Guard Stub)[\s\S]*?(?:获取完整版 Preflight。|for full Preflight\.)/g;
function scanStub(c) {
  const marker = c.match(STUB_MARKER_RE) || [];
  return marker.length ? marker : (c.match(STUB_HEADING_RE) || []);
}
function stripStub(c) {
  return (c.match(STUB_MARKER_RE) || []).length ? c.replace(STUB_MARKER_RE, '') : c.replace(STUB_HEADING_RE, '');
}
const STUB_CANON = (s) => s
  .replace(/\r\n/g, '\n')
  .replace(/<!-- handoff-stub:v2\.\d+ begin -->\n?/g, '')
  .replace(/\n?<!-- handoff-stub:v2\.\d+ end -->/g, '')
  .replace(/<!-- generated — do not edit -->\n?/g, '')
  .replace(/<!-- stub:sha256:[0-9a-f]+ -->\n?/g, '')
  .replace(/\s+$/, '');

const STUB_BODY_ZH = `### Agent Baton (Handoff) 接入桩（轻量韧性版 · 细则以 $(lab path handoffs)/README.md 契约 v${BATON_VERSION} 为准）

**核心守卫与身份（强制）**
- **物理工作区边界**：会话严格绑定当前宿主工作区，严禁跨仓 cd 操作外部代码；跨仓请输出交接提示词引导人类在目标仓 Agent 会话中派发。
- **一单到底与会话ID统一（强制 · v2.36.0）**：工单物理 ID 即为会话 ID（全局唯一统一），严禁物理 ID 与会话 ID 分裂。所有轮次（Round 1..N）在原单同一 ID 下流转闭环，严禁轮次变异；任务主题全生命周期保持一致。
- **严禁跨会话处理工单（最高宪法级隔离）**：工单全程严格绑定发起会话；严禁跨会话处理/推进/闭环外部工单（\`forward\`/\`accept\`/\`reopen\` 仅限原发起会话执行；接收方接单必须显式带工单编号，严禁从全局待办中盲目抢单）。
- **命令形态与显式身份**：一律 \`baton <op>\` 或 \`handoff <op>\`。全面支持 \`--as <lane>\` 显式声明身份，同一会话无缝切换多工单。
- **会话身份锁与凭证防伪**：支持 \`baton lane <lane>\` 锁定会话身份；环境绑定优先级 \`HANDOFF_LANE\` > \`baton lane\` > \`--as <lane>\`；审计交付必须持有 \`audit.token\` 密码学签章，禁止发起方跨角色自我闭环。
- **确定性自愈**：校验细节（Nonce、证据路径、数据一致性）由 CLI 运行时精准拦截；若命令报错，末尾 100% 打印可直接复制的一键自愈命令。

**入站工作流（接单 · 交付 · 退回）**
1. **查待办**：运行 \`baton status --as <本方 lane|target>\`（直取本方未闭环待办工单，或全量 \`baton status\`）。
2. **读工单**：运行 \`baton show <id>\`，根据验收判据改动本 lane 范围代码并实测。
3. **交付或退回（实测为唯一准绳）**：
   - **实测通过**：照抄 \`$(lab path handoffs)/RESPONSE-TEMPLATE.md\` 骨架 → 运行 \`baton receipt <id> -n "<正文>" --deliver --as <本方 lane> --evidence-paths "<路径>"\`（审计工单附 \`--audit-nonce "<nonce>"\` 或同工作区授权下使用 \`--auto-nonce\` 自动绑定最新令牌；红队用例严格遵循 NO_DISPATCH / NO_COMPLETE / COMPLETE 三态标准）。
   - **实测未过（NO-GO/受阻）**：享有安全下车通道，直接运行 \`baton reject <id> -n "<理由/缺失条件>" --as <本方 lane>\` 退回整改。
4. **收尾自检**：运行 \`baton check [id]\`（若有数据漂移可加 \`--fix\` 自动修复）。
5. **入站回复收尾（简洁单行裁决 · 严禁角色漂移）**：接收方必须严格保持本方执行/审计角色，严禁切换为发起方角色；最终回复人类的最末尾仅输出单行纯文本（无需标题，无需代码块，严禁多行出站卡片）：
   - 审计驳回：\`审计完成，裁决 NO-GO（工单已退回<发起方角色>进入 Round <N>）\`
   - 审计通过：\`审计完成，裁决 GO\`
   - 普通交付：\`交付完成，回执已就绪\`
   后续 Round 轮次由发起方在出站重新转递时统筹计算并派发。

**出站工作流（派发 · 监听 · 严禁漏开监听）**
1. **建单与转递（单工单原子闭环 · 99%场景）**：\`baton new <target|lane> <type> "<标题>"\`，填写正文后直接作为宿主后台任务（如 \`WaitMsBeforeAsync: 500\`）运行 \`baton forward <id> --wait\`（双盲审计附加 \`--blind\` 脱敏思考自辩；单工单严禁使用 \`--async\` 拆分两步！）。
2. **多单并发派发（仅限一次性派发多单）**：\`baton forward <id1> <id2> ... --async\`，派发后必须立即作为后台任务运行 \`baton wait <id1> <id2> ... --all\` 聚合监听平账（严禁将多单提示词混杂在同一个代码块内）。
3. **出站回复收尾（交接提示词规范）**：出站由发起方统一计算与推进 Round 轮次；回复最末块必须固定为独立代码块，方便人类一键复制给接收方 Agent（其后无任何正文）：
   ## 交接提示词
   \`\`\`text
   请 [<目标角色>] 接单：
   [任务主题] <主题>
   [任务轮次] Round <round>（第 <round> 轮复审）
   [工单编号] [<conversation_id>]
   [工单路径] <交接路径>
   \`\`\`

详见 \`$(lab path handoffs)/AGENT-GUIDE.md\` 获取完整版 Preflight。`;
const STUB_SHA_ZH = crypto.createHash('sha256').update(STUB_BODY_ZH).digest('hex').slice(0, 8);
const STUB_BLOCK_ZH = `${STUB_BEGIN}\n<!-- generated — do not edit -->\n<!-- stub:sha256:${STUB_SHA_ZH} -->\n${STUB_BODY_ZH}\n${STUB_END}`;

const STUB_BODY_EN = `### Agent Baton (Handoff) Guard Stub (Resilient & Slim · Contract v${BATON_VERSION} · Details in $(lab path handoffs)/README.md)

**Core Guards & Identity (Mandatory)**
- **Workspace Boundary**: Agent session is strictly pinned to active workspace. Never cross boundaries via cd to mutate external code; output a Baton Pass Prompt for cross-repo tasks.
- **Single Ticket Lifecycle & Unified Session ID (Mandatory · v2.36.0)**: Ticket physical ID is conversation ID (unified), immutable across all rounds (Round 1..N); task topic remains constant.
- **Anti-Cross-Session Hard Gate (Constitutional Isolation)**: Tickets strictly bind to initiator conversation; cross-session mutation/closure (\`forward\`/\`accept\`/\`reopen\`) is prohibited. Receivers take tickets with explicit IDs.
- **CLI Form & Explicit Identity**: Always use \`baton <op>\` or \`handoff <op>\`. Full support for \`--as <lane>\` explicit identity override, enabling multi-ticket processing within the same session.
- **Session Lane Lock & Cryptographic Signatures**: Lock identity via \`baton lane <lane>\`; precedence is \`HANDOFF_LANE\` > \`baton lane\` > \`--as <lane>\`; audit delivery requires \`audit.token\` signatures.
- **Self-Healing Diagnostics**: Gate details (Nonce, Evidence, consistency) are evaluated by CLI runtime. Every CLI error output ends with a one-click copyable remediation command.

**Inbound Workflow (Receive · Deliver · Reject)**
1. **Check Pending**: Run \`baton status --as <my lane|target>\` (or global \`baton status\`).
2. **Inspect Ticket**: Run \`baton show <id>\`, implement scoped changes, and independently run tests.
3. **Deliver or Reject (Empirical Tests are the Sole Authority)**:
   - **All Tests Pass**: Follow \`$(lab path handoffs)/RESPONSE-TEMPLATE.md\` → run \`baton receipt <id> -n "<Body>" --deliver --as <my lane> --evidence-paths "<files>"\` (audit tickets require \`--audit-nonce "<nonce>"\` or \`--auto-nonce\`; red-team probes must follow three-state standard: NO_DISPATCH / NO_COMPLETE / COMPLETE).
   - **Tests Fail / Blocked (NO-GO)**: Use unconditional egress channel, run \`baton reject <id> -n "<reason/missing condition>" --as <my lane>\` to send back for revision (draft receipts can be logged without blocker).
4. **Wrap-up Check**: Run \`baton check [id]\` (supports \`--fix\` for auto-repair).
5. **Inbound Reply Epilogue (Concise One-Line Verdict · Anti-Role-Drift)**: Receiver must strictly maintain own execution/audit role without role drift; output only a single plain-text line at the very end of your response to the user (no markdown headers, no code blocks, strictly no multi-line outbound cards):
   - Audit Rejection: \`Audit complete, verdict NO-GO (Ticket returned to <initiator role> entering Round <N>)\`
   - Audit Pass: \`Audit complete, verdict GO\`
   - General Delivery: \`Delivery complete, receipt ready\`
   Next Round calculation and outbound dispatch cards are exclusively managed by the initiator when re-forwarding.

**Outbound Workflow (Dispatch · Listen · Mandatory Listener)**
1. **Create & Forward (Single Ticket Atomic · 99% cases)**: \`baton new <target|lane> <type> "<Title>"\`, fill body, then run \`baton forward <id> --wait\` as a host background task (add \`--blind\` for double-blind audit; single-ticket \`--async\` split is strictly prohibited!).
2. **Concurrent Batch Dispatch (Multiple tickets only)**: \`baton forward <id1> <id2> ... --async\`, then immediately run \`baton wait <id1> <id2> ... --all\` as a host background task to clear debt (never bundle multiple tickets into one prompt card).
3. **Outbound Reply Closing (Baton Pass Prompt)**: Initiator calculates and advances Round count; end outbound replies with an isolated code block for one-click human copying (no text after):
   ## Baton Pass Prompt
   \`\`\`text
   Please [<Target Role>] take ticket:
   [Task Topic] <Title>
   [Task Round] Round <round> (Review Round <round>)
   [Ticket ID] [<conversation_id>]
   [Ticket Path] <Path>
   \`\`\`

See \`$(lab path handoffs)/AGENT-GUIDE.md\` for full Preflight.`;
const STUB_SHA_EN = crypto.createHash('sha256').update(STUB_BODY_EN).digest('hex').slice(0, 8);
const STUB_BLOCK_EN = `${STUB_BEGIN}\n<!-- generated — do not edit -->\n<!-- stub:sha256:${STUB_SHA_EN} -->\n${STUB_BODY_EN}\n${STUB_END}`;

const STUB_BODY = STUB_BODY_ZH;
const STUB_SHA = STUB_SHA_ZH;
const STUB_BLOCK = STUB_BLOCK_ZH;

function safeWrite(file, content) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
    return true;
  } catch (e) {
    console.error(`⚠️ 写入失败（跳过，不中断其余目标）: ${file} — ${e.code || e.message}`);
    return false;
  }
}

function checkStubCarrier() {
  const home = process.env.HOME || '';
  const cdir = process.cwd();
  const targets = [
    path.join(cdir, 'AGENTS.md'),
    path.join(cdir, 'CLAUDE.md'),
    path.join(cdir, 'README.md'),
  ];
  if (home) {
    targets.push(path.join(home, '.claude/CLAUDE.md'));
    targets.push(path.join(home, '.config/opencode/AGENTS.md'));
    if (fs.existsSync(path.join(home, '.workbuddy/MEMORY.md'))) {
      targets.push(path.join(home, '.workbuddy/MEMORY.md'));
    }
    if (fs.existsSync(path.join(home, '.CODEBUDDY.md'))) {
      targets.push(path.join(home, '.CODEBUDDY.md'));
    }
  }
  if (fs.existsSync(path.join(cdir, 'GEMINI.md'))) {
    targets.push(path.join(cdir, 'GEMINI.md'));
  }
  if (fs.existsSync(path.join(cdir, 'CODEBUDDY.md'))) {
    targets.push(path.join(cdir, 'CODEBUDDY.md'));
  }
  if (fs.existsSync(path.join(cdir, '.cursorrules'))) {
    targets.push(path.join(cdir, '.cursorrules'));
  }
  if (fs.existsSync(path.join(cdir, '.github/copilot-instructions.md'))) {
    targets.push(path.join(cdir, '.github/copilot-instructions.md'));
  }
  const stdZH = STUB_CANON(STUB_BLOCK_ZH);
  const stdEN = STUB_CANON(STUB_BLOCK_EN);
  const problems = [];
  for (const p of targets) {
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, 'utf8');
    const regions = scanStub(txt);
    if (!regions.length) continue; // 无桩（手写指针）→ 不在此校验
    if (regions.length > 1) { problems.push(`[桩] 载体含 ${regions.length} 份接入桩（应恰 1）: ${p}`); continue; }
    if (!regions[0].includes(STUB_BEGIN)) { problems.push(`[桩] 载体缺标准 marker（应含 ${STUB_BEGIN}）: ${p}`); continue; }
    const canon = STUB_CANON(regions[0]);
    if (canon !== stdZH && canon !== stdEN) {
      problems.push(`[桩] 载体漂移/被手工改: ${p} → 跑 baton install 更新`);
      continue;
    }
    const shaM = regions[0].match(/<!-- stub:sha256:([0-9a-f]+) -->/);
    if (shaM && shaM[1] !== STUB_SHA_ZH && shaM[1] !== STUB_SHA_EN) {
      problems.push(`[桩] 载体内嵌 sha(${shaM[1]}) 校验失败: ${p}`);
    }
  }
  if (problems.length) {
    console.error(`❌ check 未通过（桩载体 ${problems.length} 个问题）:`);
    for (const x of problems) console.error('  - ' + x);
    process.exit(1);
  }
}

function extractTitle(body) {
  const m = body.match(/^# (.+)$/m);
  return m ? m[1].trim() : '(无标题)';
}

// 任务主题全生命周期恒定净化（v2.35.0）：强力剥离任何形式的轮次噪音，确保主题恒定
function sanitizeTaskTopic(rawTitle) {
  if (!rawTitle) return '(无标题)';
  let title = rawTitle.replace(/\s*\((?:to_)?lane:\s*[^)]+\)/gi, '').trim();
  // 匹配任何形式的轮次声明及其后续附加噪音（例如 · Round 2、[Round 2]、(第 2 轮复审) 及其后面可能跟随的修复补充说明）
  title = title.replace(/\s*([·•\-–]\s*)?(?:\[|【|\()?\s*(?:第\s*\d+\s*轮(?:\s*复审|\s*整改)?|Round\s*\d+)(?:[^\n]*)$/gi, '').trim();
  title = title.replace(/[·•\-–]\s*$/g, '').trim();
  return title || rawTitle;
}

function cmdCheck(args = []) {
  const rawId = args.find(a => !a.startsWith('-'));
  const targetId = resolveTicketId(rawId);
  const resolvedArgs = (targetId && targetId !== rawId)
    ? args.map(a => a === rawId ? targetId : a)
    : args;
  if (!targetId) {
    checkStubCarrier();
  }
  // CLI 可达性（热修批次八）：先于模式分支，跨仓/仓内都门禁
  const cliProblems = [];
  const cliWarnings = [];
  checkCliReachable(cliProblems, cliWarnings);
  for (const w of cliWarnings) console.log('⚠️ ' + w);
  if (cliProblems.length) {
    console.error(`❌ check 未通过（CLI 可达性 · ${cliProblems.length} 个问题）:`);
    for (const p of cliProblems) console.error('  - ' + p);
    process.exit(1);
  }
  if (MODE === 'intra-repo') return cmdCheckIntra(resolvedArgs);
  return cmdCheckCross(resolvedArgs);
}

// 跨仓模式门禁
function cmdCheckCross(args = []) {
  const problems = [];
  const isFix = args.includes('--fix');
  const targetId = args.find(a => !a.startsWith('-'));
  let hAll = fs.existsSync(H_DIR) ? fs.readdirSync(H_DIR).filter(f => f.endsWith('.md')) : [];
  if (targetId) {
    const cleanId = targetId.replace(/\.md$/, '').replace(/-resp$/, '');
    const targetFile = `${cleanId}.md`;
    if (!fs.existsSync(path.join(H_DIR, targetFile))) {
      console.error(`找不到交接文件: ${targetFile}`);
      process.exit(1);
    }
    hAll = [targetFile];
  }
  for (const f of hAll.sort()) {
    const p = path.join(H_DIR, f);
    if (!H_RE.test(f)) { problems.push(`[交接] 文件名不符合命名规范: ${f}`); continue; }
    const raw = fs.readFileSync(p, 'utf8');
    const fm = readFM(raw);
    if (!fm) { problems.push(`[交接] 缺 frontmatter: ${f}`); continue; }
    const id = f.replace(/\.md$/, '');
    if (fm.handoff_id !== id) problems.push(`[交接] handoff_id(${fm.handoff_id}) ≠ 文件名: ${f}`);
    if (!TARGETS.has(fm.target)) problems.push(`[交接] target 非法(${fm.target}): ${f}`);
    if (!TYPES.has(fm.type)) problems.push(`[交接] type 非法(${fm.type}): ${f}`);
    if (!STATUSES.has(fm.status)) problems.push(`[交接] status 非法(${fm.status}): ${f}`);
    if ((fm.status === 'received' || fm.status === 'delivered' || fm.status === 'closed') && !fs.existsSync(path.join(R_DIR, `${id}-resp.md`)))
      problems.push(`[交接] status=${fm.status} 但缺回执 receipts/${id}-resp.md: ${f}`);
    if (fm.status === 'closed' && !fm.closed)
      problems.push(`[交接] status=closed 但缺 closed 日期: ${f}`);
    if (fm.status === 'closed' && fm.created && fm.created >= '2026-11-08' && !fm.delivered_at)
      problems.push(`[交接] status=closed 但缺 delivered_at 交付时间标记（新交接须经 baton deliver 交付再闭环）: ${f}`);
    if (fm.status === 'closed' && !/^## (验收记录|Audit Record|Acceptance Record)/im.test(raw))
      problems.push(`[交接] status=closed 但缺「验收记录」节（须经 handoff accept <id> -n "<结论>" 闭环）: ${f}`);

    // 状态机语义不变量校验（v2.25 · P1-1 修复）
    if (fm.status === 'closed') {
      if (fm.rejected_at) {
        if (!fm.accepted_at || new Date(fm.accepted_at) <= new Date(fm.rejected_at)) {
          problems.push(`[交接] 状态机倒挂：status=closed 但 accepted_at(${fm.accepted_at || '空'}) <= rejected_at(${fm.rejected_at}): ${f}`);
        }
        if (!fm.delivered_at || new Date(fm.delivered_at) <= new Date(fm.rejected_at)) {
          problems.push(`[交接] 状态机倒挂：status=closed 但 delivered_at(${fm.delivered_at || '空'}) <= rejected_at(${fm.rejected_at}): ${f}`);
        }
      }
      const rPath = path.join(R_DIR, `${id}-resp.md`);
      if (fs.existsSync(rPath)) {
        const rRaw = fs.readFileSync(rPath, 'utf8');
        const rFm = readFM(rRaw) || {};
        const rBody = stripFM(rRaw);
        const concl = extractConclusion(rBody);
        const isLegacyTicket = fm.created && fm.created < '2026-11-11';
        if (!isLegacyTicket && isVerdictRejected(concl)) {
          problems.push(`[交接] 语义矛盾：status=closed 但回执最新结论为「${concl}」（未通过）: ${f}`);
        }
        if (!isLegacyTicket && rFm.needs_change === true) {
          problems.push(`[交接] 语义矛盾：status=closed 但回执仍标记 needs_change=true: ${f}`);
        }
        if (/## (驳回记录|Rejection Record)/im.test(rBody) && fm.rejected_at) {
          if (!fm.delivered_at || new Date(fm.delivered_at) <= new Date(fm.rejected_at)) {
            problems.push(`[交接] 驳回未闭合：回执含驳回记录，但 delivered_at 缺失或早于 rejected_at: ${f}`);
          }
        }
      }
    }
    if (fm.status === 'forwarded' || fm.status === 'draft') {
      if (fm.accepted_at) {
        problems.push(`[交接] 脏数据残留：status=${fm.status} 但残留 accepted_at(${fm.accepted_at}): ${f}`);
      }
    }
    if (fm.delivered_by_lane && !fm.delivered_at) {
      problems.push(`[交接] 悬空字段：有 delivered_by_lane(${fm.delivered_by_lane}) 但缺 delivered_at: ${f}`);
    }
  }
  let rAll = fs.existsSync(R_DIR) ? fs.readdirSync(R_DIR).filter(f => f.endsWith('.md') && !f.endsWith('.bak.md')) : [];
  if (targetId) {
    const cleanId = targetId.replace(/\.md$/, '').replace(/-resp$/, '');
    const respFile = `${cleanId}-resp.md`;
    rAll = fs.existsSync(path.join(R_DIR, respFile)) ? [respFile] : [];
  }
  for (const f of rAll.sort()) {
    if (!R_RE.test(f)) { problems.push(`[回执] 文件名不符合命名规范: ${f}`); continue; }
    const raw = fs.readFileSync(path.join(R_DIR, f), 'utf8');
    const fm = readFM(raw);
    if (!fm || !fm.handoff_id) { problems.push(`[回执] 缺 handoff_id frontmatter: ${f}`); continue; }
    if (!fs.existsSync(path.join(H_DIR, `${fm.handoff_id}.md`)))
      problems.push(`[回执] 孤儿回执（无对应交接）: ${f}`);
    checkReceiptBody(f, fm, raw, problems);
    checkReceiptPrompt(f, fm, raw, problems);
    { const w = []; evidenceProblems(normalizeEvidence(fm), gateDate(fm), { mode: 'cross', workspace: undefined }, problems, w); for (const x of w) console.log('⚠️ ' + x); }
  }
  if (problems.length) {
    console.error(`❌ check 未通过（${problems.length} 个问题）:`);
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log(`✅ check 通过: ${hAll.length} 份交接 / ${rAll.length} 份回执，全部合规`);
  reportSize();
  reportMissingReceiptPrompt();
  reportStalePending();
  reportUnwatchedPending();
}

// 仓内模式门禁：按 ROOT 模式（配置）分支；per-file `mode` 仅作一致性校验，不替代根模式判定
function cmdCheckIntra(args = []) {
  const problems = [];
  const isFix = args.includes('--fix');
  const targetId = args.find(a => !a.startsWith('-'));
  const lanes = new Set((HUB_CONFIG.lanes || []).map(s => String(s).toLowerCase()));
  const targets = new Set((HUB_CONFIG.targets || []).map(s => String(s).toLowerCase()));
  const types = new Set([...(HUB_CONFIG.types || []), ...INTRA_TYPES].map(s => String(s).toLowerCase()));
  if (!lanes.size) problems.push(`[配置] .handoff-hub.json 缺 lanes（仓内交接靠 lane 路由）`);
  let hAll = fs.existsSync(H_DIR) ? fs.readdirSync(H_DIR).filter(f => f.endsWith('.md')) : [];
  if (targetId) {
    const cleanId = targetId.replace(/\.md$/, '').replace(/-resp$/, '');
    const targetFile = `${cleanId}.md`;
    if (!fs.existsSync(path.join(H_DIR, targetFile))) {
      console.error(`找不到交接文件: ${targetFile}`);
      process.exit(1);
    }
    hAll = [targetFile];
  }
  for (const f of hAll.sort()) {
    const p = path.join(H_DIR, f);
    if (!INTRA_ID_RE.test(f)) { problems.push(`[交接] 文件名不符合仓内命名规范（<LANE>-<YYYYMMDD>-<NN>-<TYPE>）: ${f}`); continue; }
    const raw = fs.readFileSync(p, 'utf8');
    const fm = readFM(raw);
    if (!fm) { problems.push(`[交接] 缺 frontmatter: ${f}`); continue; }
    const id = f.replace(/\.md$/, '');
    if (fm.handoff_id !== id) problems.push(`[交接] handoff_id(${fm.handoff_id}) ≠ 文件名: ${f}`);
    if (fm.mode !== 'intra-repo') problems.push(`[交接] mode 应为 intra-repo，但为 ${fm.mode}: ${f}`);
    if (!fm.to_lane || !lanes.has(String(fm.to_lane).toLowerCase())) problems.push(`[交接] to_lane(${fm.to_lane}) 不在配置 lanes(${[...lanes].join('/')}): ${f}`);
    if (fm.from_lane && !lanes.has(String(fm.from_lane).toLowerCase()) && !targets.has(String(fm.from_lane).toLowerCase())) problems.push(`[交接] from_lane(${fm.from_lane}) 不在配置 lanes 或 targets: ${f}`);
    if (!types.has(String(fm.type).toLowerCase())) problems.push(`[交接] type 非法(${fm.type}): ${f}`);
    if (!STATUSES.has(fm.status)) problems.push(`[交接] status 非法(${fm.status}): ${f}`);
    if (fm.workspace && !['same', 'separate', 'worktree'].includes(fm.workspace)) problems.push(`[交接] workspace 非法(${fm.workspace}): ${f}`);
    if ((fm.status === 'received' || fm.status === 'delivered' || fm.status === 'closed') && !fs.existsSync(path.join(R_DIR, `${id}-resp.md`)))
      problems.push(`[交接] status=${fm.status} 但缺回执 receipts/${id}-resp.md: ${f}`);
    if (fm.status === 'closed' && !fm.closed)
      problems.push(`[交接] status=closed 但缺 closed 日期: ${f}`);
    if (fm.status === 'closed' && fm.created && fm.created >= '2026-11-08' && !fm.delivered_at)
      problems.push(`[交接] status=closed 但缺 delivered_at 交付时间标记（新交接须经 baton deliver 交付再闭环）: ${f}`);
    if (fm.status === 'closed' && !/^## (验收记录|Audit Record|Acceptance Record)/im.test(raw))
      problems.push(`[交接] status=closed 但缺「验收记录」节（须经 handoff accept <id> -n "<结论>" 闭环）: ${f}`);

    // needs_change 一致性校验与安全修复
    const rPath = path.join(R_DIR, `${id}-resp.md`);
    if (fs.existsSync(rPath)) {
      const rRaw = fs.readFileSync(rPath, 'utf8');
      const rFm = readFM(rRaw) || {};
      if (rFm.needs_change !== undefined && fm.needs_change !== undefined && Boolean(rFm.needs_change) !== Boolean(fm.needs_change)) {
        if (isFix) {
          setFM(p, { needs_change: Boolean(rFm.needs_change) });
          logStateJournal(id, 'repair', { note: 'Align needs_change with receipt', needs_change: Boolean(rFm.needs_change) });
          console.log(`🔧 已安全修复 needs_change 一致性: ${id} (工单 ${fm.needs_change} → 依照回执对齐为 ${rFm.needs_change})`);
        } else {
          problems.push(`[交接] needs_change 不一致：工单标记 needs_change=${fm.needs_change}，但回执标记 needs_change=${rFm.needs_change}: ${f}`);
        }
      }

      // audit_nonce 一致性核验（处于 forwarded 驳回返工时豁免旧回执 nonce 比对）
      if (String(fm.to_lane || '').toLowerCase() === 'audit') {
        if (fm.status !== 'forwarded' && fm.audit_nonce && rFm.audit_nonce && rFm.audit_nonce !== fm.audit_nonce) {
          problems.push(`[交接] audit_nonce 不一致：工单签发(${fm.audit_nonce}) ≠ 回执记录(${rFm.audit_nonce}): ${f}`);
        }
      }
    }

    if (isFix && String(fm.to_lane || '').toLowerCase() === 'audit' && !fm.audit_nonce) {
      const fixedNonce = generateAuditNonce(id);
      setFM(p, { audit_nonce: fixedNonce });
      logStateJournal(id, 'repair', { note: 'Issue missing audit_nonce', audit_nonce: fixedNonce });
      console.log(`🔧 已安全补发缺失的 Audit Nonce: ${id} → ${fixedNonce}`);
    }

    if (isFix && !fm.conversation_id) {
      const fixedConv = getSessionId();
      setFM(p, { conversation_id: fixedConv });
      logStateJournal(id, 'repair', { note: 'Backfill missing conversation_id', conversation_id: fixedConv });
      console.log(`🔧 已安全补齐缺失的 conversation_id: ${id} → ${fixedConv}`);
    }

    // tool_profile 严格核验 (ADR-0012 §2.6 / ADR-0009 反假接线)
    if (fm.tool_profile) {
      const validProfiles = ['readonly', 'full'];
      if (!validProfiles.includes(fm.tool_profile)) {
        problems.push(`[交接] tool_profile 非法(${fm.tool_profile})，仅支持 readonly 或 full: ${f}`);
      }
      if (fm.tool_profile === 'readonly' && fs.existsSync(rPath)) {
        const rRaw = fs.readFileSync(rPath, 'utf8');
        const rFm = readFM(rRaw) || {};
        const evPaths = (rFm.evidence_paths || '').split(',').map(s => s.trim()).filter(Boolean);
        const forbiddenMutations = evPaths.filter(p => {
          const clean = p.replace(/^[+~]/, '');
          if (clean.startsWith('.handoffs/') || clean.startsWith('specs/') || clean.startsWith('/tmp/') || clean.startsWith('tmp/')) return false;
          return !clean.endsWith('.log') && !clean.endsWith('.json') && !clean.endsWith('.txt') && !clean.endsWith('.md');
        });
        if (forbiddenMutations.length > 0) {
          problems.push(`[交接] tool_profile=readonly 约束违例：回执 evidence_paths 包含源码改动 [${forbiddenMutations.join(', ')}]: ${f}`);
        }
      }
    }

    // 状态机语义不变量校验（v2.25 · P1-1 修复）
    if (fm.status === 'closed') {
      if (fm.rejected_at) {
        if (!fm.accepted_at || new Date(fm.accepted_at) <= new Date(fm.rejected_at)) {
          problems.push(`[交接] 状态机倒挂：status=closed 但 accepted_at(${fm.accepted_at || '空'}) <= rejected_at(${fm.rejected_at}): ${f}`);
        }
        if (!fm.delivered_at || new Date(fm.delivered_at) <= new Date(fm.rejected_at)) {
          problems.push(`[交接] 状态机倒挂：status=closed 但 delivered_at(${fm.delivered_at || '空'}) <= rejected_at(${fm.rejected_at}): ${f}`);
        }
      }
      if (fs.existsSync(rPath)) {
        const rRaw = fs.readFileSync(rPath, 'utf8');
        const rFm = readFM(rRaw) || {};
        const rBody = stripFM(rRaw);
        const concl = extractConclusion(rBody);
        const isLegacyTicket = fm.created && fm.created < '2026-11-11';
        if (!isLegacyTicket && isVerdictRejected(concl)) {
          problems.push(`[交接] 语义矛盾：status=closed 但回执最新结论为「${concl}」（未通过）: ${f}`);
        }
        if (!isLegacyTicket && rFm.needs_change === true) {
          problems.push(`[交接] 语义矛盾：status=closed 但回执仍标记 needs_change=true: ${f}`);
        }
        if (/## (驳回记录|Rejection Record)/im.test(rBody) && fm.rejected_at) {
          if (!fm.delivered_at || new Date(fm.delivered_at) <= new Date(fm.rejected_at)) {
            problems.push(`[交接] 驳回未闭合：回执含驳回记录，但 delivered_at 缺失或早于 rejected_at: ${f}`);
          }
        }
      }
    }
    if (fm.status === 'forwarded' || fm.status === 'draft') {
      if (fm.accepted_at) {
        problems.push(`[交接] 脏数据残留：status=${fm.status} 但残留 accepted_at(${fm.accepted_at}): ${f}`);
      }
    }
    if (fm.delivered_by_lane && !fm.delivered_at) {
      problems.push(`[交接] 悬空字段：有 delivered_by_lane(${fm.delivered_by_lane}) 但缺 delivered_at: ${f}`);
    }
  }
  let rAll = fs.existsSync(R_DIR) ? fs.readdirSync(R_DIR).filter(f => f.endsWith('.md') && !f.endsWith('.bak.md')) : [];
  if (targetId) {
    const cleanId = targetId.replace(/\.md$/, '').replace(/-resp$/, '');
    const respFile = `${cleanId}-resp.md`;
    rAll = fs.existsSync(path.join(R_DIR, respFile)) ? [respFile] : [];
  }
  for (const f of rAll.sort()) {
    if (!INTRA_RESP_RE.test(f)) { problems.push(`[回执] 文件名不符合命名规范: ${f}`); continue; }
    const raw = fs.readFileSync(path.join(R_DIR, f), 'utf8');
    const fm = readFM(raw);
    if (!fm || !fm.handoff_id) { problems.push(`[回执] 缺 handoff_id frontmatter: ${f}`); continue; }
    if (!fs.existsSync(path.join(H_DIR, `${fm.handoff_id}.md`)))
      problems.push(`[回执] 孤儿回执（无对应交接）: ${f}`);
    // 防提前闭环（v2.13）：回执 author_lane 即其所属交接的发起方 from_lane ⇒ 发起方自填回执，破坏审计制衡。
    if (fm.author_lane) {
      try {
        const hFm0 = readFM(fs.readFileSync(path.join(H_DIR, `${fm.handoff_id}.md`), 'utf8')) || {};
        if (hFm0.from_lane && String(fm.author_lane).toLowerCase() === String(hFm0.from_lane).toLowerCase()) {
          problems.push(`[回执] 自填回执（author_lane=${fm.author_lane} == 交接 from_lane=${hFm0.from_lane}）：${f} —— 回执必须由接收方 to_lane 独立撰写，发起方自填破坏独立审计制衡`);
        }
      } catch { /* 交接不可读不阻断其它校验 */ }
    }
    checkReceiptBody(f, fm, raw, problems);
    let ws;
    try { ws = readFM(fs.readFileSync(path.join(H_DIR, `${fm.handoff_id}.md`), 'utf8'))?.workspace; } catch {}
    checkReceiptPrompt(f, fm, raw, problems);
    { const w = []; evidenceProblems(normalizeEvidence(fm), gateDate(fm), { mode: 'intra-repo', workspace: ws, file: f }, problems, w); for (const x of w) console.log('⚠️ ' + x); }
  }

  // 分组呈现：当前工单问题 vs 历史存量工单问题
  if (targetId) {
    if (problems.length) {
      console.error(`❌ 工单 ${targetId} check 未通过（${problems.length} 个问题）:`);
      for (const p of problems) console.error('  - ' + p);
      process.exit(1);
    }
    console.log(`✅ 工单 ${targetId} check 通过，全部合规`);
    return;
  }

  // 全仓体检：分离活跃工单与存量历史工单
  const activeProblems = [];
  const legacyProblems = [];
  for (const prob of problems) {
    // 提取关联的交接文件名
    const m = prob.match(/: ([^:\s]+\.md)/);
    const fileName = m ? m[1] : '';
    let isLegacy = false;
    if (fileName) {
      try {
        const tFm = readFM(fs.readFileSync(path.join(H_DIR, fileName.replace(/-resp\.md$/, '.md')), 'utf8'));
        if (tFm && (tFm.status === 'closed' || (tFm.created && tFm.created < '2026-11-11'))) {
          isLegacy = true;
        }
      } catch {}
    }
    if (isLegacy) legacyProblems.push(prob);
    else activeProblems.push(prob);
  }

  if (activeProblems.length) {
    console.error(`❌ check 未通过（当前活跃工单发现 ${activeProblems.length} 个问题）:`);
    for (const p of activeProblems) console.error('  - ' + p);
    if (legacyProblems.length) {
      console.warn(`\n⚠️ 另发现存量历史工单问题 ${legacyProblems.length} 项（不阻断当前活跃工单，可用 baton check --fix 修复）:`);
      for (const p of legacyProblems) console.warn('  - ' + p);
    }
    process.exit(1);
  }

  if (legacyProblems.length) {
    console.log(`✅ check 通过（仓内模式）: 活跃工单全部合规（存量历史工单存在 ${legacyProblems.length} 项告警，不阻断当前流程；可用 baton check --fix 修复）`);
    for (const p of legacyProblems) console.warn('  - ' + p);
  } else {
    console.log(`✅ check 通过（仓内模式）: ${hAll.length} 份交接 / ${rAll.length} 份回执，全部合规`);
  }
  reportSize();
  reportStalePending();
  reportUnwatchedPending();
}

/** 体积提示（**非阻断** · 契约 v2.6 的体积预算）。
 *
 * 为什么只查契约生效后（2026-08-31 起）的文档：存量是历史证据，为体积回改等于毁证据；
 * 全量报会把 30+ 份旧文档刷成噪音，反而没人看真正该改的那份。
 * 为什么不设成硬失败：同上——体积是纪律不是合规，用可见性约束比用 exit code 合适。 */
const SIZE_BUDGET = { handoffs: 60, receipts: 50 };
const SIZE_SINCE = '2026-08-31';
function reportSize() {
  const rows = [];
  for (const [dir, kind] of [[H_DIR, 'handoffs'], [R_DIR, 'receipts']]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.md'))) {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const fm = readFM(raw);
      const made = fm?.created || fm?.date;
      if (!made || String(made) < SIZE_SINCE) continue; // 无日期或早于契约生效日 = 存量，不报
      const lines = raw.split('\n').length;
      if (lines > SIZE_BUDGET[kind]) rows.push({ f, kind, lines, budget: SIZE_BUDGET[kind] });
    }
  }
  if (!rows.length) return;
  rows.sort((a, b) => b.lines - a.lines);
  console.log(`📏 体积提示（${SIZE_SINCE} 起的文档 · 预算 交接≤60 行 / 回执≤50 行）：${rows.length} 份超限`);
  for (const r of rows) console.log(`   ${r.lines} 行（预算 ${r.budget}） ${r.kind}/${r.f}`);
  console.log('   超限 = 把该放外链（reviews/）的背景论证抄进了正文。');
}

/** 回执「转递提示词」缺失提示（**非阻断** · 契约 v2.8.1）。
 *
 * 为什么需要：2026-09-10 排查发现 43 份回执中 31 份照抄 RESPONSE-TEMPLATE.md 骨架、
 * 100% 漏写「转递提示词」节——当时该要求只写在骨架之外的散文里，agent 复制骨架时带不走。
 * 骨架已内置该节（L70-71），但漏写仍无机器信号，故加此提示兜底。
 * 为什么只查 2026-09-10 起：骨架修复日之前的回执补写无意义（多已闭环），且 30+ 份存量
 * 全量报会刷成噪音，反而没人看真正该改的那份（同 reportSize 的处理原则）。
 * 为什么排除 COREML-*：同工作区侧免转递，契约明载不适用此话术。
 * 为什么不设硬失败：用可见性约束比 exit code 合适——硬校验会让存量立刻不合规。 */
const PROMPT_SINCE = '2026-09-10';
function reportMissingReceiptPrompt() {
  if (!fs.existsSync(R_DIR)) return;
  const rows = [];
  for (const f of fs.readdirSync(R_DIR).filter(x => x.endsWith('.md'))) {
    if (f.startsWith('COREML-')) continue; // 同工作区侧免转递
    const raw = fs.readFileSync(path.join(R_DIR, f), 'utf8');
    const fm = readFM(raw);
    const made = fm?.date;
    if (!made || String(made) < PROMPT_SINCE) continue; // 无日期或早于骨架修复日 = 存量，不报
    // 必须锚定行首：只认「提示词行」本身，不认正文里引用/描述该话术的文字
    // （2026-09-10 教训：宽松写法 /登记回执/ 把 PROSPERO-20260910-01-bug-resp.md 第 31 行
    //  的改动描述误判为「已含」，产生假阴性）。行首可带一个反引号（提示词常写成 `xxx` 行内代码）。
    // v2.8.2：新式「请收 <写回执仓> 回执：」与旧式「登记回执：」均认（存量回执/旧记忆不回改）。
    if (/^`?(登记回执|请收[^\n：]*回执|请【[^\n】]*】查收【[^\n】]*】回执|Please review[^\n:]*receipt|Register receipt)(?:[ \t]*\[[^\]]+\])?[：:]/im.test(raw)) continue;
    rows.push(f);
  }
  if (!rows.length) return;
  console.log(`🔔 回执转递提示词缺失（${PROMPT_SINCE} 起的回执 · 非阻断）：${rows.length} 份`);
  for (const f of rows.sort()) console.log(`   receipts/${f}`);
  console.log('   缺失 = 用户得自己拼提示词。补法：回执末尾加「## 转递提示词（必含 · 供用户原样复制）」节 + 一行可复制交付行（新式「请收 <本仓> 回执：<路径>（…）」或旧式「登记回执：<路径>」）。');
}

/** 待执行滞留提示（**非阻断** · v2.12.5）。
 *
 * 为什么需要：draft/forwarded 是「该执行方动工」的待办态，此前只有 status 输出可见、
 * 躺多久都零红灯——与 v2.7「严禁据此判不处理」配套的机器信号：交接落归属方 N 天未推进，
 * 执行方漏接（B 窗口只读不执行）或发起方漏催，check 至少要指名道姓。
 * 为什么不设硬失败：同 reportSize/reportMissingReceiptPrompt——滞留是协作节奏问题不是
 * 合规问题，用可见性约束比 exit code 合适（存量大量历史 draft 会把 check 立刻打红）。
 * 7 天阈值：对齐人读周节奏；created 取交接创建日（发起方时间戳，非执行方可篡改）。 */
const STALE_PENDING_DAYS = 7;
function reportStalePending() {
  if (!fs.existsSync(H_DIR)) return;
  const re = MODE === 'intra-repo' ? INTRA_ID_RE : H_RE;
  const rows = [];
  for (const f of listMdFiles(H_DIR, re)) {
    const fm = readFM(fs.readFileSync(path.join(H_DIR, f), 'utf8'));
    if (!fm || (fm.status !== 'draft' && fm.status !== 'forwarded')) continue;
    const created = String(fm.created || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(created)) continue;
    const age = Math.floor((Date.now() - new Date(created + 'T00:00:00Z').getTime()) / 86400000);
    if (age >= STALE_PENDING_DAYS) rows.push({ id: fm.handoff_id, status: fm.status, age });
  }
  if (!rows.length) return;
  rows.sort((a, b) => b.age - a.age);
  console.log(`⏳ 待执行滞留（draft/forwarded ≥${STALE_PENDING_DAYS} 天未推进 · 非阻断）：${rows.length} 项`);
  for (const r of rows) console.log(`   ${r.age} 天 ${r.status}  ${r.id}`);
  console.log(`   滞留 = 交接已落归属方但未见动工/回执——执行方跑 \`handoff status --for <本方>\` 认领开工；发起方该催办（status --json 可查）。`);
}

/** 监听状态诊断提示（非阻断 · v2.23.0）。
 *
 * 检查当前仓库已转递（forwarded）的工单是否存在存活的 wait 监听探针。
 * 若无存活监听，输出显式提醒，防范 Agent 因「以为外部客户端等不到」而跳过监听造成闭环断崖。 */
function reportUnwatchedPending() {
  if (!fs.existsSync(H_DIR)) return;
  const re = MODE === 'intra-repo' ? INTRA_ID_RE : H_RE;
  const rows = [];
  const watchDir = path.join(ROOT, '.watch');
  for (const f of listMdFiles(H_DIR, re)) {
    const fm = readFM(fs.readFileSync(path.join(H_DIR, f), 'utf8'));
    if (!fm || fm.status !== 'forwarded') continue;
    const watchFile = path.join(watchDir, `${fm.handoff_id}.json`);
    let hasWatcher = false;
    if (fs.existsSync(watchFile)) {
      try {
        const wData = JSON.parse(fs.readFileSync(watchFile, 'utf8'));
        if (wData) {
          if (Array.isArray(wData.watchers) && wData.watchers.length > 0) {
            for (const w of wData.watchers) {
              try {
                if (w && w.pid) {
                  process.kill(w.pid, 0);
                  hasWatcher = true;
                  break;
                }
              } catch {}
            }
          } else if (wData.pid) {
            process.kill(wData.pid, 0);
            hasWatcher = true;
          }
        }
      } catch {}
    }
    if (!hasWatcher) {
      rows.push(fm.handoff_id);
    }
  }
  if (!rows.length) return;
  const isZh = detectLang() === 'zh';
  console.log(`⚠️  未挂起后台监听（已转递但无存活 wait 探针 · v2.34.0）：${rows.length} 份`);
  for (const id of rows) console.log(`   handoffs/${id}.md → [⚠️ 无监听]`);
  if (isZh) {
    console.log(`   提示：Baton 为本地文件系统事件总线（fs.watch）。无论执行方是外部客户端还是独立终端，deliver 均可自动唤醒。`);
    console.log(`   👉 一键启动后台监听平账：baton wait ${rows.join(' ')} --all\n`);
  } else {
    console.log(`   Notice: Baton is a local fs.watch event bus. Wakeup is automatic upon delivery.`);
    console.log(`   👉 Start background listener: baton wait ${rows.join(' ')} --all\n`);
  }
  if (process.env.BATON_STRICT_WATCH === '1') {
    process.exit(1);
  }
}

/** 当前工作区归属哪个仓库（用于方向自检）。
 *
 * 为什么需要：prompt 是「发送方 → 转递给依赖方」的工具。若调用者所在仓库
 * 恰好就是交接的 target，说明调用者本身即接收方，再生成转递话术等于把交接
 * 转给自己（2026-09-01 SWOOP-20260901-02 事故：Swoop agent 在 Swoop 工作区
 * 对 target:swoop 的交接跑 prompt，输出「复制给 swoop Agent」）。
 * 判定不了时返回 null 放行——宁可漏拦，不可误伤合法的发送方场景。 */
function detectRepo(cwd) {
  try {
    const url = execFileSync('git', ['-C', cwd, 'remote', 'get-url', 'origin'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().toLowerCase();
    for (const t of TARGETS) {
      if (url.includes(`/${t}.git`) || url.endsWith(`/${t}`)) return t;
    }
  } catch { /* 非 git 目录或无 origin → 回退到目录名 */ }
  try {
    const base = path.basename(cwd).toLowerCase();
    if (TARGETS.has(base)) return base;
  } catch { /* cwd 异常 → 放行 */ }
  return null;
}

/** 跨平台系统剪贴板写入（Fail-open：异常或 CI 静默跳过，杜绝阻断主工作流）。 */
function copyToClipboard(text) {
  if (!text || process.env.CI || process.env.BATON_NO_CLIPBOARD) return false;
  try {
    const raw = String(text).trim();
    if (process.platform === 'darwin') {
      const p = spawn('pbcopy', [], { stdio: ['pipe', 'ignore', 'ignore'] });
      p.stdin.write(raw);
      p.stdin.end();
      return true;
    } else if (process.platform === 'win32') {
      const p = spawn('clip.exe', [], { stdio: ['pipe', 'ignore', 'ignore'] });
      p.stdin.write(raw);
      p.stdin.end();
      return true;
    } else if (process.platform === 'linux') {
      try {
        const p = spawn('xclip', ['-selection', 'clipboard'], { stdio: ['pipe', 'ignore', 'ignore'] });
        p.stdin.write(raw);
        p.stdin.end();
        return true;
      } catch {
        const p = spawn('wl-copy', [], { stdio: ['pipe', 'ignore', 'ignore'] });
        p.stdin.write(raw);
        p.stdin.end();
        return true;
      }
    }
  } catch {}
  return false;
}

/** 提示词物理持久化镜像（固化至 .handoffs/.latest-prompt.txt，杜绝 Agent 上下文丢失提示词）。 */
function writeLatestPrompt(promptText, title, ticketId) {
  try {
    const parentDir = path.dirname(H_DIR);
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
    const promptPath = path.join(parentDir, '.latest-prompt.txt');
    const header = `# Latest Baton Outbound Prompt [${ticketId || ''}]\n# Generated at: ${new Date().toISOString()}\n\n`;
    fs.writeFileSync(promptPath, header + String(promptText).trim() + '\n', 'utf8');
    return promptPath;
  } catch {
    return null;
  }
}

function cmdPrompt(args) {
  const [rawId] = args.filter(a => !a.startsWith('--'));
  if (!rawId) { console.error('用法: handoff prompt <id>'); process.exit(2); }
  const id = resolveTicketId(rawId);
  const hFile = path.join(H_DIR, `${id}.md`);
  if (!fs.existsSync(hFile)) { console.error('找不到交接: ' + hFile); process.exit(1); }
  const content = fs.readFileSync(hFile, 'utf8');
  const title = extractTitle(stripFM(content));
  const isZh = detectLang() === 'zh';
  const display = hFile.startsWith(os.homedir()) ? '~' + hFile.slice(os.homedir().length) : hFile;

  if (MODE === 'intra-repo') {
    const fm = readFM(content) || {};
    const ws = fm.workspace || 'same';
    const toRole = resolveLaneRole(fm.to_lane) || fm.to_lane || (isZh ? '执行方' : 'Executor');
    const cleanTitle = sanitizeTaskTopic(title);
    const round = Number(fm.round || 1);
    const roundLineZh = round > 1 ? `[任务轮次] Round ${round}（第 ${round} 轮复审）\n` : '';
    const roundLineEn = round > 1 ? `[Task Round] Round ${round} (Review Round ${round})\n` : '';
    const profileLineZh = fm.tool_profile === 'readonly' ? `[工具约束] tool_profile=readonly（只读探查：严格禁止修改生产源码）\n` : '';
    const profileLineEn = fm.tool_profile === 'readonly' ? `[Tool Profile] tool_profile=readonly (Read-only: Prohibited from modifying production code)\n` : '';
    const convId = fm.conversation_id || getSessionId();
    const promptId = convId || id;

    const promptCardTextZh = (ws === 'worktree')
      ? `请 [${toRole}] 在隔离工作树接单：\n[任务主题] ${cleanTitle}\n${roundLineZh}${profileLineZh}[工作树路径] ${path.join('.worktrees', id)}\n[工单编号] [${promptId}]\n[工单路径] ${display}`.trimEnd()
      : `请 [${toRole}] 接单：\n[任务主题] ${cleanTitle}\n${roundLineZh}${profileLineZh}[工单编号] [${promptId}]\n[工单路径] ${display}`.trimEnd();

    const promptCardTextEn = (ws === 'worktree')
      ? `Please [${toRole}] take handoff in isolated worktree:\n[Task Topic] ${cleanTitle}\n${roundLineEn}${profileLineEn}[Worktree] ${path.join('.worktrees', id)}\n[Ticket ID] [${promptId}]\n[Ticket Path] ${display}`.trimEnd()
      : `Please [${toRole}] take handoff:\n[Task Topic] ${cleanTitle}\n${roundLineEn}${profileLineEn}[Ticket ID] [${promptId}]\n[Ticket Path] ${display}`.trimEnd();

    const chosenPromptText = isZh ? promptCardTextZh : promptCardTextEn;
    writeLatestPrompt(chosenPromptText, cleanTitle, id);
    const clipOk = copyToClipboard(chosenPromptText);

    // 审计动作契约（v2.13）：to_lane=audit 时注入强制审计动作，提示词与接入桩同步。
    const auditContract = (String(fm.to_lane || '').toLowerCase() === 'audit')
      ? (isZh
          ? `\n（⚠️ 审计动作契约 · to_lane=audit）：审计方（[${toRole}]）**严禁仅静态读码**——必须在终端**独立执行**交接文档「验收判据」中的**所有测试与校验命令**，以实测输出为唯一准绳，**严禁采信自报**（执行方回执里的「已通过」一律视为待验证声明）。`
          : `\n(⚠️ Audit Action Contract · to_lane=audit): The auditor ([${toRole}]) MUST NOT merely read code statically — all verification and test commands in "Acceptance Criteria" MUST be executed independently in the terminal. Never rely on self-reported claims in the receipt.`)
      : '';

    if (isZh) {
      console.log(`📋 仓内交接 (${id}) · workspace=${ws}:`);
      console.log(`   主题: ${cleanTitle}`);
      console.log(`\n## 交接提示词\n`);
      console.log(`> 直接复制下方提示词，发送给接收方 Agent 接单：\n`);
      console.log(`\`\`\`text`);
      console.log(chosenPromptText);
      console.log(`\`\`\`\n`);
      if (clipOk) {
        console.log(`📋 [系统剪贴板已写入] 提示词已自动写入系统剪贴板，可随时在接收方窗口 Cmd+V / Ctrl+V 一键粘贴！`);
      }
      console.log(`📁 [提示词镜像固化] 已同步落盘至 .handoffs/.latest-prompt.txt\n`);
      console.log(`💡 [Agent 出站纪律] 当前 Agent 请将上述 \`\`\`text ... \`\`\` 代码块完整置于本次回复的最末尾（出站卡片后严禁附加任何客套话），供人类一键复制！\n`);
      if (ws === 'worktree') {
        const wtRel = path.join('.worktrees', id);
        console.log(`（发送方注 · 任务在专属工作树 ${wtRel} 物理隔离进行，切勿在主代码目录就地修改，验收完成后自动回收。）\n`);
      } else if (ws !== 'same') {
        console.log(`（发送方注 · 异工作区请先同步工作树。）\n`);
      } else {
        console.log(`（若已挂起后台监听，回执登记后状态机会自动感知唤醒发起方闭环。）\n`);
      }
      if (fm.audit_nonce) {
        console.log(`（一次性 Audit Nonce: ${fm.audit_nonce} · 提交回执请附带 --audit-nonce "${fm.audit_nonce}"）\n`);
      }
      if (fm.blind) {
        console.log(`（🔒 物理双盲审计模式已开启：思维链与自辩内容已脱敏，请严格基于客观契约与终端实测出具回执）\n`);
      }
      if (auditContract) console.log(auditContract);
    } else {
      console.log(`📋 Intra-Repo Baton (${id}) · workspace=${ws}:`);
      console.log(`   Title: ${cleanTitle}`);
      console.log(`\n## Baton Pass Prompt\n`);
      console.log(`> Copy the prompt below to pass to the receiver Agent:\n`);
      console.log(`\`\`\`text`);
      console.log(chosenPromptText);
      console.log(`\`\`\`\n`);
      if (clipOk) {
        console.log(`📋 [Copied to Clipboard] Prompt automatically copied to clipboard, ready for Cmd+V / Ctrl+V!`);
      }
      console.log(`📁 [Prompt Mirrored] Persisted to .handoffs/.latest-prompt.txt\n`);
      console.log(`💡 [Agent Outbound Rule] Current Agent MUST place the exact \`\`\`text ... \`\`\` block above at the very end of your response for one-click human relay!\n`);
      if (ws === 'worktree') {
        const wtRel = path.join('.worktrees', id);
        console.log(`(Sender note: task executes in isolated worktree ${wtRel}. Do not edit main directory directly.)\n`);
      } else if (ws !== 'same') {
        console.log(`(Sender note: separate workspace detected, please sync git tree first.)\n`);
      } else {
        console.log(`(If background listener is running, the state machine will automatically wake up upon receipt.)\n`);
      }
      if (fm.audit_nonce) {
        console.log(`(One-time Audit Nonce: ${fm.audit_nonce} · include --audit-nonce "${fm.audit_nonce}" in receipt)\n`);
      }
      if (fm.blind) {
        console.log(`(🔒 Double-Blind Audit Active: thinking & excuses sanitized; rely strictly on objective criteria and terminal tests)\n`);
      }
      if (auditContract) console.log(auditContract);
    }
    return;
  }

  // ── 方向自检（硬护栏）──
  // 调用者所在仓库 == 交接 target ⇒ 调用者就是接收方 ⇒ prompt 的产物会是
  // 「把这份交接转给你自己」，属事故，直接拦下并指明正确动作。
  const pTarget = readFM(content)?.target;
  const cwdRepo = detectRepo(process.cwd());
  if (cwdRepo && pTarget && cwdRepo === pTarget) {
    if (isZh) {
      console.error(
        `⛔ 方向错误：当前工作区就是 ${cwdRepo}，而你正要处理的是 target:${pTarget} 的交接——你就是接收方。\n` +
        `   prompt 是「发送方 → 转递给依赖方」的工具，用它等于把交接转给你自己\n` +
        `   （2026-09-01 SWOOP-20260901-02 事故即此）。\n\n` +
        `   正确动作：直接开工执行交接 → 完工写 receipts/${id}-resp.md → handoff receipt ${id}\n` +
        `   接收方处理交接：用自然语言「处理交接 ${id}」即可（读交接「给执行方」节 + RESPONSE-TEMPLATE.md 写回执）。`
      );
    } else {
      console.error(
        `⛔ Direction Error: Current workspace is ${cwdRepo}, but you are processing target:${pTarget} handoff — you are the receiver.\n` +
        `   prompt is for sender → pass to receiver. Running it passes the task to yourself.\n\n` +
        `   Correct action: execute the task → write receipts/${id}-resp.md → baton receipt ${id}\n` +
        `   Processing handoff: read handoff and follow RESPONSE-TEMPLATE.md to write receipt.`
      );
    }
    process.exit(3);
  }

  const targetLabel = pTarget ? (TARGET_LABELS[pTarget] || pTarget) : (isZh ? '依赖方' : 'dependency');
  const cleanTitle = sanitizeTaskTopic(title);
  const round = Number(readFM(content)?.round || 1);
  const roundLineZh = round > 1 ? `[任务轮次] Round ${round}（第 ${round} 轮复审）\n` : '';
  const roundLineEn = round > 1 ? `[Task Round] Round ${round} (Review Round ${round})\n` : '';
  const convId = readFM(content)?.conversation_id || getSessionId();
  const promptId = convId || id;

  const promptCardTextZh = `请 [${targetLabel}] 接单：\n[任务主题] ${cleanTitle}\n${roundLineZh}[工单编号] [${promptId}]\n[工单路径] ${display}`.trimEnd();
  const promptCardTextEn = `Please [${targetLabel}] take handoff:\n[Task Topic] ${cleanTitle}\n${roundLineEn}[Ticket ID] [${promptId}]\n[Ticket Path] ${display}`.trimEnd();
  const chosenPromptText = isZh ? promptCardTextZh : promptCardTextEn;
  writeLatestPrompt(chosenPromptText, cleanTitle, id);
  const clipOk = copyToClipboard(chosenPromptText);

  if (isZh) {
    console.log(`📋 跨仓交接 (${id}) · target=${pTarget || 'unknown'}:`);
    console.log(`   主题: ${cleanTitle}`);
    console.log(`\n## 交接提示词\n`);
    console.log(`> 直接复制下方提示词，发送给接收方 Agent 接单：\n`);
    console.log(`\`\`\`text`);
    console.log(chosenPromptText);
    console.log(`\`\`\`\n`);
    if (clipOk) {
      console.log(`📋 [系统剪贴板已写入] 提示词已自动写入系统剪贴板，可随时在接收方窗口 Cmd+V / Ctrl+V 一键粘贴！`);
    }
    console.log(`📁 [提示词镜像固化] 已同步落盘至 .handoffs/.latest-prompt.txt\n`);
    console.log(`💡 [Agent 出站纪律] 当前 Agent 请将上述 \`\`\`text ... \`\`\` 代码块完整置于本次回复的最末尾（出站卡片后严禁附加任何客套话），供人类一键复制！\n`);
    console.log(`（若已挂起后台监听，回执登记后状态机会自动感知唤醒发起方闭环。）\n`);
  } else {
    console.log(`📋 Cross-Repo Baton (${id}) · target=${pTarget || 'unknown'}:`);
    console.log(`   Title: ${cleanTitle}`);
    console.log(`\n## Baton Pass Prompt\n`);
    console.log(`> Copy the prompt below to pass to the receiver Agent:\n`);
    console.log(`\`\`\`text`);
    console.log(chosenPromptText);
    console.log(`\`\`\`\n`);
    if (clipOk) {
      console.log(`📋 [Copied to Clipboard] Prompt automatically copied to clipboard, ready for Cmd+V / Ctrl+V!`);
    }
    console.log(`📁 [Prompt Mirrored] Persisted to .handoffs/.latest-prompt.txt\n`);
    console.log(`💡 [Agent Outbound Rule] Current Agent MUST place the exact \`\`\`text ... \`\`\` block above at the very end of your response for one-click human relay!\n`);
    console.log(`(If background listener is running, the state machine will automatically wake up upon receipt.)\n`);
  }
}

function cmdInstall(args) {
  const home = process.env.HOME;
  const targets = [];
  if (!args.includes('--global')) {
    for (const f of ['AGENTS.md', 'CLAUDE.md']) targets.push(path.join(process.cwd(), f));
    if (fs.existsSync(path.join(process.cwd(), 'GEMINI.md'))) {
      targets.push(path.join(process.cwd(), 'GEMINI.md'));
    }
    if (fs.existsSync(path.join(process.cwd(), 'CODEBUDDY.md')) || args.includes('--codebuddy')) {
      targets.push(path.join(process.cwd(), 'CODEBUDDY.md'));
    }
    if (fs.existsSync(path.join(process.cwd(), '.cursorrules')) || args.includes('--cursor')) {
      targets.push(path.join(process.cwd(), '.cursorrules'));
    }
    if (fs.existsSync(path.join(process.cwd(), '.github/copilot-instructions.md')) || args.includes('--copilot')) {
      targets.push(path.join(process.cwd(), '.github/copilot-instructions.md'));
    }
  }
  if (!args.includes('--project')) {
    targets.push(path.join(home, '.claude/CLAUDE.md'), path.join(home, '.config/opencode/AGENTS.md'));
    if (home) {
      targets.push(path.join(home, '.workbuddy/MEMORY.md'));
      targets.push(path.join(home, '.CODEBUDDY.md'));
    }
  }
  // include README if requested or default (v2.12)；--global 只装全局，不写 cwd README（F3）
  if (!args.includes('--no-readme') && !args.includes('--global')) {
    targets.push(path.join(process.cwd(), 'README.md'));
  }
  let changed = 0;
  let warned = 0;
  // 只装 prose 接入桩；/ 命令别名已于 v2.8 修订废除，不再写入任何 command 文件。
  for (const t of [...new Set(targets)]) {
    let c = '';
    try { c = fs.readFileSync(t, 'utf8'); } catch {}
    const regions = scanStub(c);
    if (regions.length) {
      // 剥掉全部历史/重复桩区块后，只落一份规范桩（幂等 + 去重修复）。
      // 仅在「被删区块的接缝」处规范化空行，保留用户其它排版（F4）。
      const re = (c.match(STUB_MARKER_RE) || []).length ? STUB_MARKER_RE : STUB_HEADING_RE;
      const cleaned = c.split(re)
        .map(p => p.replace(/^\n+/, '').replace(/\s+$/, ''))
        .filter(Boolean)
        .join('\n\n');
      const langArg = flagValue(args, '--lang');
      const lang = (langArg && langArg.toLowerCase().startsWith('zh')) ? 'zh' : (langArg ? 'en' : detectLang());
      const activeStubBlock = (lang === 'zh') ? STUB_BLOCK_ZH : STUB_BLOCK_EN;
      const next = (cleaned ? cleaned + '\n\n' : '') + activeStubBlock + '\n';
      if (next === c) { console.log(`↩️ 已是最新: ${t}`); continue; }
      if (!safeWrite(t, next)) { warned++; continue; }
      changed++;
      console.log(regions.length > 1 ? `🧹 去重 + 更新桩（原 ${regions.length} 份 → 1）: ${t}` : `🔁 桩已更新: ${t}`);
      continue;
    }
    if (c.includes('handoffs/README.md')) {
      // 手写指针（含 hub README 引用）但无标准桩标记 → install 无法刷新它，
      // 会随契约升版静默漂移（只能人工手改版本号）。告警而非静默跳过。
      console.log(`⚠️ 跳过（手写指针，无标准桩标记）: ${t}`);
      console.log(`   含 handoffs/README.md 但缺 ${STUB_BEGIN} → install 不会刷新它。`);
      console.log(`   对齐方法：用 $(lab path handoffs)/README.md 「接入桩」段的标准桩替换手写段，再跑 install（幂等）。`);
      warned++;
      continue;
    }
    const langArg = flagValue(args, '--lang');
    const lang = (langArg && langArg.toLowerCase().startsWith('zh')) ? 'zh' : (langArg ? 'en' : detectLang());
    const activeStubBlock = (lang === 'zh') ? STUB_BLOCK_ZH : STUB_BLOCK_EN;
    if (!safeWrite(t, (c ? c.replace(/\n*$/, '\n\n') : '') + activeStubBlock + '\n')) { warned++; continue; }
    changed++;
    console.log(`✅ 已写入桩: ${t}`);
  }
  if (changed) console.log(`完成（${changed} 个文件）。可重复执行，幂等。`);
  else if (warned) console.log(`无需变更，但 ${warned} 个文件为手写指针（见上告警），建议对齐标准桩。`);
  else console.log('全部无需变更。');
}

/** `handoff` 命令接入 PATH（幂等自愈 · v2.12.4 热修批次八）。
 *
 * 病根：v2.8 废除 / 别名时把 command shim 一并拆除，但文档与接入桩大量使用裸
 * `handoff <op>` 写法 → 消费方照敲即 `command not found: handoff`（2026-10-19 实报）。
 * 根修不是把文档改回全路径迁就「没有命令」，而是让裸命令真实存在——且必须是
 * **指向中央引擎的符号链接**（非副本）：引擎热修零传播、零版本漂移，与既有
 * 「无全局 bin、全部按路径调中央引擎」的审计结论兼容。
 *
 * 落点：优先 ~/.local/bin（在 PATH 且用户可写，无 sudo）；否则取 PATH 中第一个
 * home 下可写目录（跳过 .workbuddy/.nvm/.cargo 等受管运行时）；再不行则创建
 * ~/.local/bin 并提示加入 shell profile。绝不写 /Applications、/System、/Library、
 * /usr/local/bin（需 sudo 的系统/应用领地）。 */
function cmdLink(args) {
  const engine = fs.realpathSync(process.argv[1]);
  const remove = args.includes('--remove');
  const checkOnly = args.includes('--check');
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const canonicalDir = process.platform === 'win32'
    ? path.join(home, 'AppData', 'Roaming', 'npm')
    : path.join(home, '.local', 'bin');
  const canonical = path.join(canonicalDir, 'handoff');
  const inPath = (d) => String(process.env.PATH || '').split(path.delimiter).filter(Boolean).includes(d);
  const writable = (d) => { try { fs.accessSync(d, fs.constants.W_OK); return true; } catch { return false; } };

  // 选落点
  let dir = null;
  if (inPath(canonicalDir)) {
    try { fs.mkdirSync(canonicalDir, { recursive: true }); } catch {}
    if (writable(canonicalDir)) dir = canonicalDir;
  }
  if (!dir) {
    for (const d of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
      if (!d.startsWith(home + path.sep)) continue;                                   // 只认 home 下目录
      if (/[\\/]\.(workbuddy|nvm|cargo|swiftly|antigravity)[\\/]/.test(d + path.sep)) continue;   // 不污染受管运行时
      try { if (fs.statSync(d).isDirectory() && writable(d)) { dir = d; break; } } catch {}
    }
  }
  if (!dir) {
    dir = canonicalDir;
  }

  // --check：健康检查（桩版本一致性 + shim 校验，可由 baton link --check 或 baton doctor 调用）
  if (checkOnly) {
    let ok = true;
    console.log(`🔍 [Baton 诊断] 引擎版本: v${BATON_VERSION}`);
    const vPath = path.join(SCRIPT_ROOT, 'VERSION.md');
    if (fs.existsSync(vPath)) {
      const vContent = fs.readFileSync(vPath, 'utf8').trim().split('\n')[0];
      const vm = vContent.match(/v?(\d+\.\d+\.\d+)/);
      if (vm && vm[1] !== BATON_VERSION) {
        console.error(`❌ [事实源漂移] VERSION.md (v${vm[1]}) ≠ 引擎版本 (v${BATON_VERSION})！`);
        ok = false;
      } else if (vm) {
        console.log(`✅ [事实源对账] VERSION.md (v${vm[1]}) == 引擎版本 (v${BATON_VERSION})`);
      }
    }
    for (const binName of ['baton', 'handoff']) {
      const p = path.join(dir, binName);
      const pCmd = path.join(dir, `${binName}.cmd`);
      try {
        if (process.platform === 'win32' && fs.existsSync(pCmd)) {
          console.log(`✅ [Shim 正常] ${pCmd} → ${engine}`);
        } else if (fs.lstatSync(p).isSymbolicLink() && fs.realpathSync(p) === engine) {
          console.log(`✅ [Shim 正常] ${p} → ${engine}`);
        } else {
          console.log(`⚠️ [Shim 需同步] ${p} 未指向本引擎`);
        }
      } catch {
        console.log(`ℹ️ [Shim 未创建] ${p}`);
      }
    }
    const checkTargets = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md']
      .map(f => path.join(process.cwd(), f))
      .filter(f => fs.existsSync(f));
    let stubChecked = 0;
    for (const t of checkTargets) {
      const content = fs.readFileSync(t, 'utf8');
      const stubMatch = content.match(/<!-- handoff-stub:v\d+(?:\.\d+)? begin -->([\s\S]*?)<!-- handoff-stub:v\d+(?:\.\d+)? end -->/);
      const targetContent = stubMatch ? stubMatch[1] : content;
      const m = targetContent.match(/契约 v(\d+\.\d+\.\d+)/) || targetContent.match(/Contract v(\d+\.\d+\.\d+)/);
      if (m) {
        stubChecked++;
        const stubVer = m[1];
        if (stubVer === BATON_VERSION) {
          console.log(`✅ [桩版本一致] ${path.basename(t)}: 桩版本 == 引擎版本 (v${stubVer})`);
        } else {
          console.error(`❌ [桩版本漂移] ${path.basename(t)}: 桩版本 (v${stubVer}) ≠ 引擎版本 (v${BATON_VERSION})！`);
          ok = false;
        }
      }
    }
    if (stubChecked > 0 && ok) {
      console.log(`🎉 判定结果: 桩版本 == 引擎版本 (v${BATON_VERSION})`);
      process.exit(0);
    } else if (!ok) {
      console.error(`❌ 判定结果: 检测到桩版本与引擎版本不一致，请运行 baton link 或 baton install 自动同步。`);
      process.exit(1);
    } else {
      console.log(`ℹ️ 当前目录未发现接入桩，跳过桩版本判定。`);
      process.exit(0);
    }
  }

  // --remove：摘除 shim（测试/回退用）
  if (remove) {
    let removed = false;
    for (const d of [canonicalDir, ...String(process.env.PATH || '').split(path.delimiter).filter(Boolean)]) {
      for (const binName of ['handoff', 'baton']) {
        for (const ext of ['', '.cmd', '.ps1']) {
          const p = path.join(d, binName + ext);
          try {
            if (fs.existsSync(p)) {
              fs.unlinkSync(p);
              console.log(`🗑️ 已摘除: ${p}`);
              removed = true;
            }
          } catch { /* 不存在或无权限 → 跳过 */ }
        }
      }
    }
    if (!removed) console.log('未找到指向中央引擎的 handoff/baton shim，无需摘除。');
    return;
  }

  // 引擎须可执行（shebang 已在；缺执行位时补上，否则 symlink 也无法运行）
  try { fs.chmodSync(engine, 0o755); } catch {}

  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  if (!inPath(dir)) {
    if (process.platform === 'win32') {
      console.log(`⚠️ ${dir} 不在当前 PATH —— 请将该目录加入系统环境变量 PATH。`);
    } else {
      console.log(`⚠️ ${dir} 不在当前 PATH —— 请把它加入 shell profile，例如: echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc`);
    }
  }

  for (const binName of ['handoff', 'baton']) {
    const link = path.join(dir, binName);
    const linkCmd = path.join(dir, `${binName}.cmd`);
    const linkPs1 = path.join(dir, `${binName}.ps1`);

    // Windows 平台专属：生成 .cmd 与 .ps1 shim（免除管理员权限与 Developer Mode 限制，直接原生兼容 CMD 与 PowerShell）
    if (process.platform === 'win32') {
      try {
        const cmdScript = `@ECHO off\r\nnode "${engine}" %*\r\n`;
        fs.writeFileSync(linkCmd, cmdScript, 'utf8');
        const ps1Script = `& node "${engine}" $args\r\n`;
        fs.writeFileSync(linkPs1, ps1Script, 'utf8');
        console.log(`✅ 已接入 (Windows Shim): ${linkCmd} & ${linkPs1} → ${engine}`);
      } catch (e) {
        console.error(`⚠️ 写入 Windows Shim 失败: ${e.message}`);
      }
    }

    try {
      const st = fs.lstatSync(link);
      if (st.isSymbolicLink()) {
        if (fs.realpathSync(link) === engine) {
          console.log(`↩️ 已是最新: ${link} → ${engine}`);
          verifyLink(link, binName);
          continue;
        }
        fs.unlinkSync(link);
        console.log(`🔁 原 shim 指向 ${fs.realpathSync(link)}（非中央引擎），改指: ${engine}`);
      } else {
        const bak = `${link}.bak-${todayISO()}`;
        fs.renameSync(link, bak);
        console.log(`📦 ${link} 是普通文件（非符号链接），已备份为 ${bak} 后重建为 shim。`);
      }
    } catch { /* 不存在 → 直接建 */ }

    try {
      fs.symlinkSync(engine, link);
      console.log(`✅ 已接入: ${link} → ${engine}`);
      verifyLink(link, binName);
    } catch (e) {
      if (process.platform === 'win32') {
        // Windows 上若无 symlink 权限（未开启开发者模式），上面生成的 .cmd/.ps1 已可正常使用
        console.log(`ℹ️ [Windows 提示] symlink 权限受限，已通过 .cmd/.ps1 脚本提供无权限依赖的命令访问。`);
      } else {
        console.error(`⚠️ 创建软链接失败: ${e.message}`);
      }
    }
  }

  // 检查接入桩版本，若有漂移则自动重生成
  const projectTargets = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md']
    .map(f => path.join(process.cwd(), f))
    .filter(f => fs.existsSync(f));
  let hasDrift = false;
  for (const t of projectTargets) {
    const content = fs.readFileSync(t, 'utf8');
    const stubMatch = content.match(/<!-- handoff-stub:v\d+(?:\.\d+)? begin -->([\s\S]*?)<!-- handoff-stub:v\d+(?:\.\d+)? end -->/);
    const targetContent = stubMatch ? stubMatch[1] : content;
    const m = targetContent.match(/契约 v(\d+\.\d+\.\d+)/) || targetContent.match(/Contract v(\d+\.\d+\.\d+)/);
    if (m && m[1] !== BATON_VERSION) {
      hasDrift = true;
      break;
    }
  }
  if (hasDrift) {
    console.log(`🔁 [自动重生成] 检测到当前工作区接入桩版本与引擎不一致，正在自动同步...`);
    cmdInstall(['--project']);
  }
}
function verifyLink(link, binName = 'handoff') {
  try {
    const targetBin = (process.platform === 'win32' && !link.endsWith('.cmd') && fs.existsSync(`${link}.cmd`))
      ? `${link}.cmd`
      : link;
    execFileSync(targetBin, [], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    console.log(`   验证通过: \`${binName}\` 可直接调用（裸命令即中央引擎）。`);
  } catch (e) {
    if (process.platform === 'win32') {
      console.log(`   验证提示: \`${binName}\` 已生成 Windows 启动脚本（可直接在 CMD/PowerShell 运行）。`);
    } else {
      console.error(`⚠️ shim 已建但验证调用失败: ${e.message}`);
    }
  }
}

/** PATH 中解析可执行命令（跨平台支持：Windows 扩展名与 PATHEXT，Unix 可执行权限位）。 */
function whichBin(binName) {
  const isWin = process.platform === 'win32';
  const exts = isWin
    ? (process.env.PATHEXT ? process.env.PATHEXT.split(';').map(e => e.toLowerCase()) : ['.cmd', '.bat', '.ps1', '.exe', ''])
    : [''];
  if (isWin && !exts.includes('')) exts.push('');

  for (const d of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const p = path.join(d, binName + ext);
      try {
        const st = fs.statSync(p);
        if (st.isFile()) {
          if (isWin || fs.accessSync(p, fs.constants.X_OK) === undefined) {
            return p;
          }
        }
      } catch {}
    }
  }
  return null;
}

/** 判定二进制路径或脚本是否实际解析/指向中央引擎。
 * 兼容符号链接、Windows .cmd/.ps1 启动脚本、以及路径大小写不敏感匹配。
 */
function resolvesToEngine(binPath, engine) {
  if (!binPath || !engine) return false;
  try {
    const real = fs.realpathSync(binPath);
    if (path.normalize(real).toLowerCase() === path.normalize(engine).toLowerCase()) return true;
  } catch {}

  // Windows 下针对 .cmd / .ps1 / shell shim 文本内容的检测
  if (process.platform === 'win32' || binPath.endsWith('.cmd') || binPath.endsWith('.ps1')) {
    try {
      const content = fs.readFileSync(binPath, 'utf8');
      const normEngine = path.normalize(engine).toLowerCase();
      const normContent = path.normalize(content).toLowerCase();
      if (normContent.includes(normEngine)) return true;
    } catch {}
  }
  return false;
}

/** CLI 可达性门禁（ADR-0008 & 韧性收敛）：主命令 `baton` 或兼容别名 `handoff` 必须可用且指向中央引擎。
 *
 * 门禁哲学与防阻断守卫：
 * 1. 主命令为 baton，兼容别名为 handoff。若两者均指向中央引擎，静默通过。
 * 2. 若 baton 正常指向中央引擎，而 handoff 别名指向外部软件目录（如 WorkBuddy node 目录）或不在 PATH，
 *    由于当前主链路完全通畅，仅作为 ⚠️ warning 告警并给出建议自愈命令，严禁硬阻断 check（避免逼迫 Agent 越权修改外部全局环境）。
 * 3. 若 handoff 正常指向中央引擎而 baton 异常，同理仅降级为 ⚠️ warning。
 * 4. 仅当 baton 与 handoff 两者均无法解析到中央引擎时，才记录阻塞性 problem（exit 1）。
 */
function checkCliReachable(problems, warnings) {
  let engine;
  try { engine = fs.realpathSync(process.argv[1]); } catch { return; }

  const batonPath = whichBin('baton');
  const handoffPath = whichBin('handoff');

  const batonOk = batonPath && resolvesToEngine(batonPath, engine);
  const handoffOk = handoffPath && resolvesToEngine(handoffPath, engine);

  if (batonOk && handoffOk) {
    return;
  }

  // 只要至少有一个正常，就不阻断 check，仅输出 warning 提示修复别名
  if (batonOk || handoffOk) {
    if (!batonOk) {
      if (batonPath) {
        let real = null;
        try { real = fs.realpathSync(batonPath); } catch {}
        warnings.push(`[CLI] baton(${batonPath}) 指向 ${real || '失效目标'} ≠ 中央引擎(${engine})，但 handoff 别名正常可用 → 可选修复: node "${engine}" link`);
      } else {
        warnings.push(`[CLI] 裸 baton 命令不在 PATH，但 handoff 别名正常可用 → 可选修复: node "${engine}" link`);
      }
    }
    if (!handoffOk) {
      if (handoffPath) {
        let real = null;
        try { real = fs.realpathSync(handoffPath); } catch {}
        warnings.push(`[CLI] handoff 别名(${handoffPath}) 指向 ${real || '失效目标'} ≠ 中央引擎(${engine})，但 baton 主命令正常可用 → 可选修复: node "${engine}" link`);
      } else {
        warnings.push(`[CLI] 裸 handoff 别名不在 PATH，但 baton 主命令正常可用 → 可选修复: node "${engine}" link`);
      }
    }
    return;
  }

  // 两者都不可用，检查是否本地 canonical 存在但未加 PATH
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const canonicalDir = process.platform === 'win32'
    ? path.join(home, 'AppData', 'Roaming', 'npm')
    : path.join(home, '.local', 'bin');
  const canonicalBaton = path.join(canonicalDir, process.platform === 'win32' ? 'baton.cmd' : 'baton');
  const canonicalHandoff = path.join(canonicalDir, process.platform === 'win32' ? 'handoff.cmd' : 'handoff');

  if ((fs.existsSync(canonicalBaton) && resolvesToEngine(canonicalBaton, engine)) ||
      (fs.existsSync(canonicalHandoff) && resolvesToEngine(canonicalHandoff, engine))) {
    warnings.push(`[CLI] shim 存在于 ${canonicalDir} 但当前 PATH 解析不到 → 请将 ${canonicalDir} 加入 shell profile 或系统环境变量 PATH`);
    return;
  }

  problems.push(`[CLI] 裸 baton 与 handoff 命令均无法解析到中央引擎(${engine}) → 自愈: node "${engine}" link`);
}

function cmdBrief(args) {
  if (MODE === 'intra-repo') { console.log('仓内模式无 inbox 转递概念（brief 仅用于跨仓 lab Hub）。'); return; }
  const only = args.find(a => !a.startsWith('-'));
  const I_DIR = path.join(ROOT, 'inbox');
  fs.mkdirSync(I_DIR, { recursive: true });
  const rows = [];
  for (const f of listMdFiles(H_DIR, H_RE)) {
    const raw = fs.readFileSync(path.join(H_DIR, f), 'utf8');
    const fm = readFM(raw);
    if (!fm || (fm.status !== 'draft' && fm.status !== 'forwarded')) continue;
    if (only && fm.target !== only.toLowerCase()) continue;
    rows.push({ id: fm.handoff_id, target: fm.target, title: extractTitle(stripFM(raw)) });
  }
  const targets = [...new Set(rows.map(r => r.target))];
  // v2.12.5：draft+forwarded 都收——① 仅收 draft 时，按 new→forward→brief 顺序跑的发起方会拿到空收件箱；
  // ② 驳回退回（status=forwarded）的返工单也必须重新出现在收件箱，否则执行方看不到退回理由的转递。
  if (!targets.length) { console.log('没有待办的交接（status=draft/forwarded）'); return; }
  for (const t of targets) {
    const items = rows.filter(r => r.target === t);
    // IGGLE-* = 反向发现（Swoop/Prospero → iggle），接收方 iggle 需适配本仓；
    // 其余 target = iggle → 依赖方，依赖方 agent 写回执、不改 iggle。
    // intro 不猜发送方（2026-10-18 批次七修）：旧写法「由依赖方发起」/「由 iggle 发起」二选一都写死了 iggle 枢纽，
    // hub 直接发起的 IGGLE-* 会被误印成「由依赖方发起，需你方适配」。发送方以交接 frontmatter / 转递话术为准。
    const reverse = t === 'iggle';
    const intro = reverse
      ? '以下交接接收方是你方（iggle），需适配本仓（发送方以交接 frontmatter / 转递话术为准）：'
      : '以下交接等待你方处理（发送方以交接 frontmatter / 转递话术为准）：';
    const req = reverse
      ? [
          '## 处理要求',
          `- 交接文档（必读）：${path.join(SCRIPT_ROOT, 'handoffs', '<ID>.md')}`,
          `- 适配本仓后回执写到：${path.join(SCRIPT_ROOT, 'receipts', '<ID>-resp.md')}（frontmatter 四字段 handoff_id / from_repo / to_repo / date）`,
          '- **执行方不 accept/reject**（只交回执 `handoff receipt <ID>`）；发起方收回执=审计，通过才闭环，不过则 reject 退回。',
          '',
        ]
      : [
          '## 处理要求',
          '- 回执规范（必读）：$(lab path handoffs)/RESPONSE-TEMPLATE.md',
          `- 完成后回执写到：${path.join(SCRIPT_ROOT, 'receipts', '<ID>-resp.md')}`,
          '- 禁止修改对方仓任何文件（只读排查定位行号）；用户是唯一转递通道。',
          '',
        ];
    const lines = [
      `# ${t} 收件箱（自动生成于 ${todayISO()} · 勿手编，由 handoff brief 重建）`,
      '',
      intro,
      '',
      ...items.flatMap(i => [`## ${i.id}`, '', `- 主题：${i.title}`, `- 文档：${path.join(SCRIPT_ROOT, 'handoffs', `${i.id}.md`)}`, '']),
      ...req,
    ];
    fs.writeFileSync(path.join(I_DIR, `${t}.md`), lines.join('\n'));
    console.log(`📥 inbox/${t}.md ← ${items.map(i => i.id).join(', ')}`);
  }
  console.log('\n转递话术（复制给对应 Agent，固定一句话）:');
  for (const t of targets) console.log(`  → ${t}: 把 inbox/${t}.md 里的交接路径交给对方，说「请 ${t} 收交接 <路径>」（旧式「处理交接 <路径>」亦可；或让对方跑 \`handoff status --for ${t}\` 取实时待办后读 handoffs/<ID>.md）`);
}

function cmdSync() {
  if (MODE === 'intra-repo') { console.log('仓内模式无 sync（sync 为跨仓 lab Hub 自动登记回执）。'); return; }
  let n = 0;
  for (const f of listMdFiles(R_DIR, R_RE)) {
    const rf = readFM(fs.readFileSync(path.join(R_DIR, f), 'utf8'));
    if (!rf?.handoff_id) continue;
    const hp = path.join(H_DIR, `${rf.handoff_id}.md`);
    if (!fs.existsSync(hp)) continue;
    const hfm = readFM(fs.readFileSync(hp, 'utf8'));
    if (hfm.status !== 'draft' && hfm.status !== 'forwarded') continue;
    setFM(hp, { status: 'received', ...(typeof rf.needs_iggle_change === 'boolean' ? { needs_iggle_change: rf.needs_iggle_change } : {}) });
    console.log(`🔄 ${rf.handoff_id} → received（回执自动登记）`);
    n++;
  }
  console.log(n ? `sync 完成：${n} 项。` : '无需同步：所有回执均已登记。');
}

/** 版本失效回流（ZSpec ④）。
 *
 * ZSpec 的版本控制回流思想 = 区分 common 与平台版本，只对真正受影响的 Unit 失效：
 * - `--common`        ：共享版本变更 → 全员（所有未闭环交接）标 needs_iggle_change。
 * - `--platform <p>`  ：某平台专属版本变更 → 仅该平台下游（target == p 的未闭环交接）标 needs_iggle_change，
 *                       不波及其它平台 / common。
 * 已闭环（closed）的交接不标（结论已锁，无需重对）。 */
function cmdDrift(args) {
  if (MODE === 'intra-repo') { console.log('仓内模式无 drift（版本失效回流为跨仓概念）。'); return; }
  const common = args.includes('--common');
  const pIdx = args.indexOf('--platform');
  const platform = pIdx !== -1 ? args[pIdx + 1]?.toLowerCase() : undefined;
  if (!common && !platform) {
    console.error(`用法: handoff drift --common | handoff drift --platform <${[...TARGETS].join('|')}>`);
    process.exit(2);
  }
  if (common && platform) { console.error('只能指定一个维度：--common 或 --platform <name>'); process.exit(2); }
  if (platform && !TARGETS.has(platform)) { console.error(`--platform 必须是 ${[...TARGETS].join(' / ')}`); process.exit(2); }
  let marked = 0, skipped = 0;
  for (const f of listMdFiles(H_DIR, H_RE)) {
    const p = path.join(H_DIR, f);
    const fm = readFM(fs.readFileSync(p, 'utf8'));
    if (!fm || fm.status === 'closed') continue;
    const affected = common ? true : (fm.target === platform);
    if (affected) {
      setFM(p, { needs_iggle_change: true, version_drift: common ? 'common' : `platform:${platform}` });
      marked++;
      console.log(`  ↳ ${fm.handoff_id} → needs_iggle_change=true（维度：${common ? 'common' : 'platform=' + platform}）`);
    } else {
      skipped++;
    }
  }
  if (marked === 0 && skipped === 0) console.log('没有未闭环交接，无需回流。');
  else console.log(`✅ 失效回流完成：${marked} 份未闭环交接被标记需改动（${skipped} 份未受影响）。`);
}

/** 仓内模式初始化：在项目根生成 `.handoffs/`（子 Hub） + `.handoff-hub.json`（配置）。
 *
 * 与 lab Hub 的「不属于任何仓库」相反：仓内子 Hub 随代码走（提交进 git），
 * 因仓内双方同属一仓，「依赖方越界写入」的约束不存在（提案 §4.2）。 */
// 仓内接入桩（init 时生成 .handoffs/README.md）：教新项目 Agent 写转递/回执提示词的统一标准。
// 只放指针，不复制细则——真相源在 $(lab path handoffs)/（README 契约 + RESPONSE-TEMPLATE.md + handoff.mjs 的 prompt 模板）。
// 教训（RESPONSE-TEMPLATE.md 历史教训一）：凡要求 agent 产出固定文本，必须放进「可直接复制」的骨架/桩里，只写散文 = 没有。
const INTRA_README_TEMPLATE = `# 仓内交接子 Hub（intra-repo · <PROJECT>）

> 指针桩：命令语义与格式细则以 \`$(lab path handoffs)/\` 契约为单一来源，此处不复制细则。

## 一句话规则
- **lane**：<LANES>（接收通道 = 回执撰写方 = 交接文件名前缀）。
- **workspace 默认**：<WS_DEFAULT>。同工作区 = 共享工作树就地修改；异工作区才需先同步工作树。
- **一切操作只走 CLI**：\`handoff <new|show|forward|receipt|status|prompt|check|accept|reject>\`（若报 command not found 跑 handoff link 自愈；仓内无 install/sync/brief/open）。

## 生命周期
\`draft → forwarded → received → closed\`，frontmatter.status 是唯一真相源。
1. 发起：\`handoff new <lane> <type> "<标题>"\`（type: <TYPES>）。
2. 转递：\`handoff forward <ID>\`。
3. 回执：接收方写 \`receipts/<ID>-resp.md\`（frontmatter: handoff_id / mode / from_lane / to_lane / needs_change / date）→ \`handoff receipt <ID> [--needs-change]\`。
4. 闭环：**执行方不 accept/reject**；发起 lane 收回执=审计，通过后 \`handoff accept <ID> -n "<验收结论>"\`，不过用 \`handoff reject <ID> -n "<驳回理由>"\` 退回。
   - \`close_policy=self\`（\`.handoff-hub.json\`）时，\`continuation\` 由**后继会话**（to_lane）闭环：\`handoff accept <ID> -n "<验收结论>" --by <to_lane>\`（硬校验，缺/错 --by 即拒绝）。默认 \`sender\` 由发起 lane 闭环，\`--by\` 可选。

## 转递 / 回执提示词（统一标准 · 不要手写）
- **同工作区（workspace=same，默认）**：**出站任务转递免**（共享工作树，不搬）⇒ \`handoff prompt\` 此步跳过；**但收尾必须写清「接下来谁接手」**——对方是谁 + 对方要做什么 + 我这边是否还有待办（v2.22.0：**禁用「无需转递」这类无主语缩写**）；**回执仍须含「## 转递提示词」节**（回执交付行不豁免，仅 \`COREML-*\` 免）。归属只看 frontmatter，**严禁用 mtime 推断**。
- **异工作区**：转递提示词用 \`handoff prompt <ID>\` 生成（真相源在 Hub 侧 handoff.mjs，一行式），不手写、不复制到仓侧。
- **回执**：写法与结尾话术单一来源在 \`$(lab path handoffs)/RESPONSE-TEMPLATE.md\`；仓内回执仅需 frontmatter 五字段 + 结论，跨仓专属节（是否需 iggle 改动 / 部署钉值）不适用。

## 硬门禁
- 收尾：\`handoff check\` 必须 exit 0，否则任务不算完成。
- 待办：接收方 \`handoff status --for <lane>\`；发起方裸 \`handoff status\`（MUST NOT 扫描 handoffs/）。
`;

function cmdInit(args) {
  let repoRoot = process.cwd();
  const ri = args.indexOf('--root');
  if (ri !== -1 && args[ri + 1]) repoRoot = args[ri + 1];
  const hubRoot = path.join(repoRoot, '.handoffs');
  const cfgPath = path.join(hubRoot, '.handoff-hub.json');
  if (fs.existsSync(cfgPath)) { console.error(`仓内子 Hub 已存在: ${cfgPath}`); process.exit(1); }
  const getArg = (flag, dflt) => { const i = args.indexOf(flag); return (i !== -1 && args[i + 1]) ? args[i + 1] : dflt; };
  const lanes = getArg('--lanes', 'impl,audit').split(',').map(s => s.trim()).filter(Boolean);
  const types = getArg('--types', 'task,bug,feature,question,continuation').split(',').map(s => s.trim()).filter(Boolean);
  const project = getArg('--project', path.basename(repoRoot)).toLowerCase();
  const targetArg = getArg('--targets', '');
  const initTargets = new Set(
    targetArg ? targetArg.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : []
  );
  // 防串味：lane 名不得与跨仓 TARGET 撞名
  for (const l of lanes) if (initTargets.has(l.toLowerCase())) {
    console.error(`lane 名「${l}」与跨仓 TARGET 撞名，请改用其它 lane 名`);
    process.exit(2);
  }
  const cfg = {
    mode: 'intra-repo',
    project,
    lanes,
    types,
    workspace_default: 'same',
    close_policy: 'sender',
    ...(initTargets.size ? { targets: [...initTargets] } : {}),
  };
  fs.mkdirSync(path.join(hubRoot, 'handoffs'), { recursive: true });
  fs.mkdirSync(path.join(hubRoot, 'receipts'), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  // 接入桩：教新项目 Agent 写转递/回执提示词的统一标准（指针，不复制细则）
  const readme = INTRA_README_TEMPLATE
    .replaceAll('<PROJECT>', project)
    .replaceAll('<LANES>', lanes.join(' / '))
    .replaceAll('<WS_DEFAULT>', cfg.workspace_default)
    .replaceAll('<TYPES>', cfg.types.join(' / '));
  fs.writeFileSync(path.join(hubRoot, 'README.md'), readme, 'utf8');
  console.log(`✅ 已初始化仓内子 Hub: ${hubRoot}`);
  console.log(`   配置: ${cfgPath}`);
  console.log(`   接入桩: ${path.join(hubRoot, 'README.md')}`);
  console.log(`   lanes=${lanes.join('/')}  types=${types.join('/')}  workspace_default=${cfg.workspace_default}`);
  console.log(`   下一步: handoff new <lane> <type> "<标题>"`);
}

// 仓内 import：扫描旧 handoffs 目录，best-effort 分类，生成只读 STATUS.md（非搬移、非重写存量）。
// 默认 draft-only：仅文件名含 VERDICT/COMPLETE 才标 closed 候选，其余一律 draft；无法归类进「未判定」交人工。
// 依据提案 §12 迁移路径第 2 条：存量不重写、旧目录保留归档、STATUS.md 为生成物（非权威快照）。
function classifyIntraImport(file) {
  const base = file.replace(/\.md$/, '');
  const isResp = /-resp($|-)/i.test(base) || /^(RECEIPT|RESPONSE|ACCEPT)[-_]/i.test(base);
  const isHandoff = /^HANDOFF[-_]/i.test(base) && !isResp;
  const isAudit = /^(AUDIT|VERDICT)[-_]/i.test(base);
  const isClosed = /(COMPLETE|VERDICT)/i.test(base);
  let kind;
  if (isResp) kind = '回执';
  else if (isHandoff) kind = '交接';
  else if (isAudit) kind = '审计';
  else kind = '未判定';
  return { file, kind, status: isClosed ? 'closed候选' : 'draft' };
}

function cmdImport(args) {
  if (MODE !== 'intra-repo') { console.error('import 仅仓内模式可用（需 .handoff-hub.json）'); process.exit(2); }
  const fromIdx = args.indexOf('--from');
  const from = fromIdx !== -1 ? args[fromIdx + 1] : null;
  if (!from) { console.error('用法: handoff import --from <dir>'); process.exit(2); }
  const dir = path.resolve(from);
  if (!fs.existsSync(dir)) { console.error('目录不存在: ' + dir); process.exit(1); }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  if (!files.length) { console.log('无 .md 文件: ' + dir); return; }
  const rows = files.map(classifyIntraImport);
  const byKind = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
  const closed = rows.filter(r => r.status === 'closed候选').length;

  const lines = [];
  lines.push(`# STATUS.md（只读快照 · 非权威 · 生成于 ${todayISO()}）`);
  lines.push('');
  lines.push('> 由 `handoff import --from <dir>` 生成。旧目录保留归档、存量文件未被改动；本快照仅供人类快速浏览，');
  lines.push('> 权威真相源 = .handoffs/handoffs/ 与 .handoffs/receipts/ 的 frontmatter（新交接才走状态机）。');
  lines.push('');
  lines.push('## 统计');
  lines.push(`- 扫描：${files.length} 个文件（${dir}）`);
  for (const k of ['交接', '回执', '审计', '未判定']) {
    if (byKind[k]) lines.push(`- ${k}：${byKind[k]}`);
  }
  lines.push(`- closed 候选（文件名含 VERDICT/COMPLETE）：${closed}`);
  lines.push('');
  const sections = [
    ['交接', r => r.kind === '交接'],
    ['回执', r => r.kind === '回执'],
    ['审计', r => r.kind === '审计'],
    ['未判定（人工）', r => r.kind === '未判定'],
  ];
  for (const [title, pred] of sections) {
    const list = rows.filter(pred);
    lines.push(`## ${title}（${list.length}）`);
    if (!list.length) lines.push('（无）');
    else {
      lines.push('| 文件 | 状态 |');
      lines.push('|---|---|');
      for (const r of list) lines.push(`| ${r.file} | ${r.status} |`);
    }
    lines.push('');
  }
  const out = path.join(ROOT, 'STATUS.md');
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log(`✅ 已生成只读快照: ${out}`);
  console.log(`   扫描 ${files.length} 文件：交接 ${byKind['交接'] || 0} / 回执 ${byKind['回执'] || 0} / 审计 ${byKind['审计'] || 0} / 未判定 ${byKind['未判定'] || 0}`);
  console.log(`   默认 draft-only；closed 候选 ${closed} 个（VERDICT/COMPLETE）；未判定 ${byKind['未判定'] || 0} 个交人工。`);
  console.log(`   存量文件未改动；旧目录保留归档。`);
}

/** 解析时长字符串（支持 500ms, 30s, 30m, 1h 等；缺省单位为秒）。 */
function parseDuration(str, defaultSec = 1800) {
  if (!str) return defaultSec * 1000;
  const match = String(str).trim().match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (!match) return defaultSec * 1000;
  const num = parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();
  switch (unit) {
    case 'ms': return num;
    case 's': return num * 1000;
    case 'm': return num * 60 * 1000;
    case 'h': return num * 3600 * 1000;
    case 'd': return num * 86400 * 1000;
    default: return num * 1000;
  }
}

/** 格式化毫秒为人类友好形式。 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1).replace(/\.0$/, '')}m`;
  return `${(ms / 3600000).toFixed(1).replace(/\.0$/, '')}h`;
}

// ── 注意力节流与三级中断模型（Attention Throttle · ADR-0003）──────────────────
function notifyInterrupt(level, title, message) {
  // 1. 控制台视觉输出
  if (level === 'red') {
    console.error(`\n🚨 \x1b[41m\x1b[37m[RED INTERRUPT · 系统级阻断中断]\x1b[0m \x1b[31m${title}\x1b[0m`);
    console.error(`   ${message}\n`);
  } else if (level === 'yellow') {
    console.log(`\n🔔 \x1b[43m\x1b[30m[YELLOW INTERRUPT · 交付待验收中断]\x1b[0m \x1b[33m${title}\x1b[0m`);
    console.log(`   ${message}\n`);
  }

  // 2. 宿主桌面系统通知（macOS osascript / Linux notify-send / Windows PowerShell Toast）
  if (process.platform === 'darwin') {
    try {
      const sound = level === 'red' ? 'Basso' : 'Glass';
      const safeTitle = title.replace(/"/g, '\\"');
      const safeMsg = message.replace(/"/g, '\\"');
      execFileSync('osascript', ['-e', `display notification "${safeMsg}" with title "${safeTitle}" sound name "${sound}"`], { stdio: 'ignore' });
    } catch {}
  } else if (process.platform === 'linux') {
    try {
      const urgency = level === 'red' ? 'critical' : 'normal';
      execFileSync('notify-send', ['-u', urgency, title, message], { stdio: 'ignore' });
    } catch {}
  } else if (process.platform === 'win32') {
    try {
      const safeTitle = title.replace(/'/g, "''");
      const safeMsg = message.replace(/'/g, "''");
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$balloon = New-Object System.Windows.Forms.NotifyIcon
$balloon.Icon = [System.Drawing.SystemIcons]::Information
$balloon.BalloonTipIcon = '${level === 'red' ? 'Error' : 'Info'}'
$balloon.BalloonTipTitle = '${safeTitle}'
$balloon.BalloonTipText = '${safeMsg}'
$balloon.Visible = $true
$balloon.ShowBalloonTip(5000)
Start-Sleep -Milliseconds 500
$balloon.Dispose()
`;
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { stdio: 'ignore', windowsHide: true });
    } catch {}
  }
}

function sanitizeId(id) {
  if (!id) return '';
  return String(id).trim().replace(/[^a-zA-Z0-9._-]/g, '-');
}

/**
 * baton throttle <ticket-id> -- <command...>
 * 静默管道包装：将耗时子任务完全重定向至 .handoffs/logs/<ticket-id>.log
 * 阻断过程噪音；仅在 Exit != 0 时触发 Red 中断冒泡
 */
function cmdThrottle(args) {
  const dashIdx = args.indexOf('--');
  const ticketId = args.slice(0, dashIdx !== -1 ? dashIdx : 1).find(a => !a.startsWith('-'));
  const cmdParts = dashIdx !== -1 ? args.slice(dashIdx + 1) : args.slice(1);

  if (!ticketId || cmdParts.length === 0) {
    console.error('用法: baton throttle <ticket-id> -- <command...>');
    console.error('示例: baton throttle impl-01 -- npm test');
    process.exit(2);
  }

  const cleanId = sanitizeId(ticketId);
  const fullCmd = cmdParts.join(' ');
  const logDir = path.join(ROOT, 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `${cleanId}.log`);

  const isZh = detectLang() === 'zh';
  if (isZh) {
    console.log(`🔇 [注意力节流 · 静默管道] 工单 [${cleanId}] 正在静默执行: \x1b[36m${fullCmd}\x1b[0m`);
    console.log(`   过程日志流向: ${logFile}`);
  } else {
    console.log(`🔇 [Attention Throttle · Silent Pipe] Ticket [${cleanId}] running silently: \x1b[36m${fullCmd}\x1b[0m`);
    console.log(`   Process logs redirected to: ${logFile}`);
  }

  const logFd = fs.openSync(logFile, 'a');
  fs.writeSync(logFd, `\n=== [${new Date().toISOString()}] START: ${fullCmd} ===\n`);

  const startTime = Date.now();
  let exitCode = 0;
  try {
    execSync(fullCmd, {
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env, CI: 'true', THROTTLE_SILENT: '1' },
      cwd: ROOT
    });
    fs.writeSync(logFd, `=== [${new Date().toISOString()}] FINISHED: Exit 0 ===\n`);
  } catch (err) {
    exitCode = err.status !== undefined ? err.status : 1;
    fs.writeSync(logFd, `=== [${new Date().toISOString()}] FAILED: Exit ${exitCode} ===\n`);
  } finally {
    fs.closeSync(logFd);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  if (exitCode === 0) {
    if (isZh) {
      console.log(`✅ [静默执行完成 · Green] 耗时 ${durationSec}s，过程零噪音打扰。`);
    } else {
      console.log(`✅ [Silent Run Completed · Green] Took ${durationSec}s with zero noise.`);
    }
    process.exit(0);
  } else {
    // 触发 Red 级别中断
    const failMsg = isZh
      ? `工单 [${cleanId}] 执行命令失败 (Exit ${exitCode})，请人工排查！`
      : `Ticket [${cleanId}] command failed with Exit ${exitCode}. Human intervention needed.`;
    notifyInterrupt('red', 'Baton 任务执行阻断', failMsg);

    // 读取最后 15 行错误日志直接展示
    try {
      const logs = fs.readFileSync(logFile, 'utf8').trim().split('\n');
      const tail = logs.slice(-15).join('\n');
      console.error('\n' + '─'.repeat(30) + ' [末尾错误日志] ' + '─'.repeat(30));
      console.error(tail);
      console.error('─'.repeat(74) + '\n');
    } catch {}

    process.exit(exitCode);
  }
}

/** 打印 wait 唤醒摘要，引导发起方/审计方进行独立实测与闭环。 */
function printWaitWakeupSummary(id, hFile, rFile, hFm) {
  let rFm = {}, rText = '', conclusion = '';
  if (fs.existsSync(rFile)) {
    try {
      rText = fs.readFileSync(rFile, 'utf8');
      rFm = readFM(rText) || {};
      conclusion = extractConclusion(rText);
    } catch {}
  }
  const displayR = rFile.startsWith(os.homedir()) ? '~' + rFile.slice(os.homedir().length) : rFile;
  const displayH = hFile.startsWith(os.homedir()) ? '~' + hFile.slice(os.homedir().length) : hFile;
  const needsChange = Boolean(hFm?.needs_change || hFm?.needs_iggle_change || rFm?.needs_change || rFm?.needs_iggle_change);

  const isPeerRejection = Boolean(hFm?.rejected_at) &&
    Boolean(hFm?.rejected_by) &&
    hFm?.rejected_by.toLowerCase() !== String(hFm?.from_lane || '').toLowerCase() &&
    hFm?.status !== 'delivered' && hFm?.status !== 'closed';

  if (isPeerRejection) {
    console.log(`\n==================================================`);
    console.log(`⚠️ [工单被驳回退回] 对端已驳回工单: ${id}`);
    console.log(`- 交接文档: ${displayH}`);
    console.log(`- 回执文件: ${displayR}`);
    if (MODE === 'intra-repo') {
      const fromRole = resolveLaneRole(hFm?.rejected_by || rFm.from_lane || hFm?.to_lane) || '审核方';
      console.log(`- 驳回方: 【${fromRole}】(lane: ${hFm?.rejected_by})`);
    } else {
      console.log(`- 驳回方: ${hFm?.rejected_by}`);
    }
    if (hFm?.rejected_at) {
      console.log(`- 驳回时间: ${hFm?.rejected_at}`);
    }
    const rejM = rText.match(/理由[：:]\s*([^\n]+)/);
    if (rejM) console.log(`- 驳回理由: ${rejM[1].trim()}`);
    if (conclusion) console.log(`- 结论摘要: ${conclusion}`);
    console.log(`- 需后续改动: ⚠️ 是 (needs_change=true)`);
    console.log(`==================================================`);
    console.log(`👉 下一步（发起方整改职责）：`);
    console.log(`1. 查看回执中的驳回理由与证据分析（baton show ${id}）。`);
    console.log(`2. 按审查意见修复实现代码与测试。`);
    console.log(`3. 重新送审: baton forward ${id} --wait\n`);
    notifyInterrupt('yellow', 'Baton 工单被驳回待整改', `工单 ${id} 已被对端驳回退回，请发起方整改！`);
    return;
  }

  console.log(`\n==================================================`);
  console.log(`🎯 [交付已就绪] 交接回执已正式交付: ${id}`);
  console.log(`- 交接文档: ${displayH}`);
  console.log(`- 回执文件: ${displayR}`);
  if (MODE === 'intra-repo') {
    const fromRole = resolveLaneRole(rFm.from_lane || hFm?.to_lane) || '执行方';
    console.log(`- 回执来源: 【${fromRole}】(lane: ${rFm.from_lane || hFm?.to_lane || 'unknown'})`);
  } else {
    console.log(`- 回执来源: ${rFm.authorLabel || hFm?.target || '依赖方'}`);
  }
  if (hFm?.delivered_at || rFm?.delivered_at) {
    console.log(`- 交付时间: ${hFm?.delivered_at || rFm?.delivered_at}`);
  }
  if (conclusion) console.log(`- 结论摘要: ${conclusion}`);
  if (rFm.evidence_paths) console.log(`- 变更文件: ${rFm.evidence_paths}`);
  if (rFm.evidence_commits) console.log(`- 提交版本: ${rFm.evidence_commits}`);
  if (rFm.evidence_note) console.log(`- 证据说明: ${rFm.evidence_note}`);
  console.log(`- 需后续改动: ${needsChange ? '⚠️ 是 (needs_change=true)' : '✅ 否'}`);
  console.log(`==================================================`);
  console.log(`👉 下一步（发起方/审计方核心职责）：`);
  console.log(`1. 严禁仅静态读码或自报采信！`);
  console.log(`2. ⚠️ 严禁在完成独立实测验收前，提前将未定稿回执结论写入主线 Backlog 或规格规划！`);
  const asClause = (MODE === 'intra-repo' && hFm?.from_lane) ? ` --as ${hFm.from_lane}` : '';
  console.log(`3. 请在终端独立执行验收命令与证据核验：`);
  console.log(`   baton show ${id}`);
  console.log(`4. 验收通过后闭环：`);
  console.log(`   baton close ${id} -n "已独立实测验证..."${asClause}`);
  console.log(`5. 如验收不通过则驳回重做：`);
  console.log(`   baton reject ${id} -n "驳回原因与缺失点..."${asClause}\n`);

  // 触发 Yellow 级别交付待验收中断
  notifyInterrupt('yellow', 'Baton 工单交付待验收', `工单 ${id} 回执已到达并通过平息缓冲，请进行独立实测验收！`);
}

/** 后台监听回执状态变迁（支持跨仓与同仓多窗口协同）。
 * 设计为配合 Agent run_in_background 执行：挂起 0 Token 消耗，回执到达时 Exit 0 唤醒。
 * 针对 macOS / Apple Silicon 能效深度优化：
 * 1. fs.watch 事件驱动：系统内核级事件监听，有变动瞬间触发唤醒（毫秒级响应），无变动时不占用 CPU。
 * 2. mtime 守卫：未检测到文件修改时间变动时，跳过 readFileSync 与正则解析，消除重复磁盘与 CPU 开销。
 * 3. 自适应动态退避（Adaptive Backoff）：定时器防丢事件保底，随时间自动拉长休眠周期，大幅减少 CPU 唤醒次数，彻底避免发热与卡顿。
 */
function isDeliveryValid(deliveredAt, rejectedAt) {
  if (!deliveredAt) return false;
  if (!rejectedAt) return true;
  const dTime = new Date(deliveredAt).getTime();
  const rTime = new Date(rejectedAt).getTime();
  if (Number.isNaN(dTime) || Number.isNaN(rTime)) {
    return deliveredAt > rejectedAt;
  }
  return dTime > rTime;
}

async function cmdWait(args) {
  const timeoutVal = flagValue(args, '--timeout') || flagValue(args, '-t');
  const intervalVal = flagValue(args, '--interval') || flagValue(args, '-i');
  const settleVal = flagValue(args, '--settle') || flagValue(args, '-s') || (flagValue(args, '--settle-ms') ? `${flagValue(args, '--settle-ms')}ms` : undefined);
  const isAny = args.includes('--any');
  const mode = isAny ? 'any' : 'all'; // 缺省为 all（全部交付后统一唤醒）；--any 为竞态首个到达即唤醒

  const defaultTimeoutSec = (() => {
    const envVal = process.env.BATON_WAIT_TIMEOUT || process.env.HANDOFF_WAIT_TIMEOUT;
    if (envVal) return Math.round(parseDuration(envVal, 3600) / 1000);
    if (HUB_CONFIG && (HUB_CONFIG.wait_timeout || HUB_CONFIG.timeout)) {
      return Math.round(parseDuration(HUB_CONFIG.wait_timeout || HUB_CONFIG.timeout, 3600) / 1000);
    }
    return 3600; // 默认超时提升至 60 分钟（3600 秒），适配深度测试与长任务
  })();
  const timeoutMs = parseDuration(timeoutVal, defaultTimeoutSec);
  const explicitIntervalMs = intervalVal ? Math.max(500, parseDuration(intervalVal, 3)) : null;

  const settleDelayMs = (() => {
    const raw = settleVal !== undefined ? settleVal : (process.env.BATON_SETTLE_DELAY || (HUB_CONFIG && HUB_CONFIG.settle_delay));
    return parseDuration(raw, 10); // 默认 10 秒会话平息缓冲期，等待执行方会话彻底收尾
  })();

  const valFlags = ['--timeout', '-t', '--interval', '-i', '--settle', '-s', '--settle-ms'];
  const valueIdx = new Set();
  for (let i = 0; i < args.length; i++) if (valFlags.includes(args[i])) valueIdx.add(i + 1);
  const rawIds = args.filter((a, i) => !a.startsWith('-') && !valueIdx.has(i));

  if (!rawIds.length) {
    console.error('用法: baton wait <id1> [id2 ...] [--any|--all] [--timeout <duration>] [--interval <duration>] [--settle <duration>] [--daemon]');
    console.error('示例: baton wait SWOOP-20261104-01-feat --timeout 60m --settle 10s --daemon');
    console.error('      baton wait ID-1 ID-2 --any      # 竞态首个到达即平息唤醒 (Race)');
    console.error('      baton wait ID-1 ID-2 --all      # 全部任务全量交付后统一平息唤醒 (Join, 默认)');
    process.exit(2);
  }
  const ids = rawIds.map(resolveTicketId);

  const isDaemon = args.includes('--daemon') || args.includes('-d');
  if (isDaemon && !process.env.BATON_DAEMON) {
    if (isAgentEnvironment()) {
      const isZh = detectLang() === 'zh';
      if (isZh) {
        console.error(`❌ [环境限制] 检测到 Agent 托管管道环境，--daemon 无法安全脱钩（可能导致长任务被宿主 SIGTERM 杀死或假成功）。\n   请以宿主后台任务方式运行 'baton wait ${ids.join(' ')}'（如 run_command async / background task），或移除 --daemon。\n   （如确需在宿主内强制脱钩，请设置环境变量 BATON_MANAGED_MODE=0）\n`);
      } else {
        console.error(`❌ [Host Restriction] Detected Agent managed environment: --daemon cannot safely detach.\n   Please run 'baton wait ${ids.join(' ')}' as a host background task, or remove --daemon.\n   (To force detach in an agent environment, set BATON_MANAGED_MODE=0)\n`);
      }
      process.exit(3);
    } else {
      spawnDaemonWait(ids, args);
      return;
    }
  }

  // 初始化所有被监听工单的状态实体
  const ticketMap = new Map();
  for (const id of ids) {
    const hFile = path.join(H_DIR, `${id}.md`);
    if (!fs.existsSync(hFile)) {
      console.error(`❌ 找不到交接文档: ${hFile}`);
      process.exit(1);
    }
    const rFile = path.join(R_DIR, `${id}-resp.md`);
    let hFm = readFM(fs.readFileSync(hFile, 'utf8')) || {};
    let initialRMtime = 0;
    let initialRDelivered = false;
    let initialRDeliveredTime = '';
    let initialAutoDeliverCandidate = false;
    let initialNegativeReceiptSettled = false;
    try {
      if (fs.existsSync(rFile)) {
        initialRMtime = fs.statSync(rFile).mtimeMs;
        const rRaw = fs.readFileSync(rFile, 'utf8');
        const rFm = readFM(rRaw);
        if (rFm && isDeliveryValid(rFm.delivered_at, hFm.rejected_at)) {
          initialRDelivered = true;
          initialRDeliveredTime = rFm.delivered_at;
        } else if (hFm.status === 'received' && rFm && (rFm.handoff_id === id || rFm.id === id || !rFm.handoff_id)) {
          const rBody = stripFM(rRaw);
          const concl = extractConclusion(rBody);
          const isPositive = concl && !isVerdictRejected(concl) && !isVerdictBlocked(concl);
          const isAudit = MODE === 'intra-repo' && String(hFm?.to_lane || '').toLowerCase() === 'audit';
          const auditNonceValid = !isAudit || (Boolean(rFm.audit_nonce) && rFm.audit_nonce === hFm.audit_nonce);
          if (isPositive && !rFm.needs_change && !hFm.needs_change && auditNonceValid) {
            initialAutoDeliverCandidate = true;
          } else if ((rFm.needs_change || isVerdictRejected(concl) || isVerdictBlocked(concl)) && auditNonceValid) {
            initialNegativeReceiptSettled = true;
          }
        }
      }
    } catch {}
    let initialHMtime = 0;
    try { if (fs.existsSync(hFile)) initialHMtime = fs.statSync(hFile).mtimeMs; } catch {}
    const isAlreadyDelivered = initialRDelivered || (hFm.status === 'delivered') || (Boolean(hFm.delivered_at) && isDeliveryValid(hFm.delivered_at, hFm.rejected_at));
    const initStatus = isAlreadyDelivered ? 'delivered' : (hFm.status || 'draft');
    if (initialRDelivered && !hFm.delivered_at) {
      hFm.delivered_at = initialRDeliveredTime;
    }
    ticketMap.set(id, {
      id,
      hFile,
      rFile,
      hFm,
      status: initStatus,
      lastHMtime: initialHMtime,
      lastRMtime: initialRMtime,
      _candidateForAutoDeliver: initialAutoDeliverCandidate,
      _negativeReceiptSettled: initialNegativeReceiptSettled,
    });
  }

  const isTicketReady = (t) => {
    const isLegacyExempt = t.hFm.created && t.hFm.created < '2026-11-08' && !t.hFm.delivered_at;
    const isDeliveredAfterReject = isDeliveryValid(t.hFm.delivered_at, t.hFm.rejected_at);
    // 审计方/对端反向驳回退回（NO-GO 唤醒）：若工单被对端驳回（rejected_by 存在且非发起方自身），必须即刻唤醒发起方处理！
    const isRejectedByPeer = Boolean(t.hFm.rejected_at) &&
      Boolean(t.hFm.rejected_by) &&
      t.hFm.rejected_by.toLowerCase() !== String(t.hFm.from_lane || '').toLowerCase();
    const isAutoDeliverCandidate = Boolean(t._candidateForAutoDeliver);
    const isNegativeReceiptSettled = Boolean(t._negativeReceiptSettled);

    return (t.status === 'delivered' && isDeliveredAfterReject) ||
           t.status === 'closed' ||
           isRejectedByPeer ||
           (Boolean(t.hFm.delivered_at) && isDeliveredAfterReject) ||
           (t.status === 'received' && isLegacyExempt) ||
           isAutoDeliverCandidate ||
           isNegativeReceiptSettled;
  };
  const getReadyTickets = () => [...ticketMap.values()].filter(isTicketReady);

  const promoteAutoDeliverCandidates = () => {
    const nowIso = new Date().toISOString();
    for (const [id, t] of ticketMap.entries()) {
      if (t._candidateForAutoDeliver && t.status !== 'delivered' && t.status !== 'closed') {
        try {
          setFM(t.hFile, { status: 'delivered', delivered_at: nowIso, auto_delivered: true });
          setFM(t.rFile, { delivered_at: nowIso, auto_delivered: true });
          t.status = 'delivered';
          t.hFm.status = 'delivered';
          t.hFm.delivered_at = nowIso;
          t._candidateForAutoDeliver = false;
          console.log(`ℹ️ [Baton 自愈交付] 工单 ${id} 回执有效且已落盘，自动推进至 delivered 终态并唤醒发起方！`);
        } catch {}
      }
    }
  };

  if (mode === 'any') {
    const ready = getReadyTickets();
    if (ready.length > 0) {
      promoteAutoDeliverCandidates();
      clearUnwatchedDebt(ids);
      console.log(`✅ [就绪] 聚合监听（模式: ANY）已有工单处于终态: ${ready[0].id} (${ready[0].status})`);
      printWaitWakeupSummary(ready[0].id, ready[0].hFile, ready[0].rFile, ready[0].hFm);
      process.exit(0);
    }
  } else {
    const ready = getReadyTickets();
    if (ready.length === ids.length) {
      promoteAutoDeliverCandidates();
      clearUnwatchedDebt(ids);
      console.log(`✅ [全部就绪] 聚合监听（模式: ALL）全部 ${ids.length} 份工单均已处于交付终态！`);
      for (const t of ready) {
        printWaitWakeupSummary(t.id, t.hFile, t.rFile, t.hFm);
      }
      process.exit(0);
    }
  }

  const startTime = Date.now();
  if (ids.length === 1) {
    const singleT = ticketMap.get(ids[0]);
    console.log(`⏳ [Handoff Wait] 正在监听交接 ${ids[0]} 的回执到达...`);
    console.log(`   - 当前状态: ${singleT.status}`);
    console.log(`   - 目标文件: ${path.relative(ROOT, singleT.rFile)}`);
  } else {
    console.log(`⏳ [Handoff Wait] 正在多路复用监听 ${ids.length} 份交接（模式: ${mode.toUpperCase()} · ${mode === 'any' ? '首个到达即平息唤醒' : '全部交付后统一平息唤醒'}）...`);
    for (const [id, t] of ticketMap.entries()) {
      console.log(`   - 工单 ${id}: 状态 ${t.status} (${path.relative(ROOT, t.rFile)})`);
    }
  }
  console.log(`   - 超时设定: ${formatDuration(timeoutMs)} (能效模式: 事件驱动 + 自适应退避)`);
  if (settleDelayMs > 0) {
    console.log(`   - 平息缓冲: ${formatDuration(settleDelayMs)} (终态交付后等待执行方会话彻底收尾，杜绝抢跑)`);
  }
  console.log(`   - 运行模式: ${MODE === 'intra-repo' ? '仓内模式 (intra-repo)' : '跨仓模式'}`);
  if (process.env.HANDOFF_LANE) {
    console.log(`   - 当前窗口 Lane: ${process.env.HANDOFF_LANE}`);
  }
  const currentSessionId = getSessionId();
  if (currentSessionId) {
    console.log(`   - 会话亲和 ID: ${currentSessionId}`);
  }
  console.log(`   (提示: 此命令设计为在后台运行 run_in_background，回执到达时将 Exit 0 唤醒主会话)\n`);

  let lastHeartbeatTime = startTime;

  // 设置 fs.watch 监听目录变动（事件驱动 + 智能去抖 + 精准过滤，消除空转与发热）
  let triggerResolve = null;
  let debounceTimer = null;
  const watchers = [];

  const onFsEvent = (filename) => {
    // 1. 精准文件名过滤：兼容 macOS (Darwin FSEvents) 与 Windows (NTFS 大小写不敏感及路径斜杠)
    let isRelevant = false;
    if (filename) {
      const baseName = path.basename(String(filename)).toLowerCase();
      // 过滤常见噪音文件（.DS_Store、临时文件、锁文件、日志文件、备份文件、注册表文件等）
      if (
        baseName.startsWith('.') ||
        baseName.endsWith('.tmp') ||
        baseName.endsWith('.swp') ||
        baseName.endsWith('.log') ||
        baseName.endsWith('.bak.md') ||
        baseName.endsWith('.json') ||
        baseName.endsWith('.lock')
      ) {
        return;
      }
      // 必须是 .md 结尾并且包含某个工单 ID（小写对齐）
      if (baseName.endsWith('.md')) {
        isRelevant = ids.some(id => baseName.includes(id.toLowerCase()));
      }
    } else {
      // 在 macOS (Darwin FSEvents) 上 filename 为 null 时，做一次极轻量的快速 mtime 检查，若目标文件没有任何变动则直接丢弃
      for (const t of ticketMap.values()) {
        try {
          if (fs.existsSync(t.hFile) && fs.statSync(t.hFile).mtimeMs !== t.lastHMtime) { isRelevant = true; break; }
          if (fs.existsSync(t.rFile) && fs.statSync(t.rFile).mtimeMs !== t.lastRMtime) { isRelevant = true; break; }
        } catch {}
      }
    }

    if (!isRelevant) return;

    // 2. 智能防抖（Debounce · 300ms）：避免编辑器连续写入引发事件循环风暴吃满 CPU
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (triggerResolve) {
        const r = triggerResolve;
        triggerResolve = null;
        r('fs-event');
      }
    }, 300);
  };

  const safeWatch = (targetDir) => {
    try {
      if (fs.existsSync(targetDir)) {
        const w = fs.watch(targetDir, { persistent: false }, (eventType, filename) => {
          onFsEvent(filename);
        });
        w.on('error', () => { /* 忽略底层 watcher 瞬时错误，保底靠轮询退避 */ });
        w._targetDir = targetDir;
        watchers.push(w);
      }
    } catch {}
  };

  safeWatch(H_DIR);
  safeWatch(R_DIR);

  const cleanupWatchers = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    for (const w of watchers) {
      try { w.close(); } catch {}
    }
    watchers.length = 0;
  };

  // ── 监听注册表与孤儿守护抑制（防止同一工单多实例累积导致 CPU 唤醒风暴 · v2.35.1 会话亲和性加固）─────
  const WATCH_DIR = path.join(ROOT, '.watch');
  try { fs.mkdirSync(WATCH_DIR, { recursive: true }); } catch {}

  // 启动前检查并清理针对当前工单的旧 watcher 进程
  // 核心守卫（会话亲和性与防串扰）：
  // 1. 同一会话（session_id 相同）：确系本窗口历史未退出孤儿，安全接管并发送 SIGTERM 终止旧守护，防止单窗口累积发热；
  // 2. 跨会话/跨窗口（session_id 不同）：严禁向外部会话发送 SIGTERM 强杀！允许多窗口基于 fs.watch 并发安全协同监听，广播唤醒。
  const survivingWatchersMap = new Map();

  for (const id of ids) {
    const watchFile = path.join(WATCH_DIR, `${id}.json`);
    const surviving = [];
    if (fs.existsSync(watchFile)) {
      try {
        const raw = fs.readFileSync(watchFile, 'utf8');
        const prev = JSON.parse(raw);
        const prevWatchers = Array.isArray(prev?.watchers) && prev.watchers.length > 0
          ? prev.watchers
          : (prev?.pid ? [{ pid: prev.pid, session_id: prev.session_id || prev.conversation_id || '', host_env: prev.host_env, started_at: prev.started_at }] : []);

        for (const w of prevWatchers) {
          if (!w || !w.pid || w.pid === process.pid) continue;
          let isAlive = false;
          try {
            process.kill(w.pid, 0); // 探测进程存活
            isAlive = true;
          } catch (e) {
            if (e.code === 'EPERM') isAlive = true;
          }

          if (!isAlive) continue; // 僵死孤儿自动丢弃

          const wSession = w.session_id || w.conversation_id || '';
          const isSameSession = Boolean(wSession && currentSessionId && wSession === currentSessionId);

          if (isSameSession) {
            // 同会话历史孤儿：终止旧进程
            try {
              process.kill(w.pid, 'SIGTERM');
            } catch {}
          } else {
            // 跨会话/外部窗口：保留存活 watcher，严禁强杀
            surviving.push(w);
            const externalTag = wSession ? `会话: ${wSession.slice(0, 8)}` : `PID: ${w.pid}`;
            console.log(`ℹ️ [多端协同监听] 检测到外部会话窗口 (${externalTag}) 正在并发监听工单 [${id}]，两端均由事件总线独立唤醒。`);
          }
        }
      } catch {}
    }
    survivingWatchersMap.set(id, surviving);
  }

  const writeWatchRegistry = () => {
    const startedAt = new Date().toISOString();
    for (const id of ids) {
      const watchFile = path.join(WATCH_DIR, `${id}.json`);
      const surviving = survivingWatchersMap.get(id) || [];
      const currentWatcher = {
        pid: process.pid,
        session_id: currentSessionId,
        conversation_id: currentSessionId,
        started_at: startedAt,
        timeout_ms: timeoutMs,
        interval_ms: explicitIntervalMs || null,
        host_env: isAgentEnvironment() ? 'agent' : 'terminal'
      };
      const mergedWatchers = [...surviving, currentWatcher];
      const payload = {
        id,
        pid: process.pid,
        session_id: currentSessionId,
        conversation_id: currentSessionId,
        started_at: startedAt,
        timeout_ms: timeoutMs,
        interval_ms: explicitIntervalMs || null,
        host_env: isAgentEnvironment() ? 'agent' : 'terminal',
        watchers: mergedWatchers
      };
      try {
        fs.writeFileSync(watchFile, JSON.stringify(payload, null, 2), 'utf8');
      } catch {}
    }
    clearUnwatchedDebt(ids);
  };

  const cleanupWatchRegistry = () => {
    for (const id of ids) {
      const watchFile = path.join(WATCH_DIR, `${id}.json`);
      try {
        if (fs.existsSync(watchFile)) {
          const raw = fs.readFileSync(watchFile, 'utf8');
          const data = JSON.parse(raw);
          if (Array.isArray(data?.watchers)) {
            const remaining = data.watchers.filter(w => {
              if (!w || !w.pid || w.pid === process.pid) return false;
              try {
                process.kill(w.pid, 0);
                return true;
              } catch (e) {
                return e.code === 'EPERM';
              }
            });
            if (remaining.length > 0) {
              data.watchers = remaining;
              data.pid = remaining[0].pid;
              data.session_id = remaining[0].session_id || '';
              data.conversation_id = remaining[0].conversation_id || '';
              fs.writeFileSync(watchFile, JSON.stringify(data, null, 2), 'utf8');
              continue;
            }
          } else if (data && data.pid !== process.pid) {
            try {
              process.kill(data.pid, 0);
              continue; // 外部进程依然存活，不删文件
            } catch {}
          }
          fs.unlinkSync(watchFile);
        }
      } catch {}
    }
  };

  const cleanupAll = () => {
    cleanupWatchRegistry();
    cleanupWatchers();
  };

  process.on('exit', cleanupAll);
  process.on('SIGINT', () => { cleanupAll(); process.exit(130); });
  process.on('SIGTERM', () => { cleanupAll(); process.exit(143); });
  process.on('SIGHUP', () => { cleanupAll(); process.exit(129); });
  if (process.platform === 'win32') {
    // Windows 控制台关闭信号监听
    process.on('SIGBREAK', () => { cleanupAll(); process.exit(130); });
  }

  writeWatchRegistry();

  // 自适应动态退避（兼顾极低 CPU 占用与极端环境事件兜底，保护 Mac/Win 设备不发烫）
  const getNextInterval = (elapsed) => {
    if (explicitIntervalMs) return explicitIntervalMs;
    if (elapsed < 30_000) return 3_000;       // 前 30 秒：3s（fs.watch 300ms 内即时响应，轮询仅做保底）
    if (elapsed < 120_000) return 6_000;      // 30s ~ 2min：6s
    if (elapsed < 300_000) return 12_000;     // 2min ~ 5min：12s
    return 20_000;                            // 5min 以上长稳态：20s 极低功耗保底
  };

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      cleanupAll();
      console.error(`\n⏰ [超时诊断] 聚合等待超时（已持续监听 ${formatDuration(timeoutMs)} · 模式: ${mode.toUpperCase()}）。`);
      console.error(`📊 各交接单最新状态矩阵：`);
      for (const [id, t] of ticketMap.entries()) {
        let rExists = false;
        try { rExists = fs.existsSync(t.rFile); } catch {}
        if (t.status === 'delivered') {
          console.error(`  - ${id}: delivered ✅ (已于 ${t.hFm.delivered_at || '刚才'} 完成交付)`);
        } else if (t.status === 'received' && rExists) {
          console.error(`  - ${id}: received ⚠️ (回执草稿已落盘，但执行方尚未运行 baton deliver 宣布终态交付)`);
        } else if (t.status === 'closed') {
          console.error(`  - ${id}: closed 🔒 (已审计闭环)`);
        } else {
          console.error(`  - ${id}: ${t.status} ⏳ (等待执行方接单与提交回执)`);
        }
      }
      notifyInterrupt('red', 'Baton 监听超时阻断', `工单等待超时 (${formatDuration(timeoutMs)})，未收到终态交付信号，请人工排查！`);
      console.error(`⚠️ 监听已退出 (Exit 124)。建议联系对应执行方或检查执行窗口进度。`);
      process.exit(124);
    }

    // 保活心跳（每 5 分钟微量输出，防止宿主外层框架因无标准输出误杀进程）
    if (Date.now() - lastHeartbeatTime >= 300_000) {
      lastHeartbeatTime = Date.now();
      const readyCount = getReadyTickets().length;
      console.log(`⏳ [探针活跃] 正在持续监听（已等待 ${formatDuration(elapsed)} / 上限 ${formatDuration(timeoutMs)} · 进度: ${readyCount}/${ids.length} 就绪）...`);
    }

    try {
      // 动态补挂尚未创建的目标目录（如初始阶段尚未生成 receipts/ 目录）
      if (watchers.length < 2) {
        if (!watchers.some(w => w._targetDir === H_DIR)) safeWatch(H_DIR);
        if (!watchers.some(w => w._targetDir === R_DIR)) safeWatch(R_DIR);
      }

      for (const [id, t] of ticketMap.entries()) {
        // 若工单原文件被物理删除（例如分支切换或误删），则退出监听避免无限空耗电量
        if (!fs.existsSync(t.hFile)) {
          console.warn(`\n⚠️ [工单文件缺失] 工单文件已不存在: ${t.hFile}，停止监听退出。`);
          cleanupAll();
          process.exit(1);
        }

        // 1. 检查 hFile 的 mtime 是否变动（mtime 守卫）
        let hMtime = 0;
        try { if (fs.existsSync(t.hFile)) hMtime = fs.statSync(t.hFile).mtimeMs; } catch {}

        if (hMtime && hMtime !== t.lastHMtime) {
          t.lastHMtime = hMtime;
          t.hFm = readFM(fs.readFileSync(t.hFile, 'utf8')) || {};
          t.status = t.hFm.status;
        }

        // 2. 检查 rFile 是否生成或更新
        let rExists = false;
        let rMtime = 0;
        try {
          if (fs.existsSync(t.rFile)) {
            rExists = true;
            rMtime = fs.statSync(t.rFile).mtimeMs;
          }
        } catch {}

        if (t.status !== 'delivered' && t.status !== 'closed' && rExists && rMtime !== t.lastRMtime) {
          t.lastRMtime = rMtime;
          const rRaw = fs.readFileSync(t.rFile, 'utf8');
          const rFm = readFM(rRaw);
          if (rFm && (rFm.handoff_id === id || rFm.id === id || !rFm.handoff_id)) {
            const hasValidRDelivered = isDeliveryValid(rFm.delivered_at, t.hFm.rejected_at);
            const hasValidHDelivered = isDeliveryValid(t.hFm.delivered_at, t.hFm.rejected_at);
            const isDelivered = Boolean(hasValidRDelivered || hasValidHDelivered);
            if (isDelivered) {
              const deliverTime = (hasValidHDelivered && t.hFm.delivered_at) ? t.hFm.delivered_at : rFm.delivered_at;
              t.status = 'delivered';
              t.hFm.status = 'delivered';
              t.hFm.delivered_at = deliverTime;
              t._candidateForAutoDeliver = false;
            } else {
              const rBody = stripFM(rRaw);
              const concl = extractConclusion(rBody);
              const isPositive = concl && !isVerdictRejected(concl) && !isVerdictBlocked(concl);
              const isAudit = MODE === 'intra-repo' && String(t.hFm?.to_lane || '').toLowerCase() === 'audit';
              const auditNonceValid = !isAudit || (Boolean(rFm?.audit_nonce) && rFm.audit_nonce === t.hFm.audit_nonce);

              if (isPositive && !rFm?.needs_change && !t.hFm?.needs_change && auditNonceValid) {
                t._candidateForAutoDeliver = true;
              } else if ((rFm?.needs_change || isVerdictRejected(concl) || isVerdictBlocked(concl)) && auditNonceValid) {
                t._negativeReceiptSettled = true;
              }
              // 回执文件更新但执行方尚未宣布交付：仅跨仓记录 seen，绝不抢跑翻 received 触发唤醒
              if (MODE !== 'intra-repo' && t.status !== 'received') {
                setFM(t.hFile, { receipt_seen_at: new Date().toISOString() });
              }
            }
          }
        }
      }

      // 唤醒判定（聚合唤醒）
      const readyTickets = getReadyTickets();
      const shouldWakeup = (mode === 'any' && readyTickets.length > 0) || (mode === 'all' && readyTickets.length === ids.length);

      if (shouldWakeup) {
        // 执行方平息缓冲（Settle Window · 防抢跑核心）：
        // 探针在此处静默缓冲若干秒，若检测到工作区内任何相关文件仍有写入活动则顺延，直到执行方会话彻底平息再唤醒发起方。
        if (settleDelayMs > 0 && readyTickets.some(t => t.status === 'delivered' || t._candidateForAutoDeliver || t._negativeReceiptSettled)) {
          console.log(`\n⏳ [交付平息缓冲] 检测到交付/回执信号（就绪 ${readyTickets.length}/${ids.length} 项），等待执行方会话彻底结束（平息缓冲 ${formatDuration(settleDelayMs)}）...`);
          let settleStart = Date.now();
          const settleHardCapMs = Math.max(settleDelayMs * 3, 30_000); // 最大平息硬上限，杜绝后置持续扰动导致的无限等待与 CPU 空转
          const settleGlobalStart = settleStart;

          while (Date.now() - settleStart < settleDelayMs) {
            if (Date.now() - settleGlobalStart >= settleHardCapMs) {
              console.log(`⏱️ [平息硬上限熔断] 已达到最大平息缓冲安全上限 (${formatDuration(settleHardCapMs)})，强制结束平息并唤醒！`);
              break;
            }
            const remain = Math.max(100, settleDelayMs - (Date.now() - settleStart));
            await new Promise((r) => setTimeout(r, Math.min(remain, 1000)));
            let hasActiveWrite = false;
            for (const [id, t] of ticketMap.entries()) {
              let newHMtime = 0, newRMtime = 0;
              try { if (fs.existsSync(t.hFile)) newHMtime = fs.statSync(t.hFile).mtimeMs; } catch {}
              try { if (fs.existsSync(t.rFile)) newRMtime = fs.statSync(t.rFile).mtimeMs; } catch {}
              if ((newHMtime && newHMtime !== t.lastHMtime) || (newRMtime && newRMtime !== t.lastRMtime)) {
                t.lastHMtime = newHMtime;
                t.lastRMtime = newRMtime;
                hasActiveWrite = true;
              }
            }
            if (hasActiveWrite) {
              settleStart = Date.now();
              console.log(`   [写入活动中] 检测到执行方后置操作，重置平息缓冲计时器...`);
            }
          }

          // 平息完成后：对自愈候选工单安全落盘推进为 delivered
          promoteAutoDeliverCandidates();
          console.log(`🎉 [会话已平息] 执行方会话已彻底结束，正式唤醒发起方！`);
        }

        cleanupAll();
        if (ids.length === 1) {
          const singleT = readyTickets[0];
          const isPeerRej = Boolean(singleT.hFm.rejected_at) &&
            Boolean(singleT.hFm.rejected_by) &&
            singleT.hFm.rejected_by.toLowerCase() !== String(singleT.hFm.from_lane || '').toLowerCase() &&
            singleT.status !== 'delivered' && singleT.status !== 'closed';

          if (isPeerRej) {
            console.log(`\n⚠️ [工单被驳回退回] 检测到交接 ${singleT.id} 已被【${singleT.hFm.rejected_by}】驳回退回（Needs Change / 待整改）！`);
          } else if (singleT._negativeReceiptSettled) {
            console.log(`\n⚠️ [回执未通过唤醒] 检测到交接 ${singleT.id} 回执已落盘，结论为未通过/受阻，唤醒发起方处理！`);
          } else {
            console.log(`\n🎉 [交付已就绪] 检测到交接 ${singleT.id} 状态已转为 ${singleT.status}！`);
          }
          printWaitWakeupSummary(singleT.id, singleT.hFile, singleT.rFile, singleT.hFm);
        } else {
          console.log(`\n🎉 [聚合就绪唤醒] 模式 ${mode.toUpperCase()} 达成条件（就绪 ${readyTickets.length}/${ids.length} 项）！`);
          for (const t of readyTickets) {
            printWaitWakeupSummary(t.id, t.hFile, t.rFile, t.hFm);
          }
        }
        process.exit(0);
      }
    } catch {
      // 容忍读文件过程中的瞬时读写冲突
    }

    // 结合自适应退避与 fs.watch 事件驱动：任意一个先触发即刻进入下一轮检查
    const remainMs = Math.max(0, timeoutMs - elapsed);
    if (remainMs <= 0) continue;
    const interval = getNextInterval(elapsed);
    const waitTime = Math.min(interval, remainMs);
    await new Promise((resolve) => {
      let timer = null;
      triggerResolve = (source) => {
        if (timer) clearTimeout(timer);
        resolve(source);
      };
      // 保底休眠至少 1000ms（防止由于微小抖动引发每秒多次唤醒，保护 CPU 能效核心）
      const safeWaitTime = Math.max(1000, waitTime);
      timer = setTimeout(() => {
        triggerResolve = null;
        resolve('timer');
      }, safeWaitTime);
    });
  }
}

const rawArgv = process.argv.slice(2);
// 剥离全局旗标 --root（及其值）/ --root=...，命令 = 第一个非旗标 token；resolveRoot 已在模块加载时消费了 --root。
const nonRoot = [];
for (let i = 0; i < rawArgv.length; i++) {
  if (rawArgv[i] === '--root') { i++; continue; }
  if (rawArgv[i].startsWith('--root=')) continue;
  nonRoot.push(rawArgv[i]);
}
const cmd = nonRoot.find(a => !a.startsWith('-'));
const cmdIdx = nonRoot.indexOf(cmd);
const rest = cmdIdx >= 0 ? nonRoot.slice(cmdIdx + 1) : [];

const isVersion = nonRoot.includes('--version') || nonRoot.includes('-v') || nonRoot.includes('-V') || cmd === 'version';
if (isVersion) {
  console.log(`Agent Baton (baton) CLI · v${BATON_VERSION} (alias: handoff)`);
  process.exit(0);
}

const isHelp = nonRoot.includes('--help') || nonRoot.includes('-h') || cmd === 'help';

switch (cmd) {
  case 'init': cmdInit(rest); break;
  case 'new': cmdNew(rest); break;
  case 'status': cmdStatus(rest); break;
  case 'accept': cmdAccept(rest); break;
  case 'close': cmdAccept(rest); break; // 兼容历史文档「handoff close」表述的别名
  case 'reject': cmdReject(rest); break;
  case 'reopen': cmdReopen(rest); break;
  case 'receipt': cmdReceipt(rest); break;
  case 'deliver': cmdDeliver(rest); break;
  case 'forward': await cmdForward(rest); break;
  case 'open': cmdOpen(rest); break;
  case 'show': cmdShow(rest); break;
  case 'nonce': cmdNonce(rest); break;
  case 'check': cmdCheck(rest); break;
  case 'prompt': cmdPrompt(rest); break;
  case 'import': cmdImport(rest); break;
  case 'install': cmdInstall(rest); break;
  case 'link': cmdLink(rest); break;
  case 'doctor': cmdLink(['--check', ...rest]); break;
  case 'brief': cmdBrief(rest); break;
  case 'sync': cmdSync(); break;
  case 'wait': await cmdWait(rest); break;
  case 'throttle':
  case 'silent':
    cmdThrottle(rest);
    break;
  case 'drift': cmdDrift(rest); break;
  case 'lane': cmdLane(rest); break;
  default: {
    const isZh = detectLang() === 'zh';
    if (isZh) {
      console.log(`Agent Baton (baton) CLI · v${BATON_VERSION} (alias: handoff)
用法:
  baton init [--cross] [--root <dir>] [--targets <a,b>] [--lanes <a,b>]
                                               初始化 Hub（--cross 为跨仓中立中枢，默认仓内子 Hub）
  baton import --from <dir>                    扫描旧交接目录生成只读快照
  baton new <target|lane> <type> <标题...> [--workspace worktree]
                                               创建交接（跨仓 target / 仓内 lane / 支持 worktree 隔离）
  baton status [--json] [--for <t|lane>] [--mermaid]
                                               查看未闭环摘要（支持 --mermaid 拓扑图）
  baton lane [<lane>|--clear]                  查看、锁定或清除当前会话身份锁（防跨角色伪装漂移）
  baton accept <id> -n "<验收结论>" [--by <lane>] [--prune-worktree]
                                               审计闭环（close 为同义别名，可选自动回收隔离工作树）
  baton reject <id> -n "<驳回理由>"            审计驳回（退回执行方继续改）
  baton reopen <id> -n "<重开理由>"            误闭环重开（将 closed 打回 forwarded 继续整改）
  baton receipt <id> [-n "<回执正文>"] [--deliver] [--evidence-paths "..."] [--evidence-commits "..."] [--audit-nonce "..."]
                                               登记回执并翻 received（可选 --deliver 一步直达交付）
  baton deliver <id> [-n "<交付补充说明>"]     执行方终态交付并翻 delivered（触发发起方独立实测）
  baton throttle <id> -- <cmd...>              静默管道运行耗时任务（三级中断过滤，仅在失败/交付时唤醒）
  baton forward <id> [--wait] [--daemon] [--blind]
                                               标记已转递（--wait 托管阻塞监听；--daemon 脱钩后台守护；--blind 双盲脱敏）
  baton wait <id1> [id2 ...] [--any|--all] [--timeout <dur>] [--settle <dur>] [--daemon]
                                               0-Token 事件监听回执交付到达并 Exit 0 自动唤醒（支持多 ID 聚合等待 --any/--all 与平息缓冲防抢跑；--daemon 终端脱钩入后台）
  baton open <id>                              打开交接文件
  baton show <id> [--nonce]                    triage 摘要视图（不 dump 全文；--nonce 提取 Audit Nonce）
  baton nonce <id> [--reissue]                 查看或重签工单的 Audit Nonce 防伪挑战令牌
  baton check                                  全库合规体检（任务收尾判据）
  baton prompt <id>                            生成交接提示词（异工作区）
  baton install [--global|--project] [--no-readme] [--lang <en|zh>]
                                               刷新各工具指令文件接入桩（幂等）
  baton link [--remove]                        把中央引擎以 baton / handoff 之名接入 PATH
  baton brief [target]                         生成收件箱快照
  baton sync                                   扫 receipts/ 自动登记回执
  baton drift --common | --platform <p>        版本失效回流
作用域根：--root <dir> | BATON_ROOT / HANDOFF_ROOT | cwd 上溯 .handoff-hub.json | 回退 lab Hub
跨仓 target: ${[...TARGETS].join(' | ')}    type: bug | feature | breaking | question
仓内 lane: 由配置文件定义                     type: task | bug | feature | question | continuation`);
    } else {
      console.log(`Agent Baton (baton) CLI · v${BATON_VERSION} (alias: handoff)
Usage:
  baton init [--cross] [--root <dir>] [--targets <a,b>] [--lanes <a,b>]
                                               Initialize hub (--cross for cross-repo, default intra-repo)
  baton import --from <dir>                    Scan legacy handoffs directory to generate read-only snapshot
  baton new <target|lane> <type> <title...> [--workspace worktree]
                                               Create handoff (cross-repo target / intra-repo lane / support worktree isolation)
  baton status [--json] [--for <t|lane>] [--mermaid]
                                               View open handoffs summary (supports --mermaid diagram)
  baton lane [<lane>|--clear]                  View, lock, or clear current session identity lock (prevents impersonation)
  baton accept <id> -n "<verdict>" [--by <lane>] [--prune-worktree]
                                               Audit closure (close is an alias; optional auto-prune isolated worktree)
  baton reject <id> -n "<reason>"              Audit rejection (return to executor for revision)
  baton reopen <id> -n "<reason>"              Reopen misclosed handoff (change closed back to forwarded)
  baton receipt <id> [-n "<body text>"] [--deliver] [--evidence-paths "..."] [--evidence-commits "..."] [--audit-nonce "..."]
                                               Record receipt and set received (optional --deliver for one-step delivery)
  baton deliver <id> [-n "<delivery note>"]    Final executor delivery to state 'delivered' (ready for audit)
  baton throttle <id> -- <cmd...>              Silent pipeline for time-consuming tasks (filter noise, alert on failure/delivery)
  baton forward <id> [--wait] [--daemon] [--blind]
                                               Mark forwarded (--wait managed blocking wait; --daemon detached daemon; --blind desensitize)
  baton wait <id1> [id2 ...] [--any|--all] [--timeout <dur>] [--settle <dur>] [--daemon]
                                               0-Token background event listener waiting for delivery (supports multi-ID aggregation --any/--all and settle window; --daemon detaches)
  baton open <id>                              Open handoff file in editor
  baton show <id> [--nonce]                    Triage summary view (does not dump full text; --nonce extracts Audit Nonce)
  baton nonce <id> [--reissue]                 View or reissue Audit Nonce challenge token for ticket
  baton check                                  Full hub compliance inspection (exit condition)
  baton prompt <id>                            Generate Baton Pass Prompt (cross-workspace)
  baton install [--global|--project] [--no-readme] [--lang <en|zh>]
                                               Install/refresh guard stub into agent instructions files (idempotent)
  baton link [--remove]                        Link central engine into PATH as baton / handoff
  baton brief [target]                         Generate inbox snapshot
  baton sync                                   Scan receipts/ to register incoming receipts
  baton drift --common | --platform <p>        Upstream contract drift tracking
Scope root: --root <dir> | BATON_ROOT / HANDOFF_ROOT | upward search for .handoff-hub.json | fallback to central Hub
Cross-repo target: ${[...TARGETS].join(' | ')}    type: bug | feature | breaking | question
Intra-repo lane: defined by configuration          type: task | bug | feature | question | continuation`);
    }
    process.exit((cmd && !isHelp) ? 2 : 0);
  }
}
