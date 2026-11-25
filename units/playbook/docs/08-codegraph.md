# 08 — CodeGraph：代码索引

## 1. 为什么需要

AEF 设计目标 **G2 Repository Grounding**：Agent 必须基于真实仓库事实，而不是只依赖聊天上下文。

没有索引时，Agent 靠 `grep` + 逐文件 Read 摸索：慢、烧 token、容易只看到片段就下结论。索引把"符号 → 定义 → 调用链"变成一次查询，Agent 拿到的是**结构化事实**而不是猜测。

业界同构做法：Tempest 的 "code-knowledge graph 一次索引、所有并行 Agent 共享"——核心论点是**别让 N 个并行 Agent 各自重读一遍代码库**。

## 2. 用法约定

### 建索引

```bash
# 每个 Unit 各建一份（Unit 边界 = 索引边界）
cd units/ios && codegraph init
cd units/backend && codegraph init
```

索引目录 `.codegraph/` **必须提交进 git**——这样其他 Agent clone 下来即刻可用，不用各自重建。

### 查询（Agent 的默认动作）

```
codegraph explore "<符号名 / 自然语言问题>"
```

一次返回：相关符号的逐行源码 + 符号之间的调用链 + 影响面摘要。**先 explore 再 grep/Read**——grep 只能匹配文本，跟不了动态派发。

### 维护

```bash
codegraph sync    # 改完代码后
```

不同步的后果：索引过期 → Agent 查到旧符号名 → 改错地方 → 违反 G2。

### 有无索引的判断

| 仓库有 `.codegraph/` | 行为 |
|---|---|
| 有 | **必须先** `codegraph explore`，再考虑 grep/Read |
| 没有 | 用常规 Read/Grep；是否 init 由该 Unit 自己决定，**不要替它 init** |

> 注意：索引是 Unit 自己的选择。全局开一个大索引反而破坏 Unit 边界（[03 章](03-units.md)）——iOS Agent 应该只查得到 iOS 代码。

## 3. 写进 AGENTS.md

每个 Unit 的 AGENTS.md 加固定段（模板已含）：

```markdown
## CodeGraph
本 Unit 已建 `.codegraph/` 索引。需要理解/定位代码时，先在本目录内跑
`codegraph explore "<符号/问题>"` 取符号源码+调用链，再考虑 grep/Read；
改完代码跑 `codegraph sync` 保持索引新鲜。
```

根 AGENTS.md 只需一行指针："各 Unit 的代码检索约定见各自 AGENTS.md。"

## 4. 与 Evidence 的配合

`codegraph explore` 的输出可以直接当 **E1 静态证据**（"改动点 X 确实只有这 3 处调用"）附进收尾报告——比 Agent 口头说"我检查过了"强得多。见 [11 章](11-evidence.md)。

### 4.1 写后审查与爆炸半径分析（code-review-graph）

- **写前探索 vs 写后审查**：
  - `codegraph`：面向开发编写期，以自然语言/符号做概念探索（`explore` / `query`）；
  - `code-review-graph`：面向提交审查期，以 Git Diff 逆向计算**爆炸半径（Blast Radius）**与受波及测试（`impact`）。
- **实战用法**：改动完成后，运行 `code-review-graph impact`，快速生成变更波及范围与单元测试覆盖清单，可直接作为收尾与审计阶段的客观证据（详见 `docs/code-review-graph-guide.md`）。

## 5. 常见坑

- **只 init 不 sync**：过期索引比没索引更危险（Agent 会信任它）。
- **把索引放 .gitignore**：每个新 Agent 都要重建，浪费且结果可能不一致。
- **跨 Unit 查询**：不要为了图方便在根目录建全仓索引，那等于取消 Unit 上下文隔离。

---

## 落地动作

1. 每个 Unit `codegraph init`，把 `.codegraph/` 提交。
2. Unit AGENTS.md 加 CodeGraph 段（见 §3）。
3. 门禁（[12 章](12-gates.md)）加一条："改动后已 `codegraph sync`？"

> AEF 原文对应章节：G2 Repository Grounding、§9 Repository Grounding、§8 Context Engineering。
