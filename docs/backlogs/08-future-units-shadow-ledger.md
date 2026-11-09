---
id: 8
title: 新建 units/shadow-ledger 影子记账引擎（最小可行版本）
type: future
priority: low
status: open
owner: lab/shadow-ledger
dep_on: '5'
handoff_ref: ''
created: 2026-11-09
updated: 2026-11-09
---

- **要做什么**：
  为后台自动化巡检（如定期依赖安全巡检、死代码扫描）提供只记账、不落盘的影子机制：
  1. 巡检 Agent 的改动挂载于 `shadow/<date>-<topic>` 临时分支或专用本地 SQLite/JSON 账本；
  2. 严禁自动提 PR 或修改主分支；
  3. 提供 `lab shadow diff / review` 命令，仅在人类主动查阅时一次性列出影子记账建议，支持一键 Cherry-pick 或丢弃。
- **为什么没做 / 卡在哪**：
  影子版本发散仲裁机制未成熟，前期以人工显式触发为主，避免后台自动跑出大量陈旧“幽灵账本”。
- **重开会话条件 / 谁拍板**：
  前置 Worktree 与节流管道稳定运行后，由架构委员会评审启动。
