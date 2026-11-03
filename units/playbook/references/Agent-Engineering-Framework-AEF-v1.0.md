# Agent Engineering Framework（AEF）

**Version:** 1.0  
**定位:** 面向 AI Agent 开发的软件工程框架  
**核心公式:** `Intent → Spec → Context → Agent → Evidence → Convergence`

---

## 1. 摘要

Agent Engineering Framework（AEF）是一套面向 AI Agent 开发的软件工程方法与项目结构。

AEF 不把 AI Agent 当作“更聪明的代码生成器”，而把 Agent 当作软件工程流水线中的执行者。

它解决的核心问题包括：

- 需求在对话过程中漂移
- Agent 缺少真实仓库上下文
- 多 Agent 对同一事实理解不一致
- 多端工程互相污染
- Agent 完成代码却没有可信验证
- 失败后只能重新开始
- 小改动被迫重跑整个 Spec
- Spec、代码、测试和产品结果逐渐失去一致性

核心原则：

> **人定义意图，Spec 固化意图，Context 提供事实，Agent 执行工作，Evidence 提供证明，Convergence 保证最终结果与意图一致。**

---

# 2. 设计目标

### G1 — Intent Preservation
让人的原始意图跨越多个 Agent、开发阶段和版本持续存在。

### G2 — Repository Grounding
Agent 必须基于真实仓库事实，而不是只依赖聊天上下文。

### G3 — Multi-Agent Isolation
不同技术域拥有独立工程上下文，避免 Agent 互相污染。

### G4 — Verifiable Execution
Agent 的完成必须有证据，而不能只由 Agent 自己声称完成。

### G5 — Recoverability
任何阶段失败后，都可以从最近有效状态继续。

### G6 — Incremental Change
小改动只修改必要 Spec，不重建整个项目。

### G7 — Convergence
最终结果必须与 Intent、Spec、Architecture、Tasks、Code、Tests、Evidence 保持一致。

---

# 3. 非目标

AEF 不替代：

- Git
- CI/CD
- 测试框架
- IDE
- AI Coding Agent
- 编程语言
- 云平台
- 具体架构模式

AEF 是：

> **Agent 软件工程的控制层，而不是具体实现工具。**

---

# 4. 总体架构

```text
                    HUMAN
                      │
                 Product Intent
                      │
                      ▼
               ┌──────────────┐
               │    GROUP     │
               │ Unified Truth│
               └──────┬───────┘
                      │
          ┌───────────┼────────────┐
          ▼           ▼            ▼
    Requirements  Architecture  Acceptance
          │           │            │
          └───────────┼────────────┘
                      ▼
                    PLAN
                      │
                      ▼
                    TASKS
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       Agent A     Agent B      Agent C
          │           │           │
          ▼           ▼           ▼
       Unit A      Unit B       Unit C
          │           │           │
          └───────────┼───────────┘
                      ▼
                  IMPLEMENT
                      │
                      ▼
                   VERIFY
                      │
                      ▼
                  EVIDENCE
                      │
                      ▼
                 CONVERGENCE
                      │
               ┌──────┴──────┐
               │             │
          CONVERGED       GAP FOUND
                              │
                              ▼
                           NEW TASK
                              │
                              └────→ IMPLEMENT
```

---

# 5. 七层模型

## Layer 1 — Intent

回答：

> 为什么做？

包括产品愿景、用户需求、业务目标、约束和 Non-goals。

Intent 不应该直接决定实现细节。

## Layer 2 — Specification

回答：

> 要实现什么？

包括 Requirements、User Stories、Business Rules、Acceptance Criteria、Edge Cases、Constraints。

## Layer 3 — Architecture

回答：

> 系统应该如何组织？

包括系统架构、领域模型、模块边界、API Contract、Data Model、Event Model、Security Model。

## Layer 4 — Context

回答：

> Agent 执行任务必须知道什么？

包括仓库结构、已有实现、技术约束、依赖、编码规范、架构决策、领域知识。

## Layer 5 — Execution

回答：

> 谁做什么、以什么顺序做？

包括 Agent Roles、Plan、Tasks、Dependencies、Parallelization。

## Layer 6 — Evidence

回答：

