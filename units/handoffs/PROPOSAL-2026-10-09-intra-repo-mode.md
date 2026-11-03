# PROPOSAL：Handoff Hub「仓内模式」设计草案（intra-repo ⊃ same-workspace）

> 状态：**已落地（仓内模式 step 1-4 完成 · 2026-10-10）**。本文原为设计草案（draft v2），现已随实现落地；`handoff.mjs` 的 `init/new/status/check/import/accept/reject` 等均已实现，§13 的 7 个未决问题已全部拍板（其中 Q4 continuation close 归属已代码强制）。
> 契约基线：v2.8.x（2026-09-10）。提出日期：2026-10-09。落地后升契约至 **v2.9**（§14 第 1 条，跨仓行为**零变更**）。
> 配套阅读：`DESIGN.md §5.7 / §七`、`COREML-CONVENTION.md`、`HANDOFF-HUB-REDESIGN-DISCUSSION-2026-09-04.md`。
> 动因：①**对话窗口上下文长度有限**（必须续接到新窗口）；②**多 Agent 交叉验证**（生产/验收需独立 agent）。二者都要在**同一仓边界内**发生 ⇒ 需要把「仓内」补成一等模式。
>
> **v2 修订要点**（相对 v1）：把「同工作区」从与「单仓多窗口」并列的**兄弟**，改为「仓内」内的**一个正交属性取值**；把「免转递」从「仓内通性」降级为「同工作区的推论」。理由见 §2。

---

## 0. TL;DR（一屏结论）

1. **同一条 `handoff.mjs`、同一套状态机、同一套骨架**，靠**项目作用域根**自动切模式——引擎不变，只是 root 与路由键解释不同。
2. 路由键从「接收**仓库**」泛化为「接收**通道** `lane`」；命令形状不变：`handoff new <lane> <type> "<标题>"`。
3. 每个项目自带**版本化** `.handoffs/` 子 Hub（配置 + 交接 + 回执），**随代码走**。
4. 仓内新增**机器可读 `status` + 新窗口冷启动协议**，根治「新窗口忘记是否交接 / 是否回执」。
5. **层级关系（核心）：** 一次交接按「跨越的边界」嵌套——**同工作区 ⊂ 仓内 ⊂ 跨仓**。仓内是**边界概念**；同工作区是其**最内成例**（不跨工作目录边界 ⇒ 免转递）。
6. 跨仓契约与 `--json` v1 自动化**逐字不动**；仓内是**新增模式**，不是替换。

---

## 1. 背景与问题

### 1.1 现状（Hub 的能力面）

| 拓扑 | Hub 支持 | 落地形态 |
|---|---|---|
| 跨仓（Swoop / Prospero / iggle） | ✅ 一等 | `~/Documents/lab/handoffs/`，CLI + 状态机 + check |
| 同工作区（iggle ↔ iggle-coreml） | ⚠️ 特例（被当成并列模式） | `README.md §同工作区侧` + `COREML-CONVENTION.md` |
| 单仓多窗口 / 多模型 | ❌ 无 | 用户被迫自建无状态体系（如 Tappy `mcp-server/handoffs/` 210 文件） |

### 1.2 根因

- Hub 的数据模型只有一个路由维度：`<TARGET>` = **接收方仓库**，`TARGETS = 仓库集合`（`DESIGN.md §7.3`）。单仓里 target **恒为同一仓** ⇒ 路由键无信息量。
- 更深的根因是**模式层级没定清**：COREML 文案把「两侧是否同一工作区」当成**判据**（`README.md §同工作区侧`），而「同工作区」实际是**仓内的一个属性取值**，不是独立模式。把属性当模式，就生不出「单仓多窗口」这一格。

### 1.3 新窗口失忆（用户 #1 痛点）

同项目开新窗口换模型时：新窗口加载 AGENTS.md → 读「handoffs 只走 lab CLI、勿扫描目录」→ 无上一窗口记忆 → 唯一合规查询 `handoff status` 扫的是 **lab 目录**，210 个仓内文件一个不返回 → **假信号「无未闭环项」** → 重做或误判收尾。

