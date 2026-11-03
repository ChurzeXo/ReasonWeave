# Backlog System Changelog

## v1.1 (2026-10-11)

- **依赖方铁律泛化**：模块不再预设依赖方（移除 iggle/coreml/swoop/prospero/consul 硬编码枚举与「涉 Swoop/Prospero 条目铁律」），改为**依赖方铁律规范**（`README.md` §4）——不变量（涉依赖方条目必带三行声明）＋通用路由判据＋匿名样例。
- **项目自建铁律**：每个项目建薄数据文件 `docs/backlogs/IRONRULES.md`（依赖方名单 / 声明格式 / 本地约束），模板见 `templates/project-ironrules.md`。
- **`dep_on` 值域**：从固定枚举改为「由项目铁律声明，无依赖填 none」（README §3 / SKILL §2 同步）。
- **新增分发提示词** `docs/existing-project-ironrules-prompt.md`（已接入项目自建铁律、移除照抄的生态仓名），`AGENTS.md` 分发索引补第三份。
- **skill 同步**：`SKILL.md` §4 泛化、description/纪律/路由表去 Swoop/Prospero 字样；`backlog.mjs` USAGE 帮助文本改 `<依赖方|none>`（行为零变更，`--dep-on` 本就收任意串）。
- **模板版本**：entry.md / project-ironrules.md 头部 `v1.1`。

### 迁移说明（针对已接入方）

- **已建 `docs/backlogs/` 的项目**：旧条目原样不动（历史留痕）；新条目 `dep_on` 遵循项目自建 IRONRULES 的值域。项目根 AGENTS.md 里照抄的旧铁律 / 旧枚举段落改为一行指针，见 `docs/existing-project-ironrules-prompt.md`。
- **skill 三客户端**：symlink 指向不变，内容同步生效，无需动作。
- **playbook**：`07-backlog.md` 的「依赖方铁律」指的就是本模块 §4，无需改章。

## v1.0 (2026-10-11)

- 从 `~/Documents/lab/playbook/docs/07-backlog.md` 抽离为独立模块 `~/Documents/lab/backlog/`。
- 规范以 skill（`~/Documents/Skill/backlog-capture/`，三客户端 symlink 单一真相源）实际约定为准。
- 修正 playbook 旧稿与 skill 的三处相反约定：`B-NNN` → 数字 id；按主题聚合 → 一任务一文件；改状态 append-only → 关闭即删文件。
- playbook 该章降级为「指针 + AEF 接线」（路由边界表 + 落地动作），不再含通用规范。

### 迁移说明（针对已接入方）

- **skill 三客户端**（`~/.workbuddy/skills`、`~/.agents/skills`、`~/.claude/skills` 的 `backlog-capture`）：symlink 指向不变，无需动作；仅 `SKILL.md` 的「唯一事实源」指针从 `DESIGN.md` 改为本模块 `README.md`。
- **playbook 项目**：`docs/07-backlog.md` 已改为指针，通用规范以本模块为准。
- **consul / 各仓已有 `docs/backlogs/`**：条目格式本就是 skill 的数字 id 约定，无需迁移；如存在按 playbook 旧稿 `B-NNN`/主题聚合写的条目，保持原样，新条目按本模块写。