> 凭什么证明完成？

包括 Build、Tests、Runtime、Device、Logs、Screenshots、API Responses、Static Analysis、Diff。

## Layer 7 — Convergence

回答：

> 最终结果是否符合原始意图？

```text
Intent
  ↕
Requirements
  ↕
Architecture
  ↕
Tasks
  ↕
Code
  ↕
Tests
  ↕
Evidence
```

---

# 6. Group / Unit

AEF 将项目拆成：

```text
GROUP
│
├── Product
├── Architecture
├── Acceptance
├── Shared Contracts
│
├── Unit: iOS
├── Unit: Android
├── Unit: Web
├── Unit: Backend
├── Unit: MCP
└── Unit: Infrastructure
```

## 6.1 Group

Group 是整个产品的统一事实层，负责：

- 产品目标
- 用户场景
- 全局 Requirements
- 核心业务规则
- 跨端 Contract
- 全局 Architecture
- Acceptance Criteria

Group 不负责平台具体实现。

## 6.2 Unit

Unit 是相对独立的工程域，例如：

```text
iOS
Backend
Web
MCP
Infrastructure
```

Unit 负责：

- 本地工程事实
- 平台技术约束
- 本地 Architecture
- 实现细节
- 测试策略
- Build / Runtime 验证

核心思想：

> **Global intent + Local truth**

---

# 7. Harness

Harness 是 Agent 的运行控制层。

它决定：

```text
Agent 可以看到什么
Agent 可以做什么
Agent 必须遵守什么
Agent 如何验证
Agent 如何报告
```

典型结构：

```text
Unit
├── AGENTS.md
├── Skills
├── Rules
├── Context
├── Tools
├── Verification
└── Constraints
```

---

# 8. Context Engineering

AEF 不主张把整个 Repository 都塞给 Agent。

原则：

> **Give the agent enough context to make a correct decision, but not enough irrelevant context to confuse it.**

Context 分四类：

### Global Context
```text
Product Intent
Core Architecture
Global Rules
Shared Contracts
```

### Unit Context
```text
Platform Architecture
Local Conventions
Dependencies
Testing Strategy
```

### Task Context
```text
Relevant Files
Relevant Symbols
Related Requirements
Related Tests
Known Constraints
```

### Dynamic Context
```text
Git Diff
Build Errors
Test Failures
Runtime Logs
API Responses
Device State
```

---

# 9. Repository Grounding

Agent 开始工作前必须确认：

```text
Project structure
Build system
Entry points
Dependency graph
Test structure
Relevant modules
Current implementation
Existing conventions
Known limitations
```

推荐：

```text
Task
 ↓
Locate Unit
 ↓
Load Unit Context
 ↓
Inspect Repository
 ↓
Identify Relevant Files
 ↓
Identify Existing Contracts
 ↓
Confirm Assumptions
 ↓
Implement
```

禁止：

> 在没有检查现有实现之前，根据自己的经验重新设计已经存在的系统。

---

# 10. Specification Model

推荐结构：

```text
constitution
      ↓
requirements
      ↓
design
      ↓
tasks
```

## 10.1 Constitution

Constitution 是项目长期原则，例如：

```text
1. Local-first where possible.
2. Public APIs require backward compatibility.
3. Critical features require automated verification.
4. Global architecture cannot be silently changed.
```

Constitution 不描述单个 Feature。

## 10.2 Requirements

回答：

> 系统必须做什么？

推荐 ID：

```text
REQ-AUTH-001
REQ-USER-002
REQ-PAY-003
```

示例：

```markdown
## REQ-AUTH-001

### Intent

用户可以安全登录系统。

### Requirement

WHEN a user submits valid credentials
THE SYSTEM SHALL authenticate the user.

### Acceptance Criteria

- valid credentials succeed
- invalid credentials fail
- expired credentials are rejected
```

## 10.3 EARS

适合形式化的需求可以使用：

```text
WHEN <condition>
THE SYSTEM SHALL <behavior>
```

EARS 是推荐格式，不是强制格式。

## 10.4 Design

回答：

> 如何满足 Requirements？

包括：

```text
Architecture
Data Model
API
State Machine
Sequence
Error Handling
Security
Performance
Testing
Migration
```

