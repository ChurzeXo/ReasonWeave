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
| 0004 | 全局规约守卫与架构漂移防护机制 (Spec-Guard / Drift-Gate) | Superseded | 2026-11-10 | spec-guard / global | `0004-spec-guard-and-drift-prevention.md` |
| 0005 | 全局死代码与孤儿资产清道夫架构及只读不变式 | 🔒 Frozen | 2026-11-10 | orphan / global | `0005-global-orphan-scavenger-and-read-only-invariants.md` |
| 0006 | 跨语言三元工程防线与变异敏感性契约架构决策 | 🔒 Frozen | 2026-11-11 | spec-guard / orphan / global | `0006-triad-engineering-defense-and-mutation-sensitivity.md` |
| 0007 | Agent Baton 状态机安全防御与工作区物理沙箱规约架构决策 | 🔒 Frozen | 2026-11-12 | handoffs / global | `0007-agent-baton-state-machine-defense-and-workspace-jail-spec.md` |
| 0008 | Agent Baton 核心收敛与异构并发会话韧性架构决策 | 🔒 Frozen | 2026-11-12 | handoffs / global | `0008-agent-baton-core-convergence-and-heterogeneous-session-resilience.md` |
| 0009 | 全栈反未接线（Anti-Orphan）确定性治理与联邦门禁架构决策 | 🔒 Frozen | 2026-11-14 | orphan / playbook / handoffs / global | `0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md` |
| 0010 | Agent Baton 身份防御、密码学防伪凭据与提示词防混淆架构决策 | 🔒 Frozen | 2026-11-15 | handoffs / global | `0010-agent-baton-identity-security-cryptographic-credentials-and-prompt-anti-confusion.md` |
| 0011 | Vibe Coding 虚假安全感穿透防御、免检审计与依赖可达性治理架构决策 | 🔒 Frozen | 2026-11-21 | review-gate / orphan / playbook / global | `0011-vibe-security-anti-suppression-and-dependency-reachability.md` |
| 0012 | 规约驱动开发 (SDD) 与 RePPIT 闭环分级工程防护架构决策 | 🔒 Frozen | 2026-11-22 | spec-guard / review-gate / orphan / handoffs / playbook / global | `0012-spec-driven-development-reppit-and-tiered-guardrails.md` |
| 0013 | 全 CLI 物理契约对称治理、单测零环境寄生与防御性探针架构决策 | 🔒 Frozen | 2026-11-22 | bin / handoffs / orphan / spec-guard / worktree / review-gate / global | `0013-universal-cli-contract-hermetic-testing-and-defensive-probes.md` |
| 0014 | 全局工程生态更名为 ReasonWeave、权威远端迁移与文档规约联动防漂移律 | 🔒 Frozen | 2026-11-22 | global / bin / tests / doc | `0014-reasonweave-rebranding-and-doc-code-synchronization-invariant.md` |

## 状态说明
- **Proposed** — 已起草，等待评审。不入 Agent 上下文。
- **Accepted / 🔒 Frozen** — 生效且冻结。Frozen 不可直接修改，若演进必须写新 ADR 并声明 Supersedes。
- **Superseded** — 已被后续新 ADR 替代。
