# 15 — 结构化记忆与交接件

## 1. 问题：Agent 没有跨会话记忆

一次任务结束，上下文就没了。下一个 Agent 接手时只有两种选择：

- ❌ 从头读全部代码（慢、烧 token、还可能读漏）
- ❌ 靠聊天记录（宪法禁令 Chat-based Handoff）

正解是**便携的结构化记忆文件**：Agent 自己写、随仓库走、下一个 Agent 一读就接上。

Anthropic 的实践口径：

> 结构化笔记（structured note-taking / agentic memory）= Agent 定期把笔记写到上下文窗口**之外**持久化，后续再读回来。像 `NOTES.md`、`CHANGELOG.md` 这种简单模式，能让 Agent 跨数十次工具调用维持进度与依赖。

## 2. 三个文件，三种记忆

```
docs/PROGRESS.md      ← 短期：当前任务做到哪、下一步是什么（每任务更新）
docs/backlogs/        ← 长期：待拍板/未来功能（[07 章](07-backlog.md)）
adr/                  ← 永久：为什么这么定（[05 章](05-adr.md)）
git history           ← 事实：改了什么（commit message 写 why）
```

分工的关键：**PROGRESS 记"做到哪"，ADR 记"为什么"，backlog 记"以后"，git 记"改了什么"。** 不要让一个文件承担全部。

### `docs/PROGRESS.md` 格式

```markdown
# PROGRESS

## 当前状态
- Feature: specs/002-content-storage
- 阶段: implement（tasks.md T001–T005 已完成，T006 进行中）
- 分支: feat/content-storage（worktree ../proj-content-storage）

## 已完成
- 2026-10-08: T001-T005，证据见 specs/002-content-storage/ 收尾报告

## 下一步
- T006: 迁移脚本（注意：依赖 backend 先合，见 dependency-graph 表 3）

## 已知问题 / 坑
- 本地 SQLite 版本 < 3.35 不支持 UPSERT，见 B-007
```

**「已知问题 / 坑」段最有价值**——它防止下一个 Agent 重蹈覆辙。

## 3. 任务状态纪律：防止"忘了"

PROGRESS.md 记"做到哪"，但**任务本身的增删改**还需要一套纪律。英文互联网上的共识是：任务列表就是 Agent 的记忆，没写下来的东西在下一次压缩/换会话时一定丢（"No mental notes. No exceptions."）。

四条规则（出自 tracking-tasks skill，各工具的 todo 实现——ai-todo、mneme、hermes todo——都是同一套语义）：

| 规则 | 内容 |
|---|---|
| **先建任务再动手** | "我就顺手改一下" → 先建任务。太小也建，"我会记得回来" = 已经忘了 |
| **永不删除任务** | 完成 → 标 completed；不做了 → 标 completed + 注明为什么。删掉的任务丢历史，留着的还能解释当年 |
| **同一时刻只有一个 in_progress** | 要开新活，先把当前的标 completed 或 paused |
| **偏离协议** | 中途发现别的事 / 人中途插需求 → 当前任务保持 in_progress，**新建** pending 任务并在描述里写"做 #N 时发现"，决定切换还是延后，办完**回到原任务** |

### 压缩前检查点

上下文 compaction 之前（或收尾交接之前）过一遍：

```
□ 所有发现的事都成了任务，没有靠脑子记的
□ in_progress 状态是真的准确
□ 被卡住的任务在描述里写了卡在哪
□ PROGRESS.md 的「下一步」与任务列表一致
```

### 注意力重锚定

Anthropic harness 与多份实践观察到同一个现象：**15–50 次工具调用之后，最初目标会从注意力里滑走**（"lost in the middle"）。对策不是靠模型自觉，而是：

- 每隔十几次调用**重读一次** plan / tasks / PROGRESS
- 每完成一个子任务就**更新一次**任务状态——更新动作本身把目标拉回注意力窗口

落地成一句写进根 AGENTS.md 的话：

> **做满约 15 次工具调用、或每完成一个子任务，重读一次 tasks.md / PROGRESS.md；新任务必须先入列表再开工。**

### 落盘，不落会话

任务状态必须**写进仓库文件**（`tasks.md`、`docs/PROGRESS.md`），随 git 走：会话内部的任务列表是封闭系统，会话一结束就没了，人也没法审阅。落盘的 markdown 人可读、可 diff、可版本化——这正是 [07 章](07-backlog.md) backlog 和本章 PROGRESS 的共同理由。

## 4. Context Reset：干净交接优于压缩

长任务有两种续命方式，Anthropic harness 研究区分得很清楚：

| | Compaction（压缩） | **Context Reset + 交接件** |
|---|---|---|
| 做法 | 把历史摘要后原地继续 | 清空上下文，新 Agent 从交接件接手 |
| 连续性 | 保留（但有残留焦虑） | 全新 |
| 代价 | 模型仍可能"context anxiety"提前收工 | 交接件必须写得足够完整 |
| 适用 | 单任务内部续命 | **任务交接 / 跨 Agent** |

**多 Agent 项目用后者**：交接件 = `PROGRESS.md` + 指向 spec/tasks 的路径 + 下一步。

交接件模板（写进任务 prompt 或 handoff）：

```
## Handoff
- 上下文入口：根 AGENTS.md → units/<x>/AGENTS.md → constitution.md
- 进行中：specs/NNN-*/tasks.md（当前 T006）
- 进度：docs/PROGRESS.md
- 边界：只在分支 <name> 上写，勿碰 <其它 Unit>
- 验证：见 Unit AGENTS.md Verification 段
```

## 5. 收尾自检：Ralph Loop

Agent 声称完成时的标准动作——**踢回去问"真的吗"**：

```
Agent: "任务已完成。"
      ↓
检查: 你跑了 Unit Verification 的完整命令吗？证据路径是什么？
      ↓
Agent 常见回答: "呃，我只跑了单测……"  → 打回，补 E2/E4
```

这就是 [12 章](12-gates.md) 门禁在**执行层**的用法：不接受"已完成"三个字，只接受填好的门禁表。

落地：根 AGENTS.md 加一句

> **禁止以"已完成"结尾而不附门禁表。收到"已完成"时，必须追问证据路径与失败项。**

## 6. 起步引导（新 Agent 接手的标准开场）

给新 Agent 的第一批命令（Anthropic harness 的 get-up-to-speed 序列）：

```
1. pwd                      确认工作目录边界
2. git log --oneline -10    最近改了什么
3. cat docs/PROGRESS.md     进行到哪
4. 读 specs/NNN-*/tasks.md  挑最高优先级的未完成任务
5. 跑 Verification 命令确认基线是绿的   ← 关键：先确认起点可用
```

第 5 步常被跳过，但**基线不绿就开始改，是"改完不知道谁弄坏的"的主要来源**。

---

## 落地动作

1. 建 `docs/PROGRESS.md`，按 §2 格式起头。
2. 根 AGENTS.md 加 §3 的任务纪律句 + §5 的反自欺句 + §6 的接手序列。
3. 收尾门禁（[12 章 §B.6](12-gates.md)）里"PROGRESS.md 已更新"一项开始执行。
4. 跨仓交接走 [10 章](10-handoff.md)，仓内交接用本章 Handoff 模板。

> AEF 原文对应章节：§17 Failure Recovery（从最近有效状态继续）、§19 Knowledge Model（Canonical / Working / Evidence 三类知识）、§22 Agent Communication、§8 Context Engineering、§18 Incremental Change（任务粒度小步推进）。
