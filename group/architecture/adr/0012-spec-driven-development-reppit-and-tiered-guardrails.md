<!-- adr-template v1.0 · tier: frozen · source: ~/Documents/lab/adr/ -->

# ADR-0012: 规约驱动开发 (SDD) 与 RePPIT 闭环分级工程防护架构决策 (Spec-Driven Development, RePPIT Closed Loop & Tiered Engineering Guardrails)

- **状态（Status）**：Accepted (🔒Frozen)
- **生效日期**：2026-11-22
- **决策人**：churze + Antigravity (arch) + WorkBuddy (audit) (AEF 架构委员会)
- **关联证据**：
  - 斯坦福大学 CS146S《现代软件开发者》（*The Modern Software Developer*, 2025/2026）第 2、4、6 周教学与工程实践（RePPIT 闭环、上下文工程、Agent 仓库契约、AI 代码安全防线）
  - 仓内架构评审工单与回执：[1d5d6882-e43a-4a10-a5b3-cbcb9546799e](file:///Users/churze/Documents/lab/.handoffs/handoffs/1d5d6882-e43a-4a10-a5b3-cbcb9546799e.md) 及 [1d5d6882-e43a-4a10-a5b3-cbcb9546799e-resp.md](file:///Users/churze/Documents/lab/.handoffs/receipts/1d5d6882-e43a-4a10-a5b3-cbcb9546799e-resp.md)（裁决：Verified / 裁剪采纳）
  - 生产痛点复盘：AI Agent 冲动性编码（Jump-to-Implementation Reflex）、未经推演的单边架构臆断、纯文字文档脱节沦为“文档坟场”、以及盲目扩充角色导致的会话死锁
- **涉及 Unit**：`units/spec-guard` / `units/review-gate` / `units/orphan` / `units/handoffs` / `units/playbook` / `specs` / `global`
- **关联契约**：
  - [`0004-spec-guard-and-drift-prevention.md`](0004-spec-guard-and-drift-prevention.md) (ADR-0004 · 架构漂移防御)
  - [`0006-triad-engineering-defense-and-mutation-sensitivity.md`](0006-triad-engineering-defense-and-mutation-sensitivity.md) (ADR-0006 · 三元对账)
  - [`0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md`](0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md) (ADR-0009 · 垂直切片交付法则)
  - [`0011-vibe-security-anti-suppression-and-dependency-reachability.md`](0011-vibe-security-anti-suppression-and-dependency-reachability.md) (ADR-0011 · 虚假安全感穿透与可达性治理)
  - [`units/playbook/docs/06-spec-kit.md`](file:///Users/churze/Documents/lab/units/playbook/docs/06-spec-kit.md) (GitHub Spec Kit 与 AEF 映射)

---

## 1. Context（背景与问题）

在以大模型和自主 Coding Agent 为主力的工程研发场景中，传统敏捷开发正面临新型质量退化危机：
1. **冲动性编码反射（Jump-to-Implementation Reflex）**：Agent 在接到任务时，本能地立即修改文件，跳过现状调研（Research）与方案对比（Propose），往往以局部最优或臆测方案破坏全局架构；
2. **形式主义与吞吐瓶颈**：若无差别对所有细小改动强加全套规格（Spec）和人类审批，会导致极高的工程摩擦力，使人类沦为疲于点击“批准”的吞吐瓶颈；
3. **“静态文档坟场”与规约漂移**：脱离了机器可执行断言（Machine Assertions）的自然语言设计文档，在代码迭代两次后便迅速失效，Agent 甚至会通过编造虚假文档逃避门禁；
4. **单边安全盲区**：规约通常只描述“功能如何正常工作”，缺失对恶意注入、非法输入和越界调用的“负向护栏（Negative Guardrails）”；
5. **角色过度膨胀与状态机撕裂**：将 RePPIT 的 5 个阶段简单粗暴地映射为多个物理 Agent Lane，会造成窗口剧增、多端状态同步混乱以及跨角色死锁。

经过 `arch` 与 `audit` 双角色独立评审，确立以“**分级防御、机器对账、能力配置、负向先行**”为核心的 SDD/RePPIT 落地架构。

---

## 2. Decision（核心架构决策）

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AEF ADR-0012 SDD & RePPIT Architecture               │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. 双层分级触发机制            │ Tier 1 (轻量变更): 免 Propose，极速通过 │
│    (Tiered Gating Mechanism)   │ Tier 2 (关键变更): 强制全套 RePPIT 对账│
├────────────────────────────────┼───────────────────────────────────────┤
│ 2. 决策不可逆性拍板原则        │ 可逆技术选型: Agent 权衡后自主推进     │
│    (Reversibility Gate)        │ 不可逆架构选型: 强制停机等待人类拍板   │
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. P3′ 三元对账活文档规范      │ specs/<id>/ 活文档绑定代码 @Invariant   │
│    (Living Artifacts with Spec)│ 严禁纯自然语言摆设，防伪铁律阻断虚假合规│
├────────────────────────────────┼───────────────────────────────────────┤
│ 4. 规约前置负向防御与测试先行  │ Spec 必须声明禁用原语与 Abuse Cases    │
│    (Negative Guardrails First) │ 缺陷修复强制先写 Exploit 负向测试(先红后绿)│
├────────────────────────────────┼───────────────────────────────────────┤
│ 5. Plan 阶段垂直切片分解铁律   │ 任务分解必须闭环: 底层+声明+入口+单测  │
│    (Vertical Slice Tasking)    │ 单 Task 完成系统必须自洽，严禁水平空壳│
├────────────────────────────────┼───────────────────────────────────────┤
│ 6. 工具 Profile 替代角色膨胀   │ 维持 arch / impl / audit 三核心 Lane  │
│    (Tool-Profile over Lanes)   │ 调研期通过 tool-profile: readonly 受限│
└────────────────────────────────┴───────────────────────────────────────┘
```

### 决策细则：

#### 2.1 双层分级触发机制（Tiered Gating）
1. **Tier 1（轻量变更 · Low Blast Radius）**：
   - **判定范围**：单点参数透传、局部代码优化、纯文档/注释放松、单分支确定性 Bug 修复。
   - **执行路径**：免除强制 `proposal.md` 方案对比，免除强制前置 Exploit 负向用例；仅需执行既有单测与增量门禁（`orphan check-diff`），保证秒级敏捷流转。
2. **Tier 2（关键变更 · High Blast Radius）**：
   - **判定范围**：跨 Unit 协作、引入新第三方依赖、数据库/存储 Schema 迁移、对外 API/契约调整、安全与权限边界改动、运行时动态加载机制。
   - **执行路径**：必须执行完整 RePPIT 闭环与活文档沉淀，缺项直接被门禁拦截。

#### 2.2 决策不可逆性拍板原则（Reversibility Gate）
1. **可逆决策（Two-Way Door）**：局部实现细节、算法内部数据结构、非导出工具函数重构。Agent 须在 `02-proposals.md` 简要记录 Trade-offs，随后可自主选型推进，无需中断人类。
2. **不可逆决策（One-Way Door）**：依赖库选型、持久化存储结构、对外协议破坏性变更、底层安全模型调整。Agent 必须停下并输出选项对比，等待人类（或 `arch` 责任人）签署批准后方可解锁 `03-spec.md`。

#### 2.3 P3′ 三元对账活文档规范（Living Artifacts with Spec-Guard）
1. **规范目录布局**：Tier 2 任务必须在 `specs/<ticket-id>/` 产生以下持久化活文档：
   - `01-research.md`：代码拓扑与依赖客观现状（只读事实，零假设）；
   - `02-proposals.md`：方案对比与决策记录（含不可逆决策人类签署标记）；
   - `03-spec.md`：数据契约、API 规格、修改文件白名单与 Invariants 清单；
   - `04-tasks.md`：原子化垂直切片任务分解清单；
   - `05-evidence.md`：物理验证证据链（测试与门禁执行输出）。
2. **机器对账铁律**：`spec.md` 中的每个 Invariant 必须映射至生产代码注解或可执行单测，由 `units/spec-guard` 进行对账；严禁仅含自然语言叙述的“摆设文档”。

#### 2.4 规约前置负向防御与测试先行（Negative Guardrails First）
1. **红线声明**：`03-spec.md` 必须设立 `## Negative Guardrails & Abuse Cases`，明令禁止违规原语（如裸 `eval`、行内 `# noqa` 裸免检）。
2. **测试先红后绿**：涉及安全修复或边界校验时，必须先在 `04-tasks.md` 首项建立 Exploit 负向测试，验证其在当前代码上能稳定触发失败（Exit != 0），修复后方可转绿（Exit == 0）。

#### 2.5 Plan 阶段垂直切片任务分解铁律（Vertical Slice Tasking）
1. **端到端自洽**：任务切片禁止水平切割（如“Task 1 写 5 个孤儿函数”）；每一个 Task 必须涵盖 `底层实现 → 注册表/声明 → 主入口调用 → 单测` 完整切片。
2. **增量自愈**：每个 Task 执行完毕必须就地验证无新增孤儿导出（`lab-orphan check-diff`）。

#### 2.6 工具 Profile 替代角色膨胀（Tool-Profile over Lane Proliferation）
1. **拒绝 Lane 泛滥**：严格维持 `lab` 现有的 `arch`、`impl`、`audit` 三条核心角色 Lane，禁止新增 `research`、`plan` 等瞬态 Lane。
2. **Profile 约束**：调研与方案分析阶段通过调用配置（如 `tool-profile: readonly`、`--blind` 脱敏）约束工具调用范围，并以提交时的 `evidence_paths` 审计确保调研期零污染。

---

## 3. Implementation Status（落地情况 · 截至 2026-11-22）

| 项 | 状态 | 落地规划 / 说明 |
|---|---|---|
| **ADR-0012 架构决议** | ✅ 已冻结 | 本文档完成决议冻结，双角色架构评审共识落盘 |
| **Backlog-13 待办工单** | ✅ 已入库 | 建立 `docs/backlogs/13-feat-sdd-reppit-tiered-guardrails.md` |
| **P0 基线复用（DoD Checklist）** | ⚠️ 实施中 | 更新 `units/handoffs/RESPONSE-TEMPLATE.md` 与垂直切片 / 负向测试验收准则 |
| **P1 穿透扫描与 Playbook 20 章** | ⚠️ 实施中 | `review-gate` 增加 `--no-suppress`；撰写 playbook 第 20 章防线战法 |
| **P2 活文档脚手架与 spec-guard 联动** | ⚠️ 待实施 | 建立 `specs/templates/` 活文档骨架，接入 `spec-guard` 对账矩阵 |
| **P3 只读 Profile 治理工具链** | ⚠️ 待实施 | `baton` 支持轻量只读 profile 声明与提交校验 |

---

## 4. Rationale（外部最佳实践与证据背书）

1. **斯坦福大学 CS146S**：确立了 AI 原生开发下 RePPIT 闭环与 Agent Context 契约的工业级教学范式；
2. **Jeff Bezos "Type 1 vs Type 2 Decisions" 原则**：可逆决策与不可逆决策分级，防止决策治理导致团队瘫痪；
3. **ThoughtWorks 活文档与架构适应度函数**：规约必须具有机器可检验性，拒绝与代码割裂的死文档。

---

## 5. Consequences / Invariants（不可变量）

1. **分级不可跨越律**：凡命中 Tier 2 判定范围的变更，严禁跳过活文档与规约对账，门禁强制拦截。
2. **不可逆决策拍板律**：不可逆架构选型必须留有人类或架构负责人的显式签署证据，Agent 严禁私自结案。
3. **负向测试先行律**：安全缺陷修复未附带先失败后通过的 Exploit 负向测试者，审计方一律裁决 NO-GO。
4. **Lane 不膨胀律**：严禁创建临时性、流程性的物理 Lane，全仓角色的单一事实源恒定为 `[arch, impl, audit]`。

---

## 6. Future（后续实现任务）

- 按四阶段落地推进 `docs/backlogs/13-feat-sdd-reppit-tiered-guardrails.md`。
