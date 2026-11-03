# iggle 接入 review-gate · 定制提示词

> 给用户：把下方整段复制，粘贴进 **iggle 项目**（`~/Documents/iggle`）的 Agent 会话即可。
> 定制依据：Rust workspace + TS/vite/Tauri · 无 remote · **已有 3 个 githook（须共存不可覆盖——走 dispatcher，见步骤 1）** · 无 `.semgrepignore`。

---

**【给 iggle 项目 · review-gate 评审防线接入（Rust+TS 定制版）】**

两层评审防线已抽离为通用模块，位置：`~/Documents/lab/review-gate/`（单一事实源，规范见其 `README.md`）。本机 OpenGrep **已全局装好**（`~/.local/bin/opengrep`，v1.30.2，standalone binary，非 npm），无需重装。Layer-2 是 WorkBuddy 内置 `code-review-and-quality` 技能，全局可用。

本仓事实（已替你核对，直接用）：路径 `~/Documents/iggle`；语言栈 = **Rust workspace（crates/{aggregator,iggle-core,iggle-coreml,qianchuan-client}）+ TypeScript 前端（src/ + vite/vitest + src-tauri）**；**无 git remote**（PR 驱动的 CodeRabbit/PR-Agent 类工具失效，本地 review 是兜底）；已有 `.githooks/{commit-msg,pre-commit,pre-push}`；**无** `.semgrepignore`。

请按下列步骤收敛（**不要**把模块规范复制进本仓，仓里只放指针 + 一句指令）：

1. **读既有 pre-commit + 改装 dispatcher**：先 `cat .githooks/pre-commit`，弄清现有门禁做什么。**不得覆盖/焊入**既有门禁（覆盖 = 破坏用户既有门禁）。改装为 dispatcher 模式（git 一仓只允许一个 `.githooks/pre-commit`）：① 把既有 `.githooks/pre-commit` 移为 `.githooks/pre-commit.d/00-existing`（内容不改）；② 模块 `templates/pre-commit` 落为 `.githooks/pre-commit.d/10-review-gate`；③ 把 `~/Documents/lab/preflight/templates/pre-commit` 落为 `.githooks/pre-commit`（编排器）。`commit-msg`/`pre-push` 等其它 hook 不动。若既有门禁不是独立脚本、无法直接移入 `.d/`，读完后按等价方式包裹，汇报时说明选了哪种。
2. **落地另两文件**：复制模块 `templates/.semgrepignore` → 仓根（本仓没有，直接复制；确认已含 `node_modules/`、`target/`、`dist/`，缺则补）。复制 `templates/scan.sh` → `review-gate/scan.sh`。
3. **规则集**：`RULESETS="p/default p/rust p/typescript"`（已按本仓栈选好，写进 `review-gate/scan.sh` 顶部与 `.githooks/pre-commit.d/10-review-gate` 顶部默认值）。
4. **跑基线并人工过目**：`cd ~/Documents/iggle && RULESETS="p/default p/rust p/typescript" bash review-gate/scan.sh review-gate/baseline/baseline.json`。打开产物**逐条判断**：误报/可接受 → 留作已知信号（基线）；真问题 → 先修或记 `docs/backlogs/`（规范见 `~/Documents/lab/backlog/README.md`）。**基线是你主动接受的清单，不是自动信任。**
5. **挂载确认**：本仓 `.githooks` 已在用（说明 `core.hooksPath` 已指向 `.githooks` 或 hook 已由框架管理）——先 `git config --get core.hooksPath` 确认现状；若已指向 `.githooks` 则无需重挂；若未设则设上。
6. **加一句指令**：根 `AGENTS.md` 与 `CLAUDE.md`（两个都在，都加）各加：「静态扫描与提交门禁按 `~/Documents/lab/review-gate/README.md` 接入；改基线前先人工 review。」
7. **校验**：① 构造一次会触发新发现的改动（如临时文件用 MD5/弱随机），确认 `❌` 阻断、`EXIT=1`，然后清理；② 对含已知信号的文件做临时改动后提交，确认 `✅ passed`（证明接受性正常）；③ 清理后 `git status` 核对只有预期改动。

**硬约束**：
- 本次只碰仓根配置与 hook（`.semgrepignore`、`review-gate/`、`.githooks/pre-commit`、`.githooks/pre-commit.d/`——既有 hook 移入 `.d/` 不改内容），**不得编辑 `crates/` 下任何业务代码**（含 `crates/iggle-coreml`——归 coreml 侧角色，不在本次范围）。
- 不得碰工作树里用户既有的未提交/未暂存文件；提交前 `git status` 全量核对、精确 stage 自己的文件。
- 别改坏模板里两处已验证的关键逻辑：**path 归一化**（opengrep 对绝对路径入参回写绝对 path，比较前必须归一化为仓库相对路径）与 **SCAN_EXTS 正则**（用 `\.(${SCAN_EXTS// /|})$` 字符串替换构造，勿退化成数组连接）。
- 只本地 commit，**不 push**（本仓无 remote；若你确认该仓有推送约定也先问用户）。

完成后回复：① 既有 pre-commit 内容摘要 + dispatcher 改装方式（既有挪为哪个 `.d/` 子检查）；② 模板落地路径；③ 基线 findings 数量与人工过目结论（接受/修复/backlog 各几条）；④ 门禁挂载方式与三项校验结果。

---

> 本提示词由 `~/Documents/lab/review-gate/` 维护（v1.0.5 定制分发）。引用源：`~/Documents/lab/review-gate/docs/transfers/iggle.md`。
