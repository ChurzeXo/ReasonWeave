<!-- adr-template v1.0 · tier: frozen · source: ~/Documents/lab/adr/ -->

# ADR-0002: 仓内交接回执去仪式化与自动唤醒闭环规范

- **状态（Status）**：🔒 Frozen
- **冻结日期**：2026-11-04
- **决策人**：churze + Antigravity
- **关联证据**：`units/handoffs/README.md` (契约 v2.15.0), `group/architecture/adr/0001-handoff-async-wait-and-reactive-wakeup.md`

---

## 1. Context（背景 / 问题）

1. **盲肠仪式的历史成因**：
   在 ADR-0001 之前，Agent 之间不存在系统级异步唤醒通道，必须依赖人类开发者在聊天窗口间手动复制粘贴“回执交付行”以触发发起方审计。因此，契约在 v2.11/v2.12 引入了回执正文内必须含「## 转递提示词」节与对话末块强制固定该行的硬约束。
2. **底层演进带来的盲肠退火需求**：
   随着 `handoff wait` 与 `handoff forward --wait` 的落地，状态机后台轮询与宿主 Reactive Wakeup 机制已实现 **0.3 秒内自动唤醒发起方**。发起方不再依赖人类手动传递消息。此时，继续强迫执行方在回执中手写转递话术并固定回复末块，构成了严重的“仪式冗余与模型上下文浪费”。

---

## 2. Decision（决策 · 冻结内容）

1. **仓内回执免写「## 转递提示词」节**：
   - 仓内模式（`intra-repo` / `workspace=same`）下，回执文档仅需聚焦于业务本质：`## 修复状态`、`## 结论`、`## 验证` 与 `evidence`；
   - 引擎 `checkReceiptPrompt` 与 `receiptContentGate` 全面豁免仓内模式对该节的存在性与格式校验。
2. **解除回复收尾末块固定转递词约束**：
   - 仓内执行方完成 `handoff receipt` 后，正常回复总结即可结束回合，严禁再强制要求末块贴出传话格式；
   - `handoff receipt` 在仓内模式下不再打印人工复制交付行，改为打印自动唤醒成功确认。
3. **保留独立审计与状态机红线（不可逾越）**：
   - 执行方任务完成仅拥有翻转至 **`status: received`** 的权限；
   - **严禁执行方直接将单据闭环为 `status: closed`**；
   - 必须由后台唤醒的发起方/审计方在独立完成终端命令实测验证后，执行 `handoff accept/close` 闭环。
4. **全渠道载体支持扩展（GEMINI.md）**：
   - 将 `GEMINI.md` 与 `AGENTS.md` / `CLAUDE.md` 同等列为一等载体，由 `handoff install` 与 `checkStubCarrier` 统一管理与刷新。

---

## 3. Implementation Status（落地情况 · 截至 2026-11-04）

| 项 | 状态 | 说明 |
|---|:---:|---|
| CLI 仓内门禁与 check 豁免 | ✅ 已实现 | `units/handoffs/handoff.mjs` (契约 v2.15.0) |
| GEMINI.md 一等载体纳管 | ✅ 已实现 | `checkStubCarrier` & `cmdInstall` 自动纳管 |
| 规范骨架更新 | ✅ 已实现 | `RESPONSE-TEMPLATE.md` 标注仓内免转递 |
| 下游 6 大仓全载体精准同步 | ✅ 已完成 | 自动化脚本一键刷新并完成 git 提交 |

---

## 4. Consequences / Invariants（冻结后不可变量）

1. **【铁律一】职责边界不退化**：免去转递提示词绝不等于免去审计！执行方不可自审自结，闭环权恒在发起方。
2. **【铁律二】跨仓异构环境保留兜底**：跨仓（Cross-repo）及 `workspace=separate` 模式下，仍保留「## 转递提示词」作为人工转递凭证。
3. **【铁律三】状态原子触发**：发起方唤醒恒依赖 `status: received` 事实源，不依赖任何自然语言沟通。
