# 06 — GitHub Spec Kit：为什么用、怎么对应 AEF

> 本章按约定**只写决策与映射**，不写安装教程。安装与命令细节看官方文档：[github/spec-kit](https://github.com/github/spec-kit)（`references/links.md` 有直链）。

---

## 1. 决策：为什么选 Spec Kit

| 候选 | 结论 | 理由 |
|---|---|---|
| **GitHub Spec Kit** | ✅ 采用 | 官方维护、130K+ stars、38 个 Agent 集成（Copilot/Claude/Codex/Cursor/OpenCode…）、可换 Agent 不锁死；SDD 流程与 AEF 生命周期几乎同构 |
| AWS Kiro | ❌ | Requirements/Design/Tasks 结构好，但绑 IDE，跨端多 Agent 场景不灵活 |
| OpenSpec | ❌ 单独用 | 轻量适合增量，但没有 Convergence 环；其"增量变更"思想已被 AEF §18 吸收 |
| BMAD Method | ❌ 单独用 | 专业 Agent 角色划分强，但偏敏捷 PM 流，产物重、与 Group/Unit 结构重复 |
| 自研流程 | ❌ | 维护成本高，Spec Kit 已覆盖 specify→converge 全链 |

**结论：AEF 管"工程结构与原则"（Group/Unit、Evidence、隔离），Spec Kit 管"单个 feature 的流程"（specify→plan→tasks→implement→converge）。两者不重叠。**

## 2. 映射：Spec Kit ↔ AEF

| Spec Kit | AEF 对应 | 产物 |
|---|---|---|
| `/speckit.constitution` | §10.1 Constitution | `.specify/memory/constitution.md` |
| `/speckit.specify` | Layer 1→2 Intent→Specification | `specs/NNN-*/spec.md` |
| `/speckit.clarify` | §10.3 EARS（消除歧义） | spec 更新 + `checklists/requirements.md` |
| `/speckit.plan` | Layer 3 Architecture | `plan.md` `research.md` `data-model.md` `contracts/` |
| `/speckit.analyze` | §16 Convergence 前置检查 | 只读一致性报告 |
| `/speckit.tasks` | Layer 5 Execution | `tasks.md` |
| `/speckit.implement` | §13.7 Implement | 代码 |
| `/speckit.converge` | **Layer 7 Convergence** | 收敛报告，未完成任务回写 |
| `/speckit.checklist` | §15 Definition of Done | `checklists/*.md` |
| `/speckit.taskstoissues` | §32 Traceability | GitHub issues ↔ T-ID 映射 |

**关键点**：AEF 的 Convergence ≠ "代码写完了"。`/speckit.converge` 报告 `Converged` 才算过，未完成项会作为新 task 追加——这正是 AEF G7。

## 3. 流程纪律

```
每项目一次：  /speckit.constitution
每 feature：  specify → [clarify] → plan → [analyze] → tasks → implement → converge
                              ↑                                    │
                              └──── 未 Converged 就再跑一轮 ────────┘
```

- `clarify` / `analyze` / `checklist` 是**可选质量门**：feature 有明显歧义、或跨 Unit 影响面大时必须跑；小 Patch 可跳（AEF §18 Incremental Change）。
- **顺序不可跳**：`/speckit.plan` 之前必须有 `spec.md`；`/speckit.converge` 之后才能进 [12 章收尾门禁](12-gates.md)。

## 4. 多端项目下的特别约定

Spec Kit 默认是单仓单流程。多 Unit 项目要补三条：

1. **`specs/NNN-*/contracts/` 是 feature 级契约草案**；一旦被采纳进 `group/contracts/api.md`，必须有 ADR（[05 章 §3.4](05-adr.md)）。
2. **feature 跨 Unit 时**，`plan.md` 必须含依赖协调图章节（[14 章](14-dependency-graph.md)），声明各 Unit 的改动顺序。
3. **每个 Unit 的 implement 分支独立**（[13 章](13-parallel.md)），converge 时逐 Unit 出 Evidence。

## 5. 版本注意

OWSEL 起步于 `specify-cli 1.0.6.dev0`（`.specify/init-options.json` 可查自己项目的版本）。新版 Spec Kit 变化：

- 安装方式：`uv tool install specify-cli`（需 Python 3.11+ / uv）
- 新增 **bug-fixing 流程**（assess → fix → test，独立于 SDD）
- 生态：157 community extensions、33 presets，`Architecture Guard` / `CI Guard` 等 extension 可当门禁用
- 命令写法随 Agent 而变：`/speckit.*`（Copilot 默认）/ `/speckit-*` / `$speckit-*`

**升级 `.specify/` 前先在分支上跑一遍全链**，模板变更会导致已有 `specs/` 引用失效。

---

## 落地动作

1. `uv tool install specify-cli && specify init . --integration <agent>`，把生成的 `.specify/` 提交进 git。
2. 跑 `/speckit.constitution`，与 [04 章](04-constitution.md) 写的根 `constitution.md` 内容保持一致。
3. 在根 AGENTS.md 加一句："feature 流程必须走 /speckit.specify → … → /speckit.converge，Converged 才能进收尾门禁。"
4. 跨 Unit feature 的 plan 模板里加依赖协调图小节。

> AEF 原文对应章节：§10 Specification Model、§13 Development Lifecycle、§16 Convergence、§18 Incremental Change、§35 与现有方法论的关系（AEF 明确说明借鉴 Spec Kit 的 Intent-driven lifecycle / Convergence）。
