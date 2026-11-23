<!-- adr-template v1.0 · tier: frozen · source: ~/Documents/lab/adr/ -->

# ADR-0015: 微观工程认知规训、渐进式原子技能库与双核门禁融合架构决策 (Micro-Engineering Cognitive Discipline, Progressive Skills & Dual-Core Gate Architecture)

- **状态（Status）**：Accepted (🔒Frozen)
- **生效日期**：2026-11-23
- **决策人**：churze + Antigravity (arch) (AEF 架构委员会)
- **关联证据**：
  - 外部事实源研读留痕：[obra/superpowers](https://github.com/obra/superpowers)（深度研读其实战沉淀的 SDD、TDD、Systematic Debugging、Worktree 边界处理与抗上下文压缩规范）
  - 本地运行留痕：ReasonWeave 在宏观中观（Baton 工单流转、双盲审计、会话亲和性锁、反孤儿接线门禁）具备确定性物理阻断，但在 Agent 微观敲代码、修 Bug、单点自验时刻缺乏即插即用的原子化规训，导致 Agent 仍有“随意发挥、跳过根因、轻率声明完成”的认知滑点。
- **涉及 Unit**：`units/playbook` / `units/handoffs` / `units/worktree` / `units/skills` (新增候选) / `global`
- **关联契约**：
  - [`0003-attention-throttle-and-workspace-driver.md`](0003-attention-throttle-and-workspace-driver.md) (ADR-0003 · 注意力节流与 Workspace Driver)
  - [`0007-agent-baton-state-machine-defense-and-workspace-jail-spec.md`](0007-agent-baton-state-machine-defense-and-workspace-jail-spec.md) (ADR-0007 · 工作区物理沙箱)
  - [`0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md`](0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md) (ADR-0009 · 垂直切片与主入口接线)
  - [`0012-spec-driven-development-reppit-and-tiered-guardrails.md`](0012-spec-driven-development-reppit-and-tiered-guardrails.md) (ADR-0012 · SDD 与分级防护)

---

## 1. Context（背景与问题）

在 ReasonWeave（原 lab-agent-toolkit）的既有体系中，我们通过最高宪法原则 `T1 — Hooks are Law, Prompts are Requests` 建立了极强的**物理硬防线**：
1. **宏观流转**：Agent Baton 提供确定性状态机、会话亲和性锁（Anti-Cross-Session Hijack）、HMAC-SHA256 审计防伪签名与会话平息窗口；
2. **底线门禁**：`preflight`、`review-gate` (OpenGrep SAST) 与 `orphan check-diff`（L1 静态拓扑零差集、L2 运行时可达）确保不变量被物理 Exit 1 严密锁死；
3. **环境隔离**：`units/worktree` 提供原生 `git worktree` 自动分配、软链共享 `node_modules` / `.venv` 缓存。

然而，在精读以 `obra/superpowers` 为代表的顶尖 Agent 技能框架工程源码后，我们发现当前 ReasonWeave 在**微观执行层（Micro-Engineering Level）**存在明显的“断层”：

1. **“大纲详实但临门一脚缺机件”（Playbook vs. Micro-Skills）**：
   - 我们在 `units/playbook`（09-skills, 11-evidence, 18-shift-left）沉淀了深刻的工程方法论，但它们是供人类和 Agent 通读的长篇理论文档（往往数千字）。
   - 当 Agent 在具体任务中坐下来**写第一个函数、定位一个复杂 Crash 或准备交代交付**时，这些长篇文档无法常驻在上下文中。Agent 往往退化为大模型原始的“凭直觉猜 Bug、先写实现再补测试、声称完成却未当场运行验证”的浮躁作风。
2. **认知借口与投机取巧心理阻击不足（Lack of Anti-Rationalization Shields）**：
   - 大模型在面临复杂任务、上下文过载或多轮失败时，具有极强的“合理化借口倾向”（如：“这次改动很简单，不用深究根因”、“我先写代码再写测试也是一样的”、“改动很小，子 Agent 说通过肯定过了”）。
   - Superpowers 实战证明，通过显式的“**Iron Law + 借口 vs 现实对账表（Anti-Rationalization Table）**”进行前置心理阻断，能将 Agent 的执行自律性提升数倍。
3. **上下文零污染流水线尚待制度化（Context-Efficient Artifact Pipeline）**：
   - Superpowers 的 SDD（Subagent-Driven Development）通过 `task-brief`（仅提取当前任务切片）、`review-package`（大 diff 落盘传路径，控制器绝不内联加载 diff）以及 `progress.md` 账本机制，实现了极低 token 消耗与抗上下文压缩（Compaction Survival）。
   - 我们的 Baton 目前工单正文与回执虽然具备结构化模板，但在单会话内切片派发子任务时，容易因累积历史和内联大 diff 导致上下文被迅速烧干。
4. **两阶段审查（Two-Stage Review）尚未在契约中正交解耦**：
   - 现存审查容易将“契约有没有漏（Spec Compliance）”与“代码写得好不好（Code Quality）”混在一起，导致审查模型顾此失彼。

---

## 2. Decision（核心架构决策）

```
┌────────────────────────────────────────────────────────────────────────┐
│               ReasonWeave ADR-0015 双核门禁与微观工程技能架构           │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. 软硬兼备：双核门禁协同架构  │ 前置 Cognitive Skills（思维引导与习惯规训）│
│    (Dual-Core Gate Model)      │ 联动 后置 Physical Hooks/Gates（物理退出码法律）│
├────────────────────────────────┼───────────────────────────────────────┤
│ 2. 微观工程原子技能矩阵        │ 原生沉淀 4 大高频微观技能（TDD / Debugging /  │
│    (Micro-Engineering Skills)  │ Verification / Brainstorming），<20KB 硬预算│
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. 心理防线：反合理化阻断表    │ 每个技能内置不可违背铁律（Iron Law）与针对大模型│
│    (Anti-Rationalization)      │ 偷懒借口的现实对账表，阻断伪装与跳步       │
├────────────────────────────────┼───────────────────────────────────────┤
│ 4. SDD 与 Baton 深度融合       │ 引入 Task-Brief 切片与 Review-Package 差分包， │
│    (Zero-Pollution Pipe)       │ 大 Diff 绝对禁止内联加载进主控上下文           │
├────────────────────────────────┼───────────────────────────────────────┤
│ 5. 正交两阶段审查契约化        │ 明确划界：Stage 1 规约契约符合度（Spec） vs    │
│    (Two-Stage Review Contract) │ Stage 2 代码质量与健壮性（Quality），双单独立决│
└────────────────────────────────┴───────────────────────────────────────┘
```

### 2.1 确立“软硬兼备：双核门禁协同架构”（Dual-Core Gate Architecture）
- **核心原则**：
  - **单纯的 Prompt 是脆弱的**（Prompts are Requests）：没有物理门禁，大模型一定会穿透规则、跳过测试或偷工减料；
  - **单纯的 Hook 是盲目的**（Hooks without Guidance are Frustrating）：没有前置的思维规训，Agent 在违规被物理打回后只会盲目猜测、无序重试甚至心理崩溃；
  - **双核联动**：Agent 的行为必须由**前置原子 Skill（规定如何思考、如何拆解、如何调查根因）**指引，并最终在 Git Commit、Baton Deliver 与 CI 阶段被**后置物理 Hooks（不变量探针、OpenGrep SAST、反孤儿接线校验）**严苛验收。

### 2.2 建设 ReasonWeave 原生微观原子技能资产（Native Micro-Skills）
在 ReasonWeave 中正式建立开箱即用的微观技能集（存放在全局与项目级 `.agents/skills/`，并在 `units/playbook/skills/` 设立事实源）：
1. **`systematic-debugging`（系统化排错技能）**：
   - **铁律**：`NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST`（未明晰根因前严禁修改代码碰运气）；
   - 四阶段流程：Phase 1 根因调查（错误信息详读、跨组件边界诊断插桩、调用栈逆向溯源） $\to$ Phase 2 模式对照 $\to$ Phase 3 单一假设最小测试 $\to$ Phase 4 单一修改与回归测试；
   - **三振出局原则（Architecture Escalation）**：如果连续 3 次 Fix 均告失败，强制停止，禁止尝试第 4 次改动，立即转入架构级反思并与人类确认。
2. **`test-driven-development`（红绿重构技能）**：
   - **铁律**：`NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`（无红测不写生产代码）；
   - 先写极简失败用例 $\to$ 亲眼见证真实报错（确保测试在测目标行为） $\to$ 编写最小代码转绿 $\to$ 重构保持全绿。
3. **`verification-before-completion`（先验后报技能）**：
   - **铁律**：`NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE`（无即时真实证据严禁声称完成）；
   - 严禁使用“应该修好了”、“大概通过了”等揣测词汇；声称完成前必须在当前对话中真实完整执行测试/构建命令，核实退出码为 0 与失败数为 0。
4. **`brainstorming`（需求澄清与设计收敛技能）**：
   - 当遇到非简单单行修改的创意、特性或重构任务时，强制先收敛需求，列出方案权衡并形成简明 Design Doc 征得人类批准，严禁盲目开工。
5. **体积与渐进披露硬约束（Skill Size Invariant）**：
   - 单个 `SKILL.md` 正文字节数强制控制在 **20,000 bytes** 以内（防止 Claude Code 等宿主在 Context Compaction 时对技能进行毁灭性截断）；
   - 超过阈值的详细实现规范、长样例与支持脚本必须拆解至 `references/` 目录，按需二次懒加载。

### 2.3 融合 SDD（Subagent-Driven Development）与 Baton 零污染流水线
1. **任务切片化转递（Task Brief Extraction）**：
   - 在执行多任务计划时，禁止让执行子 Agent 读取全量漫长 Plan 文件；提供类似 `task-brief` 机制，精准提取当前 Task 的约束、边界与明确字面量落盘为 `task-N-brief.md`，实现单点上下文纯净。
2. **Review Package 物理隔离（Zero-Pollution Diff Hand-off）**：
   - 审查代码时，禁止主控 Agent 将几十 KB 的 `git diff` 原文读入自己的上下文；
   - 统一通过脚本将 `commit log`、`diff --stat` 与完整带上下文的 diff 输出至独立的 `review-<base>..<head>.diff` 文件，审查 Agent（或 Baton 独立审计窗口）直接以此文件为输入完成审查，主控 Agent 仅接收结构化审查结论（Verdict）。
3. **两阶段审查契约化（Two-Stage Review Contract）**：
   - 升级 `units/handoffs/RESPONSE-TEMPLATE.md` 与审计标准，将审查明确拆分为：
     - **Stage 1: 规约与契约符合度（Spec Compliance）**：是否严格遵循了需求契约？有无未履约项或私自缩水？
     - **Stage 2: 代码与架构质量（Code Quality & Architecture）**：边界处理、类型安全、反假接线、DRY、无死代码。
   - 任何一项存在 Critical 缺陷均不得放行。

---

## 3. Consequences（影响与效益）

### 正向收益（Benefits）
1. **消灭微观编码滑点**：填补了从高层 Playbook 理论到底层 Agent 具体写代码之间的鸿沟，从第一行代码起规训 Agent。
2. **Token 与上下文利用率成倍跃升**：通过任务切片 Brief 与 Diff 审查包落盘传递，主控 Agent 上下文几乎不被大代码量污染，极大延缓 Compaction 发生，彻底消灭长任务会话失控。
3. **软硬互锁，杜绝假治理**：既有 Superpowers 的精细思维引导，又有 ReasonWeave 的物理门禁兜底，即使模型试图在 Prompt 层面偷奸耍滑，也会在 `pre-commit`（反孤儿接线、SAST、单测）中被当场击毙。

### 成本与妥协（Trade-offs & Mitigations）
- **维护成本增加**：需要维护额外的 Skills 文件及同步机制。
  - *缓解方案*：严格复用已在业界经受数千次真实考验的标准 Skill 模板，保持极简 POSIX 脚本依赖；利用单测门禁核验技能体积与链接完整性。

---

## 4. Implementation Plan（实施路线）

1. **Phase 1: 技能资产建设**
   - 在 `units/playbook/skills/` 沉淀权威微观技能包（`systematic-debugging`、`test-driven-development`、`verification-before-completion`、`brainstorming`）。
   - 编写 `tests/skill-contract.test.mjs`，确保技能结构与体积（<20KB）符合规范。
2. **Phase 2: 协作管道升级**
   - 提取并实现纯 POSIX/Node 版的 `task-brief` 与 `review-package` 生成原语，无缝对接 `units/worktree` 与 `units/handoffs`。
   - 在 `units/handoffs/RESPONSE-TEMPLATE.md` 中固化两阶段审查（Spec Compliance vs. Code Quality）维度。
3. **Phase 3: 文档与全链路接入桩联动**
   - 联动更新 `units/playbook/docs/09-skills.md`、`10-handoff.md` 与 `11-evidence.md`。
   - 运行 `baton install` 幂等刷新全载体接入桩。
