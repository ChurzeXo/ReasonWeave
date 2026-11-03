# <项目名>

## Overview
<两三行说清这个项目是什么、给谁用。>

## Repository Layout
```
group/       单一事实源：product / architecture / contracts
units/<x>/   各端独立工程上下文
specs/       Spec Kit feature 产物（spec → plan → tasks → converge）
adr/         架构决策记录 + INDEX.md
docs/        PROGRESS.md · backlogs/
evidence/    收尾证据
```

## Isolation（两种隔离，都不可省）

1. **Unit 隔离**：各 Unit 只读自己的目录 + `group/contracts/`。禁止直接读改其他 Unit 的实现。
2. **执行隔离**：一个 Agent 一个 worktree/分支；Agent 永不直接 push 主干；只有 Implementation Agent 可写，Reviewer/QA 只读。

## Key Documents
- `constitution.md` — 项目宪法（最高原则，改动须人 review）
- `group/product/intent.md` — 产品意图
- `group/architecture/dependency-graph.md` — 谁依赖谁、合并顺序
- `adr/INDEX.md` — 架构决策索引

## Agent Guidelines
- 上下文读取顺序：**本文件 → `units/<当前端>/AGENTS.md` → `constitution.md`**
- feature 流程必须走 `/speckit.specify → … → /speckit.converge`，Converged 才能进收尾门禁
- 架构级改动必须先有 Accepted ADR，编号写进收尾报告
- 跨 Unit 改动前先查 `group/architecture/dependency-graph.md` 确认合并顺序
- 涉外部仓库的改动只走 handoff CLI，禁止聊天交接
- 识别到越界/待拍板/未来功能信号时，记入 `docs/backlogs/`，不要打断当前任务，也不要静默丢弃
- 实现细节有多种合理方案时默认动手（宪法 D5）：选最贴合现状的 + `// ASSUMPTION` 留痕；只有高 stake 决策（架构/CR/不可逆/花钱/改公共 API/难替换依赖）才停下来问
- **禁止以"已完成"结尾而不附门禁表。收到"已完成"时，必须追问证据路径与失败项。**

## CodeGraph
各 Unit 有自己的 `.codegraph/` 索引；代码检索约定见各 Unit AGENTS.md。改完代码 `codegraph sync`。

## 收尾门禁
每次任务收尾必须逐条输出门禁表（Intent / Architecture / Isolation / Evidence / Convergence / 交接与记忆六组），不许写"已通过所有检查"。见 playbook `docs/12-gates.md`。

## Context Budget
本文件 < 150 行。长规范走 Skill 懒加载，不要往这里堆。
