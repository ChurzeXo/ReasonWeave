<!-- adr-template v1.0 · tier: frozen · source: ~/Documents/lab/adr/ -->

# ADR-0014: 全局工程生态更名为 ReasonWeave、主权威源迁移与文档规约联动防漂移律 (ReasonWeave Rebranding, Primary Remote Transition & Doc-Code Synchronization Invariant)

- **状态（Status）**：Accepted (🔒Frozen)
- **生效日期**：2026-11-22
- **决策人**：churze + Antigravity (arch) (AEF 架构委员会)
- **关联证据**：
  - 远端仓库权威对齐：`https://github.com/ChurzeXo/ReasonWeave.git` (origin)
  - 消费方批量平滑迁移：[scripts/sync-all-consumers.mjs](file:///Users/churze/Documents/lab/scripts/sync-all-consumers.mjs) (覆盖 12 个本地业务仓)
  - 核心对账物理测试：[tests/cli-contract.test.mjs](file:///Users/churze/Documents/lab/tests/cli-contract.test.mjs) (`describe('文档与规约联动对账门禁')`)
  - 提交留痕：`0bf4616` (更名与别名接线)、`67db738` (文档联动对齐律与测试门禁)
- **涉及 Unit**：`global` / `bin/lab.mjs` / `package.json` / `AGENTS.md` / `INSTALL.md` / `使用说明.md` / `docs/CONSUMER-PROMPTS.md` / `tests`
- **关联契约**：
  - [`0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md`](0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md) (ADR-0009 · 垂直切片与反假接线)
  - [`0013-universal-cli-contract-hermetic-testing-and-defensive-probes.md`](0013-universal-cli-contract-hermetic-testing-and-defensive-probes.md) (ADR-0013 · 全 CLI 物理契约对齐与沙箱隔离)

---

## 1. Context（背景与问题）

在 AEF Toolkit 持续演进并深度服务下游多端消费方（如 Tappy、Swoop、iggle、Prospero、Lighthouse 等 12 个项目）的过程中，出现了两项深层次治理诉求：

1. **项目品牌认知分裂与多远端冗余（Branding Inconsistency & Remote Split）**：
   - 仓库最初命名为 `lab-agent-toolkit`（或本地简称 `lab`），而在开源分发与多机协同中同时存在 `ReasonWeave` 远端；
   - 团队在维护时需要向两个远端并发推送（`origin` 与 `reasonweave`），且不同下游消费方的配置与文档中称呼不一，增加了理解和协同成本；
   - 人类架构师明确裁决：**全面以 `ReasonWeave` 为唯一权威基准，废弃 `lab-agent-toolkit`**。

2. **文档规约滞后与版本虚假漂移（Doc-Code Synchronization Deficit）**：
   - 在多轮快速 Bugfix 与特性演进中，代码与 Unit 版本已提升至最新（如 Baton `v2.38.1`、spec-guard `v2.2.1`、orphan `v1.4.2`、review-gate `v1.2.2`、主包 `1.3.1`），但 `INSTALL.md`、`使用说明.md` 与 `docs/CONSUMER-PROMPTS.md` 中偶尔残留历史旧版本字面量（如 `v2.36.0`、旧 SHA `4c82924b`）；
   - 这导致消费方 Agent 读到过期的升级提示词，在执行 `baton doctor` 自动化校验时产生虚假报警（False Positive Drift Alarm）；
   - 依从宪法 T1（*Hooks are Law, Prompts are Requests*），靠自然语言自觉提示 Agent “记得改文档”注定会断裂，必须建立机器可检验的物理静态门禁。

---

## 2. Decision（核心架构决策）

```
┌────────────────────────────────────────────────────────────────────────┐
│               AEF ADR-0014 ReasonWeave Rebranding & Anti-Drift        │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. 品牌与 NPM 包名统一          │ package.json 统一命名为 reasonweave    │
│    (Package Identity SSOT)     │ 保留 lab/baton，增设 reasonweave & rw │
├────────────────────────────────┼───────────────────────────────────────┤
│ 2. Git 权威主远端重定位         │ origin 锁定 ReasonWeave.git            │
│    (Origin Remote Migration)   │ 旧 lab-agent-toolkit 标记 legacy 归档  │
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. 文档与规约联动触发律         │ AGENTS.md 确立四大联动判定场景         │
│    (Doc-Code Invariant)        │ 动版本必动文档，纯内部重构禁动外部文档 │
├────────────────────────────────┼───────────────────────────────────────┤
│ 4. 防漂移常驻静态测试门禁      │ tests/cli-contract.test.mjs 机械对账  │
│    (Anti-Drift Test Gate)      │ 校验 INSTALL/README/说明/提示词版本一致│
├────────────────────────────────┼───────────────────────────────────────┤
│ 5. 消费方全网平滑批处理同步    │ scripts/sync-all-consumers.mjs         │
│    (Consumer Batch Migration)  │ 自动更新 12 个本地消费仓接入桩至最新版 │
└────────────────────────────────┴───────────────────────────────────────┘
```

### 2.1 包名更名与 CLI 别名对称接线（Zero-Disruption Aliasing）
- `package.json` 中的 `"name"` 由 `lab-agent-toolkit` 正式更名为 **`reasonweave`**；
- `bin` 导出增补 **`reasonweave`** 与短别名 **`rw`**（指向 `bin/lab.mjs`），同时完整保留 `lab`、`baton`、`agent-baton`、`handoff`、`baton-worktree`、`baton-audit-runner`、`lab-orphan`、`spec-guard`、`drift-gate`、`adr-init`，实现 100% 向后兼容无损平滑过渡；
- `bin/lab.mjs` 中的帮助 Banner、`--version` 输出（`reasonweave v1.3.1`）以及 `doctor` 环境体检标题全面同步升级为 ReasonWeave。

### 2.2 Git 权威主远端重定向
- 本地工作区的 `origin` 远端 URL 严格重定向为：`https://github.com/ChurzeXo/ReasonWeave.git`；
- 原 `origin` (`https://github.com/ChurzeXo/lab-agent-toolkit.git`) 重命名为 `legacy-lab`，作为历史归档镜像，停止日常推送；
- 本地 `main` 分支 upstream 显式锁定为 `origin/main`。

### 2.3 文档与规约联动对齐律（Doc-Code Synchronization Invariant）
在 [AGENTS.md](file:///Users/churze/Documents/lab/AGENTS.md) 写入常驻行为铁律，确立提交前必查的四大触发判定树：
1. **动版本 / Unit / 接入桩**：必联动对应 `VERSION.md`、`CHANGELOG.md`，运行 `baton install` 幂等刷新全载体（`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`README.md`），同步对齐 `INSTALL.md`、`使用说明.md`、`README.md` 与 `docs/CONSUMER-PROMPTS.md` 预期版本字面量；
2. **动 CLI 入口 / 参数 / 退出码**：必联动 `INSTALL.md`（CLI 矩阵与前置体检）、`使用说明.md`（命令速查与用法实战）、`README.md` 及 `tests/cli-contract.test.mjs` 门禁；
3. **动架构决策 / 研发纪律 / 门禁防线**：必立项 ADR，提炼核心不可违背铁律注入 `AGENTS.md` / `CLAUDE.md` 的 `## Agent Guidelines`，并在 `units/playbook/docs/` 沉淀对应方法论；
4. **纯内部实现重构（外部契约、版本号与 CLI 未变）**：仅更新 Unit 内部 `CHANGELOG.md` 与测试用例，**严禁**随意篡改全局安装与使用文档制造无意义噪音。

### 2.4 全自动防漂移静态测试门禁（Anti-Drift Static Gate）
在 [tests/cli-contract.test.mjs](file:///Users/churze/Documents/lab/tests/cli-contract.test.mjs) 中植入静态对账断言套件：
- 机械断言 `INSTALL.md` 快照表包含 `package.json` 当前版本与所有 Unit 的当前真实版本；
- 机械断言 `README.md` 与 `使用说明.md` 包含当前 Baton 核心版本；
- 机械断言 `docs/CONSUMER-PROMPTS.md` 包含当前 Baton 契约版本；
- 任何一处文档版本滞后，`npm test` 与 `node --test tests/*.test.mjs` 立即红灯阻断（Exit 1）。

### 2.5 消费方批量迁移与全网一致性维护
- 通过 `scripts/sync-all-consumers.mjs` 批量自动扫描本地所有开发目录；
- 自动完成本地 `npm link` 刷新并逐仓执行 `baton install --project`；
- 将本机全部 12 个消费方仓库（Lighthouse, Tappy, Tappy-laya-lora-dev, agent-baton, artemis, 一期一卉花, AutoOperations, OWSEL, Prospero, Swoop, WarmTag, iggle）的接入桩一次性幂等对齐到 `v2.38.1`（sha: `efc4fb85`）。

---

## 3. Implementation Status（落地情况 · 截至 2026-11-22）

| 项 | 状态 | 说明 |
|---|---|---|
| `package.json` 更名为 `reasonweave` | ✅ 已实现 | 添加 `reasonweave` 与 `rw` 命令行入口，保持旧命令 100% 兼容 |
| CLI `--version` 与 `doctor` 对齐 | ✅ 已实现 | 输出 `reasonweave v1.3.1`，环境体检标题对齐 |
| Git 远端 `origin` 切换至 ReasonWeave | ✅ 已实现 | `origin` 指向 `ReasonWeave.git`，`legacy-lab` 指向旧仓，`main` 分支 upstream 绑定 |
| 全套公共文档与宪法重塑 | ✅ 已实现 | `README.md`、`INSTALL.md`、`使用说明.md`、`constitution.md`、`AGENTS.md`、`CONSUMER-PROMPTS.md` 统一品牌 |
| `AGENTS.md` 写入文档联动对齐律 | ✅ 已实现 | 明确四类触发源与判定动作 |
| `tests/cli-contract.test.mjs` 防漂移门禁 | ✅ 已实现 | 3 个独立测试用例常驻保障，`npm test` 全绿 |
| 12 个本地下游消费方批量同步 | ✅ 已实现 | 全部刷新至 `v2.38.1` (sha: `efc4fb85`) |

---

## 4. Consequences / Invariants（不可违背铁律）

1. **唯一权威远端律**：后续所有功能演进、Bugfix、提交与推送，**以 `origin` (ReasonWeave) 为唯一事实源**；严禁将未在 ReasonWeave 确认的改动推向外部。
2. **改源必改汇律（Doc-Code Synchronization Invariant）**：改动底层版本号或接口契约时，必须与所有引用该契约的文档和提示词在**同一 commit 内闭环**。
3. **向后兼容承诺**：无论包名如何演进，`lab` 与 `baton` 等经典命令永久保留别名支持，保障存量消费方无感调用。
