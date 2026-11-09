# v2.22.0 下游消费方升级执行包（D1–D5 监听可观测性 / 防抢跑）

> 上游 lab 侧产出 · 2026-11-09 · 引用：`$(lab path handoffs)/docs/consumer-upgrade-v2.22.0.md`
> 本文是 6 份 `*-20261109-01-breaking.md` 迁移交接的取证附件，**不替代交接、不改变其 5 条判据**。

## 0. 一句话结论

**下游零文件改动。** 引擎已发布，接入桩 sha 仍 `1d843498` 无需重刷；下游唯一要做的是按交接的 5 条判据逐条终端实测，然后写回执。

## 1. 发布事实

| 项 | 值 |
|---|---|
| 引擎版本 | v2.22.0 |
| 提交 | `506e77e`（D1–D4）/ `413a65b`（D5） |
| 推送 | `ba23ea5..413a65b main -> main`，origin/main 已同步、工作树 clean |
| 独立双盲审计 | `audit-20261109-02-task` 7/7 判据通过，回执已 `baton deliver` |
| 桩 sha | `1d843498`（本轮未动 `STUB_BODY`） |

## 2. 判据 2 / 3 的精确化（防下游误改桩）

**判据 2**：全仓检索 `--daemon` 必然命中接入桩的固定说明行：

    执行 `baton forward <ID> --wait`（…；AI 客户端宿主进程树托管；人类终端可用 `--daemon` 脱钩；…）

该行属 `STUB_BODY`，**严禁修改**。理由：① D1 拦的是 Agent 宿主下的非 TTY 环境（RC=3 + stderr「后台任务」），`人类终端可用 --daemon` 在真实 TTY 下依旧成立，措辞没有过时；② 改它会让桩 sha 漂移，触发 6 仓 × 3 载体全量重刷，与「无需重刷」自相矛盾。

真正要找的是**脚本 / 自动化里实际调用 `--daemon`** 的位置，实测 6 仓均为 0 处（§3）。若确有调用，改走宿主后台任务 `baton wait <id>`，或显式 `BATON_MANAGED_MODE=0` 脱钩。

**判据 3**：Tappy 侧「`reject` 前手工清回执 `delivered_at`」是 verdict-r2 §五 记载的**人工绕行动作**，不是落地脚本或文档。全仓检索 `delivered_at` 为 0 命中 → 该判据标 **N/A**，附上检索命令与 0 命中输出即可，**不要为「删除」而凭空造文件**。D5 起由引擎 `cmdReject` 自动清印并落 `rejected_at`，工单稳态保持 `forwarded`。

## 3. 逐仓只读实测（上游发起方，2026-11-09）

| 仓 | `baton link --check` | AGENTS 桩 sha | 桩外 `--daemon` | `delivered_at` |
|---|---|---|---|---|
| iggle | RC=0 · == v2.22.0 | `1d843498` | 0 | 0 |
| Swoop | RC=0 · == v2.22.0 | `1d843498` | 0 | 0 |
| Prospero | RC=0 · == v2.22.0 | `1d843498` | 0 | 0 |
| WarmTag | RC=0 · == v2.22.0 | `1d843498` | 0 | 0 |
| OWSEL | RC=0 · == v2.22.0 | `1d843498` | 0 | 0 |
| AutoOperations | RC=0 · == v2.22.0 | `1d843498` | 0 | 0 |
| TappyOperations | RC=0（无桩，跳过桩版本判定） | — | 0 | 0 |

- 三载体 `AGENTS.md` / `CLAUDE.md` / `README.md` 逐仓同一 sha；全局载体 `~/.claude/CLAUDE.md`、`~/.config/opencode/AGENTS.md` 此前已核验。
- 7 仓根目录均未发现 `.handoff-hub.json` / `.handoffs/.handoff-hub.json`；收件统一命中上游跨仓 Hub（`units/handoffs`）。因此交接「残留风险 1」（v2.22.0 起 intra-repo 默认 `TARGETS` 为空）对这 7 仓**不成立**——它们不是 intra-repo 子 Hub，无需补 `targets`。
- **无需人工转递的实证**：在 Swoop 仓内跑 `baton status --for swoop`，`SWOOP-20261109-01-breaking` 直接列在「待 swoop 处理」；`git status --porcelain` 前后均为 0，下游仓零写入。

## 4. 一键自检脚本（下游在本仓根目录执行 · 纯只读）

