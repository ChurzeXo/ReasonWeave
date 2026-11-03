# PROBLEM-2026-10-21 — 「收到交接即执行」缺机器门禁：接入桩自相矛盾拉黑仓内新单 + `forwarded` 在 workspace=same 语义空转

> 状态：问题说明 + 解决方案建议（供 handoffs 维护方**统一处理**）
> 报告方：Tappy（仓内 intra-repo 模式 · 2026-10-21，真·多窗口 A/B 实测）
> 影响范围：**所有真·多窗口 intra-repo 仓**（工作单元靠 lane 分野、A/B 是两个独立 Agent 会话）；**跨仓大概率同型**（见 §3 排查）
> 建议处理人：handoffs 契约维护方（改 `handoff.mjs` / `README.md` / `RESPONSE-TEMPLATE.md` / 接入桩，升版本号）
> 前置：与 `PROBLEM-2026-10-12-handoff-executor-role.md`（工作单唯一性）、`PROBLEM-2026-10-14-receipt-prompt-on-same-workspace.md`（回执交付行）**同根族**——都是「契约写明了、桩/引擎没落地」的可见性缺口。本篇补第三条：**「收到即执行」这个启动事件同样没落地**。

---

## 0. 一句话结论

契约正文**已经**规定「落我 lane 且在我手中的 handoff 就是唯一工作单，直接动工 + 写回执」（`README.md:188`），
但**接入桩**却写「**只认「进行中」**：`closed/accepted/rejected/draft/forwarded` 一律不处理」（`handoff.mjs:1292`，各仓 `AGENTS.md` 同文）。
仓内 `workspace=same` 的新交接**天生停在 `draft`**（`cmdNewIntra` 写死；same 又免 `forward`），于是桩的这条**把每一个新单子都拉黑**。
实测（Tappy `audit-20261021-01-task`）：B 窗口收到交接、读了、**据桩判定「不处理」而停手**——不是 agent 失职，是桩亲手递的陷阱。

---

## 1. 现象（实证 · Tappy 真·多窗口）

- A 窗口（impl lane，发起方）建 `audit-20261021-01-task`（`to_lane: audit` / `workspace: same`），`handoff forward` 后状态 `forwarded`。
- 用户在 B 窗口（audit lane）说「请收 Tappy 交接」→ B 跑 `handoff status` → 确认目标 ID → **Read 交接全文** → 改进程后只做了「复核 A 的回执自述数字」，**没做审计单要求的「审计方自备夹具独立实测」**，并回了句「审计单已 forward，无需我转发」。
- 用户当场纠正：**「你不要转递审计单，你要负责审计」**。
- B 自查根因：**桩第 1292 行**。`handoff status` 把该单渲染成「已转递」桶，桩说 `forwarded` 一律不处理 → B 把「审计该由 audit lane 做」外推给了「另一个主体」，但同仓 same 下 **`impl`/`audit` 只是 lane 标签，不是两个真 Agent**——单子确实该 B 做。

> 原始现象用户一句话：「一个窗口的 Agent 给了你同仓交接（审计任务），但是你收到交接后，没有进行审计，只是读了一遍交接。」

---

## 2. 根因（契约内部矛盾 · 附代码/行号 · 已逐条读实）

| # | 位置 | 现状 | 问题 |
|---|------|------|------|
| 1 | `handoff.mjs:1292`（= 接入桩 `STUB_BODY`，各仓 `AGENTS.md`/`CLAUDE.md` 同文） | 「**只认「进行中」**：`closed/accepted/rejected/draft/forwarded` 一律不处理」 | **拉黑 `draft`/`forwarded`**——与 `README.md:121`「`draft` 对依赖方一律=待处理」、`:188`「落我手即工作单」**逐字冲突** |
| 2 | `README.md:121` / `190-206`（Agent Consumption Contract · v2.7） | 「`draft` + `forwarded` 都入 pending」；「**严禁用 draft / forwarded 判断该不该开工**」 | 契约正文完全正确，但**没被桩/引擎吸收**（桩反向执行） |
| 3 | `handoff.mjs:572-617` `cmdNewIntra` + `:595` | 仓内新交接写死 `status: 'draft'`；`workspace_default` 默认 `'same'` | same 下**不会**自动 `forward`，单子**永远**停在桩要拉黑的状态 |
| 4 | `handoff.mjs:899-911` `cmdForward` + `README.md:166` | `forward` 语义 = 跨仓「用户已发给依赖方」；same **免转递**（无此动作） | **`forwarded` 在 same 下描述一个不存在的动作**——语义空转（用户的「「已转递」也不对」正指此） |
| 5 | `handoff-status.mjs:148` `STATUS_LABEL` | `forwarded: '已转递'`（跨仓口吻） | same 桶标签照搬跨仓，误导 agent 认为「已发出去、有人接手」 |
| 6 | `handoff.mjs`（`check`，`:1036+`） | 只校验文件格式（命名/frontmatter/锚节/evidence） | **无任何门禁**说「一条 `draft` 的仓内单躺 N 小时没人动」；「只读不执行」系统层零红灯 |

