---
id: 1
title: forward --wait 统一为自脱钩守护（消除管道误杀面）
type: decide
priority: medium
status: done
owner: lab/handoffs
dep_on: none
handoff_ref: ''
created: 2026-11-06
updated: 2026-11-06
---

- **要做什么**：`baton forward <id> --wait` 目前走进程内阻塞（`handoff.mjs:1138` `await cmdWait(waitArgs)`），会被任何管道/超时包装误杀——实测 2026-11-06 Tappy 会话：`handoff forward X --wait | head -6` → head 读完 6 行关闭 stdout → waiter 被 SIGTERM（exit 137），监听未挂起。同文件 `--daemon` 路径（`:1056-1099` `spawnDaemonWait` 金蝉脱壳）无此问题。
- **改法**：① `forward --wait` 复用 `spawnDaemonWait` 自脱钩（或 `--wait` 直接成为 `--daemon` 别名），父命令 <0.1s 退出、守护常驻、回执到达 Exit 0 唤醒；② 修引导语自相矛盾：`:651-658` 与 `:715-722` 的「关键动作」现在推荐 `baton forward <id> --wait`（置于后台运行）——正是脆弱路径，统一后该推荐变为安全；③ `:2373-2375` 帮助文案同步；④ `wait --daemon` 行为与 `--timeout` 等参数透传不变。
- **验收判据（机判）**：① `handoff forward <id> --wait | head -6` 管道截断后守护仍存活（pgrep 可见）且日志落 `.handoffs/logs/wait-<id>.log`；② 父命令秒级退出 exit 0；③ 回归：无回执时守护持续等待、登记回执后 Exit 0（沿用既有 `wait --daemon` 测试口径）；④ CHANGELOG.md 记录行为变更。
- **卡点**：无技术卡点；等 lab 侧 Agent 排期实施。
- **谁拍板**：lab/handoffs 单元维护者（用户转递即开工）。
