# preflight 上线前审计需求（Audit Requirements）

> **目的**：在**消费方安装前**，对 preflight 模块做一轮全面审计，清零所有**已知问题**并穷尽可发现的缺陷。
> **性质**：一次性 **上线门禁（release gate）**，非常驻流程。审计通过 = 模块可对外分发。
> **判据**：`prove, don't claim`（playbook 11 证据章）——每条结论附可复现命令与输出，落持久证据目录。
> **独立上下文**：执行审计者**必须**是与模块作者不同的上下文（同模型自审有约 64.5% 盲区）。禁止"同一个 Agent 再看一遍"充当审计。

---

## 0. 审计对象与边界

**对象**：`~/Documents/lab/preflight/` 全量——`README.md` / `AGENTS.md` / `VERSION.md` / `CHANGELOG.md` / `templates/*`（`preflight.sh`、`pre-commit`（分发器）、`pre-commit.d/20-preflight`、`wrap-up.md`、`check.sh`）/ `docs/*`（新/现有项目提示词、`transfers/README.md`）。

**范围外**（发现即**登记路由**，不在本审计直接改）：
- 具体消费仓的接入实现（属各仓接入任务）。
- `review-gate` 本体的缺陷——但**跨模块一致性问题必须在本审计定案**（见轴 C），改 review-gate 走 backlog/handoff。

**前提事实**（审计须据此判负载与成熟度）：
- 模块的"已验证"目前只存在于**临时目录**，未落持久证据仓；**无 CI**。
- 假设负载：**一个维护者 + N 个消费仓 Agent**；按"上线前一次性门禁"判，不按高并发判。

---

## 1. 审计轴（每轴必须给出结论：`通过` / `发现→<id>` / `不适用+理由`）

| 轴 | 问题 | 关注点 |
|---|---|---|
| **A 可运行性 & 正确性** | 脚本真能跑、退出码对、边缘不炸 | 空仓 / 非 git 目录 / 路径含空格 / 从子目录调用 / `.codegraph/` 不存在 / backlog 目录缺失 |
| **B 内部一致性** | 文档↔模板↔提示词互不矛盾 | 同一件事（如 hook 共存）在 README/模板头/两套 prompt 里说法一致吗 |
| **C 跨模块一致性** | 与 review-gate 的 pre-commit 故事自洽 | 两模块给的共存指令能否**同时**执行而不打架 |
| **D 契约可核验性** | "可机检"的声明有对应工具吗 | "三节存在性可机检"——机检器在哪 |
| **E 可移植性** | bash 3.2(macOS 默认)/zsh/Linux/sh | `set -uo pipefail`、`wc -l`、`tr`、`grep -E/-F`、`$PWD` 语义 |
| **F 失败模式** | fail-open vs fail-closed 是否恰当且显式 | 脚本缺失/hook 缺配置时放行是否会被误当"已装上" |
| **G 安全** | hook 执行面 | 探针是否只读、无网络、无 exec、无写业务；模板分发完整性 |
| **H 文档准确性** | 安装步骤与实物一致、无占位符残留、编号连续 | 两条安装路径（单独/共存）是否都能照做 |
| **I 精简（YAGNI）** | 是否存在应合并/删除的件 | 重复形态、投机性检查项（只保留"对应过真实事故"的） |
| **J 证据** | "已验证"是否可复现、持久化 | 修复是否带"修复前失败→修复后通过"对照 |

---

## 2. 已知问题清单（**上线最低必清零**）

> 落地时逐条：`修复`（附对照证据）/ `路由`（backlog / handoff / 待人类拍板）。以下为起草时已核实的**存量矛盾**。

| ID | 轴 | 问题 | 证据（file:line） | 处置结果 |
|---|---|---|---|---|
| **KF-1** | B | `templates/pre-commit` 头注释仍写「与 review-gate …**合并**」，与 v1.0.1「用 dispatcher、禁焊死」矛盾 | `templates/pre-commit:10` | ✅ 已修（指向 dispatcher） |
| **KF-2** | B | `new-project-prompt.md` 仍写「已挂 review-gate 的 hook，**合并**，不要覆盖」 | `docs/new-project-prompt.md:15` | ✅ 已修 |
| **KF-3** | B | `existing-project-prompt.md` 仍写「**并入**现有 pre-commit」 | `docs/existing-project-prompt.md:16` | ✅ 已修 |
| **KF-4** | C | review-gate 侧仍主张「已有 3 hook **须合并**」，与 preflight 新故事打架 | `review-gate/templates/pre-commit` 头; `review-gate/CHANGELOG.md` v1.0.4 | ✅ 已修（跨模块，**直改 `review-gate` v1.0.5**：全模块 coexist 口径改 dispatcher；`templates/` 未动。handoffs hub **无 review-gate lane** → 路由不可达，故直改 + CHANGELOG 留痕） |
| **KF-5** | D | 多处声称三节「可**机检**」，但无对应工具 | `README.md:56`; `templates/wrap-up.md:1` | ✅ 已修（新增 `templates/check.sh`，claim 变真） |
| **KF-6** | J | 无持久证据目录 | `CHANGELOG.md` v1.0.1 | ✅ 已修（`evidence/2026-10-15/`） |
| **KF-7** | A/E | `CONF=$PWD/preflight.conf` 早于 `cd REPO_ROOT` 求值 → 子目录调用找不到仓根 conf | `templates/preflight.sh:22` | ✅ 已修（先归位，默认 `$REPO_ROOT/preflight.conf`） |
| **KF-8** | I | 单独 `pre-commit` 与 dispatcher 两形态并存（双路径=两处做一件事，且是 KF-1~3 混乱之源） | `templates/pre-commit`; `pre-commit-dispatcher` | ✅ 已修（**拍板**：只留 dispatcher——`templates/pre-commit` 即分发器，删单独版） |
| **KF-9** | A | 坏 `DOC_BUDGETS`（无冒号/非数字）触发 bash "integer expression expected" | `templates/preflight.sh:49-52` | ✅ 已修（显式点名坏格式） |
| **KF-10** | F | 脚本/hook 缺失一律静默放行（fail-open），未区分"未装"与"装坏" | `templates/pre-commit:17`; `pre-commit-dispatcher` | ✅ 已修（README §7/AGENTS 显式声明为既定立场 + 强制装后验收） |
| **KF-11** | A | （审计中新发现）非 git 目录运行 → `git fatal:` 逐条刷屏 | `templates/preflight.sh` A1/A4 | ✅ 已修（提前告警 + git 调用静音） |

