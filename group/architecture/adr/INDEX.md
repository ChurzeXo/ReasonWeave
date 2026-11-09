<!-- adr-index v1.0 · source: ~/Documents/lab/adr/ -->
# ADR INDEX

> Adopted: adr-template v1.0 (tier: frozen)
> 唯一索引表。只有 Accepted / 🔒 Frozen 的条目才注入 Agent 上下文（最近 3–5 条最佳）。
> 会话启动注入本表全量；具体任务只带该范围 Decision 段。

| ADR | 标题 | 状态 | 日期 | 范围/Unit | 文件 |
|:---:|------|:---:|:---:|:---:|------|
| 0001 | Handoff 异步后台监听与响应式唤醒架构决策 | 🔒 Frozen | 2026-11-04 | handoffs | `0001-handoff-async-wait-and-reactive-wakeup.md` |
| 0002 | 仓内交接回执去仪式化与自动唤醒闭环规范 | 🔒 Frozen | 2026-11-04 | handoffs | `0002-de-ritualize-handoff-prompt-for-intra-repo.md` |
| 0003 | 基于注意力节流的分层协同与 Handoff 微内核解耦架构 | 🔒 Frozen | 2026-11-09 | handoffs / global | `0003-attention-throttle-and-workspace-driver.md` |

## 状态说明
- **Proposed** — 已起草，等待评审。不入 Agent 上下文。
- **Accepted / 🔒 Frozen** — 生效且冻结。Frozen 不可直接修改，若演进必须写新 ADR 并声明 Supersedes。
- **Superseded** — 已被后续新 ADR 替代。