**根因（一句话）**：`forwarded` 是**跨仓**状态（真有一个「发出去」的人肉事件），被无差别搬进 `workspace=same`——那里既无转递事件、单子又会停在 `draft`，**两个状态都让桩判「不处理」**。契约正文（v2.7）早已修正「draft 亦待处理」，但**桩是 2026-09-04 跨仓事故的补丁，从未随 v2.7 同步**，于是桩成了压过正文的那层。

---

## 3. 跨仓排查结论（维护方要求）

**结论：跨仓「不会触发同一 bug，但存在同源隐患。」** 分点：

### 3.1 跨仓为什么不会踩同一个坑

- 跨仓有**真·转递仪式**：用户必须手动把交接发给依赖方（人肉通道，`DESIGN.md §1`）。这个动作**本身就是「收到即执行」的唤醒事件**——依赖方 agent 是**带着那句转递话术**冷启动的，上下文里已有「你收到一条交接」，不需要 `handoff status` 去发现。
- 因此跨仓 agent **不会**先去读「只认进行中」再决定——它是被用户直接点名的。桩那条对跨仓是冗余的（对齐 `README.md:121` 本意：draft/forwarded 都该处理）。

### 3.2 但跨仓有三处同源隐患

1. **桩对跨仓 agent 同样反向**：若某跨仓 agent 恰用 `handoff status --for <target>` 自发现（而非被用户点名），它会看到 `draft`/`forwarded` 的待办，但桩说「不处理」→ 同样漏做。跨仓只是**更少发生**，不是**不会发生**。
2. **`forward` 仍是被依赖方交付的信任锚**：契约明说 `forward` 是「可选的事后标记」，`draft` 也算待处理（`README.md:190-206`）——但跨仓实践里用户常**直接递文档不跑 forward**，此时单子停在 `draft`。桩若被照字面执行，跨仓也漏。
3. **跨仓无「执行方代理」概念**：跨仓 `--for <target>` 的 pending，桩同文，同样要求 agent 自己判断「我该开工」。跨仓因有人肉转递兜底而未爆，但**机制上依赖「用户一定会转递」这一假设**——`PROBLEM-2026-10-12` 的 `SWOOP-20260904-02` 事故正是该假设失效的实证。

### 3.3 一句话给维护方

> **桩第 1292 行是跨仓语境写的（防误处理已闭环/已回执），被无差别套到了 `draft`/`forwarded`——而同仓 same 的每一个新单都在 `draft`。所以跨仓「少发生」，同仓「必发生」。**

---

## 4. 建议修复（供维护方择一或组合）

### P0 · 桩纠错：删除「拉黑 draft/forwarded」（治本 · 一行改动）

把 `handoff.mjs:1292` 的
> `- **只认「进行中」**：closed/accepted/rejected/draft/forwarded 一律不处理。`

改为（对齐 `README.md:121`/`188` 本意）：
> `- **待处理 = `draft` + `forwarded`（对依赖方/本 lane 均待办，v2.7 起）；仅 `received`（已回执等审计）、`closed`（已闭环）不处理。**`

同步重跑 `handoff install` 刷新各仓桩（marker 幂等）。**风险极低**：正文早已这么规定，桩只是在追平。

### P1 · `forwarded` 在 workspace=same 去语义化（治「已转递不对」）

二选一：
- **(a) 状态折叠**：仓内 `workspace=same` 下 `cmdForward` 改 no-op 或直接跳过 `draft→forwarded`，让单子**直接由 `draft` 进入「待执行」**语义（`workspace=same` 不存在转递事件）。
- **(b) 标签分区**：`handoff-status.mjs:148` 的 `STATUS_LABEL` 按模式分档——same 下 `draft`/`forwarded` 统一渲染为「**待执行**」（而非「待转递」/「已转递」），消除「已转递=已有人接手」的误导。

推荐 **(b)**（改动小、可逆、不破坏跨仓状态机），配合 P0。

### P2 · 引擎生成「收到即执行」的起动事件（治「没东西强制执行」）

