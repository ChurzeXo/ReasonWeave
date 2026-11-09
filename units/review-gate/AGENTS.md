# AGENTS.md — review-gate 通用模块维护指南

本文件给**维护本模块（`~/Documents/lab/review-gate/`）的 Agent** 看，不是给使用方看。使用方看 `README.md`；项目接入提示词见 `docs/*.md`。

## 定位与关系

- **本模块 = 规范单一事实源**。独立于任何项目 / playbook。
- **实现（开源工具）在别处**：OpenGrep standalone binary（`~/.local/bin/opengrep`，从 GitHub releases 装）；本地 review 技能 `code-review-and-quality`（WorkBuddy 内置，全局可用）。本仓库只放「通用模板 + 接入说明」，不放工具本身。
- 上游已验证案例见 Tappy（`evidence/opengrep-baseline-20261013/`、`evidence/l2_review_20261013.md`）；新语言栈接入需各自跑基线验证。

## 核心约定（不变量，改动不得破坏）

1. **三层噪音治理模型**：`.semgrepignore` + `--exclude-rule` + 行内 `nosem`，缺一不可解释收敛。
2. **门禁是回归篱笆不是零误报墙**：只拦基线外新发现；基线需人工 review 接受。
3. **变量化、不绑项目**：规则集 / 排除项 / 基线路径 / 扫描扩展名全部用环境变量或顶部变量，预设按语言栈切换；不得写死 Tappy 的 Kotlin/Android 特征。
4. **基线 = 主动接受的清单**：模板与文档反复强调「人工过目」，不自动信任。
5. **多门禁共存走 dispatcher（口径与 preflight 统一）**：git 一仓只允许一个 `.githooks/pre-commit` → 各门禁作 `.githooks/pre-commit.d/` 子检查，编排器见 `~/Documents/lab/preflight/templates/pre-commit`。**禁止**「合并/焊入既有脚本」口径（手改焊死 hook 是 v1.0.2/v1.0.3 两 bug 的根因模式）。
6. **双盲审计独立实测（Clean Runner 纪律）**：审计方严禁仅依靠静态读码或自测口令盖章。必须通过 `clean-runner.mjs` 启动独立进程重跑测试，以实际物理 Exit Code 为唯一准绳。禁止伪造或绕过测试结果。

## 版本化纪律

- 模板文件头部带 `source: ~/Documents/lab/review-gate/` 注释。
- 改模板/规范 → bump `VERSION.md` + 写 `CHANGELOG.md` 迁移说明。
- 新增语言栈预设 → 同步更新 README §4 表格与 `scan.sh` / `pre-commit` 默认 `RULESETS`。

## 维护后的验证

改 `scan.sh` / `pre-commit` 后做语法检查（不依赖真实仓库）：

```bash
bash -n ~/Documents/lab/review-gate/templates/scan.sh
bash -n ~/Documents/lab/review-gate/templates/pre-commit
```

真机验证（可选，需 git 仓库）：临时复制三模板到测试仓，跑 §3.2 流程，确认 baseline 生成 + 门禁触发/放行符合预期。

## 红线

- **不要把本模块规范复制回项目仓库**（项目只按 `docs/*.md` prompt 接入；项目里只放指针 + 一句指令）。
- **不要假设某语言栈规则集深度**（诚实边界 README §7）；SAST 不是银弹。
- **不要改动 OpenGrep binary 的安装方式之外的事**——binary 安装是用户环境责任，本模块只引用 `~/.local/bin/opengrep`。
- **不要删减诚实边界**（§7）——这是用户信任的前提。
