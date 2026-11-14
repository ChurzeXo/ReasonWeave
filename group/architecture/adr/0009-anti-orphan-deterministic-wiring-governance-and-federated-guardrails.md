<!-- adr-template v1.0 · tier: proposed · source: ~/Documents/lab/adr/ -->

# ADR-0009: 全栈反未接线（Anti-Orphan）确定性治理与联邦门禁架构决策 (Anti-Orphan Deterministic Wiring Governance & Federated Guardrails)

- **状态（Status）**：Accepted (🔒Frozen)
- **生效日期**：2026-11-14
- **决策人**：churze + Agent (AEF 架构委员会 · core/spec-guard & orphan & playbook)
- **关联证据**：
  - AI 辅助编程（Vibe Coding / 本地 Agent 协同）高频出现“底层原语/函数/组件已就绪，但上层调度器/路由/UI 产生接线断层（Wiring Gap）”问题
  - 动态静态分析工具在多技术栈下的误报/摩擦力调研（Python Vulture 假阳性陷阱、SwiftUI Periphery 构建耗时过长导致 `--no-verify`）
  - AEF 宪法原则：单一事实源、元工程库与业务运行态正交解耦、规范全局收敛而实现局部自治
- **关联 Backlog**：[`docs/backlogs/10-feat-anti-orphan-deterministic-wiring-governance.md`](file:///Users/churze/Documents/lab/docs/backlogs/10-feat-anti-orphan-deterministic-wiring-governance.md)
- **关联 Unit**：`units/orphan`、`units/playbook`、`units/handoffs`、`units/spec-guard`

---

## 1. Context（背景 / 问题分析）

在以大语言模型为主导的辅助开发（Vibe Coding / 多 Agent 协同）中，出现了一种新型且隐蔽的工程退化现象：**“功能看似写完了，实则处于空转状态”（The Illusion of Completion）**。

### 1.1 核心病理剖析
1. **水平分层交付与局部贪婪优化（Horizontal Slicing Trap）**：
   Agent 在接收到需求后，倾向于在局部文件内快速编写底层的 Executor 函数、API 客户端或单独的 UI 组件，并附带针对这些底层函数的单元测试（Unit Test）。然而，由于上下文窗口限制或缺乏对整体拓扑的感知，Agent 经常遗漏将该能力挂载至全局注册表（Tool Schema Registry）、应用路由（App Routing）或主导航树（NavigationStack）中。
2. **“Prompt 祈祷”的必然失效**：
   单纯依靠在系统提示词中告诫 AI “记得接线”，无法对抗大模型内在的注意力漂移与遗忘，必须建立**机器可验证的物理级确定性门禁（Deterministic Physical Guardrails）**。
3. **“全栈大一统物理门禁”的落地阻抗失配（Impedance Mismatch）**：
   若试图在公共元工程库（`lab`）中为所有异构栈（Python、Rust、SwiftUI、微信小程序）硬编码一套统一的本地 `pre-commit` 门禁，将产生严重的工程摩擦：
   - **环境异构性**：下游项目生态各异（如某些纯后端 Python 项目无 Node.js 或 Swift/Xcode 环境），强制要求依赖将破坏开箱即用性；
   - **假阳性与性能雪崩**：如 Python 静态死代码工具 `vulture` 在动态反射/装饰器场景下存在极高误报率；SwiftUI 的 `periphery` 依赖完整编译索引，每次提交耗时数十秒，必然导致开发者或 Agent 滥用 `git commit -n`（--no-verify）绕过门禁；
   - **违反本仓宪法**：本仓是可复用的元工程标准库，严禁与下游具体的业务运行时或特定编译器强行绑定。

---

## 2. Decision（根本解决策：联邦治理架构）

本 ADR 确立**“全局规范收敛（Central Governance），边缘门禁自治（Federated Guardrails）”**的核心架构：

```text
┌────────────────────────────────────────────────────────────────────────┐
│               Central Governance (本仓/全局事实层 SSOT)                  │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. 垂直切片交付铁律            │ 禁止横向单层交付；底层与上层接线原子提交│
│    (Vertical Slicing Law)      │ (units/playbook 宪法级规范)           │
├────────────────────────────────┼───────────────────────────────────────┤
│ 2. 接线证明作为 DoD 必要项      │ 仅有单元测试不视为完成；必须提供接线验证│
│    (Wiring Verification in DoD)│ (units/handoffs 验收判据)             │
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. 双盲交割孤儿审计            │ 审计方第一道防线为 Orphan & Wiring Check│
│    (Blind Audit Protocol)      │ (units/review-gate & handoffs 闭环)    │
└────────────────────────────────┴───────────────────────────────────────┘
                                 │ 下发治理思想与参考模板 (Cookbooks)
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│            Federated Guardrails (下游消费方 Agent 按需自治落地)          │
├──────────────────────┬──────────────────────┬──────────────────────────┤
│ Python 栈            │ Rust 栈              │ 客户端/前端栈 (Swift/小程序│
├──────────────────────┼──────────────────────┼──────────────────────────┤
│ SSOT 装饰器反射 +    │ #![deny(dead_code)]  │ 结构化路由 JSON/AST 探针 │
│ 内存级集合对等测试   │ + 穷尽枚举模式匹配   │ + 门禁分级 (本地轻量/    │
│ (Parity Test, 毫秒级)│ (编译器硬断言)       │   CI 深度引用扫描)       │
└──────────────────────┴──────────────────────┴──────────────────────────┘
```

### 2.1 D1: Layer 1 规范全局收敛（Central Governance）
1. **垂直切片铁律（Vertical Slicing Protocol）**：
   - 纳入 `units/playbook/docs/06-anti-orphan-vertical-slicing.md`。
   - 规定：任何新增原语（Primitive）、工具能力、路由或页面，必须在同一次提交中完成闭环（`实现 -> 注册/声明 -> 入口/调度器可见`），严禁拆分成无接线的孤立 commit。
2. **完成定义（DoD）与交接审计铁壁**：
   - 更新 `units/handoffs` 交付验收契约：工单回执（Receipt）的验收判定标准中，必须显式提供“接线证明（Wiring Evidence）”。
   - 在 `units/handoffs/RESPONSE-TEMPLATE.md` 中强化 `--evidence-paths` 对接线事实的追溯。凡新增能力未在调用树中呈现者，审计方享有无条件驳回权。

### 2.2 D2: Layer 2 门禁联邦化与参考实现库（Federated Guardrails & Recipes）
1. **本仓不硬编码异构栈物理门禁，仅提供可复用最佳实践模板（Recipes）**：
   - 在 `units/orphan/templates/wiring/` 沉淀各语言标准的参考实现、断言范式与轻量脚手架。
2. **让下游消费方 Agent“看料做菜、因地制宜”**：
   - 下游 Agent 拥有目标业务仓的全部上下文，应根据项目实际采用的框架、构建工具与耗时阈值，自适配挂载测试或门禁。

### 2.3 D3: 推荐门禁分级哲学（Fast Local Gate vs Heavy CI Gate）
为解决 Pre-commit 耗时过长导致绕过门禁的问题，确立分级标准：
1. **Fast Gate（本地 Git Pre-commit，执行耗时 ≤ 2s）**：
   - **Python**：运行毫秒级的纯内存集合对等性测试（`test_wiring.py`），严禁引入全仓重型静态分析；
   - **Rust**：运行 `cargo check --tests`；
   - **SwiftUI / 小程序**：运行轻量级的路由配置文件解析或静态 AST 存在性对账。
2. **Heavy Gate（Pre-push 或 CI 流水线，执行耗时 > 10s）**：
   - 运行全量 `cargo clippy -- -D warnings`、SwiftUI `periphery scan`、全仓死代码扫描与端到端集成仿真。

### 2.4 D4: 拒绝高假阳性工具，推崇“单一事实源（SSOT）+ 集合对账”
1. **Python 栈否定 Vulture 强阻断**：
   - 废除在提交门禁中使用 `vulture` 阻断的做法，彻底规避动态装饰器与反射框架导致的假阳性地狱；
   - 推荐使用 `@primitive` / `@tool` 装饰器自动反射提取 Schema，并通过 `set(implemented) <= set(planner_actions)` 内存对账。
2. **小程序/前端栈推崇轻量专用探针**：
   - 推荐编写针对 `app.json`、页面 `*.json` 依赖项的确定性对账脚本，避免庞大且脆弱的通用全仓静态分析配置。

### 2.5 D5: 错误驱动确定性自愈（Error-Driven Self-Healing）
- 所有由参考模板衍生的门禁与测试，在失败时必须明确输出**“接线缺失清单”**与**“建议修复动作”**（例如：“原语 `query_logs` 已定义但未在 `TOOL_REGISTRY` 注册，请在 `src/tools/index.ts` 中追加注册”），确保 Agent 能够依据错误日志一键自愈。

---

## 3. Consequences（影响与效果）

### 正向收益（Positive Impact）
1. **从根本上切断“伪完成”幻觉**：将“未接线”问题上升为架构级缺陷，大幅提升多 Agent 协同产出代码的真实可用率。
2. **元工程库与业务库彻底解耦**：`lab` 保持纯粹的跨栈规范定义者与模板提供者角色，零外部重量级依赖污染。
3. **零额外心流阻力**：门禁分级设计避免了本地 Git 提交卡顿，防止开发者与 Agent 形成使用 `--no-verify` 的恶习。

### 潜在代价与应对（Trade-offs & Mitigations）
- **代价**：下游新项目必须在初始化时由 Agent 或人类主动从本仓提取对应的 Wiring 模板并实施微调。
- **应对**：在 `units/playbook` 和下游提示词中固化“项目初始化接线审计清单”，并在 `lab orphan` CLI 中提供配套的辅助检测指令。
