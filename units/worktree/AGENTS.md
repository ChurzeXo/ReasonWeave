# units/worktree — Agent 行为规范与接入指南

## 单元定位
`units/worktree` 是用于实现多 Agent 并发物理隔离与环境沙盒的基础设施引擎。它基于原生 `git worktree`，解决多 Agent 并发修改同一主分支时的脏污与冲突问题。

## 核心铁律
1. **零污染原则**：工作区根目录下的 `.worktrees/` 目录必须被 Git 忽略，严禁将 `.worktrees/` 提交至任何 Git 分支。
2. **生命周期闭环**：工单派发时使用 `baton-worktree allocate <id>` 分配目录，工单闭环（accept/close/reject）后必须执行 `baton-worktree prune <id>` 及时回收，严禁遗留孤儿工作区。
3. **依赖共享只读保护**：通过符号链接共享的 `node_modules` 或 `target` 禁止随意删除或强制降级破坏主工作区缓存。
4. **POSIX / 纯 Node 原生**：引擎代码严禁引入第三方外部 npm 依赖，必须使用 Node.js 原生模块 (`node:fs`, `node:path`, `node:child_process`)。

## 常用命令
```bash
# 为工单分配隔离工作区（输出对应绝对路径）
node $(lab path worktree)/worktree.mjs allocate <ticket-id>

# 任务收尾回收工作区
node $(lab path worktree)/worktree.mjs prune <ticket-id> --force

# 查看当前活跃的工作区
node $(lab path worktree)/worktree.mjs list
```
