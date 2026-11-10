<!-- adr-template v1.0 · tier: frozen · source: ~/Documents/lab/adr/ -->

# ADR-0004: 全局规约守卫与架构漂移防护机制 (Spec-Guard / Drift-Gate)

- **状态（Status）**：🔒 Frozen
- **冻结日期**：2026-11-10
- **决策人**：churze + Antigravity (AEF 架构委员会)
- **关联证据**：
  - 设计规约：`specs/RFC-20261110-SPEC-GUARD-UNIT.md`
  - 独立双盲审计工单与回执：`.handoffs/handoffs/audit-20261110-02-task.md`、`.handoffs/receipts/audit-20261110-02-task-resp.md`
  - 独立实测证据与对抗夹具：`.handoffs/reviews/audit-20261110-02-task-verification.md`、`.handoffs/reviews/audit-20261110-02-task-fixture.mjs` (20/20 PASS)
  - 交付单元源码与测试：`units/spec-guard/` (v1.0.0, 7/7 用例 Exit 0，`npm test` 全绿)

---

## 1. Context（背景 / 问题）

1. **自顶向下半山腰挂起（Top-Down Spec Hang）**：
   在自顶向下架构规约设计中，架构师或 Agent 为了使规约完备，过早地将未接线的纯算法函数直接提交至生产代码目录（`src/main/`）。而在底层调度触发、跨端 IPC 协议与业务排他锁尚未建立时，这批函数数天后即被静态扫描或死代码清理工具当作“零引用孤儿代码”误删，导致顶层 Frozen 规约与底层代码实现彻底脱节。
2. **形式可达陷阱与装饰性空壳接线（Shallow Wiring）**：
   若单纯为了消除零引用或骗过静态调用图门禁，开发者或 Agent 极易在守护进程或轮询循环（Watchdog/Tick）中塞入无业务前提判断的空调用。此时调用图全绿通过，但系统在运行期仍持续违反 ADR 声明的业务不变量（如未过冷却时间发包、缺乏并发互斥）。**「调用图可达」≠「语义闭环」**。
3. **传统零引用门禁的高摩擦与误报**：
   实测表明，在真实项目中（如 Android/Kotlin 模块），合法无直接调用入边的符号高达 26.5%（系统广播、清单注册组件、多态接口分发、数据类）。在本地 pre-commit 进行零引用强拦截会导致大面积合法代码被卡死，逼迫开发者编写无意义代码绕过门禁。
4. **规约状态维护的越权与不可逆风险**：
   ADR 属于团队工程最高宪法（append-only + 用户单句批准 + 🔒Frozen 不可逆）。严禁通过脚本自动将 Draft 改为 Frozen；机器工具必须定位为“只出报告、不改状态”的客观证据生成器。

---

## 2. Decision（决策 · 冻结内容）

1. **确立 P3′ 不变量三元映射对账原则（Triad Mapping）**：
   废除单纯以“调用图是否有入边”作为完备性判据的假定。每个关键架构不变量（如 ADR Invariant `H-1`）必须强制绑定至少一条**可机判断言（Machine Assertion）**（契约测试、变异测试反向阻断、负向零流量断言）。门禁校验的是“不变量断言覆盖率”，而非“符号是否有调用点”。
2. **推行 Code-as-Spec-Matrix 为默认事实源**：
   杜绝手写冗长 YAML 带来的维护摩擦力。对账引擎默认通过 AST 与正则在内存中动态扫描源码中的 `@Invariant("ADR-XXX:H-Y")` 注解与 ADR 文本中的 `## Implementation Status`，即时构建三元映射矩阵。`spec-matrix.overlay.yml` 仅作为跨端/跨语言（如 Android ↔ Python）无直接代码引用时的轻量按需覆写层（Overlay）。
3. **实行防伪铁律（No-Cheat Rule）**：
   测试类（`src/test/`、`tests/`、`*_test.go` 等）中对算法原型的直接调用，**一律不计入生产可达性证明**。未接线算法若需提前沉淀，必须收容于测试沙箱或显式标注 `@ContractOnly`。
4. **严格词界与分隔符锚定（Strict Word Boundaries）**：
   所有 Invariant 匹配与标签提取强制遵循严格边界正则：
   `(?<=^|[^a-zA-Z0-9_-])ADR-\d+:[A-Z]-\d+(?=$|[^a-zA-Z0-9_-])`
   严禁裸子串匹配，彻底杜绝 `H-1` 误伤 `H-10` 或 `H-1-OBSOLETE`。
