# Lab — Agent 工程能力库

> 一套**可复用的 Agent / AI 辅助工程纪律模块集合**（采用 ZSpec / AEF v1.0 架构）。  
> 每个模块独立、正交，按需挑选接入项目；规范以「单一事实源」方式集中在本库，项目里只放**指针 + 一句指令**。

---

## 快速导航

- 📖 **详细使用指南**：请阅读 [使用说明.md](使用说明.md)
- 📜 **工程宪法**：[constitution.md](constitution.md)
- 🤖 **Agent 维护守则**：[AGENTS.md](AGENTS.md)
- 📐 **架构与依赖图**：[group/architecture/dependency-graph.md](group/architecture/dependency-graph.md)
- 📦 **NPM 打包契约**：[group/contracts/npm-packaging.md](group/contracts/npm-packaging.md)

---

## 模块清单 (Units)

| 模块 (Unit) | 路径 | 解决什么 |
|---|---|---|
| **adr** | [`units/adr/`](units/adr/) | 架构决策记录（ADR），三档强度 light / standard / frozen，跨会话架构记忆 |
| **backlog** | [`units/backlog/`](units/backlog/) | 待办捕获：越界 / 待拍板 / 未来功能，一任务一文件 |
| **preflight** | [`units/preflight/`](units/preflight/) | 不变量探针 + Git 提交门禁，防止“做完才发现还有一件事” |
| **review-gate** | [`units/review-gate/`](units/review-gate/) | 本地 SAST 扫描 (OpenGrep) + 本地 review 门禁 |
| **handoffs** | [`units/handoffs/`](units/handoffs/) | 跨仓 / 仓内离线交接枢纽（`handoff.mjs` 引擎） |
| **playbook** | [`units/playbook/`](units/playbook/) | Agent Engineering Framework (AEF) 完整方法论手册与模板库 |

> **向后兼容提示**：根目录下保留了指向各 Unit 的同名软链接（如 `lab/preflight`、`lab/handoffs` 等），确保已接入的本地项目路径不受任何影响。
