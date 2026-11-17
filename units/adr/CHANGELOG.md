# ADR System Changelog

## v1.0.1 (2026-11-17)

- `scripts/adr-init.sh` 修复与加固：支持 `-h` / `--help` / `help` 参数输出规范用法；消除 `$HOME/Documents/lab/adr` 硬编码回退，基于脚本真实物理路径自解析 `ADR_HOME`，防御脱离原路径后的假接线与不可达崩溃。

## v1.0 (2026-10-10)

- 初版发布。三档模板：`adr-light.md` / `adr-standard.md` / `adr-frozen.md`。
- 核心不变量固定：append-only、INDEX 唯一索引、4 位递增编号、注入最近 3–5 条。
- 模板版本化：每个模板头部带 `v1.0`；`INDEX.md` 声明 Adopted 版本。
- `scripts/adr-init.sh` 引导新项目建仓（选档 + 起步 ADR-0001 + 模板副本）。
- 从 `~/Documents/lab/playbook/docs/05-adr.md` 抽离为独立模块；playbook 该章降级为指针 + AEF 接线。
- Tappy `group/architecture/adr/` 成为 frozen 档实例，指向本模块。

### 迁移说明（针对已有项目）

- **playbook 项目**：`docs/05-adr.md` 已改为指针，通用规范以本模块为准；AEF 特有接线保留在原章。
- **Tappy**：原有 `ADR-001..011` + `templates/adr-template.md` 不变；仅 README 顶部新增指针横幅，声明采用 `adr-template v1.0 (tier: frozen)`。
- 旧 ADR 内容**不回迁**，保持原样；新 ADR 按本模块模板写。
