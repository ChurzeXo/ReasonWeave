# Changelog - spec-guard (drift-gate)

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
