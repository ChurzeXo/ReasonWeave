# 安装 preflight（per-repo）

> **权威细节见 `README.md` §3 / §5。** 本文件是**快速上手 + pre-commit 安装重点**，给消费者或新接手者一条可照做的线。
> 消费者接入请改用 `docs/new-project-prompt.md`（新仓）或 `docs/existing-project-prompt.md`（现有仓，含 review-gate 共存），或 `docs/transfers/<repo>.md`（已按实况写死参数）。

## 前置
- 一个 git 仓库（preflight 的不变量检查 A1/A4 依赖 git）。
- bash（macOS 自带 3.2+；Linux / git-bash 走纯 POSIX 构造，未全量实机，建议首装时冒烟一遍）。

## 步骤（每仓一次）

1. **探针**：复制 `templates/preflight.sh` → 项目 `scripts/preflight.sh`（或根）。按本仓不变量改顶部默认值，或新建 `preflight.conf` 覆盖：
   `RUNTIME_PATHS` / `DOC_BUDGETS` / `BACKLOG_DIR` / `BACKLOG_HEAD` / `BACKLOG_TYPE`。
2. **门禁（pre-commit，重点见下）**。
3. **形状**：复制 `templates/wrap-up.md` → `docs/templates/wrap-up.md`；复制 `templates/check.sh` → `scripts/check-wrapup.sh`（收尾自检三节形状，可挂 Stop hook）。
4. **指针**：根 `AGENTS.md` 加一句：「动手前跑 `scripts/preflight.sh`；收尾按 `docs/templates/wrap-up.md` 三节填；门禁按 `~/Documents/lab/preflight/README.md` 接入。」

## pre-commit 安装（重点）

preflight 的门禁是 **git pre-commit 分发器**，不是单一脚本：

```bash
mkdir -p .githooks/pre-commit.d
cp templates/pre-commit              .githooks/pre-commit            # 分发器（唯一形态）
cp templates/pre-commit.d/20-preflight .githooks/pre-commit.d/20-preflight
git config core.hooksPath .githooks   # per-repo local，不污染全局
```

要点：
- `templates/pre-commit` 是**分发器**：按序跑 `.githooks/pre-commit.d/*` 并聚合退出码，**run-all 不 fail-fast**（一次报出全部失败）。
- `20-preflight` 是 preflight 子检查片，未过 `exit 1` 阻断提交。
- **共存**：若已有 review-gate 等钩子，把它们的子检查也放进 `.githooks/pre-commit.d/`，数字前缀定序（如 `10-review-gate`），preflight 用 `20-`；**不要**把逻辑焊成一份脚本。
- `git config core.hooksPath` 是**本地**配置、不随仓库提交：**每位新克隆者需各跑一次**才能激活门禁。
- 任一子检查缺失 `.d/` 时 fail-open（告警不阻断）。

## 装后必跑验收（fail-open 兜底）

> 缺件即放行是既定立场，故装完**必须**验证"真生效"，否则会出现"看起来装了、其实没生效"：

```bash
bash scripts/preflight.sh                 # 应能跑出 ✅/❌ 并 exit 0/1
bash scripts/check-wrapup.sh <report.md>  # 三节锚标题齐全
```

- **故意制造一个违规**（未忽略产物 / 超预算文档 / 坏 backlog），确认被点名且 `exit 1`；清理后 `exit 0`。
- 现有 hook 未被破坏（单跑仍正常）。

## Stop hook 策略（可选，别把它当核心门禁）

**核心 enforcement 靠 pre-commit 门禁，不是 Stop hook。** pre-commit 门禁在 `.githooks/`、随 clone 传播、由 git 执行——WorkBuddy / OpenCode / 终端 `git commit` / CI **同一份逻辑、谁提交都跑**，逐客户端零配置。这才是"法律"。

Stop hook 是**客户端原生能力**（WorkBuddy / OpenCode / Claude Code 各自存于自己的设置，无统一位置），属于**回合内**的加强：Agent 想收工时先过 preflight，不过逼继续。它是**可选增强**，且对你的 agentic 流程大多**冗余**——Agent 通常同回合内提交，pre-commit 拦下提交即已迫使其继续。

**建议（三层）**
1. 强制 enforcement 锚定 pre-commit 门禁（硬性要求、逐客户端零配置）。
2. Stop hook 降级为可选辅助，且做成**一行共享脚本引用**：各客户端配置就一句话 `bash scripts/preflight.sh`，逻辑全在仓库脚本、无重复无写偏。不支持 / 不装也**无损**——门禁已兜底。
3. 文档写一次放仓库：在仓根 `AGENTS.md` 加一句「可选 Stop hook：若客户端支持，加命令 `bash scripts/preflight.sh`，未过逼继续；各客户端配置位置不同，逻辑已在仓库脚本，无需各端重写」。随 clone 到手，永不被忘。

> 一句话：核心靠 pre-commit 门禁（全客户端自动覆盖）；Stop hook 是甜点，想要时各客户端贴一行 `bash scripts/preflight.sh`，忘装也不影响正确性。详见 `README.md` §5。

## 升级 / 改门禁

- 改 `preflight.sh` / `pre-commit` 时按核心代码对待（门禁层自身要受审）。
- 语法自检：`bash -n templates/preflight.sh templates/pre-commit templates/pre-commit.d/20-preflight templates/check.sh`。
- 改完同跑上方「装后验收」。
