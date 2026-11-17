# 消费方安装自检提示词（preflight）— 可粘贴版

> 用法：把下面 ```text``` 块整体复制，粘贴进**消费方项目**的 Agent 会话，把 `<项目根目录>` 换成真实路径即可。本提示词**只验证、不改动**（除非发现缺失/错误才最小补全，并先回报告知）。规范永远以 `$(lab path preflight)/README.md` 为准。

```text
对本项目已安装的「仓库不变量门禁（preflight）」做安装正确性自检，只验证、不改动（发现缺失/错配请先回报，不要擅自大改）。规范见 $(lab path preflight)/README.md §2/§3/§5 与 INSTALL.md。
项目根：<项目根目录>

【A. 文件落位核对】逐项确认存在且为仓库内文件：
- scripts/preflight.sh                      （复制自 templates/preflight.sh；A3 双格式并集若是本仓专属改动，应在此文件内、并注明出处 docs/backlogs/README.md）
- preflight.conf（若用 conf 覆盖默认值）
- .githooks/pre-commit                      （分发器，唯一形态；不得是已删除的 pre-commit-dispatcher）
- .githooks/pre-commit.d/20-preflight       （preflight 子检查片）
- .githooks/pre-commit.d/10-*                  （既有检查的子检查片：命名 10-<现有>，如 10-review-gate / 10-prospero-gates；应存在且都在跑、未焊成一份。纯 preflight 单门禁则无 10-* 亦正常）
- docs/templates/wrap-up.md
- scripts/check-wrapup.sh                   （复制自 templates/check.sh）
- 根 AGENTS.md 含一行指针：「动手前跑 scripts/preflight.sh；收尾按 docs/templates/wrap-up.md 三节填；门禁细节见 $(lab path preflight)/README.md」

【B. 门禁激活核对】
- git config core.hooksPath 应 == .githooks（本地配置，需每位新克隆者各跑一次；确认已设置）
- 分发器 .githooks/pre-commit 是 run-all 不 fail-fast（一次报全部失败，而非第一个失败即停）
- 子检查共存：review-gate(10-) 与 preflight(20-) 都进 .d/ 且都跑，未焊成一份

【C. 配置口径核对】
- RUNTIME_PATHS 覆盖所有"应忽略却曾被跟踪"的产物，且当前无残留被跟踪的运行产物（= A1 应天然干净）。〔示例为 prospero 实况：原 4 个跟踪产物已由 chore/codegraph-index-consolidate 合 main 时移除 + 补 .gitignore——各仓以 docs/transfers/<repo>.md 写死版为准〕
- DOC_BUDGETS 按实测行数定（name:行数；侦察用 wc -l，一文件一行）
- A3 双格式并集：旧形 ^## B- + 类型、新形 ^id:+^title:+^type: 两格式都应通过、且坏格式应被点名（这是本仓写在 scripts/preflight.sh 的已文档化例外，invariant #4 的已知偏离）

【D. 行为验证（最关键，fail-open 兜底）】在 <项目根目录> 实跑：
1. bash scripts/preflight.sh            # 当前应 exit 0 且全 ✅（干净基线）
2. 故意制造一个违规（最简：临时触碰一个应忽略产物 / 制造一个超预算文档 / 写一个坏 backlog），确认被点名 + exit 1；清理后 exit 0
3. 跑一次现有 review-gate 等 hook，确认未被破坏
4. bash scripts/check-wrapup.sh <某收尾报告.md>  # 三节锚标题齐全（若无可跳过，回报"未做收尾报告"）

【E. Stop hook（可选，非核心）】
- 核心 enforcement 靠 pre-commit 门禁（谁提交都跑，逐客户端零配置）；Stop hook 是各客户端（WorkBuddy/OpenCode 等）可选甜点，只贴一行 bash scripts/preflight.sh，忘装无损
- 仅回报：是否各客户端已配 Stop hook（配了记位置，没配记"无损"），不要为此去逐客户端重装

【回报格式】逐条给 ✅/❌ + 证据（命令输出片段）。任一 ❌ 给出最小修复建议。最后给一句总体判定：安装是否正确可用（含"A1 干净依赖 chore 已合 main"的时序前提是否成立）。
```

> 注：本自检与接入提示词（`CONSUMER-INSTALL.md`）解耦——接完之后单独跑一遍即可，不依赖是否按 `<repo>.md` 写死。

## 衔接：自检发现「未安装 / 损坏」怎么办
若【A】文件缺失或【D】行为验证失败（exit 1 未被门禁拦下、或干净基线都过不了），说明未正确安装，改用接入提示词重装：

```
请消费方Agent 按 ~/Documents/lab/preflight/docs/transfers/CONSUMER-INSTALL.md 给本项目接入 preflight（先只读侦察、写死参数后分期落地、最后跑第四步验收）
```

接入后**再跑一遍本自检**确认闭环。新空仓或已知消费仓，优先用写死版 `docs/transfers/<repo>.md`（若有）。
