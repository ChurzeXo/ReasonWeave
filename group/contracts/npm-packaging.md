# NPM 打包与分发契约 (NPM Packaging Contract)

## 1. 打包策略与原则
- **优先 Monorepo 独立包分发**：
  鉴于各 Unit 的版本号和演进频率差异较大（如 `handoffs` 已达 v2.13.0，而 `adr` 仍为 v1.0.0），后续打包采用独立包（如 `@lab/handoffs`、`@lab/preflight`、`@lab/review-gate` 等），避免版本强耦合。
- **运行态数据绝对隔离**：
  任何包在发布时必须严格通过 `.npmignore` 排除运行时数据与个人日志，杜绝敏感工作流痕迹进入公开或私有源。

## 2. 预备包结构映射

| Unit | 建议 Package 标识 | Bin / CLI 导出 | 核心资产 |
|---|---|---|---|
| `units/handoffs/` | `@lab/handoffs` | `bin: { "handoff": "./handoff.mjs" }` | `handoff.mjs`, `handoff-status.mjs`, 核心文档 |
| `units/preflight/` | `@lab/preflight` | `bin: { "preflight-init": "./scripts/install.sh" }` | `templates/`, `docs/` |
| `units/review-gate/` | `@lab/review-gate`| `bin: { "review-gate-init": "./scripts/install.sh" }` | `templates/`, `docs/` |
| `units/adr/` | `@lab/adr` | `bin: { "adr-init": "./scripts/adr-init.sh" }` | `templates/`, `scripts/` |
| `units/backlog/` | `@lab/backlog` | — | `templates/`, `docs/` |

## 3. 发布前置验收清单
1. 运行态目录排除断言（`npm pack --dry-run` 检查包内容）。
2. 可执行脚本执行位校验（`chmod +x`）。
3. 根目录与软链接兼容性验证。