> 同类事故 Hub 作者已踩过（`COREML-CONVENTION.md:19-21`）：「流程暗示『两侧是独立实体』，曾把一个会话 15:25 写在同一批文件里的实现判定成『另一窗口已补』…… 靠 `mtime` 猜是谁写的——**这是流程设计的错**。」——这条事故恰恰源于「同工作区」被当成模式而非属性，导致**验证独立性**没有守恒。

### 1.4 目标 / 非目标

**目标**：把「仓内」补成一等模式，与跨仓**共用**引擎/状态机/骨架/check/桩；给仓内提供**机器可读状态**与**发现入口**；跨仓契约与自动化**零破坏**。

**非目标**：不改跨仓任何行为/字段；不引入网络/后端/数据库；不强制存量项目迁移。

---

## 2. 层级关系：为什么「仓内 ⊃ 同工作区」（**v2 核心修订**）

### 2.1 最短证明

- **同工作区 = 同仓 ∧ 同工作目录**；
- **仓内 = 同仓**。

同工作区是在仓内之上**多加一个约束**（同目录）后的特例 ⇒ **同工作区 ⊂ 仓内**。反过来：存在「同仓但不同目录」的仓内交接（两个 worktree / 两个 clone），它们**不是**同工作区 ⇒ 是真子集，**不是并列**。

### 1/2.2 严格分层：按「跨越的边界」占位

一次交接可跨越三种**嵌套**边界：

```
上下文边界 ⊂ 工作区边界 ⊂ 仓库边界
(agent/session)  (working dir)   (repo / ownership)
```

| 模式 | 跨越的边界 | 共享真相范围 | 转递 |
|---|---|---|---|
| **同工作区** | 仅上下文 | 工作目录 + 仓 | **免**（文件物理共享） |
| **仓内（异工作区）** | 上下文 + 工作区 | 仅仓（经 git） | 需经 git / 子 Hub |
| **跨仓** | 上下文 + 工作区 + 仓库 | 仅契约 | 人工转递 + 钉版本 |

跨越边界越少 ⇒ 共享越紧 ⇒ 层级越内。于是**严格嵌套：同工作区 ⊂ 仓内 ⊂ 跨仓**（证明见 §附 A）。

> 因此「仓内 ⊃ 同工作区」是**真包含**：仓内 = 同工作区「去掉『必须同目录』」后的推广；同工作区 = 仓内中「连工作目录都不跨」的最内成例。

### 2.3 v1 的两处错误（本版纠正）

- **错误 1｜并列化**：v1 把「同工作区」与「单仓多窗口」并列为兄弟。实为**范畴错误**——前者是**工作区关系**的取值，后者是**参与者描述**；二者会交叉（两窗口同目录跑 ⇒ 既是单仓多窗口又是同工作区，即用户当前场景）。
- **错误 2｜过度泛化「免转递」**：v1 把「免转递、draft 即可开工」写成仓内通性。实为**同工作区专属**（未跨工作区边界）；异 worktree 的仓内交接**仍需落地**。

---

## 3. 核心设计：仓内 = 模式；同工作区 = 其「免转递角落」

Hub 原把「**根在哪**」与「**路由键是谁**」耦合成 `TARGET`。本草案拆成：**模式（由根决定）** + **正交属性（由 frontmatter 决定）**。

### 3.1 两个维度

| 维度 | 跨仓模式 | 仓内模式 |
|---|---|---|
| **作用域根** | lab Hub（`~/Documents/lab/handoffs/`） | 项目内 `.handoffs/`（随仓走） |
| **路由键** | `TARGET`（接收仓库） | `LANE`（接收通道：role/流/窗口标签） |
| **边界** | 跨上下文 + 工作区 + 仓 | 只跨上下文 |
| **状态机** | draft→forwarded→received→closed | **同一状态机** |
| **check 门禁** | 体检 lab 库 | 同一检查，换根 |
| **谁闭环（accept/reject）** | 发起方收回执=审计：`accept` 通过即闭环 / `reject` 退回 | **发起方（`from_lane`）收回执=审计**：`accept` 通过即闭环 / `reject` 退回；执行方不 accept/reject |

### 2/3.1 正交属性（仓内的行为由此取值决定，**不**另立模式）