Requirement = WHAT  
Design = HOW

## 10.5 Tasks

Task 必须是 Agent 可以执行和验证的合理最小工作单元。

应明确：

```text
ID
Context
Input
Output
Files / Modules
Acceptance
Verification
```

---

# 11. Agent Roles

AEF 不要求所有项目必须 Multi-Agent。

复杂项目可使用：

```text
Product Agent
Architecture Agent
Planner Agent
Implementation Agent
QA Agent
Reviewer Agent
Release Agent
```

## Product Agent

负责：

- Intent
- Requirements
- Acceptance
- Ambiguity
- Scope

## Architecture Agent

负责：

- Architecture
- Domain Model
- Contracts
- Boundaries
- Technical trade-offs

## Planner Agent

负责：

```text
Requirements
 ↓
Design
 ↓
Tasks
```

## Implementation Agent

负责：

- 修改代码
- 编写测试
- Build
- 修复实现问题

禁止：

```text
silent requirement changes
silent architecture changes
inventing missing business rules
```

## QA Agent

负责：

- Tests
- Runtime verification
- Regression
- Acceptance
- Evidence

## Reviewer Agent

检查：

```text
Spec
Architecture
Code
Tests
Evidence
```

---

# 12. Self-Contained Story

复杂任务应该生成自包含 Story：

```text
Context
Problem
Requirements
Relevant Architecture
Constraints
Files / Modules
Acceptance Criteria
Verification
Expected Evidence
```

目标：

> Agent 不需要依赖历史聊天记录才能完成任务。

推荐模板：

```markdown
# Story

## ID
STORY-001

## Intent
Why this work exists.

## Context
Relevant system facts.

## Requirements
- REQ-001
- REQ-002

## Architecture
Relevant design references.

## Constraints
Important limitations.

## Tasks
- TASK-001
- TASK-002

## Acceptance
- [ ] Criterion 1
- [ ] Criterion 2

## Verification
- [ ] Build
- [ ] Tests
- [ ] Runtime

## Evidence
Expected evidence.

## Done
Exact completion definition.
```

---

# 13. Development Lifecycle

标准流程：

```text
Constitution
    ↓
Specify
    ↓
Clarify
    ↓
Design
    ↓
Plan
    ↓
Analyze
    ↓
Tasks
    ↓
Implement
    ↓
Verify
    ↓
Evidence
    ↓
Converge
```

## 13.1 Specify

输入 Human Intent，输出 Requirements。

目标：

> 明确做什么，不决定怎么实现。

## 13.2 Clarify

寻找：

```text
Ambiguity
Conflict
Missing Requirement
Edge Case
Hidden Constraint
```

低风险需求可以跳过。

## 13.3 Design

形成技术设计：

```text
Architecture
Data
Contracts
State
Errors
Security
Testing
```

## 13.4 Plan

将 Design 转换为：

```text
Implementation Strategy
Dependency Graph
Execution Order
```

## 13.5 Analyze

检查：

```text
Requirements ↔ Design
Design ↔ Tasks
Requirements ↔ Acceptance
Contracts ↔ Implementation
```

## 13.6 Tasks

状态：

```text
TODO
IN_PROGRESS
BLOCKED
DONE
FAILED
```

## 13.7 Implement

```text
Read Context
 ↓
Inspect Repository
 ↓
Select Task
 ↓
Implement
 ↓
Run Tests
 ↓
Collect Result
```

## 13.8 Verify

至少回答：

```text
Does it build?
Does it test?
Does it behave correctly?
Does it satisfy acceptance?
Did it introduce regression?
```

---

# 14. Evidence

Evidence 是完成状态的重要组成部分。

## E0 — No Evidence

只有 Agent 声称完成。

不可接受。

## E1 — Static Evidence

```text
Code inspection
Diff
Static analysis
```

## E2 — Build Evidence

```text
Build passed
Compilation passed
```

## E3 — Automated Test Evidence

```text
Unit
Integration
E2E
```

## E4 — Runtime Evidence

```text
Real runtime
Device
Production-like environment
```

## E5 — Acceptance Evidence

完整证明：

```text
Requirement
→ Implementation
→ Runtime
→ Acceptance
```

