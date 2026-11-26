# ReasonWeave Constitution (AEF 2.0)

**Version:** 2.0  
**Project:** ReasonWeave (Agent Engineering Framework & Disciplines Toolkit)  
**Last Updated:** 2026-11-26  

> 本文件是 `ReasonWeave` 能力库的最高工程宪法，所有维护本库及接入本生态的 Agent、人类工程师及 Unit 必须无条件遵守。  
> 宪法改动须经人类明确审查批准，任何 Agent 不得擅自放宽、稀释或绕过条款。

---

## 1. 核心定位原则 (Product Principles)

### P1 — 单一事实源，规范不漂移 (Single Source of Truth)
本能力库各 Unit（`adr`, `backlog`, `preflight`, `review-gate`, `handoffs`, `orphan`, `spec-guard`, `skills`, `worktree`, `playbook`）是对应工程规范的唯一权威事实源。
消费方项目只通过指针与指令引用，严禁在消费方内联复制规则正文。

### P2 — 正交解耦，按需插拔 (Orthogonal & Pluggable)
每个 Unit 各司其职，解决一个维度的工程纪律问题。
Unit 之间保持松耦合，不得产生强环形依赖；消费方可单选任意一个或多个 Unit 接入，互不阻塞。

### P3 — 渐进演进与向后兼容 (Progressive & Backward Compatible)
对能力库结构的任何调整，必须保证现有消费方现有路径（如通过根目录 symlink）平滑可用。破坏性改动必须有显式升级通知与迁移过渡期。

### P4 — 动作标准化与 SOP 工业化落地 (Standard Operating Procedures as Law)
长篇设计哲学与日常工程作业严格解耦。所有高频、高危与跨端协作链路必须具备标准作业程序（SOP）：明确定义前置检查（Input）、标准步骤（Steps）、完成判定（DoD）与自愈降级（Fallback），确保异构 Agent 与新接手工程师机械执行不走样。

---

## 2. 技术与纪律原则 (Technical Principles)

### T1 — Hooks are Law, Prompts are Requests
在提交门禁（`preflight`, `review-gate`, `spec-guard`）与执行验证中，模型自然语言自律只是“请求”，Git Hooks、CI 脚本与可执行物理探针才是不可绕过的“法律”。

### T2 — 门禁 Fail-Open 与受控自验
门禁工具在环境缺件时采取 `fail-open`（告警不阻断），以防中断正常工作；但任何门禁安装或更新后，必须通过故意制造违规进行真实阻断验证。

### T3 — 运行态与能力库严格分离
`units/handoffs/` 的运行态票据（handoffs、receipts、inbox、archive）与 `.worktrees/` 物理隔离区属于业务落地历史痕迹，绝对禁止混入版本管理与打包分发中。

### T4 — 身份确定性与禁止角色漂移 (Identity Pinning & Anti-Impersonation)
任何参与工程流转的 Agent 严格受绑定身份约束，严禁越权代办、伪装其他角色或自我闭环；身份防御由环境/会话锁（`HANDOFF_LANE` / `baton lane`）与物理门禁强制保障，无需在日常交接提示词中堆砌口号式警示。

### T5 — 工单全生命周期单一定位与主题恒定 (Single Ticket Lifecycle & Invariant Topic)
工单在创建时即生成全局唯一的永久标识符（形如 `<PROJECT>-YYYYMMDD-HHMM`），在全生命周期内（从 Round 1 到 Round N 及历次驳回整改）一律使用同一工单 ID 在原单中原位流转，严禁派生新单或变更 ID；任务主题（Task Topic）必须保持业务母题恒定，任何轮次状态、返工说明与临时噪音严禁污染主题字段，确保跨角色交接与追踪认知零漂移。

### T6 — 会话亲和性与上下文隔离防串扰 (Session Affinity & Anti-Cross-Session Hijack)
工单在创建与首次转递时强制锚定发起会话标识（`conversation_id`），显式建模 1:N 对话与工单拓扑归属；在多会话并发研发中，Agent 必须具备会话亲和性感知，人类未显式指定工单 ID 时严禁越俎代庖从全局待办中抢单或闭环异源会话工单，彻底阻断跨窗口工单串扰。

### T7 — 反未接线垂直切片与分层治理律 (Anti-Orphan & Deterministic Vertical Slicing · ADR-0009)
严禁水平单层交付。任何新增原语、子命令或路由，必须在同一次提交内完成“底层实现 → 注册表/Schema 声明 → 主入口可见”闭环；严格遵守 L1（静态零差集）、L2（运行时非空与失败传播）、L3（设备真实验签）三层正交反假接线判据。

### T8 — 三态裁决与环境阻断免责呈报律 (Three-State Verdict & Blocked Environment Protocol · ADR-0017)
任务裁决严格实行三态治理：**GO（验收交付）**、**NO-GO（裁决驳回）**、**BLOCKED（受阻挂起）**。
- 普通执行方（`impl` / `worker`）专享交付权，严禁越界调用 `baton reject`；
- 遭遇宿主容器沙箱权限拦截（如 `socketpair E_ACCESSDENIED`）、基础设施宕机等不可抗力（`E_ENV`）时，执行方严禁静默挂起或虚假伪造，必须在 15 分钟内提交包含系统错误堆栈的受阻回执（BLOCKED Receipt），将事实源交由发起方协调或闭环，根治认知死锁。

### T9 — 密码学防伪凭据与反自审闭环律 (Cryptographic Audit & Anti-Self-Closing Guarantee · ADR-0010 / ADR-0016)
独立审计工单（`to_lane=audit`）流转强制核验系统签发的 HMAC 防伪挑战令牌（`audit.token`）；发起方严禁自填审计回执，执行方严禁自审自闭环。出站提示词卡片必须包含显式双向角色锚定（`[发起角色]` 与 `[接单指令]`），彻底封杀跨端技能语义撞车与角色倒错。

### T10 — 全 CLI 物理契约对齐与零环境寄生律 (CLI Contract & Hermetic Testing Sandbox · ADR-0013)
所有 CLI 入口必须提供 `--version` / `-v` / `--help` / `-h` 并以 Exit 0 退出；版本号必须 100% 动态读取自各 Unit 的 SSOT（`VERSION.md`），严禁手写静态字面量；单测严禁在宿主仓直接写操作，必须强制在独立临时沙箱隔离运行，严防环境污染。

### T11 — 微观工程原子技能零污染切片调度律 (Zero-Pollution Micro-Skills Invariant · ADR-0015)
微观工程技能库（TDD 红绿循环、排错四步法、先验后报、需求澄清）与宏观 Baton 工单流转深度融合；技能采用“渐进式原子切片”按需注入，严禁全局上下文臃肿污染；重大重构与交割审计必须提供技能落地与 E1 级客观证据。

---

## 3. Unit 隔离与维护原则 (Unit Isolation Principles)

### U1 — 边界自洽 (Unit Self-Contained)
每个 `units/<unit-name>` 拥有独立的规范（README）、版本文件（VERSION）、变更日志（CHANGELOG）与专属 `AGENTS.md`。

### U2 — 跨 Unit 变更显式化
改动涉及多个 Unit 或影响全局打包规范时，必须在 `group/architecture/dependency-graph.md` 声明，并通过对应 Unit 独立发布。
