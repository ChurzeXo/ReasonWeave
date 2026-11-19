# 19 — 全栈反未接线与垂直切片交付法则 (Anti-Orphan & Vertical Slicing Protocol)

> **导读**：本章旨在根治 AI 辅助研发（Vibe Coding / 多 Agent 协同）中最高频出现的隐蔽工程退化——**“底层能力已写好，但上层调度器/路由/UI 未接线（Wiring Gap / Dead Code）”**。
> **宪法权威**：遵循 [ADR-0009 (Anti-Orphan Deterministic Wiring Governance)](../../../group/architecture/adr/0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md)。

---

## 1. 现象与病理剖析

在 LLM 驱动的编码过程中，经常出现令人沮丧的“伪完成（The Illusion of Completion）”：
* **症状**：Agent 宣称“功能已实现并通过单元测试”，但实际上系统整体完全不可用；底层 Executor 函数孤悬一旁，LLM Planner 动作空间看不到它，前端路由表里没有它，UI 页面也没挂载它。
* **病理根源**：
  1. **水平分层交付陷阱（Horizontal Slicing Trap）**：Agent 在单一上下文内只关注当前打开的文件或函数，倾向于“先写底层实现并写个单元测试自嗨”，随后认为任务结束。
  2. **“Prompt 祈祷”的必然失效**：单纯在 Prompt 中嘱咐“记得接线”，无法抵抗大模型注意力机制的衰减。
  3. **单元测试的局部欺骗性**：孤立的 Unit Test 只能证明函数自身逻辑正确，**无法证明它已被接入主调用拓扑**。

---

## 2. 三大核心治理铁律（Layer 1 全局规约）

所有协作 Agent 必须无条件遵守以下三条交付准则：

### 2.1 铁律一：垂直切片交付法则（Vertical Slicing Rule）

* **严禁水平单层交付**：禁止只交付底层的 Executor 函数、API Client、数据模型或孤立 UI View。
* **端到端原子提交**：任何新增的原语（Primitive）、能力、路由或页面，必须在**同一次变更（Commit/PR）**中完成纵向穿透闭环：
  $$\text{底层实现} \longrightarrow \text{注册表/Schema/路由声明} \longrightarrow \text{上层调度器/Planner/主导航入口}$$
* **反未接线自检**：若改动涉及“对外提供新能力”，提交前必须回答：**“系统的哪个主入口现在能够实际触发该代码？”**

### 2.2 铁律二：完成定义（DoD）的接线必要项

* **断言延伸**：底层函数的单元测试通过只是完成的前提，**不等于任务闭环**。
* **接线实测（Wiring Verification）**：DoD 必须包含上层调用链识别该能力的实测证据：
  - **Agent/LLM 架构**：Planner 的可用 Action 列表中已包含新原语，且包含合法 Schema/Docstring；
  - **后端/API**：路由表已注册，且主 App/Router 导出树上挂载了新端点；
  - **客户端/UI**：NavigationStack、TabBar 或父级 Container View 具备实际跳转/触发入口；
  - **小程序**：`app.json` 或宿主页面的 `usingComponents` 静态声明已闭环。

### 2.3 铁律三：交割双盲孤儿审计（Blind Audit Protocol）

* 在通过 `units/handoffs` 或多 Agent 异步交接时，审计方（`to_lane: audit`）的**第一道防线**必须是“接线与孤儿检查（Orphan Check）”：
* 凡在 Git Diff 中发现新增了 `export` 函数、Class、Struct 或 View，但主调用拓扑（Entrypoints）中从未出现该符号引用者，**审计方享有无条件驳回权（Reject），直接打回实施方重整**。

---

## 3. 边缘门禁联邦化哲学（Layer 2 Federated Guardrails）

各具体业务仓库的技术栈各异（Python、Rust、Swift、小程序等），为避免过度工程化与环境摩擦，**拒绝由中央脚手架强行注入重量级全栈依赖**，采用“联邦治理”：

### 3.1 门禁分级设计（Fast Local Gate vs Heavy CI Gate）
为避免 Pre-commit 耗时过长导致开发者/Agent 滥用 `--no-verify`，门禁必须分级：

| 级别 | 运行阶段 | 耗时预算 | 执行内容 |
|---|---|---|---|
| **Fast Gate** | 本地 `pre-commit` | $\le 2\text{s}$ | 纯内存集合对等性测试（`test_wiring`）、`cargo check`、路由 JSON 完整性检查 |
| **Heavy Gate** | `pre-push` 或 CI | 允许 $10\text{s} \sim 2\text{min}$ | 全量编译器 warning/clippy、SwiftUI `periphery` 引用图扫描、端到端集成烟雾测试 |

### 3.2 拒绝高假阳性工具（The Vulture Lesson）
- **经验教训**：在动态语言（如 Python）中，盲目引入全仓静态死代码扫描工具（如 `vulture`）作为提交阻断门禁，会因为框架反射、动态装饰器产生大量误报，陷入维护 Whitelist 的无底洞。
- **正解**：推崇**“单一事实源（SSOT）装饰器反射 + 内存级集合对等测试（Parity Test）”**。

