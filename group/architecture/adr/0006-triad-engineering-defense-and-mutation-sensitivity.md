<!-- adr-template v1.0 · tier: frozen · source: ~/Documents/lab/adr/ -->

# ADR-0006: 跨语言三元工程防线与变异敏感性契约架构决策 (Triad Engineering Defense)

- **状态（Status）**：🔒 Frozen
- **冻结日期**：2026-11-11
- **决策人**：churze + Agent (AEF 架构委员会 · impl & audit lanes)
- **代替（Supersedes）**：[`ADR-0004: 全局规约守卫与架构漂移防护机制`](file:///Users/churze/Documents/lab/group/architecture/adr/0004-spec-guard-and-drift-prevention.md)
- **关联证据**：
  - 架构设计报告：[`units/handoffs/reviews/three-tier-defense-design.md`](file:///Users/churze/Documents/lab/units/handoffs/reviews/three-tier-defense-design.md)
  - 交付工单与回执：[`.handoffs/receipts/impl-20261110-05-task-resp.md`](file:///Users/churze/Documents/lab/.handoffs/receipts/impl-20261110-05-task-resp.md)
  - 独立双盲审计工单与回执：[`.handoffs/receipts/audit-20261111-01-task-resp.md`](file:///Users/churze/Documents/lab/.handoffs/receipts/audit-20261111-01-task-resp.md)
  - 独立审计实测记录：[`.handoffs/reviews/audit-20261111-01-task-verification.md`](file:///Users/churze/Documents/lab/.handoffs/reviews/audit-20261111-01-task-verification.md)
  - 交付 Commit SHA：`b8ed2f6`
  - 单元版本：`units/spec-guard` v1.1.0, `units/orphan` v1.1.0

---

## 1. Context（背景 / 问题）

在下游业务项目（如 Tappy ADR-060 跨端设备互锁）实践中，团队通过 4 轮严格双盲审计，暴露了传统单测与 AST 规约扫描无法防御的深层质量穿透隐患：
1. **回音壁假测试（Echo Chamber Tests）**：单测虽标注真实 `@invariant`，但断言深度不足或 Mock 隔离过度；第三方审计方自备变异夹具篡改网络端点为 `/BOGUS_PATH`，测试套件依然全绿通过，对真实缺陷零判别力；
2. **生产调用链脱节（Orphan Wiring）**：被测函数逻辑 100% 健全，单测 100% 真实通过，但在生产关键链路（如 Dispatcher / Watchdog）根本未接入调用，生产调用者数量（Production Caller Count）恒为 0，导致功能在线上裸奔；
3. **架构防线碎片化**：规约对账、变异测试与死代码拓扑彼此割裂，缺乏工业级三元联合防线。

---

## 2. Decision（决策 · 冻结内容）

### 2.1 三元工程防线体系（Triad Engineering Defense）
建立由规约对账、变异敏感性反向测试、生产拓扑可达性扫描构成的三元联合防线：
- **防线 1：规约对账 (Code-as-Spec-Matrix)**：通过 AST 与正则在内存中动态扫描源码 `@Invariant` 声明与 ADR 落地表，杜绝自欺欺人；
- **防线 2：变异反向测试契约 (Mutation Sensitivity Engine)**：在 `units/spec-guard/core/mutation-runner.mjs` 中固化端点、布尔、操作符与返回值变异注入契约，测试套件在变异注入后必须爆红（Exit !== 0）；若依然全绿（Exit === 0），判定为回音壁假测试并 Exit 1 阻断；
- **防线 3：生产拓扑可达性门禁 (Topology Wiring Guard)**：联动 `units/orphan` 的行级倒排索引与分类器（`countProductionCallers`），在 `spec-guard check --check-callers` 门禁中强制断言核心架构函数必须存在非测试生产调用（Production Callers >= 1）。

### 2.2 核心机制与铁律
1. **Zero Orphan Wiring Invariant（硬性铁律）**：
   凡纳入架构治理的核心不变量接口，生产调用图必须闭环；单测内部的调用 100% 豁免排除（遵循 No-Cheat 铁律），生产调用数为 0 则硬阻断；
2. **Mutation Sensitivity Invariant（硬性铁律）**：
   契约测试对接口端点与字段变异必须具备判别力，严禁自反恒真断言；
3. **零污染保证（Read-Only & Clean Restitution）**：
   变异测试引擎必须在 `try ... finally` 中逐字节恢复被测源码，执行过程绝对零污染工作树。

---

## 3. Implementation Status（落地情况 · 截至 2026-11-11）

| 项 | 状态 | 说明 |
|---|:---:|---|
| INV-1 生产拓扑孤儿接线门禁 | ✅ 已实现 | `spec-guard check --check-callers` 联动 `orphan`，Zero Production Callers 精准 Exit 1 阻断 |
| INV-2 变异反向测试契约引擎 | ✅ 已实现 | `spec-guard mutate` 实现端点/布尔/返回值变异注入与假测试反向拦截（Exit 1 / Exit 0） |
| INV-3 变异自检工作树零污染 | ✅ 已实现 | `runMutationTest` 严格 `try...finally` 恢复源码，SHA-256 逐字节一致验证通过 |

---

## 4. Consequences / Invariants（冻结后不可变量）

- **INV-1: Zero Orphan Wiring Invariant**：核心架构不变量函数在非测试生产代码中必须存在至少 1 处真实调用者（Production Callers >= 1），严禁单测孤儿裸挂。
- **INV-2: Mutation Sensitivity Invariant**：契约测试在接口端点或核心返回值发生变异时必须爆红（Exit !== 0），变异存活判定为回音壁假测试并阻断。
- **INV-3: Read-Only Zero-Pollution Invariant**：变异自检必须保证测试前后源码文件 SHA-256 逐字节一致，工作树零污染。

---

## 5. Rationale（外部最佳实践与证据背书）

1. **Jesper Anderson 变异测试理论 (Mutation Testing)**：通过对生产代码施加语法变异来度量测试套件故障检测能力，消灭“全绿假象”；
2. **Google 生产调用图健全性原则 (Live Production Reachability)**：死代码或未接线代码属于高危技术负债，任何关键逻辑必须在生产入口可达；
3. **独立双盲审计实测**：工单 `audit-20261111-01-task` 自备对抗夹具，物理实测 `MUTATION_SURVIVED Exit 1` / `MUTATION_KILLED Exit 0` / `Zero Production Callers Exit 1` / 生产接线后 Exit 0，各项判据 100% 达标。
