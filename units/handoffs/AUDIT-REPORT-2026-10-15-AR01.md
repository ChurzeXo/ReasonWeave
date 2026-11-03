# 审计报告 · Handoff Hub v2.12.x 全量收口审计

- 报告编号：**AR-2026-10-15-01**（审计员 ID：**AR01**）
- 审计对象：`~/Documents/lab/handoffs/`（契约 v2.12.4 / 引擎 `handoff.mjs`）
- 审计日期：2026-10-15
- 配套底稿：`reviews/AR-2026-10-15-01-wp-AR01.md`（可重跑命令序列）
- 需求依据：`AUDIT-2026-10-15-v2.12x-full-scope.md`

---

## 1. 审计意见

> **否定意见（Adverse）** —— 存在 **1 个 P0**：v2.12.3「回执内容完整性」门禁的**存量豁免以回执自声明 `date` 为键**，`date` 缺失或早于阈值即**整组豁免**，使伪回执可穿过 `accept` 与 `check` 两处门禁（正是 v2.12.3 立此门禁所要防的 2026-10-13 goods-stores 伪回执同类行为）。核心门禁化型失效 ⇒ 按 §3「≥1 P0 ⇒ 不得优于否定」。另有 3 个 P1（其中 2 个是 v2.12.4 单源漂移漏改：引擎自产骨架与 2 处文档仍写「仓内 `workspace=same` 免转递」）。

P0/P1/P2 计数：**P0 × 1、P1 × 3、P2 × 6、观察 × 3**。

---

## 2. 独立性声明

- 本次审计为**独立第三方会话**，未参与 v2.12 / v2.12.1 / v2.12.2 / v2.12.3 / v2.12.4 及同日热修的任何编码或文档改动。
- **未读过修复方的内部设计说明**（`PROPOSAL-2026-10-14-receipt-content-integrity.md`、`PROBLEM-2026-10-14-receipt-prompt-on-same-workspace.md`）作为结论依据；`CHANGELOG.md` / `README.md` 仅作 §6「应然」对照（L3），不作结论。
- §6 基线的每一条均**用命令复核**（见底稿 Tier E 与 AR-F 各节）。
- 所有结论均为 **L1（副本内亲自复现，命令+输出+exit）** 或已与 L1 互证的 **L2**。

---

## 3. 逐项表

> 判读规则：先记 exit code，再读报文。证据列给「命令要旨 → 关键输出 → exit」。

### Tier A — v2.12.4 回执交付行解耦

| 编号 | 控制目标 | 方法 | 结果 | 证据（要点） | 等级 |
|---|---|---|---|---|---|
| A-1 | 无 `workspace==='same'` 早退 | 读 `handoff.mjs:216-224` | **PASS** | :218 仅存量豁免、:219 COREML 豁免、:222 查「## 转递提示词」；无 same 早退 | L2 |
| A-2 | 仓内 same 缺节必拦 | intra 造 `date=2026-10-14/workspace=same/无节` → `check` | **PASS** | 点名 `impl-20261014-01-task-resp.md`，exit 1 | L1 |
| A-3 | 仓内 same 含节放行 | 补节 → `check` | **PASS** | 本节不再报（余 evidence 项，补后 exit 0） | L1 |
| A-4 | `COREML-*` 仍豁免 | 造 COREML 跨仓缺节 → `check` | **PASS** | 不报 | L1 |
| A-5 | 存量豁免未破 | `date=2026-10-12` 缺节 → `check` | **PASS** | 不报 | L1 |
| A-6 | separate 分支对称 | separate 含节→放行 / 缺节→拦 | **PASS** | 与 A-2/A-3 对称 | L1 |
| A-7 | 死参数判定 | 读 `cmdCheck:920` vs 签名 | **P2** | 见 AR-F6 | L2 |

### Tier B — v2.12.3 evidence 门禁 + 同日热修（最高风险）