跨仓靠人肉转递唤醒；**同仓 same 无唤醒事件**，靠 `handoff status` 自发现——但 §2 门槛 6 显示无红灯。建议：
- `handoff status` 输出**加一节「待执行（本 lane）」**，把 `draft`/`forwarded` 且 `to_lane==我` 的单显式标「→ 应开工：Read → 执行 → 写回执」，与「已闭环」桶物理分开；
- （可选）新增 `handoff pending --for <lane>` 只输出**该开工的项**，供 B 窗口冷启动第一跑——把「发现任务」从「读状态桶自己判断」变成「命令直接给结论」。

---

## 5. 你（报告方）点的四块设计问题 · 现状与建议

> 用户原话：「窗口 A、B 角色如何定义，交集状态如何处理，交集 close 归谁处理，发起交接方对交接回执内容是否需要复核」。

| # | 问题 | 契约现状 | 建议 |
|---|------|----------|------|
| 1 | **A/B 角色定义** | 只有 lane（`from_lane`/`to_lane`）+ 三条「执行方不 accept/reject」（`README.md:171`） | 契约补**角色两句话**：`发起方 = 建单 + 收回执 = 审计 = 唯一 close 权`；`执行方 = 按验收判据动工 + 写回执，不 accept/reject`。**明确 lane 是可分饰的标签，不是「另一个 Agent」**（同仓 same 尤须一句：单子落你 lane 即你动工，别外推） |
| 2 | **交集状态（same 共享工作树）** | `README.md:166`「改前只按 frontmatter/文件内容定归属，严禁 mtime 推断」 | 已是好规；建议补**并发写护栏**：same 下同时只能一个 lane 的窗口在改（`timing` 字段已有 `sequential\|concurrent`），concurrent 时要求**首行注释标 owner**，防两窗口同改一文件 |
| 3 | **close 归谁** | `README.md:171-172`：`close_policy=sender` 由发起 lane；`self` 由后继会话（`continuation`） | 契约正确。**本 bug 的真问题不是「归谁」，是「B 从没进入执行态」**——修 §4 P0 后 close 归属自然生效。补一句：**审计必须独立实测**（`COREML-CONVENTION.md` 规则 3 已写，建议上提进 `README.md` 正文，别只躺在 convention 说明里） |
| 4 | **发起方是否复核回执内容** | `README.md:263` `accept` **前置内容门禁**（锚节+转递提示词+evidence）+ `v2.12.3` 伪回执门禁 | **是，且必须**——契约已强制（`accept` 拒收伪回执，goods-stores 教训）。本 bug 中 A（impl）**确实**该复核，而 A 的失职与 B 的失职**同因**：桩让两者都以为「不是我的活」 |

---

## 6. 验收判据（本问题修复是否到位）

- [ ] 桩 `handoff.mjs:1292` 不再把 `draft`/`forwarded` 列为「不处理」；`handoff install` 后各仓 `AGENTS.md` 桩已刷新（marker sha 变）。
- [ ] 仓内 `workspace=same` 新建交接后，`handoff status` 明确显示「**待执行**」（而非「已转递」或「待转递」），且 B 窗口读它即知「该我动工」。
- [ ] `handoff status --for <lane>` 有一条只列「本 lane 该开工项」的视图（或 `handoff pending`）——B 冷启动第一跑即得结论，不需人工从状态桶推断。
- [ ] `README.md` 有 A/B 角色两句话 + 「lane 是可分饰标签」；`COREML-CONVENTION.md` 规则 3（审计独立实测）上提进正文。
- [ ] 端到端：真·多窗口 A 建单 → B **据桩直接执行**（不再出现「读了但判定不处理」）→ 写回执 → A 复核内容门禁 → close。

---

## 7. 报告方侧已做的临时缓解（待契约修复后回收）

- Tappy `.handoffs/` 内本报告落地前，A/B 两窗口的**操作纪律**：见到 `to_lane==我` 的 `draft`/`forwarded` 单**一律当作工作单执行**（人工覆盖桩第 1292 行）。
- **不新增细则副本**（守 `README.md:5` 禁复制）；本报告即输入，修复后无需回收别的。

---

## 附：证据链

- 契约正文：`README.md:121`、`:166`、`:188`、`:190-206`、`:263`
- 桩（自相矛盾处）：`handoff.mjs:1292`；同文见 Tappy `AGENTS.md` 接入桩节
- 状态机：`handoff.mjs:572-617`（`cmdNewIntra`）、`:899-911`（`cmdForward`）、`handoff-status.mjs:148`（`STATUS_LABEL`）
- 同根族历史：`PROBLEM-2026-10-12-handoff-executor-role.md`、`PROBLEM-2026-10-14-receipt-prompt-on-same-workspace.md`
- 实测：Tappy `.handoffs/handoffs/audit-20261021-01-task.md` + 其回执（B 未审计 → 用户纠正 → B 亲审闭环）
