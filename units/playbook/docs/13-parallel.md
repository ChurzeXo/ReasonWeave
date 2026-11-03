# 13 — 并行执行隔离

> Unit 隔离（[03 章](03-units.md)）解决"改错端"；本章解决"**两个 Agent 互踩**"。两者不可互相替代。

## 1. 三条铁律

### 铁律 1：一个 Agent 一个 worktree / 分支，别无例外

```
One agent per worktree. One worktree per branch. No exceptions.
```

这是 2026 年英文实践圈的共识表述。它一次性解决：文件冲突、git 历史可读、Agent 跑飞可回滚、无需文件锁。

```bash
git worktree add ../myproj-feat-login -b feat/login
# Agent A 在 ../myproj-feat-login 干活
git worktree add ../myproj-feat-api   -b feat/api
# Agent B 在 ../myproj-feat-api 干活
```

收尾：各自 commit + push 分支 → PR → 人 review → 合并。**Agent 永远不直接 push 主干。**

### 铁律 2：写操作单线程，其余 Agent 只出智能

Cognition（Devin 团队）的实证结论：

> multi-agent systems work best today when **writes stay single-threaded** and the additional agents contribute intelligence rather than actions.

落地形态（map-reduce-and-manage）：

```
                 ┌── Implementation Agent A（唯一写者，worktree A）
Manager ─拆分──> ├── Implementation Agent B（唯一写者，worktree B）
   ▲             └── ...
   │                    │
   └── 汇总 <── Reviewer / QA（只读，出意见不改代码）
```

- **可并行的**：只读探索、评审、测试执行、文档起草
- **必须串行的**：同一文件的写入、契约文件变更、合并

⚠️ 明确反对的形态：**unstructured swarm**（Agent 之间自由协商网络）——Cognition 称之 "mostly a distraction"。没有 manager 的 swarm 会导致职责漂移和重复劳动。

### 铁律 3：subagent 不能再 spawn subagent

Claude Code / OpenCode 等主流宿主的硬约束：**子代理不能创建子代理**。

推论（架构上很重要）：

```
❌ 三层拓扑：router agent → repo agent → answer agent
✅ 两层拓扑：编排器 = 主会话（你正在对话的那个），只能直接调用一层 subagent
```

编排器必须是**主会话本身**：它读你的请求、按各 Unit Agent 的 `description` 路由、并行扇出、汇总报告、回答你。所以 [03 章](03-units.md) 里每个 Unit Agent 的 `description` 要写成路由信号（"use when …"），`tools` 字段做硬护栏（不给 Edit/Write 就是物理只读）。

## 2. 与 AEF 的对应

| 本章 | AEF |
|---|---|
| worktree 隔离 | §24 Parallel Development、§17 Failure Recovery（可回滚） |
| 单线程写 | §11 Agent Roles（Implementation 是写者）、§24 |
| 编排器拓扑 | §22 Agent Communication、§21 Agent Permission Model |

AEF §21 的权限模型在这里落地：**Implementation Agent 可写但范围受限（只能写自己的 worktree + 本 Unit 目录）；Reviewer/QA 只读。**

## 3. 合并冲突怎么办

worktree 隔离只保证**并行期间**不冲突，合并时仍可能冲突。处理顺序：

1. **契约文件（`group/contracts/`、`dependency-graph.md`）冲突优先解决**，因为它决定其余代码怎么合
2. 同 Unit 内冲突 → 该 Unit 的 Agent 自己解（它有上下文）
3. 跨 Unit 冲突 → 停下来走 [14 章](14-dependency-graph.md) 的合并顺序，不许硬合

参考 Anthropic C 编译器实践：冲突很常见，让 Agent 自己 pull → 解冲突 → push 是可行的，**前提是每个 Agent 的改动边界清楚**（Unit 边界 + 分支边界）。

## 4. 隔离方式选型

| 方式 | 优点 | 代价 | 适用 |
|---|---|---|---|
| **git worktree**（推荐） | 同仓共享索引、零网络开销 | 同一 `.git`，大仓多 worktree 占磁盘 | 默认选择 |
| 独立 clone + 分支 | 彻底隔离 | clone 成本、需同步 upstream | 不同 Unit 在不同仓时 |
| 容器（Docker） | 环境完全一致 + 沙箱 | 启动慢、需镜像维护 | 有环境依赖/需沙箱时 |
| 仅目录约定 | 零成本 | **无历史、无回滚、防不住互踩** | ❌ 不要用 |

> OWSEL 现状提醒：整个仓库没有 git，隔离只有目录边界。任何并行场景前必须先 `git init`。

## 5. 编排器的职责清单

主会话（编排器）只做这五件事：

1. 读请求 → 判断是否跨 Unit / 是否可并行
2. 按 `description` 路由到对应 Unit Agent，**并行扇出**只读任务
3. 收集报告 → 汇总 → 回答
4. 检查各 Agent 的产出是否落在自己的分支/目录内
5. 需要人拍板时**停下来问**，不自行决定架构级问题

编排器**不**写代码、**不**持有任何 Unit 的细节（细节由 Unit Agent 自己保有）。

---

## 落地动作

1. 确认 `git init` 已完成（[02-bootstrap.md](02-bootstrap.md) Step 1）。
2. 根 AGENTS.md 写入三条铁律的浓缩版：
   ```
   - 一个 Agent 一个 worktree/分支，Agent 永不直接 push 主干
   - 只有 Implementation Agent 可写，Reviewer/QA 只读
   - 编排器 = 主会话，只调用一层 subagent
   ```
3. Unit Agent 定义里：`description` 写成路由信号，只读角色的 `tools` 去掉 Edit/Write。
4. 定合并顺序 → 见 [14 章](14-dependency-graph.md)。

> AEF 原文对应章节：§24 Parallel Development、§21 Agent Permission Model、§22 Agent Communication、§17 Failure Recovery、G3 Multi-Agent Isolation。
