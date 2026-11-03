# ADR System Version

本文件是 **ADR 制度本身** 的版本号（与具体项目的 ADR 内容无关）。

- **v1.0** (2026-10-10)：首版。三档模板（light / standard / frozen）+ 编号规则 + INDEX 唯一索引 + 注入策略（最近 3–5 条）+ `adr-init` 引导脚本。模板文件各自带 `v1.0` 头。
- **升级规则**：模板变更 → bump 对应模板头部版本 `vX.Y`，并在 `CHANGELOG.md` 写迁移说明；已有项目通过 `INDEX.md` 的「Adopted」行声明自己用的是哪一版，旧 ADR 不强制回迁。

> 注意区分两层版本：
> - **ADR 制度版本**（本文件）：管理「ADR 这套规范」的演进。
> - **单个 ADR 内容**：append-only，永不改已 Accepted/Frozen 原文（铁律 1）。
