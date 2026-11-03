# 05 — ADR（架构决策记录）· 接线规约

> **规范真相源已独立**：ADR 的通用规范（模板 / 字段 / 状态机 / 编号 / 注入策略 / 三档强度）见 [`~/Documents/lab/adr/README.md`](../../adr/README.md)。
> 本手册**只保留 AEF 特有的「接线」规则**——即 ADR 如何与 Constitution、Spec Kit、契约变更、bootstrap 联动。新项目只想用 ADR、不接 AEF 的，直接看独立模块。

## AEF 接线规则（铁律）

1. **ADR 是权威，AGENTS.md 只写编号。** Unit AGENTS.md 的 Forbidden 段写 `ADR-007 详情页冻结，禁止改动` + 一句话，细节让 Agent 读 ADR 原文。ADR 更新不用同步改 N 处指令文件。
2. **契约变更必须有 ADR。** 改 `group/contracts/api.md` 前先写 ADR，否则 `/speckit.analyze` 判 Silent Architecture Drift（宪法禁令第一条）。
3. **宪法钉死表 ↔ ADR 联动。** 不可单方面改动的 ADR 列进宪法附录（[04 章 §1⑥](04-constitution.md)），形成双保险。
4. **注入策略见独立模块 §1/§4**；AEF 落地：会话启动注入 `adr/INDEX.md` 全表；某 Unit 任务带该 Unit 最近 3–5 条 Accepted ADR 的 Decision 段；改依赖/契约前按 `Related` 反查全文；生成新 ADR 时带最近 3–5 条全文作范例。只有 Accepted/Frozen 入上下文。
5. **强度档选择**：普通决策用 **standard** 档；不可单方面改动的决策（如基础设施锁、合规护栏）用 **frozen** 档（见独立模块 `templates/adr-frozen.md`），并同时入宪法钉死表。

## 什么值得写 ADR（速记）

- 写：不可逆/难逆转决策、改变新贡献者读代码的决策、有明确备选且被否的权衡。
- 不写：常规实现选择、一次性临时方案（进 [07 章](07-backlog.md) backlog）。
- 经验值：一个 feature 0–2 条；每条 feature 产出 3 条以上说明在记流水账。

## 与 Spec Kit 的配合

- `/speckit.plan` 的 Constitution Check 会读 ADR 钉死表。
- 架构级决策在 `/speckit.plan` 阶段产出，落成 ADR 草案（Proposed），人 review 后转 Accepted/Frozen。
- `/speckit.analyze` 发现 plan 与已 Accepted/Frozen ADR 冲突 → CRITICAL。

## 落地动作（AEF 视角）

1. 用独立模块引导新仓：`bash ~/Documents/lab/adr/scripts/adr-init.sh <dir> <tier>`。
2. 在根 AGENTS.md 写一句："架构级改动必须先有 Accepted/Frozen ADR，编号写进 PR 描述/收尾报告。"
3. [02-bootstrap.md](02-bootstrap.md) Step 4 列的起步 ADR 先写完。
4. Unit AGENTS.md 的 Forbidden 段改为"ADR 编号 + 一句话"格式。

> AEF 原文对应章节：§10 Specification Model、§33 Source of Truth、§36 Anti-Patterns（Silent Architecture Drift）、§32 Traceability。
