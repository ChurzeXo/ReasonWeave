# Backlog — 待办捕获（独立可复用模块）

> 本目录是「待办捕获（backlog）」制度的**单一事实源**，独立于任何具体项目 / playbook。
> **实现（skill）**：`~/Documents/Skill/backlog-capture/`（SKILL.md + backlog.mjs + DESIGN.md），已 symlink 至 `~/.workbuddy/skills`、`~/.agents/skills`、`~/.claude/skills`，单一编辑点。规范与本 README 冲突时**以本 README 为准**（skill 的 DESIGN.md 为早期设计草案）。

## 0. 这是什么 / 为什么独立

多 Agent 长任务里，Agent 不断发现「有意保留 / 待拍板 / 未来功能」。处理只有两种：停下来问（打断、丢上下文）或沉默跳过（碎片永远丢失）。backlog 让 Agent **当场识别 → 低成本确认 → 简洁入库 → 事后批量拍板**。

本模块从 playbook 的 `07-backlog.md` 抽离，因为：

- 它**正交**：不依赖 AEF 七层 / spec-kit / constitution，任何项目都能用；
- 它**可复用**：有真实实现（skill + CLI）；
- 抽离前规范已**漂移**：playbook 旧稿与 skill 实际约定在「编号 / 存储 / 关闭」三处相反，需要单一真相源。

## 1. 捕获契约（什么该写 / 不该写）

| 判据 | 该写 | 不该写 |
|---|---|---|
| 有意保留（调研结论 / 临时绕行 / 设计豁免） | ✅ | — |
| 待拍板（多方案待决策 / 范围裁剪 / 依赖方行为不确定） | ✅ `type: decide` | — |
| 未来功能（超出本次范围的想法） | ✅ 一句话 | — |
| 越界发现（修 A 时注意到 B 隐患） | 先问一句再记录 | — |
| 当前任务在途事项 | — | ❌ 留在当前任务跟踪 |
| 根因在依赖方的缺口 | — | ❌ 走 handoff（见 §4） |
| 已落地的代码改动 | — | ❌ 走 reviews |
| 一句话说不清该不该写 | 宁可少写，不污染信号 | — |

## 2. 记录规则（三情形，禁静默写入）

1. **用户明确要求**（「记进 backlog」「待办一下」）→ 直接写，不问。
2. **Agent 主动发现越界事项** → 一行确认「记进 backlog？「<标题>」」→ 确认才写。
3. **无人可问**（headless / subagent / 收尾）→ 静默写，但任务汇报**必须**带新增清单。

> 禁止第 1、2 情形外自动静默写入。信号稀释比没有 backlog 更糟。

## 3. 存储格式

- 位置：`docs/backlogs/<id>-<slug>.md`，**一任务一文件**，入库 git（禁 `.gitignore`）。
- **关闭即删文件**（git 留史），backlog 只含活工作。
- **id**：仓库内递增数字。取号前先 `ls docs/backlogs/`——**已关闭但未删的条目仍占用 id**，撞号会造成二义；先删已关闭条目再取号，不留两个同名 id。

frontmatter：

```yaml
---
id: 3
title: 截流告警加跨平台去重
type: future   # keep(有意保留) | decide(待拍板) | future(未来功能)
priority: medium   # low | medium | high
status: open   # open；done/cancelled 即删文件
owner: 待拍板   # 人类/等待方；留「待拍板」=等你
dep_on: none   # 依赖方；值域由项目铁律声明（docs/backlogs/IRONRULES.md），无依赖填 none
handoff_ref: ''   # 已建交接 ID；无则空
created: 2026-08-31
updated: 2026-08-31
---
```

正文 ≤5 行要点式：

```
要做什么（一句话）
当时为什么没做 / 卡在哪
重开会话条件 / 谁拍板
```

> 语言硬规则：简洁易懂、禁止复述对话过程。接手 Agent 重开会话只读这一条，写不清 = 白记。

## 4. 依赖方铁律规范

**本模块不预设任何依赖方**——每个项目在自己的 `docs/backlogs/IRONRULES.md` 声明本项目的依赖方名单与最少本地约束；规则本体仍在本节，**勿在项目里重抄规则**（防漂移）。项目自建铁律模板见 `templates/project-ironrules.md`。

**不变量（所有项目都守）**：条目一旦涉及「本仓之外、需要他方改动或提供能力」，只写「记一笔」会让接手 Agent 不知动哪个仓、等谁。正文尾部必须加**三行依赖声明**：

```
涉及仓: <本项目铁律声明的依赖方>（可多选）
依赖方需要什么: 明确到 API/字段/行为，一句话
现状: 已交接 <handoff_id> | 待交接 | 仅构想、暂不动作
```

**路由判据（通用）**：

- **根因在依赖方且现在就要解决** → 不写 backlog，走项目的交接机制（本机多仓生态即 `handoff new`，唯一出口）。
- **未来构想依赖依赖方能力** → 可写 backlog，`依赖方需要什么` 具体到「哪个模块、缺哪个能力」，留 `待拍板`（排期时再转交接）。
- **依赖方行为不确定** → `type: decide`，写清两种可能差异，等拍板。

> 接入：把依赖方铁律泛化到本项目的提示词见 `docs/existing-project-ironrules-prompt.md`。

## 5. 回顾节奏

- **任务收尾**：汇报末尾一行 `backlog +N（待你拍板：<标题列表>）`。
- **批量拍板**：用户说「清一下 backlog」→ 列全部 open（按 priority）+ owner；用户给结论 `do / defer / cancel(删) / 转 handoff`。
- **跨 session**：不硬性清零；open 数量增长触发抽查。

## 6. 实现（skill）

- 实现位置：`~/Documents/Skill/backlog-capture/`（SKILL.md + backlog.mjs + DESIGN.md）。三客户端 symlink 至此，单一编辑点。
- CLI：`node backlog.mjs <add|list|show|done|cancel|status>`（完整用法见 `backlog.mjs` 文件头注释）。
- **无 skill 也能用**：在根 AGENTS.md 写一句「识别到越界/待拍板/未来功能时按 `~/Documents/lab/backlog/README.md` 格式记入 `docs/backlogs/`，不打断、不丢弃」。skill 的价值是格式稳定、编号不乱。

## 7. 分发提示词（接入用）

把下面三份提示词复制给对应项目的 Agent 会话即可，无需每个项目重写接入说明：

- **新项目** → `docs/new-project-prompt.md`：加 AGENTS.md 一句指令 + 校验 CLI。
- **已用 playbook 的旧项目** → `docs/existing-project-prompt.md`：核对本地 `docs/backlogs/` 约定、清理旧稿引用、补指令。
- **已接入、需把依赖方铁律泛化** → `docs/existing-project-ironrules-prompt.md`：自建项目铁律、移除照抄的生态仓名。

维护本模块的 Agent 请看 `AGENTS.md`（核心约定 / 与 ADR 差异 / 版本化 / 红线）。

## 8. 参考

- SI-IC/backlog-skill（三情形记录 / 仓库内文件 / 关闭即删）。
- terryc21/unforget（机器可读状态、防假 done）。
