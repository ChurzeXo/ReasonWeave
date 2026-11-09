---
id: 5
title: 新建 units/worktree 物理隔离调度引擎与 Workspace Driver 抽象
type: feature
priority: high
status: open
owner: lab/worktree
dep_on: none
handoff_ref: ''
created: 2026-11-09
updated: 2026-11-09
---

- **要做什么**：
  提供一套轻量原生的 Git Worktree 生命周期管理工具及 Handoff Workspace Driver 实现：
  1. 为每个接单工单创建独立的物理路径（如 `.worktrees/TICKET-<id>`），并自动加入 `.gitignore`；
  2. 内置基础依赖缓存复用机制（针对 Node `node_modules`、Rust `target`、Python `.venv` 进行只读或符号链接共享，避免重复全量构建）；
  3. 工单 `closed` 或 `rejected` 后自动执行清理和分支剪枝，防磁盘泄漏；
  4. 为 Handoff 微内核提供 pluggable workspace provider 接口。
- **为什么没做 / 卡在哪**：
  此前各 Agent 均在主目录就地改动，多 Agent 场景频发文件写冲突与撤销脏代码问题。
- **重开会话条件 / 谁拍板**：
  在 Rust/Tauri/Node 混合工程中实测并发双工单隔离改动且依赖缓存复用成功。
