# 现有项目接入 review-gate（通用评审防线）· 提示词

> 用法：把下面整段复制，粘贴进**已经存在、可能已有别种 lint/CI** 的项目的 Agent 会话即可。新项目用 `new-project-prompt.md`。

---

**【给现有项目 · review-gate 通用评审防线接入（兼容既有）】**

两层评审防线已抽离为通用模块，位置：`~/Documents/lab/review-gate/`（单一事实源，规范见 `README.md`）。它含 Layer-1 OpenGrep（SAST 硬规则）+ Layer-2 本地 review 技能（`code-review-and-quality`）+ pre-commit 回归门禁。设计上**与既有 lint/CI 正交**——它是"回归篱笆"，不替代你现有的 ruff/clippy/CI，只补"跨提交不退化"这一层。

> **前置**：本机需已装 OpenGrep，没装先装（standalone binary，非 npm）：
> `curl -L https://github.com/opengrep/opengrep/releases/latest/download/opengrep-darwin-arm64 -o ~/.local/bin/opengrep && chmod +x ~/.local/bin/opengrep`

请按下列步骤收敛（**不要**把模块规范复制到本项目）：

1. **核对既有防线**：列一下项目已有的 lint/CI（ruff / clippy / GitHub Actions / pre-commit 框架等）。review-gate 的 pre-commit 是**自包含 bash 脚本**，不依赖 pre-commit 框架（`.pre-commit-config.yaml` 与 git 原生 `.githooks/` 是两条线，互不冲突）。**若已有 git 原生 pre-commit 门禁**：git 一仓只允许一个 `.githooks/pre-commit` → **不要「合并/焊入」**，改用 **dispatcher 模式**——本模块落为 `.githooks/pre-commit.d/10-review-gate`，既有门禁作 `.d/` 子检查（`00-`/`05-`，内容不改），编排器见 `~/Documents/lab/preflight/templates/pre-commit`。
2. **落地模板**：复制 `~/Documents/lab/review-gate/templates/` 三文件到项目根：`.semgrepignore`、`scan.sh`、`.githooks/pre-commit`。**若项目已有 `.semgrepignore`**，合并而非覆盖——把模块模板里的通用噪音条目并入你的。
3. **选语言栈**：按项目语言改 `scan.sh` 顶部 `RULESETS` 预设（Kotlin/Android+Python / Rust+TS / 纯 Python / Go / 全栈）。
4. **跑基线并人工过目**：`RULESETS="<预设>" bash scan.sh review-gate/baseline/baseline.json`。打开产物，**逐条判断**哪些是误报/可接受（留作已知信号）、哪些是真问题（先修或记 backlog）。**基线是你主动接受的清单，不是自动信任。**
5. **挂载门禁**：单门禁时 `git config core.hooksPath .githooks`（放本模板作 `.githooks/pre-commit`）。若已有原生门禁，**不要并入**，改用 dispatcher 子检查（见步骤 1）。
6. **加一句指令**：根 AGENTS.md / CLAUDE.md 加：「静态扫描与提交门禁按 `~/Documents/lab/review-gate/README.md` 接入；改基线前先人工 review。」
7. **校验**：构造一次会触发新发现的改动，确认被 `❌` 阻断；再正常提交确认 `✅ passed`。

完成后回复：① 既有防线清单及与 review-gate 的分工；② 模板落地路径（是否合并了既有 `.semgrepignore`）；③ 基线 findings 数量与人工过目结论；④ 门禁挂载方式（.githooks 独立 / dispatcher 子检查）。

---

> 本提示词由 `~/Documents/lab/review-gate/` 维护，随模块版本演进更新。引用源：`~/Documents/lab/review-gate/docs/existing-project-prompt.md`。
