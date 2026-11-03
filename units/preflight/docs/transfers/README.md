# docs/transfers — 分仓定制提示词

本目录放**已按各仓实况写死参数**的接入提示词，接收方 Agent 零猜测、拿来即转递。
格式与节奏对齐 `~/Documents/lab/review-gate/docs/transfers/`。

命名：`<repo>.md`（如 `iggle.md` / `prospero.md` / `swoop.md` / `yiqiyihuihua.md`）。

每份应写死：
- 项目根路径
- 运行产物路径（`RUNTIME_PATHS`）—— 含"已被跟踪需先止血"的现状标注
- 文档预算（`DOC_BUDGETS`）
- backlog 目录与条目格式（`BACKLOG_DIR` / `BACKLOG_HEAD` / `BACKLOG_TYPE`）
- 与现有 hook 的接入点（是否已有 pre-commit；统一走 `pre-commit` 分发器 + `.githooks/pre-commit.d/`，不焊脚本）
- 硬约束（只本地 commit 不 push / 不碰业务代码 / CI 不动 等）

> **节奏：按需（JIT）生成，不预写。** 分仓位的全部价值是"已核对实况写死参数、接收方零猜测"；盲写 = 猜 = 制造漂移（违反 playbook §8 与 18 章「靠 git 不靠内省」）。接入某仓时才生成那一份；若确需一次分发多仓，先做一轮**只读侦察**再逐仓写死。

## 按需侦察清单（生成 `<repo>.md` 前逐项实跑核对）

```bash
# 在目标仓根跑：
git ls-files | grep -E '\.codegraph/|leads\.db|\.db$'   # A1：哪些"应忽略"产物其实已被跟踪（需先止血）
ls -d .codegraph build dist 2>/dev/null                  # 运行产物目录
wc -l AGENTS.md CLAUDE.md                           # A2：根文档实际行数 → 定预算（一文件一行；勿用 awk 'END{...NR}'，NR 跨文件累计会记错）
ls docs/backlogs/*.md 2>/dev/null | head; sed -n '1,30p' docs/backlogs/*.md 2>/dev/null  # A3：backlog 目录 + 标题/类型格式
cat .githooks/pre-commit 2>/dev/null; ls .githooks/ 2>/dev/null  # §3/§5：是否已有 pre-commit、是否需 dispatcher 共存
git config core.hooksPath                                # 当前 hooks 挂法
```

把上面**真实输出**填进下方字段写死，再交付。

## 每份应写死

- 项目根路径
- 运行产物路径（`RUNTIME_PATHS`）—— 含"已被跟踪需先止血"的现状标注
- 文档预算（`DOC_BUDGETS`）—— 按侦察出的实际行数定
- backlog 目录与条目格式（`BACKLOG_DIR` / `BACKLOG_HEAD` / `BACKLOG_TYPE`）
- 与现有 hook 的接入点（是否已有 pre-commit；统一走 `pre-commit` 分发器 + `.githooks/pre-commit.d/`，不焊脚本）
- 硬约束（只本地 commit 不 push / 不碰业务代码 / CI 不动 等）
