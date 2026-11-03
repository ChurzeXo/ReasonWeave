# 提案：回执「格式合规但内容不实」零成本过门禁 —— 内容完整性加固

> 状态：**已落地（契约 v2.12.3 · 2026-10-14）**。owner 以「修复」指令核准全量实施；代码 + 文档 + 版本 bump + install 刷新均已完成并实测通过。
> 范围：仅改 `~/Documents/lab/handoffs/` 下的 `handoff.mjs` / `README.md` / `RESPONSE-TEMPLATE.md` / 接入桩；不碰交接正文、状态机、drift 机制、协作边界，不动下游三仓（iggle/Swoop/Prospero）+ 一期一卉花 / Tappy。
> 来源：一期一卉花仓（仓内 `intra-repo` 模式）一份回执 `goods-stores-20261013-01-task-resp` —— frontmatter 与「## 转递提示词」齐全、`handoff check` 能过，但内容为假（声称新增的 `cloudfunctions/stores/**`、`miniprogram/modules/admin/stores/**`、`docs/接口契约.md §9` 均不存在；所引短哈希 `5aa64ed` 经 `git show` 仅改了 `.handoffs/` 三个文档）。发起方在 reject 阶段才察觉，引擎全程未拦。
> 对齐基线：**契约当前头版 v2.12.2**（CHANGELOG:124）。

## 1. 问题证据（实测，附代码位置 · 已逐条核对）

| # | 问题 | 代码位置（已读实） | 实测结论 |
|---|------|------------------|----------|
| 1 | 闭环门禁不查内容 | `cmdAccept` 473–507；`assertStatusFresh` 100–111 | accept 只校验「有 `-n` 结论 + `status===received` + 状态新鲜度 + close 方向」；**不调用 `check`、不核回执真伪**，直接 `setFM status=closed`。伪回执可闭环。 |
| 2 | check 只查结构 | `cmdCheckIntra` 779–826；`checkReceiptBody` 196–202；`checkReceiptPrompt` 214–221；`receiptBodyProblems` 187–194 | 仅校验文件名、frontmatter 字段、枚举值、节**存在性**（正则 `## 转递提示词` / `## 状态\|结论`）。**无法验「声称的文件/提交是否存在」**。 |
| 3 | 写入即信任 | `cmdReceipt` 566–612；`writeReceiptFile` 554–564 | `-n` 正文经 `writeFM` **直接落盘**，落笔零校验。 |
| 4 | 规范与实现缺口 | `cmdPrompt` 925–928；契约 `README.md:223`；`checkReceiptPrompt` 214–221 | 仓内 `workspace=separate` 分支只打印 `接收方 lane + 先同步工作树`，**不产出可复制提示词行**；但契约声明 separate 须产「## 转递提示词」且 check 对该类回执**强制**该节 → 发起方无标准行可贴，回执只能手工写、漂移/漏节无人拦。 |
| 5 | 纪律未推广 | `RESPONSE-TEMPLATE.md:98`；`DESIGN.md:29/181/240` | 「骨架外 = 没有」只被用作「## 转递提示词」一节的历史教训，未推广为**通用写作 + 机器强制**纪律（无检查确保回执逐字复制唯一源骨架）。 |

**根因（一句话）**：治理层靠「agent 自觉 + 只校验结构不校验内容」→ E0（只有口头声称）零成本通过；agent 写回执从上下文即时生成、不回读唯一源骨架，漂移/漏节/编造无人拦。

**影响面**：此漏洞对所有 `intra-repo` 仓（含一期一卉花、Tappy）与跨仓回执**同构**——`accept` 路径对二者都不跑内容校验，故修复须同时覆盖 `cmdAccept`/`cmdReject` 与 `cmdCheckIntra` 两条入口。

## 2. 设计原则（不可妥协）

- **P1 门禁即内容门禁**：`accept`/`reject` 前置必须 `handoff check` exit 0；`check` 必须把「内容可证伪」纳入，而非仅节名。
- **P2 落盘即校验**：`receipt` 写入时即跑锚节 + 证据校验，缺即拒，消灭「写入即信任」。
- **P3 可证伪优先于不可证伪**：证据字段先覆盖「机器可判」项（git 提交哈希、same-workspace 文件存在性）；跨仓 separate 且目标仓不可达时**降级为 warn 而非硬拦**，避免误伤（详见 §3-P0c 边界）。
- **P4 不破边界**：不回改既有交接/回执正文、不动状态机与 drift、不改 `--json` v1/v2 schema、不碰下游仓。
- **P5 单一源**：回执骨架由 `RESPONSE-TEMPLATE.md` / `STUB_BLOCK` 生成，agent 逐字复制（呼应 v2.12 单一源治理）。

