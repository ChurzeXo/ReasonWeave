# 新项目接入 ADR（独立模块）· 提示词

> 用法：把下面整段复制，粘贴进**新项目**的 Agent 会话即可。项目会依据自身特色完成安装。

---

**【新项目接入 ADR · 独立模块安装】**

ADR（架构决策记录）已抽离为独立、可复用、可版本化的模块，位置可通过 `$(lab path adr)` 动态获取（单一事实源，含三档模板 `light`/`standard`/`frozen` + `adr-init` 引导 + `VERSION`/`CHANGELOG`）。规范全貌见 `$(lab path adr)/README.md`；**不要**把规范复制到本项目，只放「动态指针 + 档位声明」。

请根据本项目特色完成安装：

1. **环境准备**：确认全局已可用 `lab` 与 `adr-init`（若未安装，先进入 toolkit 源码根目录运行 `npm link`）。
2. **选档（按项目特色决定）**：
   - 决策要钉死、不可随意改（如基础设施锁、合规护栏）→ `frozen`（激活态 `🔒 Frozen`）。
   - 仅记录、允许后续修订 → `light`（激活态 `Accepted`）。
   - 需要跟踪落地进度 → `standard`（激活态 `Accepted` + Implementation Status 段）。
   - 不确定就先用 `standard`；升级档位 = 写新 ADR 声明 Supersedes，不是原地改。
3. **初始化**：运行
   `adr-init <项目根目录> <tier> [项目名]`（或 `lab adr <项目根目录> <tier> [项目名]`）
   会生成 `adr/INDEX.md`（带 `Adopted` 版本声明）+ 起步 `ADR-0001`（bootstrap 决策）+ `adr/templates/adr-template.md` 参考副本。
   - ADR 目录路径自由（`adr/`、`group/architecture/adr/`、`docs/adr/` 均可），由本项目决定；`INDEX.md` 始终指向实际文件。
4. **指针横幅**：在 `adr/README.md`（若不存在则新建）顶部加一行：
   `本目录为 lab/adr 独立模块的 <tier> 档实例，采用 adr-template v<ver>，规范以 $(lab path adr)/README.md 为准`。
5. **（可选）集成钩子**——按项目需要接线，独立模块不强制：
   - 宪法钉死：若有 constitution，将 Frozen ADR 列入宪法附录（双保险）。
   - 契约闸门：改契约文件前须先有 ADR。
   - 规划联动：架构级决策在 plan 阶段产 ADR 草案，review 后转激活态。
   - CI 拦截：PR 改了被监视路径但无关联 ADR → 失败。
6. **校验**：确认 `adr/INDEX.md` 的 `Adopted` 已声明版本与 tier；确认 `adr/README.md` 指向独立模块。

完成后回复：① 选用 tier 及理由；② ADR 目录实际路径；③ 起步 `ADR-0001` 标题；④ 是否接了集成钩子。

---

> 本提示词由 `units/adr/` 维护，随模块版本演进更新。引用源：`$(lab path adr)/docs/new-project-prompt.md`。
