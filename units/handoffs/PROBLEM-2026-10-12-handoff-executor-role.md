# PROBLEM-2026-10-12 — handoff 契约缺「执行方工作单唯一性」条款（及两处相邻系统性缺口）

> 状态：问题说明 + 解决方案建议（供 handoffs 维护方**统一处理**）
> 报告方：Tappy 仓内交接复盘（2026-10-12 下午）
> 影响范围：所有使用 handoffs 的仓库（非 Tappy 专属）
> 建议处理人：handoffs 契约维护方（改 `README.md` 升版本号）

---

## 0. 一句话结论

这不是 Tappy 的 bug，是 **handoffs 契约本身的缺口**：`README.md` 的「Agent Consumption Contract / 执行方」只写了
「执行方不 `accept`/`reject`、只写回执」，但**从未写明「执行方不得为已被交接的工作另建一条交接、也不得把散落文档当工作单」**。
任何仓内（intra-repo）或多窗口场景下，执行方 agent 都可能把已持有的 handoff 当成「参考」，转而去「建一条交接+回执」——
这正是 2026-10-12 Tappy 实踩的抖动点。另有两处相邻系统性缺口（`handoff install` 缺仓内/模式感知桩、未登记 handoff-like 文档无检测）同属根族。

---

## 1. 问题 1（主）：执行方工作单唯一性缺失

### 1.1 现象（实证）

Tappy 仓内交接 `impl-20261012-01-bug` 已由 `handoff new` 正确登记、经 `handoff status --for impl` 可见、
impl lane 实际修复（commit `4a3eb3c`）+ 写回执。但执行方 agent 的**思考片段**出现：

> 「`.handoffs` 的 `handoff check` 当前已 exit 0；HAZARDS 文档本身不在 CLI 台账内，
>  **如需我按契约建一条交接+回执也可以**」

即：手上已持有合法 handoff，却仍把一份散落文档（旧 HAZARDS 草稿）当成「潜在待建交接」。

**关键事实**：本次只是思考抖动，未真建冗余交接（`.handoffs/handoffs/` 仅 `impl-20261012-01-bug.md` + 旧 continuation，
回执已写、commit 已做），属**预防漏洞**而非救火。但它证明契约对执行方角色的约束不完整。

### 1.2 根因

`README.md` 现有相关条款（v2.8.3）：

- L119-120：「执行方不 `accept`/`reject`。只交回执 `handoff receipt <ID>`；审计闭环/退回由发起方执行。」
- L140（Agent Consumption Contract）：「执行完写回执（`handoff receipt <ID>`），**不 accept/reject**…」

**只约束了「执行方不收尾」，没约束「执行方不另起炉灶」**。缺少三条：

1. **工作单唯一性**：落我 lane 且在我手中的 handoff 即**唯一工作单**；直接按验收判据动工 + 写回执。
2. **禁止另建交接**：绝不另 `handoff new` 一条来处理已被交接的工作（那等于否认已持有的 handoff）。
3. **散落文档非工作单**：`evidence/`、任意非 `.handoffs/handoffs/` 路径里的参考/草稿文档**不是工作单**，
   只在需要细节时读，绝不能当作「开新交接 / 建回执」的理由。

### 1.3 影响面

所有走仓内模式（intra-repo）或多窗口续接的项目都暴露：执行方 agent 一旦在上下文里看到一份 handoff-like 文档
（用户贴的、或旧草稿），就可能「另建交接」或「只读不修」。跨仓模式因有显式 `TARGET` 前缀 + 用户转递仪式，抖动概率低，
但契约层面同样缺这条。

### 1.4 建议修复（写入 `README.md`，升版本号）

在「## Agent Consumption Contract」节的**执行方**段落（L140 附近）补一条，并同步 L119-120：

