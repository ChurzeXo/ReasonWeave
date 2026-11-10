# Changelog — units/orphan

## [v0.1.0-draft] - 2026-11-10

### Added
- **立项调研与架构设计**：发布 `units/orphan/DESIGN.md`，深度调研国际工业界（Uber Piranha、Knip、Android Lint、Vulture、OpenGrep/Tree-sitter）并给出横向对比矩阵。
- **分层架构规范**：定义「Core 求解器引擎」与「技术栈适配器（Adapters: Android/Python/Web）」契约。
- **四大核心不变式与协议**：
  - 只读第一（Read-Only Invariant，基于 Git HEAD blob 流式加载，绝对零污染）；
  - 内存行级倒排索引（Inverted Line Index）；
  - 引用分型器（代码/资源/文档）；
  - S1–S3 求解器自检协议（注入假死检出、在用保护、逐字节一致可重复）；
  - Fail-Closed 安全降级（非 100% 证伪一律保留）。
- **公共集成契约**：设计 `lab orphan` CLI 接口、`.orphanrc.json` 配置模型及与 `preflight` / `review-gate` 门禁协同方案。
