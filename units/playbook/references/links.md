# References — 外部链接索引

本手册每条原则的英文互联网出处，以及各工具的权威文档。

## 框架与规范

| 资源 | 链接 | 用途 |
|---|---|---|
| **AEF 原文** | `Agent-Engineering-Framework-AEF-v1.0.md`（本目录） | 本手册的权威框架 |
| **GitHub Spec Kit** | https://github.com/github/spec-kit | SDD 流程；命令参考 `docs/reference/agentic-sdd.md` |
| Spec Kit Docs | https://github.github.com/spec-kit/ | 安装、extension、preset、workflow |
| **AGENTS.md 标准** | https://agents.md/ | 指令文件规范；冲突规则"最近优先" |
| **Handoff 契约** | `~/Documents/lab/handoffs/README.md`（本地） | 跨仓交接契约 + `handoff.mjs` CLI |

## 关键文章（按主题）

### 多 Agent 协作与并行
| 主题 | 出处 |
|---|---|
| 写操作单线程 / swarm 是干扰项 / map-reduce-and-manage | [Cognition — Multi-Agents: What's Actually Working](https://cognition.com/blog/multi-agents-working) |
| 一 Agent 一分支的黄金法则、任务-Agent 匹配表 | [Sal's 2026 AI Coding Stack（git worktrees）](https://gist.github.com/selcukcift/32868c0746f5fe5e14a35c1f5a89e634) |
| 容器隔离 + 文件锁抢任务 | [Anthropic — Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler) |
| 结构化 JSON + git commit 通信（misalignment 是头号失败原因） | [CAID, arxiv 2603.21489](https://arxiv.org/html/2603.21489v2) |
| subagent 不能 spawn subagent → 编排器必须是主会话 | [One Agent Per Repo](https://dev.to/just_an_electron/one-agent-per-repo-an-orchestration-pattern-for-multi-repo-ai-coding-49ba) |
| 并行 Agent 共享一次索引（省 token） | [Tempest](https://github.com/tempestai-dev/tempest) |
| 多 Agent 编排模式（Router / Pipeline / Swarm） | [Agentic Roadmap — subagents orchestration](https://isfhan.github.io/learn-agentic-coding/read.html?path=steps%2F12-subagents-orchestration.md) |

### 多仓 / 跨端依赖
| 主题 | 出处 |
|---|---|
| Repo Coordination Graph（依赖图 + 合并顺序）、per-repo operating manual | [mabl — shipping code across 75+ repos](https://www.mabl.com/blog/how-we-built-a-system-for-ai-agents-to-ship-real-code-across-75-repos) |
| System Agent + Repo Agent + 人类门 | [AgoraIO ai-devkit — multi-repo orchestration](https://github.com/AgoraIO-Community/ai-devkit/blob/main/docs/multi-repo-orchestration.md) |
| 跨仓 IssueOps / 中央跟踪仓 | [GitHub Agentic Workflows — MultiRepoOps](https://github.github.com/gh-aw/patterns/multi-repo-ops) |
| API contract + 前后端 mismatch 检测 + handoff ticket | [AppHandoff MCP](https://github.com/TeamK2K/apphandoff-mcp) |

### 上下文工程 / 记忆 / Harness
| 主题 | 出处 |
|---|---|
| compaction / 结构化笔记 / 多 Agent 架构 | [Anthropic — Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) |
| context reset + 结构化交接件 vs compaction；自评估问题 | [Anthropic — Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps) |
| Agent 自称完成 → 必须给 e2e 验证工具；起步序列（pwd/git log/progress file） | [Anthropic — Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) |
| CLAUDE.md 不做中央仓库；skills + references 懒加载；Rubric | [Anthropic — The new rules of context engineering](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models) |
| Skill = 渐进披露；SKILL.md + references 结构 | [Anthropic — Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) |
| CLAUDE.md 当项目计划书；CHANGELOG.md 当实验室笔记；Ralph loop | [Anthropic — Long-running Claude for scientific computing](https://www.anthropic.com/research/long-running-Claude) |

### ADR
| 主题 | 出处 |
|---|---|
| **最近 3–5 条 ADR 效果最佳；仅 accepted 入索引；context > 模型规模** | [arxiv 2604.03826 — Context Matters](https://arxiv.org/abs/2604.03826) |
| append-only + supersede；模板十一选一；带 Claude Code skill | [architecture-decision-record](https://github.com/architecture-decision-record/architecture-decision-record) |
| ADR 启动即写、不改原文、记录 Confidence | [Microsoft Well-Architected — Maintain an ADR](https://github.com/MicrosoftDocs/well-architected/blob/main/well-architected/architect-role/architecture-decision-record.md) |
| ADR 作为 per-repo 架构记忆（hook 注入、依赖变更提示） | [adr-agent (PyPI)](https://pypi.org/project/adr-agent) |
| Agent 治理视角的 ADR 集合与状态机 | [Microsoft Agent Governance Toolkit — ADR](https://microsoft.github.io/agent-governance-toolkit/adr) |
| PR 改代码无 ADR 则 CI 失败 | 见 architecture-decision-record README 的 "ADR Guard" |

### Spec-driven development 选型
| 主题 | 出处 |
|---|---|
| 6 框架对比（Spec-Kit / Spec Kitty / BMad / OpenSpec / Kiro / Tessl） | [cameronsjo/spec-compare](https://github.com/cameronsjo/spec-compare) |
| 4 方法对比（BMAD / OpenSpec / Spec-Kit / AI-DLC） | [whatevergeek/sdd_review](https://github.com/whatevergeek/sdd_review) |
| Spec Kit vs Kiro vs OpenSpec 工程视角（2026） | [tunicyberlabs comparison](https://tunicyberlabs.com/en/blog/spec-driven-development-tooling-2026-spec-kit-kiro-openspec) |
| BMAD Method | https://github.com/bmad-code-org/BMAD-METHOD |

### 中途需求变更 / spec 漂移
| 主题 | 出处 |
|---|---|
| **spec 单独成文必漂移；代码 + spec 同 commit + 漂移校验器** | [Spec Growth Engine, arxiv 2606.27045](https://arxiv.org/abs/2606.27045) |
| 中途变更 → 跨 PRD/epics/架构/UX 影响评估 → 变更提案 → 人批准 | [BMAD `correct-course` skill](https://github.com/bmad-code-org/BMAD-METHOD) |
| Acknowledge → Assess（挤掉什么）→ Options（带代价）→ Approve 的变更流程 | [GitScrum — Handling Scope Changes Mid-Sprint](https://docs.gitscrum.com/en/best-practices/handling-scope-changes-mid-sprint) |
| 变更 ≠ 问题；CR 模板（effort/timeline/cost/risk/options） | [company-in-a-box — scope-change playbook](https://github.com/fom-dev/company-in-a-box/blob/main/playbooks/scope-change.md) |

### 任务状态纪律 / 防遗忘
| 主题 | 出处 |
|---|---|
| **先建任务再动手 / 永不删除 / 单 in-progress / 偏离协议 / 压缩前检查点** | [oryanmoshe — tracking-tasks skill](https://github.com/oryanmoshe/agent-skills/blob/main/skills/tracking-tasks/SKILL.md) |
| 任务必须落盘成 git 版本化的 TODO.md，会话内列表是封闭系统 | [ai-todo](https://github.com/fxstein/ai-todo) |
| 事实 / 任务 / 执行三层记忆分离，扛住 context compaction | [mneme](https://github.com/CVPaul/mneme) |
| 15–50 次调用后目标漂移（lost in the middle）→ 重读计划/todo 当锚 | [coding-agents — memory-and-continuity](https://github.com/enea-scaccabarozzi/coding-agents/blob/main/docs/synthesis/memory-and-continuity.md) |
| 跨会话任务丢失 → `.tasks/` 目录 + Review→Work→Update 循环 | [agent-backlog](https://github.com/mdziedzi/agent-backlog) |

### 回归防护 / 影响面分析
| 主题 | 出处 |
|---|---|
| **改动前依赖图影响分析：测试回归 6.08% → 1.82%** | [TDAD, arxiv 2603.17973](https://arxiv.org/abs/2603.17973) |
| 改前影响分析 skill：直接/传递依赖 + 受影响测试 + 风险评分 | [ripple](https://github.com/simota/agent-skills/blob/main/ripple/SKILL.md)、[impact-analyzer](https://github.com/biyer/impact-analyzer) |
| LSP 驱动的爆炸半径：breaking/ripple/tests/git co-change | [blast-radius (br)](https://github.com/buddyh/blast-radius) |
| **characterization / golden master / approval test 是同一个东西** | [understandlegacycode — Approval Tests](https://understandlegacycode.com/approval-tests)、[Wikipedia — Characterization test](https://en.wikipedia.org/wiki/Characterization_test) |
| 固定 seed 轰炸 + 录输出的 golden master 做法 | [Codurance — Testing Legacy Code with Golden Master](https://www.codurance.com/publications/2012/11/11/testing-legacy-code-with-golden-master) |
| **golden 诚实四律**：确定性先行 / 刻意 bless / 看 diff / 钉输入 | [test-oracle — golden-master reference](https://github.com/PSthelyBlog/test-oracle/blob/main/skills/mutation-testing/reference/golden-master.md) |
| 按改动选测试（build 依赖图 → 预测式选测） | [Predictive Test Selection, arxiv 1810.05286](https://arxiv.org/html/1810.05286v2) |

## 工具

| 工具 | 用途 | 手册章节 |
|---|---|---|
| `specify-cli`（Spec Kit） | SDD 流程 | [06](../docs/06-spec-kit.md) |
| `codegraph` | 符号索引与调用链 | [08](../docs/08-codegraph.md) |
| `handoff.mjs` | 跨仓交接 | [10](../docs/10-handoff.md) |
| `backlog-capture` skill | 待办捕获 | [07](../docs/07-backlog.md) |

---

*维护约定：本文件只放链接和一句话用途，不放正文摘录——正文会过期，链接不会。*