---

# 15. Definition of Done

Task：

```text
Implementation
AND Tests
AND Verification
AND Evidence
AND No unresolved blocker
```

Feature：

```text
All Tasks Done
AND Acceptance Passed
AND No Critical Regression
```

Release：

```text
Feature Done
AND Integration Verified
AND Release Checks Passed
```

---

# 16. Convergence

Convergence 是 AEF 的核心机制。

它检查：

```text
What we intended
        ↓
What we specified
        ↓
What we designed
        ↓
What we planned
        ↓
What we implemented
        ↓
What we verified
```

推荐矩阵：

| Requirement | Design | Task | Code | Test | Evidence | Status |
|---|---|---|---|---|---|---|
| REQ-001 | D-01 | T-01 | auth.ts | auth.test | E-01 | PASS |
| REQ-002 | D-02 | T-02 | user.ts | user.test | E-02 | PASS |
| REQ-003 | D-03 | T-03 | — | — | — | GAP |

状态：

```text
PASS
PARTIAL
GAP
CONFLICT
UNKNOWN
```

Convergence Loop：

```text
Converge
   ↓
GAP
   ↓
Create Task
   ↓
Implement
   ↓
Verify
   ↓
Evidence
   ↓
Converge
```

直到：

```text
CONVERGED
```

---

# 17. Failure Recovery

失败后不从头开始。

```text
Task
 ↓
Failure
 ↓
Evidence
 ↓
Diagnosis
 ↓
New Task
 ↓
Implementation
```

失败分类：

```text
Implementation Failure
Test Failure
Context Failure
Specification Failure
Architecture Failure
Environment Failure
Contract Failure
```

错误应该回到正确抽象层：

```text
Implementation Failure → Task
Test Failure           → Task / Implementation
Context Failure        → Context / Harness
Specification Failure → Requirements
Architecture Failure   → Design
Contract Failure       → Shared Contract
Environment Failure    → Environment
```

---

# 18. Incremental Change

AEF 支持增量变更，不要求每次修改都重跑整个项目 Spec。

Change 类型：

```text
Patch
Feature
Architecture Change
Breaking Change
```

## Patch

```text
Change
 ↓
Task
 ↓
Implement
 ↓
Verify
```

## Feature

```text
Change Proposal
 ↓
Affected Requirements
 ↓
Design
 ↓
Tasks
 ↓
Implementation
 ↓
Verification
 ↓
Convergence
```

## Architecture Change

必须检查：

```text
Affected Units
Affected Contracts
Affected Requirements
Migration
Backward Compatibility
```

## Breaking Change

必须有：

```text
Impact Analysis
Migration Plan
Compatibility Strategy
Acceptance Update
```

推荐：

```text
changes/
└── CHG-2026-001/
    ├── proposal.md
    ├── impact.md
    ├── requirements.md
    ├── design.md
    ├── tasks.md
    └── evidence.md
```

---

# 19. Knowledge Model

AEF 将项目知识分成三类：

```text
Canonical Knowledge
+
Working Knowledge
+
Evidence
```

## Canonical

长期有效：

```text
constitution
architecture
requirements
contracts
ADR
```

## Working

临时：

```text
plans
tasks
agent notes
debug logs
```

## Evidence

事实证明：

```text
test results
build results
runtime results
screenshots
```

---

# 20. 推荐目录结构

## Minimal

```text
.aef/
├── constitution.md
├── requirements.md
├── design.md
├── tasks.md
└── evidence/
```

## Standard

```text
.aef/
├── constitution.md
├── product/
├── architecture/
├── contracts/
├── units/
├── stories/
├── changes/
├── tasks/
└── evidence/
```

## Large Project

```text
.aef/
├── constitution.md
├── group/
│   ├── product/
│   ├── architecture/
│   ├── acceptance/
│   └── contracts/
├── units/
│   ├── ios/
│   ├── backend/
│   ├── web/
│   └── mcp/
├── stories/
├── changes/
├── tasks/
├── evidence/
├── agents/
└── workflows/
```

---

# 21. Agent Permission Model

Agent 不应拥有无限权限。

示例：

