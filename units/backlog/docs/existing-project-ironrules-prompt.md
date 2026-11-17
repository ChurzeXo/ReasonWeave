# 已接入 backlog 的项目 · 依赖方铁律抽离迁移 · 提示词

> 用法：把下面整段复制，粘贴进**已接入 backlog**（沿用 `docs/backlogs/`）的项目 Agent 会话即可。新接入用 `new-project-prompt.md`；用了 playbook 的用 `existing-project-prompt.md`。

---

**【Backlog 依赖方铁律 · 抽离迁移（已接入项目）】**

backlog 模块已把「涉 Swoop/Prospero 的依赖方铁律」从模块层剥离：模块不再预设任何依赖方，只提供通用的《依赖方铁律规范》（见 `$(lab path backlog)/README.md` §4）。每个项目须自建**自己的**依赖方铁律。规则本体仍在模块，你只补一份**薄数据文件**——不要重抄规则，只写你的依赖方名单与最少本地约束。

请先只读盘点，把清单发我确认后再动手，勿一次性大改。

1. **盘点（不改文件）**：列出 `docs/backlogs/` 现有条目里 `dep_on` 用过的值、正文三行依赖声明涉及的仓；检查根 `AGENTS.md` / `CONTRIBUTING` 有无照抄的模块旧铁律、或出现 `iggle/coreml/swoop/prospero/consul` 枚举。产出清单发我。

2. **建本项目铁律**：读 `$(lab path backlog)/README.md` §4「依赖方铁律规范」+ 模板 `$(lab path backlog)/templates/project-ironrules.md`，在本项目建 `docs/backlogs/IRONRULES.md`，至少含：
   - ① **依赖方名单**：本项目真实的跨仓 / 外部依赖（没有就写「无」）；
   - ② **依赖声明格式**：涉及方 / 需要什么 / 现状；
   - ③ **路由判据**：根因在依赖方且现在就要改 → handoff，不写 backlog；未来构想依赖他方能力 → 写 backlog + `type: decide`；依赖方行为不确定 → `type: decide`。
   逐字替换成你的仓名，**不得保留 Swoop/Prospero/consul 字样**。

3. **改项目指令**：根 `AGENTS.md` 里凡是复制了模块旧铁律或旧枚举的段落，改为一行指针：「依赖方铁律见 `docs/backlogs/IRONRULES.md`；规范见 `$(lab path backlog)/README.md` §4。」

4. **迁移存量条目**：旧条目原样不动（历史留痕）；新条目 `dep_on` 只用本项目铁律声明的值域。

5. **校验**：随手 `add` 一条带依赖的测试条目，确认正文能带三行声明、`dep_on` 取自本项目值域。

完成后回复：① 本项目依赖方名单（或「无」）；② `IRONRULES.md` 是否已建；③ 根 `AGENTS.md` 旧铁律是否已改为指针；④ 存量条目清单。

---

> 本提示词由 `units/backlog/` 维护，随模块版本演进更新。引用源：`$(lab path backlog)/docs/existing-project-ironrules-prompt.md`。