| 属性 | 取值 | 影响 |
|---|---|---|
| **工作区关系** | `same`（同工作区）｜`separate`（异工作区） | `same` ⇒ **免转递** + **并发写归属风险**；`separate` ⇒ 需先同步工作树 |
| **时序关系** | `sequential`（续接新窗口）｜`concurrent`（并发多 agent） | 决定续接要点 / 并发冲突风险 |
| **验证关系** | 恒为**生产/验收分离** | 仓内**定义性属性**：执行方不 accept/reject + 验收方独立实测 |

> **为何交叉验证是恒有属性而非子模式**：它正是造仓内的两大动因之一（§1 动因②）。任何仓内交接都必须保留验证独立性——**尤其同工作区**，共享目录最容易破坏独立性。

**引擎同源**：`handoff.mjs` 加 root 解析，模式由**解析到的根**推断，命令面不变。

---

## 4. 作用域根与模式发现

### 4.1 根解析优先级（引擎内置）

```
1. 显式 --root <path>            → 用该目录（须含 .handoff-hub.json）
2. 环境变量 HANDOFF_ROOT         → 同上（CI / 脚本用）
3. 从 cwd 逐级上溯，找含 .handoff-hub.json 的目录 → 命中即「仓内模式」
4. 都不命中                       → 回退 lab Hub（「跨仓模式」，行为同今天）
```

> 同一份引擎、模式由根推断，避免「两套 CLI 漂移」（Hub「双载体同源」铁律）。

### 4.2 项目子 Hub 目录结构

```
<repo>/.handoffs/                    ← 项目作用域根（默认名 .handoffs/，可配）
├── .handoff-hub.json                ← 配置：mode / lanes / types / workspace / close_policy
├── handoffs/                        ← <LANE>-<YYYYMMDD>-<NN>-<TYPE>.md
├── receipts/                        ← <ID>-resp.md
└── STATUS.md                        ← （生成物，非权威快照，供人类 / 无 CLI 工具）
```

- 目录默认名 `.handoffs/`（**点前缀**，与 lab Hub 的 `handoffs/` 视觉区分，压掉「同名不同质」历史坑）；名称可配。
- **提交进 git**（随代码走）。lab Hub「不属于任何仓库」的初心是让**依赖方**安全写入而不越界；仓内双方同属一仓，该约束不存在，故**应当**版本化。可经 `gitignore: true` 退出。

### 4.3 配置骨架 `.handoff-hub.json`

```json
{
  "mode": "intra-repo",
  "project": "tappy",
  "lanes": ["impl", "audit", "next"],
  "types": ["task", "bug", "feature", "question", "continuation"],
  "workspace_default": "same",        // same | separate；单条交接可覆盖
  "close_policy": "sender"            // sender=发起方收回执审计后 accept 闭环；self=continuation 由后继会话 accept 闭环
}
```

---

## 5. 数据模型

### 5.1 ID 编码

```
跨仓（不变）：<TARGET>-<YYYYMMDD>-<NN>-<TYPE>      例：SWOOP-20260910-02-bug
仓内（新增）：<TO_LANE>-<YYYYMMDD>-<NN>-<TYPE>     例：AUDIT-20261009-01-task
```

**前缀 = 接收通道 = 回执撰写方**（与跨仓「前缀 = 接收方」同构）。

### 5.2 交接 frontmatter（仓内）

```yaml
---
handoff_id: AUDIT-20261009-01-task     # = 文件名（双重校验，同跨仓）
mode: intra-repo                        # 新增：跨仓无此字段（或缺省 cross）
project: tappy                          # 新增：来自配置
from_lane: impl                         # 新增（仓内必需）：发起通道
to_lane: audit                          # 新增：接收通道（= 前缀）
workspace: same                         # 新增（可选）：same | separate，默认取配置
timing: sequential                      # 新增（可选）：sequential | concurrent
type: task
status: draft                           # draft → forwarded(可选) → received → closed
created: 2026-10-09
closed: ''
---
```

> `from_lane` 是仓内**真正新增字段**（单仓无 `from_repo` 可辨发起方）。
> `workspace`/`timing` 仅影响**提示与校验**，**不影响路由**（路由永远只认 `to_lane` + `--for`）。

### 5.3 回执 frontmatter（仓内）

```yaml
---
handoff_id: AUDIT-20261009-01-task
mode: intra-repo
from_lane: audit                        # 撰写方（= 原 to_lane）
to_lane: impl                           # 验收方（= 原 from_lane）
date: 2026-10-09
needs_change: true                      # 泛化自跨仓 needs_iggle_change
---
```

