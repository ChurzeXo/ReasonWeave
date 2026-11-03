# Lab Constitution

**Version:** 1.0  
**Project:** Agent Engineering Framework & Tooling Lab (`lab`)  
**Last Updated:** 2026-11-03  

> 本文件是 `lab/` 能力库的最高工程宪法，所有维护本库的 Agent 及 Unit 必须无条件遵守。  
> 宪法改动须经人类明确审查批准，任何 Agent 不得擅自放宽或稀释条款。

---

## 1. 核心定位原则 (Product Principles)

### P1 — 单一事实源，规范不漂移 (Single Source of Truth)
本能力库各 Unit（`adr`, `backlog`, `preflight`, `review-gate`, `handoffs`, `playbook`）是对应工程规范的唯一权威事实源。
消费方项目只通过指针与指令引用，严禁在消费方内联复制规则正文。

### P2 — 正交解耦，按需插拔 (Orthogonal & Pluggable)
每个 Unit 各司其职，解决一个维度的工程纪律问题。
Unit 之间保持松耦合，不得产生强环形依赖；消费方可单选任意一个或多个 Unit 接入，互不阻塞。

### P3 — 渐进演进与向后兼容 (Progressive & Backward Compatible)
对能力库结构的任何调整，必须保证现有消费方现有路径（如通过根目录 symlink）平滑可用。破坏性改动必须有显式升级通知与迁移过渡期。

---

## 2. 技术与纪律原则 (Technical Principles)

### T1 — Hooks are Law, Prompts are Requests
在提交门禁（`preflight`, `review-gate`）与执行验证中，模型自然语言自律只是“请求”，Git Hooks / CI 脚本与可执行探针才是不可绕过的“法律”。

### T2 — 门禁 Fail-Open 与受控自验
门禁工具在环境缺件时采取 `fail-open`（告警不阻断），以防中断正常工作；但任何门禁安装或更新后，必须通过故意制造违规进行真实阻断验证。

### T3 — 运行态与能力库严格分离
`units/handoffs/` 的运行态票据（handoffs、receipts、inbox、archive）属于业务落地历史痕迹，绝对禁止混入版本管理与打包分发中。

---

## 3. Unit 隔离与维护原则 (Unit Isolation Principles)

### U1 — 边界自洽 (Unit Self-Contained)
每个 `units/<unit-name>` 拥有独立的规范（README）、版本文件（VERSION）、变更日志（CHANGELOG）与专属 `AGENTS.md`。

### U2 — 跨 Unit 变更显式化
改动涉及多个 Unit 或影响全局打包规范时，必须在 `group/architecture/dependency-graph.md` 声明，并通过对应 Unit 独立发布。
