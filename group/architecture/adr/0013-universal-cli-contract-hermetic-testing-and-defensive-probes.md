<!-- adr-template v1.0 · tier: frozen · source: ~/Documents/lab/adr/ -->

# ADR-0013: 全 CLI 物理契约对称治理、单测零环境寄生与防御性探针架构决策 (Universal CLI Contract Governance, Hermetic Testing Sandbox & Defensive Probes)

- **状态（Status）**：Accepted (🔒Frozen)
- **生效日期**：2026-11-22
- **决策人**：churze + Antigravity (arch) + WorkBuddy (audit) (AEF 架构委员会)
- **关联证据**：
  - 消费方 1 (WorkBuddy @ Tappy) 审计留痕：`orphan banner 漂移`、`spec-guard --version 缺失`、`review-gate 产物缺少 engine 结构化字段`、`lab doctor 误报未安装`
  - 消费方 2 运行留痕：`units/handoffs/tests/tool-profile.test.mjs 缺少 Hub 夹具与工单 ID 正则过宽导致 'a' 误识`
  - 根治落地测试用例：[tests/cli-contract.test.mjs](file:///Users/churze/Documents/lab/tests/cli-contract.test.mjs) 与 [units/handoffs/tests/tool-profile.test.mjs](file:///Users/churze/Documents/lab/units/handoffs/tests/tool-profile.test.mjs)
- **涉及 Unit**：`bin/lab.mjs` / `units/handoffs` / `units/orphan` / `units/spec-guard` / `units/worktree` / `units/review-gate` / `tests` / `global`
- **关联契约**：
  - [`0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md`](0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md) (ADR-0009 · 反假接线与主入口可见性)
  - [`0011-vibe-security-anti-suppression-and-dependency-reachability.md`](0011-vibe-security-anti-suppression-and-dependency-reachability.md) (ADR-0011 · 降级矩阵诚实律与产物元数据)
  - [`0012-spec-driven-development-reppit-and-tiered-guardrails.md`](0012-spec-driven-development-reppit-and-tiered-guardrails.md) (ADR-0012 · 负向测试先行与 Tool-Profile 治理)

---

## 1. Context（背景与问题）

在 AEF Toolkit 演进过程中，各 Unit 作为独立工程端自治发展，但在被下游消费方（如 Tappy 及多终端独立工作区）集成时，暴露出 3 类深层次工程赤字：

1. **CLI 契约不对称与静态字面量漂移（Unenforced CLI Contract & Drifted Banner）**：
   - 各 CLI 入口（`lab`, `baton`, `lab-orphan`, `spec-guard`, `baton-worktree`, `baton-audit-runner`）由不同开发者在不同时期编写，缺少统一的参数协议门禁；
   - 部分 CLI 未接线标准的 `--version` / `-v`，导致脚本查询版本时抛出 Exit Code 1；
   - 帮助 Banner 中存在硬编码版本字面量（如 `v1.0.0`、`v2.0.0`），未随各 Unit 的 `VERSION.md` 动态对齐，形成事实源漂移。
2. **测试环境寄生与缺少独立沙箱（Non-Hermetic Testing & Ambient State Leakage）**：
   - 单测未创建独立临时 Git 仓库与 Hub 夹具，直接在当前工作目录下执行写操作，一旦在外部无 Hub 仓库或未初始化状态下执行便发生断裂；
   - 外部 Agent 运行时注入的会话环境变量（如 `ANTIGRAVITY_CONVERSATION_ID`、`SESSION_ID`）渗透进单测，使工单 ID 生成规则偏离基准，导致依赖松散正则（如 `[a-f0-9\-]+`）的提取逻辑发生贪婪错配（将 `audit-...` 截断提取为单字符 `"a"`）。
3. **环境探针盲目异常吞没与 Schema 不对称（Blind Catch in Probes & Schema Divergence）**：
   - `lab doctor` 将探针超时（`ETIMEDOUT`）或 `PATH` 缺失错误一律盲目 `catch` 吞没，误报为 `⚠️ 未安装`，缺乏故障分流能力；
   - `review-gate` 在 OpenGrep 原生模式下直接透传工具原生 JSON，缺少降级分支具备的顶层 `engine` 与 `fallback` 结构化元数据，导致下游依赖该字段的审计规则读取到 `undefined`。

---

## 2. Decision（核心架构决策）

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AEF ADR-0013 CLI, Sandbox & Probe Governance         │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. 全 CLI 物理契约对齐门禁      │ 遍历 package.json bin，强校验 --version│
│    (Universal CLI Contract)    │ 和 -v / --help，版本必出自 VERSION.md │
├────────────────────────────────┼───────────────────────────────────────┤
│ 2. 单测零环境寄生与沙箱隔离律  │ 严禁在宿主目录直写，必须使用独立临时仓│
│    (Hermetic Testing Sandbox)  │ createTestRepo() 夹具并清洗外部会话环境变量│
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. 结构化输出优先与单事实提取  │ 原语优先提供 --json；文本提取严禁使用 │
│    (Structured Protocol First) │ [a-f0-9\-] 等弱正则，统一 extractTicketId │
├────────────────────────────────┼───────────────────────────────────────┤
│ 4. 探针防御性分流与长耗时感知  │ 物理文件存在优先于进程执行，严格区分   │
│    (Defensive Doctor Probes)   │ NOT_FOUND vs ETIMEDOUT vs OUT_OF_PATH │
├────────────────────────────────┼───────────────────────────────────────┤
│ 5. 多引擎模式产物 Schema 守恒律│ 原生与降级扫描必须输出对称的顶层字段  │
│    (Dual-Engine Invariant)     │ engine / fallback / version 超集对齐  │
└────────────────────────────────┴───────────────────────────────────────┘
```

### 2.1 全 CLI 物理契约对齐门禁（Universal CLI Contract Gate）
- 所有在 `package.json` `bin` 暴露的 CLI 可执行文件，必须遵循统一契约：
  1. 支持 `--version`、`-v`、`version`，以 Exit Code 0 退出；
  2. 版本号必须动态解析自本模块 `VERSION.md`（或根目录 `package.json`），严禁静态手写；
  3. 支持 `--help`、`-h`、`help`，以 Exit Code 0 退出，且 Banner 版本必须与 `VERSION.md` 一致；
  4. 必须通过 `import.meta.url` 动态寻址内部模块，确保从任意跨目录工作区（如 `/tmp`）调用均能正常运行。
- 常驻防线：由 [tests/cli-contract.test.mjs](file:///Users/churze/Documents/lab/tests/cli-contract.test.mjs) 自动发现并全量遍历测试，挂载于 `npm test` 与 Fast Gate 门禁中。

### 2.2 单测零环境寄生与沙箱隔离律（Hermetic Testing Sandbox）
- 单测必须具备“随处可测（Test Anywhere）”的完全封闭性：
  1. **禁止就地写操作**：涉及文件变动、Git 提交、Baton 工单生成的单测，必须通过 `createTestRepo()` 在 `os.tmpdir()` 中建立临时沙箱，并在 `finally` 阶段可靠清理（`fs.rmSync(tmpDir, { recursive: true, force: true })`）；
  2. **会话环境变量清洗**：调用 CLI 子进程前必须净化 `process.env`，剥离外部注入的会话上下文，杜绝环境污染；
  3. **状态门禁默认隔离**：单元测试环境统一注入 `HANDOFF_STATUS_GATE: 'off'` 与 `CI: 'true'`，防止未查看状态视图的会话拦截门禁干扰测试。

### 2.3 结构化数据优先与严禁宽字符正则（Structured Protocol First）
- 工具链间及测试交互必须消除对不可靠控制台输出的依赖：
  1. 原语级命令全面支持 `--json` 参数，程序调用方直接解析结构化 JSON 对象；
  2. 在必须解析终端纯文本时，严禁使用 `[a-f0-9\-]+` 等极易发生贪婪截断的简陋正则，统一使用已验证的权威提取函数（`extractTicketId`），优先匹配显式语法前缀及完整格式（UUID 或 `lane-YYYYMMDD-NN-type`）。

### 2.4 探针防御性分流与长耗时感知（Defensive Doctor Probes）
- `lab doctor` 与系统依赖检查器实施防御性分级探测：
  1. **物理路径回退搜索**：先查 `$OPENGREP_BIN`，再查 `PATH`，再搜索常见用户目录（`~/.local/bin`、`/opt/homebrew/bin`、`/usr/local/bin`）；
  2. **物理文件优先于进程超时**：若物理二进制存在，但版本进程执行耗时超限（如自解压二进制首启耗时），判定为 `✅ 已就绪 (探针超时)`，严禁将超时误判为未安装；
  3. **细分异常诊断**：区分 `未安装`、`超时`、`版本不满足` 与 `未加入当前 PATH`，提供精准可复制的修复指引。

### 2.5 多引擎模式产物 Schema 守恒律（Dual-Engine Schema Invariance）
- 当安全或质量工具具备多套执行引擎（如 `review-gate` 的 OpenGrep 原生 vs Ruff/Bandit 降级）：
  1. 产物 JSON 必须包含同构的顶层元数据字段：`engine`（字符串标识）、`fallback`（布尔值）、`version`（工具版本）；
  2. 单测（[scan.test.mjs](file:///Users/churze/Documents/lab/units/review-gate/tests/scan.test.mjs)）必须常驻核验两种分支下产物 Schema 的对称性，防止下游消费者读取时产生 `undefined`。

---

## 3. Invariants（不可变约束）

- `@Invariant(Inv-1: CLI Contract Symmetry)`: `package.json` `bin` 下所有二进制必须响应 `--version` / `-v` / `--help` / `-h`，Exit Code 必须为 0，且版本号必须与 `VERSION.md` 逐字对齐。
- `@Invariant(Inv-2: Test Sandbox Isolation)`: 严禁单测在宿主仓内裸跑具有副作用的 CLI 命令；必须强制使用 `createTestRepo()` 在临时目录隔离执行并清场。
- `@Invariant(Inv-3: Zero External Session Pollution)`: 测试运行环境必须清洗外部 Agent 会话变量，保证测试在冷启动、无上下文环境下 100% 幂等复现。
- `@Invariant(Inv-4: Dual-Engine Schema Parity)`: 任何降级矩阵的扫描产物，其顶层控制元数据结构必须与原生引擎输出保持双向对称。
- `@Invariant(Inv-5: Probe Error Disambiguation)`: `lab doctor` 严禁盲目吞没错误；探针必须明确区分物理文件缺失、进程超时与 PATH 未配置。

---

## 4. Consequences（影响与效果）

- **Positive**：
  1. 彻底消除了下游消费方因 CLI 缺少参数、帮助文本陈旧、单测正则截断等低级问题导致的报障与分歧；
  2. 建立了常驻物理契约测试套件 [tests/cli-contract.test.mjs](file:///Users/churze/Documents/lab/tests/cli-contract.test.mjs)，任何新 Unit 若未接线版本或写死字面量，门禁将在秒级直接阻断提交；
  3. 单测具备跨环境、跨目录自洽性，无论从宿主仓根目录、子目录、还是消费方测试流水线调用，均能 100% 稳定运行。
- **Negative**：
  1. 新增 CLI 工具时必须显式实现版本解析与标准参数分支，不再允许手写随意格式的 CLI 入口；
  2. 单测必须引入 `createTestRepo()` 辅助夹具，单测初始代码量略有上升，但换取了完全的确定性与隔离性。
