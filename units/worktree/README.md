# units/worktree — Agent 物理隔离调度引擎

**版本**：v0.1.0  
**定位**：多 Agent 并发物理隔离与环境沙盒的基础设施引擎。

---

## 1. 产生背景

在多 Agent 协同体系中，多工单并行开发或审计若直接在同一个主目录中修改，会导致严重的冲突：
- **Git 索引冲突**：不同会话互相覆盖暂存区；
- **撤销污染**：一个会话执行 `git checkout .` 或 `git clean` 会意外抹去另一个会话的代码；
- **上下文幻觉**：Agent 误读其他并发会话产生的半成品文件。

`units/worktree` 基于 Git 原生 `git worktree` 机制，为每个任务分配物理级别隔离的工作目录，彻底解决主目录冲突问题。

---

## 2. 核心特性

1. **零配置极速分配（Allocate）**：
   - 自动在 `.worktrees/<ticket-id>` 创建独立物理检出；
   - 自动在项目的 `.gitignore` 中追加 `.worktrees/`，保障主分支整洁；
   - 分配独立的临时分支 `ticket/<ticket-id>`。
2. **依赖共享软链接（Smart Cache Linker）**：
   - 自动检测并共享 Node (`node_modules`)、Rust (`target`)、Python (`.venv`)；
   - 杜绝多目录重复全量下载与编译依赖，节省大量磁盘空间与初始化时间。
3. **安全闭环回收（Prune）**：
   - 工单验收合并后，一键安全卸载工作目录与分支；
   - 未提交改动保护：防止误删代码，需显式 `--force`。
4. **Handoff 微内核驱动对接**：
   - 遵循 ADR-0003，作为标准 Workspace Provider 实现，可供 Baton 调度引擎调用。

---

## 3. CLI 命令指南

```bash
# 1. 为工单分配隔离工作区
baton-worktree allocate 05-feat-login

# 2. 列出当前活跃的隔离区
baton-worktree list

# 3. 查看特定隔离区内的 Git 状态
baton-worktree status 05-feat-login

# 4. 任务完成安全回收
baton-worktree prune 05-feat-login
```

---

## 4. 目录结构约定

```
<project-root>/
  ├── .gitignore           # 自动声明 .worktrees/
  ├── .worktrees/          # 物理隔离目录（Git 忽略）
  │   ├── ticket-101/      # 工单 101 的独立工作树 (分支: ticket/ticket-101)
  │   │   ├── node_modules -> ../../node_modules (软链共享)
  │   │   └── ...
  │   └── ticket-102/      # 工单 102 的独立工作树
  └── ... (主工作区)
```
