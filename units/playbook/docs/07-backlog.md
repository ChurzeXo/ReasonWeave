# 07 — Backlog 捕获（接线规约）

> **规范真相源已独立**：待办捕获的通用规范（捕获契约 / 记录规则 / 存储格式 / 依赖方铁律 / 回顾节奏）见 [`~/Documents/lab/backlog/README.md`](../../backlog/README.md)。
> **实现（skill）**：`~/Documents/Skill/backlog-capture/`（已 symlink 至 `~/.workbuddy/skills`、`~/.agents/skills`、`~/.claude/skills`）。
> 本手册**只保留 AEF 特有的「接线」**——即 backlog 与 CR / handoff / ADR / spec-kit 的路由边界。

## AEF 接线规则（铁律）

### 路由边界（什么进 backlog，什么不进）

| 场景 | 去向 |
|---|---|
| **进行中的需求变更**（验收标准/方案要改） | [16-change-control.md](16-change-control.md) 的 CR 流程，**不是 backlog** |
| 跨仓 / 依赖方要改 | [10-handoff.md](10-handoff.md) |
| 架构级决策 | [05-adr.md](05-adr.md)（规范见 `~/Documents/lab/adr/`） |
| 本次 feature 未完成的任务 | `/speckit.converge` 回写的 `tasks.md` |
| 产品需求本身 | `group/product/requirements.md` |
| **其它一切「以后再说」** | `docs/backlogs/`（格式见独立模块） |

**三分法（[18 章](18-shift-left.md) §6）**：收尾时每条"非请求发现"三选一——**既有**（继承债务）→ 入 backlog 给 id；**我引入**（本次产生）→ 当场修或写明为何不修；**已豁免**（有显式出处、非问题，如 handoff 存量体积经 check 标"提示"）→ **标出处，不是待办，不入 backlog**。归属**靠 git 不靠内省**（`git diff HEAD` / `status` / `log`）。二分法会把"有出处的非问题"反复当新发现上报。

**区分口诀**：这条东西影响**当前正在做的 feature** → 16 章 CR；不影响当前范围、纯粹「以后再说」 → backlog。变更被 16 章 Step 3 决策为「延后」时，才从 CR 转成本章条目（标 `来源: CR-NNN`）。

### 落地动作（AEF 视角）

1. 接入 skill（`~/Documents/Skill/backlog-capture/`）或按独立模块格式手写。
2. 在根 AGENTS.md 写一句：「识别到越界/待拍板/未来功能时，按 `~/Documents/lab/backlog/README.md` 规范记入 `docs/backlogs/`，不打断、不丢弃。」
3. 在 [12-gates.md](12-gates.md) 收尾门禁加一条：「本次任务发现的越界事项已入 backlog？」

> AEF 原文对应章节：§18 Incremental Change（小改动不重建）、§17 Failure Recovery（待拍板项不阻塞当前执行）、§32 Traceability。