### 5.4 关联与孤儿检测（复用跨仓规则）

文件名 `<ID>-resp.md` ↔ 交接 `<ID>.md` + frontmatter `handoff_id` 双写校验；孤儿回执 → `check` 报错。

---

## 6. 状态机（同一套；`draft` 语义随工作区关系）

```
                          ┌── accept -n "<验收结论>" ──▶ closed（审计通过，一次闭环）
draft ──forward──▶ forwarded ──receipt──▶ received
                          └── reject -n "<驳回理由>" ──▶ forwarded（审计不过，退回执行方继续改）
```

| 状态 | 仓内含义 | 谁推进 |
|---|---|---|
| `draft` | 已写。**同工作区**=可开工（免转递，draft 即待处理）；**异工作区**=已写、待落地到对方工作树 | 发起 lane |
| `forwarded` | 可选事后标记（同工作区多数可跳过） | 发起 lane |
| `received` | 接收 lane 已写回执 | 接收 lane |
| `closed` | 发起 lane 审计通过并闭环（`accept`；**执行方不 accept/reject**） | 发起 lane |

**铁律（沿用）**：
- 判「该不该开工」只看 **`to_lane` = 本窗口职责** + **交接是否落我手上**，不看 draft/forwarded。
- **执行方不 accept/reject**；发起方收回执=审计，**独立实测**（自备夹具，**不复用对方推理/夹具**）后 accept 通过才闭环、reject 退回。
- 无 `-n` 结论，CLI 拒绝（accept 与 reject 都要求 -n）。
- `close_policy=self`（`continuation`）：续接给下一窗口，后继会话完成即由**它** accept 闭环（代码强制：accept 须 `--by <to_lane>` 声明后继会话身份，不匹配即拒绝）。

> `draft=待处理` 的全局默认（v2.7 防漏单）在异工作区场景仍**安全**（宁可让接收方多看一眼也不漏单）；差别只在**提示语**（§7）。

---

## 6/7. 发现入口与「新窗口冷启动协议」（治失忆核心）

### 7.1 发现契约（沿用 Agent Consumption Contract）

> **MUST NOT 扫描 `handoffs/`**；发现入口永远是 `handoff status`（实时扫 frontmatter）。命中候选后再 `Read` 指定正文。

### 7.2 发现命令

| 命令 | 作用 |
|---|---|
| `handoff status`（项目根） | **全项目未闭环清单**（所有 lane）——新窗口冷启动第一跑 |
| `handoff status --for <lane>` | 某通道待办（= 跨仓 `--for <target>`） |
| `handoff show <ID>` | triage 摘要 |
| `handoff check` | 一致性门禁（收尾硬门禁，exit 0） |

### 7.3 新窗口冷启动协议（写进桩，含工作区分支）

```
0. 进入项目 → handoff status
   （引擎自动上溯 .handoffs/ → 返回本项目全部未闭环项）
1. 若我承担某 lane → handoff status --for <lane> 认领
2. handoff show <ID> 看摘要 → 只 Read 命中的那几份
3. 执行：
   - workspace=same   → 直接改共享工作树；【归属纪律】只按 frontmatter/文件内容定「谁写的」，
                        严禁用 mtime 推断（COREML 事故根因）
   - workspace=separate → 先同步工作树（git fetch/pull 或对方路径）再改
4. 写 receipts/<ID>-resp.md（按 RESPONSE-TEMPLATE）
5. 发起 lane 收回执=审计（自备夹具）→ 通过 `handoff accept <ID> -n "<结论>"` / 不过 `handoff reject <ID> -n "<理由>"`
6. 收尾：handoff check exit 0
```

### 7.4 可选：声明本窗口 lane

窗口设 `HANDOFF_LANE=audit`（env）→ 裸 `status` **高亮**本 lane 待办并置顶。

---

## 8. CLI 变更（最小增量，命令形状不变）

| op | 变更 | 说明 |
|---|---|---|
| `--root <path>` | 新增全局旗标 | 显式指定作用域根 |
| `init [--root]` | **新增** | 生成 `.handoffs/` + `.handoff-hub.json` 骨架 |
| `status/check/show/sync/accept/reject/receipt/prompt` | 扩展 | 支持 `--root` 与仓内 frontmatter、`workspace`/`needs_change` |
| `new <lane> <type> "<标题>"` | **形状不变** | `TARGET` 位现按根模式接受 `lane` 并校验 |