| 编号 | 控制目标 | 方法 | 结果 | 证据 | 等级 |
|---|---|---|---|---|---|
| B-1 | P0-a accept 前置门禁 | 伪回执 → `accept` | **PASS** | 拒闭环；状态留 `received` | L1 |
| B-2 | P0-b receipt 落盘门禁 | `receipt -n "<缺 evidence>"` | **PASS** | exit 1、不落盘、不翻 received | L1 |
| B-3 | P0-c 仓内硬核 | 假路径+假提交 → `check` | **PASS** | 「evidence 路径不存在」+「evidence 提交不存在」，exit 1 | L1 |
| B-4 | 热修：跨仓无 repo 降级 warn | 真提交、不声明 repo → `check` | **PASS** | exit 0 + `⚠️ 跨仓回执未声明 evidence_repo` | L1 |
| B-5 | 热修未削弱仓内硬门禁 | 仓内假提交、不声明 repo → `check` | **PASS** | 仍 exit 1 | L1 |
| B-6 | `HANDOFF_REPO_ROOTS` 启用硬核 | 配真实仓 / 配不存在路径 | **部分 FAIL** | 真实仓 exit 0（PASS）；不存在路径**硬拦**（应 warn）→ AR-F4 | L1 |
| B-7 | 存量豁免 | `date=2026-10-13` 无 evidence → `check` | **PASS** | 不报 | L1 |
| B-8 | 仓内强制、跨仓不强制 | intra 无 evidence→拦；跨仓同→不拦 | **PASS** | 与设计一致 | L1 |

### Tier C — 桩系统遗产保证

| 编号 | 控制目标 | 结果 | 证据 | 等级 |
|---|---|---|---|---|
| C-1 | STUB_BLOCK 五段结构 | **PASS** | begin(0)/generated(1)/sha(2)/body/end(33)，34 行 | L1 |
| C-2 | STUB_SHA 真算 | **PASS** | 运行时 `1b465062` = 常量 = 内嵌（避转义陷阱） | L1 |
| C-3 | 20 载体 regions=1、canon 一致、版本 v2.12.4 | **PASS** | 全等 | L1 |
| C-4 | install 幂等 | **PASS** | 连跑 3 次，后 2 次无需变更 | L1 |
| C-5 | 去重 + 保周围内容 | **PASS** | 2→1；非桩 sha `2e05372fa9a5` 不变 | L1 |
| C-6 | 三重探测（改字节/重复/改 sha） | **PASS** | 均 exit 1 点名 | L1 |
| C-7 | 手写指针不误报 | **PASS** | check 不报；install 告警跳过不追加 | L1 |
| C-8 | flag 矩阵 | **PASS** | 5/3/2/2/0；`--global` 不写 cwd README（F3 绿） | L1 |
| C-9 | marker 丢失可检可愈 | **PASS** | check 报（F6）；install 后绿 | L1 |

### Tier D — 契约文档一致性

| 编号 | 控制目标 | 结果 | 证据 | 等级 |
|---|---|---|---|---|
| D-1 | 版本号四处一致 | **部分 FAIL** | `README:5`=v2.12.4 ✓；`STUB_BODY:1146`=v2.12.4 ✓；`CHANGELOG` 有 v2.12.4 ✓；**`DESIGN.md` 缺 v2.12.4 行、§契约基线仍 v2.9** → AR-F9 | L1+L3 |
| D-2 | 旧措辞清零 | **FAIL** | `README.md:230`、`AGENT-GUIDE.md:20` 仍写「仓内 `workspace=same` 免转递」→ AR-F3 | L1 |
| D-3 | 桩不复制细则 | **PASS** | README §接入桩 canon == `STUB_BLOCK` canon（true） | L1 |
| D-4 | 模板与引擎口径对齐 | **PASS** | `RESPONSE-TEMPLATE.md` 骨架 :82「## 转递提示词」+ :30-33 evidence 与 check 判据一一对应 | L2/L3 |
| D-5 | 文档 flag 表 = CLI | **部分 FAIL** | no 幽灵 flag；README op 表齐；**顶层 usage `:1532` 未列 `--evidence-*`** → AR-F8 | L2 |
| D-6 | CHANGELOG 可追溯 | **部分 FAIL** | v2.12.4 五段齐；v2.12.3 **无显式「版本/边界」段** → AR-F10 | L2 |

