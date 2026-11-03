# PROBLEM-2026-10-14 — 回执「转递提示词」在 workspace=same 被连带豁免 → 发起方无标准行、被迫回查 status

> 状态：问题说明 + 解决方案建议（供 handoffs 维护方**统一处理**）
> 报告方：一期一卉花（仓内 intra-repo 模式 · 2026-10-14）
> 影响范围：**所有 intra-repo 仓（workspace=same）的回执交付**；与 v2.12.3 P1-b 已修的同根族缺口（separate 分支不产可复制行）同源，但 **same 分支漏修**
> 建议处理人：handoffs 契约维护方（改 `handoff.mjs` / `README.md` / `RESPONSE-TEMPLATE.md` / 接入桩，升版本号）

---

## 0. 一句话结论

契约把「**任务转递**（发起方→执行方）」与「**回执交付**（执行方→发起方）」两件不同的事，用同一个 `workspace` 键**一并豁免**：
`workspace=same ⇒ 免转递 ⇒ 回执也不产「## 转递提示词」`（`handoff.mjs:218`）。
但二者语义不同——任务转递免的是「搬工作树」，回执提示词是「通知发起方审计」的**交付行**。连带豁免使发起方在 same 模式下**无标准行可贴**、只能回查 `handoff status`，直接违反 Hub 自己的两条自述：`DESIGN.md §1`（用户复制粘贴是唯一转递方式）与 `RESPONSE-TEMPLATE.md:112`（不靠消费方回查回执）。

---

## 1. 现象（实证 · 一期一卉花）

- 仓内交接 `stores-20261014-01-task`（`from_lane: goods` / `to_lane: goods` / `workspace: same`，`type: feature`）：执行方已完工、写回执、`handoff receipt` 登记，状态 `received`。
- 但回执末端只有一行 `## 转递提示词（免转递）`——**没有一个可复制的行**交给审计侧。
- 用户（唯一通道）要发起审计，只能二选一：① 手写一行 `请收 <仓> 回执：<路径>`（契约未提供、格式要自己拼）；② 让审计方新会话冷启动跑 `handoff status` 自己发现。
- 二者都不是「Hub 给的标准动作」。用户原话：**「免转递也需要提示词啊，我转递给发起方啊」**。

> 注：本条同族缺口 2026-10-13 已在一期一卉花出现过一次（`goods-stores-20261013-01-task`）；`PROPOSAL-2026-10-14-receipt-content-integrity.md §4-#4` 亦已把「separate 分支不产可复制行 → 发起方无标准行可贴」列为病根并在 v2.12.3 P1-b 修掉——**唯独 same 分支保留豁免**。

---

## 2. 根因（契约内部矛盾 · 附代码/行号 · 已逐条读实）

| # | 位置 | 现状 | 问题 |
|---|------|------|------|
| 1 | `handoff.mjs:214-218` `checkReceiptPrompt` | `if (workspace === 'same') return;` —— same 回执**不校验**「## 转递提示词」 | 回执交付行在 same 下被静默豁免 |
| 2 | `handoff.mjs:1061-1079` `cmdPrompt` | same 分支（1064-1068）只打印「同工作区无需人工转递…**勿复制**」；separate 分支（1069-1077）**产出可复制行**（v2.12.3 P1-b） | 同一「无标准行」缺口，separate 已修、same 漏修 |
| 3 | `README.md:163` / `228` / `274` | 「`workspace=same` ⇒ 免转递」；check 硬校验排除「仓内 `workspace=same`」 | 用**一个** workspace 键同时决定任务转递与回执交付 |
| 4 | `AGENT-GUIDE.md:32` / `56` | 「跨仓/异工作区才写」；「`workspace=same` 不产出『## 转递提示词』，**不得误伤**」 | 把回执交付行定性为「误伤」，故 agent 主动不写 |
| 5 | `RESPONSE-TEMPLATE.md:109` / `112` | 109：「COREML 同工作区侧免转递，不适用此话术」；112：**「写回执的 agent 必须再输出一段转递话术…不靠消费方回查回执」** | **§112 与 §109/豁免直接矛盾**：一边说必须给用户一键转的入口，一边把 same 排除 |
| 6 | 接入桩 `AGENTS.md:1146-1147`（= `handoff.mjs` 模板同文） | 「`COREML-*` / 仓内 `workspace=same` 免转递豁免」 | 豁免下沉进桩，全仓 agent 默认照办 |

