# 04 — Constitution（项目宪法）怎么写

宪法是**项目长期原则**，不描述任何单个 feature（AEF §10.1）。它是所有 Agent 的最高法律：Spec Kit 的 `/speckit.plan`、`/speckit.analyze`、`/speckit.converge` 都会拿宪法做 Constitution Check，**违规自动判 CRITICAL**——这是宪法唯一的实际威力来源，所以内容必须写成"可判定的规则"，不是口号。

模板：`templates/constitution.md`。
参考：OWSEL 的 `constitution.md`（拆解见下）。

---

## 1. 必备六段

### ① 产品原则（P 系列）

回答"这个产品不许变成什么样"，不是"产品要做什么"。

> 好：**P1 认知主权** — AI 帮用户发现值得看的内容，而不是提高停留时间。
> 坏：**P1 好用** — 无法判定，等于没写。

### ② 技术原则（T 系列）

多 Agent 项目的 T 系列通常固定这几条（OWSEL 实测有效）：

- **T1 Agent 协作优先** — 所有设计必须考虑多 Agent 场景
- **T2 Shared Contracts** — 跨 Unit 信息必须结构化，禁止依赖聊天记录
- **T3 Evidence Based** — 完成必须有证据，不能 Agent 自称
- **T4 Artifact-based Handoff** — Unit 交接用 Artifact，不用自然语言

### ③ 架构原则（A 系列）

- **A1 单一事实源** — 每个事实只有一个权威来源（产品行为→Requirements，架构决策→ADR，API→Contracts，实现→Code）
- **A2 显式依赖** — Unit 依赖必须声明，禁止隐式耦合
- **A3 平台隔离** — 各端独立上下文，通过 Contracts 协作

### ④ 开发原则（D 系列）

Intent before Implementation / 最小必要文档（反 Spec Theater）/ 增量变更 / 失败可恢复 / Default to Action（低风险实现默认动手 + `// ASSUMPTION` 留痕，高 stake 才停下来问）。

### ⑤ 禁止事项（必须有，且必须是硬禁令）

四条通用禁令，任何项目照抄即可：

- ❌ **Silent Architecture Drift** — 偷偷改架构
- ❌ **Chat-based Handoff** — 依赖聊天记录交接
- ❌ **Agent Self-Approval** — Agent 自己声称完成
- ❌ **Giant Context** — 塞过多上下文进常驻文件

每条禁令后面**必须挂一个可执行的拦截点**（否则是空话）：

| 禁令 | 拦截点 |
|---|---|
| Silent Architecture Drift | 架构级改动必须有 ADR，否则 CRITICAL |
| Chat-based Handoff | 跨 Unit 交接只认 artifact 路径 |
| Agent Self-Approval | Evidence 必须来自外部工具（[11 章](11-evidence.md)） |
| Giant Context | 常驻 AGENTS.md < 150 行（[03 章](03-units.md)） |

### ⑥ 自动化等级 + 不可单方面改动的 ADR 附录

**自动化等级**（AEF §27）：本项目是 L0 无人 / L1 Agent Assisted / L2 人在环 / L3 自主。OWSEL 选 L1：Agent 干活、人审关键决策、Evidence 半自动、Convergence 用 Checklist。

**ADR 钉死表**：把"不许 Agent 顺手改"的决策列进宪法附录：

```markdown
| ADR | 名称 | 所在文件 |
|-----|------|---------|
| ADR-004 | 信息类型驱动详情页分发 | group/architecture/system.md |
```

有这张表，`/speckit.analyze` 才能在有人偷偷动这些决策时报 CRITICAL。

---

## 2. OWSEL 实例拆解（可复用的写法模式）

OWSEL 宪法 104 行，结构值得直接抄：

| 段 | OWSEL 内容 | 为什么有效 |
|---|---|---|
| P1–P3 | 认知主权 / 本地优先 / 质量>数量 | 都是否定式（"而不是提高停留时间"），可判定 |
| T1–T4 | Agent 协作优先等四条 | 覆盖多 Agent 项目全部协作面 |
| A1–A3 | 单一事实源 / 显式依赖 / 平台隔离 | 与 AEF G1–G3 一一对应 |
| D1–D4 | Intent before Implementation 等 | 对应 AEF G1/G5/G6 |
| 禁止事项 | 四条硬禁令 | 见上表 |
| 自动化等级 | Level 1 | 明确人和 Agent 的责任边界 |
| 附录 | ADR-004/005/006 钉死表 | 让宪法与 ADR 系统联动 |

**104 行是上限参考**。宪法越长，Constitution Check 越慢、CRITICAL 越泛滥，最后被人无视。

---

## 3. 写宪法的三条纪律

1. **每条原则都要能被 `/speckit.analyze` 判定违规**。写不出"什么情况算违反"的原则，删掉。
2. **不写愿望，写约束**。"高质量代码"是愿望；"禁止引入 Liquid Glass"是约束。
3. **改宪法是独立流程**，不能在 `/speckit.analyze` 里顺手稀释原则（Spec Kit 明确规定）。原则要改，单独跑 `/speckit.constitution` + 人 review。

---

## 4. 与 AEF / Spec Kit 的关系

- 宪法内容 ↔ AEF 设计目标 G1–G7，写的时候对照 AEF §2。
- 宪法文件同时放两处：项目根 `constitution.md`（人读）+ `.specify/memory/constitution.md`（Spec Kit 读）。OWSEL 两份内容一致——**保持同步，或直接软链**。
- 生命周期：项目初期写一次，之后**只在独立的宪法 review 中改**。

---

## 落地动作

1. 拷 `templates/constitution.md`，按六段填，控制在 150 行内。
2. 给每条禁令写一个拦截点（表格形式）。
3. 同步到 `.specify/memory/constitution.md`。
4. 人 review 通过后，才允许跑第一个 `/speckit.specify`。

> AEF 原文对应章节：§10.1 Constitution、§2 设计目标 G1–G7、§27 自动化等级、§36 Anti-Patterns。
