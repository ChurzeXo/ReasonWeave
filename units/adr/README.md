# ADR — Architecture Decision Records（独立可复用模块）

> 本目录是 ADR 制度的**单一事实源**，独立于任何具体项目 / playbook。
> 想用全套 AEF 方法论看 `~/Documents/lab/playbook/`；只想用 ADR，拉本目录即可。

## 0. 这是什么 / 为什么独立

ADR 记录"**为什么这么定**"，而不是"做了什么"。在多 Agent 项目里它是 Agent 跨会话的架构记忆——Agent 会忘，ADR 不会。

本模块从 playbook 的 `docs/05-adr.md` 抽离成**正交、自洽、可版本化**的独立组件，因为：

- ADR 不依赖 AEF 七层 / Group-Unit / spec-kit / constitution，**自己就能跑**；
- 不同项目需要不同"强度"（轻量记录 vs 冻结钉死），但共用同一套编号 / 索引 / 注入底座；
- 独立后 ADR 有自己干净的 `vX.Y` 演进节奏，不被整套手册的版本号捆绑。

## 1. 核心不变量（三档通用，不可改）

1. **append-only，绝不改已 Accepted / Frozen 原文。** 决策变 → 写新 ADR，旧条目标 `Superseded by NNNN` 并互相链接。
2. **INDEX 是唯一索引**，编号 / 标题 / 状态 / 日期齐全；只有 Accepted/Frozen 条目入 Agent 上下文。
3. **编号 4 位递增，不复用已删编号。**
4. **注入最近 3–5 条**（arxiv 2604.03826 实证：最佳窗口，全量 RAG 无显著优势）。会话启动注入 INDEX 全表；具体任务只带该范围 Decision 段；生成新 ADR 时带最近 3–5 条全文作范例。

## 2. 编号与命名

```
adr/0007-short-video-detail-frozen.md
     ^^^^  四位递增，不复用
```

路径自由（仓内可放 `adr/`、`group/architecture/adr/`、`docs/adr/`…），由项目决定；INDEX 始终指向实际文件。

## 3. 三档强度（可调的核心）

| 档 | 激活态 | 状态机 | 段落 | 何时用 |
|---|---|---|---|---|
| **light** | Accepted | Proposed→Accepted→Superseded(+Rejected) | Context / Options / Decision / Consequences / Related | 轻量项目，记录即可、允许修订 |
| **standard** | Accepted | 同 light | light + **Implementation Status** | 需要跟踪落地进度 |
| **frozen** | 🔒 Frozen | Proposed→🔒Frozen→Superseded | Context / Decision / Implementation Status / Rationale / Invariants / Future | 决策要钉死、不可随意改（Tappy 用此档） |

- **激活态差异是关键**：light/standard 用 `Accepted` 表示生效；frozen 用 `🔒 Frozen` 表示生效且不可改。
- 升级档位 = 写新 ADR 声明 Supersedes，不是原地改旧档。
- 模板见 `templates/`：`adr-light.md` / `adr-standard.md` / `adr-frozen.md`（均带 `vX.Y` 头）。

## 4. 模板版本化（可迭代）

- 每个模板文件头部带版本：`<!-- adr-template v1.0 · tier: frozen -->`。
- `INDEX.md` 顶部声明本仓采用的模板版本：`Adopted: adr-template v1.0 (tier: frozen)`。
- **两层版本区分**：
  - *ADR 制度版本*（本模块 `VERSION.md`）：管理"规范"演进，bump 时写 `CHANGELOG.md` 迁移说明。
  - *单个 ADR 内容*：append-only，永不改（铁律 1）。
- 旧项目不强制回迁模板；新 ADR 按当前版本写，旧 ADR 保持原样。

## 5. 接入引导

```bash
# 新项目初始化 ADR 仓库（ADR_HOME 默认 ~/Documents/lab/adr）
bash ~/Documents/lab/adr/scripts/adr-init.sh <target-dir> <tier> [project-name]
# 例：bash ~/Documents/lab/adr/scripts/adr-init.sh ./my-repo frozen "My Repo"
```

脚本会：建 `<target-dir>/adr/`、`INDEX.md`（带 Adopted 版本声明）、起步 `ADR-0001`（项目 bootstrap 决策）、拷所选档模板为 `templates/adr-template.md` 参考。

## 6. 可选集成钩子（由宿主项目实现，非强制）

独立模块不假定任何宿主。以下钩子是**可选**的，按项目需要接线：

- **宪法钉死**：若项目有 constitution，可将 Frozen ADR 列入宪法附录，双保险。
- **契约变更闸门**：若项目有契约文件，可规定"改契约前须有 ADR"。
- **规划期联动**：架构级决策在 plan 阶段产出 ADR 草案，review 后转激活态。
- **CI 拦截**：PR 改了被监视路径但无关联 ADR → 失败（社区 ADR Guard / Mneme 思路）。

> AEF 特有的完整接线（Constitution 附录、Spec Kit Constitution Check、bootstrap Step 4 顺序）见 `~/Documents/lab/playbook/docs/05-adr.md`，那是本模块的**一个宿主实例**。

## 7. 分发提示词（接入用）

把下面两份提示词复制给对应项目的 Agent 会话即可，无需每个项目重写安装说明：

- **新项目** → `docs/new-project-prompt.md`：按自身特色选档、运行 `adr-init`、加指针横幅、可选接集成钩子。
- **已用 playbook 的旧项目** → `docs/existing-project-prompt.md`（曾用名 `MIGRATE.md`，同名异称）：从 playbook 内联规范迁移到独立模块、收敛分叉。

维护本模块的 Agent 请看 `AGENTS.md`（改模板 / 版本化纪律 / 三档回归验证）。

## 8. 参考

- Nygard, *Documenting Architecture Decisions* (2011) — ADR 起源。
- arxiv 2604.03826 — ADR 注入窗口实证（最近 3–5 条最佳）。
- Microsoft Well-Architected — ADR 记录与 Confidence 字段。
- 工具（可选）：architecture-decision-record 仓库、adr-agent (PyPI)、Microsoft Agent Governance Toolkit。
