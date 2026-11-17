# 新项目接入 review-gate（通用评审防线）· 提示词

> 用法：把下面整段复制，粘贴进**新项目**的 Agent 会话即可。

---

**【新项目接入 review-gate · 通用评审防线安装】**

两层评审防线已抽离为通用模块，位置可通过 `$(lab path review-gate)` 动态获取（单一事实源，规范全貌见其 `README.md`）。它包含：

- **Layer-1 OpenGrep**：SAST 静态扫描（零外发、纯 CLI），作为硬规则兜底。
- **Layer-2 本地 review 技能**：让 Agent 调用 `code-review-and-quality` 技能做语义/并发层审查（LLM，可能幻觉 → 由 Layer-1 硬规则兜底）。
- **pre-commit 回归门禁**：提交时自动对照基线，只拦"基线外的新发现"。
- **双盲独立审计器**：`baton-audit-runner`（或 `lab audit-runner`），无上下文重跑真实 Exit 0。

> **前置**：本机需已装 OpenGrep。没装则先装：
> `curl -L https://github.com/opengrep/opengrep/releases/latest/download/opengrep-darwin-arm64 -o ~/.local/bin/opengrep && chmod +x ~/.local/bin/opengrep`
> （其它平台/架构见 releases；这是 standalone binary，无需 npm。）

请按下列步骤接入（**不要**把 `$(lab path review-gate)/README.md` 的规范复制到本项目，项目只按模板接入）：

1. **落地模板**：把 `$(lab path review-gate)/templates/` 下三个文件复制到项目根：
   - `.semgrepignore` → 项目根（按项目增删注释里的条目）。
   - `scan.sh` → 项目根（或 `scripts/`）。
   - `pre-commit` → 项目根 `.githooks/pre-commit`（先 `mkdir -p .githooks`）。
   - **若本仓已有别的 pre-commit 门禁**：git 一仓只允许一个 `.githooks/pre-commit`，**不要「合并/焊入」**；改用 dispatcher 模式——本模块落为 `.githooks/pre-commit.d/10-review-gate`，既有门禁作 `.d/` 子检查（`00-`/`05-`），编排器见 `$(lab path preflight)/templates/pre-commit`。
2. **选语言栈**：打开 `scan.sh` 顶部的 `RULESETS`，按项目语言选预设（Kotlin/Android+Python / Rust+TS / 纯 Python / Go / 全栈）。`pre-commit` 同样支持 `RULESETS` 环境变量，默认与 `scan.sh` 一致。
3. **跑基线**：`RULESETS="<你的预设>" bash scan.sh review-gate/baseline/baseline.json`。首次会扫描全仓，输出基线 JSON（正常会有若干 findings，这是预期噪音，需人工过目）。
4. **人工过目基线**：打开 `review-gate/baseline/baseline.json`，把"确认是误报/可接受"的留下（作为已知信号，门禁放行），把"真问题"先修掉或记入 backlog。**基线 = 你主动接受的清单**，不是自动信任。
5. **挂载门禁**：`git config core.hooksPath .githooks`（per-repo local，不污染全局；新克隆需重跑）。
6. **加一句指令**：在根 AGENTS.md / CLAUDE.md 加：「静态扫描与提交门禁按 `$(lab path review-gate)/README.md` 接入；改基线前先人工 review。」
7. **校验**：`git add -A` 一个无关小改动后 `git commit`，应看到 `✅ OpenGrep gate passed`；故意引入一个会被拦的改动（如新增一处明显硬编码密钥）应被 `❌` 阻断。

完成后回复：① 模板是否已落地（三处路径）；② 语言栈预设选了哪个；③ 基线 findings 数量与是否人工过目；④ pre-commit 挂载是否生效（commit 时看到 gate 输出）。

---

> 本提示词由 `units/review-gate/` 维护，随模块版本演进更新。引用源：`$(lab path review-gate)/docs/new-project-prompt.md`。
