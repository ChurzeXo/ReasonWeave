# AGENTS.md — preflight 通用模块维护指南

本文件给**维护本模块（`~/Documents/lab/preflight/`）的 Agent** 看，不是给使用方看。使用方看 `README.md`；项目接入提示词见 `docs/*.md`。

## 定位与关系

- **本模块 = 机件（规范 + 可跑脚本）的单一事实源**。独立于任何项目 / playbook。
- **方法在 playbook**：`~/Documents/lab/playbook/docs/18-shift-left.md` 讲"为什么"，本仓只讲"怎么跑"。
- **同范式模块**：`review-gate/`（代码新发现）、`backlog/`、`handoffs/`；互补不重叠。

## 核心约定（不变量，改动不得破坏）

1. **三条腿缺一不可**：探针（`preflight.sh`）+ 门禁（`pre-commit` 分发器 + `pre-commit.d/20-preflight`）+ 形状（`wrap-up.md`，由 `check.sh` 机检）。
2. **只装机械可判定项**：语义判断不进脚本——留给回报形状与独立上下文复核。
3. **门禁是回归篱笆不是零违规墙**：只拦当前不变量态退化。
4. **变量化、不绑项目**：运行产物路径 / 文档预算 / backlog 格式 / 事实源对账项（`RECONCILE_PAIRS` / `RECONCILE_CMD`）全部用变量或 `preflight.conf`，不得写死某仓特征。未配置对账项时保持 fail-open 跳过。
5. **A4 非阻断**：工作树态只列不判，供人工分类路由。

## 版本化纪律

- 模板文件头部带 `source: ~/Documents/lab/preflight/` 注释。
- 改模板/规范 → bump `VERSION.md` + 写 `CHANGELOG.md` 迁移说明。
- 新增检查项 → 同步更新 README §2 表格与 `preflight.sh` 默认值。

## 维护后的验证

改 `preflight.sh` / `pre-commit` 后做语法检查（不依赖真实仓库）：

```bash
bash -n ~/Documents/lab/preflight/templates/preflight.sh
bash -n ~/Documents/lab/preflight/templates/pre-commit
bash -n ~/Documents/lab/preflight/templates/pre-commit.d/20-preflight
bash -n ~/Documents/lab/preflight/templates/check.sh
```

真机验证（可选，需 git 仓库）：临时建测试仓，制造一个未被忽略的产物路径 / 超预算文档 / 坏 backlog，确认 exit 1 且项被点名；清理后 exit 0。分发器另测：`.githooks/pre-commit.d/` 放两个子检查（一过一败），确认**两条都被执行**且整链 exit 1（run-all 语义）。

## 红线

- **不要把本模块规范复制回项目仓库**（项目只按 `docs/*.md` prompt 接入；项目里只放指针 + 一句指令）。
- **不要给门禁加"语义判断"**——脚本判不了的别硬塞，否则制造假绿。
- **不要声称"可机检"却没有对应 check 工具**——形状声明必须配 `check.sh` 这类可跑校验，否则与"prompts are requests"无异。
- **缺件放行（fail-open）是既定立场**（与 review-gate 一致）：不得改成静默阻断；但装完必跑验收。
- **不要删减诚实边界**（README §7）——这是用户信任的前提。
- **门禁只有一种形态**：`templates/pre-commit` 就是分发器（run-all）；不要把逻辑焊成一份脚本、也不要另立"单独版"——各工具子检查一律放 `.githooks/pre-commit.d/`。
