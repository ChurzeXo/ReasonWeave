# Changelog - spec-guard (drift-gate)

## [2.0.0] - 2026-11-14

### Added
- **实测数据自述凭据与机器信任根对账引擎 (`core/telemetry_authenticator.mjs`)**：
  - 静态扫描 ADR 表格与正文中声明的量化性能指标 (`ms`, `s`, `MB`, `FPS`, `%`, `Tokens`, `P95`, `P99`, `INT8` 等)。
  - 强制对齐上位规约 ADR-064 机器信任根模型：命中量化指标的 ADR 必须显式引用 `evidence_ref: evidence/*.json` 及 `digest: sha256:...` / `signature`。
  - 自动检验凭证文件物理存在性与 SHA-256 哈希完整性，杜绝离线篡改。
  - 容差恒等于 $0\%$：比对 ADR 文本自述数值与 JSON 实测字段值，彻底根除 ADR-066 式的文本伪造实测数据漂移。
  - 新增 `spec-guard verify-evidence [ADR-ID]` 子命令与 `--telemetry` 门禁选项。
- **物理代码接线探测与孤儿决策防卫 (`core/wiring_tracer.mjs`)**：
  - 自动解析 ADR `## 2. Decision` 节提取核心架构实体、类名、方法与引擎编号。
  - 严格贯彻 No-Cheat 铁律：排除测试目录 (`src/test/`, `tests/` 等)，在生产源码目录反查真实符号存活性与物理接线。
  - 预热加载生产代码内存缓存，避免海量物理 I/O，极速完成全仓反查。
  - 精准识别 `🔒Frozen` 但生产代码零符号命中的孤儿决策 (`ORPHAN_DECISION`) 并 Exit 1 阻断。
  - 新增 `spec-guard check-wiring [ADR-ID]` 子命令。
- **全景对账热力表与一键三元体检 (`check --full`)**：
  - 覆盖「断言 (Assertion) ↔ 证据 (Evidence) ↔ 接线 (Wiring)」三元闭环。
  - 一键输出全景对账热力表 (Triad Heatmap) 与客观综合裁决 (`VERIFIED`, `TELEMETRY_DRIFT`, `ORPHAN_DECISION`, `DRIFT_DETECTED`)。
- **全量测试套件保障 (`tests/telemetry_authenticator.test.mjs`)**：
  - 包含格式伪造拦截与缺少机器签名熔断双必红守护、0% 容差比对、孤儿决策熔断以及针对 Tappy 仓 ADR-066 的真实端到端抓捕验证。

## [1.1.0] - 2026-11-10

### Added
- **防线 2：变异反向测试契约引擎（Mutation Sensitivity Runner）**：
  - `core/mutation-runner.mjs`：自动化变异注入引擎（端点篡改、布尔倒置、比较取反、返回值破坏），断言测试套件在变异注入后必须爆红（Exit !== 0）；若依然全绿（Exit === 0），判定为回音壁假测试并阻断（`MUTATION_SURVIVED`）。
  - 支持 `spec-guard mutate --file <path> --cmd "<cmd>" [--mutator <type>]` 命令行调用与 cleanContext 清洗机制。
- **防线 3：生产拓扑可达性扫描与孤儿接线门禁 (`--check-callers`)**：
  - 联动 `units/orphan` 的倒排索引与符号引用分类器（`countProductionCallers` / `Classifier.evaluateCallers`）。
  - 凡是在 `spec-matrix.overlay.yml` 或源码中标记为架构 Invariant 的方法，必须在非测试生产代码中找到至少 1 处真实调用者（Production Callers >= 1）。
  - 若只有单测调用、生产调用数为 0，门禁精准阻断并报红：`🚨 架构函数未在生产关键链路接线 (Zero Production Callers)`，强制 Exit 1。
- **单测全量覆盖与实测验证**：
  - `tests/spec-guard.test.mjs`：新增孤儿接线阻断与接入复测、变异反向拦截假测试实测、`orphan` 分类器跨单元联动单测，全量纳入 `npm test`。

## [1.0.0] - 2026-11-10

### 初始发布 (Initial Release)
- **架构定性与落地**：正式收敛 Tappy ADR-060 “半山腰挂起”与“装饰性接线（Shallow Wiring）”事故反思，将 RFC-20261110-SPEC-GUARD-UNIT 落地为通用工程单元。
- **Code-as-Spec-Matrix 动态对账引擎**：
  - 默认以代码为事实源：通过 AST/正则扫描 `@Invariant("ADR-XXX:H-Y")` 注解与 ADR 文本 `## Implementation Status`，在内存中动态构建对账矩阵。
  - 支持 `spec-matrix.overlay.yml` 作为跨端/跨语言协议层按需覆写（Overlay）。
- **严格词界与分隔符锚定（防正则假阳性）**：
  - 在 ADR 解析器与源码标签抽取器中全面实行边界锚定匹配（`(?:^|[^a-zA-Z0-9_-])`），彻底杜绝 `H-1` 误伤 `H-10` 或 `H-1-OBSOLETE`。
- **防伪铁律（No-Cheat Rule）**：
  - 测试类（`src/test/` 等）中对算法原型的直接调用，一律不计入生产可达性证明。
- **空壳接线启发式检测（兼容副作用函数）**：
  - 对无返回值（void/Unit）业务 Entrypoint 采取 WARN 级审计呈现，不硬阻断合法副作用逻辑。
- **CLI 命令行工具**：
  - `spec-guard init`：一键初始化项目配置。
  - `spec-guard check`：对账全仓规约覆盖率与漂移风险。
  - `spec-guard audit-adr <ID>`：针对指定 ADR 输出只读机器审计报告（作为人类批准 Frozen 的客观依据）。
