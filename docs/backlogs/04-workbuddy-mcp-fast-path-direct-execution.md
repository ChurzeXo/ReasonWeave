---
id: 4
title: 建立 WorkBuddy 调用 MCP 目标 App 极速直通快轨（Fast-Path Direct Execution）
type: decide
priority: high
status: open
owner: 待拍板
dep_on: none
handoff_ref: ''
created: 2026-11-07
updated: 2026-11-07
---

- **要做什么**：
  为 WorkBuddy 等客户端 AI 建立执行移动端控与目标 App 任务的“极速直通快轨”机制，彻底消除调用 MCP 工具前无效的“阅读代码/搜索代码/分析上下文”耗时（单次约 30~50s 浪费）：
  1. **AGENTS.md / Workspace 铁律注入**：明确端控指令（快手/抖音/微信/打卡/签到等）禁止触发 `read_file`、`grep`、`find_by_name`，由端侧 Laya 全权闭环；
  2. **MCP Tool Description 强路由前置**：在 `tappy_execute_goal` 等宏工具描述中前置 `[DIRECT INVOCATION REQUIRED - DO NOT READ CODE]` 强约束声明；
  3. **WorkBuddy 专用 Skill / Slash 指令**：提供确定性提取目标并直通调用的轻量 Skill，跳过发散性慢思考；
  4. **Tool 响应自解释**：返回高信息密度执行摘要，杜绝因异常栈诱发模型二跳读代码排查。

- **为什么做 / 解决什么痛点**：
  - 缩短用户端任务执行延迟，从现有的 35s~60s+ 压缩至仅受端侧 Laya 物理操作速度决定的 1~3s 极速响应；
  - 节省大量长上下文探索的无谓 Token 消耗。

- **重开会话条件 / 谁拍板**：
  在三阶段遥测体系（Phase 0~2）落地后，结合真实调用遥测数据再开会话详细讨论与排期落地。
