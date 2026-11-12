<!-- adr-template v1.0 · tier: proposed · source: ~/Documents/lab/adr/ -->

# ADR-0008: Agent Baton 核心收敛与异构并发会话韧性架构决策 (Core Convergence & Heterogeneous Session Resilience)

- **状态（Status）**：Accepted (🔒Frozen)
- **生效日期**：2026-11-12
- **决策人**：churze + Agent (AEF 架构委员会 · core/handoffs)
- **关联证据**：
  - 用户核心使用场景诊断（同仓同对话/同仓跨对话/跨仓跨对话 · 多工单与跨客户端）
  - 缺陷修复轨迹：v2.21.0 ～ v2.28.0 连续补丁复盘
  - 状态机死锁事故记录：审计 NO-GO 无法按规范退回、Audit Nonce 校验阻断驳回、forwarded 静默跳过
- **关联 Backlog**：[`docs/backlogs/09-feat-agent-baton-core-convergence-and-resilience.md`](file:///Users/churze/Documents/lab/docs/backlogs/09-feat-agent-baton-core-convergence-and-resilience.md)
- **引擎版本**：`units/handoffs` v2.29.0+

---

## 1. Context（背景 / 问题分析）

在连续多轮真实项目交互中，Handoff Unit 频繁出现状态机阻断、门禁死锁与规则冲突（从 v2.21 至 v2.28 连续打补丁）。根本原因在于：**悲观防作弊硬门禁不断堆叠，与无状态、多并发、跨客户端的 LLM 会话生命周期产生了本质阻抗失配（Impedance Mismatch）**。

### 1.1 三大核心场景的病理剖析

1. **场景 1：同仓 · 同对话 · 多个工单（一人分饰多角与自我死锁）**
   - **身份精神分裂**：Baton 底层假定“一个会话 = 单一固定 Lane”。当同一个 Agent 会话先作为 `from_lane=design` 派发工单，随后承接用户指令转入 `to_lane=impl` 实施时，触发了“发起方严禁自填回执/自交付”的硬门禁。
   - **监听自我挂起**：若在同对话内执行 `baton forward <id> --wait`，当前对话直接被阻塞，Agent 无法开工去写代码；若跳过 wait，又触发“擅跳监听”门禁。
   - **多工单注意力污染**：同对话内打印多个工单状态，LLM 在拼接参数时容易混淆工单 ID 与 Nonce，触发 Fail-Closed 令牌不匹配拦截。

2. **场景 2：同仓 · 跨对话 · 多个工单（冷启动猜谜与并发冲突）**
   - **身份冷启动猜谜（Who am I?）**：新开窗口无前置对话记忆，高度依赖环境变量 `HANDOFF_LANE` 或用户提示词。若未声明，Agent 极易越权看错待办或报错拒单。
   - **物理工作区共享冲突**：多数 AI 客户端（Cursor、Windsurf、Antigravity）绑定单一根目录，多工单并发改动代码时，工作区与 `git status` 产生竞态撕裂，导致 `--evidence-commits` 互相踩踏。
   - **探针孤儿化**：客户端刷新、重载或对话切走会导致后台 `fs.watch` 探针丢失，执行方交付后无法唤醒发起方。

3. **场景 3：跨仓 · 跨对话 · 多个工单（双轨制割裂与跨物理边界长链路）**
   - **同仓车道与跨仓收发箱的双轨制包袱**：底层代码充斥海量 `if (MODE === 'intra-repo')` 分支（字段名割裂如 `needs_change` vs `needs_iggle_change`、`to_lane` vs `target`）。跨仓与同仓逻辑互相渗透，修好一边破坏另一边。
   - **物理隔离（v2.26.0）与多步握手脆弱性**：严格禁止跨仓 `cd` 后，跨仓交接经历长达 8 步文件系统复制流转，任何软链或通知延迟都会使工单沦为“僵尸挂起”。

4. **交叉维度：异构 AI 客户端（Heterogeneous AI Hosts）**
   - 瞬态无状态执行（Antigravity Tool Call 等）与持久终端（Claude Code 等）执行模型差异巨大；
   - 接入桩膨胀至上千字，导致参数量受限的模型发生注意力崩溃，规则越多犯错概率越高；
   - 门禁一味 Exit 1 报错阻断，缺乏一键自愈引导，导致 Agent 在上下文内胡乱猜测。

---

## 2. Decision（根本解决策）

本 ADR 确立 5 项核心架构重构准则，从“打地鼠式防卫门禁”全面转向“微内核收敛与韧性自愈”：

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Baton Micro-Kernel Architecture                      │
├────────────────────────────────┬───────────────────────────────────────┤
│    1. 极简 5 态状态内核        │ draft → forwarded → received          │
│       (Unified State Machine)  │       → delivered → closed (支持退回) │
├────────────────────────────────┼───────────────────────────────────────┤
│    2. 门禁中间件解耦           │ 校验下沉为 Delivery Guard;            │
│       (Egress-First Guards)    │ 驳回/退回享有【无条件安全下车通道】   │
├────────────────────────────────┼───────────────────────────────────────┤
│    3. 工单自描述身份机制       │ 弃用环境猜谜；显式 --as <lane> 参数;  │
│       (Self-Describing Identity│ 工单自持 from/to 边界                 │
├────────────────────────────────┼───────────────────────────────────────┤
│    4. 瘦接入桩与错误驱动自愈   │ 桩精简至三行工作流；                  │
│       (Slim Stub & Self-Heal)  │ CLI 报错 100% 携带可复制自愈命令      │
├────────────────────────────────┼───────────────────────────────────────┤
│    5. 同/跨仓模型统一抽象      │ 统一数据字典，跨仓降维为投递 Driver   │
│       (Unified Ticket Model)   │ 彻底消灭 needs_iggle_change 历史包袱  │
└────────────────────────────────┴───────────────────────────────────────┘
```

### 2.1 D1: 状态机内核收敛与同跨仓双轨合流（Unified Kernel & Single Model）
1. **统一数据模型**：
   - 废除所有历史派生字段（彻底移除 `needs_iggle_change` 等），同仓与跨仓统一采用单一规范的数据字典（`id`, `status`, `from`, `to`, `needs_change`, `workspace`, `audit_nonce`, `evidence`）。
   - 跨仓交接降维为“工单投递驱动器（Transport Driver）”，底层状态机内核 100% 同构。
2. **极简 5 态生命周期**：
   - 状态严格收敛为：`draft`（草稿/就绪）→ `forwarded`（已派发/待办）→ `received`（回执登记）→ `delivered`（终态交付待验）→ `closed`（已闭环）。
   - 驳回退回（`reject`）统一将状态置回 `forwarded`，带不可磨灭的驳回审计标记（`rejected_at`, `rejected_by`, `reject_count`）。

### 2.2 D2: 安全防伪门禁中间件化与【无条件安全下车通道】（Unconditional Egress）
1. **解耦状态机与防伪逻辑**：
   - Audit Nonce 校验、证据合规校验（`--evidence-paths`）从状态机基座解耦，沉淀为独立中间件；
   - 校验仅在**正向推进（`receipt --deliver`, `deliver`, `accept`）**时作为前置拦截闸门（Delivery Gates）。
2. **无条件安全下车通道（Unconditional Egress Gate）**：
   - **绝对铁律**：驳回（`reject`）、撤销、关闭、重开等退回或阻断动作，**享有无条件通行权**；
   - 严禁因工单缺少 Nonce、回执格式瑕疵或前置数据漂移而拦截驳回操作；任何时候只要实测不过，审计方或发起方必须能一键打回工单。

### 2.3 D3: 工单自描述身份机制与显式上下文覆盖（Self-Describing Ticket & Explicit Identity）
1. **去中心化身份识别**：
   - 彻底废除对隐式会话猜测（`HANDOFF_LANE`）的单一强依赖；工单自身 Frontmatter 明确记录当前归属责任方（`to_lane` / `to_repo`）。
2. **同对话多工单解锁（`--as <lane>`）**：
   - 在同对话多角色场景下，支持命令行显式声明执行身份：`baton receipt <id> --as impl ...` 或 `baton reject <id> --as audit ...`；
   - CLI 校验当前工单的 `from`/`to` 与 `--as` 是否合法，合法即放行，无需切换会话环境变量，根除“一人分饰多角”死锁。

### 2.4 D4: 接入桩瘦身与错误驱动一键自愈（Slim Stub & Self-Healing CLI）
1. **接入桩（Stub）去恐吓化与瘦身**：
   - 将上千字的规则接入桩精简为**“三行核心工作流”**（查待办 → 实测交付 → 失败退回）；
   - 不再让 LLM 在上下文内死记硬背数十条边界规则，降低轻量模型的注意力负担。
2. **报错自带确定性修复命令**：
   - 无论发生何种校验未通过（如缺少 Nonce、needs_change 不一致、证据路径缺失），CLI 报错末尾必须**100% 打印精准可复制的一键自愈命令**（例如：`👉 可运行: baton nonce <id> --reissue 补签后重试` 或 `👉 可运行: baton check <id> --fix 自动修复`）。

### 2.5 D5: 跨客户端异步平息与幂等轮询补偿（Host-Agnostic Resilience）
1. **双模监听支持**：
   - 保留基于 `fs.watch` 的长连接 `--wait`（适用于支持后台长任务的 Host，如 Antigravity background task）；
   - 新增幂等查询与平息判定：`baton wait <id> --poll <seconds>` 及 `baton status --sync`，使无持久进程树的客户端也能安全轮询。

---

## 3. Consequences & Trade-offs（影响与权衡）

- **Positive**：
  - 彻底根除因防作弊硬门禁导致的“正常操作被卡死”；
  - 完美支持同仓同对话多工单并发流转，不再发生角色分裂报错；
  - 消除同仓/跨仓双轨制的代码重复度，核心代码体积预计精简 20%~30%；
  - 接入桩大幅缩短，提升各主流 AI 客户端（Claude, Cursor, Windsurf, Antigravity）的指令遵从率。
- **Trade-offs**：
  - 引入 `--as` 显式参数需要在接入桩与帮助命令中形成统一规范；
  - 清理跨仓历史遗留字段（`needs_iggle_change`）需要提供向上兼容垫片或迁移升级工具。

---

## 4. Compliance & Verification（验证规范）

1. **同仓同对话多工单并发测试**：单个自动化用例模拟同一进程/会话中交替创建、派发、驳回、交付多张工单；
2. **无条件退回测试**：针对恶意抹除 Nonce、格式损坏的工单，验证 `reject` 仍能 100% 畅通执行并打回；
3. **同跨仓双模型合流单测**：验证跨仓与同仓模式共用同一套状态转移内核。

---

## 5. Implementation Status（落地事实留痕 · 2026-11-12）

- **实施阶段**：Phase 1 ～ Phase 5 已全量落地交付。
- **关联 Backlog**：[Backlog-09 (closed)](file:///Users/churze/Documents/lab/docs/backlogs/09-feat-agent-baton-core-convergence-and-resilience.md)
- **契约与版本升级**：`units/handoffs` 升至 **v2.29.0**（README、AGENT-GUIDE、CHANGELOG 及接入桩已全量同步）。
- **实测验证结果**：`node --test units/handoffs/tests/audit-receipt.test.mjs` 全套 17 项端到端用例（含 Phase 1～4 全量场景）**100% PASS**。`baton doctor` 全仓健康检测通过。
- **架构状态**：本决策全量生效并正式锁定（🔒Frozen）。