**不变**：状态机、提示词一行式、骨架、`check` 硬门禁语义、`--json` v1 schema（冻结）。

---

## 9. `check` 门禁扩展

**硬阻断（快照一致性）**
- 文件名符合 `<LANE>-<date>-<NN>-<type>`；frontmatter 存在；`handoff_id` = 文件名；
- `mode`/`to_lane`/`type`/`status`/`workspace` 枚举合法；`to_lane` ∈ 配置 `lanes`；
- `received`/`closed` 必须有回执；`closed` 必须有 `closed` 日期 + 「验收记录」节；
- 孤儿回执；**lane 名与任何 `TARGET` 撞名**（防串味）告警。

**非阻断（可见性）**
- 体积超限（交接 ≤60 行 / 回执 ≤50 行，沿用）；
- 回执缺转递提示词——**workspace=same 跳过**（免转递，同 COREML 排除）。

---

## 10. 接入桩变更（stub v2.1）

```markdown
<!-- handoff-stub:v2.1 begin -->
### 交接（指针桩 · 细则以 ~/Documents/lab/handoffs/README.md 契约 v2.9 为准）
1. 先判模式：从 cwd 上溯有 `.handoffs/.handoff-hub.json` → **仓内模式**；否则 → **跨仓模式**。
2. 一切操作只走 CLI：`node ~/Documents/lab/handoffs/handoff.mjs <op>`（散文触发，按 Path 路由）。
3. 发现待办（MUST NOT 扫描 handoffs/）：
   - 跨仓：`handoff status --for <repo>`（发起方裸 `status`）；
   - 仓内：**新窗口第一跑 `handoff status`**（全项目未闭环），再 `--for <lane>` 认领。
4. 仓内先看本条 `workspace`：same=免转递（同会话切角色/新窗口自取），且**定归属只读 frontmatter，禁 mtime**；
   separate=先同步工作树再看。
5. 判「该不该开工」：只看目标是否 = 本窗口职责 + 交接是否落我手上，**不看 draft/forwarded**。
6. 执行方不 accept/reject；发起方收回执=审计，通过后 `handoff accept <ID> -n "<验收结论>"`，不过用 `handoff reject <ID> -n "<驳回理由>"` 退回。
7. 任务收尾硬门禁：`handoff check` 必须 exit 0，否则任务不算完成。
<!-- handoff-stub:v2.1 end -->
```

> 桩只指路，细则永远以契约为准；`install` 幂等替换，旧 v2.0 桩自动迁。

---

## 11. 与 COREML 的关系（本版修正）

- **§同工作区侧（COREML）不再是一种模式**，而是**仓内模式中 `workspace=same` 的成例**；
- 其「免转递 / 执行方不 accept/reject / 验收独立实测」三不变量，**前一条仅为 same 属性推论，后两条上升为仓内通则**；
- `COREML-CONVENTION.md` 保留为背景说明，并补一条：**同工作区的并发写归属纪律（禁 mtime 推断）**；
- 存量 COREML 交接（`crates/iggle-coreml`）**不回改**，`check` 双认。

---

## 12. 迁移路径（以 Tappy 为样例，可选、渐进）

**现状**：`mcp-server/handoffs/` 210 文件，仅 12 个有 `status:`，1 个有 `handoff_id`，命名漂移（同编号多标题、`-EXEC/-EXEC-COMPLETE/-EXEC-VERDICT` 拆多份）。

1. `handoff init` 在 Tappy 根生成 `.handoffs/`（`lanes: ["mcp","audit"]`）。
2. **存量不重写**：提供 `handoff import --from <dir> --heuristic`（**可选**，best-effort 补 frontmatter：`HANDOFF-*`→`mode:intra`、`-resp`→回执、`-COMPLETE`/`VERDICT`→标 `closed候选`），生成**只读** `STATUS.md`；无法判定的进 `unresolved` 交人工。**默认 draft-only**（不自动闭环，`closed候选`仅提示供人工复核）。
3. **向前采纳**：新交接一律 `handoff new <lane> ...`，走新状态机。
4. 旧 `mcp-server/handoffs/` 保留归档。

