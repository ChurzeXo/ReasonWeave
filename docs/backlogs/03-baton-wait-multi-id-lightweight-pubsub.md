---
id: 3
title: 聚合等待（Lightweight Pub/Sub）：支持多交接单并发监听与多条件唤醒（--any / --all）
type: feature
priority: high
status: done
owner: lab/handoffs
dep_on: none
handoff_ref: ''
created: 2026-11-08
updated: 2026-11-08
---

- **要做什么**：
  在多 Agent 并发或多端工程协作场景下（如发起方一次性向前端、后端、安全审计派发多份交接），现有的 `baton wait <id>` 仅支持单个工单 ID，导致发起方必须派生多个独立的后台进程分别监听；缺乏全局聚合唤醒能力。
  本需求在保持现有 Zero-Infrastructure（零后台常驻服务、纯 OS 内核文件事件驱动、进程隔离 Exit 0 唤醒）架构优势的前提下，借鉴发布/订阅（Pub/Sub）的多路复用能力，为 `baton wait` 引入 **多 ID 聚合等待（Lightweight Pub/Sub Watcher）**。

- **核心改动**：
  1. **多 ID 参数与多路复用**：
     - `baton wait <id1> <id2> ... [flags]`：支持传入 1 个或多个交接单 ID，单进程多路复用共享 `fs.watch` 事件流，零额外基建。
     - 支持 `--any`（Race 模式，竞态首个到达即平息唤醒）与 `--all`（Join 模式，所有任务全量交付后统一平息唤醒，默认模式）。
  2. **多状态跟踪与精准超时诊断**：
     - 维护工单状态字典（`ticketStates`），各工单独立自检与平息缓冲；
     - 超时退出时输出结构化诊断矩阵，逐条列出各工单当前状态（如 `ID-1: delivered` / `ID-2: received (待 deliver)` / `ID-3: forwarded`），彻底杜绝黑盒超时排查。
  3. **向后兼容性保证**：
     - 单 ID 调用行为与原有逻辑逐字兼容；
     - 接入桩与命令手册同步更新，契约升级至 `v2.20.0`。

- **验收判据与实测证据**：
  1. `baton wait ID-1 ID-2 --any`：实测通过。当首个工单交付并经平息缓冲（Settle Window）后 Exit 0 唤醒并高亮显示首个就绪工单；
  2. `baton wait ID-1 ID-2 --all`（默认模式）：实测通过。仅当多份工单全量完成交付并平息后，方 Exit 0 退出并汇总各工单结论；
  3. 单 ID 调用 `baton wait ID-1` 与原行为 100% 保持一致；
  4. 超时退出（Exit 124）时打印全量状态矩阵诊断报告；
  5. `baton check` 校验通过，exit 0。
