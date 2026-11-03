# Changelog — preflight

## v1.0.6 (2026-10-17) — prospero 清单余项：A1 忽略源核对 + SELFCHECK 口径 + prospero 写死版
- **A1 增加忽略源核对**（PROBLEM-2026-10-16 #4 / P3）：忽略断言改取 `git check-ignore -v --no-index` 的匹配规则来源，源落在产物目录内部（如 `.codegraph/.gitignore` 的 `*`）即 ✗「忽略规则来自产物目录内部——仓根规则可能已缺失」。实测：仓根规则被注掉后，产物目录自带的 `*` 会悄悄顶上（-v 源变为 `.codegraph/.gitignore`、exit 0）→ 旧断言假绿；根规则在时 -v 报仓根（无锚 `.codegraph/` 与有锚 `/.codegraph/` 两形态均如此）→ 合法「根规则 + 产物自带 .gitignore」双保险形态不受影响（prospero/swoop 现况即此形态，保持绿）。
- **CONSUMER-SELFCHECK 口径修正**（#3 / P2）：§A 硬编码 `10-review-gate` 改通配描述（`10-<现有>`，如 `10-prospero-gates`；纯 preflight 单门禁无 `10-*` 亦正常）；§C 他仓 specifics（「4 个跟踪产物 / codegraph-index-consolidate」）显式标注「示例，以各仓 `<repo>.md` 写死版为准」。
- **新增 `docs/transfers/prospero.md` 写死版**（#5 / P3）：参数 2026-10-17 实测复核（RUNTIME_PATHS 五项及各自 .gitignore 规则行 / DOC_BUDGETS 对 162·37 实况 / frontmatter 形 A3 / 10-prospero-gates / CI 不动硬约束 / 无 conf 校准值在脚本顶部——重装须带回或改建 conf）。
- 同步 README §2 A1 行。**`templates/preflight.sh` 再次功能改动**：字节一致复制方需以 v1.0.6 为准重新复制（swoop 纯复制即可，校准值在 conf；prospero 须同时带回五个校准值）。

## v1.0.5 (2026-10-17) — 消费方实跑回灌：模板缺陷三修（conf/env 层级 / A1 假红 / 侦察命令）
- **修 conf 静默吞 env（假绿陷阱）**：`templates/preflight.sh` 配置层级改为 **env > preflight.conf > 内置默认**——先快照 env，再 source conf，最后 env 回压；env 与 conf/默认不同时打 `·` 留痕。旧行为：conf 排在默认值之后 source，env 必被无条件吞（`DOC_BUDGETS="AGENTS.md:100" bash preflight.sh` 照常 PASS exit 0）。根因/复现：`~/Documents/Swoop/reviews/2026-10-16-preflight-upstream-defects.md` 缺陷①。
- **修 A1 跟踪态假红**：忽略断言改 `git check-ignore --no-index -q "$p"`。`check-ignore` 默认考虑索引，已跟踪路径恒返回「未忽略」（跟踪优先于忽略）→「被跟踪」真违规连带假报「未被 .gitignore 覆盖」，修法被引向补规则（应为 `git rm --cached`）。--no-index 使两条断言解耦、各报各的真。缺陷②（Swoop 实测，修法已验证）；同根因另见 `~/Documents/lab/handoffs/PROBLEM-2026-10-16-preflight-consumer-install-feedback.md` #2（prospero 实例）。
- **修 A2 行数侦察命令**：`docs/transfers/CONSUMER-INSTALL.md` 与 `docs/transfers/README.md` 的侦察由 `awk 'END{print FILENAME": "NR}' A B`（END 只跑一次 + `NR` 跨文件累计，总数记在最后文件名头上、前行数丢失）改为 `wc -l A B`（一文件一行、无歧义），并去掉吞 open 失败的 `2>/dev/null`；`CONSUMER-SELFCHECK.md` 同步去掉 awk 表述。缺陷③；prospero P1 同根因。
- 同步：README §2 A1 行（`--no-index` 语义）、§3 安装步 2（env 覆盖层级）。`templates/preflight.sh` 为**功能改动**：字节一致复制方（Swoop / prospero 等）需重新复制并重跑验收。