### Tier E — 存量数据与下游一致性（只读）

| 编号 | 控制目标 | 结果 | 证据 | 等级 |
|---|---|---|---|---|
| E-1 | check 基线 | **PASS** | exit 0，**114 交接 / 111 回执** | L1 |
| E-2 | 存量豁免未被打红 | **PASS** | 全部报文仅 warn/提示，**零硬拦** | L1 |
| E-3 | 非阻断提示合理性 | **数字失准** | 缺转递提示词 **2 份**（与 §6 一致）；超预算 **72 份**（§6 称「1 条」）→ AR-O1 | L1 |
| E-4 | 下游 5 仓桩版本 | **PASS** | 全 v2.12.4（与 C-3 同批） | L1 |
| E-5 | 真能检出孤儿/悬挂 | **PASS** | 孤儿回执、closed 缺回执各 exit 1 点名 | L1 |

### §8 红队

| # | 结果 | 关联 |
|---|---|---|
| 1 相关性绕过 | 过（设计边界） | AR-F5 |
| 2 降级洗白 | 过（仅 warn） | AR-F5 |
| 3 阈值穿越 | **`date` 缺失/非规范 ISO 漏网** | **AR-F1（P0）** |
| 4 字段注入 | 深 `../` 遍历放行；绝对路径拦截；空过滤；超长不崩 | AR-F5 |
| 5 篡改即报 | 报 | C-6 |
| 6 sha 篡改 | 报 | C-6③ |
| 7 cwd 越权 | 无越权 | RT-7 |
| 8 HOME 隔离反例 | 不重定向会污染真实全局（本审计全程隔离） | §9 铁律 |
| 9 状态门禁 | 拒/放/豁免全符合 | RT-9 |
| 10 状态机一致性 | 拒绝复活、报悬挂、幂等，全符合 | RT-10 |

---

## 4. 新发现问题（每条含 最小修法 / 回归判据 / 影响面）

### AR-F1 【P0】回执内容门禁的存量豁免以回执**自声明 `date`** 为键 → 伪回执可穿过 `accept` / `check`

- **复现（L1）**：
  1. intra 子 Hub 内直接写入回执文件 `receipts/<ID>-resp.md`，frontmatter `date: 2026-01-01` + `evidence_paths: ghost-nowhere.txt`（不存在），正文含 `## 结论` + `## 转递提示词`。
  2. `handoff receipt <ID>`（**不带 `-n`**，故 `cmdReceipt` 的门禁分支不跑）→ 登记成功、状态翻 `received`。
  3. `handoff accept <ID> -n "闭环"` → **✅ 已审计闭环，exit 0**；`status: closed`。
  - 同一 `date` 缺失（或用非规范 ISO 串如 `2026-1-14`）时，`check` 对空正文、无锚节、无提示词节、无 evidence 的「回执」**直接 ✅ 通过**（full bypass）。
- **根因**：三处门禁的豁免判定均为 `if (!date || String(date) < SINCE) return;`
  - `checkReceiptBody` (`handoff.mjs:198`, `RECEIPT_BODY_SINCE`)
  - `checkReceiptPrompt` (`:218`, `RECEIPT_PROMPT_SINCE`)
  - `evidenceProblems` (`:272`, `EVIDENCE_SINCE`)
  - 且 `cmdAccept` 传入的是**回执自己的日期** `date: rFm.date`（`:607`），`cmdCheckIntra`/`cmdCheck` 同（`:920/972`）。
  - 豁免的**本意**是「阈值日**前新建**的回执「不回改」，实现却等价于「**回执自称**阈值日前」。`date` 属待校验工件自身字段 ⇒ 循环信任（tabulasolution 的自证）。
  - 唯一较稳的是 `cmdReceipt` 带 `-n` 的分支（`date: todayISO()`, `:729`）——但 `accept`/`check` 不读它，且「直接写文件 + `receipt` 不带 `-n`」即可绕开。
