# spec-guard (drift-gate) — 全局架构漂移与规约守卫

> 本目录是「规约与实现脱钩 / 架构漂移 / 装饰性空壳接线」治理的**单一事实源**，独立于任何具体业务项目。
> **理论背书**：ThoughtWorks 架构适应度函数（Fitness Functions）、Google No Premature Dead Abstractions 哲学、Cyrille Martraire 活文档（Living Documentation）。
> **同范式模块**：`units/adr`（决策事实源）、`units/preflight`（不变量门禁）、`units/review-gate`（SAST 静态防线）、`units/orphan`（孤儿资产清道夫）。
> **接入方式**：项目通过 `$(lab path spec-guard)` 脚本与 CLI 接入，**严禁**在消费方内联复制规则正文（防漂移）。

---

## 0. 这是什么 / 为什么独立

在 Agent 辅助工程与自顶向下设计体系中，存在一个经典的破坏性失真循环：
1. **半山腰挂起（Top-Down Spec Hang）**：架构师或 Agent 在撰写并冻结顶层架构决策（ADR）时，为了让规范显得完备，过早把纯算法写进了生产代码（`src/main/`），但底层调度、跨端通信与业务锁尚未就绪；
2. **死代码误杀**：几天后静态扫描（如孤儿清理工具）将这批函数当作“零引用代码”删掉，导致 Frozen ADR 与实现彻底脱节；
3. **装饰性空壳接线（Shallow Wiring）**：若为了通过门禁在守护循环中挂一行空调用，调用图（CallGraph）虽全绿，但底层根本未做业务互锁与条件判断，形成了更隐蔽的带病运行。

**「调用图可达」≠「语义闭环」**。
本模块从 playbook 与 Tappy 事故治理经验中抽离为**正交、自洽、可版本化**的独立单元，用客观机器手段守护“顶层意图 ↔ 机器断言 ↔ 生产代码”三元闭环。

---

## 1. 核心铁律（不可违反）

1. **P3′ 三元映射对账（Triad Mapping）**：
   每一个关键架构不变量（如 ADR Invariant `H-1`）必须强制绑定至少一条**可机判断言（Machine Assertion）**。门禁校验的是“不变量断言覆盖率”，而非“符号是否有调用点”。
2. **Code-as-Spec-Matrix（代码即矩阵，零 YAML 摩擦力）**：
   CLI 默认通过 AST/源码直接扫描各语言的 `@Invariant("ADR-XXX:H-Y")` 注解与 ADR 文本中的 `## Implementation Status`，在内存中动态构建对账矩阵。`spec-matrix.overlay.yml` 仅作为跨端/跨语言协议层按需覆写（Overlay）。
3. **防伪铁律（No-Cheat Rule）**：
   测试类（`src/test/`、`tests/`、`*_test.go` 等）中对算法原型的直接调用，**一律不计入生产可达性证明**。未接线算法若需提前沉淀，必须标注 `@ContractOnly`。
4. **严格词界防假阳性（Strict Word Boundaries）**：
   所有 Invariant 匹配强制遵循严格边界正则（`(?<=^|[^a-zA-Z0-9_-])ADR-\d+:[A-Z]-\d+(?=$|[^a-zA-Z0-9_-])`），严禁裸子串匹配，坚决杜绝 `H-1` 误伤 `H-10` 或 `H-1-OBSOLETE`。
5. **只出报告、不改状态（Evidence-Driven, Never Auto-Mutate）**：
   遵循 `units/adr` 宪法（append-only + 用户单句批准 + 🔒Frozen 不可逆）。`spec-guard` 只产出机器证据报告，**严禁通过脚本擅自将 ADR 修改为 🔒Frozen**。

---

## 2. 命令行与功能 (CLI Usage)

```bash
# 查看帮助
spec-guard --help
# 或通过中央调度
lab spec-guard --help

# 1. 初始化项目配置与预置模板
spec-guard init

# 2. 扫描并对账全仓规约覆盖率与架构漂移
spec-guard check [--strict] [--overlay <path>]

# 3. 针对指定 ADR 产出机器审计证据报告（冻结前的机器背书）
spec-guard audit-adr ADR-060 [--out report.md]
```

### 输出状态语义 (Reconciliation Statuses)
- `✅ VERIFIED`：ADR Invariant 既有生产代码接线，又有可机判断言覆盖并通过；
- `📦 SANDBOXED`：标注了 `@ContractOnly` 的算法原型（存在测试断言，生产未接线，处于垂直切片初级阶段，受保护不被当死代码误删）；
- `⏳ IN_PROGRESS`：有部分实现或单测，但尚未形成完整闭环；
- `🚨 DRIFT_DETECTED`：ADR 声称已实现（`✅ 已实现`）或已 `🔒Frozen`，但代码库中**零断言**或**生产零接线**；
- `⚠️ ORPHAN_ASSERTION`：代码中标记了 `@Invariant`，但在 ADR 中不存在对应不变量定义。

