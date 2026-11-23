# units/skills — 微观工程原子技能库与分发引擎

**版本**：v0.1.0  
**定位**：为 AI Coding Agents（Claude Code, Cursor, Antigravity, OpenCode 等）提供开箱即用的微观工程认知规训、代码动作标准与上下文零污染切片原语。

---

## 1. 为什么需要 units/skills？

在 ReasonWeave 的宏观工程防线中：
- `units/handoffs` 解决了任务的跨仓流转、双盲审计与会话亲和性；
- `units/worktree` 解决了工作区物理隔离与缓存共享；
- `units/preflight`、`review-gate` 与 `orphan` 建立了不可逾越的提交门禁法律（Hooks are Law）。

然而，当 Agent **坐下来写每一行代码、定位具体报错或准备提交**时，长篇的 Playbook 文档无法在有限上下文中高频常驻。这导致 Agent 极易退化为大模型原始的“凭直觉猜 Bug、先写实现再补测试、凭感觉说搞定”的浮躁作风。

`units/skills` 填补了这“最后一公里”，提供**即插即用、正文严格小于 20KB、内置心理防合理化阻断表**的官方原子技能库。

---

## 2. 官方原子技能目录 (`catalog/`)

| 技能名称 | 核心铁律 (Iron Law) | 解决的核心痛点 |
| :--- | :--- | :--- |
| **`systematic-debugging`** | `NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST` | 严禁未查明根因前瞎改代码碰运气；4 阶段排查；3 次失败停步反思架构 |
| **`test-driven-development`** | `NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST` | 严禁先写实现再补虚假单测；强制先红后绿，写最小可过代码 |
| **`verification-before-completion`** | `NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE` | 严禁使用“应该修好了”臆测；必须当场运行完整测试命令核验 Exit 0 |
| **`brainstorming`** | `EXPLORE INTENT BEFORE BUILDING` | 遇到非简单单行改动，必须先收敛需求，列出方案权衡并形成简明 Design Doc |

---

## 3. CLI 命令指南 (`lab-skills`)

```bash
# 1. 查看官方原子技能清单及状态
lab skills list
# 或
lab-skills list

# 2. 一键安装/挂载到当前项目（.agents/skills/）
lab skills install --project

# 3. 一键安装/挂载到用户全局目录（~/.agents/skills/）
lab skills install --global

# 4. 校验当前技能目录的体积（<20KB）与 Markdown 链接有效性
lab skills check
```

---

## 4. 零污染上下文切片工具 (`bin/`)

- **`task-brief.mjs`**：从计划文件中精准提取单个任务的文字与约束落盘为 `task-N-brief.md`，主控派发子任务时仅传文件路径，防止全量长 Plan 污染子 Agent 上下文。
- **`review-package.mjs`**：生成包含 Commit log、文件统计和完整带上下文 Diff 的独立文件 `review.diff`，代码审查时仅传文件路径，防止数十 KB 的 Diff 烧穿主控 Agent 上下文。

---

## 5. 架构原则

1. **体积不变量（<20,000 bytes）**：单个 `SKILL.md` 正文必须小于 20KB，防止宿主上下文压缩（Compaction）时规则被截断。
2. **反合理化阻断（Anti-Rationalization）**：每个技能必须配备大模型常见借口与真实对账表，正面击穿投机心理。
3. **软硬兼备（双核门禁）**：技能引导思维，物理 Hooks 兜底校验。