```yaml
role: backend-developer

input:
  - story
  - backend-context
  - relevant-contracts

allowed:
  - backend/**
  - tests/**

forbidden:
  - change global architecture
  - modify iOS code
  - change API contract silently

must:
  - run backend tests
  - provide evidence

escalate:
  - architecture conflict
  - contract conflict
  - missing business rule
```

原则：

> **Least Privilege**

---

# 22. Agent Communication

Agent 不应主要依赖自然语言聊天协作。

推荐：

```text
Artifact
Contract
Task
Evidence
Decision
```

即：

> **Artifact-based collaboration**

而不是：

```text
Agent A → chat → Agent B
```

---

# 23. Shared Contracts

跨 Unit 信息必须结构化：

```text
API Contract
Event Contract
Data Contract
MCP Contract
Authentication Contract
Error Contract
```

不同 Unit 可以独立实现，但必须遵守 Shared Contract。

---

# 24. Parallel Development

只有满足：

```text
Low Coupling
Stable Contract
Independent Context
Independent Verification
```

才应该并行。

```text
             Shared Contract
              /      |                iOS      Backend    MCP
           │          │        │
         Verify     Verify   Verify
              \       |      /
                 Integrate
                     ↓
                 Converge
```

---

# 25. Vertical Slice

复杂项目不应该：

```text
先完成全部 iOS
再完成全部 Backend
再完成全部 MCP
```

推荐：

```text
Requirement
 ↓
Backend
 ↓
MCP
 ↓
iOS
 ↓
End-to-End
 ↓
Evidence
```

即：

> **先打通一个真正可验证的业务闭环。**

---

# 26. Human-in-the-Loop

AEF 不追求完全移除人。

Human 应控制高价值决策：

```text
Product Intent
Architecture
Breaking Changes
Security
Release
```

Agent 可高度自动化：

```text
Implementation
Testing
Refactoring
Evidence Collection
```

原则：

> **Human controls high-value decisions; Agents execute repeatable work.**

---

# 27. 自动化等级

### Level 0 — Manual

Human 驱动每一步。

### Level 1 — Agent Assisted

Agent 执行，Human Review。

### Level 2 — Agent Orchestrated

多个 Agent 自动协作。

### Level 3 — Autonomous Loop

```text
Task
 ↓
Implement
 ↓
Verify
 ↓
Converge
 ↓
Fix
 ↓
Verify
 ↓
Converge
```

直到满足停止条件。

Level 3 必须设置：

```text
Max Iterations
Max Token Budget
Max File Changes
Max Runtime
Forbidden Paths
Approval Gates
Rollback
```

---

# 28. Stop Conditions

Agent 必须明确停止状态：

```text
CONVERGED
BLOCKED
NEEDS_DECISION
MAX_ITERATIONS
ENVIRONMENT_FAILURE
```

不能使用：

```text
"probably done"
```

作为工程状态。

---

# 29. Task State Machine

```text
DRAFT
  ↓
READY
  ↓
IN_PROGRESS
  ├──→ BLOCKED
  │       ↓
  │     READY
  │
  └──→ VERIFYING
          ↓
       VERIFIED
          ↓
       CONVERGING
        /          CONVERGED    GAP
                  ↓
               NEW TASK
```

---

# 30. Quality Gates

```text
Gate 1
Intent → Requirements

Gate 2
Requirements → Design

Gate 3
Design → Tasks

Gate 4
Tasks → Implementation

Gate 5
Implementation → Verification

Gate 6
Verification → Evidence

Gate 7
Evidence → Convergence
```

---

# 31. Risk-Based Workflow

不是所有需求都需要完整流程。

### Low Risk

```text
Task
 ↓
Implement
 ↓
Test
```

### Medium Risk

```text
Change
 ↓
Plan
 ↓
Implement
 ↓
Verify
 ↓
Converge
```

### High Risk

```text
Intent
 ↓
Requirements
 ↓
Clarify
 ↓
Architecture
 ↓
Analyze
 ↓
Tasks
 ↓
Implement
 ↓
Evidence
 ↓
Converge
```

---

# 32. Traceability

AEF 的关键能力是 Traceability：

