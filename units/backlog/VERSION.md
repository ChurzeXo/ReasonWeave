# Backlog System Version

本文件是 **backlog 制度本身** 的版本号（与具体项目的待办条目无关）。

- **v1.2.0** (2026-11-06)：正式发布《Agent 自主治理与隐患嗅探规范》（`AUTONOMOUS-GOVERNANCE.md`），确立三态分流漏斗（In-Scope 原地修复/ADR/Backlog）、立项合理性四问、单句呈批规约与领域插座机制，公共层 100% 保持业务中立。
- **v1.1** (2026-10-11)：依赖方条目铁律**泛化**——移除模块层硬编码的生态仓名单（iggle/coreml/swoop/prospero/consul），改为「依赖方铁律规范」（README §4）：不变量＋通用路由判据＋匿名样例；每个项目自建薄数据文件 `docs/backlogs/IRONRULES.md` 声明自己的依赖方名单与本地约束（模板 `templates/project-ironrules.md`）。`dep_on` 值域由项目铁律声明。新增分发提示词 `docs/existing-project-ironrules-prompt.md`。
- **v1.0** (2026-10-11)：从 playbook `07-backlog.md` 抽离为独立模块。规范以**已实现且实际在跑的 skill**（`~/Documents/Skill/backlog-capture/`）约定为准：一任务一文件、仓库内递增数字 id、关闭即删文件（git 留史）、三情形禁静默写入、依赖方三行声明。
  - 废弃 playbook 旧稿的三处相反约定：编号 `B-NNN`（→ 数字 id）、按主题聚合（→ 一任务一文件）、改状态 append-only 不删（→ 关闭即删）。
- **升级规则**：模板/规范变更 → bump 版本，写 `CHANGELOG.md` 迁移说明；同步 skill 的 `SKILL.md` 指针与（如有）`DESIGN.md` 注记。

> 注意区分两层：**制度版本**（本文件）管「这套规范」的演进；**单条待办** 关闭即删，靠 git 留史，无「内容 append-only 不改」这回事（这是 backlog 与 ADR 的关键差异）。
