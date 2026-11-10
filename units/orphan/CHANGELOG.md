# Changelog — units/orphan

## [v0.1.0] - 2026-11-10

### Added
- **Phase 1 核心求解器代码落地**：
  - `core/blob-reader.mjs`：基于 Git HEAD blob 流式加载的只读提取器，满足零污染工作树不变式；
  - `core/inverted-index.mjs`：内存行级倒排索引，毫秒级跨文件逆向追溯；
  - `core/classifier.mjs`：引用三分类器（STRONG_CODE, MEDIUM_RESOURCE, WEAK_DOC）；
  - `core/solver.mjs`：图求解调度引擎，整合 S3 确定性排序与 Fail-Closed 安全降级；
  - `core/protocol-s1-s3.mjs`：S1 注入假死检出、S2 在用保护、S3 逐字节一致自检门禁套件。
- **首个技术栈适配器 (Android)**：
  - `adapters/android/index.mjs`：支持 AndroidManifest.xml 组件保护、Qualifier 族成对性聚合与动态反射模式识别。
- **CLI 命令行与全局集成**：
  - `units/orphan/bin/lab-orphan.mjs`：实现 `test-solver`, `scan`, `check-diff`, `clean` 子命令；
  - `bin/lab.mjs`：注册 `lab orphan` 路由与 `orphan` 单元描述；
  - `package.json`：注册 `lab-orphan` bin 指针并将自检纳入 `npm test`。
- **设计方案与规范**：发布 `units/orphan/DESIGN.md` 与 `units/orphan/README.md`。