## v1.0.4 (2026-10-15) — KF-4 闭合（跨模块）
- **KF-4 闭合**：review-gate 侧「须合并」口径与 preflight「统一 dispatcher」冲突。因 handoffs hub **无 review-gate lane**（其 target 仅消费项目），路由不可达 → 改走**直改 `review-gate` v1.0.5**：全模块共存口径统一为 dispatcher（`templates/` 未动；模块 hook 同时适配「单门禁独立挂载」与「dispatcher 子检查」两用）。证据：`review-gate/CHANGELOG.md` v1.0.5。
- 更新 `docs/audit-requirements.md`：KF-4 → ✅，状态汇总 **11 修 / 0 待拍板**；红线「跨模块只登记路由」补例外（lab tooling 姊妹模块无 handoff lane 时，直改 + CHANGELOG 留痕）。
- 本仓 `templates/` **无功能改动**（本版仅审计文档 + 跨模块协调留痕）。
- 审计收尾（独立复审）：修正 `docs/audit-requirements.md` §4 DoD 与 `evidence/2026-10-15/BASELINE.md`/`run.txt` 中"五件"/已删 `pre-commit-dispatcher` 的引用漂移（该文件已于 v1.0.3/KF-8 删除，门禁唯一形态即 `templates/pre-commit`；版本口径 v1.0.2→v1.0.4）。`templates/` 未改，功能不变。详见 `evidence/2026-10-15/AUDIT-INDEPENDENT-2026-10-15.md`。
- 新增 `INSTALL.md`：独立安装快速上手 + pre-commit 安装重点（分发器 / `.d/` 共存 / `core.hooksPath` / 装后验收），权威细节仍指向 `README.md` §3/§5，避免规范漂移。补「Stop hook 策略」：核心靠 pre-commit 门禁（全客户端自动覆盖、逐客户端零配置），Stop hook 仅可选甜点、各客户端一行引用仓内 `scripts/preflight.sh`，忘装无损。

## v1.0.3 (2026-10-15) — KF-8 拍板：门禁收敛为唯一形态
- **收敛门禁形态**（KF-8）：删除单独版 `templates/pre-commit`，把分发器改名为 `templates/pre-commit`——**分发器即门禁唯一形态**（run-all，`.githooks/pre-commit.d/` 下多条子检查；单门禁 = 一个子检查）。消除"两处做一件事"与其引发的口径混乱。
- 同步：README §1/§3/§5/§8、AGENTS、`docs/new-project-prompt.md`、`docs/existing-project-prompt.md`。
- 未闭环：**KF-4**（review-gate 跨模块口径，待拍板/路由）。

## v1.0.2 (2026-10-15) — 上线前审计
- 审计需求与结论：`docs/audit-requirements.md`（十轴 + KF-1…KF-11 清单 + DoD）；证据 `evidence/2026-10-15/`（BASELINE.md + run.txt）。
- **KF-5 新增 `templates/check.sh`**：机检收尾报告三节锚标题（文件/stdin 两路，exit 0/1）——把 README §4/§5「可机检、可挂 Stop hook」的声明变成真的（此前是空承诺）。
- **KF-7 修 `preflight.sh` conf 定位**：先归位 REPO_ROOT 再解析 `preflight.conf`（默认 `$REPO_ROOT/preflight.conf`），从子目录调用也能命中仓根 conf。
- **KF-9 修 A2 健壮性**：坏 `DOC_BUDGETS`（缺冒号/预算非数字）显式点名，不再触发 bash "integer expression expected"。
- **KF-11（新发现）修非 git 目录**：提前告警、git 调用静音，不再逐条 `fatal:` 刷屏。
- **KF-1/2/3** 统一「hook 共存」口径为 dispatcher：清掉 `templates/pre-commit` 头与两套接入 prompt 里的「合并/并入」旧措辞。
- **KF-10** 显式声明 fail-open 为既定立场（README §7 + AGENTS 红线）：缺件告警放行、但装完必跑验收。
- 未闭环（**待拍板**）：**KF-4** 跨模块口径（review-gate 仍主张合并）；**KF-8** 单独 `pre-commit` vs dispatcher 形态取舍。

## v1.0.1 (2026-10-15)
- **新增共存形态**（拍板 遗留①）：`templates/pre-commit-dispatcher`（按序编排 `.githooks/pre-commit.d/*`、run-all 聚合退出码）+ `templates/pre-commit.d/20-preflight`（子检查片）。与 review-gate 等共存时不再"合并/焊脚本"，改用分发器（行业标准：git 只允许一个 pre-commit → 必然用 dispatcher；默认 run-all 而非 fail-fast）。
- README §1/§3/§5/§8、AGENTS 红线与验证同步更新：共存走 dispatcher，禁焊死。
- `docs/transfers/README.md`（拍板 遗留②）：明确**按需（JIT）生成**，补「按需侦察清单」让生成变便宜。

## v1.0.0 (2026-10-15)
- 从 `agent-patterns/shift-left-for-agents.md` 设计文档抽离机件，成立通用模块 `~/Documents/lab/preflight/`。
- 提供 `templates/`：`preflight.sh`（A1 运行产物 + A2 文档预算 + A3 backlog 格式 + A4 工作树态，变量化）、`pre-commit`（未过即阻断）、`wrap-up.md`（强制三节）。
- 提供 `docs/`：新项目 / 现有项目接入提示词 + `docs/transfers/` 分仓位。
- 方法（5 根因 / 三分法 / 三档判定 / D1–D7 / 社区证据）落到 `playbook/docs/18-shift-left.md`；本仓只装机件。
- 定位：与 `review-gate` 互补（review-gate 管代码新发现，本仓管仓库不变量）。
