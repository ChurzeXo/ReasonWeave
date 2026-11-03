# 已用 playbook 的项目接入 ADR（独立模块）· 提示词

> 用法：把下面整段复制，粘贴进**已经在使用 playbook** 的项目的 Agent 会话即可。本提示词处理「从 playbook 内联规范迁移到独立模块」，新项目请用 `new-project-prompt.md`。

---

**【给已接入 playbook 的项目 · ADR 独立化迁移】**

ADR 制度已从 playbook 抽离为独立模块，位置：`~/Documents/lab/adr/`（单一事实源，含三档模板 `light`/`standard`/`frozen` + `scripts/adr-init.sh` 引导 + `VERSION`/`CHANGELOG`）。playbook 的 `docs/05-adr.md` 现已降级为「指针 + AEF 接线」，不再含完整 ADR 规范与模板。

你所在项目已在用 playbook，请按下列步骤把本地 ADR 现状收敛到独立模块（不要把规范细则复制回本地）：

1. **判定引用方式**：本项目是（a）直接引用 `~/Documents/lab/playbook/` 共享目录，还是（b）把 playbook 复制进了仓库？若是（b），先同步最新 `docs/05-adr.md`（指针版），或至少把项目内对 ADR 的引用改为指向独立模块。
2. **定位本地 ADR 目录**：常见 `adr/`、`group/architecture/adr/`、`docs/adr/`。若无 ADR 目录，跳到第 4 步初始化。
3. **指针 + 档位声明**：在本地 ADR 目录的 README 顶部加一行横幅，声明本目录为「`lab/adr` 独立模块的 `<tier>` 档实例，采用 `adr-template v<ver>`，规范以 `~/Documents/lab/adr/README.md` 为准」。档位选择：决策要钉死不可改 → `frozen`；仅记录、允许修订 → `light`；需跟踪落地进度 → `standard`。
4. **新建结构（仅当无 ADR 目录时）**：运行 `bash ~/Documents/lab/adr/scripts/adr-init.sh <项目根目录> <tier> [项目名]`，会生成 `adr/INDEX.md`（带 `Adopted` 版本声明）+ 起步 `ADR-0001` + 模板副本。
5. **收敛分叉（若本地模板/README 与独立模块不一致）**：保留已有 ADR 内容不动（append-only，绝不回迁旧 ADR）；仅把模板与 README 指针收敛到独立模块。如项目 `AGENTS`/`CONTRIBUTING` 里写过 ADR 五段/状态机细则，改为「详见 `~/Documents/lab/adr/README.md`」。
6. **校验**：确认 playbook `05-adr.md` 在本项目中是被引用而非被复制；确认本地 ADR README 已指向独立模块且声明了 tier。

完成后回复：① 本项目采用哪个 tier；② ADR 目录实际路径；③ 是否需补 `adr-init`；④ 与独立模块有无分叉点已收敛。

---

> 本提示词由 `~/Documents/lab/adr/` 维护，随模块版本演进更新。引用源：`~/Documents/lab/adr/docs/existing-project-prompt.md`（曾用名 `MIGRATE.md`，同名异称）。
