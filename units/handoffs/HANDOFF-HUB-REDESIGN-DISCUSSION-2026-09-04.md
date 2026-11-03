# Handoff Hub 交接/回执模式现状与改版讨论

> 本文档整理 Handoff Hub 当前的交接/回执模式，以及 2026-09-04 一轮设计讨论中暴露的问题、评估过的方案（含否决理由）、待落地的改版清单。供另一个 Agent 复核讨论。
> 事实来源：`~/Documents/lab/handoffs/handoff.mjs`、`handoff-status.mjs`、`README.md`（契约 v2.4）。

## 一、现状：交接/回执模式

### 1. 目录结构

```
~/Documents/lab/handoffs/          # Hub 根（不在 git 管控下）
├── handoffs/                      # 交接文档 <TARGET>-<YYYYMMDD>-<NN>-<TYPE>.md
├── receipts/                      # 回执 <ID>-resp.md
├── inbox/                         # 依赖方收件箱 inbox/<target>.md（brief 生成，快照）
├── README.md                      # 契约 v2.4（权威）
├── RESPONSE-TEMPLATE.md           # 回执规范
├── handoff.mjs                    # 命令入口（new/forward/receipt/sync/brief/status/prompt/check/install/drift/close/open）
└── handoff-status.mjs             # 状态巡检（人类可读 + --json）
```

### 2. 命名规范

- 交接：`<TARGET>-<YYYYMMDD>-<NN>-<TYPE>.md`
  - TARGET ∈ `SWOOP / PROSPERO / IGGLE / COREML`，TYPE ∈ `bug / feature / breaking / question`
  - 例：`SWOOP-20260904-02-feature.md`
- 回执：`<ID>-resp.md`（`<ID>` = 交接的 `handoff_id`，含 type）
  - 例：`SWOOP-20260904-02-feature-resp.md`

### 3. 状态机（frontmatter 的 `status` 字段）

```
draft → forwarded → received → closed
```

| 状态 | 含义（iggle 视角） | 依赖方视角 |
|---|---|---|
| `draft` | 已建，待转递 | 已落到我手上 = 待处理 |
| `forwarded` | 已转递，等依赖方回执 | 待我处理 |
| `received` | 已收回执，等验收方闭环 | 我已回执，不用管 |
| `closed` | 验收方闭环 | 结束 |

### 4. 角色分工

| 角色 | 是谁 | 职责 |
|---|---|---|
| 发送方 / 验收方 | iggle | 写交接转给依赖方；收到回执后**独立实测**再 `close` |
| 执行方 / 依赖方 | Swoop / Prospero / coreml | 收交接、写回执；**不 close** |
| 同工作区侧 | iggle 的 `crates/iggle-coreml` | 交接不经用户人工转递，同会话切角色执行 |

### 5. 命令（`node handoff.mjs <子命令>`）

| 命令 | 作用 |
|---|---|
| `new <target> <type> <标题>` | 新建交接（status: draft） |
| `forward <ID>` | 标记已转递（draft → forwarded） |
| `receipt <ID> [--needs-change]` | 登记回执（→ received） |
| `sync` | 扫 receipts/ 自动登记回执 |
| `brief [target]` | 生成依赖方收件箱 inbox/<target>.md + 转递话术 |
| `status [--json]` | 未闭环摘要 |
| `close <ID> -n "<结论>"` | 闭环（验收门禁：必须附结论） |
| `prompt <ID>` | 生成转递提示词（含方向自检护栏） |
| `check` | 全库合规体检（agent 收尾硬门禁，exit 0） |
| `drift --common \| --platform <p>` | 版本失效回流 |
| `install` | 注入 Agent 接入桩 |

### 6. 斜杠命令（Agent 入口，install 注入到用户级全局目录）

- `/handoff`：通用命令入口（规则：brief 后把转递话术原样展示给用户；check 未过要修到 exit 0）
- `/inbox`：收交接（按当前工作目录分派语义）
- `/sync`：收回执（sync 登记 + status 展示未闭环摘要）

### 7. 关键约定

- **执行方不 `close`**（只写回执）；验收方自备夹具独立实测后才 `close`。
- 回执 frontmatter 四字段：`handoff_id / from_repo / to_repo / date`；落点 `receipts/<ID>-resp.md`。
- 体积纪律：交接 ≤60 行/≤4KB，回执 ≤50 行/≤3KB；背景论证写 `reviews/`。
- 用户是唯一转递通道，agent 不代劳转递；结尾只附自然语言（如「回执已写，请转给 iggle」）。
- 回执结尾附「钉值三要素」（是否需更新 REQUIRED_SWEEP_COMMIT / 新短哈希 / 是否重建二进制）。

## 二、问题清单（讨论中暴露）

