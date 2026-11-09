---
id: 4
title: 跨仓 Agent 自动转递边界与安全调度权责评审
type: decide
priority: high
status: open
owner: lab/handoffs
dep_on: none
handoff_ref: ''
created: 2026-11-09
updated: 2026-11-09
---

- **要做什么**：
  评估是否放开跨仓无感自动投递。当前生态约定“跨仓交接必须以人类作为唯一转递通道”，技术上 `baton wait` 已具备跨工作区监听能力，需通过架构讨论决定：是继续保留人类在跨仓边界的安全门禁（Human-in-the-loop），还是引入“受信任跨仓 Agent Router”自动投递。
- **为什么没做 / 卡在哪**：
  跨仓自动调用涉及跨目录写权限、不同仓库独立 Git 历史污染以及无休止递归调用的熔断风险，属制度与安全边界问题，非单纯编码问题。
- **重开会话条件 / 谁拍板**：
  在 `group/architecture/adr/` 提交并由人类（churze）审查通过《ADR: 跨仓 Agent 自动转递与人类兜底边界》。