**根因（一句话）**：`免转递` 是为**任务转递**设计的（`COREML-CONVENTION.md`：「去掉的是**转递**，不是**边界**」；反面清单针对「让用户复制粘贴同一台机上的**文件**」），但契约把**回执交付行**也挂在同一个 `workspace` 开关上，理由是「same 可直接 `status` 发现」。**该理由与 `DESIGN.md §1`（agent 间无直连、复制粘贴是唯一通道）和 `RESPONSE-TEMPLATE.md:112`（不靠回查）相冲突**——same 下 agent 之间同样不通信，用户同样必须搬运「回执已就绪、去审计」这一信号。

---

## 3. 影响面

- **所有 **intra-repo 仓**：一期一卉花（inventory/goods/psi）、Tappy、以及 iggle-coreml 的 `workspace=same` 成例 `COREML-*`（`COREML-*` 是否也需修见 §4 边界）。
- 症状统一：执行方写了回执 → 发起方无标准行 → 交付依赖**人工回查 `handoff status`**，与「status 是发现入口」的设计意图相反（status 本用于**发现任务**，现被迫兼任**回执通知**）。
- 无安全/数据风险；纯协作吞吐与「不漏审计」风险。

---

## 4. 建议修复（按力度递增 · 供维护方择一或组合）

### P0 · 契约解耦：回执交付行不再按 workspace 豁免
把「回执 `## 转递提示词`」的豁免条件与「任务转递」拆开：
- **删除** `handoff.mjs:218` 的 `workspace === 'same'` 早退（保留 `COREML-*` 历史豁免见边界）；
- 同步 `README.md:228/274`、`AGENT-GUIDE.md:32/56`、`RESPONSE-TEMPLATE.md:109`、接入桩（`handoff.mjs` 模板 + 各仓 `AGENTS.md/CLAUDE.md` `install` 刷新）措辞：**回执提示词与 workspace 无关，same 也须写**。
- 理由：`DESIGN.md §1` + `RESPONSE-TEMPLATE.md:112` 已是契约自述；此改动只是消除它们与 `workspace` 开关的冲突。

### P1 · 引擎生成，消灭「手拼格式」
`handoff receipt <ID>` 成功后（或新增 `handoff prompt <ID> --receipt`）**直接打印可复制的回执行**（same/separate 均出）：
`请收 <本仓> 回执：<回执路径>（<行数/字节> · needs_change=<是/否>）`
——对齐 v2.12.3 P1-b 对 separate 的处理，把「格式靠人拼」变成「引擎给行」。

### P2 · 若维护方坚持 same 免转递（最小让步）
- 把 `checkReceiptPrompt` 对 same 的**豁免降级为非阻断提示**（`same 回执建议补 ## 转递提示词，便于人工路由`），而非完全静默；
- 在 `DESIGN.md` / `README` 显式写明「same 模式：回执**靠发起方 `handoff status` 发现**」为**有意设计**（当前只在豁免处一笔带过，未说明发起方如何得知回执已到）。

---

## 5. 边界 / 不变式（防误伤）

- **不搬文件**：本条只要求一行**指针**（`请收…回执：<路径>`），与 `COREML-CONVENTION.md` 反面清单禁止的「复制粘贴同一台机上的**文件**」无关，不违反。
- **`COREML-*` 是否一并解禁**：建议至少让 same-repo（仓内）回执不再豁免；`COREML-*` 属同一工作区历史成例，维护方可单独决定保留或一并改（本报告不主张强改）。
- **不改状态机 / drift / `--json` schema**；不动交接正文规范；纯交付行与提示词生成的收回正。
- **单一源**：回执行格式仍以 `RESPONSE-TEMPLATE.md` 为唯一源；本报告不引入第二份模板。

---

## 6. 复现（维护方自测）

```bash
# same 模式回执当前无「## 转递提示词」可复制行：
grep -n "workspace === 'same'" ~/Documents/lab/handoffs/handoff.mjs      # → :218 早退
grep -n "同工作区 · 免转递" ~/Documents/lab/handoffs/handoff.mjs          # → :1065 只打印、不产行
grep -n "免转递豁免" ~/Documents/lab/handoffs/handoff.mjs                # → 桩 :1146-1147

# 一期一卉花现存回执（该节只有「（免转递）」占位，无交付行）：
grep -n -A1 "## 转递提示词" ~/Documents/Developer/一期一卉花/.handoffs/receipts/stores-20261014-01-task-resp.md
```

---

## 附：来源与关联