## 3. 改动清单（对应建议 · 含契约影响评估）

### P0-a  `accept`/`reject` 前置强制 `handoff check` exit 0
- `cmdAccept` (473) 与 `cmdReject` (512) 在判定前调用当前 check 逻辑（跨仓走 `cmdCheck`、仓内走 `cmdCheckIntra`），任一 problem → exit 1 拒绝闭环/驳回。
- **契约语义**：**否**（仅运行时门禁，不改 handoff/回执 schema）。属行为变更，影响所有 lane，需 owner 知会。
- **人 review**：**需要**（影响所有 lane 的闭环行为）。

### P0-b  `receipt` 落盘即校验锚节
- `cmdReceipt` (566) 落盘前对 `-n` 正文跑 `checkReceiptBody` + `checkReceiptPrompt`（仓内带 `workspace`），缺锚节 → exit 1 拒收。
- **契约语义**：**否**（强制的是契约已要求的节）。
- **人 review**：不需要（落袋即收紧既有契约，可由引擎 agent 自测后落地）。

### P0-c  回执增 `evidence` 字段并机器校验（唯一触碰契约项）
- 回执 frontmatter 新增 `evidence`（结构见下）；`cmdReceipt` + `cmdAccept` + `check` 三处校验。
  ```
  evidence:
    commits:                       # 回执声称基于/引入的提交
      - repo: <target-key>         # same-workspace 省略（= cwd）
        sha: <7/40 位>
    paths:                         # 回执声称新增/修改的文件（相对仓根）
      - repo: <target-key>         # 省略 = cwd
        file: <rel-path>
  ```
- 校验逻辑（遵循 P3 边界）：
  - `commits`：`repo` 根可解析 → `git -C <root> cat-file -e <sha>`，缺失即拒；不可解析（跨仓 separate 找不到目标仓路径）→ **warn-only**。
  - `paths`：`repo` 根可解析 → `fs.existsSync(join(<root>, file))`，缺失即拒；**same-workspace 全可证 → 硬门禁**；不可解析 → warn-only。
  - 仓根解析：same-workspace = `process.cwd()`；跨仓 = 新增 `REPO_ROOTS` 映射（target-key → 本地仓路径，缺省为空 → 走 warn 降级）。
- **契约语义**：**是** —— 新增回执 frontmatter 字段，需同步 `README.md` §回执字段 + `RESPONSE-TEMPLATE.md` 骨架，并**版本号提升**（建议 v2.12.3；若认定 schema 破坏性则 v2.13.0）。存量回执无 `evidence` → 豁免（阈值日前），对齐 `RECEIPT_BODY_SINCE` 原则。
- **人 review**：**必须**（契约 sem 变更 + 侵入式，且引入 `REPO_ROOTS` 配置面）。

### P1-a  回执骨架内联进接入桩（`install` 生成）
- 把 `RESPONSE-TEMPLATE.md` 回执骨架作为生成块随 `handoff install` 写入各载体（AGENTS/CLAUDE/全局），agent 逐字复制，消灭「指针 → 退回记忆」漂移。与 v2.12 `STUB_BLOCK` 单一源机制一致。
- **契约语义**：**否**（只改桩散文载体，唯一源仍是 `RESPONSE-TEMPLATE.md`）。
- **人 review**：不需要。

### P1-b  补 `cmdPrompt` 仓内 `separate` 分支产出提示词行
- `cmdPrompt` 925–928 的 `else` 分支复用 `PROMPT_TEMPLATE`，将 `<TARGET>` → `fm.to_lane`，输出可复制一行式（对齐跨仓分支 949–950）。填补契约 `README:223`（separate 须产「## 转递提示词」）与实现之间的缺口，闭环「发送方有标准行可贴」。
- **契约语义**：**否**（是实现对齐既有契约的 bug fix）。
- **人 review**：不需要（quick win，建议最先落地）。