---

## 3. 多语言断言打标规范 (Polyglot Annotations)

无需引入重型外部依赖，使用标准注解或约定格式注释即可：

| 语言栈 | 机器断言打标形式 (Machine Assertion Anchor) | 沙箱隔离标记 (Sandbox / Unwired Marker) |
|---|---|---|
| **Kotlin / Java** | `@Test @Invariant("ADR-060:H-1")` | `@ContractOnly(adr = "ADR-060", expire = "2026-12-01")` |
| **Python** | `@pytest.mark.invariant("ADR-060:H-1")` 或 `# [INVARIANT: ADR-060:H-1]` | `@contract_only(adr="ADR-060", expire="2026-12-01")` |
| **Golang** | `// Invariant: ADR-060:H-1`（放在 `TestXxx` 上方） | `// [CONTRACT-ONLY: ADR-060]` |
| **TypeScript / Node** | `// @invariant ADR-060:H-1` 或 `it('...', { tags: ['INV:ADR-060:H-1'] })` | `/** @contractOnly ADR-060 */` |
| **Rust** | `#[test] #[doc = "invariant: ADR-060:H-1"]` | `#[cfg(feature = "contract-sandbox")]` |

---

## 4. 与 lab 其他单元的协同编排

1. **协同 `lab adr`**：
   - 提取 ADR 中的 `## Implementation Status`（落地情况表）与 `## Invariants`。
   - `spec-guard audit-adr <ID>` 输出机器审计报告，辅助架构师判定该 ADR 是否具备 `🔒Frozen` 的现实基础。
2. **协同 `lab preflight`**：
   - 将 `templates/pre-commit.d/15-spec-guard` 复制到项目的 `.githooks/pre-commit.d/`。
   - 本地 pre-commit 保持极速（< 0.05s），拦截针对 Frozen ADR 的未经授权修改与裸原型合入。
3. **协同 `lab review-gate`**：
   - 结合 OpenGrep 规则，拦截未经 `@ContractOnly` 打标的裸孤立函数。
4. **协同 `lab orphan`**：
   - 孤儿清道夫清理零引用代码前，向 `spec-guard` 确认该符号是否带有有效期内的 `@ContractOnly` 标记；若有则豁免，若无且超期则彻底清理。

---

## 5. 项目接入步骤 (Per-Repo Setup)

```bash
# 1. 确保安装 lab-agent-toolkit
lab list

# 2. 在项目根目录初始化
node "$(lab path spec-guard)/bin/spec-guard.mjs" init

# 3. 复制 pre-commit 门禁片（可选）
mkdir -p .githooks/pre-commit.d
cp "$(lab path spec-guard)/templates/pre-commit.d/15-spec-guard" .githooks/pre-commit.d/
chmod +x .githooks/pre-commit.d/15-spec-guard

# 4. 跑一次全仓自检
node "$(lab path spec-guard)/bin/spec-guard.mjs" check
```

---

## 6. 单元目录布局 (Unit Directory Layout)

```text
units/spec-guard/
├── README.md                           # 单元核心规约与单一事实源（本文件）
├── AGENTS.md                           # 面向 AI Agent 的专属行为法则与防漂移守则
├── VERSION.md                          # 语义版本号 (v1.0.0)
├── CHANGELOG.md                        # 版本演进记录
├── bin/
│   └── spec-guard.mjs                  # CLI 入口 (支持 init, check, audit-adr)
├── core/
│   ├── adr-parser.mjs                  # ADR Invariants 与 Implementation Status 抽取器
│   ├── scanner.mjs                     # 多语言源码 @Invariant 扫描器与 No-Cheat 防伪探针
│   └── matrix-checker.mjs              # 三元映射对账计算与 Markdown 审计报告生成引擎
├── templates/
│   ├── spec-matrix.overlay.yml         # 跨端跨语言协议层按需覆写模板 (Overlay)
│   ├── pre-commit.d/15-spec-guard      # preflight 分发器轻量提交门禁片
│   ├── ci/spec-guard-audit.yml         # 异步 CI 持续审计工作流模板
│   └── annotations/                    # Kotlin, Python, Go, TypeScript 打标模板
└── tests/
    └── spec-guard.test.mjs             # 自动化测试套件 (覆盖词界、ADR、No-Cheat、矩阵全流程)
```