- **最小修法**（引擎 `handoff.mjs`，量级：1 处取数 + 2 处调用）：
  - 豁免键改为**不依赖回执自声明**：以**所属交接的 `created`**（`hFm.created`）为准判定该回执是否属存量；`cmdAccept`/`cmdCheck*` 把 `date` 换成 `hFm.created`；`date` 缺失时**不豁免**（对 `mode=intra-repo` 且交接 `created >= EVIDENCE_SINCE` 者强制）。
  - 或退一步：豁免条件加「回执 `date` 必须 ≥ 交接 `created`」的下限断言，`date < created` 或缺失 → 视为须校验。
- **回归判据**：
  - 复现步骤 1–3 中 `accept` 必须 **exit≠0**、状态留 `received`；
  - 「date 缺失 + 空正文」回执 `check` 必须 **exit≠0**；
  - 既有真实 hub `check` 仍 **exit 0**（存量回执 `date` 与 `created` 同日的，须确认不被误伤——用 §4.3 高风险管理子集 13 份先验）。
- **影响面**：**不改 `STUB_BODY`**（`STUB_SHA` 不变，20 载体无需重刷）；不改 `--json` schema；可能触及存量 111 份回执的豁免判定 ⇒ 上线前必须跑高风险管理子集（`date ≥ 2026-10-14` 的 13 份 + 全部历史）确认零误红。

### AR-F2 【P1】引擎自产 intra 回执骨架与 v2.12.4 **自相矛盾**，落盘即被 `check` 判红

- **复现（L1）**：intra 子 Hub `handoff receipt <ID>`（不带 `-n`，文件不存在）→ 落骨架 → `handoff check` **exit 1**：`缺「## 转递提示词」节 … impl-…-resp.md`。
- **根因**：`receiptStubIntra`（`handoff.mjs:164-170`）骨架（a）正文**不含**「## 转递提示词」锚节；（b）提示语 `:170` 写「…同工作区 workspace=same **免转递**」——与 v2.12.4「same 回执仍须含该节」直接矛盾。v2.12.4 改了 `checkReceiptPrompt`（删 same 早退）与 `STUB_BODY`，**漏改引擎自产骨架**。
- **最小修法**：`receiptStubIntra` 补一行 `## 转递提示词`（占位）+ 修正 `:170` 措辞为「仓内 `workspace=same` 回执仍须含该节（交付行不豁免）；仅 `COREML-*` 免」。
- **回归判据**：intra `handoff receipt <ID>`（无 `-n`）→ `check` 至少不再报「缺 ## 转递提示词」；补 evidence 后 exit 0。
- **影响面**：**不改 `STUB_BODY`**（`STUB_SHA`/20 载体不受影响）；不动 schema；不影响存量。

### AR-F3 【P1】契约文档旧措辞残留（D-2 FAIL）——单源漂移

- **复现（L1/L2）**：`grep -n 'workspace=same' AGENT-GUIDE.md README.md`：
  - `AGENT-GUIDE.md:20`（**当前 checklist 正文**）：「…含「## 转递提示词」节；`COREML-*` / 仓内 `workspace=same` 免转递豁免」——**与同文件 `:56` 自相矛盾**（`:56` 正确写「仓内 workspace=same 回执仍须含该节」）。
  - `README.md:230`（**当前契约正文**）：「仅跨仓 / 仓内 `workspace=separate` 产出；`COREML-*` / `workspace=same` 免转递不写」——与 `README:228/274`、`RESPONSE-TEMPLATE:109` 矛盾。
  - （`README.md:8`、`DESIGN.md:171` 为**历史变更叙事**，属低危，可保留或加「已于 v2.12.4 解耦」注。）
