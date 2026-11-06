---
id: 2
title: 解耦 --wait 与 --daemon，构建全 AI 客户端与人类终端统一状态监听与唤醒模型
type: decide
priority: high
status: done
owner: lab/handoffs
dep_on: none
handoff_ref: ''
created: 2026-11-06
updated: 2026-11-06
---

- **要做什么**：
  在 `baton v2.16.6` 变更中，为了避免交互式管道截断误杀监听进程，将 `baton forward <id> --wait` 与 `--daemon` 彻底统一复用 `spawnDaemonWait`（`detached: true` + `unref()`）。
  该改动在人类交互终端（TTY）体验良好，但在所有主流托管式 AI 客户端（如 Google Antigravity、Claude Code、Cursor、Windsurf 等）中，击穿了长任务挂起与“零 Token 反应式唤醒（Reactive Wakeup）”机制：
  AI 客户端的后台任务托管依赖父子进程树存活；父进程 <0.1s 退出导致宿主判断命令已结束而不会挂入后台任务管理；底层脱钩的孤儿 Node 进程退出时，退出信号已被系统截断，Agent 永远无法被宿主唤醒。
- **解耦改法**：
  1. **语义解耦（Semantic Separation）**：
     - `--wait`：标准托管阻塞等待（Managed process-tree waiting）。进程保持在前台，利用已有的 `fs.watch` 事件驱动 + 自适应退避（2s→4s→8s→15s），0 CPU / 0 Token 挂起；回执到达时打印回执摘要并 Exit 0 唤醒宿主。
     - `--daemon`：显式 OS 孤儿脱钩（Detached OS daemon）。仅当人类在终端需要释放前台输入时显式传入，调用 `spawnDaemonWait` 秒退。
  2. **环境自适应感知（Smart Environment Auto-Detection）**：
     - 内置 `isAgentEnvironment()` 探针，检测 `ANTIGRAVITY_AGENT`、`CLAUDE_CODE`、`CURSOR_AGENT`、`WORKBUDDY_AGENT`、`AI_AGENT` 及非 TTY 管道；支持 `BATON_MANAGED_MODE`（1=托管, 0=脱钩）显式覆盖。
     - 若处于 Agent 托管环境，即使被误传入 `--daemon`，亦自动平滑回退为托管阻塞等待，防止进程脱钩导致唤醒丢失。
  3. **接入桩规范升级（Contract v2.17.0）**：
     - 升级 `STUB_BODY_ZH` / `STUB_BODY_EN` 到 `v2.17.0`；
     - 最小操作序列出站规范更新为 `baton forward <ID> --wait`。
- **验收判据**：
  1. 在 Agent 宿主环境（模拟 `ANTIGRAVITY_AGENT=1` 或 `BATON_MANAGED_MODE=1`）下：
     - `baton wait <id>` 走进程内阻塞等待，不会触发 `spawnDaemonWait`；
     - `baton wait <id> --daemon` 感知托管环境，输出感知提示，平滑降级为托管阻塞等待；
     - `baton forward <id> --wait` 走托管阻塞等待；
  2. 在普通人类终端（`BATON_MANAGED_MODE=0` 且 `stdout.isTTY=true`）下：
     - `baton wait <id> --daemon` 秒退并启动脱钩子进程；
  3. `baton install` 幂等刷新载体，`baton check` exit 0。