> **工作单唯一性（执行方）**：`handoff status --for <我lane>` 落我手中的那条 handoff **就是唯一工作单**。
> 直接按它的「验收判据」动工 + 写 `receipts/<ID>-resp.md`。
> **绝不另 `handoff new` 一条来处理已被交接的工作**；
> `evidence/`（或任意非 `.handoffs/`）里散落的参考/草稿文档**不是工作单**，只在需要细节时读，
> 不得当作「开新交接 / 建回执」的理由。看到未登记文档时按护栏拒读为 handoff，也**不要替它建交接**，除非用户显式要求。

版本号建议：v2.8.3 → **v2.9**（intra-repo + 本条款同批落地）。

---

## 2. 问题 2（相邻）：接入口桩无仓内桩自动注入（`install` 缺 v2.1 模式感知桩）

### 2.1 现象

Tappy 冷启动新窗口原本只加载了用户级**跨仓**桩（只提 `SWOOP`/`PROSPERO`/`IGGLE`/`COREML` + `handoff status --for <仓库>`），
于是把 Tappy repo 当 lane 跑 `handoff status --for tappy` → 0 项 → 误判「无待办」。
（注：Tappy 侧事后已于 `AGENTS.md` 手工补「Handoff（仓内模式 · intra-repo）」节——正是 §5 的临时缓解。）

### 2.2 根因

先澄清：**`handoff install` 并非未实现**——`handoff.mjs` 已实现 `cmdInstall`（`:810-848`，dispatch `:1125`），
向 cwd 的 `AGENTS.md`/`CLAUDE.md` 及用户级文件注入 prose 桩，幂等。真正缺的是**仓内/模式感知桩**：

- `STUB_BLOCK`（`handoff.mjs:800-808`）只装**跨仓**桩（标题即「跨仓库交接」，无模式判断），
  `install` 在仓内项目里注入的也是它 → 正是「用跨仓桩跑仓内模式」的来源。
- `handoff init`（`:990+`）只写 `.handoffs/README.md`，**不注入仓 `AGENTS.md`**。

`README.md` L226 只说明「`handoff install` 不再安装命令别名」；intra-repo 提案
`PROPOSAL-2026-10-09-intra-repo-mode.md` §10 已给出**模式感知 v2.1 桩**草案，§14 step6
把「桩升 v2.1 + `install` 幂等替换」列为待落地步骤——即 **v2.1 桩尚未落地**（不是 install 未实现）。
（原「尚未实现」的说法实际出自 playbook `docs/10-handoff.md:63`，非提案 §12。）

这制造鸡生蛋：契约 L5 禁止在仓库 AGENTS.md「复制细则（防漂移）」，只允许放指针桩；
但仓内桩又要人手工维护，新项目/新窗口极易漏装 → 退化成「用跨仓桩跑仓内模式」。

### 2.3 建议修复

把提案 §10 的 v2.1（模式感知）桩**落地**，不新增 `--stub`/`--upgrade` 旗标（`install` 本就只装桩，且同一
`STUB_BEGIN`/`STUB_END` 块变更即幂等整块替换，无需升版旗标）：

- 将 `STUB_BLOCK` 升为提案 §10 的 v2.1（含「先判模式：cwd 上溯有 `.handoffs/.handoff-hub.json` → 仓内」）。
- 让 `handoff init` 在生成 `.handoffs/` 的同时，向仓库 `AGENTS.md` / `CLAUDE.md` 注入该桩；无子 Hub 时不注入。
- 保持幂等（沿用 `STUB_BEGIN` marker 正则替换）；契约升版改 `STUB_BLOCK` 即可，无需 `--upgrade`。

> 注：跨仓桩与仓内桩是**不同路由键**（repo vs lane）；路由正确性由桩内的「先判模式」条保证，
> 无需另设旗标区分。

---

## 3. 问题 3（相邻）：未登记 handoff-like 文档无检测

### 3.1 现象（实证）

Tappy 隐患清单最初写在 `evidence/HANDOFF-TAPPY-20261012-HAZARDS.md`（非 `.handoffs/handoffs/`），
对系统不可见 → `handoff status --for impl` 显示 0 项 → 新窗口「只读文件 + 报状态」不修复。
（后已转成正式 `handoff new` 登记，问题解决。）

