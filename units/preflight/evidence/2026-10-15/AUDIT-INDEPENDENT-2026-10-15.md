# preflight 独立复审报告 — 2026-10-15

> **立场**：本次为**独立上下文复审**（非模块作者），依据 `docs/audit-requirements.md` §1 十轴 + §2 KF 清单执行。
> **方法**：不采信既有 `run.txt` / `BASELINE.md` 结论，全部**真机重跑**（`/tmp/audit_harness.sh`，证据 `run-independent.txt`）；跨模块 KF-4 直接读 `review-gate/` 源码与 CHANGELOG 复核。
> **判据**：`prove, don't claim` —— 每条结论附可复现命令与输出。
> **对象版本**：v1.0.4（原轮 KF 11/11 已闭环）。

---

## 1. 十轴结论（A–J）

| 轴 | 结论 | 证据 | 说明 |
|---|---|---|---|
| **A 可运行性&正确性** | ✅ 通过 | `run-independent.txt` §[A]/§[A1]/§[KF-9]/§[KF-7]/§[KF-11] | clean/跟踪产物/坏预算/非git/子目录conf 五场景 exit 码均正确 |
| **B 内部一致性** | ✅ 通过 | grep `合并\|并入\|不要覆盖` in `preflight/` | 仅命中 dispatcher 正确措辞（"不要焊成一份脚本"=新口径）；两套 prompt + README + AGENTS hook 共存口径统一。无残留矛盾（证实 DoD §4 行80） |
| **C 跨模块一致性** | ✅ 通过 | `review-gate/CHANGELOG.md` v1.0.5 + 其 README/AGENTS/两套 prompt | KF-4 真闭环：review-gate 全模块改 dispatcher；残留"合并"仅在 `.semgrepignore` 配置合并（legit）与 CHANGELOG v1.0.4 历史描述 |
| **D 契约可核验性** | ✅ 通过 | `run-independent.txt` §[KF-5] | `check.sh` 真实机检三节锚标题（file/stdin 两路，exit 0/1），README §4/§5 声明有对应工具 |
| **E 可移植性** | ✅ 通过（Linux/git-bash 未测，诚实标注） | `run-independent.txt` SYNTAX | `set -uo pipefail`（无 `-e`）、`wc -l\|tr -d ' '`、`grep -E/-F`、`case` POSIX、`$PWD`；无 bashism。非 git 模式一处行为见 F-3（非缺陷） |
| **F 失败模式** | ✅ 通过 | `run-independent.txt` §[dispatcher]、README §7、AGENTS 红线 | fail-open 为既定立场且显式声明；dispatcher 缺失 `.d/`→exit0 告警；子检查 fail→整链 exit1（fail-closed 聚合） |
| **G 安全** | ✅ 通过 | 模板源码审阅 | 探针只读（无网络/无写业务/无 exec 外部输入）；dispatcher 仅 `bash` 仓内受控 `.d/*` 钩子（与任意 git hook 同信任边界）；`check.sh` 仅 mktemp 捕获 stdin 并清理 |
| **H 文档准确性** | ⚠️ 发现→**F-1/F-2** | `run.txt:6`、`BASELINE.md:11`、`audit-requirements.md:82` | 安装两路径自洽可照做；但证据/需求文档引用**已删**的 `pre-commit-dispatcher` 且写"五件"（实为 4 件） |
| **I 精简（YAGNI）** | ✅ 通过 | 模板 + docs 审阅 | 两 prompt 受众不同合理；`transfers/` JIT；`check.sh` 必需；无 dead config、无投机检查项（A1–A4 均对应真实事故） |
| **J 证据** | ⚠️ 部分→**F-1** | `run.txt`/`BASELINE.md` vs 现状 | 原证据持久化但含已删文件引用，今日重跑原命令会 `No such file`→不可复现；本次新增 `run-independent.txt` 修复 |

---

## 2. 已知问题闭环表（KF-1…KF-11，独立复核）

