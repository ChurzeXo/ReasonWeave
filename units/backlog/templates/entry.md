<!-- backlog-template v1.1 · source: ~/Documents/lab/backlog/ -->
# Backlog Entry — 单条模板

文件：`docs/backlogs/<id>-<slug>.md`（id 为仓库内递增数字；**关闭即删文件**，git 留史）。

```markdown
---
id: <N>
title: <一句话标题>
type: keep | decide | future
priority: low | medium | high
status: open
owner: 待拍板
dep_on: none | <项目铁律声明的依赖方>
handoff_ref: ''
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

- 要做什么（一句话）
- 当时为什么没做 / 卡在哪
- 重开会话条件 / 谁拍板
```

## 使用约定

- 一任务一文件；id 仓库内递增、**不复用**（已关闭未删的条目仍占用 id，先删再取号）。
- 正文 ≤5 行要点式，禁止复述对话过程。
- 涉依赖方 → 正文尾部加三行依赖声明（涉及仓 / 依赖方需要什么 / 现状）；依赖方名单见本项目 `docs/backlogs/IRONRULES.md`（模板见模块 `templates/project-ironrules.md`）。
- 关闭去向：`done` 或 `cancelled`，均为**删文件**（git 留史）。

## 边界（什么不要进 backlog）

| 场景 | 去向 |
|---|---|
| 跨仓 / 依赖方要改（现在就要解决） | handoff |
| 架构级决策 | ADR（见 `~/Documents/lab/adr/`） |
| 本次 feature 未完成任务 | 该 feature 的任务跟踪 |
| 已落地代码改动 | reviews |
