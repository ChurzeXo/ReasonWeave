# spec-guard Agent 行为守则与实操规范

> 本文件是 AI Agent 在涉及顶层规约设计（ADR）、不变量断言、算法原型及防漂移审查时的专属行为法则。
> 任何在项目中扮演架构师、实现方（impl lane）或审计方（audit lane）的 Agent 必须严格遵守。

---

## 1. 核心行为禁令（反模式拦截）

1. **严禁“半山腰挂起”（No Spec Hang）**：
   在底层基础设施（调度、网络、IPC、业务排他锁）尚未就绪时，**严禁将未接线的纯算法函数直接提交至生产目录（`src/main/`、`app/` 等）**。
   - 若需提前沉淀算法原型，请使用契约沙箱：放进 `src/test/.../contract/` 或显式标注 `@ContractOnly`；
   - 算法原型在 ADR 的 `## Implementation Status` 中必须老老实实标记为 `❌ 未实现` 或 `⚠️ 契约沙箱未接线`。

2. **严禁“装饰性空壳接线”（No Shallow / Decorative Wiring）**：
   为了消除死代码警报或骗取调用图绿灯，在轮询循环（Watchdog/Tick）中塞入无业务判断的空调用，属于**严重违规欺骗行为**。
   - 接线必须是**端到端有业务先决条件判断（如温控、空闲、互斥锁）的语义闭环**；
   - 必须配有负向断言（如非工作时间/冷却中抓包数为 0）或变异测试阻断。

3. **防伪铁律：单测不等于接线（No-Cheat Rule）**：
   `src/test/` 中的测试调用**绝不代表生产代码已接线**。不要在回执或审计报告中以“测试跑通了”自欺欺人地声称“生产已闭环”。

4. **绝不越权篡改 ADR Frozen 状态（Never Auto-Mutate ADR Status）**：
   `🔒Frozen` 是具有法律效力的终态，必须由人类单句明确批准。Agent 只能使用 `spec-guard audit-adr <ID>` 生成客观事实对账报告呈交人类，严禁自行修改 ADR 状态行。

---

## 2. 操作工序流 (Standard Operating Procedure)

### 当你在编写或冻结 ADR 时：
1. 检查 ADR 是否严格包含 `## Implementation Status` 落地情况节；
2. 为每一个关键不变量（`H-1`, `H-2`...）设定唯一的 Invariant ID；
3. 运行 `spec-guard audit-adr <ID>`，确认断言覆盖率是否与当前实现状态一致；
4. 若存在未接线项，如实写在 `Implementation Status` 表中，不制造虚假完备性。

### 当你在编写生产代码与单测时：
1. 在单元测试/契约测试中，用 `@Invariant("ADR-XXX:H-Y")` 标注被测不变量；
2. 若编写的是仅供契约验证的原型，使用 `@ContractOnly(adr="ADR-XXX", expire="YYYY-MM-DD")`；
3. 提交前运行 `spec-guard check`，确保没有引入漂移或孤儿断言。

### 当你在审计回执（Audit Lane）时：
1. 运行 `spec-guard check --strict` 独立执行机器核验，严禁静态读码或采信自报；
2. 重点检查是否有通过空调用骗过门禁的 Shallow Wiring 现象。
