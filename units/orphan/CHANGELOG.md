# Changelog — units/orphan

## [v1.1.0] - 2026-11-10

### Added
- **导出符号引用分类器与生产调用者判定接口**：
  - `core/classifier.mjs`：
    - 新增 `CallerKind` 枚举（`PRODUCTION_CALLER`, `TEST_CALLER`, `DOC_CALLER`）；
    - 新增 `isTestPath(filePath)` 路径测试范围判断；
    - 新增 `Classifier.isProductionCaller(ref)` 与 `Classifier.isTestCaller(ref)` 精准分类；
    - 新增 `Classifier.evaluateCallers(references, options)` 聚合判定符号生产接线状态（区分生产接线与单测自测）；
  - `index.mjs`：
    - 作为公共导出入口暴露 `InvertedIndex`, `Classifier`, `ReferenceKind`, `CallerKind`, `isTestPath`, `Solver`, `BlobReader`；
    - 新增 `countProductionCallers(symbolName, options)` 便捷检索接口，供 `spec-guard` 等跨单元直接联动。

## [v1.0.0] - 2026-11-10

### Added
- **Phase 3 门禁工程化全量闭环**：
  - `core/diff-checker.mjs`：实现增量差异扫描引擎，遵循 $O(\Delta)$ 复杂度，秒级提取 `git diff` 新增行并在全仓索引中验证引用；
  - `core/cleaner.mjs`：实现安全修剪清理器，支持 `--dry-run` 统一 patch/diff 结构预览，默认绝对零修改磁盘；
  - `bin/lab-orphan.mjs`：打通 `check-diff`（增量门禁阻断）与 `clean`（受控清理）；
  - `templates/pre-commit.d/30-orphan-guard`：Preflight 门禁钩子模板，接入 `.githooks/pre-commit.d/` 自动阻断孤儿代码入库；
  - `templates/ci/orphan-guard.yml`：GitHub Actions CI 增量检查工作流模板；
  - `tests/phase3-gates.test.mjs`：新增增量阻断、清理预览与钩子执行单测。

## [v0.2.0] - 2026-11-10

### Added
- **Phase 2 多语言适配器落地 (Python & Web/TS)**：
  - `adapters/python/index.mjs`：
    - 顶层函数、类及常量符号提取；
    - `__all__` 显式导出列表保护；
    - pytest 测试发现机制豁免保护（`test_*` 函数、`Test*` 类与 `@pytest.fixture`）；
    - 魔术方法（`__init__`, `__repr__` 等）与 Web 路由装饰器（`@app.*`, `@router.*`, `@bp.*`, `@click.*`）豁免保护；
    - `getattr` / `importlib` 动态反射模式 Fail-Closed 降级。
  - `adapters/web/index.mjs`：
    - `package.json` entrypoints 保护（`main`, `module`, `exports`, `bin`）；
    - ESM / CJS 导出符号提取（named exports, default export, types）；
    - 内部未引用 export 精准判死（`CONFIRMED_ORPHAN`）；
    - 动态 `import()` / `require()` 表达式 Fail-Closed 降级。
- **Core 引擎与 CLI 适配多栈路由**：
  - `core/solver.mjs`：支持 `cand.isProtected` 显式免死保护、`tokens` 多维度查询及 `--stack <android|python|web|auto>` 过滤；
  - `bin/lab-orphan.mjs`：注册 Python 与 Web 适配器，支持按技术栈扫描。
- **单测门禁全覆盖**：
  - `tests/adapters.test.mjs`：新增 7 组独立单测，覆盖 Python 与 Web 适配器保护与降级规则，并纳入 `npm test`。

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