| ID | 轴 | 原声明 | 独立复核结果 | 证据 |
|---|---|---|---|---|
| KF-1 | B | `pre-commit` 头"合并"→dispatcher | ✅ 已修 | grep 仅命中 dispatcher 措辞 |
| KF-2 | B | new-project-prompt "合并"→dispatcher | ✅ 已修 | `docs/new-project-prompt.md:15` 现"不要焊成一份脚本" |
| KF-3 | B | existing-project-prompt "并入"→dispatcher | ✅ 已修 | `docs/existing-project-prompt.md:16` 现"不要焊死" |
| KF-4 | C | review-gate "须合并"→跨模块改 dispatcher v1.0.5 | ✅ 已修（独立读 review-gate 证实） | `review-gate/CHANGELOG.md:4`；其 README/AGENTS/两套 prompt 均 dispatcher |
| KF-5 | D | 三节"可机检"无工具→新增 `check.sh` | ✅ 已修 | `run-independent.txt` §[KF-5] 三态全过 |
| KF-6 | J | 无持久证据目录→`evidence/2026-10-15/` | ✅ 已修 | 本目录存在（含本次新增） |
| KF-7 | A/E | `$PWD` 早求值→子目录找不到仓根 conf | ✅ 已修 | `run-independent.txt` §[KF-7] 子目录命中仓根 conf |
| KF-8 | I | 双形态并存→只留 dispatcher | ✅ 已修 | `pre-commit-dispatcher` 已删（`SYNTAX` 节确认）；`pre-commit` 即唯一形态 |
| KF-9 | A | 坏 DOC_BUDGETS→"integer expression expected" | ✅ 已修 | `run-independent.txt` §[KF-9] 无冒号+非数字两态均显式点名+exit1 |
| KF-10 | F | 缺件静默放行未区分"未装/装坏" | ✅ 已修 | README §7 + AGENTS 红线显式声明；dispatcher 缺失 `.d/` 告警放行 |
| KF-11 | A | 非 git 目录 `git fatal` 刷屏 | ✅ 已修 | `run-independent.txt` §[KF-11] 告警+0 行 fatal+exit1 |

**结论**：原轮 KF-1…KF-11 **11/11 独立复核仍然成立**，无回退。

---

## 3. 新发现（独立上下文盲区捕获）

> 以下为原轮（作者自审）未捕获、独立复审新发现。均属**文档/证据漂移**，非模块功能缺陷；模块 `templates/` 功能正确，不建议改动。

### F-1 （轴 H/B，中低）— 证据与需求文档引用已删文件、写"五件"
- `evidence/2026-10-15/run.txt:6` — `OK  pre-commit-dispatcher`（该文件已于 v1.0.3 删除）
- `evidence/2026-10-15/BASELINE.md:11` — `bash -n` 循环仍含 `pre-commit-dispatcher`
- `docs/audit-requirements.md:82` — "bash -n **五件**全绿"（实为 **4 件**：`preflight.sh`/`pre-commit`/`pre-commit.d/20-preflight`/`check.sh`）
- 对照：`AGENTS.md:29-33` 验证节已正确列 **4 件** → 模块自身内部不一致。
- **影响**：今日重跑原 `run.txt` 命令会对 `pre-commit-dispatcher` 报 `No such file`，违反本模块自身"prove, don't claim / 可复现"纪律。
- **最小修复**：`run.txt`/`BASELINE.md` 标注"pre-commit-dispatcher 已于 v1.0.3 删除，本行仅历史"；`audit-requirements.md:82` "五件"→"四件"。

### F-2 （轴 H，低）— 版本口径漂移
- `docs/audit-requirements.md:82` — "bump `VERSION.md`(v1.0.2)"
- `evidence/2026-10-15/BASELINE.md:3` — "对象 v1.0.1 → v1.0.2"
- 实际终点 **v1.0.4**（KF-8→v1.0.3、KF-4→v1.0.4）。DoD 文本写于 v1.0.2 阶段，未随进程更新。
- **影响**：文档陈旧，非功能缺陷。建议 DoD 版本号同步为 v1.0.4。

### F-3 （轴 E/A，低，观察非缺陷）— 非 git 模式 A1 按构造必 FAIL
- 非 git 目录下 `git check-ignore` 失败 → `ignored=no` → 对每条 `RUNTIME_PATHS` 标 `bad`，即便只是"不在仓内"也红。
- KF-11 已刻意允许非 git 模式继续跑并 exit 1，README §7 已告警"结果可能不准"——属已知权衡。
- **可选修复**：README §7 补一句"非 git 模式下 A1 按构造必 FAIL（无法判定忽略态），仅作探针冒烟；装前必在 git 仓内验收"。

---

## 4. 跨模块一致性（轴 C / KF-4）独立复核

