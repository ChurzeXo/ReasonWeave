---
id: 6
title: 演进 review-gate 双盲审计自动化运行器（Clean Context Runner）
type: feature
priority: high
status: open
owner: lab/review-gate
dep_on: '5'
handoff_ref: ''
created: 2026-11-09
updated: 2026-11-09
---

- **要做什么**：
  演进现有的 `to_lane=audit` 双盲机制，从“靠人类或人工 Agent 终端执行”进阶为自动化宿主无上下文重跑：
  1. 调度探针自动在干净的独立子进程或对应隔离 Worktree 中唤醒；
  2. 剥离执行方主观 Prompt 与思维链，只挂载需求原件与改动后的物理文件；
  3. 严格根据下游 `.handoff-hub.json` 中配置的 `test_command` 执行真实校验，直接捕获 Exit Code，若非 0 则硬性阻断，签发 Fail 审计单。
- **为什么没做 / 卡在哪**：
  容器化（Docker）在本地重项目（如 Rust）构建太重，需降级为“Worktree + Clean Subshell 环境变量隔离”，与 Worktree 引擎实现能力编排。
- **重开会话条件 / 谁拍板**：
  `baton check` 与审计回执能自动吸纳 Clean Runner 的原始输出作为核验根据。
