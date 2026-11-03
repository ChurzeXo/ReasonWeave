# PROBLEM-2026-10-16 — preflight 消费方接入实跑发现的模块侧问题（文档 bug ×2 / 脚本诊断 ×1 / 写死版缺失）

> 状态：✅ 已全部处理（preflight v1.0.5 + v1.0.6，2026-10-17）。P1（awk 侦察）/ P2#2（A1 check-ignore）与 swoop 缺陷③②同根因并修；#3（SELFCHECK 口径）/ #4（嵌套 .gitignore）/ #5（prospero.md 写死版）见 v1.0.6。明细：`~/Documents/lab/preflight/CHANGELOG.md`；真机验证：`evidence/2026-10-17/`。§3 两项（Stop hook / CI）核对后确认无需动作。
> 报告方：Prospero（消费方 · 2026-10-16 完成 CONSUMER-INSTALL 四步接入，验收全过）
> 影响范围：**所有后续消费方**——侦察命令记错预算、A1 误报"规则缺失"、自检误报缺文件
> 建议处理人：preflight 模块维护方（改 `docs/transfers/CONSUMER-INSTALL.md` / `CONSUMER-SELFCHECK.md` / `templates/preflight.sh`；可建 `docs/transfers/prospero.md`）

---

## 0. 一句话结论

prospero 实跑接入暴露 3 个模块侧缺陷（1 个 P1 文档 bug 会让消费方**记错文档预算**、2 个 P2 会让 A1/自检**给出误导信息**）+ 1 个缺失交付物（已知消费仓无写死版 transfer）；另有 2 项（Stop hook / CI）经核对**不是 preflight 问题、无需动作**——修前三、防误判后二。

## 1. 现象与实证（prospero · 2026-10-16）

完整接入记录：`/Users/churze/Documents/Prospero/reviews/2026-10-16-preflight-install.md`（提交 `ccd4300` 止血 / `c97de48` 门禁 / `1ddcd70` 收尾形状 / `e00cf94` 报告）。

| # | 级 | 问题 | 实证 |
|---|----|------|------|
| 1 | **P1** | `CONSUMER-INSTALL.md:13` 的 A2 行数侦察命令不可用 | 实跑 `awk 'END{print FILENAME": "NR}' AGENTS.md CLAUDE.md 2>/dev/null` 只输出一行 `CLAUDE.md: 198`（=161+37 **累计**），AGENTS.md 的 161 行完全丢失；消费方按此定 `DOC_BUDGETS` 必错 |
| 2 | **P2** | `preflight.sh` A1 把「规则缺失」与「被跟踪覆盖」混为一条误导 ✗ | `.handoffs/` 案例：规则 `.gitignore:28:/.handoffs/` 实际存在，但目录下 3 个 jsonl 已被跟踪 → 首条 ✗ 报「未被 .gitignore 覆盖」（错），真因是第二条「或其下有文件被跟踪」 |
| 3 | **P2** | `CONSUMER-SELFCHECK.md` 与 `CONSUMER-INSTALL.md` 口径不一 + 混入他仓 specifics | INSTALL 说现有检查移入 `10-<现有>`（通配）；SELFCHECK §A 硬编码 `10-review-gate`。prospero 按通配口径把「decision-refs report + review-gate」两道既有检查合并迁入 `10-prospero-gates`（合法落法），按 SELFCHECK 字面自检会**误报缺文件**；另 SELFCHECK §C 含他仓 specifics（「本仓原 4 个跟踪产物……`codegraph-index-consolidate`」）却未标注为示例 |
| 4 | P3 | A1 对「嵌套 .gitignore 掩盖根规则移除」不敏感 | `.codegraph/` 内自带 `.gitignore`（含 `*`）；注掉仓根 `/.codegraph/` 后 A1 仍全绿——忽略源悄悄变成产物目录内的文件 |
| 5 | P3 | 已知消费仓无写死版 transfer | INSTALL 开头注「若已知消费仓……改名 `<repo>.md` 写死」、SELFCHECK 末尾「已知消费仓优先用写死版」——目前无 `docs/transfers/prospero.md` |

