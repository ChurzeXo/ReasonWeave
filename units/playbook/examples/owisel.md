# 案例拆解：OWSEL

> OWSEL（`~/Documents/OWSEL`）是本手册方法论的**已验证来源**：iOS + Backend + MCP 三 Unit、AEF + Spec Kit + Constitution + ADR + CodeGraph + Skills 全套。
> 本文件同时记录它**做对了什么**和**还差什么**——后者是新项目的避坑清单。

---

## 1. 实际结构

```
OWSEL/
├── AGENTS.md                        根指令文件（隔离规则、门禁指针）
├── constitution.md                  项目宪法，104 行
├── Agent-Engineering-Framework-AEF-v1.0.md   AEF 原文（权威在仓库内）
├── OWSEL-MINDEN-PRD-v1.1.md         PRD
│
├── group/                           ← 单一事实源
│   ├── product/{intent.md, requirements.md}
│   ├── architecture/system.md       架构总览 + ADR-001~006
│   └── contracts/api.md
│
├── Owsel/                           ← iOS Unit（子目录含自己的 .codegraph/）
│   ├── AGENTS.md                    Unit 指令：技术栈 / 设计系统 / 禁令
│   ├── .agents/skills/ios-vibe-coding/   项目级 Skill（含 references/）
│   └── .codegraph/
├── backend/AGENTS.md                Unit 指令（CodeGraph 段为"可选"写法）
├── mcp/AGENTS.md                    Unit 指令
│
├── specs/001-ios-app-mvp-ui/        Spec Kit feature 产物
│   ├── spec.md  plan.md  tasks.md
│   ├── data-model.md  research.md  quickstart.md
│   ├── contracts/ui-contracts.md
│   └── checklists/requirements.md
│
├── docs/backlogs/1-content-storage-technical.md   待办捕获
│
├── .specify/                        Spec Kit（v1.0.6.dev0，含 memory/constitution.md）
├── .agents/skills/                  speckit-* 十个 skill
├── .claude/skills/                  同上（Claude Code 入口）
├── .opencode/commands/              同上（OpenCode 入口）
├── .workbuddy/{memory,skills}/      WorkBuddy 记忆 + skill 宿主
└── .codegraph → Owsel/.codegraph     iOS Unit 有索引
```

## 2. 做对了什么（可直接抄）

| # | 做法 | 效果 |
|---|---|---|
| 1 | **根 + Unit 双层 AGENTS.md** | 三端各自有上下文入口，根文件只放隔离规则和门禁指针 |
| 2 | **宪法 104 行 + ADR 钉死表** | 附录把 ADR-004/005/006 钉死，`/speckit.analyze` 能判 CRITICAL |
| 3 | **ADR-001~006 集中在 system.md** | 起步决策（iOS Only / MCP 协议 / 后端必要）有据可查，不会被"顺手优化"掉 |
| 4 | **Spec Kit 装四份入口** | `.agents` / `.claude` / `.opencode` / `.workbuddy` 各一份，换宿主不换流程 |
| 5 | **项目级 Skill 分层** | `ios-vibe-coding` 放硬约束 + `references/` 三份子清单（no-liquid-glass / build-verify / accessibility-checklist），渐进披露 |
| 6 | **Unit AGENTS.md 写清 Provides** | backend 写"提供 iOS API、PC site API、MCP 集成"，mcp 写"`content/push` endpoint"——职责不重叠 |
| 7 | **CodeGraph 段区分有无索引** | iOS："本 Unit 已建索引，必须先 explore"；backend/mcp："是否建索引由本 Unit 决定，勿替他 init"——两种写法都对 |
| 8 | **Skill 优先级明写** | "项目约束 > 第三方 Skill 的默认建议"写进 Unit AGENTS.md，冲突时不折中 |
| 9 | **Feature 目录带 contracts/ 与 checklists/** | feature 级契约草案与需求清单都有落点 |

## 3. 还差什么（新项目必须补上）

| # | 缺口 | 后果 | 对应手册章节 |
|---|---|---|---|
| 1 | **整个仓库不是 git 仓库** | 无历史、无分支、无回滚；两个 Agent 并行改同一 Unit 无法隔离 | [13-parallel.md](../docs/13-parallel.md) |
| 2 | **没有依赖协调图** | 三端有明确依赖（ios → backend → mcp），但合并顺序没有权威声明 | [14-dependency-graph.md](../docs/14-dependency-graph.md) |
| 3 | **没有 `docs/PROGRESS.md`** | 新 Agent 接手只能重读全部上下文，跨会话进度靠人记 | [15-memory.md](../docs/15-memory.md) |
| 4 | **Unit AGENTS.md 的 Verification 段是口号** | backend/mcp 写的是 "Provide test evidence" 而不是可执行命令 → Evidence 分级无法落地 | [11-evidence.md](../docs/11-evidence.md) |
| 5 | **backend / mcp 无 CodeGraph 索引** | 这两端的 Agent 靠 grep 摸索，Repository Grounding 打折 | [08-codegraph.md](../docs/08-codegraph.md) |
| 6 | **ADR 无 INDEX.md、无注入策略** | ADR 埋在 system.md 里，Agent 不一定去读 | [05-adr.md](../docs/05-adr.md) |
| 7 | **Spec Kit 版本落后** | 1.0.6.dev0；新版有 bug-fixing 流程与 extension 生态 | [06-spec-kit.md](../docs/06-spec-kit.md) |
| 8 | **宪法两份可能不同步** | 根 `constitution.md` 与 `.specify/memory/constitution.md` 需保持一致 | [04-constitution.md](../docs/04-constitution.md) |
| 9 | **无收尾门禁表** | 有 Evidence 原则（T3）但没有逐条可查的门禁清单 | [12-gates.md](../docs/12-gates.md) |

## 4. 新项目从 OWSEL 抄什么、别抄什么

**抄**：双层 AGENTS.md 结构、宪法六段式、ADR 钉死表、Skill 两级 + references 拆分、Spec Kit 四入口、CodeGraph 的"有/无索引"两种写法。

**别抄**：
- Unit AGENTS.md 里"Provide test evidence"这类口号 —— 换成可执行命令
- 只有 system.md 没有 ADR 目录 —— 新项目直接上 `adr/` + `INDEX.md`
- 没有 git 就开工 —— 见上表第 1 条
