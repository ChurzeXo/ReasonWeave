# prospero — preflight 接入提示词（写死版）

> 参数核准日期 **2026-10-17**（只读侦察实仓复核；基线：`~/Documents/lab/handoffs/PROBLEM-2026-10-16-preflight-consumer-install-feedback.md`）。
> prospero 已于 2026-10-16 按 `CONSUMER-INSTALL.md` 完成接入并验收通过（报告：`~/Documents/Prospero/reviews/2026-10-16-preflight-install.md`）。本份用于**重装 / 新会话重新接入 / 自检对照**，接收方零猜测。规范细节仍以 `~/Documents/lab/preflight/README.md` 为准。

项目根：`/Users/churze/Documents/Prospero`

## 写死参数（2026-10-17 实测）

- **RUNTIME_PATHS** = `.codegraph/ .handoffs/ target/ node_modules/ prospero.darwin-arm64.node`
  五者均已被 .gitignore 覆盖（`:25 /.codegraph/`、`:28 /.handoffs/`、`:2 /target/`、`:8 /node_modules/`、`:5 *.node`）；`git ls-files` 当前无残留被跟踪产物（A1 天然干净）。止血史（已闭合）：`.handoffs/audit/` 3 个 jsonl 曾被误跟踪（`6d1fb6f`），已移出索引。
- **DOC_BUDGETS** = `AGENTS.md:200 CLAUDE.md:80`（实测 162 / 37 行）。
- **BACKLOG_DIR** = `docs/backlogs`；**BACKLOG_HEAD** = `^title:`；**BACKLOG_TYPE** = `type:`（frontmatter 形；条目文件形如 `0002-<slug>.md`）。
- **配置载体**：**无 preflight.conf**——五个参数写在 `scripts/preflight.sh` 顶部默认值（本仓专属校准，勿留模板默认值）。
- **hook 接入点**：`.githooks/pre-commit` = 分发器（唯一形态，run-all）；`.githooks/pre-commit.d/10-prospero-gates`（decision-refs report + review-gate 两道既有检查 verbatim 迁入）+ `.githooks/pre-commit.d/20-preflight`；`core.hooksPath = .githooks`（已设）。
- **已文档化例外**：A3 用 frontmatter 形（`^title:` + `type:`）而非默认 `^## B-` + `类型`——写在 `scripts/preflight.sh` 顶注，出处 `docs/backlogs/README.md`。
- **特殊事实**：`.codegraph/` 内嵌套 `.gitignore`（含 `*`），与根规则双保险（接入报告已判「非问题」）；v1.0.6 起 A1 忽略源核对在根规则在时报仓根 = 绿，根规则被注掉会立即染红（防静默失效）。
- **硬约束**：CI 不动（R7：GitHub Actions 账号级禁用，本地 pre-commit 为唯一强制点）。

## 已落地件（自检对照）

`scripts/preflight.sh`（顶部默认值按上表校准）、`scripts/check-wrapup.sh`、`docs/templates/wrap-up.md`、`AGENTS.md:92` 指针一句（「动手前跑 scripts/preflight.sh；收尾按 docs/templates/wrap-up.md 三节填；门禁细节见 ~/Documents/lab/preflight/README.md」）。

## 重装 / 升级模板时的注意（本仓特有）

本仓校准值在**脚本顶部默认值**里而非 conf：复制新版 `templates/preflight.sh` 后，**必须把上面五个值重新写回顶部默认值**（或顺势改建 `preflight.conf` 承载——以后同步只换模板、不动参数，推荐）。当前仓内脚本为 v1.0.4 口径旧模板（无 env 快照 / 无 `--no-index` / 无忽略源核对），缺 v1.0.5–v1.0.6 三项修复。