- **根因**：v2.12.4「一次改要动 4–6 处文本」未同步 `AGENT-GUIDE.md:20` 与 `README.md:230`。**agent 若照 `AGENT-GUIDE.md:20` 做，会漏写「## 转递提示词」→ `check` 红**（正是 §2.2「文档与实现矛盾且 agent 照做会做错」）。
- **最小修法**：两处改为「仅 `COREML-*` 免；仓内 `workspace=same` 回执仍须含该节（回执交付行不豁免）」。
- **回归判据**：`grep -rn 'workspace=same.*免转递' AGENT-GUIDE.md README.md` 对**当前正文**应为 0（历史 changelog 注释可例外并显式标注）。
- **影响面**：纯文档，无 `STUB_SHA`/schema/存量影响。

### AR-F4 【P1】`HANDOFF_REPO_ROOTS` 指向不可达路径时**硬拦**，违背契约「不可达 ⇒ 降级 warn」

- **复现（L1）**：`HANDOFF_REPO_ROOTS=ghostrepo=/no/such/dir` + 回执声明 `evidence_repo: ghostrepo` / `evidence_commits: <sha>` → `check` **exit 1**「evidence 提交不存在: …（root=/no/such/dir）」。
- **根因**：`resolveRepoRoot`（`handoff.mjs:247`）对 map 命中项**直接返回配置值、不做存在性校验**；仅「裸路径」分支（`:248`）有 `existsSync`。故配置拼写错误/仓路径未挂载 ⇒ 被当作「可达」→ 硬核 → 全量提交判不存在。契约（`README:99/105`、`handoff.mjs:230-232/289`）承诺「目标仓不可达 ⇒ 降级 warn 不硬拦」。
- **最小修法**：`resolveRepoRoot` 对 map 命中也做 `fs.existsSync`（进一步可 `git -C <root> rev-parse` 判 git 仓）校验，不通过则返回 `null` → 走 `:288` 的 warn 分支。
- **回归判据**：`HANDOFF_REPO_ROOTS=ghostrepo=/no/such/dir` → `check` **exit 0** + `⚠️ evidence 目标仓不可解析`；配**真实**仓路径 → 仍能硬核（正例 B-6a 保持 exit 0）。
- **影响面**：引擎内单函数；不改 `STUB_BODY`/schema/存量。

### AR-F5 【P2】evidence「只验存在性不验相关性」+ 路径未 confine 到仓根（红队 1/2/4）

- **复现（L1）**：①声明**真实但无关**的路径 + 真实提交 → 三处门禁全过（exit 0）；②跨仓不声明 `evidence_repo` + **假提交** → 仅 `⚠️` warn、exit 0；③`evidence_paths: ../../../../../../../etc/passwd`（足够深）→ `path.join(root, rel)` 解析到仓外**存在的**文件 → `existsSync` 真 → **放行**。
- **根因**：`evidenceProblems`（`:292-300`）仅 `fs.existsSync` + `git cat-file -e`，不做「路径是否在仓内」或「提交是否触及该路径」的**阻断**判定；`path.join` 不 confide（`../` 可逃逸）；best-effort 触达检查（`:301-312`）仅 warn。
- **定性**：需求 §8.1 要求的「判定是已知设计边界还是缺陷」——**判为设计边界**（存在性校验本就是弱门禁，相关性需人工），但**③的目录逃逸应堵**。
- **最小修法（建议）**：`m` 对每条 `rel` 做 `path.resolve(root, rel)` 后断言 `resolved.startsWith(root + sep)`，否则报「evidence 路径越出仓根」；相关性仍交人工（不新增阻断）。
- **回归判据**：注入 `../` 逃逸路径 → `check` exit≠0 且报「越出仓根」；仓内合法相对路径不误伤。
- **影响面**：不改 `STUB_BODY`/schema；存量回执均用合法相对路径，预期零误伤（高风险管理子集先验）。