### P2  把「骨架外 = 没有」提升为通用纪律（DESIGN/契约）
- `DESIGN.md`（已在 29/181/240 作为原则陈述）补一段「回执写作 = 逐字复制唯一源骨架，非从记忆重建」的通用纪律；可选：在 `check` 中加「回执结构须含骨架全部必需节」的弱校验（阈值日起，warn-only）。
- **契约语义**：**否**（文档/弱校验层面）。
- **人 review**：不需要。

## 4. 验收判据

- [ ] P0-a：`handoff accept <伪回执ID> -n "..."` 在回执未过 check 时 **exit≠0** 且点名缺项；真回执 exit 0 闭环。
- [ ] P0-b：`handoff receipt <ID> -n "<缺锚节正文>"` **exit≠0**；含锚节则落盘。
- [ ] P0-c：回执带 `evidence.commits[sha]` 指向不存在哈希 → **exit≠0**；`evidence.paths[file]` 在 same-workspace 不存在 → **exit≠0**；哈希/路径属实 → 通过；跨仓 separate 目标仓不可达 → **warn 不拦**。
- [ ] P1-b：`handoff prompt <intra-separate-ID>` 输出含 `to_lane` 的可复制提示词行。
- [ ] `handoff check` 基线仍 exit 0（存量豁免）；`--json` v1/v2 零变化。
- [ ] 未碰交接/回执正文、状态机、drift、协作边界、下游仓。

## 5. 明确不改动（守边界）

- 不回改任何既有交接/回执正文；不动状态机、drift、协作边界；不改 `RESPONSE-TEMPLATE.md` 既有字段要求（仅**新增** `evidence`）；不碰 iggle/Swoop/Prospero/一期一卉花/Tappy 仓库。
- 不引入 symlink；`REPO_ROOTS` 仅本地配置、不写进交接文档。

## 6. 契约影响面（对齐 v2.12.2）

| 项 | 是否契约 sem 变更 | 影响 |
|---|---|---|
| P0-a 门禁前置 check | 否 | 行为变更，所有 lane 闭环前须过 check |
| P0-b 落盘校验锚节 | 否 | 收紧既有契约节要求 |
| **P0-c `evidence` 字段** | **是** | 回执 frontmatter 增 `evidence`；`README.md` §回执字段 + `RESPONSE-TEMPLATE.md` 骨架同步；**版本提升 v2.12.3（或 v2.13.0）+ 各载体重跑 `handoff install` 刷新 `STUB_SHA`** |
| P1-a 骨架进桩 | 否 | 桩散文载体变更，唯一源不变 |
| P1-b prompt separate 行 | 否 | 实现对齐既有契约 |
| P2 通用纪律 | 否 | DESIGN/弱校验 |

**需人 review 项**：P0-a（行为门禁）、P0-c（契约 sem + 侵入式）。其余可由引擎 agent 自测落地。

## 7. 处理结论（Hub 侧）

- **问题本身：ACCEPT（已证实）** —— 5/5 项均对照代码实测成立，非推测。
- **整改计划：ACCEPT，分档 P0→P1→P2 落地。**
  - P0-a / P0-c：**ACCEPT，但需 owner review 通过后再落地**（触碰行为门禁与契约语义）。其中 P0-c 建议先实现「same-workspace 文件存在性 + 提交哈希 `git cat-file -e`」硬门禁，跨仓 separate 不可达时降级 warn，避免误伤。
  - P0-b / P1-a / P1-b / P2：**ACCEPT，无需契约变更，引擎 agent 可自测后直接落地**（P1-b 为 quick win，建议最先做）。
- **不采纳「全盘机器校验跨仓文件存在性」**：受限于引擎无目标仓本地路径，硬拦会误伤合法跨仓回执 → 采用 P3 的可证伪优先 + 不可达降级策略。
- **不采纳「提高 `assertStatusFresh` 窗口」作为根因解法**：新鲜度门禁不解决内容真伪，仅治标。
- **下一步**：owner 确认 P0-a / P0-c 的版本号（v2.12.3 vs v2.13.0）与 `REPO_ROOTS` 配置面后，引擎 agent 落代码 + 跑 `handoff check` 基线 + 补本提案的验收判据。
