# 11 — Evidence 与 Definition of Done

## 1. 核心立场

> **Agent 说"完成了"不算完成。** 完成必须由外部工具产出证据（宪法 T3、AEF G4）。

这不是形式主义。Anthropic 在 harness 实验里的原话：

> Agent 倾向于改完代码、跑两个单测就宣称完成，却没意识到功能端到端根本不工作……必须**显式提供验证工具**（浏览器自动化 + 截图），Agent 才会以真实用户视角验收。

**结论：Evidence 的本质是"给 Agent 一个它自己骗不过去的验证工具"。**

## 2. 证据分级 E0–E5（AEF §14）

| 级 | 名称 | 是什么 | 例子 |
|---|---|---|---|
| E0 | No Evidence | 只有 Agent 的口头声称 | ❌ "已完成" |
| E1 | Static Evidence | 静态可查的事实 | `codegraph explore` 调用链、lint 输出、diff 审阅 |
| E2 | Build Evidence | 编译/构建通过 | `xcodebuild` / `go build` / `tsc` 完整日志 |
| E3 | Automated Test | 自动化测试通过 | 单测/集成测试报告 + 覆盖率 |
| E4 | Runtime Evidence | 真实运行行为 | 启动服务、e2e 跑通、日志、截图 |
| E5 | Acceptance Evidence | 对照验收标准的确认 | 逐条 acceptance criterion + Convergence Checklist 签字 |

**规则**：
- 常规 feature 收尾至少 **E2 + E3**；改 UI/交互的必须 **E4**（截图或 e2e 录屏）
- 跨 Unit 或架构级改动必须到 **E5**
- **E0 不允许出现在收尾报告里**——写了等于没写

## 3. 取证工具清单（每个 Unit 自定，写进 AGENTS.md）

AGENTS.md 的 Verification 段必须给出**具体命令**，而不是"跑测试"：

```markdown
## Verification
- Build:  `xcodebuild -scheme Owsel build`         → E2
- Test:   `xcodebuild test -scheme Owsel`           → E3
- Run:    手动/模拟器截图 + Accessibility 检查        → E4
- A11y:   references/accessibility-checklist.md 逐条 → E4
```

跨端额外取证：

| 端 | E4 常用取证 |
|---|---|
| iOS | 模拟器截图、XCUITest 录屏、Instruments |
| Backend | curl 全链路请求 + 响应日志、容器启动日志 |
| MCP | MCP 客户端工具调用往返记录 |

**取证产物放哪**：
- 命令输出类 → 收尾报告直接贴关键片段（全文可放 `evidence/`）
- 截图/录屏 → `evidence/<feature-id>/`
- 自动生成的报告 → 就地引用路径

不要把 `evidence/` 变成垃圾场：只放**收尾报告引用到的**东西。

## 4. Definition of Done（AEF §15）

一个 feature "Done" 需要同时满足：

```
□ Spec 中每个 acceptance criterion 都有对应 Evidence 级别 ≥ 要求
□ Code 通过 Build (E2) + Test (E3)
□ 改动点有 codegraph explore 级别的影响面确认 (E1)
□ 影响面清单里的回归测试已跑过（11 章 §6，改动前产出的清单）
□ 涉 UI 的有运行时证据 (E4)
□ 宪法 Constitution Check 无 CRITICAL
□ 未完成项已回写 tasks.md 或进 docs/backlogs/（07 章）
□ 跨仓改动 handoff check exit 0（10 章，如适用）
□ Convergence Checklist 全绿（见下）
```

## 5. Convergence Checklist（AEF 附录 B）

收尾时逐条打勾，任何一条不绿就不能宣称 Converged：

```markdown
## Intent       □ 结果回到 constitution / intent 的原始意图
## Requirements □ 每条需求都被实现或显式标为 deferred
## Architecture □ 未违反任何 Accepted ADR；架构级改动有新 ADR
## Tasks        □ tasks.md 与实际改动一致，多余项已删
## Code         □ build 通过，无新增 warning
## Verification □ E 级别达标，证据路径有效可打开
## Evidence     □ 收尾报告里每个"已完成"都挂了证据
## Final        □ backlog 已记录越界项；handoff check 通过
```

## 6. 回归防护：E 级别证明"新东西能用"，还不够

以上章节验收的是**本次改动**。但真实事故更多来自**没打算动的旧代码被连带弄坏**——而旧代码往往一行测试都没有。三道防线，按顺序用：

### 6.1 改动前：影响面分析（blast radius）

**先回答"我改这个会打破什么"，再动手。**（E1 级证据，但是产出在改动**之前**）

```
□ 直接依赖者：谁 import / 引用了它
□ 传递依赖：调用链再往下 2–3 层
□ 受影响测试：哪些测试覆盖这块（列出要跑的命令）
□ 契约面：有没有跨 Unit / 对外接口被改
```

