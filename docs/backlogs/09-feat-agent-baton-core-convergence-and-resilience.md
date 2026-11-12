---
id: 9
title: feat(handoffs): Agent Baton 状态机核心收敛、同跨仓双轨合流与异构会话韧性改造
type: feature
priority: high
status: closed
owner: lab/handoffs
dep_on: none
handoff_ref: 'ADR-0008'
created: 2026-11-12
updated: 2026-11-12
completed: 2026-11-12
---

- **要做什么**：
  依据 ADR-0008 完成 Agent Baton（Handoff Unit）系统级根治改造，彻底解决同仓/跨仓多工单及异构 AI 客户端并发协作中的门禁死锁与规则冲突：
  1. **Phase 1: 门禁中间件解耦与【无条件安全下车通道】** [DONE · 2026-11-12]
     - 将 Audit Nonce 校验与 Evidence 校验下沉为只拦截正向交付（`deliver`/`accept`）的交付闸门中间件；
     - 负向结论（NO-GO/受阻）及草稿回执豁免 Nonce 登记，畅通下车与受阻记录通道；
     - 确保 `reject`（驳回/退回）与 `reopen` 享有无条件安全通行权，豁免状态快照超时门禁，无论工单是否缺失 Nonce 均保证畅通打回；
     - 放行发起方（`from_lane`）主动驳回/撤回已派发工单，严禁静默跳过；完成自动化用例 10~12 覆盖；
  2. **Phase 2: 工单自描述身份机制与同对话多工单解锁（`--as <lane>`）** [DONE · 2026-11-12]
     - 在 `receipt`, `deliver`, `accept`, `reject`, `reopen`, `status` 中全面支持 `--as <lane>` 显式声明身份；
     - 解除单会话必须绑定单一 `HANDOFF_LANE` 环境变量的硬限制，彻底解锁“同仓同对话同时处理多个不同角色工单”场景；
     - 保持严密的越权拦截（禁止用 `--as` 冒充自填回执或自闭环）；完成自动化用例 13~15 覆盖；
  3. **Phase 3: 同仓车道与跨仓收发箱数据模型统一** [DONE · 2026-11-12]
     - 统一数据模型归一化：废除历史分化字段（将 `needs_iggle_change` 全链路归一化对齐为规范的 `needs_change`）；
     - 底层解析器（`readFM` / `parseFM`）透明自愈归一化，向下兼容无缝读取历史存量票据；
     - `show`、`check` 及 `check --fix` 对账逻辑全量同构，跨仓降维为底层工单传输驱动层；完成自动化用例 16 覆盖；
  4. **Phase 4: 接入桩（Stub）去恐吓化瘦身与错误驱动一键自愈** [DONE · 2026-11-12]
     - 接入桩精简至轻量韧性版（正文从 3500+ 字符精简至 ~1300 字符，精简幅度超 60%），大幅减轻各异构 AI 客户端的 Context 衰减与幻觉；
     - 升级引擎至 v2.29.0，刷新全仓接入桩载体（`AGENTS.md`、`CLAUDE.md`、`README.md`）；
     - CLI 门禁拦截时 100% 输出清晰明确的 `👉 可运行: ...` 确定性修复命令；完成自动化用例 17 覆盖；
  5. **Phase 5: 全场景自动化测试套件与健康自检** [DONE · 2026-11-12]
     - 17 个覆盖用例 100% 执行通过（`node --test units/handoffs/tests/audit-receipt.test.mjs`）；
     - 全量 `baton doctor` 与桩版本一致性体检通过（v2.29.0）。

- **交付成果与结论**：
  - 核心架构 ADR 决议：`group/architecture/adr/0008-agent-baton-core-convergence-and-heterogeneous-session-resilience.md` (Accepted)
  - 契约版本：v2.29.0
  - 回归测试：17/17 PASS
  - 状态：已按计划圆满交付闭环。
