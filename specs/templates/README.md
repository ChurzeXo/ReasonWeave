# SDD / RePPIT 活文档模板库 (specs/templates/)

> 依据 **ADR-0012** 与 **CS146S 规约驱动开发 (SDD)** 范式建立的工程活文档骨架。
> 专用于 **Tier 2（关键变更 / 跨 Unit / 安全边界 / 架构调整）** 任务。

---

## 1. 结构与生命周期

当任务命中 Tier 2 判定时，在 `specs/<ticket-id>/` 下实例化本套 5 份文档：

```text
specs/<ticket-id>/
├── 01-research.md       # Stage 1: 只读调研现状，零假设
├── 02-proposals.md      # Stage 2: 方案推演对比，不可逆决策人类签署
├── 03-spec.md           # Stage 3: 技术规格冻结，含负向护栏与 Invariants
├── 04-tasks.md          # Stage 4: 垂直切片任务清单，负向测试先行
└── 05-evidence.md       # Stage 5: 双盲独立实测物理证据链
```

## 2. 纪律与防伪铁律

1. **Tier 1 自动免除**：单点参数、纯文档与单分支 Bug 修复，免建此目录，避免形式主义过度设计。
2. **机器对账绑定（P3′ 原则）**：`03-spec.md` 中的 `INV-X` 必须与代码注解或测试断言绑定，由 `spec-guard` 机器对账，严禁纯自然语言摆设。
3. **不可逆拍板**：涉及持久化模型、公开 API 破坏性改动的方案，`02-proposals.md` 必须留有人类或架构负责人显式批准标记。
4. **负向先红后绿**：缺陷修复类任务，`04-tasks.md` Task 0 必须先写负向测试并验证其在未修前 Exit != 0。