5. **机器证据生成器与授权链保护（Evidence Generator）**：
   `spec-guard` CLI 与脚本严格遵循“只出报告、不改状态”原则。`spec-guard audit-adr <ID>` 输出只读机器审计报告，作为架构师与用户人工单句批准 `🔒Frozen` 的客观依据。**任何脚本不得越权自动修改 ADR 文件的状态行**。
6. **副作用函数兼容与空壳接线探针分级**：
   针对无返回值（void/Unit）业务调用，空壳接线启发式探测器采取 `WARN` 级审计提示（如缺少温控或空闲前置互锁），不硬阻断合法副作用逻辑。
7. **设立全新独立工程单元 `units/spec-guard`**：
   作为 lab 第 7 个自治单元，提供 `spec-guard`（别名 `drift-gate`）CLI，配套提供多语言注解打标规范（Kotlin/Java、Python、Go、TypeScript、Rust），并无缝集成进 `lab preflight`（门禁分发）、`lab review-gate`（SAST 防线）与 `lab orphan`（死代码清道夫）。

---

## 3. Implementation Status（落地情况 · 截至 2026-11-10）

| 模块 / 能力 | 状态 | 说明 |
|---|:---:|---|
| **单元骨架与根软链** | ✅ 已实现 | `units/spec-guard/` 建立，根目录 `spec-guard` 与 `drift-gate` 软链就绪 |
| **Code-as-Spec-Matrix 对账引擎** | ✅ 已实现 | 内存动态建构矩阵，支持 `check`、`audit-adr`、`init`，支持 overlay 覆写 |
| **严格词界防伪 (Constraint 2)** | ✅ 已实现 | 严格正则匹配，审计夹具实测 A1–A4 全部通过，零假阳性 |
| **No-Cheat 防伪铁律** | ✅ 已实现 | 测试调用自动降级为 `test_only`，不计入生产 `wired`，夹具 B1–B3 全过 |
| **副作用调用探测 (Constraint 3)** | ✅ 已实现 | 针对独立调用输出 `WARN` 级审计提示，不误杀带赋值生产调用 (PROBE B4) |
| **多语言打标支持** | ✅ 已实现 | Kotlin/Java, Python, Go, TypeScript (`// @invariant`), Rust 模板与抽取全通 |
| **独立三方双盲审计** | ✅ 已实现 | 工单 `audit-20261110-02-task` 交付并通过，审计夹具 20/20 真实 Exit 0 |

---

## 4. Rationale（外部最佳实践与证据背书）

1. **ThoughtWorks 演进式架构与适应度函数**：
   Neal Ford 与 Rebecca Parsons 在 *Building Evolutionary Architectures* 中强调：架构不变量必须通过机器化、客观、可重复的适应度函数进行自动化校验，而不是依赖脆弱的口头约定或人工文档。
2. **Google Engineering Practices (EngPractices)**：
   Google 强调“Small CLs（极窄垂直切片）”与“No Dead Code Rule”——未接线抽象禁入主干，测试沙箱隔离先行，杜绝假完备性。
3. **Cyrille Martraire 活文档 (Living Documentation)**：
   规约若不能与代码持续对账，必然发生架构侵蚀与漂移。`spec-guard` 将规约（ADR）、断言（Assertion）与代码（Code）绑定为单一有机体。

---

## 5. Invariants（冻结后不可变量）

1. **INV-1: 规约冻结必须具备机器断言背书**：
   任何 ADR 在声明 `🔒Frozen` 时，其定义的核心不变量必须在代码库中有对应的可机判断言（单测/负向断言/变异门禁），且必须具备完备的 `## Implementation Status` 落地情况段。
2. **INV-2: 测试调用严禁假充生产接线**：
   任何仅被测试代码调用的符号，在对账矩阵中一律定性为未接线（`unwired` / `test_only`），严禁据此声称生产已闭环。
3. **INV-3: ADR 状态变更人类唯一授权**：
   `🔒Frozen` 状态跃迁永远保留人类单句批准权，机器工具仅生成只读审计对账报告，严禁自动化篡改。

---

## 6. Future（后续演进任务，不在本决策变更范围）

1. 在 `units/review-gate` 补充基于 OpenGrep 的反半成品挂起规则；
2. 跨端/跨仓库动态通信协议帧（如 WebSocket 帧）的契约边自动追踪；
3. 将生产环境实时埋点/指标（Telemetry Assertions）作为动态适应度函数接入对账引擎。