1. **draft 语义错位**：`brief` 挑 `status==='draft'` 的项生成收件箱（`handoff.mjs:499`），即「依赖方视角 = 待处理」；但 `status` 把 `draft` 翻译成「待转递」（`handoff-status.mjs:92`，iggle 视角 =「还没转」）。同一个状态两个相反含义，依赖方 agent 无从判断。
2. **inbox 是 stale 快照**：`inbox/<target>.md` 只在 iggle 跑 `brief` 时更新。依赖方 `/inbox` 读到旧文件会漏掉新交接、或误读已回执/已闭环的旧项。
3. **status 写死 iggle 中心视角**：`nextStep()`（`handoff-status.mjs:95-112`）导航全是「你=iggle」口吻（draft→「输 /inbox 转给 swoop」、received→「你（iggle）独立实测后闭环」），依赖方 agent 跑 status 要自己做视角翻译。
4. **`/inbox` 文案「教学」过度**：把「回执写 receipts/<ID>-resp.md、不翻状态、不做验收」等回执细节塞进命令文案；又把「iggle 发送方 brief」和「依赖方接收方读 inbox」两个相反动作混在一条命令里。

## 三、评估过的方案（含否决理由）

### 方案 A：状态编码进文件名（否决）

- **想法**：`<ID>-<STATUS>.md`，`ls` 看文件名即知状态，零读文件。
- **否决理由**：状态是流转的（draft→forwarded→received→closed），文件名跟着重命名 → `handoff_id` 变 → 回执文件名和交接正文里的 ID 引用全断；且文件名 + frontmatter 形成「双份真相」；`handoff.mjs` 全部命令、`check` 命名正则都要大改。**状态是易变事实，文件名是稳定标识，不该耦合。**

### 方案 B：按仓库拆命令名（`/inbox-Swoop`、`/sync-Swoop`）（否决）

- **想法**：命令语义单一。
- **否决理由**：斜杠命令由 `install` 装到**用户级全局目录**，一份文案跨工作区共享；「我是谁」由**当前工作区**决定（生态硬约定），命令名按仓库拆 = 重复这个信息源，还引入「命令名 vs 工作区不一致」的新错误（在 Swoop 工作区手滑输 `/inbox-Prospero`）。且拆了也治不了「处理交接需只读排查对方仓」这个本就该发生的最小读。

### 方案 C：`status --for <target>` 视角切换（采纳）

- **想法**：`status` 加 `--for <target>` 参数，实时扫目录（非快照），输出按状态分桶，让依赖方拿「待处理清单」。
- 优点：不改文件名、不改命名规范、单一真相源（frontmatter）；「看状态」的 token 成本 = 看命令输出汇总表（脚本读 frontmatter，agent 不读交接文件）。

### 方案 D：`/inbox` 文案收敛（采纳）

- **想法**：回执细节归交接文档「给执行方」节；`/inbox` 只讲「依赖方收交接」一件事；iggle 转出归 `/handoff brief`。

## 四、最终收敛的落地清单（三件事，一起改）

1. **`status --for <target>`**：`handoff-status.mjs` 解析 `--for swoop|prospero|iggle|coreml`，输出区分：
   - 待处理（draft/forwarded，target 匹配）→「读 handoffs/<ID>.md → 写 receipts/<ID>-resp.md」
   - 已回执（received）→「跳过，等验收方 close」
   - closed 不列
   - 不加 `--for` 时现有 iggle 视角输出**逐字节不变**（向后兼容）
2. **`/inbox` 文案改**（见第五节）
3. **`install` 依赖方入口改**：从「读 inbox/<target>.md」改为「跑 `status --for <target>`」

## 五、最终版 `/inbox` 文案（定稿）

```
收交接（依赖方仓库使用）：
- 跑 node ~/Documents/lab/handoffs/handoff.mjs status --for <target>（按当前工作区：Swoop→swoop，Prospero→prospero）。
- 只处理清单里「待处理」的项（读交接文档，处理与回执要求见各文档）；「已回执」项跳过，等验收方闭环。
```

设计要点：只讲「依赖方收交接」一件事；回执细节委托交接文档；不出现 iggle 分支/其它目录兜底；不按仓库拆命令名。

## 六、开放问题（供讨论）

1. `status --for` 的视角文案：三种状态（待处理/已回执/已闭环）的措辞是否清晰？是否需要把「已回执」进一步拆成「等 iggle 验收」vs「等依赖方验收」（对应 IGGLE-* 反向交接）？
2. 依赖方改用 `status --for` 后，`inbox/` 目录是否还需要保留？（若保留，是否降级为「可选参考」？）
3. `/inbox` 完全不再提 iggle，是否会让 iggle 侧 agent 误用 `/inbox`？（当前靠 iggle 的 AGENTS.md 承担「发送方用 /handoff brief」）
4. `install` 入口改动是否会破坏「工具无关」设计？（shim 是全局一份，`status --for` 的 target 参数是否所有工具都能透传）
