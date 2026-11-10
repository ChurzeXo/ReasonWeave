# RFC: 全局架构漂移与规约守卫单元 (Spec-Guard) 架构设计方案

- **文档编号**：RFC-20261110-SPEC-GUARD-UNIT
- **作者**：Lab 架构委员会 (Infrastructure & AEF Working Group)
- **状态**：Proposed Draft / 待审阅（面向 Tappy 侧 Antigravity 对抗评审）
- **日期**：2026-11-10
- **基线关联**：
  - Tappy 事故与方案：[RFC-20261110-TOP-DOWN-HANG-PREVENTION (v2)](file:///Users/churze/Documents/Developer/Tappy/docs/proposals/RFC-20261110-TOP-DOWN-HANG-PREVENTION.md)
  - Tappy 对抗评审实测：[RFC-20261110-TOP-DOWN-HANG-PREVENTION-REVIEW](file:///Users/churze/Documents/Developer/Tappy/docs/proposals/RFC-20261110-TOP-DOWN-HANG-PREVENTION-REVIEW.md)
  - 最高宪法：[constitution.md](file:///Users/churze/Documents/lab/constitution.md)
  - 关联 Units：`units/adr`、`units/preflight`、`units/review-gate`、`units/orphan`、`units/handoffs`

---

## 1. 背景与核心问题定性 (Context & Problem Formulation)

### 1.1 现实痛点：自顶向下“半山腰挂起（Top-Down Spec Hang）”
在 Agent 辅助软件工程与微步交付体系中，出现了一种隐蔽且破坏力极强的架构失真模式：
1. **过早完备性错觉**：架构师或 Agent 在撰写并冻结顶层设计（如 `🔒Frozen` ADR）时，为了令规约“完备可交付”，将未就绪的纯算法函数直接提交至生产代码目录（`src/main/`）。而此时系统底座（调度触发器、IPC 通信协议、跨端互斥锁、系统事件帧）尚未建立。
2. **死代码清道夫误杀与规约脱节**：数天后，静态代码扫描（如孤儿清理工具、dead code linter）发现这批函数处于零调用者（Zero-Caller）状态，准确识别为未用死代码并将其清理。此时，高层 Frozen ADR 声明的能力已在代码库中灰飞烟灭，顶层意图与底层现实彻底脱钩。
3. **“装饰性空壳接线（Shallow Wiring）”陷阱**：若为了规避死代码清理，在守护进程（如轮询 Watchdog）中强行塞入一行空壳调用（如 `tick -> checkScheduledUpdate()`），代码调用图（CallGraph）与 linter 随即全绿放行。**但由于前置业务约束（如空闲判定、温控熔断、网络互锁、低频节律栅栏）根本未接通，系统在运行期持续违背 ADR 声明的架构不变量**。

> **核心定性**：
> **「调用图可达（Reachability）」≠「语义闭环（Semantic Completeness）」**。单纯追求符号引用关系或入边数量，不仅无法保障架构不变量落地，反而会逼迫 Agent 制造出大量用于“骗过门禁”的装饰性空壳代码，将死代码问题演变成更难排查的“带病带伤运行”隐患。

---

## 2. 业界前沿技术调研与模式萃取 (State of the Art)

针对“顶层规约与底层代码断链”、“虚假完备”以及“架构漂移（Architecture Drift / Erosion）”，本方案对国际技术社区、头部大厂工程实践及经典著作进行了系统性检索与溯源。

### 2.1 ThoughtWorks：演进式架构与架构适应度函数 (Architectural Fitness Functions)
- **概念来源**：Neal Ford、Rebecca Parsons 与 Patrick Kua 在 *Building Evolutionary Architectures* 中提出。
- **核心定义**：**适应度函数（Fitness Function）** 是对系统某种架构特征（安全性、模块隔离度、不可变约束、性能边界）进行客观、可重复的自动化完整性评估机制。
- **与传统单测的区别**：
  - 单元测试（Unit Tests）验证 **行为（Behavior）**：给定特定输入 $X$，输出是否为 $Y$；
  - 适应度函数（Fitness Functions）验证 **结构与不变量（Structure & Invariants）**：模块依赖是否跨层、核心路径是否满足互斥锁、非工作时间是否有非预期流量外发。
- **大厂模式落地**：通过将不可变架构要求编写为“代码化的守护规则”（Architecture-as-Code），使架构评审从“人脑开会”变为“CI 持续拦截”。

### 2.2 结构化断言引擎生态 (ArchUnit & Ecosystem Ports)
- **JVM 生态（ArchUnit）**：通过字节码/AST 解析，将架构规则写为单元测试（如 `noClasses().that().resideInAPackage("..ui..").should().dependOnClassesThat().resideInAPackage("..db..")`）。
- **多语言矩阵**：
  - TypeScript/Node: `ArchUnitTS`, `dependency-cruiser`
  - Golang: `go-arch-lint`, `depguard`
  - .NET: `ArchUnitNET`
  - Python: `pytest-archon`, `import-linter`
- **局限与启示**：ArchUnit 类工具极擅长解决“包层级引用禁令（Ban Illegal Imports）”，但对**业务语义不变量（如未满足温控条件严禁发 HTTP 请求）** 无能为力。因此，纯图拓扑检查必须与动态测试断言结合。

### 2.3 活文档与规约到代码的可追溯性 (Living Documentation & Traceability)
- **理论基石**：Cyrille Martraire (*Living Documentation: Continuous Knowledge Sharing by Design*) 与 Martin Fowler (*Specification by Example*)。
- **反漂移哲学**：
  1. 凡是脱离代码单独存在的 Wiki/Word 文档，必然迅速腐化漂移；
  2. 规约必须具备“可执行性（Executable Specification）”；
  3. **可追溯性三要素**：**意图（Intent / ADR Invariant） ➔ 断言（Executable Assertion） ➔ 代码实现（Code Under Test）**。
- **关键洞察**：文档中声明的每一条约束规则，必须在代码库中有可唯一寻址的机器断言锚点（Assertion Anchor）。文档不提供断言锚点的，视为“未受机器保护的假定”。

### 2.4 Google Engineering Practices (EngPractices) 的规约防悬挂经验
- **Small CLs (窄垂直切片)**：Google 强力倡导 CL 必须是功能自洽且有测试闭环的极小增量。严禁为了未来特性提前将未接线的中间抽象或纯算法合入主干（No Dead Code Rule）。
- **No Premature Dead Abstractions**：在代码评审指南中，明确指出“如果一段代码没有任何生产调用者，且未提供端到端验证，无论其算法多精妙，均不得合入”。
- **沙箱隔离先行**：未接线算法若需提前沉淀，应放置在独立测试包或实验分支中，不得伪装成生产能力。

### 2.5 现代静态分析与门禁防线 (Semgrep / Danger.js)
- **Semgrep/OpenGrep 架构不变量规则**：利用 AST 模式匹配在代码层阻断违规模式（如：严禁在未经过 `RateLimiter.acquire()` 的前提下直接构造 `HttpClient`）。
- **Danger.js PR 元数据守卫**：在 CI 阶段联动 Git Diff、ADR 变动与测试覆盖，当识别到“新增了独立函数却未在 ADR Implementation Status 中声明”或“修改了核心规范但未变更对应断言”时发出阻断告警。

---

## 3. 架构失真与防线对比分析

结合 Tappy 真实事故与业界经验，传统手段与本单元架构思想对比表如下：

| 维度 | 传统粗暴做法 (Anti-Patterns) | 演进后做法 (Spec-Guard 范式) |
|---|---|---|
| **闭环判定依据** | 代码调用图（CallGraph）是否有入边；函数是否有调用点 | **ADR Invariant ↔ Machine Assertion ↔ Code** 三元映射对账 |
| **死代码防护** | 本地 pre-commit 强拦截零引用（导致 26.5% 误报与大面积阻塞） | **CI 异步巡检告警 + 契约沙箱打标（`@ContractOnly`） + 编译期/变异期兜底** |
| **半成品收容** | 直接合入 `src/main`（诱发装饰性接线） | **契约测试沙箱先行（`src/test/contract`） + 窄垂直切片逐步交付** |
| **测试有效性** | 只要写了单测就视为已验证（即使生产未接线） | **防伪铁律（No-Cheat Rule）**：测试类调用一律不计入生产可达性证明 |
| **ADR 状态维护** | 脚本自动把 Draft 改为 `🔒Frozen`（越权篡改、不可逆） | **机器只出对账审计报告，人类单句批准冻结；状态变更仅在 `Implementation Status` 声明** |
| **接入与开销** | 绑定重型数据库或语言专属插件，本地 pre-commit 卡顿数十秒 | **轻量标准化 YAML 契约 + CLI 瞬时判定（< 0.05s） + 独立 Unit 插拔** |

---

## 4. 全新 Unit 设计：`units/spec-guard`

在 `lab-agent-toolkit` 体系中，设计第 7 个全新独立工程单元：`units/spec-guard`（别名 `drift-gate`）。

### 4.1 核心设计定位 (Mission & Boundary)
- **定位**：解决“架构决策与实际代码实现漂移脱钩”、“假完备半成品污染生产”、“装饰性接线逃避扫描”的全局治理单元。
- **边界划分**：
  - `lab adr`：负责沉淀架构决策与不变量文本定义（单一事实源，append-only）；
  - `lab preflight`：负责仓库级文件/工作树/配置不变量探针与门禁分发；
  - `lab review-gate`：负责代码级安全与质量 SAST 扫描（OpenGrep 规则）；
  - `lab orphan`：负责全局死代码与孤儿资产探测与清理适配；
  - **`lab spec-guard`（本单元）**：负责 **规约（ADR）↔ 机器断言（Assertion）↔ 生产代码（Code）三元映射对账**、契约沙箱合规校验与架构漂移防护。

### 4.2 目录骨架与文件布局 (Repository Layout)
遵循 lab 最高宪法 `constitution.md` 与 ZSpec 规范：

```text
units/spec-guard/
├── README.md               # 单元核心规约、不变量与使用指南（单一事实源）
├── AGENTS.md               # 针对 AI Agent 的行为守则与实操提示词
├── VERSION.md              # 语义化版本号 (v1.0.0)
├── CHANGELOG.md            # 版本演进记录
├── bin/
│   └── spec-guard.mjs      # 核心 CLI 入口 (lab spec-guard / spec-guard)
├── core/
│   ├── adr-parser.mjs      # ADR Invariant 与 Implementation Status 抽取器
│   ├── matrix-checker.mjs  # 三元映射对账与覆盖率计算引擎
│   ├── sandboxing.mjs      # 契约沙箱与 No-Cheat 标签检测器
│   └── shallow-wire.mjs    # 装饰性空壳接线静态启发式探测器
├── templates/
│   ├── spec-matrix.yml     # 项目级规约-代码对账配置模板
│   ├── pre-commit.d/
│   │   └── 15-spec-guard   # preflight 分发器轻量门禁子脚本
│   ├── ci/
│   │   └── spec-guard-audit.yml # 异步 CI 完整对账流水线模板
│   ├── annotations/        # 各语言规范打标宏/注解定义
│   │   ├── Invariant.kt    # Kotlin 注解
│   │   ├── invariant.py    # Python 装饰器
│   │   ├── invariant.go    # Go 注释规范
│   │   └── invariant.ts    # TypeScript 装饰器/JSDoc
│   └── opengrep/
│       └── spec-guard.yml  # review-gate 专用的反半成品挂起 AST 规则
└── scripts/
    └── init.sh             # 项目一键初始化脚本
```

同时，在 `lab` 根目录下建立软链接兼容层：
```bash
/Users/churze/Documents/lab/spec-guard -> units/spec-guard
/Users/churze/Documents/lab/drift-gate -> units/spec-guard
```

并在 `package.json` 的 `bin` 中注册：
```json
{
  "bin": {
    "spec-guard": "./units/spec-guard/bin/spec-guard.mjs",
    "drift-gate": "./units/spec-guard/bin/spec-guard.mjs"
  }
}
```

---

## 5. 核心机制详解：P3′ 三元映射对账矩阵 (Triad Matrix)

### 5.1 概念模型
```text
┌─────────────────────────────────────────────────────────────┐
│                   ADR Architectural Intent                  │
│       e.g., ADR-060: Invariant H-1 (Zero Wakeup & Network)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
            Mapping: spec-matrix.yml (Triad Mapping)
                               │
         ┌─────────────────────┴─────────────────────┐
         ▼                                           ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│       Machine Assertion      │   │       Production Code        │
│  - Tag: @Invariant("H-1")    │   │  - Class: AppUpdateManager   │
│  - Negative Assertion        │   │  - Func: shouldTriggerCheck  │
│    (assertNetCalls(0))       │   │  - Wiring: ServiceWatchdog   │
│  - Mutation Red Guard        │   │                              │
└──────────────┬───────────────┘   └──────────────┬───────────────┘
               │                                  │
               └───────────────┬──────────────────┘
                               ▼
        ┌──────────────────────────────────────────────┐
        │        spec-guard Verification Engine        │
        │  [1] Is Assertion executed & passing?        │
        │  [2] Is Production Code actually wired?      │
        │  [3] Does Assertion test semantic behavior?  │
        │      (Reject Shallow Decorative Wiring)      │
        └──────────────────────────────────────────────┘
```

### 5.2 映射元数据定义：`spec-matrix.yml`
项目根目录维护轻量级机器配置文件 `spec-matrix.yml`（亦支持内联在 ADR Markdown 的 Frontmatter 或 YAML 代码块中）：

```yaml
version: "1.0"
adr_root: "group/architecture/adr" # 或 docs/adr

invariants:
  - id: "ADR-060:H-1"
    name: "零唤醒/零网络负担约束"
    status: "verified" # verified | in_progress | unwired | blocked
    adr_file: "ADR-060-twenty-four-hour-ota-timing-and-business-interlock-spec.md"
    
    # 机器断言定义（至少一个）
    assertions:
      - type: "unit_test"
        target: "com.tappy.inspector.AppUpdateManagerTest#testDaytimeWithoutIdle_noNetwork"
        marker: "@Invariant(\"ADR-060:H-1\")"
      - type: "negative_traffic"
        target: "com.tappy.inspector.AppUpdateTrafficTest#assertZeroHttpCallsWhenCoolingDown"
        expected: "http_requests_count == 0"
      - type: "mutation_gate"
        target: "com.tappy.inspector.AppUpdateManager#shouldTriggerScheduledCheck"
        mutation: "invert_conditional"
        must_fail: true

    # 关联生产实现
    production:
      symbols:
        - "com.tappy.inspector.AppUpdateManager#shouldTriggerScheduledCheck"
        - "com.tappy.inspector.AppUpdateManager#isSafeThermalState"
      entrypoint: "com.tappy.inspector.ServiceWatchdog#checkScheduledUpdate"
      wiring_status: "wired" # wired | unwired | sandboxed
```

### 5.3 契约沙箱与防伪铁律（No-Cheat Rule）
1. **沙箱标记原则**：当处于垂直切片初级阶段，底层通信协议/调度器尚未就绪时，算法原型**仅允许存在于 `src/test/` 沙箱或带有 `@ContractOnly` 注解的隔离包中**。
2. **防伪断言算法**：
   - `spec-guard` 在分析生产代码符号（如 `AppUpdateManager.kt`）的调用者时，**显式过滤并剥离所有来自 `src/test/`、`test/`、`*_test.go` 的入边**。
   - 测试类对算法原型的直接调用，仅代表“算法行为符合单测预期”，**在对账矩阵中计算 `wiring_status` 时一律记为 `0`**。
   - 若某函数在生产目录声明为 `public`，但其所有入边均为测试代码，`spec-guard` 将输出：
     `⚠️ [PROD-ORPHAN-EXPOSURE] Symbol <Foo> is only called by tests. Mark with @ContractOnly or move to test sandbox.`

### 5.4 装饰性空壳接线（Shallow Wiring）启发式阻断
为了防止开发者或 Agent 通过无意义的空调用“骗绿”调用图，`spec-guard` 内置三项启发式反欺骗规则：
1. **断言穿透检查（Assertion Penetration）**：
   每一条声明为 `wired` 的符号，其对应的 Machine Assertion 必须至少包含一项 **负向断言（Negative Assertion，如冷却中发包数=0）** 或 **变异测试反向阻断（Mutation Guard）**。若测试套件仅包含“输入 True 输出 True”的单元测试，对账状态最高只能为 `in_progress`，不得标记为 `verified`。
2. **控制流无分支穿透（No-Op Call Heuristic）**：
   若被调用的算法函数返回值在调用点处未被任何条件分支使用，或其结果未传递至任何持久化/网络/状态机接口（即纯返回值被抛弃），`spec-guard` 将发出警告：
   `❌ [SHALLOW-WIRING] Symbol <checkScheduledUpdate> called at ServiceWatchdog:60, but return value is discarded or unconditioned.`
3. **前置门禁缺失警报（Missing Invariant Prerequisite）**：
   若 ADR Invariant 声明了先决依赖项（如 H-1 声明了 `Idle > 30min`），但在对应的 Entrypoint 链路中完全找不到任何与该前提相关的系统调用或状态探针，直接判定接线不完整。

---

## 6. 与现有 lab 单元的协同编排

`spec-guard` 保持严格的正交性与无感插拔，与 lab 现有核心单元深度协同：

```text
                     ┌──────────────────┐
                     │     lab adr      │
                     │  (Frozen Intent) │
                     └────────┬─────────┘
                              │ 1. 抽取 Invariants & 校验 Status 节
                              ▼
┌──────────────────┐   ┌───────────────┐   ┌──────────────────────┐
│  lab review-gate │◄──┤lab spec-guard ├──►│     lab orphan       │
│ (OpenGrep Rules) │   │ (Triad Engine)│   │ (Dead-Code Sweeper)  │
└──────────────────┘   └───────┬───────┘   └──────────────────────┘
   2. 拦截未打标的裸逻辑          │            3. 保护 @ContractOnly 原型
                               │ 4. 产出审计证据与对账报告
                               ▼
                     ┌──────────────────┐
                     │  lab preflight   │
                     │ (CI / Pre-commit)│
                     └──────────────────┘
```

### 6.1 与 `lab adr` 协同：事实证据生成器（Evidence Generator）
- **绝不自动修改 ADR**：遵循 `constitution.md` 与 `units/adr` 核心宪法（append-only + 用户单句批准 + 🔒Frozen 不可逆）。`spec-guard` **绝无权限通过脚本修改 ADR 文件的状态头**。
- **职责聚焦于机器审计凭据**：
  运行 `lab spec-guard audit-adr <ADR-ID>`：
  1. 解析 ADR 正文，核验是否严格包含 `## Implementation Status` 落地追踪节；
  2. 提取 `## Invariants` 声明的标识清单；
  3. 校验 `spec-matrix.yml` 中对应条目是否达到 100% 断言覆盖；
  4. 生成一份 Markdown 审计报告（包含实测通过的 commit sha、测试用例清单、变异阻断证据），作为架构师与用户人工单句批准 `🔒Frozen` 的机器背书。

### 6.2 与 `lab preflight` 协同：分级门禁编排
- **本地 pre-commit 轻量守卫（< 0.05s）**：
  在 `.githooks/pre-commit.d/15-spec-guard` 中仅运行增量轻量检查：
  - 检查本次 `git diff` 是否修改了已标记 `🔒Frozen` 的 ADR 内容（硬拦截修改历史决策）；
  - 检查新增的 production 代码是否携带未闭环的 `@ContractOnly` 标记；
  - 严格不运行重量级全局可达性分析或调用图生成，保持 pre-commit 在 1 秒级响应。
- **CI 异步流水线（Full Triad Audit）**：
  在 GitHub Actions / CI 阶段全量执行：
  `lab spec-guard check --full --strict`，扫描全量三元映射矩阵，输出漂移趋势图与未接线清单。

### 6.3 与 `lab review-gate` 协同：SAST 硬拦截裸原型
- 在 `units/spec-guard/templates/opengrep/spec-guard.yml` 中预置 OpenGrep AST 规则：
  - 规则 1：禁止在生产代码中提交声明为 `// TODO: connect later` 或未被任何生产链路调用的孤立 public 算法类；
  - 规则 2：若算法类未在 `spec-matrix.yml` 登记，且未标注 `@ContractOnly`，在 Layer-1 静态扫描中直接发出告警。

### 6.4 与 `lab orphan` 协同：死代码与契约沙箱解耦
- `lab orphan` 扫描到零引用声明时，首先向 `spec-guard` 查询该符号的元数据：
  - 若符号属于 `spec-matrix.yml` 登记的 `sandboxed / unwired` 原型，且在设定的保护期限内（`expire_after`），`lab orphan` 予以**受控豁免**，避免被误杀；
  - 若符号既无生产引用、未登记契约沙箱、又超期未闭环，`lab orphan` 判定为真死代码并进入清理流程。

---

## 7. 多语言标准化接入规范 (Polyglot Adoption Guide)

消费方项目无论采用何种语言栈，均可通过 `lab path spec-guard` 零成本接入。

### 7.1 通用接入命令
在目标项目终端执行：
```bash
# 1. 初始化规约守卫配置
node "$(lab path spec-guard)/bin/spec-guard.mjs" init

# 2. 挂载到 preflight 门禁链条 (若已安装 preflight)
cp "$(lab path spec-guard)/templates/pre-commit.d/15-spec-guard" .githooks/pre-commit.d/
chmod +x .githooks/pre-commit.d/15-spec-guard

# 3. 运行本地自检
node "$(lab path spec-guard)/bin/spec-guard.mjs" check
```

### 7.2 多语言断言打标规范

各语言无需强制引入外部重型依赖，仅需在测试套件中使用既定规范进行注解或结构化注释：

| 语言栈 | 机器断言打标形式 (Machine Assertion Anchor) | 沙箱隔离标记 (Sandbox / Unwired Marker) |
|---|---|---|
| **Kotlin / Java** | `@Test @Invariant("ADR-060:H-1")` (可复制模板注解或 JUnit5 `@Tag("INV:ADR-060:H-1")`) | `@ContractOnly(adr = "ADR-060", expire = "2026-12-01")` |
| **Python** | `@pytest.mark.invariant("ADR-060:H-1")` 或 `# [INVARIANT: ADR-060:H-1]` | `@contract_only(adr="ADR-060", expire="2026-12-01")` |
| **Golang** | `// Invariant: ADR-060:H-1`（放在 `TestXxx` 函数上方） | `// +build contract` 或 `// [CONTRACT-ONLY: ADR-060]` |
| **Node / TypeScript** | `// @invariant ADR-060:H-1` 或 `it('should ...', { tags: ['INV:ADR-060:H-1'] })` | `/** @contractOnly ADR-060 */` |
| **Rust** | `#[test] #[doc = "invariant: ADR-060:H-1"]` | `#[cfg(feature = "contract-sandbox")]` |

---

## 8. 实施路径与演化步骤 (Implementation Roadmap)

1. **Phase 1: 规范与脚手架落盘（本阶段）**
   - 建立 `units/spec-guard` 骨架及与根目录软链接；
   - 编写核心 CLI `spec-guard.mjs`，支持 `init`、`check`、`audit-adr`；
   - 提供 `spec-matrix.yml` 标准模板及 JSON Schema。
2. **Phase 2: 对账引擎与 ADR 抽取**
   - 实现 `adr-parser.mjs`，无缝支持 `units/adr` 的 standard/frozen 格式；
   - 实现轻量级正则与 AST 提取器，跨语言提取 `@Invariant` 标签；
   - 编写单元自测用例。
3. **Phase 3: Tappy 项目作为首发基准实测**
   - 在 Tappy 项目中配置 `spec-matrix.yml` 对账 ADR-060（覆盖 H-1/H-2/H-3 与 Gate1/Gate2）；
   - 验证 `DECISION-REPORT §8` 中的 5 条验收判据能否通过 `spec-guard audit-adr ADR-060` 自动输出合规证明。
4. **Phase 4: 与 `lab orphan` 与 `lab review-gate` 联动**
   - 固化 `@ContractOnly` 豁免协议，彻底解决 2 天误删与死代码挂起问题。

---

## 9. 关键权衡与对抗复核自辩 (Key Decisions & Defense)

面向原方案作者（Tappy 侧 Antigravity Agent）第二轮复核与对抗评审的关键决策自辩：

### 决策点 1：为何废除单纯调用图（CallGraph）可达性，坚持 P3′ 三元映射？
- **自辩**：Tappy 实测已经给出了决定性反例——在 `ServiceWatchdog.kt` 增加 +29 行未完成的接线调用，调用图完全打通，但底层由于缺失空闲检查与跨端锁，直接违反了 ADR-060 核心不变量。**图连通性只能证明有引用，无法证明业务契约满足**。因此，必须将“机判断言通过率”作为闭环核心指标。

### 决策点 2：为何严厉拒绝 pre-commit 强拦截，只做轻量门禁与 CI 异步报告？
- **自辩**：实测显示 Android/Kotlin 模块中合法零直接调用符号高达 26.5%（多态接口、系统广播、数据类）。任何本地 pre-commit 强拦截都将引发灾难性阻断，或者逼迫 Agent 为了提交而疯狂编写装饰性垃圾代码。因此，门禁必须“Fail-Open”，本地只查增量元数据，重度分析交由 CI。

### 决策点 3：为何坚决捍卫 ADR 状态机不可由脚本自动修改？
- **自辩**：`units/adr` 的灵魂是“人类单句确认”与“append-only”。若脚本可自动将 ADR 改为 `🔒Frozen`，一旦底层测试存在假阳性，将导致错误的架构决策被永久钉死且无法回退。`spec-guard` 的职责是“证据呈现”，裁决权永远留给人类与架构师。

### 决策点 4：引入 `spec-matrix.yml` 是否会增加维护摩擦力？
- **自辩**：对于简单项目，`spec-matrix` 允许完全省略，`spec-guard` 仅需通过扫描源码中的 `@Invariant("ADR-XXX:H-Y")` 注解即可自动反向推导隐式矩阵；仅在复杂跨端、具备高危业务互锁（如 24 小时常驻连接、OTA 升级）的场景下，推荐显式维护矩阵。