直接读取 `review-gate/`（非凭本仓 CHANGELOG 转述）：
- `review-gate/CHANGELOG.md:4` v1.0.5 明确"放弃「合并/焊入既有 hook」旧措辞，全模块改用 dispatcher 模式"。
- `review-gate/README.md:44,93`、`AGENTS.md:17`、`docs/new-project-prompt.md:25`、`docs/existing-project-prompt.md:20` 均改"不要合并/焊入，改用 dispatcher"，并指向 `~/Documents/lab/preflight/templates/pre-commit` 编排器。
- `review-gate/templates/` 未改，靠"单门禁独立挂载 / dispatcher 子检查"双用法适配；独立验证该双用法在 preflight dispatcher 下调 `bash .d/10-review-gate` 可正常运行（cwd 已归位 REPO_ROOT，子检查内 `git rev-parse` 成功）。
- **残留"合并"命中**：仅 `review-gate/docs/existing-project-prompt.md:17` 的 **`.semgrepignore` 配置合并**（legit，非 hook 合并）+ `CHANGELOG.md` v1.0.4 历史描述。无 live hook 共存矛盾。
- **判定**：KF-4 真实闭环，轴 C 通过。

---

## 5. DoD 复核（独立视角）

| DoD 项 | 状态 | 备注 |
|---|---|---|
| §1 十轴全有结论 | ✅ | A–J 全结论（H/J 标 F-1） |
| §2 KF-1…11 清零 | ✅ | 独立复核 11/11 仍成立 |
| §3.2 五场景+dispatcher run-all | ✅ | 独立重跑 13/13 通过（`run-independent.txt`） |
| 无残留矛盾声明 | ✅（preflight/ 内） | 证据/需求文档自身有 drift（F-1） |
| 证据落盘 | ✅ | 新增 `run-independent.txt`；原 BASELINE/run.txt 含 stale 引用（F-1） |
| bump VERSION/CHANGELOG + bash -n 五件 | ⚠️ | VERSION=1.0.4✅、CHANGELOG✅；"五件"应改"四件"（F-1） |
| 收尾三节回报 | ✅ | 见本报告 §7 |

---

## 6. 处置建议（最小修复，守红线）

- **不改** `templates/`（功能正确，已独立验证）、**不软化**诚实边界、**不塞**语义判断。
- **F-1/F-2**：仅文档/证据准确度修正（"五件"→"四件"、版本号口径、标注已删文件）。属诚实边界内的提升，建议应用。
- **F-3**：可选 README §7 一句话澄清。
- 跨模块 review-gate 侧无需再动（KF-4 已闭环）。

---

## 7. 收尾回报（三节形状，待 `check.sh` 机检）

## 变动分类
- 我引入 → 已修：新增 `evidence/2026-10-15/run-independent.txt`（独立上下文重跑 13/13 通过）；本复审报告。
- 既有 → backlog：F-1/F-2/F-3 为文档/证据漂移，建议最小修正（非功能缺陷，未改 `templates/`）。
- 已豁免 → 出处：非 git 模式 A1 必 FAIL（F-3）为 KF-11 既定权衡，README §7 已声明，豁免。

## 不变量触点
- 探针/门禁/形状三条腿：是（A/D/G 验证完整）。
- 文档↔模板↔提示词一致性：是（B 通过）；证据/需求文档自身 drift 见 F-1（非模块不变量）。
- 跨模块（review-gate）共存：是（C/KF-4 独立复核通过）。
- fail-open 立场：是（F 通过，README §7 + AGENTS 红线显式）。
- 可移植性不变量：是（E 通过，Linux/git-bash 未测已诚实标注）。

## 遗留与路由
- F-1（证据/需求"五件"→"四件" + 已删文件标注）→ backlog `preflight-doc-drift`（建议作者应用，非阻断）。
- F-2（版本口径 v1.0.2→v1.0.4）→ 并入 F-1 同批修正。
- F-3（非 git A1 必 FAIL 澄清）→ 可选，README §7 一句话。
- 无跨仓 handoff（本模块自审闭环，仅文档准确度事项）。

---

## 8. 修正应用记录（F-1/F-2 已应用）
- `docs/audit-requirements.md` §4 DoD：`bash -n 五件`→`四件`、`bump VERSION(v1.0.2)`→`(v1.0.4)`。
- `evidence/2026-10-15/BASELINE.md`：复现命令去已删文件名 + 版本口径标注；"`bash -n` 五件"→"四件"。
- `evidence/2026-10-15/run.txt`：加历史标注（第 6 行 `pre-commit-dispatcher` 为删除前输出）。
- `CHANGELOG.md` v1.0.4：补审计收尾修正留痕。
- 未改 `templates/`、未 bump VERSION（无功能改动）；诚实边界与红线未软化。
- 三节形状未受影响（`check.sh` 仍 PASS）。
