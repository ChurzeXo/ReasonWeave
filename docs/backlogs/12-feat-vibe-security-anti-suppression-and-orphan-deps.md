---
id: 12
title: feat(review-gate/orphan): Vibe Coding 虚假安全感防御：免检穿透审计、孤儿依赖清洗与可达性闭环
type: feature
priority: high
status: closed
owner: lab/review-gate + lab/orphan
dep_on: none
handoff_ref: 'ADR-0011'
created: 2026-11-21
updated: 2026-11-22
completed: 2026-11-22
---

- **要做什么**：
  依据 ADR-0011 确立的“Vibe Coding 虚假安全感穿透防御与依赖可达性治理”决策，系统性落地免检穿透审计、孤儿依赖清洗与安全测试护栏机件：
  1. **Phase 1: `units/review-gate` 引入 Anti-Suppression 穿透审计与轻量级降级矩阵**
     - 在 `review-gate/templates/scan.sh` 与门禁逻辑中增加 `--no-suppress`（穿透扫描）模式，强制忽略源码行内 `# noqa`、`# nosem`、`// nolint` 注释，计算真实未遮蔽的高危违规；
     - 增加提交拦截：禁止源码新增行内裸免检，所有合法误报必须显式收敛至 `baseline.json`；
     - 提供确定性轻量降级矩阵：在 OpenGrep / Semgrep 缺失时平滑回落至 `ruff check --select S`（Flake8-Bandit 安全规则集）与本地正则探针，并在回执中严格遵循诚实边界（标注 `fallback: ruff-bandit`，严禁虚报实测）。
  2. **Phase 2: `units/orphan` 扩展 `orphan-deps` 求解器与零调用假凭证清洗**
     - 在 `units/orphan` 引擎中扩展依赖清单对账机件：解析 `requirements.txt` / `pyproject.toml` / `package.json`，与全仓 AST 实际 `import` / `require` 集合求差集；
     - 将 0 引用包标记为孤儿依赖，在 CVE 扫描前强制提示或一键清理，直接消除 90%+ 虚假安全告警风暴；
     - 集成高熵/正则凭证扫描，结合内存倒排索引核验引用度：零调用假 Token 一键物理清除，在用凭证阻断并强制外置至环境变量。
  3. **Phase 3: `units/playbook` 沉淀第 20 章防线方法论**
     - 在 `units/playbook/docs/` 下沉淀《20-vibe-security-and-anti-suppression.md》，固化四大核心铁律：
       - ① “`# noqa` 只是声明不是证明”；
       - ② “今天碰巧够不着不等于安全（Accidental Unreachability != Security）”；
       - ③ 依赖漏洞可达性分流规范（Unreachable 暂缓升级必须落盘为结构化 Backlog / ADR，严禁口头放行）；
       - ④ 负向安全测试护栏先行（必须先编写 Exploit Regression 测试，以子进程 Exit 0 交付）。
  4. **Phase 4: 全栈门禁挂载与自检自证**
     - 编写自测套件验证穿透阻断、孤儿依赖检测、Ruff 降级输出与 Clean Runner 重跑逻辑；
     - 更新各 Unit `VERSION.md` 与 `CHANGELOG.md`。

- **触发背景与依据**：
  - 源自斯坦福大学 CS146S《现代软件开发者》2025/2026 第 6 周安全作业实操复盘；
  - 核心 ADR 决议：`group/architecture/adr/0011-vibe-security-anti-suppression-and-dependency-reachability.md` (Accepted / 🔒Frozen)。

- **验收判据（DoD）**：
  - [ ] 门禁能准确拦截通过 `# noqa` 伪装绕过的高危调用（`eval`/`exec`/`subprocess`/SSRF）；
  - [ ] `orphan-deps` 针对未导入的冗余包提供精确告警与清理建议；
  - [ ] 缺少扫描环境时，门禁诚实输出 Fallback 状态并阻断伪造结果；
  - [ ] `playbook` 第 20 章规范与索引闭环。