## 2. 根因与建议修复

**P1（#1）根因**：`awk` 的 `END` 块全程只执行**一次**，`NR` 是跨文件**累计**值；叠加 `2>/dev/null`，文件打不开也静默。双重失效叠加成"只出一行且数字错"。
**修法**：侦察命令改为 `wc -l AGENTS.md CLAUDE.md`（或 awk 改 `FNR` 并逐文件处理）；去掉会吞掉 open 失败的 `2>/dev/null`。

**P2（#2）根因**：`git check-ignore` **默认查索引**——已跟踪路径即使命中 .gitignore 规则也返回非零（git 语义：跟踪优先于忽略）。
**修法**（二选一或组合）：① A1 的"规则存在性"改用 `git check-ignore --no-index -q`，与 `ls-files` 的"是否被跟踪"解耦；② 两条 ✗ 同时命中时补一行提示：「规则可能已存在但被跟踪覆盖（验证加 `--no-index`）」。

**P2（#3）修法**：SELFCHECK §A 文件落位改口径描述（「存在 `10-*` 且既有检查都在跑、未焊成一份」）；§C 的他仓 specifics 显式标注「示例，以各仓 `<repo>.md` 写死版为准」，或参数化。

**P3（#4）修法（可选）**：A1 可用 `git check-ignore -v` 核对忽略来源是否为仓根 .gitignore；也可明确决定不抓（记录理由）。低优先。

**P3（#5）修法（可选交付物）**：建 `docs/transfers/prospero.md`，写死参数（prospero 2026-10-16 实测落地值）：
```
RUNTIME_PATHS=".codegraph/ .handoffs/ target/ node_modules/ prospero.darwin-arm64.node"
DOC_BUDGETS="AGENTS.md:200 CLAUDE.md:80"；BACKLOG_DIR=docs/backlogs；BACKLOG_HEAD="^title:"；BACKLOG_TYPE="type:"
既有钩子：.githooks/pre-commit（decision-refs report + review-gate）→ 10-prospero-gates；core.hooksPath=.githooks
特殊事实：接入时 A1 实跑发现 .handoffs/audit/ 3 个 jsonl 被跟踪（6d1fb6f 误提交），已移出索引止血
```

## 3. 明确不是 preflight 问题（防过度行动）

- **宿主 Stop hook 未接入**：`CONSUMER-SELFCHECK.md §E` 已定为可选甜点（「忘装无损」，pre-commit 为核心强制点）。**无需动作**；如愿意可在 README §5 补一句指向该立场。
- **CI 未接入**：prospero R7（GitHub Actions 账号级禁用）是消费方环境事实。**无需动作**。

## 4. 复现（维护方自测）

```bash
# P1：awk END 只跑一次 + NR 累计（在 prospero 仓或任意两文件仓）
awk 'END{print FILENAME": "NR}' AGENTS.md CLAUDE.md   # → 只一行 "CLAUDE.md: 199"（累计；AGENTS.md 行数丢失）
wc -l AGENTS.md CLAUDE.md                              # → 真值 162 / 37

# P2：任意 scratch 仓——把被忽略路径下的文件强行加入索引
mkdir -p /tmp/ci-demo/art && cd /tmp/ci-demo && git init -q . && touch art/x && echo "art/" > .gitignore && git add -f art/x
git check-ignore -v art/            # → 无输出、exit 1（已跟踪 ⇒ 报"未忽略"，尽管规则在）
git check-ignore -v --no-index art/ # → .gitignore:1:art/	art/（规则其实存在）
```

## 附：来源与关联

- 消费方接入全记录：`/Users/churze/Documents/Prospero/reviews/2026-10-16-preflight-install.md`（三节形状收尾报告）
- prospero 侧门禁现状：`.githooks/pre-commit`（分发器）+ `pre-commit.d/10-prospero-gates` + `pre-commit.d/20-preflight` + `scripts/preflight.sh` + `scripts/check-wrapup.sh` + `docs/templates/wrap-up.md`
- 相关模块文档：`~/Documents/lab/preflight/README.md` §2/§3/§5/§7；`docs/transfers/CONSUMER-INSTALL.md`；`docs/transfers/CONSUMER-SELFCHECK.md`

