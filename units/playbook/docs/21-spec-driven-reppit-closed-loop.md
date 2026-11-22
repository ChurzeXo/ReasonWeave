# 21 — SDD 规约驱动开发与 RePPIT 分级工程防线

> 本章回答一个工程痛点：**AI Agent 拿到任务就冲动编码（Jump-to-Implementation Reflex），改到一半架构失控，留下大量半成品孤儿**。
> **理论与实践背书**：斯坦福大学 CS146S《现代软件开发者》SDD 教学、ADR-0012 架构决议；机件位于 `units/spec-guard/`、`units/handoffs/`、`units/orphan/`。

---

## 1. 痛点：为什么不能“Prompt-First”？

给 Agent 发一句需求让它“直接改代码”，在玩具项目上看似高效，但在真实软件工程中存在三大致命缺陷：
1. **随意假设与架构漂移**：缺少明确的前置规格（Spec），Agent 会凭借局部的训练记忆脑补数据结构和接口入参，导致系统逐渐偏离原始架构；
2. **上下文稀释与遗忘**：长对话中，初期关键背景随着 Token 增长被压缩淡化，导致代码前后自相矛盾；
3. **水平空壳交付（Half-baked Orphans）**：Agent 喜欢先写底层工具函数，如果上下文耗尽被打断，就会在仓库中留下无主死代码（违背 ADR-0009）。

**解法**：开发者必须从“逐行编码者”转变为**“规约制定者与反馈循环协调者（Loop Controller）”**。

---

## 2. RePPIT 五步工程闭环

RePPIT（Research $\to$ Propose $\to$ Plan $\to$ Implement $\to$ Test）将 Agent 研发拆解为 5 个具有**持久化活文档（Living Artifacts）**的离散阶段：

```
       [ Stage 1: Research ]   ──▶ 产出: 01-research.md (只读现状，零假设)
                 │
                 ▼
       [ Stage 2: Propose ]    ──▶ 产出: 02-proposals.md (方案分叉对比 · 不可逆决策人类拍板)
                 │
                 ▼
       [ Stage 3: Plan ]       ──▶ 产出: 03-spec.md (数据契约+负向护栏) + 04-tasks.md (垂直切片)
                 │
                 ▼
       [ Stage 4: Implement ]  ──▶ 生产代码垂直切片落地 + orphan 增量自检
                 │
                 ▼
       [ Stage 5: Test ]       ──▶ 产出: 05-evidence.md (Clean-Runner 独立双盲验收)
```

### R — Research（只读调研，严禁写代码）
* 强制以只读模式（`tool-profile: readonly`）扫描现有项目结构、依赖版本与主调用链路；
* 产出 `01-research.md`：仅记录客观事实，严禁在此阶段自行提出修改方案或动代码。

### P — Propose（方案推演与架构权衡）
* 针对复杂需求，必须在 `02-proposals.md` 给出至少 2 个具名方案（Option A vs Option B）；
* 对比各方案的复杂度、性能损耗、代码侵入度与潜在技术债；
* **决策不可逆性拍板**：
  - **可逆决策**：Agent 记录理由后可自主选型推进；
  - **不可逆决策（跨 Unit/破坏性改动/Schema 迁移）**：必须停机等待人类或架构角色（`arch`）显式签字确认。

### P — Plan（规格制定与垂直切片）
* 将选定方案固化为 `03-spec.md`：明确数据模型、接口契约、修改文件白名单与红线禁区；
* 将任务拆解为 `04-tasks.md`：**每一项 Task 必须是完整的垂直切片**（底层改动 + 注册/声明 + 主入口接线 + 单测验证），禁止水平空壳交付。

### I — Implement（受控实现与增量自愈）
* Agent 严格对照 Plan 分步执行改动；
* 每一步执行完毕，立即就地运行 `lab-orphan check-diff`，确保没有引入未接线的孤儿导出。

### T — Test（双盲对账与负向先红后绿）
* 修复安全漏洞或边界问题时，前置编写 Exploit 负向测试，验证其未修前报错（Exit != 0）、修复后通过（Exit == 0）；
* 由独立的审计角色（`to_lane: audit`）使用 `clean-runner` 在干净子进程中重跑，以物理 Exit 0 签发交付回执。

---

## 3. 双层分级机制（Tiered Gating）

为了杜绝形式主义，避免微小修改被繁重流程拖垮，必须严格实行分级治理：

| 分级 | 判定标准 | 准入与豁免规则 | 必需产物 |
|---|---|---|---|
| **Tier 1 (轻量变更)** | 单点参数透传、局部代码优化、纯文档更新、单分支确定性 Bug 修复 | • 免除强制 `02-proposals.md` 双方案对比<br>• 免除强制 Exploit 负向测试<br>• 仅跑增量门禁与已有单测 | 常规 Git Commit + 简要 PR/回执 |
| **Tier 2 (关键变更)** | 跨 Unit 协作、引入新依赖、数据库 Schema 变更、对外 API 调整、安全与权限边界改动 | • 强制执行完整 RePPIT 闭环<br>• 强制不可逆决策人类拍板<br>• 强制负向 Exploit 测试与 spec-guard 机器对账 | `specs/<id>/` 下 01 到 05 完整活文档 |

---

## 4. 规约对账：杜绝“静态文档坟场”

* **铁律**：脱离了代码断言的自然语言文档一律视作不可靠。
* 依据 `spec-guard` 的 **P3′ 三元映射对账机制**：
  - `03-spec.md` 中声明的关键不变量，必须映射到代码中的 `@Invariant("...")` 注解或单测用例中的可执行断言；
  - 门禁自动对账不变量覆盖率，发现规约与实现漂移时直接阻断合入。

---

## 5. 角色防膨胀：Tool-Profile 替代 Lane 泛滥

* 严禁为 RePPIT 的不同阶段创建诸如 `lane: research`、`lane: plan` 等临时物理角色；
* 全仓角色恒定为 `[arch, impl, audit]` 三元中枢；
* 调研期的只读约束，通过工具能力配置（`tool-profile: readonly`）与 `--blind` 脱敏实现，确保架构轻量稳定。