> 证据强度说明：该草稿**从未入 git**（`git log --all` 仅见 `evidence/FIX-TAPPY-20261012-HAZARDS-VERIFY.md`），
> 无法从仓库复现；但正式交接 `impl-20261012-01-bug.md:54` 明确引其为「此前未登记草稿（已废弃，改用本文件）」，
> 引用链真实。后续以其为「实证」时应以此交接为凭据，而非该路径本身。

### 3.2 根因

没有 lint/check 能识别「一份长得像 handoff 却没登记的文档」。引擎对指向非 `.handoffs/` 的路径不报错，
agent 当普通文档读，问题静默发生。

### 3.3 建议修复

给 `handoff check`（或新增 `handoff lint`）加一条**非阻断**检测：

- 扫描交接目录**之外**的 `evidence/`、仓库根的 `*.md`，若命中 handoff 特征
  （frontmatter 含 `handoff_id`/`to_lane`/`验收判据`，或正文含「交接/回执/待修复」+ 编号清单 H1-Hn）
  但不在 `.handoffs/handoffs/` 内 → 提示「疑似未登记交接，请 `handoff new` 登记」。
- 对已登记 handoff 正文里 `证据/HANDOFF-*.md` 这类指向**已删除文件**的引用，同样提示断链。

非阻断（只警告），避免误伤正常证据文档。

---

## 4. 解决方案建议汇总（维护方可直接采用）

| # | 缺口 | 落地位置 | 动作 | 阻断性 |
|---|---|---|---|---|
| 1 | 执行方工作单唯一性 | `README.md` L140 附近 + L119-120 | 补 §1.4 条款，版本 v2.8.3→v2.9 | 契约变更 |
| 2 | 接入口桩无仓内桩自动注入 | `handoff.mjs` `STUB_BLOCK` / `init` | 桩升提案 §10 的 v2.1（模式感知）+ `init` 注入仓 `AGENTS.md`（`install` 已实现，无需新旗标） | 新能力 |
| 3 | 未登记 handoff-like 文档无检测 | `handoff.mjs` `check`/`lint` | 加非阻断扫描 | 非阻断 |

**优先级**：P1（问题 1，契约补全，所有项目立即受益）> P2（问题 2，消除手工桩漂移）> P3（问题 3，早期预警）。

---

## 5. 已做的临时缓解（待契约修复后回收）

Tappy 侧已临时加两处**指针/细则副本**作为应急（违背 L5「禁复制细则」，故标 TEMP）：

- `Tappy/AGENTS.md`「Handoff（仓内模式 · intra-repo）」整节（规则 1-7、9；含规则 9「执行方工作单唯一性（防另建交接）」）
- `lab/playbook/docs/10-handoff.md` §5 补同义 bullet

> 原列「用户级记忆 `MEMORY.md`『仓内交接模式』段」——**核查未见**：`iggle`/`Prospero`/`Swoop` 的 `MEMORY.md`
> 及 `~/.config/opencode/AGENTS.md`、`~/.claude/CLAUDE.md` 均无该 bullet，该缓解项不存在，已删。

**回收计划**：README v2.9 落地后，上述两处应**精简为纯指针桩**（只引「`handoff status --for <lane>` + README 契约版本号」），
删掉复制的细则，避免与契约漂移。本报告即为此统一处理的输入。

---

## 6. 验收判据（本问题修复是否到位）

- [ ] `README.md` 执行方段落含「工作单唯一性 + 禁止另建交接 + 散落文档非工作单」三条，版本号升 v2.9。
- [ ] 新仓库 `handoff init` / `handoff install` 后，其 `AGENTS.md` 含规范**仓内**指针桩（v2.1 模式感知），新窗口冷启动 `handoff status --for <lane>` 可见待办。
- [ ] 把一份 handoff-like 文档丢进 `evidence/` 再跑 `handoff check`，能非阻断提示「疑似未登记」。
- [ ] 任意项目执行方 agent 在持有合法 handoff 时，不再出现「建一条交接+回执」类思考/动作。
