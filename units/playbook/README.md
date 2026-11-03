# AEF Playbook — 执行手册

**用途**：开一个多端、多智能体协作的新项目时，照这本手册从 0 搭目录、写宪法、装工具、跑生命周期。

**性质**：这是**执行手册**，不是框架本体。框架权威是 `references/Agent-Engineering-Framework-AEF-v1.0.md`（下称 **AEF**），本手册只讲"怎么落地"，并在每处标注 AEF 原文章节号。

**已验证案例**：OWSEL（iOS + Backend + MCP 三 Unit）——见 `examples/owisel.md`。

---

## 方法论一页纸

核心公式（AEF §1）：

```
Intent → Spec → Context → Agent → Evidence → Convergence
```

八个构件，缺一不可：

| # | 构件 | 落地成什么 | 手册章节 |
|---|------|-----------|---------|
| 1 | Intent | `group/product/intent.md` + `constitution.md` | [04](docs/04-constitution.md) |
| 2 | Spec | Spec Kit 流程产物 `specs/NNN-*/` | [06](docs/06-spec-kit.md) |
| 3 | Context | 分层 `AGENTS.md` + Skills + CodeGraph | [03](docs/03-units.md) [08](docs/08-codegraph.md) [09](docs/09-skills.md) |
| 4 | Agent | Group / Unit 隔离 + 并行隔离 | [01](docs/01-architecture.md) [13](docs/13-parallel.md) |
| 5 | Evidence | E0–E5 分级证据 + `evidence/` | [11](docs/11-evidence.md) |
| 6 | Convergence | Convergence Checklist + 收尾门禁 | [12](docs/12-gates.md) |
| 7 | 协作契约 | `group/contracts/` + 依赖协调图 | [14](docs/14-dependency-graph.md) |
| 8 | 记忆 | `docs/PROGRESS.md` + 结构化交接件 | [15](docs/15-memory.md) |

---

## 新项目启动顺序

严格按序，每步有硬门禁：

```
1. git init                      ← 并行隔离的前提，见 13 章
2. 搭目录骨架                      → 02-bootstrap.md
3. 写 Constitution                → 04-constitution.md      门禁：宪法 review 通过
4. 写 ADR-001 起步决策 + INDEX     → 05-adr.md
5. 建依赖协调图（哪怕只有 1 个 Unit）→ 14-dependency-graph.md
6. 每个 Unit 建 AGENTS.md 骨架    → 03-units.md
7. specify init 装 Spec Kit       → 06-spec-kit.md
8. 建 CodeGraph 索引              → 08-codegraph.md
9. 定 Agent Skills（项目级）      → 09-skills.md
10. 跨仓交接契约（如涉及）         → 10-handoff.md
11. 跑第一个 feature 前通读 12 章门禁
```

## 每个 feature 收尾硬门禁

见 [12-gates.md](docs/12-gates.md)。一句话版：

> 没有 Evidence 的完成不算完成（AEF §14）；不收敛到 Intent 的完成不算收敛（AEF §16）。

---

## 与业界的关系

本手册的每条原则都对应英文互联网上已被验证的实践，出处见 [01-architecture.md §6 与业界对照](docs/01-architecture.md) 以及 `references/links.md`。要点：

- **写操作单线程，其余 Agent 只出智能不出动作**（Cognition）
- **隔离靠 git worktree / 分支，不靠目录约定**（Anthropic、CAID 论文）
- **Agent 之间用结构化工件通信，不用自由对话**（CAID：misalignment 是头号失败原因）
- **指令文件分层 + 渐进披露，不做百科全书**（Anthropic 2026 context engineering）
- **ADR 是 Agent 的架构记忆，只注入最近 3–5 条**（arxiv 2604.03826）
- **"完成"必须有外部验证工具，Agent 会自欺**（Anthropic harness）
- **中途变更先评估影响面、spec 与代码同 commit，否则必漂移**（Spec Growth Engine、BMAD correct-course）
- **任务列表就是 Agent 的记忆：只增不删、单 in-progress、压缩前检查点**（tracking-tasks）
- **改既有代码前先出影响面清单、先钉特征化测试**（TDAD：回归 6.08%→1.82%）

---

## 目录

```
playbook/
├── README.md                 ← 本文件
├── docs/
│   ├── 01-architecture.md    AEF 七层 / Golden Loop / Group-Unit / 与业界对照
│   ├── 02-bootstrap.md       新项目从 0 搭建顺序
│   ├── 03-units.md           Unit 设计与 AGENTS.md 分层
│   ├── 04-constitution.md    宪法怎么写
│   ├── 05-adr.md             ADR 规范
│   ├── 06-spec-kit.md        Spec Kit：为什么用、与 AEF 的映射
│   ├── 07-backlog.md         backlog-capture + docs/backlogs/
│   ├── 08-codegraph.md       代码索引
│   ├── 09-skills.md          Agent Skills 两级体系
│   ├── 10-handoff.md         跨仓交接（指针）
│   ├── 11-evidence.md        Evidence 分级与 DoD
│   ├── 12-gates.md           硬门禁清单
│   ├── 13-parallel.md        并行执行隔离          ← 新增
│   ├── 14-dependency-graph.md 跨 Unit 依赖协调图    ← 新增
│   ├── 15-memory.md          结构化记忆与交接      ← 新增
│   ├── 16-change-control.md  中途需求变更 CR 流程   ← 新增
│   ├── 17-prompts.md         两段复制即用的提示词    ← 新增
│   └── 18-shift-left.md      「收尾才暴露问题」根因+对策 ← 新增
├── templates/                可直接改写的模板
├── references/               AEF 原文 + 外部链接索引
└── examples/owisel.md        真实案例拆解
```
