<!-- adr-template v1.0 · tier: frozen · source: ~/Documents/lab/adr/ -->

# ADR-0007: Agent Baton 状态机安全防御与工作区物理沙箱规约架构决策 (State Machine Defense & Workspace Jail)

- **状态（Status）**：🔒 Frozen
- **冻结日期**：2026-11-12
- **决策人**：churze + Agent (AEF 架构委员会 · impl & audit lanes)
- **关联证据**：
  - 消费方缺陷报告：[`units/handoffs/reviews/handoff-engine-defect-report-20261111.md`](file:///Users/churze/Documents/lab/units/handoffs/reviews/handoff-engine-defect-report-20261111.md)
  - 独立双盲审计工单：[`.handoffs/handoffs/audit-20261112-01-task.md`](file:///Users/churze/Documents/lab/.handoffs/handoffs/audit-20261112-01-task.md)
  - 独立双盲审计回执：[`.handoffs/receipts/audit-20261112-01-task-resp.md`](file:///Users/churze/Documents/lab/.handoffs/receipts/audit-20261112-01-task-resp.md)
  - 状态机全量自动化实测套件：[`units/handoffs/scripts/verify_baton_v226_gates.sh`](file:///Users/churze/Documents/lab/units/handoffs/scripts/verify_baton_v226_gates.sh)
  - 核心交付 Commit SHA：`dc2c450`, `455ef04`, `545b73b`
  - 引擎版本：`units/handoffs` v2.26.0

---

## 1. Context（背景 / 问题）

在消费方（Tappy 仓）与平台底座（lab 仓）跨仓真实协作与工单交接中，团队排查并定位了一系列高危状态机与工作区越界穿透隐患：
1. **状态机脆弱性与空交付洗白（Hollow Delivery Laundering）**：
   工单若曾被驳回（`rejected_at` 存在），执行方即使未实质修改回执正文，或回执结论依然为 `REJECTED`/`NO-GO`，仍可通过 `baton deliver` 强行推进至交付态，甚至发起方可直接调用 `accept` 闭环，导致被驳回的质量缺陷未经实质整改被洗白闭环；
2. **鉴权缺失与状态抢跑竞态（Premature Acceptance & Identity Ambiguity）**：
   `accept` 缺乏调用者身份强鉴权，执行方自身或第三方未授权角色可自填闭环；同时未检测前置交付信号，允许在 `delivered` 之前提前强关；
3. **误闭环缺乏原子追回机制（Lack of Reopen Channel）**：
   工单一旦因误操作执行 `accept` 闭环后，缺乏受状态机保护的逆向撤销通道，使得误闭环工单无法合法恢复流转；
4. **历史驳回轨迹丢失（Audit Trail Loss）**：
   覆盖写回执会导致历史多轮驳回意见被静默覆盖，无法保留长期追溯凭据；
5. **Agent 顺从性角色漂移与跨仓越界穿透（Role Drift & Cross-Repo Jailbreak）**：
   当 Agent 在当前仓（如 `/lab`）会话中接收到来自外部仓（如 `/Tappy`）的交接指令或带有外部角色标签（如 `请【实现方】执行重开`）的提示词时，容易产生顺从性角色漂移，误越过当前仓库的物理边界，通过跨目录跳转去代行外部仓角色、修改外部代码，严重违背了工作区自治底线与安全隔离契约。

---

## 2. Decision（决策 · 冻结内容）

### 2.1 状态机安全防御加固体系（v2.25.0）
1. **D1: 驳回封印与防空交付（Rejection Seal & Anti-Hollow Delivery）**：
   若工单存在 `rejected_at` 时间戳，执行方提交回执与交付时必须满足两大硬门禁：
   - 回执正文必须与驳回前存在实质语义改动（字符距离差异 > 10 且正文非空），杜绝正文无改动的空交付；
   - 提取的回执结论（Verdict）严禁包含 `REJECTED`、`NO-GO` 或未通过标识，否则 `deliver` 100% 抛出 Exit 1 硬拦截。
2. **D2: 发起方独占闭环鉴权与前置交付校验（Initiator Exclusive Acceptance）**：
   - 闭环操作（`baton accept`）强制鉴权调用者必须为该工单的发起方 `from_lane`（或发起方工作区），严禁执行方或第三方自闭环；
   - 强制前置状态校验：工单必须显式处于 `delivered` 终态方可闭环；未交付、处于驳回中、或 `needs_change=true` 时 100% 拒绝闭环。
3. **D3: 回执历史快照备份与驳回记录继承（Receipt Snapshot & History Inheritance）**：
   - 每次写入新回执前，自动将已有回执备份为 `.bak.md` 时间戳快照；
   - 回执中若存在历史「## 驳回记录」小节，写入新回执时必须 100% 无损继承追加，确保整改全链路留痕。
4. **D4: 原子文件互斥锁与并发安全（Atomic Ticket Mutex Lock）**：
   引入 `withTicketLock` 与 `atomicWriteFile`，工单读写加注排他锁（`.lock`），写文件先写临时副本再进行系统级原子重命名，杜绝多 Agent 并发写入产生的文件损坏与竞态撕裂。
5. **D5: 误闭环安全追回机制（Baton Reopen Channel）**：
   新增 `baton reopen <id> -n "<理由>"` 命令，提供合法逆向状态流转通道：原子清除 `closed` 闭环标记，将工单状态打回 `forwarded` 待办，并强制要求记录追回原因至审计流。

### 2.2 工作区物理沙箱与身份锚定守卫体系（v2.26.0）
1. **D6: 工作区物理沙箱硬拦截（Workspace Jail Hard Guard）**：
   - 引擎引入 `assertWorkspaceJail(op)` 核心拦截器；
   - 支持通过 `BATON_WORKSPACE_JAIL` 环境变量或根工作区配置锚定当前进程的物理边界；
   - 严禁任何读写操作跨出当前工作区目录树；一旦检测到 `process.cwd()` 或操作目标文件脱离该合法工作区，所有写操作（new, receipt, deliver, accept, reject, reopen 等）直接抛出 Exit 1 阻断。
2. **D7: Agent 物理工作区与身份锚定法则（Workspace & Identity Anchoring Discipline）**：
   - 将工作区守卫写入所有接入桩（`AGENTS.md` / `CLAUDE.md` / `README.md`）的最顶层「早拦 Preflight」；
   - **铁律宣告**：Agent 会话生命周期严格绑定于宿主物理工作区（Active Workspace）。严禁通过 `cd` 越界代行外部仓角色、修改外部代码或操作外部工单状态机；若收到外部仓库工单指令，必须在会话第一步**硬性拒单**，输出跨仓交接提示词引导人类在目标仓专属 Agent 会话中派发。

---

## 3. Implementation Status（落地情况 · 截至 2026-11-12）

全量自动化验证门禁套件 [`verify_baton_v226_gates.sh`](file:///Users/churze/Documents/lab/units/handoffs/scripts/verify_baton_v226_gates.sh) 实测全部通过（5/5 PASS）：

| 门禁项 | 机制 / 不变式 | 实测结果 | 交付证据 |
|---|---|:---:|---|
| Gate 1 | 驳回封印与防空交付（Rejection Seal） | ✅ PASS | 空交付硬拦截 + REJECTED交付拦截 + 实质整改通过放行 |
| Gate 2 | 闭环强校验与身份鉴权（Acceptance Auth） | ✅ PASS | 非发起方自闭环硬拦截 + 未交付闭环拦截 + 发起方合规闭环放行 |
| Gate 3 | 回执历史备份与驳回继承（History Snapshot） | ✅ PASS | 自动备份 .bak.md 快照 + 历史驳回记录无损继承 |
| Gate 4 | 误闭环安全重开通道（baton reopen） | ✅ PASS | 成功打回 forwarded 状态并清除闭环时间戳 |
| Gate 5 | 工作区物理沙箱守卫（BATON_WORKSPACE_JAIL） | ✅ PASS | 跨仓越界写操作 100% 物理拦截（Exit 1） |

---

## 4. Consequences / Invariants（冻结后不可变量）

- **INV-1: Rejection Seal Invariant（驳回封印不变量）**：
  凡存在 `rejected_at` 的工单，回执未做实质语义变更或结论仍未通过者，`baton deliver` 必须 100% 阻断；未交付前发起方 `baton accept` 必须 100% 阻断。
- **INV-2: Acceptance Exclusivity Invariant（闭环独占不变量）**：
  工单闭环鉴权严格属于发起方 `from_lane`，执行方自身及未授权第三方无权调用 `accept`。
- **INV-3: Physical Workspace Jail Invariant（工作区物理沙箱不变量）**：
  工单操作与代码修改必须严格限制在当前仓库物理目录边界内。跨仓写操作一律硬阻断，严禁跨仓代行角色。
- **INV-4: Audit Traceability Invariant（审计追溯完整性不变量）**：
  任何驳回、重开或整改操作，历史回执快照与驳回意见小节必须全量无损留痕，严禁覆盖消除。
