# 09 — Agent Skills 两级体系

## 1. 为什么 Skill 而不是全塞 AGENTS.md

Skill 是**按需懒加载**的能力包：系统提示里只有 `name + description`（几十 token），正文 `SKILL.md` 及其 references 只在 Agent 判定相关时才读进上下文。

这是 Anthropic 明确的 2026 转向：

> "不要把 CLAUDE.md 做成'所有已知实践的中央仓库'……用 skills + references 懒加载（progressive disclosure）。"

好处：
- 常驻上下文小（[03 章 §4](03-units.md) 的 150 行预算才守得住）
- 规范可以写很细（不占常驻额度）
- 项目约束能**覆盖**第三方 skill 的默认建议（优先级见 §3）

## 2. 两级结构

```
【项目级】最高优先，随仓库分发，进 .agents/skills/<name>/
   例：ios-vibe-coding
       ├── SKILL.md              行为约束（硬性）
       └── references/
           ├── no-liquid-glass.md
           ├── build-verify.md
           └── accessibility-checklist.md

【全局级】用户级，跨项目共享，~/.agents/skills/（或 ~/.claude/skills/）
   例：swift / swiftui / swift-concurrency / swiftdata / swift-testing
       backlog-capture / diagnose / tdd / triage ...
```

- **项目级**：只放**这个项目特有**的约束（技术栈版本基线、钉死的 UI、本项目的验证流程）。跨项目通用的规范（Swift 语言本身怎么写）放全局。
- **全局级**：跨项目复用；由宿主（OpenCode / Claude Code / WorkBuddy）自动发现、按需懒加载。

## 3. 优先级规则

写进根 AGENTS.md（硬性）：

```
项目约束 > 第三方/全局 Skill 的默认建议
任何 Swift/SwiftUI 任务开始前，agent 应先读取项目级 skill 并遵守其约束。
```

冲突时**不许折中**——如果项目约束与 skill 冲突，说明有一方该更新了（走独立 review，不在任务里顺手改）。

## 4. 项目级 skill 至少要有什么

以 OWSEL `ios-vibe-coding` 为样板：

| 段 | 内容 |
|---|---|
| 硬性技术约束 | 严格 Swift 6；禁止引入某特性（Liquid Glass / `glassEffect`）|
| 样式权威 | 颜色必须走 `Theme.*` token，禁止硬编码 hex |
| 冻结区 | 引 ADR 编号："9:16 详情页已钉死（ADR-007），F-1~F-9 逻辑严禁改动" |
| 流程约束 | 改动前先理解现有架构、优先改现有代码、避免过度抽象 |
| 验证要求 | 改完必须 Build 验证；UI 必须过 Accessibility |
| references/ | 长清单拆成子文件，SKILL.md 只留指针 |

**注意"冻结区"写法**：具体约束 → ADR 编号 → 细节在 ADR。与 [05 章 §3.3](05-adr.md) 同理，避免约束散落多处失去同步。

## 5. 拆分判断（progressive disclosure）

```
这条规范是"所有任务都需要"吗？
├── 是 → 写进 Unit AGENTS.md（常驻）
├── 否，某类任务需要 → 独立 Skill（懒加载）
└── 否，且很长 → Skill + references/ 子文件（二次懒加载）
```

经验值：`SKILL.md` 正文 < 300 行；超了就拆 references。

## 6. 新项目接入

1. 建 `.agents/skills/<project-skill>/SKILL.md`，按 §4 模板写
2. 根/Unit AGENTS.md 写明路径与优先级（§3）
3. 通用 skill 从全局目录复用，**不要复制进项目**（复制 = 分叉 = 日后不一致）

---

## 落地动作

1. 至少建一个项目级 skill，覆盖本项目的技术栈硬约束。
2. 根 AGENTS.md 加优先级规则句（§3 原文）。
3. 数一遍常驻上下文：AGENTS.md + skill description 总量是否还合理。

> AEF 原文对应章节：§8 Context Engineering、§4 Context（Layer 4）、§36 Anti-Patterns（Giant Context）。