> 状态汇总：**11 修 / 0 待拍板**。证据：`evidence/2026-10-15/`（BASELINE.md + run.txt）；KF-4 跨模块修复见 `review-gate/CHANGELOG.md` v1.0.5。

---

## 3. 未知发现法（穷尽）

1. **按轴扫（§1）**：每轴独立取证，A/E/G 需真机 + 多环境；B/C/H 用 `grep` 交叉比对全部文案。
2. **端到端复现**（必做）：在 scratch 仓（一次性 `mktemp -d`）**逐字照抄**两套 prompt 跑通：
   - 新项目路径；
   - 现有项目路径，**且预置 review-gate 的 hook**（复现 KF-4 的真实共存冲突）。
   验收点：能装、能阻（制造违规 exit 1）、能过（清理后 exit 0）、现有 review-gate hook 不被破坏。
3. **精简扫描**：套 `ponytail-audit` 的六类（bug/risk/scale/test/speed/lean），重点 lean——点名 dead config、投机检查项、重复形态。
4. **语义复核独立化**：结论由**独立上下文/跨模型**复审，不复用作者推理。

---

## 4. 验收标准（Definition of Done）

- [x] §1 **十轴**全部有结论（通过/发现/不适用+理由），无"没看"。（E 轴：Linux/git-bash 未实机 → 记为未测，见证据 BASELINE §未测）
- [x] §2 **KF-1…KF-11** 全部清零（11 修；KF-4 跨模块直改 `review-gate` v1.0.5）。
- [x] §3.2 端到端：clean/违规/坏预算/非 git/子目录 conf 五场景实测通过；dispatcher 一过一败 run-all 通过。
- [x] **无残留矛盾声明**：`grep -rn "合并\|并入\|不要覆盖" preflight/` 不再命中 hook 共存语境。
- [x] **证据落盘**：`evidence/2026-10-15/`（BASELINE.md + run.txt）。
- [x] bump `VERSION.md`(v1.0.4) + `CHANGELOG.md`；`bash -n` 四件全绿（`pre-commit-dispatcher` 已于 v1.0.3/KF-8 删除，门禁唯一形态即 `templates/pre-commit`）。
- [ ] 收尾三节回报（见本次交付）。

> ~~待拍板一项（KF-4）~~ 已拍板落地（dispatcher 口径，直改 `review-gate` v1.0.5，见其 CHANGELOG）。

---

## 5. 交付物

1. **审计报告**（按轴组织，每轴结论 + 证据链接）。
2. **已知问题闭环表**（KF-* → 修复 commit / 路由 id）。
3. **`evidence/<date>/`** 证据目录（含基线）。
4. **更新后的模块**（VERSION / CHANGELOG / 模板 / 文案）。
5. 三节形状的收尾回报。

---

## 6. 方法与约束（红线）

- **独立上下文执行**（subagent / 跨模型）；作者不得自审即交付。
- **最小修复**：优先删/合并而非加层。跨模块问题**优先登记路由**（handoff）；但 lab tooling 姊妹模块（如 review-gate）**无 handoff lane** 时，允许**直接最小改 + CHANGELOG 留痕**（KF-4 即此路径 → `review-gate` v1.0.5）。
- **不改诚实边界**（README §7）、**不为过审软化措辞**、**不给门禁塞语义判断**。
- 不新增依赖；不改消费仓业务代码。
- 待拍板项（如 KF-8 形态取舍）**列给人类**，不擅自定案。

---

## 7. 参考

- 方法：`playbook/docs/18-shift-left.md`（本次模块的由来）、`11-evidence.md`（证据纪律）、`12-gates.md`（门禁）
- 姊妹模块：`review-gate/`（其 `CHANGELOG.md` v1.0.2/v1.0.3/v1.0.4 是同类 bug 的真实史）
- 审计技能：`ponytail-audit`（六类轴 + 最小修复原则）
- 路由出口：`backlog/`（跨仓缺口/handoff）、`handoffs/`
