# preflight — 仓库不变量探针 + 提交门禁 + 收尾回报形状

> 本目录是「Agent 收尾才暴露问题」失效模式的**机件单一事实源**，独立于任何具体项目。
> **方法（为什么）**：见 `~/Documents/lab/playbook/docs/18-shift-left.md` 与本仓 §0。
> **同范式模块**：`~/Documents/lab/review-gate/`（代码新发现）、`backlog/`、`handoffs/`。
> **接入方式**：项目只按 `docs/*.md` 的提示词接入，**不要**把本 README 规范复制到项目仓库（防漂移）。

## 0. 这是什么 / 为什么独立

Agent 总在任务**收尾**才暴露"新问题"，用户感觉"每次做完都还有一件事"。根因不是粗心，是四件事没对齐：
Done 定义错位、结论未验就上报、不变量无单一事实源、发现只有属地没有出口。

**解法不是"更小心"，是机器化**：把反复要人记住的约束落成**可跑命令 + 可机检的产出形状**。
本模块只装**机器能判定的那部分**（git 跟踪态、文档预算、backlog 格式、工作树态）；语义判断（"这条算不算真问题""分类对不对"）**机器做不了**，交给回报形状（§4）与独立上下文复核。

**为什么独立于 review-gate**：review-gate 管「代码里的新发现」（SAST + review），本模块管「仓库层面的不变量」，二者互补不重叠；各自一关注点一仓。

## 1. 架构（探针 + 门禁 + 形状）

| 件 | 是什么 | 角色 |
|---|---|---|
| **`templates/preflight.sh`** | 一条命令报出当前不变量态，exit 0/1 | **事实源**：动手前必跑 |
| **`templates/pre-commit`** | 门禁分发器：按序跑 `.githooks/pre-commit.d/*`、聚合退出码（单/多门禁同一形态） | **篱笆**：hooks are law（§5） |
| **`templates/pre-commit.d/20-preflight`** | preflight 子检查片（丢进 `.githooks/pre-commit.d/`） | 子检查片 |
| **`templates/wrap-up.md`** | 收尾回报强制三节 | **形状**：存在性可机检 |
| **`templates/check.sh`** | 检查报告是否含三节锚标题 | **形状门禁**：把 §4 的"可机检"变成真的 |

## 2. 检查项（按仓校准）

`preflight.sh` 默认四项，全部变量化，按各仓不变量替换：

| 项 | 断言 | 阻断 |
|---|---|---|
| **A1 运行产物** | 应忽略路径既被 `check-ignore --no-index`（忽略断言不看索引、匹配规则源不得在产物目录内）、又未被 `git ls-files` 跟踪（如 `.codegraph/`、`leads.db`）| 是 |
| **A2 文档预算** | 常驻根文档不超行数预算（如 `AGENTS.md:150`）| 是 |
| **A3 backlog 格式** | 每条 backlog 有既定标题与类型标记（如 `## B-` + `类型`）| 是 |
| **A4 工作树** | `git status --porcelain` 逐行列出（供人工分类路由）| 否（信息项）|

每个新仓按自己的不变量加断言；只有**机械可判定 + 静默违反代价高**两条同时满足的才进脚本，语义判断留给回报形状与人工。

## 3. 安装（per-repo）

1. 复制 `templates/preflight.sh` → 项目 `scripts/preflight.sh`（或根）。
2. 改顶部默认值，或新建 `preflight.conf` 覆盖（`RUNTIME_PATHS=".codegraph/ build/"` 等）；临时调试也可用 env 覆盖（层级：**env > conf > 内置默认**，env 与 conf 冲突时探针会留痕，不再静默吞掉）。
3. 装门禁（`mkdir -p .githooks/pre-commit.d`）：复制 `templates/pre-commit` → `.githooks/pre-commit`（分发器，**唯一形态**）；复制 `templates/pre-commit.d/20-preflight` → `.githooks/pre-commit.d/20-preflight`。已有 review-gate 等钩子时，把它们的子检查放进同一 `pre-commit.d/`（数字前缀定序，如 `10-review-gate`）——**不要**把逻辑焊成一份脚本。
4. `git config core.hooksPath .githooks`（per-repo local，不污染全局；新克隆需重跑）。
5. 复制 `templates/wrap-up.md` → 项目 `docs/templates/wrap-up.md`，收尾报告照此三节填；复制 `templates/check.sh` → 项目 `scripts/check-wrapup.sh`（收尾自检形状），可挂到宿主 Stop hook（见 §5）。
6. 根 `AGENTS.md` 加一句指令（见 §8）。

## 4. 收尾回报形状（强制三节，可机检）

```
## 变动分类    每条非请求发现三选一：我引入→已修 | 既有→backlog <id> | 已豁免→出处
## 不变量触点  逐共享面：面名 + 是/否 + 理由
## 遗留与路由  每项一个主（backlog id / handoff id / 待人类拍板行），或「无」
```

