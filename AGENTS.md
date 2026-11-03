# Lab Agent Engineering Toolkit

## Overview
本仓库是可复用的 Agent / AI 辅助工程能力库，为软件项目提供正交、可插拔的研发纪律机件与规范。

## Repository Layout (ZSpec / AEF v1.0)
```
constitution.md      最高宪法（单一事实源、门禁原则、无感兼容）
group/               全局事实层
  ├── product/       产品意图 (intent.md)
  ├── architecture/  拓扑依赖图 (dependency-graph.md)
  └── contracts/     打包与分发契约 (npm-packaging.md)
units/               独立工程单元（各模块自治上下文）
  ├── handoffs/      跨仓/仓内工作流交接中枢与 CLI 引擎
  ├── preflight/     仓库不变量探针与提交门禁
  ├── review-gate/   SAST 扫描与代码质量防线
  ├── adr/           架构决策记录机制与模板
  ├── backlog/       待办捕获制度与模板
  └── playbook/      Agent Engineering Framework 方法论全集
specs/               Spec Kit 规划与实施产物
docs/                辅助文档与待办 (docs/backlogs/)
<module> (symlinks)  根目录向后兼容软链接，无缝保障已有消费项目
```

## Isolation & Unit 规则
1. **Unit 自治**：各 Unit 独立维护自身的 `VERSION.md`、`CHANGELOG.md` 及核心规范。
2. **禁止破坏根目录兼容层**：根目录下的软链接（`handoffs`、`preflight` 等）必须保持完好，确保现有消费方不中断。
3. **运行态与能力库严格分离**：`units/handoffs/` 内的交接票据与回执属于本地使用记录，严禁进入 git 跟踪或打包发布。

## Key Documents
- `constitution.md` — 仓库最高宪法（修改须人类审核）
- `group/product/intent.md` — 产品意图
- `group/architecture/dependency-graph.md` — 依赖关系与发布节奏
- `group/contracts/npm-packaging.md` — NPM 打包与发布契约

## Agent Guidelines
- 读取上下文顺序：**本文件 → `constitution.md` → 目标 Unit 的 `AGENTS.md` 与 `README.md`**。
- 对任一 Unit 的改动，必须在该 Unit 内完成更新、测试并更新对应的 `VERSION.md` 与 `CHANGELOG.md`。
- 修改脚本文件（`*.sh` / `*.mjs`）必须保持 POSIX 兼容性或纯 Node 原生模块依赖。
- 未经请求不得随意引入重量级第三方依赖。
