# <Unit 名> Unit

## Overview
<两三行：这一端是什么、在整体里承担什么角色。>

## Tech Stack
- <语言/框架 + 版本基线，例：Swift 6 / iOS 27 / SwiftUI>
- <构建工具>

## Responsibilities
- <这端负责什么>
- **不负责**：<明确排除，防止越界>

## Dependencies
- 契约：`group/contracts/api.md`（只读；变更须走 ADR + 依赖协调图）
- 依赖顺序：见 `group/architecture/dependency-graph.md` 表 3

## Design System / 样式权威
- <如适用：主题 token 文件路径，禁止硬编码>
- <设计源：Figma 链接 / ADR 编号>

## Verification
**这是"完成"的定义，必须是可直接执行的命令。**

| 级别 | 命令 |
|---|---|
| E2 Build | `<build command>` |
| E3 Test | `<test command>` |
| E4 Run | `<运行 + 截图/e2e 取证方式>` |

## CodeGraph
本 Unit 已建 `.codegraph/` 索引。理解/定位代码时先跑
`codegraph explore "<符号/问题>"` 取源码+调用链，再考虑 grep/Read；
改完代码跑 `codegraph sync`。**没有 `.codegraph/` 就不要替它 init。**

## Project Skills
本端强制读的项目级 Skill：
- `<skill-name>`（路径 `.agents/skills/<skill-name>/`）
  - 硬约束：<一句话>
  - 冻结区：<ADR 编号> —— 细节读 ADR 原文，此处不复制

## Forbidden
- ❌ <硬禁令一>（ADR-NNN）
- ❌ <硬禁令二>（ADR-NNN）
- ❌ 直接读改其他 Unit 的实现代码

> 写 ADR 编号 + 一句话，细节让 Agent 读 ADR 原文，避免多处同步。

## Agent Guidelines
- 修改前先理解现有架构，优先改现有代码，避免过度抽象
- 改动后必须跑 Verification 并贴证据
- 本 Unit 的约束 > 第三方 Skill 的默认建议
