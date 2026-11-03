# 14 — 跨 Unit 依赖协调图

## 1. 解决什么问题

多端项目里最贵的一类事故：

> API 改了，后端先上线，客户端还在按旧契约跑 → 生产直接崩。

单仓 monorepo 里 CI 能兜住；一旦是多端、多仓、多 Agent 并行，**谁先合、谁后合、动哪些仓**必须显式声明。业界对应做法：mabl 的 **Repo Coordination Graph**（850 行，覆盖 79 个仓：依赖图、表归属、**规定的发布顺序**），Agent 做跨仓改动前先查它。

AEF 侧的对应是 **A2 显式依赖**（宪法）+ **G3 平台隔离**——隔离了还不够，还得有一张图说明"隔离的东西怎么连起来"。

## 2. 落地形态

一个文件：`group/architecture/dependency-graph.md`（模板 `templates/group/architecture/dependency-graph.md`）。

**即使只有 2 个 Unit 也要建**——图的价值在"合并顺序"，两个 Unit 就有顺序问题。

### 三张表

#### 表 1：Unit 依赖矩阵

| 依赖方 ↓ / 被依赖方 → | backend | mcp | ios |
|---|---|---|---|
| ios | ✅ HTTP API | — | — |
| mcp | ✅ MCP↔Backend | — | — |
| backend | — | — | — |

读法：ios 依赖 backend ⇒ **backend 必须先合、先发**。

#### 表 2：契约与版本

| 契约文件 | 生产者 | 消费者 | 版本 | 变更 ADR |
|---|---|---|---|---|
| `group/contracts/api.md` | backend | ios, mcp | v3 | ADR-004 |

#### 表 3：合并/发布顺序（拓扑序）

```
1. group/contracts/ （契约变更，如有）
2. backend
3. mcp
4. ios
```

顺序由表 1 拓扑排序得出。**依赖方永远在被依赖方之后。**

## 3. 使用规则

| 场景 | 动作 |
|---|---|
| 新 feature 跨 Unit | `/speckit.plan` 必须含本图的增量小节：动哪些格、顺序如何（[06 章 §4](06-spec-kit.md)） |
| 改契约 | 先 ADR → 更新表 2 → 通知消费者 → 消费者才开始改（[05 章](05-adr.md)） |
| 新增 Unit | 补全三张表，重算拓扑序 |
| 合并冲突 | 先按表 3 顺序合，契约冲突优先解决（[13 章 §3](13-parallel.md)） |
| 收尾门禁 | 跨 Unit 改动：报告里必须贴出本次涉及的表 1/表 3 片段（[12 章](12-gates.md)） |

## 4. 单仓 vs 多仓

| | monorepo（OWSEL 形态） | polyrepo |
|---|---|---|
| 图放哪 | `group/architecture/dependency-graph.md` | 中央"协调仓"（mabl 模式）或 AEF Group 目录所在仓 |
| 谁维护 | 各 Unit 提 PR 改图 | 中央仓 owner + 各仓 AGENTS.md 指向它 |
| 校验 | CI 检查契约变更是否有 ADR | CI 跨仓检查（GitHub MultiRepoOps 模式） |

**无论哪种，图必须是唯一权威**——不要在 AGENTS.md、PR 描述、聊天里另说一套依赖关系。

## 5. 与 Shared Contracts 的分工

容易混淆，一句话区分：

- **`group/contracts/api.md`** = 通信**内容**长什么样（字段、端点、错误码）
- **`dependency-graph.md`** = 谁依赖谁、**谁先动**（拓扑与顺序）

改内容 → ADR + 更新 contracts；改关系 → 更新图。两者都要进收尾报告。

---

## 落地动作

1. 拷 `templates/group/architecture/dependency-graph.md`，填三张表（Unit 少时表 1 也只要几行）。
2. 根 AGENTS.md 加："跨 Unit 改动前必须查 `group/architecture/dependency-graph.md` 确认合并顺序。"
3. `/speckit.plan` 产物模板加"本 feature 涉及的依赖图增量"小节。
4. 收尾门禁加：跨 Unit 改动已贴图中相关片段。

> AEF 原文对应章节：A2 显式依赖（宪法）、§23 Shared Contracts、§24 Parallel Development、§32 Traceability、§33 Source of Truth。