### AR-F6 【P2】`checkReceiptPrompt` 的 `workspace` 形参为**死参**（A-7）

- **复现（L2）**：签名 `checkReceiptPrompt(f, fm, raw, problems, workspace)`（`:216`），`cmdCheck:920` 调用**未传** `workspace`；函数体自 v2.12.4 删 same 早退后已不使用该参。
- **最小修法**：删除形参或补调用（二选一，保持签名与调用一致）。
- **回归判据**：`grep -n 'checkReceiptPrompt' handoff.mjs` 调用与签名参数个数一致；A-2/A-3 仍如常。
- **影响面**：引擎单函数；无连锁。

### AR-F7 【P2】best-effort `git show` 未屏蔽 stderr，提交不存在时泄漏 `fatal: ambiguous argument`

- **复现（L1）**：intra 回执 `evidence_commits: deadbee` + 存在路径 → `check` 的 stderr 出现 `fatal: ambiguous argument 'deadbee': unknown revision or path not in the working tree.`
- **根因**：`:304` `execFileSync('git', [... 'show' ...], { encoding: 'utf8' })` 未加 `stdio:['ignore','pipe','ignore']`（对比 `:293` 的 `cat-file` 用了 `stdio:'ignore'`）。
- **最小修法**：给该 `git show` 调用补 `stdio` 屏蔽 stderr（保留 stdout 供解析）。
- **回归判据**：上述复现的 stderr 不再出现 `fatal:`；warn 逻辑不变。
- **影响面**：cosmetic；无连锁。

### AR-F8 【P2】顶层 usage 未列 `--evidence-*`（D-5）

- **复现（L2）**：`handoff.mjs:1532` `receipt` 用法串仅 `[-n] [--needs-change]`，未含 `--evidence-paths/-commits/-repo/-note`；而 `cmdReceipt` 内部错误串（`:711`）与 README op 表（`:261`）均列。
- **最小修法**：`:1532` 用法串补齐 evidence 四 flag。
- **回归判据**：`handoff`（无参）或 `handoff -h` 输出含 `--evidence-paths`。
- **影响面**：纯 usage 文本。

### AR-F9 【P2】文档版本/表漂移（D-1）

- **复现（L1/L2）**：
  - `DESIGN.md` 版本表（`:188-191`）止于 v2.12.3，**缺 v2.12.4 行**；§契约基线（`:5`）仍声明 `v2.9`。
  - `README.md` 顶部变更注记列到 v2.12.3，**无 v2.12.4 条**（正文 `:5` 版本号正确）。
  - `COMMANDS.md:3` 自称「契约 **v2.9** 配套文档」，且无 `--evidence-*` / v2.12.3 门禁说明。
- **最小修法**：`DESIGN.md` 补 v2.12.4 行并更新基线；`README` 顶部补 v2.12.4 条（或显式声明「顶部只列至 v2.12.3，v2.12.4+ 见 CHANGELOG」）；`COMMANDS.md` 升版或标注「命令手册以 `handoff -h` 与 README op 表为准」。
- **回归判据**：`grep -c 'v2.12.4' DESIGN.md COMMANDS.md` ≥1；D-1 复核四处一致。
- **影响面**：纯文档。

### AR-F10 【P2】CHANGELOG v2.12.3 条目缺显式「版本 / 边界」段（D-6）

- **复现（L2）**：v2.12.4 条含 动因/改动/版本/边界/验收 五段；v2.12.3 条为 动因 + P0-a/b/c + P1-b + 文档 + 验收（无独立「版本」「边界」段，版本仅在文档项内顺带；边界未写）。
- **最小修法**：v2.12.3 条补「版本」「边界」两行（或统一 CHANGELOG 模板为五段）。
- **回归判据**：抽查条目五段齐。
- **影响面**：纯文档。

### 观察项

