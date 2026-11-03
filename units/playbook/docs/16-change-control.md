# 16 — 中途需求变更：Change Control

## 1. 解决什么问题

需求变更有两种，手册处理方式不同：

| 类型 | 例子 | 去哪 |
|---|---|---|
| **范围外的新想法** | "以后还可以加个 X" | [07-backlog.md](07-backlog.md) |
| **正在做的需求变了** | "这个 feature 的验收标准改一下" | **本章** |

第二类没有流程的后果，英文工程实践里叫 **spec drift**（规格漂移）：spec 文档停在三周前，代码早跑偏了，两边都自称"权威"。Spec Growth Engine 论文的结论很直白——**spec 单独放一个文档必然漂移，唯一有效的解法是代码改动与 spec 修订进同一个 commit，再加一个漂移校验器**。

## 2. 触发条件

出现以下任一信号，走本章流程，**不许直接改代码**：

- 验收标准（acceptance criterion）要增删改
- spec 里的方案、数据结构、接口要换
- 人中途提出新要求，且**落在当前 feature 的范围内**
- 实现中发现 spec 写错了（照 spec 做会做出错的东西）

## 3. 流程：登记 → 评估 → 决策 → 同 commit 落地

借鉴 BMAD `correct-course`（中途变更需评估对 PRD/epics/架构/UX 的影响并产出变更提案）与经典 change control（变更 ≠ 问题，只有批准的变更才动基线）。

### Step 1 登记（CR 记录）

在当前 spec 目录下追加一节，不新开文档：

```markdown
## 变更记录

### CR-001 验收标准 AC-3 改为分页加载
- **日期**: 2026-10-08
- **提出人**: 人
- **为什么要改**: 全量加载在弱网下超时，AC-3 原文不现实
- **不改的后果**: 上线即超时投诉
```

**「为什么要改」和「不改的后果」缺一不可**——没有这两条，三个月后没人能判断这条变更当初该不该批。

### Step 2 影响面评估

逐项回答，答案写进 CR 记录：

```
□ 受影响的 spec 段落：（文件路径 + 章节号）
□ 受影响的 tasks.md 条目：（哪些已完成、哪些要做、哪些作废）
□ 受影响的 ADR / contracts：（有 → 架构级，先补 ADR 再动手，见 05 章）
□ 受影响的 Unit：（跨 Unit → 依赖协调图 14 章 + handoff 10 章）
□ 挤掉什么：（当前 tasks.md 里哪些条目被推后）
□ 证据要求变化：（E 级别要不要升，见 11 章 §2）
```

**「挤掉什么」是这套评估的核心**——变更不是免费的，不写代价的评估等于没评估。

### Step 3 三选一决策

| 选项 | 条件 | 动作 |
|---|---|---|
| **现在做** | 影响面清晰、代价可接受、人批准 | 走 Step 4 |
| **延后** | 该改但不急、或当前做代价太大 | 转 `docs/backlogs/`（07 章格式），标 `来源: CR-001` |
| **拒绝** | 与 intent 冲突 / 代价远超价值 | CR 记录标 `Rejected` + 理由，留档 |

人批准是硬要求。Agent 可以完成 Step 1–2 的全部分析并给出建议，**但不能替人做 Step 3 的选择**（AEF §26 Human-in-the-Loop）。

### Step 4 同 commit 落地（防漂移的关键）

批准后按顺序执行，**spec 修订与对应代码改动必须在同一个 commit**：

```
1. 改 spec（acceptance criterion / 方案段落）
2. 回写 tasks.md（增删条目，与新 spec 一致）
3. 涉及架构 → 先补/改 ADR
4. 改代码
5. commit message 引用 CR 编号：feat: AC-3 改分页 (CR-001)
```

顺序不能反：**先改 spec 再改代码**，否则改完代码回头补的 spec 永远是"描述已发生的事"，不再是约束。

## 4. 漂移校验

收尾门禁里加一条机械检查（[12 章](12-gates.md)）：

```
□ 本次代码改动 ↔ spec 修订在同一 commit（或同一 CR 记录里成对出现）
□ tasks.md 与 spec 当前内容一致，无遗留旧条目
```

Spec Growth Engine 的口径：靠自觉的同步一定会断，**靠 commit 粒度绑定 + 收尾校验才立得住**。

## 5. 与其它系统的边界

| 场景 | 去哪 |
|---|---|
| 范围外的新想法 | [07-backlog.md](07-backlog.md) |
| 架构级变更 | [05-adr.md](05-adr.md)（CR 评估发现涉架构时） |
| 跨 Unit / 跨仓影响 | [14-dependency-graph.md](14-dependency-graph.md)、[10-handoff.md](10-handoff.md) |
| 只是实现细节微调，spec 不动 | 不用走 CR，正常改 |
| 未完成任务的重排 | `/speckit.converge` 回写 `tasks.md` |

## 6. 反模式

| 反模式 | 表现 | 拦截 |
|---|---|---|
| **静默改 spec** | 代码改了，spec 三周后才有人补 | Step 4 同 commit 硬规则 + 门禁校验 |
| **口头变更** | 聊天里说了一句就动手 | 无 CR 记录 = 门禁不过 |
| **评估不写代价** | "影响不大" 五个字 | Step 2 的「挤掉什么」必填 |
| **CR 变僵尸** | 登记了但没人决策 | 延后的 CR 必须转 backlog 或标 Rejected，不许悬空 |

---

## 落地动作

1. 在 `specs/NNN-*/spec.md` 末尾加「变更记录」节，放第一条示例 CR。
2. 根 AGENTS.md 加一句：**"验收标准/方案要改时，先在 spec 的变更记录里登记 CR 并完成影响面评估，人批准后先改 spec 再改代码，两者同一 commit。禁止静默变更。"**
3. [12-gates.md](12-gates.md) §B 加两条：变更走了 CR 流程、spec 与代码同 commit。
4. [07-backlog.md](07-backlog.md) §5 边界表加一行，把"进行中的需求变更"指到本章。

> AEF 原文对应章节：§18 Incremental Change、§15 Definition of Done（AC 是验收基准）、§16 Convergence（收敛回 Intent）、§32 Traceability（CR → spec → code 可追溯）、§26 Human-in-the-Loop。
