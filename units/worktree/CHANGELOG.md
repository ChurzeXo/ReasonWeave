# Changelog — units/worktree

## [v0.1.0] - 2026-11-09

### Added
- **初始化发布**：提供基于 Git Worktree 的物理目录隔离调度引擎（`baton-worktree` CLI / `worktree.mjs`）。
- **智能依赖缓存软链接**：原生检测并共享 Node (`node_modules`)、Rust (`target`)、Python (`.venv`) 依赖缓存，杜绝重复全量构建。
- **生命周期核心命令**：
  - `allocate <id>`：单工单安全分配独立目录，自动注入 `.gitignore` 规则，防并发脏污。
  - `prune <id>`：任务完成后安全卸载工作区并支持自动分支清理。
  - `list`：列出当前仓库所有由 Agent 维护的活动隔离工作区。
  - `status <id>`：一键检视指定隔离区内的未提交改动。
  - `clean-all`：清理由于异常中断残留的孤儿工作区。
- **Handoff Workspace Driver 对接契约**：遵循 ADR-0003，作为 Handoff 微内核的标准外部驱动实现。