```text
REQ-001
  ↓
DESIGN-001
  ↓
TASK-001
  ↓
commit abc123
  ↓
TEST-001
  ↓
EVIDENCE-001
  ↓
CONVERGED
```

它让 AI 项目拥有：

> 可追踪的工程证据链。

---

# 33. Source of Truth

不同事实必须有明确权威来源：

```text
Product behavior → Requirements
Architecture      → Architecture docs
API               → Contracts
Implementation    → Code
Runtime behavior  → Evidence
Historical decision → ADR
```

当两个来源冲突：

```text
Detect Conflict
 ↓
Report
 ↓
Resolve
 ↓
Update Source of Truth
```

Agent 不应该猜。

---

# 34. Git / CI/CD 关系

AEF 不替代 Git。

```text
Git
= Code History

AEF
= Engineering Intent + Execution + Evidence
```

Git 记录：

```text
what changed
```

AEF 记录：

```text
why
what should happen
how
which agent did it
how it was verified
whether it converged
```

CI/CD 是执行基础设施。

AEF 是工程控制层。

---

# 35. 与现有方法论的关系

AEF 不是简单复制某一个框架。

其设计借鉴：

```text
ZSpec
 → Group / Unit / Harness / Evidence / Recovery

Spec Kit
 → Intent-driven lifecycle / Convergence

Kiro
 → Requirements / Design / Tasks / EARS

BMAD
 → Specialized Agents / Guided Workflows

OpenSpec
 → Incremental Change / Lightweight Specs
```

最终形成：

```text
AEF
=
Engineering Structure
+
Spec Lifecycle
+
Agent Roles
+
Context Engineering
+
Evidence
+
Convergence
+
Incremental Change
```

---

# 36. Anti-Patterns

## Prompt-Only Development

```text
Prompt → Code
```

问题：没有持久意图、验证链和恢复能力。

## Giant Context

把整个 Repository、全部 Spec、所有历史聊天交给 Agent。

> Context 多 ≠ Context 好。

## Agent Self-Approval

```text
Agent writes code
Agent says done
```

不能作为完整验证。

## Spec Theater

Spec 很漂亮，但不进入 Task、Code、Test、Evidence、Convergence。

## Over-Specification

每改一个小功能都重建整个项目 Spec。

## Silent Architecture Drift

Agent 为解决局部问题偷偷改变全局架构。

## Chat-Based Handoff

依赖：

```text
“上一个 Agent 好像说过……”
```

应该改为：

```text
Artifact-based Handoff
```

---

# 37. AEF CLI 设想

如果未来实现 AEF CLI，可以设计：

```bash
aef init
aef constitution
aef specify
aef clarify
aef design
aef plan
aef analyze
aef tasks
aef implement
aef verify
aef converge
aef change
aef status
aef evidence
```

其中：

```bash
aef converge
```

应该成为最重要的命令之一。

---

# 38. AEF Status

推荐：

```bash
aef status
```

示例：

```text
Project: Example
Version: 1.4

Requirements
  18 total
  16 implemented
   1 partial
   1 gap

Tasks
  42 total
  39 done
   2 blocked
   1 pending

Verification
  Build: PASS
  Tests: PASS
  E2E: PASS

Convergence
  Status: GAP
  Critical gaps: 1

Next:
  TASK-AUTH-042
```

---

# 39. AEF Maturity Model

### Level 0 — AI Coding

```text
Prompt → Code
```

### Level 1 — Spec Assisted

```text
Spec → Agent → Code
```

### Level 2 — Structured Agent Development

```text
Requirements
→ Design
→ Tasks
→ Agent
→ Verify
```

### Level 3 — Engineering System

```text
Group
Unit
Context
Harness
Evidence
Convergence
```

### Level 4 — Agent Engineering Platform

```text
Multiple Agents
+
Parallel Units
+
Automated Evidence
+
Automated Convergence
+
Recovery
```

### Level 5 — Autonomous Software Factory

```text
Intent
 ↓
Planning
 ↓
Execution
 ↓
Verification
 ↓
Convergence
 ↓
Release
```

Human 主要负责：

```text
Vision
Strategy
Architecture Decisions
Risk
Approval
```

---

# 40. 核心原则

AEF 最终可以浓缩为 12 条：

