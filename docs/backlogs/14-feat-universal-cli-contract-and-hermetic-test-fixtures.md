---
id: 14
title: feat(all-units): 全 CLI 物理契约对称治理、测试沙箱隔离与环境探针防御性加固
type: bugfix
priority: critical
status: closed
owner: lab/bin + lab/orphan + lab/spec-guard + lab/review-gate + lab/handoffs + lab/worktree
dep_on: '13'
handoff_ref: 'ADR-0013'
created: 2026-11-22
updated: 2026-11-22
completed: 2026-11-22
---

- **要做什么**：
  依据 ADR-0013 架构决议，闭环修复两批下游消费方（WorkBuddy 及独立终端）报告的 5 项缺陷，并建立彻底根治防线：
  1. **Phase 1: CLI 入口版本单一事实源（SSOT）与参数对称接线**
     - `units/orphan/bin/lab-orphan.mjs`：动态从 `VERSION.md` 提取版本号（v1.4.2），修复 help banner 硬编码 v1.0.0 漂移，接线 `--version` / `-v`；
     - `units/spec-guard/bin/spec-guard.mjs`：动态提取版本号（v2.2.1），修复 help banner 硬编码 v2.0.0，接线 `--version` / `-v`；
     - `units/worktree/worktree.mjs`：动态读取 `VERSION.md`（v0.1.0），更新 banner 并接线 `--version` / `-v`；
     - `units/review-gate/clean-runner.mjs`：动态读取 `VERSION.md`（v1.2.2），更新 banner 并接线 `--version` / `-v`；
     - `bin/lab.mjs`：读取 `package.json`（v1.3.1），新增 `lab --version` 支持并更新 Banner。
  2. **Phase 2: review-gate 原生与降级扫描产物 Schema 同构对齐**
     - `units/review-gate/templates/scan.sh`：在 OpenGrep 原生模式下自动对输出 JSON 注入 `engine: "opengrep"` 与 `fallback: false`，加固目录作为 `$OUT` 时的路径解析；
     - `units/review-gate/tests/scan.test.mjs`：双向核验原生与降级扫描输出的结构化字段，升至 v1.2.2。
  3. **Phase 3: lab doctor 探针防御性分流与长耗时感知**
     - 细分错误状态（物理文件缺失 vs 进程超时 vs PATH 未包含），不再盲目吞没异常；
     - 候选目录自动补全（`~/.local/bin`、`/opt/homebrew/bin` 等）；
     - 校验 Node.js `>=18` SemVer，增补内部 CLI 完备性自检。
  4. **Phase 4: 单测沙箱隔离与工单 ID 提取健壮性**
     - `units/handoffs/tests/tool-profile.test.mjs`：引入 `createTestRepo()` 在 `os.tmpdir()` 创建独立沙箱 Hub 夹具与 Git 仓，并在 `finally` 阶段可靠清场；
     - 废弃容易产生贪婪截断的松散正则（`[a-f0-9\-]+` 会误吃 `audit-...` 的首字母 `a`），统一采用强类型 `extractTicketId()`。
  5. **Phase 5: 全 CLI 契约常驻物理测试门禁**
     - 新增 `tests/cli-contract.test.mjs`，全量断言所有 CLI 的 `--version` / `-v` / `--help` / `-h` 以及跨目录调用能力，挂入 `npm test`。

- **触发背景与依据**：
  - 消费方 1 (WorkBuddy @ Tappy) 审计反馈：`orphan banner 漂移`、`spec-guard --version 报错`、`review-gate 缺 engine`、`lab doctor 误报未安装`；
  - 消费方 2 运行反馈：`tool-profile.test.mjs 缺少 Hub 夹具与正则过宽把 a 当成 ID`；
  - 核心 ADR 决议：`group/architecture/adr/0013-universal-cli-contract-hermetic-testing-and-defensive-probes.md` (Accepted / 🔒Frozen)。

- **验收判据（DoD）**：
  - [x] 所有 CLI 入口支持 `--version` / `-v` / `--help` / `-h` 且 Exit 0；
  - [x] 帮助 Banner 版本无任何硬编码字面量，全量对齐各自 `VERSION.md`；
  - [x] `scan.sh` 在 OpenGrep 原生模式下输出含 `engine: "opengrep"` 与 `fallback: false`；
  - [x] `lab doctor` 在非标准 PATH 及自解压长耗时环境下准确判定 OpenGrep 已就绪，无假阴性；
  - [x] `tool-profile.test.mjs` 在外部任意目录独立运行 2/2 通过；
  - [x] 新增 `tests/cli-contract.test.mjs` 门禁用例 18/18 全绿；
  - [x] 全仓 `npm test` 100% 通过，已推送到远程。
