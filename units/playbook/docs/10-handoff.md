# 10 — 跨仓交接（Handoff）

> **本章是指针章。** 跨仓交接契约是独立体系，权威在 `~/Documents/lab/handoffs/README.md`（契约版本以该文件为准），配套 CLI：`node ~/Documents/lab/handoffs/handoff.mjs`。本章只说明"Playbook 项目什么时候该接上它、怎么接"。

---

## 1. 什么时候需要 Handoff

项目内 Unit 之间**不需要** handoff——它们共用 `group/contracts/` 和依赖协调图（[14 章](14-dependency-graph.md)）。

需要 handoff 的信号：

- 改动的根因在**另一个仓库**（依赖方 / 上游库 / 平台 SDK）
- 需要依赖方新增 API、修 bug、补 SDK 能力
- 本仓只能绕行，根因不修就一直有技术债

任一命中 → **写 handoff，不要在聊天里口头交代**（宪法禁令 Chat-based Handoff）。

## 2. 为什么是 Artifact 而不是对话

宪法 T4 / AEF 的立场，CAID 论文（arxiv 2603.21489）给了实证理由：

> Agent 间用结构化 JSON 指令 + git commit 通信，**避免自由对话**——因为 inter-agent misalignment 是多 Agent 系统的首要失败模式。

自由对话交接的三个具体失败：状态丢失、语义漂移、无法追溯谁承诺了什么。Artifact 交接天然带 ID、状态机和回执。

## 3. 接入步骤

1. **读契约**：新项目首次涉及跨仓时，先 Read `~/Documents/lab/handoffs/README.md`。
2. **确认身份**：
   - 依赖方（要改的那一侧）：`handoff status --for <target>` 看待办
   - 发起方（需要改动的那一侧）：裸 `status`
3. **写交接**：`handoff new`（细则以契约 README 为准）
4. **转递**：`handoff prompt <ID>` 生成给依赖方的提示词
5. **闭环**：依赖方完成后发起方 `handoff accept <ID> -n "<验收结论>"`（审计通过；不过则 `handoff reject <ID> -n "<理由>"` 退回）
6. **硬门禁**：本仓收尾前 `handoff check` 必须 **exit 0**，否则任务不算完成

## 4. 与其他构件的关系

| 构件 | 关系 |
|---|---|
| 宪法 T4 | handoff 是 T4 的唯一实现方式 |
| [07 backlog](07-backlog.md) | 跨仓缺口 → handoff；不跨仓的"以后再说" → backlog |
| [05 ADR](05-adr.md) | handoff 闭环后若改变了本仓架构决策 → 补 ADR |
| [09 skills](09-skills.md) / `units/skills` | 审查流调用 `review-package` 与 `task-brief` 原语，回执遵循 ADR-0015 两阶段审查标准 (Spec vs Quality) |
| [12 gates](12-gates.md) | `handoff check` 是收尾门禁的硬项之一 |
| [11 Evidence](11-evidence.md) | `handoff close` 的验收结论本身是 E5 级证据 |

---

## 5. 仓内模式（intra-repo）— 同仓多窗口 / 续接新模型

> 当交接发生在**同一仓内**（如 Tappy 开新窗口换模型、或同仓两 agent 交叉验证），走仓内模式，**不要混用跨仓的「用户贴路径转递」习惯**——否则新窗口「只读不修」。

- **子 Hub**：项目内 `.handoffs/`（含 `.handoff-hub.json`：`lanes` / `types` / `workspace_default`）。引擎从 cwd 上溯自动发现；跨仓行为零变更。
- **路由键 = lane（不是仓库）**：Tappy 用 `impl`（修复）/ `audit`（验收）。ID 形如 `<LANE>-<date>-<NN>-<type>.md`。
- **冷启动协议**：新窗口进项目第一跑 `handoff status`（全仓未闭环）→ `handoff status --for <lane>` 认领。发现入口永远是 `handoff status`，**MUST NOT 扫描 `handoffs/`**。
- **必须先登记**：发送方用 `handoff new <lane> <type> "<标题>"` 生成合规交接；**切勿写到 `evidence/` 等非子 Hub 路径**——否则系统看不见、新窗口只读到文档不执行。
- **护栏**：被指向一份 handoff 路径时，先验证它在 `.handoffs/handoffs/` 且 frontmatter 合规（`handoff_id`=文件名、`mode: intra-repo`、`to_lane ∈ lanes`）；否则**拒绝当普通文档读**，提示用户先 `handoff new`。
- **免转递**：`workspace: same` 时新窗口跑 `handoff status` 自行发现，无需贴路径；同工作区归属只读 frontmatter，**严禁 mtime 推断**。
- **执行方工作单唯一性（防「另建交接」）**：落我 lane 的 handoff 即唯一工作单，按「验收判据」直接动工 + 写 `receipts/<id>-resp.md`；**绝不另 `handoff new` 处理已被交接的工作**，`evidence/` 散落文档（含废弃草稿）不是工作单，不当「开新交接 / 建回执」理由——除非用户显式要求。
- 引擎已实现 `init` / `--root` / 模式推断 / `check` 门禁；**`handoff install` 已实现**，且契约 **v2.9 起 `STUB_BLOCK` 升为模式感知 v2.1 桩**（先判 `.handoffs/.handoff-hub.json` → 仓内，否则跨仓）。`handoff install` 幂等整块刷新**带 `handoff-stub` 标记**的桩；**手写无标记段只告警、不自动刷**，须人工换成 README「接入桩」段的标准桩。`init` 会写 `.handoffs/README.md`，但**尚未**向仓库 `AGENTS.md` / `CLAUDE.md` 自动注入桩（手动加或跑 `install`）。

详见 `~/Documents/lab/handoffs/PROPOSAL-2026-10-09-intra-repo-mode.md` 与 `README.md §仓内模式`。

## 落地动作

1. 在根 AGENTS.md 加："涉外部仓库的改动，先 Read `~/Documents/lab/handoffs/README.md`，交接只走 `handoff.mjs` CLI，禁止聊天交接。"
2. 在 [12-gates.md](12-gates.md) 收尾门禁加：`handoff check` exit 0。
3. 如果本项目本身就是**被依赖方**，把 `handoff status --for <本项目>` 加进定期巡检。

> AEF 原文对应章节：T4 Artifact-based Handoff（宪法）、§22 Agent Communication、§23 Shared Contracts、§36 Anti-Patterns（Chat-Based Handoff）。