1. **Intent before implementation.**
2. **Specification is persistent engineering knowledge.**
3. **Repository facts outrank Agent assumptions.**
4. **Global intent and local implementation must be separated.**
5. **Agents operate inside explicit boundaries.**
6. **Tasks must be executable and verifiable.**
7. **Completion requires evidence.**
8. **Failures return to the correct abstraction layer.**
9. **Small changes should remain small.**
10. **Cross-unit collaboration happens through contracts and artifacts.**
11. **Convergence is continuous, not final-only.**
12. **Human controls high-value decisions; Agents execute repeatable work.**

---

# 41. AEF Golden Loop

```text
        ┌───────────────────┐
        │      INTENT       │
        └─────────┬─────────┘
                  ↓
        ┌───────────────────┐
        │       SPEC        │
        └─────────┬─────────┘
                  ↓
        ┌───────────────────┐
        │    ARCHITECTURE   │
        └─────────┬─────────┘
                  ↓
        ┌───────────────────┐
        │      CONTEXT      │
        └─────────┬─────────┘
                  ↓
        ┌───────────────────┐
        │    PLAN / TASKS   │
        └─────────┬─────────┘
                  ↓
        ┌───────────────────┐
        │      AGENTS       │
        └─────────┬─────────┘
                  ↓
        ┌───────────────────┐
        │   IMPLEMENTATION  │
        └─────────┬─────────┘
                  ↓
        ┌───────────────────┐
        │   VERIFICATION    │
        └─────────┬─────────┘
                  ↓
        ┌───────────────────┐
        │     EVIDENCE      │
        └─────────┬─────────┘
                  ↓
        ┌───────────────────┐
        │   CONVERGENCE     │
        └─────────┬─────────┘
                  │
             ┌────┴────┐
             │         │
          CONVERGED   GAP
                       │
                       └──────────→ TASKS
```

---

# 42. 最终定义

AEF 不是：

> “让 Agent 写代码的方法。”

AEF 是：

> **让 Agent 能够在一个长期演进的软件项目中，基于明确意图、真实工程上下文、结构化任务和可验证证据，持续执行、失败恢复并最终收敛到正确结果的软件工程框架。**

它解决的核心问题不是：

> **How do we make AI write code?**

而是：

> **How do we make AI reliably participate in software engineering?**

因此 AEF 的核心不是 Prompt，不是 Agent，不是 Spec，甚至不是代码。

而是：

```text
Intent
   +
Context
   +
Execution
   +
Evidence
   +
Convergence
```

最终形成：

> **Agent Engineering Loop**

```text
Human Intent
     ↓
Structured Knowledge
     ↓
Bounded Agents
     ↓
Executable Work
     ↓
Evidence
     ↓
Convergence
     ↓
Reliable Software
     ↓
New Intent
     ↺
```

---

# Appendix A — Minimal Agent Contract

```markdown
# Agent Contract

## Role

## Input

## Output

## Allowed Scope

## Forbidden

## Verification

## Evidence

## Escalation

## Completion
```

# Appendix B — Minimal Convergence Checklist

```markdown
# Convergence Checklist

## Intent
- [ ] Original intent is preserved.

## Requirements
- [ ] All applicable requirements are implemented.
- [ ] No unresolved ambiguity remains.

## Architecture
- [ ] Implementation follows approved architecture.
- [ ] No unauthorized architecture drift exists.

## Tasks
- [ ] All required tasks are complete.

## Code
- [ ] Implementation is complete.
- [ ] No known critical issue remains.

## Verification
- [ ] Build passes.
- [ ] Tests pass.
- [ ] Relevant runtime behavior verified.

## Evidence
- [ ] Required evidence exists.
- [ ] Evidence is traceable to requirements.

## Final
- [ ] No unresolved GAP.
- [ ] No unresolved CONFLICT.
- [ ] Status = CONVERGED.
```

# Appendix C — One Sentence Version

> **AEF = Intent → Spec → Context → Agent → Evidence → Convergence.**

如果一套 AI 软件研发流程能够始终闭环这条链条，那么 Agent 就不再只是“会写代码的聊天机器人”，而真正成为软件工程系统中的执行单元。
