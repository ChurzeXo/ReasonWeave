# units/skills 变更日志 (CHANGELOG)

## [0.1.0] - 2026-11-23

### 修复 (Fixed)
- **Windows 平台 CLI 入口静默退出 0 缺陷**：
  - 修复 `skills.mjs`、`task-brief.mjs` 与 `review-package.mjs` 中使用 `new URL(import.meta.url).pathname` 与 `process.argv[1]` 比对时，因 Windows 盘符带有前导斜杠 `/C:/...` 导致路径比对恒为 `false` 的问题；
  - 统一替换为标准跨平台 API `fileURLToPath(import.meta.url)`，彻底解决 Windows 环境下 `lab skills list` / `lab skills check` 无输出静默退出的阻断性问题。

### 新增 (Added)
- **初始版本建立**：基于 ADR-0015 架构决策，正式立项 `units/skills` 微观工程原子技能库与分发引擎；
- **官方原子技能目录 (`catalog/`)**：
  - `systematic-debugging`：根因溯源四步法 + 未明根因禁改代码 + 跨组件边界插桩诊断 + 连续 3 次失败架构升级反思；
  - `test-driven-development`：无红测不写生产代码 + 先红后绿再重构 + 严禁提前写实现；
  - `verification-before-completion`：声称完成必须当场执行完整命令核验 Exit 0 + 证据先于主张；
  - `brainstorming`：复杂需求先澄清与方案收敛 + 权衡分析 + 产出极简设计文稿征得人类同意；
- **反合理化阻断表（Anti-Rationalization Shields）**：每个技能均内置针对大模型投机取巧心理的不可违背铁律（Iron Law）与现实对账表；
- **技能体积不变量（Skill Size Invariant）**：单技能主规约严格限制在 20,000 bytes 以内，支持渐进式懒加载；
- **零污染流水线切片工具 (`bin/`)**：
  - `task-brief.mjs`：多任务计划的任务切片提取工具，单任务需求落盘为独立文件；
  - `review-package.mjs`：审查 diff、commit log 与统计摘要打包工具，大 Diff 绝不进入主控上下文；
- **CLI 引擎 (`skills.mjs`)**：
  - 支持 `list`、`install`、`check` 等子命令，无缝对接 `lab skills` 与 `lab-skills`。
