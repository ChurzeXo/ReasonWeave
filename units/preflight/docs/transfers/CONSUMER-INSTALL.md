# 消费方接入提示词（preflight）— 可粘贴版

> 用法：把下面 ```text``` 块整体复制，粘贴进**消费方项目**的 Agent 会话，把 `<项目根目录>` 换成真实路径即可。规范细节永远以 `/Users/churze/Documents/lab/preflight/README.md` 为准。
> 说明：本文件是「接入提示词骨架」。模块 `docs/transfers/README.md` 要求按各仓实况写死参数（JIT，不猜）；若已知消费仓，请据此跑侦察后改名 `<repo>.md` 写死。本骨架已把侦察步骤内嵌，消费方 Agent 会先实跑再填值。

```text
给本项目接入「仓库不变量门禁」（preflight），不推倒重来。规范与模板在 /Users/churze/Documents/lab/preflight/（先读 README.md §2/§3/§5）。
项目根：<项目根目录>

【第一步 · 只读侦察，先别写】在 <项目根目录> 跑这段，把真实输出贴回给我（禁止猜）：
git ls-files | grep -E '\.codegraph/|leads\.db|\.db$'   # A1：哪些"应忽略"产物已被跟踪（最优先止血项）
ls -d .codegraph build dist 2>/dev/null                  # 运行产物目录
wc -l AGENTS.md CLAUDE.md                           # A2：根文档实际行数 → 定预算（一文件一行；勿用 awk 'END{...NR}'，NR 跨文件累计会记错）
ls docs/backlogs/*.md 2>/dev/null | head; sed -n '1,30p' docs/backlogs/*.md 2>/dev/null  # A3：backlog 目录 + 格式
cat .githooks/pre-commit 2>/dev/null; ls .githooks/ 2>/dev/null  # §3/§5：是否已有 pre-commit / 需 dispatcher 共存
git config core.hooksPath                                # 当前 hooks 挂法

【第二步 · 写死参数，发我确认】把侦察到的真实值填进这些字段回我，不要留占位符：
- RUNTIME_PATHS（应忽略产物；标注哪些已被跟踪需先止血）
- DOC_BUDGETS（按上面实测行数定，格式 name:行数，如 AGENTS.md:200）
- BACKLOG_DIR / BACKLOG_HEAD / BACKLOG_TYPE
- 现有 hook 接入点（是否已有 pre-commit；统一走 pre-commit 分发器 + .githooks/pre-commit.d/，不焊脚本；若已有 review-gate 等钩子，它放 10-review-gate，preflight 放 20-preflight，两类都跑、互不覆盖）
- 硬约束（只本地 commit 不 push / 不碰业务代码 / CI 不动 等）

【第三步 · 确认后分期落地】
1. 先止血：把已被跟踪的运行产物从索引移除并补 .gitignore（单独一次提交，附 diff 人审）。
2. 复制 /Users/churze/Documents/lab/preflight/templates/preflight.sh → scripts/preflight.sh，按上面 DOC_BUDGETS / RUNTIME_PATHS 校准默认值（或建 preflight.conf 覆盖）。
3. 门禁共存：复制 templates/pre-commit → .githooks/pre-commit（分发器，唯一形态）；复制 templates/pre-commit.d/20-preflight → .githooks/pre-commit.d/20-preflight；现有检查移入 .githooks/pre-commit.d/10-<现有>。随后 git config core.hooksPath .githooks。
4. 复制 templates/wrap-up.md → docs/templates/wrap-up.md；复制 templates/check.sh → scripts/check-wrapup.sh；根 AGENTS.md 加指针一句：「动手前跑 scripts/preflight.sh；收尾按 docs/templates/wrap-up.md 三节填；门禁细节见 ~/Documents/lab/preflight/README.md」。
5. 若宿主支持 Stop hook，把 scripts/preflight.sh 挂到回合结束前（未过则逼继续），见 README §5。CI（如成熟）：把 scripts/preflight.sh 作为一步，未绿不许合并。

【第四步 · 验收（必做，fail-open 立场下的硬兜底）】
- 现有 hook 未被破坏（单跑仍正常）。
- bash scripts/preflight.sh 在当前仓能跑出 ✅/❌ 并 exit 0/1。
- 故意制造一个违规（未忽略产物 / 超预算文档 / 坏 backlog），确认被点名且 exit 1；清理后 exit 0。
- 收尾报告过 bash scripts/check-wrapup.sh <report.md>（三节锚标题齐全）。
完成后回报差距清单闭合情况 + preflight 结果 + 三节形状。
```

> 注：若消费方是**全新空仓**（无任何 hook/CI），改用 `/Users/churze/Documents/lab/preflight/docs/new-project-prompt.md` 的接入流程（无「先止血 / 共存」步骤）。