> 迁移**可选**：不迁也能用，只是新工作走状态机，旧文件留档。

---

## 13. 未决问题 → 已全部拍板（决策记录）

> 下表 7 问已在落地过程中全部拍板，保留作决策记录（避免误读为仍待决）。**Q4（continuation close 归属）已代码强制落地**。

| # | 问题 | 拍板结论 |
|---|---|---|
| Q1 | 项目子 Hub 目录名 | `.handoffs/`（默认） |
| Q2 | 是否提交进 git | 提交（随代码版本化） |
| Q3 | lane 语义 | 自由命名（role / 流 / 窗口标签；Tappy 用 `impl`/`audit`） |
| Q4 | `continuation` close 归属 | 默认 `sender`（发起方 accept 闭环）；`close_policy=self` 时由后继会话 `to_lane` accept 闭环——**已代码强制**（`handoff accept <ID> --by <to_lane>` 硬校验，缺/错即拒） |
| Q5 | `workspace` 默认值 | `same` |
| Q6 | 撞名校验 | **硬阻断**（比草案推荐的「告警」更严：lane 撞 `TARGET` 则前缀不可区分，`new`/`init` 直接 exit 2） |
| Q7 | Tappy 迁移 | 一次性 `import`（默认 draft-only） |

---

## 14. 落地八步（拍板后）

1. 契约升 v2.9：`README.md` 新增 `§仓内模式`（本草案 §2–§9 收敛为契约语）。
2. `handoff.mjs`：加 root 解析（§4.1）+ `init` + `--root` + 模式推断 + 仓内 frontmatter 校验（含 `workspace`）。
3. `handoff-status.mjs` / `check`：支持仓内根、`lane` 枚举、`needs_change` 双认、`same` 免转递提示。
4. `RESPONSE-TEMPLATE.md`：加仓内回执骨架（`from_lane/to_lane/needs_change`）。
5. `SKILL.md` + 路由表：加 `init` 与仓内 `status` 触发。
6. 桩升 v2.1（§10）+ `install` 幂等替换。
7. 在**一个真实项目**（建议 Tappy）走通：`init` → 一条 `continuation` → 新窗口 `status` 冷启动 → 回执 → accept → `check` exit 0。
8. 用 ≥3 条真实仓内交接校准 lane 粒度、`workspace_default` 与骨架，再固化 v2.9。

---

## 15. 兼容性与红线

- **跨仓零变更**：lab Hub 行为、`--json` v1 schema、跨仓 frontmatter、命令面**逐字不动**。
- **不破坏旧触发**：新旧提示词双认（沿用）。
- **红线不变**：依赖 agent 不改他人仓文件；执行方不 accept/reject；验收方独立实测；快照非权威；**同工作区禁 mtime 推断归属**。
- **数据纪律**：仓内子 Hub 随仓版本化；无网络、无后端、无隐私外泄面。

---

## 附 A. 层级关系证明（仓内 ⊃ 同工作区）

**定义**
- `ctx`＝上下文边界；`ws`＝工作区（working dir）边界；`repo`＝仓库边界。
- 一次交接的**跨越集** `X ⊆ {ctx, ws, repo}` = 它**越过**的边界。
- 模式：`同工作区` X={ctx}；`仓内(异工作区)` X={ctx,ws}；`跨仓` X={ctx,ws,repo}。

**引理** `ws` 与 `repo` 嵌套：同一工作区必属同一仓（工作区按**项目根 `.handoffs/`** 界定）⇒ `¬cross(ws) ⟹ ¬cross(repo)`。

**证**：由引理，`X(同工作区)={ctx} ⊆ {ctx,ws}=X(仓内)`，且 `{ctx} ≠ {ctx,ws}`（存在同仓异工作树的仓内交接）⇒ **同工作区 ⊊ 仓内**。∎

**边界情形**：物理同目录但仓身份不同（同目录并排两独立仓）——按「以项目根界定工作区」⇒ 两个项目根 ⇒ 判为**跨仓**（转递虽免费，仓身份不同）；故「同工作区 ⟹ 仓内」恒真。

---

*本文由「Hub 仓内模式需求」驱动整理；机制已随 step 1-4 落地，契约升 v2.9（并入 `README.md`）见 §14 第 1 条。*
