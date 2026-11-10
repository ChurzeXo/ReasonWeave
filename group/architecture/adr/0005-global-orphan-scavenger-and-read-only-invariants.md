<!-- adr-template v1.0 · tier: frozen · source: ~/Documents/lab/adr/ -->

# ADR-0005: 全局死代码与孤儿资产清道夫架构及只读不变式 (units/orphan)

- **状态（Status）**：🔒 Frozen
- **冻结日期**：2026-11-10
- **决策人**：churze + Agent (impl & audit lanes)
- **关联证据**：
  - 架构设计方案：[`units/orphan/DESIGN.md`](file:///Users/churze/Documents/lab/units/orphan/DESIGN.md)
  - 单元规约入口：[`units/orphan/README.md`](file:///Users/churze/Documents/lab/units/orphan/README.md)
  - 独立双盲审计回执：[`.handoffs/receipts/audit-20261110-01-task-resp.md`](file:///Users/churze/Documents/lab/.handoffs/receipts/audit-20261110-01-task-resp.md)
  - 固化 Commit SHA：`7df74bd`

---

## 1. Context（背景 / 问题）

在长期演进的软件工程与 AI 辅助研发（Agentic Engineering）场景中，代码与资产极易陷入「只增不减」的负向循环：
1. **死代码与孤儿资产堆积**：废弃的方法、类、无主图片（PNG/SVG）、过时布局（XML）及失效 export 长期滞留在主干，导致编译产物与构建时间膨胀；
2. **AI Agent 上下文污染陷阱**：在 LLM 上下文中，未清理的废弃符号极易误导 Agent，使其在过时模式上衍生错误代码，造成严重的工程认知漂移；
3. **反射恐惧与误杀两难**：传统 grep/静态扫描工具缺乏对动态反射（`getattr`, `getIdentifier`, `import()`）的安全防御，开发人员与 Agent 因惧怕破坏线上功能而不敢清理；
4. **业界工具局限性**：Uber Piranha 强绑定已知开关；Knip 局限于 JS/TS 生态；Android Lint 依赖重型 Gradle 构建；Vulture 动态误报率高且依赖人肉维护白名单。各方案均在扫描时直接读写工作树，破坏了并发执行与 CI 安全隔离。

因此，`lab-agent-toolkit` 必须将 Tappy v3 验证通过的 169 项清理范式抽象为公共单元 `units/orphan`，作为全局单一事实源。

---

## 2. Decision（决策 · 冻结内容）

### 2.1 微内核 + 多语言适配器分层拓扑
架构严格解耦为通用抽象求解核心（Core）与多技术栈专属适配器（Adapters）：
- **核心引擎 (`core/`)**：`blob-reader.mjs`（Git HEAD 只读流提取）、`inverted-index.mjs`（内存行级倒排索引）、`classifier.mjs`（三分类器）、`solver.mjs`（图求解与排序）、`diff-checker.mjs`（增量差异扫描）与 `cleaner.mjs`（安全修剪）；
- **技术栈适配器 (`adapters/`)**：`adapters/android/`、`adapters/python/`、`adapters/web/` 必须实现统一的 `IOrphanAdapter` 契约；
- **命令行界面 (`bin/lab-orphan.mjs`)**：注册 `test-solver`, `scan`, `check-diff`, `clean` 四大统一命令，并挂载至 `lab orphan`。

### 2.2 五大系统核心不变式（Hard Invariants）
1. **只读第一（Read-Only Invariant · 硬性铁律）**：
   全量扫描必须恒基于 Git HEAD blob 流式加载（通过 `git ls-tree -r -z HEAD` 与 `git cat-file -p`），严禁依赖脏工作树，执行过程绝对零污染、零写入仓库。
2. **内存行级倒排索引（Inverted Line Index）**：
   全仓 Token 在内存中建立行级倒排映射，支持驼峰/下划线切分与整词精确检索，实现毫秒级跨文件逆向引用定位。
3. **引用三分类器（3-Tier Classifier）**：
   - `STRONG_CODE`（强）：代码符号调用、Import、接口实现；
   - `MEDIUM_RESOURCE`（中）：XML 布局绑定、资源 ID、路由表；
   - `WEAK_DOC`（弱）：Markdown、行内注释、格式化日志。仅有弱引用者判定为 `CONFIRMED_ORPHAN`，不得伪称存活。
4. **S1–S3 求解器自检协议（严禁硬编码静态白名单）**：
   任何扫描与门禁必须通过协议三道防线：
   - **S1（注入假死检出）**：注入合成死符号，必须 100% 精确捕获且检出数精准 +1；
   - **S2（在用保护）**：活跃在用符号注入引用后，必须 100% 识别为 `ALIVE`（0 误报）；
   - **S3（逐字节一致）**：同一 HEAD blob 重复分析，输出的 `candidates.json` 计算出逐字节完全一致的 SHA-256 哈希。
5. **Fail-Closed 安全降级与增量防腐门禁**：
   - 遇动态反射或无法 100% 证伪的符号，一律判定为待证（`PENDING_VERIFICATION`）或保留，绝不直接判死；
   - 提交门禁 `lab orphan check-diff --staged` 遵循 $O(\Delta)$ 复杂度，仅提取 `git diff` 新增行进行校验，检出新增孤儿一律 Exit 1 阻断提交。

---

## 3. Implementation Status（落地情况 · 截至 2026-11-10）

| 模块 / 能力 | 状态 | 说明 |
|---|---|---|
| **Core 求解器内核** | ✅ 已实现 | `blob-reader.mjs`, `inverted-index.mjs`, `classifier.mjs`, `solver.mjs` |
| **S1–S3 自检门禁套件** | ✅ 已实现 | `protocol-s1-s3.mjs`，S1/S2/S3 持续自检全绿 |
| **Android 适配器** | ✅ 已实现 | Manifest 组件保护、Qualifier 族成对性聚合、反射识别 |
| **Python 适配器** | ✅ 已实现 | `__all__` 保护、pytest 发现机制豁免、`getattr` Fail-Closed 降级 |
| **Web / TS 适配器** | ✅ 已实现 | `package.json` entrypoints 保护、ESM/CJS 导出分析与未引用 export 检出 |
| **增量提交门禁 (check-diff)** | ✅ 已实现 | `core/diff-checker.mjs`，新增假死提交精准 Exit 1 阻断 |
| **安全修剪预览 (clean)** | ✅ 已实现 | `core/cleaner.mjs`，默认 `--dry-run` 预览 unified diff，零修改磁盘 |
| **Preflight 门禁集成** | ✅ 已实现 | `templates/pre-commit.d/30-orphan-guard`（耗时 ≤ 1.5s） |
| **自动化测试与双盲审计** | ✅ 已实现 | 11 组单测全通过，审计工单 `audit-20261110-01-task` 终态闭环 |

> **结论**：`units/orphan` v1.0.0 功能完整就绪，所有代码已进入生产可用状态。

---

## 4. Rationale（外部最佳实践与设计背书）

1. **对比 Uber Piranha**：Piranha 针对已知 Flag 的 AST 重写极其安全，但缺乏全仓盲扫能力；`units/orphan` 引入 Inverted Line Index 兼顾全仓发现与安全保护；
2. **对比 Knip**：Knip 集合减法在 JS/TS 生态极强，但在多语言混合仓库无法通用；`units/orphan` 抽象出多技术栈适配器层，统一数据契约 `candidates.json`；
3. **对比 Android Lint 与 Vulture**：彻底摆脱重型 Gradle 守护进程与易碎的静态正则，通过 Git HEAD blob 流式加载确保毫秒级性能与绝对零工作树污染。

---

## 5. Consequences / Invariants（冻结后不可变量）

1. **严禁在扫描阶段直接读写工作树**：必须始终通过 `BlobReader` 读取 Git HEAD blob。
2. **严禁引入硬编码业务白名单绕过测试**：求解器自身正确性必须通过 S1–S3 协议持续机检自证。
3. **非 100% 证伪符号严禁自动删除**：凡存在反射风险、第三方动态契约的候选，状态恒为 `PENDING_VERIFICATION`，删除操作仅限 `CONFIRMED_ORPHAN`。
4. **门禁钩子执行耗时预算**：`30-orphan-guard` 在暂存区执行时间不得超过 1.5s，严禁退化为全仓重扫。

---

## 6. Future（后续演进任务，不影响本决策冻结）

1. **扩展更多语言生态**：后续视业务诉求扩充 Rust (`cargo` / `unused_variables`) 与 iOS/macOS (Swift / Xcode assets) 适配器；
2. **自动生成 PR 流水线**：结合 Agent Baton，在 CI 周期性扫描生成 `candidates.json` 后，自动为责任人派发安全清理工单。