**为什么是形状而非思考**：填空这个动作本身迫使命题思考，且存在性**真的可机检**——`templates/check.sh <report.md>` 断言三个锚标题存在（类比 handoff check 硬校验锚节）。
**三分法关键**：第三类「已豁免」（有显式出处、非问题）必须存在——否则两份法会把"有出处的非问题"反复当新发现上报，正是"永远做不完"里那件不存在的事。

## 5. 门禁接入（hooks are law）

Prompt 里写"记得验证"是**请求**；hook 里跑 preflight 才是**法律**（模型无投票权）。

- **pre-commit（本模块）**：`templates/pre-commit` 是**分发器**，按序跑 `.githooks/pre-commit.d/*` 并聚合退出码；`20-preflight` 片调用 `preflight.sh`，未过 `exit 1` 阻断。
- **为什么是分发器而非单一脚本**：git 只允许一个 pre-commit → 共存必然要编排；且 **run-all 不 fail-fast**（一次报出全部失败，别在门禁层重造"修一个撞下一个"的循环），子检查各自独立、可单跑调试——改一个不会误伤另一个（review-gate CHANGELOG v1.0.2/v1.0.3 的 bug 正来自手改焊死的 hook）。单门禁 = `.d/` 里只放一个子检查。
- **Agent Stop hook（按宿主）**：Agent 想结束回合时跑同一脚本，未过则逼它继续（Claude Code：`Stop` hook，block 判决带 reason）。宿主各异，见各仓 AGENTS.md。
- **CI**：把 `preflight.sh` 作为一步，未绿不许合并（成熟项目升级档）。

## 6. 三档判定（心智模型，先别写死进脚本）

按**波及面**分档，不按 diff 大小（改一行 `.gitignore` 的爆炸半径远大于新增一个独立文件）：

| 档 | 触发 | 动作 |
|---|---|---|
| **T0 跳过** | 只碰新文件 / 纯内容，不与共享面相交 | 直接做，一句话 diff |
| **T1 轻扫** | 改已跟踪的既有文件 | 跑廉价探针（`git status` / `ls-files` / `wc -l`）|
| **T2 全扫** | 触共享不变量面（`.gitignore` / `.gitattributes` / hooks / 分支与文件布局 / 带预算根文档 / 跨仓契约）| 全 `preflight` + 逐面点名 + 封闭核验清单 |

## 7. 诚实边界（必读）

- **只覆盖机械可判定项**：语义判断（分类对不对、"算不算真问题"）脚本做不了——由回报形状 + 独立上下文/跨模型复核补，不指望本模块。
- **门禁是回归篱笆不是零违规墙**：它保证"当前不变量态不退化"，不保证"没有新问题"。
- **自纠盲区**：同模型自审有约 64.5% 盲区（对外部错误能纠、对自己同样的错看不见），故语义复核**必须独立上下文 / 跨模型**，不能"同一个 Agent 再看一遍"。
- **缺件即放行（fail-open）是既定立场**（与 review-gate 一致）：脚本/hook/配置缺失时告警**不阻断**，绝不因"没装好"卡住开发。代价是"看起来装了、其实没生效"——故装完**必跑验收**（制造一次违规，确认被点名且 exit 1）。
- **门禁层自身要受审**：改 `preflight.sh` / `pre-commit` 时按核心代码对待（曾有人把门禁改得比被保护代码更随意）。
- **维护成本**：断言需随仓演化；只保留"对应过真实事故"的检查项，其余第一次 review 就删。

## 8. 模板与分发（不要复制规范回项目）

- `templates/preflight.sh`、`templates/pre-commit`（分发器）+ `templates/pre-commit.d/20-preflight`（子检查）、`templates/wrap-up.md`、`templates/check.sh` —— 项目复制并按注释放项目自己的不变量。
- `docs/new-project-prompt.md` —— 粘贴进**新项目** Agent 会话的接入提示词。
- `docs/existing-project-prompt.md` —— 粘贴进**现有项目**（可能已有 hook / CI）的接入提示词。
- `docs/transfers/<repo>.md` —— 分仓定制提示词（按各仓实况写死参数），拿来即转递。
- 项目只按 prompt 接入；规范细节永远以本 README 为准，项目里只放指针 + 一句指令。
- 根指令一句示例：「动手前跑 `scripts/preflight.sh`；收尾回报按 `docs/templates/wrap-up.md` 三节填；门禁按 `~/Documents/lab/preflight/README.md` 接入。」

## 9. 参考

- 方法：`~/Documents/lab/playbook/docs/18-shift-left.md`
- 同范式模块：`~/Documents/lab/review-gate/`（代码新发现）、`backlog/`、`handoffs/`
- 社区依据：Google presubmit/global presubmit；"Prompts are requests, hooks are law"；Self-Correction Blind Spot（64.5%）；"Looping Is Not Reliability"（自报 29.5% 风险 → 可见 gate 2.4%）；游玩 §9 未列 URL，详见 18 章出处。
