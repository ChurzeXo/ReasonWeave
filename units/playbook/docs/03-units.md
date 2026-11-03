# 03 — Unit 设计与 AGENTS.md 分层

## 1. 什么时候切 Unit

一个 Unit = 一个**平台 / 技术域 / 部署单元**，不是一个模块。

判断标准（同时满足两条才切）：

1. **技术栈或运行时不同**（iOS / 后端 / MCP server / Web）
2. **可以独立验证**（有自己的 build / test 命令）

❌ 不要把 `user-service` 和 `order-service` 切成两个 Unit——同栈、同验证方式，切开只会让契约成本翻倍。同栈的服务用依赖协调图管理（[14](14-dependency-graph.md)），不用 Unit 边界。

## 2. Unit 边界三件套

每个 Unit 必须有且仅有这三样：

| 件 | 作用 | 模板 |
|---|---|---|
| `units/<x>/AGENTS.md`（或 Unit 子仓根 `AGENTS.md`） | 该端 Agent 的上下文入口 | `templates/AGENTS.unit.md` |
| 独立验证命令 | 该端"完成"的唯一判据 | 写在 AGENTS.md 的 Verification 段 |
| 独立索引（CodeGraph） | Agent 检索该端代码的入口 | [08](08-codegraph.md) |

**Unit 之间禁止直接读对方目录的实现代码**，只能读 `group/contracts/`。这条必须写进根 AGENTS.md——否则 iOS Agent 会"参考"后端实现然后猜错数据结构。

## 3. AGENTS.md 分层

三层，从上到下，**冲突时下层优先**（业界口径：离被编辑文件最近的赢，见 [agents.md](https://agents.md/)）：

```
根 AGENTS.md          项目级：宪法指针、隔离规则、共享约定、收尾门禁
  └─ units/<x>/AGENTS.md   Unit 级：技术栈、验证命令、平台硬约束
      └─ Skill（懒加载）    行为级：详细规范按需加载，不常驻上下文
```

### 写根 AGENTS.md 的规矩

**写规则，不写百科。** Anthropic 2026 明确推翻了"把所有已知实践塞进 CLAUDE.md"的旧习惯——常驻上下文的文件只放：

- 项目是什么、Unit 怎么分（3–5 行）
- 隔离规则：什么不许碰（[01 §4](01-architecture.md)）
- 收尾门禁指针（→ 12 章）
- 长文档的**指针**（"详细规范见 skill X"）

判断标准：**这条指令是每次任务都需要，还是只有某类任务需要？** 后者进 Skill，不进 AGENTS.md。

### 写 Unit AGENTS.md 的规矩

至少包含（模板齐全）：

```markdown
## Tech Stack          技术栈 + 版本基线（Swift 6 / iOS 27…）
## Responsibilities    这端负责什么、明确不负责什么
## Dependencies        依赖哪个契约文件（group/contracts/api.md）
## Verification        build/test 命令 —— 这就是"完成"的定义
## Project Skills      本端强制读的 skill + 路径
## Forbidden           本端硬禁令（引 ADR 编号，不复制 ADR 全文）
```

**Forbidden 段只写 ADR 编号 + 一句话**，细节让 Agent 去读 ADR 原文——这样 ADR 更新后不需要同步改 AGENTS.md。

## 4. 上下文预算

每个 Unit 的常驻上下文（AGENTS.md 全文）建议 **< 150 行**。超了说明：

- 有内容该进 Skill（懒加载）
- 有内容该进 ADR（被引用而非复制）
- 有内容根本不是本 Unit 的事（放错层）

## 5. 跨 Unit 协作的唯一通道

```
Unit A ──写──> group/contracts/api.md <──读── Unit B
                    │
                    └── 变更走 ADR + 依赖协调图（14 章）
```

契约变更流程：提出方写 ADR 草案 → 人 review → 更新 `contracts/api.md` → 依赖协调图登记 → 下游 Unit 才开始改。

详见 [14-dependency-graph.md](14-dependency-graph.md)。

---

## 落地动作

1. 用 `templates/AGENTS.unit.md` 给每个 Unit 建 AGENTS.md，填满 Verification 段（没写验证命令的 Unit 不算建好）。
2. 在根 AGENTS.md 加一行："Unit 之间只通过 `group/contracts/` 通信，禁止直接读其他 Unit 的实现。"
3. 数一遍根 AGENTS.md 行数，> 150 行就把该懒加载的搬进 Skills。
4. 给第一个干活的 Agent 时，prompt 里写明读取顺序：根 → Unit → 宪法。

> AEF 原文对应章节：§6 Group/Unit、§6.2 Unit、§8 Context Engineering、§9 Repository Grounding、§23 Shared Contracts、G3 Multi-Agent Isolation。