```bash
echo "[1/5] 引擎与桩版本"
baton link --check; echo "  link_rc=$?"

echo "[2/5] 桩外 --daemon 实际调用（应无输出）"
grep -rn --include='*.md' --include='*.sh' --include='*.mjs' \
  --include='*.js' --include='*.ts' -- '--daemon' . \
  --exclude-dir=.git --exclude-dir=node_modules \
  --exclude-dir=dist --exclude-dir=target 2>/dev/null \
  | grep -v 'baton forward <ID> --wait' || echo "  0 处 → 判据 2 N/A"

echo "[3/5] reject 前清 delivered_at 的绕行（应无输出）"
grep -rn --include='*.md' --include='*.sh' --include='*.mjs' \
  'delivered_at' . --exclude-dir=.git --exclude-dir=node_modules 2>/dev/null \
  || echo "  0 处 → 判据 3 N/A"

echo "[4/5] 本方收件状态"
T=swoop   # ← 改成你的 target：tappy / swoop / prospero / iggle / coreml / yiqiyihuihua
baton status --for "$T" | head -12

echo "[5/5] 合规自检"
baton check; echo "  check_rc=$?"
```

`--include` 限流是必要的：无限制全仓 grep 在含 `node_modules` / 构建产物的仓里会被系统资源限制中断（本次实测 SIGTERM）。

## 5. 三个非 target 消费方知会（WarmTag / OWSEL / AutoOperations）

这三仓**不在跨仓 Hub 的 6 个 target 中**，`baton status --for <target>` 看不到本批交接，因此不产出系统交接（不造系统看不见的假交接）。升级状态同 §0：桩已最新 v2.22.0 / `1d843498`，`link --check` RC=0，**本轮零文件改动**。

行为变更同样适用：Agent 宿主非 TTY 下 `--daemon` 硬拦 RC=3；`reject` 前手工清 `delivered_at` 的绕行作废；`status` 新增监听列与空转告警；**Audit Nonce 门禁勿依赖（F1）**。若希望纳入回执通道，需由上游在 `units/handoffs/.handoff-hub.json` 注册 target（属上游动作）。

可直接贴给三仓 Agent 的知会行：

```text
请收 WarmTag 升级知会：~/Documents/lab/units/handoffs/docs/consumer-upgrade-v2.22.0.md（v2.22.0 已发布，本仓零文件改动，跑 §4 自检即可）
请收 OWSEL 升级知会：~/Documents/lab/units/handoffs/docs/consumer-upgrade-v2.22.0.md（v2.22.0 已发布，本仓零文件改动，跑 §4 自检即可）
请收 AutoOperations 升级知会：~/Documents/lab/units/handoffs/docs/consumer-upgrade-v2.22.0.md（v2.22.0 已发布，本仓零文件改动，跑 §4 自检即可）
```

## 6. 口径与不变式

- **F1（如实告知 · 待发起方裁决 · 不阻塞发布）**：契约与接入桩宣传的「Audit Nonce 防自签」在 v2.22.0 引擎**未实现**——`forward --blind` 不签发 challenge，不带或带伪造 `--audit-nonce` 提交回执均 RC=0，`cmdReceipt` 不解析该参数。**勿在自动化里依赖该门禁**；实际生效的防自签是 `HANDOFF_LANE` 身份核验（未声明时仅 warn 不阻断）。属既存契约虚设，非 D1–D5 引入的倒退。
- 不变式：消费方经 `$(lab path handoffs)` 动态引用引擎，行为变更不需改桩；**桩 sha 不变即证明无载体漂移**。
- 残留风险（不阻塞）：`reject` / `deliver` 门禁失败仍 RC=0（自动化勿只看退出码，须显式核验状态变化）；`cmdReject` 驳回记录可能追加到文件尾部（纯排版）。

## 7. 谁接手

| 角色 | 动作 |
|---|---|
| 6 个 target 的下游 Agent | 冷启动 `baton status --for <target>` 收件 → 5 条判据逐条终端实测 → 写 `receipts/<ID>-resp.md` → `baton deliver`。**执行方不 accept / reject** |
| 上游 lab 侧发起方 | 聚合探针 `baton wait … --all`（pid 27041）在回执到齐后自动唤醒，做独立验收与闭环 |
| 用户 | **无需转递任何提示词**；系统状态本身就是交接 |

外链：审计全记录 `lab/.handoffs/reviews/audit-20261109-02-task-evidence.md`；审计回执 `lab/.handoffs/receipts/audit-20261109-02-task-resp.md`；第 2 轮判定 `lab/.handoffs/reviews/impl-20261109-01-task-verdict-r2.md`；契约唯一事实源 `$(lab path handoffs)/README.md` v2.22.0 + `CHANGELOG.md`。