---

## 4. 反假接线三层正交解耦、分级自查与呈批协议 (L1 / L2 / L3 · ADR-075 实战沉淀)

> **单一事实源（SSOT）**：完整规范与模板定义在 [`units/orphan/README.md`](../../orphan/README.md)（§5–§8），本节与之保持严格一致。

### 4.1 三层正交解耦原则

在解决“未接线”后，必须进一步防御**“假接线（Fake Wiring）”**（如仅改 Schema 计数、路由映射存在但工厂返回空任务、或底层吞错/伪造成功）。治理体系严格正交拆分为三层：

1. **L1（Fast Gate · 静态拓扑与结构存在性）**：
   - 严格收敛为可判定的**双向拓扑零差集**（含显式 `Tool(name=...)` / `types.Tool(name=...)` 注册表提取与**反向幽灵工具拦截**）+ 基础结构存在性（分支须调用真实工厂并流入返回、禁 `pass` 空分支、禁 `SKIP_*` 环境变量绕过）。
   - **明令禁止**在 L1 离线 AST 中追逐无穷表达式、恒假求值或反射黑名单（防 Rice 定理不可判定性死循环）；反射与动态执行统一由 `.githooks/pre-commit.d/10-review-gate`（OpenGrep SAST）守卫。
2. **L2（Contract Tests · 运行时语义与失败传播）**：
   - 在真实项目唯一运行时（如 `.venv/bin/python`）执行，强制接入 **CI** 与 **`preflight.conf` `RECONCILE_CMD`**。
   - 验证：① 全量路由/目标映射产出非空实体；② 失败传播与反假成功（`0` / `None` / 空事件 Fail-Closed、异常向上传播不吞没）；③ 内置变异自证（`--verify-mutations`，证明篡改/吞错时测试必红）。
3. **L3（Runtime Attestation · 密码学运行期设备侧存证）**：
   - 涉及真机/外部设备产出写入持久化存储前，采用**非对称 Ed25519**（**严禁**对称 HMAC）+ **新鲜度硬门限校验**（绑定 `serial` + 时间戳 `<= 60s` + 状态哈希 + 结果摘要），缺失/过期/篡改/不匹配时 100% Fail-Closed 熔断拒写。

### 4.2 Tier 1 / Tier 2 分级自查触发矩阵

| 分级 | 触发场景 | 核心自查动作 |
| :--- | :--- | :--- |
| **Tier 1（轻量专项）** | 单点参数透传修改、单路由/单分支新增 | 核对参数全链路透传与单分支可达性，跑通对应 L1 局部检查与 L2 定向契约测试。 |
| **Tier 2（全局自查）** | 注册表变更、跨模块/跨端契约调整、动态加载区改动或发布前验收 | 执行全量 **注册表双向差集**、**孤儿扫描**（`lab orphan scan`）、**动态加载盲区定性隔离**（标注历史盲区或 `[实验态/禁止接入]`）与 **跨端 SSOT 对账**，跑通 L1 + L2（含 `--verify-mutations`）全量串联。 |

### 4.3 Agent 自主识别与呈批开单协议

* **本任务新引入断链**：当场修完并跑通 L1/L2 复测，严禁遗留。
* **越界 / 历史 / 跨端未接线或假接线**：严禁静默跳过或越界硬改；必须附带 **`文件:行号` + L1/L2 复现证据**，主动询问人类是否执行 `baton new` 开立专项整改工单。

---

## 5. 下游消费方 Agent 落地指南

当你在下游具体项目中执行需求时，请按对应技术栈与接入规范查阅本仓提供的参考模板：
* **新项目 `AGENTS.md` / `GEMINI.md` 接入（SSOT 指针制）**：业务仓**不得复制**长篇方法论，只放极简本地路由映射（`AGENTS.md` 分级自查段 **`<= 12` 行**、`GEMINI.md` 执行守卫段 **`<= 6` 行**），保留 `$(lab path orphan)/README.md` 指针。直接复制 [`$(lab path orphan)/templates/wiring/project-agents-gemini-templates.md`](../../orphan/templates/wiring/project-agents-gemini-templates.md) 并逐项核验 4 项初始化验收清单。
* **Python 项目**：参考 `$(lab path orphan)/templates/wiring/python-parity-test.py.template` 编写内存对账测试。
* **Rust 项目**：参考 `$(lab path orphan)/templates/wiring/rust-exhaustive-match.md` 启用 `#![deny(dead_code)]` 与穷尽模式匹配。
* **SwiftUI 项目**：参考 `$(lab path orphan)/templates/wiring/swift-periphery.md` 配置分级图谱扫描。
* **微信小程序 / TS**：参考 `$(lab path orphan)/templates/wiring/miniprogram-route-guard.js.template` 挂载路由 AST 探针。