- 同根族已修：`PROPOSAL-2026-10-14-receipt-content-integrity.md §4-#4`（separate 分支不产可复制行 → v2.12.3 P1-b 已修）；**本报告 = 同一缺口的 same 分支**。
- 相关机制：`DESIGN.md §1`（复制粘贴是唯一转递）；`RESPONSE-TEMPLATE.md:112`（不靠回查）；`COREML-CONVENTION.md`（免转递的原始理由）。

---

## 处理记录（维护方 · v2.12.4 · 2026-10-14 已落地）

- **结论**：问题**属实**。已逐条读实 `handoff.mjs` / `README.md` / `RESPONSE-TEMPLATE.md` / `AGENT-GUIDE.md` / 接入桩，并在一期一卉花现存回执 `stores-20261014-01-task-resp.md` 实证「仅有（免转递）占位、无交付行」。
- **根因**：`checkReceiptPrompt` 用 `if (workspace === 'same') return;` 把**回执交付行**与**任务转递**一并豁免，与 `DESIGN.md §1` / `RESPONSE-TEMPLATE.md:112` 冲突。
- **治法（采纳 P0 · 解耦）**：删除该早退；仓内 `workspace=same` 回执仍须含「## 转递提示词」节（仅任务转递免搬工作树，回执交付行不豁免）。保留 `COREML-*` 历史豁免（同工作区侧免转递，COREML 专属；是否一并解禁交后续评估）。
- **改动文件**：`handoff.mjs`（`checkReceiptPrompt` + `STUB_BODY` 措辞）、`README.md`（头 v2.12.4 + §转递提示词/§回执正文）、`RESPONSE-TEMPLATE.md:109`、`AGENT-GUIDE.md`、`CHANGELOG.md`（v2.12.4）；`handoff install` 已刷新 Hub 接入桩（AGENTS/CLAUDE/README）+ 全局指针（v2.12.4，新 `STUB_SHA`）。
- **实测**：`node --check` OK；lab Hub `handoff check` 仍 exit 0；临时 intra-repo 子 Hub 受控验证——same 回执**缺节被拒**、**补节即通过**（双向确认解耦生效）。
- **交接已写好并 forward**（待用户转递）：`TAPPY-20261014-02` / `PROSPERO-20261014-03` / `IGGLE-20261014-03` / `SWOOP-20261014-03` / `YIQIYIHUIHUA-20261014-02`（`~/Documents/lab/handoffs/handoffs/`）。各仓执行方重跑 `handoff install` 刷新桩至 v2.12.4。
- **一期一卉花回填由「可选」更正为「必做」**（实测修正上方早期判断）：`checkStubCarrier` 先于回执扫描 early-exit，当前该仓 check 只报桩漂移；桩刷新后 `checkReceiptPrompt` 对 `date≥2026-10-13` 且缺节的 same 回执报「缺『## 转递提示词』节」（已用 /tmp 副本实测确认）。必补 3 份：`goods-20261013-01`、`goods-ui-enhance-20261013-01`、`inventory-20261012-01`（frontmatter `date=2026-10-13`）；`goods-20261012-01`/`psi-20261012-01` 存量豁免、`goods-stores-20261013-01`/`stores-20261014-01` 已含节（后者残留「（免转递）」字样可顺手清）。详见 `YIQIYIHUIHUA-20261014-02-feature.md`。
- **P1（引擎生成回执行）已做**（v2.12.4 热修批次 · 2026-10-15 落地）：新增 `printReceiptDeliveryLine(rFile, needsChange)`，在 `cmdReceipt` 两个分支（仓内 / 跨仓，含「已 received 跳过翻状态」重跑路径）落盘后均打印可复制「回执交付行」——`请收 <本仓> 回执：<路径>（<行数> 行 / <字节> 字节 · 需发起方改动：<是/否>）`，与 `cmdPrompt` 对 separate 的交接提示词对称；`<本仓>` 取运行仓 `detectRepo→TARGET_LABELS`（取不到回退目录名），行数/字节按落盘文件实测。纯引擎行为，**未改 `STUB_BODY` ⇒ `STUB_SHA=1b465062` 不变、载体无需重刷**。实测：跨仓（swoop cwd）/ 仓内（Tappy cwd + `--needs-change`）/ 重跑三场景均正确出列。
- **§4 三项结论**（P0 采纳 / P1 已做 / P2 不适用）：P0 解耦已落地；P1 引擎打印已落地；P2 因 P0 已彻底删豁免而无「静默豁免」可降级，自然作废。