工具形态：`codegraph explore`（本手册 08 章）、`ripple` / `impact-analyzer` / `blast-radius` 这类 pre-change skill，或语言服务器的 find-references。量化依据：TDAD 论文（arxiv 2603.17973）在改动前做依赖图影响分析，把测试回归率从 **6.08% 降到 1.82%**。

**没有依赖图就靠 grep，也要产出一份"受影响文件清单"**——空白的分析比没有分析更危险，因为它长得像结论。

### 6.2 动手前：给没测试的既有行为钉"特征化测试"

要改的代码没有测试 → **先补测试再改代码**，顺序不能反：

1. **characterization test / golden master**（Michael Feathers）：观察现有代码在固定输入下的实际输出，把它录成断言。不判断对错，只钉住"现在就是这样"。
2. 大而复杂的结果（序列化输出、报表、codegen）用 **approval/snapshot test**：第一次跑生成基线文件，人工看过后批准（approve），以后每次跑都和基线 diff。
3. 随机输入用**固定 seed**，保证可重复——几千个固定 seed 的输入轰炸一次，录下输出，就够保护一大坨无人能懂的代码。

有了它，"改完不知道谁弄坏的" 变成 "diff 告诉你输出变了"。

### 6.3 bless 纪律：golden 的价值全在 diff

四条规则，缺一条 golden 就会退化成噪音：

| 规则 | 内容 |
|---|---|
| **确定性先行** | 基线里不许有 `Date.now()` / `random()` / 非确定迭代序 / 绝对路径。输出不确定 = flaky golden，几次之后就没人信它 |
| **刻意 bless** | golden 变了是一个**决策**：是预期变更（更新基线，并在 PR 里让人看 diff）还是意外漂移（= bug）。**禁止无脑 `--update-snapshots` 让 CI 变绿** |
| **看 diff，不只看红绿** | golden 存在的意义就是输出变化时给你一份可读的 diff——读它 |
| **钉死输入** | fixture / seed / 尺寸是 oracle 的一部分，改输入 = 换了被验证的东西 |

### 6.4 收尾时：把旧的也跑一遍

- 影响面清单里的测试**全部跑过**，不只跑本次改动的测试
- 证据（收尾报告）里贴回归结果；跑不了全量就写明跑了哪部分、为什么
- 这一条进 [12 章](12-gates.md) 收尾门禁

### 6.5 发现进回报前必跑命令（readback，18 章 R4）

**收尾时上报的每一条"既有状态/发现"，都要先实跑命令核验，再加进回报。** "我记得 / 应该是 / 据说"——无论出自自己还是他人——都必须在进回报前 readback。这是最致命的失效模式：未验的结论会制造假待办、稀释真待办；而 [18 章](18-shift-left.md) §3 的反转证明，连审慎的复核 Agent 也会不跑命令就把正确陈述判成"幻觉"。

推论：**否定任何结论（含他人）前先跑命令**，不凭印象。

## 7. 反模式

| 反模式 | 表现 | 拦截 |
|---|---|---|
| **Agent Self-Approval** | Agent 自己说"验证过了"，没有输出物 | 证据必须来自工具输出，不是自然语言 |
| **选择性取证** | 只贴通过的测试，隐藏失败的 | 收尾报告必须列**失败/跳过**的项 |
| **过期证据** | 贴了改代码之前的构建日志 | 证据时间戳必须晚于最后一次改动 |
| **E 级别降级** | 改了 UI 却只贴单测 | 对照 §2 规则，门禁里写死各级要求 |
| **只跑新测试** | 本次改动的测试全绿，隔壁模块被弄坏没人知道 | §6.1 影响面清单里的测试必须一起跑 |
| **无脑 bless** | golden 红了就 `--update-snapshots` 一把梭 | 基线变更必须附 diff 人审，见 §6.3 |
| **没测试就动手** | 直接改没有测试覆盖的既有代码 | §6.2 先补特征化测试，顺序不可反 |
| **未验就上报** | "我记得是 177 行"当既有状态说出 | §6.5 进回报前先跑命令核验（readback）|

---

## 落地动作

1. 每个 Unit 的 AGENTS.md Verification 段写成"命令 → E 级别"的表。
2. 收尾报告模板里把 E0 拉黑，强制填证据路径。
3. 建 `evidence/`，并约定命名 `evidence/<feature-id>/`。
4. 把 [12 章](12-gates.md) 的门禁表贴进根 AGENTS.md。
5. 根 AGENTS.md 加 §6 的三条硬句：**改动前先出影响面清单；无测试的既有行为先补特征化测试再动手；golden 变更必须人看 diff，禁止无脑更新基线。**
6. 收尾报告模板加一栏"回归结果"（跑了哪些清单外的测试）。

> AEF 原文对应章节：§14 Evidence（E0–E5）、§15 Definition of Done、§16 Convergence、附录 B Convergence Checklist、G4 Verifiable Execution、§18 Incremental Change（小步改动 + 回归可查）、§28 Stop Conditions。
