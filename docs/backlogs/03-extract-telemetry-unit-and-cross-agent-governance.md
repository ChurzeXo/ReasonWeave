---
id: 3
title: 提炼通用可观测与遥测能力单元 (units/telemetry) 并打通 Agent 自治治理闭环
type: decide
priority: high
status: open
owner: 待拍板
dep_on: tappy
handoff_ref: 'TAPPY-20261107-01-question'
created: 2026-11-07
updated: 2026-11-07
---

- **要做什么**：
  依据 Tappy 架构评审回执（TAPPY-20261107-01-question-resp.md）结论纠偏与三阶段路线图，推进通用可观测与遥测能力单元 `units/telemetry` 建设：
  1. **现网基线事实**：Tappy 现网成熟闭环的是 ADR-038 L2 事故工单离线冲刷 + 068 P0 修复 + SSE 广播 + 写盘前脱敏；而 Canonical Event、trace_id/span_id/seq/capture_run、L0/L1 意图流、构造即脱敏无旁路等能力处于 ADR-058 规约阶段（待 Tappy Phase 0 落地）；
  2. **提炼与对接目标**：在 Tappy 落地 Phase 0 后，于 `lab` 抽取通用单元 `units/telemetry`（Schema 规范 + Python/Node SDK 骨架 + Exporter Port）；
  3. **治理门禁闭环**：以特权只读消费者（Consumer）模式，为 `units/handoffs`（Baton）与 `units/preflight` 提供基于物理调用链（Tool/Skill/目标 App 动作）的自动化验真与防伪门禁。

- **阶段拆解（路线图）**：
  - **Phase 0 · Tappy 端前置落地**：落 Canonical Event 与关联四键；脱敏收口（唯一 emit 强制脱敏、未脱敏拒写、Stage 2 门禁）；L1/L0 注入与 `/ws/perception` 归一化；P99 ≤5% 性能核实。
  - **Phase 1 · lab 通用单元构建**：新建 `units/telemetry/`（JSON Schema 契约 + 跨语言 SDK 骨架 + Exporter Port）；制定通用遥测架构 ADR。
  - **Phase 2 · 治理验真与门禁闭环**：Baton 回执与 Preflight 门禁接入 Trace 自动比对，打通反向 mutation（改坏必红）。

- **为什么做 / 解决什么痛点**：
  1. **跨业务仓复用**：避免各客户端 AI 项目在遥测、脱敏与流式监控上重复造轮子；
  2. **端到端执行态观测**：覆盖 MCP Tool、技能包及外部受控 App（如 Android/Web）的真实动作（L0）与感知，消除假完成幻觉；
  3. **纪律与事实源闭环**：使 Baton 交接回执的 `evidence` 由手工自报升级为可从遥测 Trace 自动提取比对，杜绝口头过关。

- **重开会话条件 / 谁拍板**：
  Tappy 端完成 Phase 0 前置落地（或提出通用契约联调需求）后，由用户拍板进入 Phase 1 实施。

涉及仓: tappy
依赖方需要什么: 完成 Phase 0 核心字段落盘与脱敏收口（T1-T5），提供真实物理 Trace 作为契约对齐样本
现状: 已完成跨仓架构评审（TAPPY-20261107-01-question 已闭环），待排期推进 Phase 0/1
