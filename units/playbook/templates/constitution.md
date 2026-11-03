# <PROJECT> Constitution

**Version:** 1.0
**Project:** <项目名>
**Last Updated:** <日期>

> 本文件是项目长期原则，所有 Agent 和 Unit 必须遵守。
> 改宪法是独立流程，须人 review，不得在 `/speckit.analyze` 中顺手稀释。
> 同步一份到 `.specify/memory/constitution.md`（Spec Kit 的 Constitution Check 读它）。

---

## 1. 产品原则

### P1 — <名词>
<一句话约束。写否定式更好判定："X 而不是 Y">

### P2 — <名词>
<...>

## 2. 技术原则

### T1 — Agent 协作优先
项目天然由 Agent 开发，所有设计必须考虑多 Agent 协作场景。

### T2 — Shared Contracts
跨 Unit 信息必须结构化，禁止依赖聊天记录或口头约定。

### T3 — Evidence Based
完成必须有证据，不能只由 Agent 声称完成。

### T4 — Artifact-based Handoff
Unit 之间交接使用 Artifact，而不是自然语言对话。

## 3. 架构原则

### A1 — 单一事实源
每个事实只有一个权威来源：
- 产品行为 → Requirements
- 架构决策 → ADR
- API 定义 → Contracts
- 实现 → Code

### A2 — 显式依赖
Unit 之间的依赖必须明确声明（`group/architecture/dependency-graph.md`），禁止隐式耦合。

### A3 — 平台隔离
各端拥有独立工程上下文，通过 Contracts 协作，禁止直接读改其他 Unit 的实现。

## 4. 开发原则

### D1 — Intent before Implementation
先明确意图，再决定实现。

### D2 — 最小必要文档
文档只记录必要信息，避免 Spec Theater。

### D3 — 增量变更
小改动只修改必要部分，不重建整个项目。

### D4 — 失败可恢复
任何阶段失败后，可以从最近有效状态继续。

### D5 — Default to Action
实现细节存在多种合理方案时，不打断人：选最贴合本项目现状的方案（无现状则取行业标准最佳实践），用 `// ASSUMPTION: <假设什么、为什么>` 注释留痕，继续推进。仍须停下来问的只有：架构/宪法级改动、中途需求变更（CR）、不可逆操作、花钱或外部请求、改公共 API、难替换的依赖。

## 5. 禁止事项

| 禁令 | 拦截点 |
|---|---|
| ❌ Silent Architecture Drift | 架构级改动必须有 Accepted ADR，否则 CRITICAL |
| ❌ Chat-based Handoff | 跨 Unit/跨仓交接只认 artifact 路径 |
| ❌ Agent Self-Approval | Evidence 必须来自外部工具输出，不接受自然语言声称 |
| ❌ Giant Context | 常驻 AGENTS.md < 150 行，长规范走 Skill 懒加载 |

## 6. 自动化等级

本项目采用 **Level 1 — Agent Assisted**（可随成熟度上调，见 AEF §27）：
- Agent 执行开发任务
- Human 审查关键决策
- Evidence 收集部分自动化
- Convergence 使用 Checklist

---

## 附录：不可单方面改动的 ADR

以下决策已钉死，改动须经人确认流程，不可由 Agent 在改代码时顺手变更：

| ADR | 名称 | 所在文件 |
|-----|------|---------|
| ADR-001 | （起步决策） | `group/architecture/system.md` |
| ADR-002 |  |  |
