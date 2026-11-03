# 01 — 架构：AEF 怎么组织一个项目

## 1. 七层模型（AEF §5）

任何按 AEF 组织的项目都是这七层，下层不满足则上层无效：

| Layer | 名称 | 问题 | 落地文件 |
|-------|------|------|---------|
| 1 | Intent | 人到底想要什么 | `constitution.md`、`group/product/intent.md` |
| 2 | Specification | 需求如何被固化、可验证 | `group/product/requirements.md`、`specs/NNN-*/spec.md` |
| 3 | Architecture | 技术决策是什么、为什么 | `group/architecture/system.md` + `adr/` |
| 4 | Context | Agent 能看到什么事实 | `AGENTS.md` 分层、Skills、CodeGraph |
| 5 | Execution | 谁在什么边界里干活 | Unit 目录、git 分支/worktree |
| 6 | Evidence | 凭什么说完成了 | build log、测试报告、截图、`evidence/` |
| 7 | Convergence | 结果是否回到最初意图 | Convergence Checklist、门禁 |

**顺序不可颠倒**：没有 Intent 的 Spec 是空转，没有 Evidence 的 Execution 是自欺。

## 2. Golden Loop（AEF §41）

```
Intent → Spec → Plan → Tasks → Implement → Verify → Evidence → Convergence
                                                              │
                                            不一致？回写 Spec / ADR
```

Spec Kit 的 `specify → plan → tasks → implement → converge` 就是这个环的实现，见 [06-spec-kit.md](06-spec-kit.md)。

## 3. Group / Unit 模型（AEF §6）

```
Group（单一事实源，全项目共享）
├── product/      intent.md · requirements.md
├── architecture/ system.md · dependency-graph.md
└── contracts/    api.md 等跨 Unit 契约

Unit（平台隔离，各端独立工程上下文）
├── ios/      ← 自己的 AGENTS.md、CodeGraph 索引、Skills
├── backend/
└── mcp/
```

- **Group 是"共识"**：一个事实只有一个权威来源（AEF §33 Source of Truth）。
- **Unit 是"边界"**：不同平台的 Agent 不共享上下文，只通过 Contracts 协作——这是防止"多端互相污染"的唯一手段（AEF 设计目标 G3）。

详细切分方法见 [03-units.md](03-units.md)。

## 4. 两种隔离，别混淆

这是本手册反复强调的关键区分：

| | **Unit 隔离**（平台边界） | **执行隔离**（并行碰撞） |
|---|---|---|
| 解决什么 | iOS Agent 不会去改后端代码 | 两个 Agent 同时改同一文件 |
| 手段 | 目录边界 + 各自 AGENTS.md + Shared Contracts | git 分支 / worktree / 容器 |
| AEF 章节 | §6 Group/Unit、G3 | §24 Parallel Development |
| 手册章节 | [03-units.md](03-units.md) | [13-parallel.md](13-parallel.md) |

**Unit 隔离不能替代 git 隔离。** OWSEL 教训：三端目录分得很清楚，但整个仓库连 `git init` 都没有——一旦两个 Agent 并行改同一 Unit，没有任何机制能防止互相覆盖。

## 5. Agent 角色（AEF §11）

AEF 定义六种角色：Product / Architecture / Planner / Implementation / QA / Reviewer。

落地原则（与业界一致，见下）：**Implementation 是唯一写者**，其余角色要么不碰代码，要么只产出评审意见。

- Planner 产出 `tasks.md`（不改代码）
- QA 产出 Evidence（只读 + 运行验证）
- Reviewer 产出评审结论（只读）

## 6. 与业界对照

本手册每条原则的英文互联网出处，供需要说服他人时引用：

| 本手册做法 | 业界说法 | 出处 |
|---|---|---|
| 单线程写 + 智能评审（§5） | "writes stay single-threaded…agents contribute intelligence rather than actions"；unstructured swarm "mostly a distraction"；实用形态 map-reduce-and-manage | [Cognition — Multi-Agents: What's Actually Working](https://cognition.com/blog/multi-agents-working) |
| git 分支/worktree 隔离（§4） | "One agent per worktree. One worktree per branch. No exceptions." | [2026 AI Coding Stack](https://gist.github.com/selcukcift/32868c0746f5fe5e14a35c1f5a89e634) |
| 容器级隔离 + 文件锁 | 每个 Claude 一个容器，`current_tasks/*.txt` 抢锁，pull→merge→push | [Anthropic — Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler) |
| 结构化交接工件（[10](10-handoff.md)） | 用结构化 JSON 指令 + git commit 而非自由对话；misalignment 是多 Agent 首要失败模式 | [CAID, arxiv 2603.21489](https://arxiv.org/html/2603.21489v2) |
| 依赖协调图（[14](14-dependency-graph.md)） | Repo Coordination Graph：依赖图 + 规定合并顺序，跨仓特性先查图 | [mabl — shipping code across 75+ repos](https://www.mabl.com/blog/how-we-built-a-system-for-ai-agents-to-ship-real-code-across-75-repos) |
| 分层 AGENTS.md + 最近优先（[03](03-units.md)） | AGENTS.md 由 Linux Foundation 托管；"closest AGENTS.md to the edited file wins" | [agents.md](https://agents.md/) |
| 渐进披露、不做百科全书（[09](09-skills.md)） | "不要把 CLAUDE.md 做成所有已知实践的中央仓库"；用 skills + references 懒加载 | [Anthropic — New rules of context engineering](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models) |
| `PROGRESS.md` 当长期记忆（[15](15-memory.md)） | 结构化笔记 / CHANGELOG.md 作为便携长期记忆；context reset + 结构化 handoff 工件 | [Anthropic — Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)、[Harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps) |
| ADR 只注入最近 3–5 条（[05](05-adr.md)） | 750 仓实证：小窗口（3–5 条）最佳；context engineering 比模型规模更关键；仅 accepted 入索引 | [arxiv 2604.03826](https://arxiv.org/abs/2604.03826) |
| Evidence 必须外部工具取证（[11](11-evidence.md)） | Agent 会改完代码就宣称完成，必须显式给 e2e 验证工具（浏览器+截图）才承认 | [Anthropic — Effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) |
| 收尾自检（[12](12-gates.md)） | Ralph loop：Agent 说完成了就踢回去问"真的吗" | [Anthropic — Long-running Claude](https://www.anthropic.com/research/long-running-Claude) |
| 编排器只能是主会话（[13](13-parallel.md)） | subagent 不能 spawn subagent，orchestrator 必须是主会话 | [One Agent Per Repo](https://dev.to/just_an_electron/one-agent-per-repo-an-orchestration-pattern-for-multi-repo-ai-coding-49ba) |

---

## 落地动作

1. 新项目 `git init`，第一次提交空骨架（见 [02-bootstrap.md](02-bootstrap.md)）。
2. 建 `group/` 三目录，先各放一个从 `templates/group/` 拷的空文件。
3. 对照 §4 表格，在 `AGENTS.md` 根文件里写明本项目采用哪两种隔离。
4. 需要引用出处时，打开 `references/links.md`。

> AEF 原文对应章节：§4 总体架构、§5 七层模型、§6 Group/Unit、§11 Agent Roles、§24 Parallel Development、§33 Source of Truth、§41 Golden Loop。
