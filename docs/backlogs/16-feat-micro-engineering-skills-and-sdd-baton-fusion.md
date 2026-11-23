---
id: 16
title: feat(skills+baton): 吸收 Superpowers 微观工程原子技能、反合理化阻断表与 SDD 上下文零污染流水线
type: feature
priority: high
status: closed
owner: units/skills + units/playbook + units/handoffs + units/worktree + tests
dep_on: '15'
handoff_ref: 'ADR-0015'
created: 2026-11-23
updated: 2026-11-23
completed: 2026-11-23
---

- **要做什么**：
  根据 ADR-0015 架构决策，研读并吸收 `obra/superpowers` 的优秀实战成果，补齐 ReasonWeave 在“微观编码纪律”与“子任务上下文零污染”上的断层，构建软硬兼备的双核门禁体系：
  1. **Phase 1: 沉淀 ReasonWeave 原生微观工程原子技能资产（Micro-Skills）**
     - 建立独立自治单元 `units/skills`，并在 `units/skills/catalog/` 建立 4 大标准原子技能包：
       - `systematic-debugging`：根因溯源四步法 + 未找准根因严禁改动代码 + 跨组件边界插桩诊断 + 连续 3 次失败架构升级反思；
       - `test-driven-development`：无红测不写生产代码 + 先红后绿再重构 + 严禁提前写实现；
       - `verification-before-completion`：声称完成必须当场执行完整命令核验退出码 0 + 证据先于主张 + 阻断“应该修好了”臆测；
       - `brainstorming`：大型需求先澄清与方案收敛 + 权衡分析 + 产出极简设计文稿征得人类同意。
     - 每个技能严格遵循“体积限制硬规约”（正文 < 20KB，防止 Claude Code / Agent Compaction 截断丢失），长清单与深层指导拆入 `references/`；
     - 每个技能配备针对大模型投机取巧心理的 **“Iron Law（不可违背铁律）” + “反合理化阻断表（Anti-Rationalization Table）”**。
  2. **Phase 2: 吸收 SDD 模式，打造 Baton 上下文零污染流水线（Zero-Pollution Artifact Pipe）**
     - 引入轻量级切片工具（POSIX / Node 实现）：
       - `task-brief.mjs`：从实施计划中只提取当前任务的上下文、字面量与契约约束落盘为独立文件，主控 Agent 派发子任务时只传引用，禁止长文 Plan 污染子上下文；
       - `review-package.mjs`：将待审 diff、commit log 与统计摘要打包落盘为独立文件，审查模型直接读文件，主控 Agent 上下文禁止内联长 diff；
     - 状态机与回执升级：在 `units/handoffs/RESPONSE-TEMPLATE.md` 与审计流程中，将审查解耦为两阶段独立判定：
       - **Stage 1: 规约契约符合度（Spec Compliance）**；
       - **Stage 2: 代码与架构质量（Code Quality & Architecture）**。
  3. **Phase 3: 自动化门禁守护与测试保障**
     - 在 `units/skills/tests/` 中新增 `skill-contract.test.mjs`、`skills-cli.test.mjs` 与 `pipeline.test.mjs`，静态校验所有原子技能的 YAML Frontmatter、命名规范、单文件大小（<20,000 bytes）以及引用文件的存在性；
     - 针对 `task-brief` 与 `review-package` 编写气密隔离测试，验证多 commit 任务无截断、代码块未闭合防御及跨平台路径兼容性；
     - 在 `tests/cli-contract.test.mjs` 中接入 `lab-skills`，永久常驻全 CLI 契约门禁防线。
  4. **Phase 4: 文档与全链路接入桩联动刷新**
     - 联动更新 `units/playbook/docs/09-skills.md`、`INSTALL.md`、`使用说明.md`、`README.md`、`group/architecture/dependency-graph.md` 与 `units/handoffs/RESPONSE-TEMPLATE.md`；
     - 确保全仓自动化测试套件与 CLI 契约门禁全绿。

- **触发背景与依据**：
  - 源码深度研读：在克隆并精读 `obra/superpowers` 源码后，发现其在微观动作引导、对抗大模型偷懒心理以及抗上下文压缩方面积累了极佳的工程实践；
  - 架构短板对账：ReasonWeave 既有方案在宏观流转（Baton、会话亲和性锁、HMAC-SHA256 签章）和物理门禁（Hooks are Law、OpenGrep SAST、反孤儿 L1-L3 门禁）极为坚固，但在微观编码时刻缺乏标准原子 Skill 引导，导致 Agent 在单点写代码和排查 Bug 时容易出现认知滑点；
  - 核心 ADR 决议：`group/architecture/adr/0015-micro-engineering-skills-and-dual-core-gate-invariant.md`。

- **验收判据（DoD）**：
  - [x] `units/skills/catalog/` 包含 4 个完整的微观原子技能目录及 `SKILL.md`；
  - [x] 所有 `SKILL.md` 正文字节数严格小于 20,000 bytes，长清单已抽离至 `references/`；
  - [x] 每个微观技能均包含 Iron Law 与 Anti-Rationalization 对账表；
  - [x] `units/skills/tests/skill-contract.test.mjs` 门禁就绪，单测 100% 通过；
  - [x] 具备切片与审查包生成原语，并通过跨平台路径与多 commit 隔离测试；
  - [x] `units/handoffs/RESPONSE-TEMPLATE.md` 固化 Spec Compliance 与 Code Quality 两阶段审查结构；
  - [x] 对应更新 `units/playbook/docs/` 相关章节，全仓单测与 CLI 契约门禁全绿。
