# Changelog — review-gate

## v1.0.5 (2026-10-15)
- **统一「多门禁共存」口径，与 preflight 对齐（闭合 KF-4）**：git 一仓只允许一个 `.githooks/pre-commit` —— 放弃「合并/焊入既有 hook」旧措辞，全模块改用 **dispatcher 模式**（各门禁作 `.githooks/pre-commit.d/` 子检查，编排器见 `~/Documents/lab/preflight/templates/pre-commit`）。
- 受影响文件：`README.md`（§3.2 步骤 1 + §8 新增共存条目）、`AGENTS.md`（核心约定新增第 5 条）、`docs/new-project-prompt.md`、`docs/existing-project-prompt.md`（步骤 1/5 + 回复项）、`docs/transfers/{iggle,prospero,swoop}.md`（既有 hook 仓：步骤 1 改为「既有 hook 移入 `.d/00-existing` + 本模块 `.d/10-review-gate` + dispatcher 编排」；硬约束与回复项同步）。
- `templates/` **未改**（模块 hook 同时适配「单门禁独立挂载」与「dispatcher 子检查」两种用法）；`docs/transfers/yiqiyihuihua.md`（无既有 hook）无需改。
- 背景：手改焊死 hook 正是本模块 v1.0.2/v1.0.3 两 bug 的根因模式；KF-4 = review-gate 旧「须合并」措辞与 preflight「统一走 dispatcher」冲突。

## v1.0.4 (2026-10-13)
- 新增 `docs/transfers/` 定制提示词（按已核对仓实况写死参数，接收方 Agent 零猜测）：
  - `iggle.md` — Rust workspace + TS/vite/Tauri；无 remote；**已有 3 hook 须合并**；crates/（含 iggle-coreml）业务代码禁碰；RULESETS=`p/default p/rust p/typescript`。
  - `prospero.md` — 纯 Rust（napi-rs）；有 remote + CI；**已有 3 hook 须合并**；index.js/index.d.ts 构建产物判定 + build.rs 处理；CI 增强本次不做；RULESETS=`p/default p/rust`。
  - `swoop.md` — Rust + TS + reviews/*.py harness；有 remote；**已有 3 hook（含 post-commit，只动 pre-commit）须合并**；reviews/ 默认建议 ignore 否则加 p/python；RULESETS=`p/default p/rust p/typescript`。
  - `yiqiyihuihua.md` — 微信小程序 JS + 云函数 Node；无 remote；**无 .githooks 全新挂载**；中文路径引号纪律；小程序生态 SAST 覆盖薄、重心在 Layer-2；RULESETS=`p/default p/typescript p/javascript`。
- 四份均内嵌 v1.0.2/v1.0.3 两处防回退要点（path 归一化、SCAN_EXTS 正则）与「只本地 commit 不 push」「不碰业务代码」「CI 不动」硬约束。

## v1.0.3 (2026-10-13)
- 修复 `pre-commit` 扩展名正则 bug（假成功根因）：`SCAN_EXTS` 被声明为字符串，却用 `${SCAN_EXTS[*]}` + `IFS='|'` 的数组连接方式，导致 `|` 未插入，正则会变成匹配字面串 `"py kt kts ..."` 而永远匹配不到文件名 → `FILES` 空 → 提前 `exit 0`，门禁**全程不扫描任何文件**（假绿）。改为 `EXT_RE="\.(${SCAN_EXTS// /|})$"` 用字符串替换构造正则。Tappy 实例与模块模板同步修正。
- 实测：修复后暂存 `main.py` 跑真实 hook 会打印 "scanning 1 staged file(s)..." 并 ✅ 放行；对 `NodeDumper.kt` 做临时改动后暂存，真实 hook 正确识别 `use-of-md5` 已属基线（3 信号）而放行。

## v1.0.2 (2026-10-13)
- 修复 `pre-commit` 路径比对 bug：hook 把暂存文件按绝对路径喂给 opengrep，而 opengrep 对绝对路径入参会**回写绝对 `path`**，但基线 `path` 是相对仓库根。两者 `(check_id, path)` 永远不匹配 → 门禁会对每个触碰含已知信号文件的提交**误拦**。已在比对前把两边 `path` 统一归一化为相对仓库根（传 `REPO_ROOT` 给比较器，前缀剥除）。`scan.sh` 与 `pre-commit` 模板同步修正。
- 实测：扫描绝对路径的 `NodeDumper.kt` 在新归一化比较器下正确识别 `use-of-md5` 已属基线（0 个新发现）；旧比较器（不归一化）则误报 1 个新发现，确认 bug 与修复。

## v1.0.1 (2026-10-13)
- 修复 `scan.sh` / `pre-commit` 模板 bug：原 `RULESETS` 以空格分隔字符串直接传给 `opengrep scan`，缺 `--config` 前缀，导致 opengrep 把规则名当成路径/registry 去拉取，卡在 "Loading rules from registry" 失败。改为先把 `RULESETS` 展开为多个 `--config` 参数。
- 实测：修正后在 Tappy 用 `RULESETS="p/default p/kotlin p/java"` 跑通，生成的基线 `(check_id, path)` 集合与既有 `evidence/opengrep-baseline-20261013/round5.json` **精确一致**（3 信号全部复现，无多无少）。

## v1.0.0 (2026-10-13)

- 从 Tappy 落地的 **OpenGrep Layer-1 + 本地 review Layer-2 + pre-commit 回归门禁** 抽离为通用模块（`~/Documents/lab/review-gate/`）。
- 提供 `templates/`（`scan.sh` / `pre-commit` / `.semgrepignore`）与 `docs/` 施法 prompt（新项目 / 现有项目）。
- 所有项目特定项（规则集、排除规则、基线路径、扫描扩展名）**全部变量化**，按语言栈预设切换；不绑定 Tappy 的 Kotlin/Android 特征。
- 已实测：Tappy（Kotlin+Python+Android）跑通 131 → 3 findings 收敛、8 笔提交经门禁落库；详见 Tappy `evidence/opengrep-baseline-20261013/` 与 `evidence/l2_review_20261013.md`。