- **AR-O1（§6 基线失准）**：§6 称「1 条预算提示（`SWOOP-20261014-03` 51 行）」；**实测 72 份超预算**（`check` 输出，预算 50/60 行）。§6 亦**未列**本轮真实存在的 5 条 v2.12.3 gate 警告（1 条 `跨仓回执未声明 evidence_repo` + 4 条 `提交 7064875 似未触及声称路径`，均针对 `stores-20261014-01-task-resp`）。不影响审计有效性（这些均非硬拦），但说明 §6 基线未经命令复核即写入。
- **AR-O2**：intra 骨架 `to_lane` 在 `HANDOFF_LANE` 未设时为空串（`receiptStubIntra` 用 `hFm.from_lane||''`）——装饰性。
- **AR-O3**：`safeWrite`（`:1180`）建父目录 + 失败跳过，但无符号链接/只读目标防护——低危（目标均受控路径）。

---

## 5. 与「声称已修」的差异

| 声称（来源 L3） | 实测 | 差异 |
|---|---|---|
| v2.12.4：仓内 `workspace=same` 回执仍须含「## 转递提示词」节，且「同步 `README` / `RESPONSE-TEMPLATE:109` / `AGENT-GUIDE.md` 措辞与桩正文」 | 引擎门禁已解耦（A-2/A-3 PASS）；但 **`AGENT-GUIDE.md:20`、`README.md:230`、引擎自产骨架 `receiptStubIntra` 仍写「same 免转递」** | **未同步全**（AR-F2/F3） |
| v2.12.3：伪回执（声称路径/提交不存在）在 `receipt`/`accept`/`check` 任一处被拒 | `receipt -n` 路径 PASS；但 `accept`/`check` 可被回执自声明 `date` 豁免绕过 | **门禁可绕**（AR-F1，P0） |
| v2.12.3 热修：跨仓未声明 `evidence_repo` ⇒ 降级 warn 不硬拦 | B-4 PASS；但同类「配了不可达 root」仍硬拦 | 边界未覆盖全（AR-F4） |
| §6：check 基线 114/111 exit 0，附 2+1 条提示 | 114/111 exit 0 ✓；提示实为 2 份缺提示词 + **72 份超预算** + 5 条 gate 警告 | §6 数字失准（AR-O1） |

---

## 6. 操作留痕（对真实仓库的写操作）

- 对真实 hub **只读**（`check`），无写操作。
- 破坏性测试（改字节、伪造回执、install、篡改 etc.）**全部在 `$AUD` 沙箱副本内**进行，`HOME` 全程重定向到 `$AUD/home`。
- 测试中修改真实 hub `AGENTS.md` 的演示（红队 5）：**在副本 `$XH` 内**完成（备份→改 1 字节→check→还原→check 绿），真实 hub 载体未动。
- 未 commit（本仓非 git）；未改任何下游仓（iggle / Swoop / Prospero / Tappy / 一期一卉花）。
- 新增交付物：本报告 + `reviews/AR-2026-10-15-01-wp-AR01.md`（工作底稿）。

---

## 7. 复验建议（最小轮次）

若要收口为「带强调事项段的无保留」，按 AR-F1 → AR-F2 → AR-F3 → AR-F4 顺序修（F1 阻断发布）。修后维护方只需复跑：

```bash
# F1
#  (a) 伪造 date=2026-01-01 / 真路径假存在的回执 → accept 必拒（exit≠0，状态留 received）
#  (b) 无 date + 空正文回执 → check 必 exit≠0
#  (c) 真实 hub check 仍 exit 0（不误伤存量）
# F2
#  intra: handoff receipt <ID>（无 -n）→ check 不再报「缺 ## 转递提示词」
# F3
#  grep -rn 'workspace=same.*免转递' AGENT-GUIDE.md README.md  # 当前正文应为 0
# F4
#  HANDOFF_REPO_ROOTS=x=/no/such → check exit 0（warn）
# 回归总闸
cd ~/Documents/lab/handoffs && node handoff.mjs check   # exit 0，114/111
```

不需要全量重审；F5–F10 及观察项可按 backlog 排期。
