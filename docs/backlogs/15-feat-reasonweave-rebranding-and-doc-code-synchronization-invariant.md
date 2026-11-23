---
id: 15
title: feat(global): 全局生态更名为 ReasonWeave、权威主远端重定位与文档规约联动防漂移门禁
type: feature
priority: critical
status: closed
owner: global / bin + tests + docs + units/handoffs
dep_on: '14'
handoff_ref: 'ADR-0014'
created: 2026-11-22
updated: 2026-11-22
completed: 2026-11-22
---

- **要做什么**：
  根据 ADR-0014 架构决策与人类架构师授权，完成能力库从 `lab-agent-toolkit` 到 `ReasonWeave` 的全局更名，确立单一权威远端，建立文档规约联动防漂移静态测试门禁，并全自动同步本地消费方：
  1. **Phase 1: 包名更名与 CLI 入口对称扩充**
     - `package.json`：正式更名为 `"name": "reasonweave"`；
     - `bin` 字段：新增 `"reasonweave": "./bin/lab.mjs"` 与 `"rw": "./bin/lab.mjs"`，同时保留 `lab`、`baton` 等原有命令别名；
     - `bin/lab.mjs`：升级帮助 Banner、`doctor` 标题与 `--version` 输出为 `reasonweave v1.3.1`。
  2. **Phase 2: 全套文档与契约统一为 ReasonWeave**
     - 同步更新 `README.md`、`INSTALL.md`、`使用说明.md`、`constitution.md`、`AGENTS.md`、`group/contracts/npm-packaging.md`；
     - 更新 `docs/CONSUMER-PROMPTS.md` 场景五与场景八的提示词与说明；
     - 在 `units/orphan/templates/wiring/pre-commit-node.sh.template` 中支持优先检测 `node_modules/reasonweave/`。
  3. **Phase 3: 确立文档与规约联动对齐律与静态测试门禁**
     - 在 `AGENTS.md` 的 `## Agent Guidelines` 中固化「文档与规约联动对齐律（Doc-Code Synchronization Invariant）」，建立清晰的四大变更触发矩阵；
     - 在 `tests/cli-contract.test.mjs` 中新增「文档与规约联动对账门禁」自动化测试套件，机械断言 `INSTALL.md`、`README.md`、`使用说明.md`、`docs/CONSUMER-PROMPTS.md` 必须与 `package.json` 及各 Unit `VERSION.md` 100% 保持一致。
  4. **Phase 4: 切换 Git 权威主远端与本地消费方全量批处理同步**
     - 将当前仓库的 `origin` 远端重定向至 `https://github.com/ChurzeXo/ReasonWeave.git`，旧仓重命名为 `legacy-lab` 并停止推送；
     - 运行 `scripts/sync-all-consumers.mjs`，为本地全部 12 个消费方仓库（Lighthouse, Tappy, Tappy-laya-lora-dev, agent-baton, artemis, 一期一卉花, AutoOperations, OWSEL, Prospero, Swoop, WarmTag, iggle）批量刷新接入桩至 `v2.38.1`（sha: `efc4fb85`）。

- **触发背景与依据**：
  - 品牌认知统一：人类架构师要求废弃 `lab-agent-toolkit`，全面以 `ReasonWeave` 为权威标准；
  - 规约防漂移痛点：杜绝代码与 Unit 升级后文档残留历史版本字面量，导致消费方 Agent 读到过期提示词并在 `baton doctor` 中产生虚假报警；
  - 核心 ADR 决议：`group/architecture/adr/0014-reasonweave-rebranding-and-doc-code-synchronization-invariant.md` (Accepted / 🔒Frozen)。

- **验收判据（DoD）**：
  - [x] `package.json` 名称为 `reasonweave`，`reasonweave` 与 `rw` 命令全局可用；
  - [x] 所有历史命令（`lab`, `baton` 等）100% 保持向后兼容；
  - [x] `git remote` 中 `origin` 严格指向 `https://github.com/ChurzeXo/ReasonWeave.git`；
  - [x] 全套核心文档与提示词统一更名为 ReasonWeave；
  - [x] `tests/cli-contract.test.mjs` 包含版本与文档静态对账门禁，用例 27/27 全绿；
  - [x] `scripts/sync-all-consumers.mjs` 成功同步本地 12 个消费方，接入桩均对齐 `v2.38.1`；
  - [x] 全仓 `npm test` 100% 通过，已推送到 `origin/main`。