---

## 附：给 preflight Agent 的可粘贴提示词（自包含）

```text
给 preflight 模块（/Users/churze/Documents/lab/preflight/）修三个消费方接入实跑发现的问题 + 评估两个可选项。
消费方 prospero 已于 2026-10-16 按 docs/transfers/CONSUMER-INSTALL.md 完成接入并验收通过（报告：
/Users/churze/Documents/Prospero/reviews/2026-10-16-preflight-install.md；完整问题文档：
~/Documents/lab/handoffs/PROBLEM-2026-10-16-preflight-consumer-install-feedback.md，含复现命令）。

[P1 · 文档 bug] CONSUMER-INSTALL.md 第一步 A2 行数侦察命令失效：
  `awk 'END{print FILENAME": "NR}' AGENTS.md CLAUDE.md 2>/dev/null`
  awk END 只执行一次且 NR 为跨文件累计 → 实跑只输出 "CLAUDE.md: 199"（累计值），AGENTS.md 行数丢失；
  叠加 2>/dev/null 连文件打不开都静默。消费方按此定 DOC_BUDGETS 会记错。
  修法：改为 `wc -l <文件>`（或 awk 用 FNR 逐文件），去掉吞错的 2>/dev/null。

[P2 · 脚本诊断] preflight.sh A1 的 check-ignore 语义误导：
  git check-ignore 默认查索引——已跟踪路径即使命中 .gitignore 规则也返回非零。
  prospero 实例：.handoffs/ 规则存在于 .gitignore:28 但目录有 3 个已跟踪文件时，
  A1 首条 ✗ 报「未被 .gitignore 覆盖」（误导），真因是第二条「被跟踪」。
  修法：① 规则存在性改 `git check-ignore --no-index -q`，与 ls-files 解耦；
  或 ② 两条 ✗ 同现时补提示「规则可能已存在但被跟踪覆盖（验证加 --no-index）」。

[P2 · 文档不一致] CONSUMER-SELFCHECK.md 与 CONSUMER-INSTALL.md 对 10- 槽位口径不一：
  INSTALL 说现有检查移入 `10-<现有>`（通配）；SELFCHECK §A 硬编码 `10-review-gate`。
  prospero 按通配口径将两道既有检查合并迁入 10-prospero-gates，按 SELFCHECK 字面会误报缺文件。
  另 SELFCHECK §C 混有他仓 specifics（「4 个跟踪产物 / codegraph-index-consolidate」）未标注示例。
  修法：§A 改口径描述（10-* 且既有检查都在跑）；§C 他仓内容标注「以 <repo>.md 写死版为准」。

[P3 · 可选] ① A1 对嵌套 .gitignore 掩盖根规则移除不敏感（.codegraph/ 内自带含 * 的 .gitignore，
  注掉根规则后 A1 仍绿）——可加 `check-ignore -v` 来源核对，或明确决定不抓并记录理由。
  ② 建 docs/transfers/prospero.md 写死版（INSTALL 开头与 SELFCHECK 末尾都要求已知消费仓优先用写死版，
  目前缺失）。参数：RUNTIME_PATHS=".codegraph/ .handoffs/ target/ node_modules/ prospero.darwin-arm64.node"；
  DOC_BUDGETS="AGENTS.md:200 CLAUDE.md:80"；BACKLOG_HEAD="^title:"；BACKLOG_TYPE="type:"。

明确无需动作（已核对）：宿主 Stop hook 未接入（CONSUMER-SELFCHECK §E 定为可选、忘装无损，
pre-commit 为核心强制点）；CI 未接入（prospero R7：Actions 账号级禁用，消费方环境事实）。

修完回报改动清单；prospero 侧会重跑 CONSUMER-SELFCHECK 验证闭环。
```
