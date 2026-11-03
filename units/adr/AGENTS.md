# AGENTS.md — ADR 独立模块维护指南

本文件给**维护本模块（`~/Documents/lab/adr/`）的 Agent** 看，不是给使用 ADR 的项目看。使用方请看 `README.md`；新项目接入提示词在 `docs/new-project-prompt.md`。

## 本模块的定位

- **ADR 制度的单一事实源**，独立于任何具体项目 / playbook。
- 内容自洽、可版本化、可复用：任何项目想用 ADR，拉本目录即可，不必上整套 AEF。
- `~/Documents/lab/playbook/docs/05-adr.md` 只是**指针 + AEF 接线**（AEF 特有的联动规则），不是本模块的副本。AEF 接线改动在 playbook 那边做，不在这里。
- Tappy 的 `group/architecture/adr/` 是 **frozen 档实例**，指向本模块；它是宿主，不是本模块的一部分。

## 核心不变量（任何改动都不得破坏）

1. **append-only**：已 Accepted / Frozen 的 ADR 原文绝不改。决策变 → 写新 ADR，旧条目标 `Superseded by NNNN`。
2. **INDEX 唯一索引**：编号 / 标题 / 状态 / 日期齐全；只有 Accepted/Frozen 入 Agent 上下文。
3. **4 位递增编号**，不复用已删编号。
4. **注入最近 3–5 条**：会话启动注入 INDEX 全表；具体任务只带该范围 Decision 段；生成新 ADR 带最近 3–5 条全文作范例。

## 三档强度（可调的核心，不要随意扩档）

| 档 | 激活态 | 何时用 |
|---|---|---|
| light | Accepted | 轻量记录、允许修订 |
| standard | Accepted | 需跟踪落地进度 |
| frozen | 🔒 Frozen | 决策钉死不可改（Tappy 用此档）|

- **档位差异的关键在「激活态 / 可改 vs 钉死」**，不在字段多寡。
- **不要新增第 4 档**，除非确有三档覆盖不了的需求出现。真要加，作为新 tier 模板 + README 表 + 版本说明，不破坏既有三档。

## 版本化纪律（两层，必须分清）

- **ADR 制度版本**（`VERSION.md`）：管理「这套规范」的演进。模板 / 结构变更 → bump 版本、写 `CHANGELOG.md` 迁移说明、更新 README §4。
- **单个 ADR 内容**：append-only，永不改（铁律 1）。
- 每个模板文件头部带版本：`<!-- adr-template v1.0 · tier: frozen -->`，bump 时同步改这里。
- `INDEX.md` 的 `Adopted:` 行声明宿主采用的模板版本；旧项目不强制回迁。

### 改模板的标准流程

1. 改 `templates/adr-<tier>.md` 内容。
2. bump 该模板头部版本（`v1.0` → `v1.1` 等）。
3. bump `VERSION.md`，在 `CHANGELOG.md` 写变更 + **迁移说明**（旧项目如何适配 / 是否需动）。
4. 同步 `README.md` §3/§4 的表与说明。
5. **测试**：见下。

## 引导脚本契约（`scripts/adr-init.sh`）

- 用法：`bash ~/Documents/lab/adr/scripts/adr-init.sh <target-dir> <tier> [project-name]`
- `ADR_HOME` 环境变量可覆盖模块路径（默认 `~/.Documents/lab/adr`）。
- tier 须 `light|standard|frozen`，否则 exit 2；模板缺失也 exit 2。
- 行为：建 `<target>/adr/` + `templates/`、写 `INDEX.md`（带 Adopted 版本声明）、生成起步 `ADR-0001`、拷所选档模板为 `templates/adr-template.md`。

## 维护后的验证（必做）

改完模板 / 脚本后，在 `/tmp` 跑三档回归（不要污染真实项目）：

```bash
cd /tmp && rm -rf adr-test && mkdir adr-test && cd adr-test
HH=~/Documents/lab/adr
for T in light standard frozen; do
  d="/tmp/adr-test/repo-$T"; mkdir -p "$d"
  bash "$HH/scripts/adr-init.sh" "$d" "$T" "Demo$T" >/dev/null
  echo "[$T] tree:"; find "$d/adr" -type f | sort
  echo "[$T] Adopted:"; grep "Adopted:" "$d/adr/INDEX.md"
  echo "[$T] ADR-0001 标题:"; grep -E "^# ADR-0001" "$d/adr/0001-Demo$T-bootstrap.md"
done
rm -rf /tmp/adr-test
```

异常档位应 exit 2：

```bash
bash ~/Documents/lab/adr/scripts/adr-init.sh /tmp/x bogus; echo "exit=$?"
```

## 红线

- **不要把本模块规范复制回项目仓库**（项目只放「指针横幅 + 档位声明」，细节读 `README.md`）。
- **不要改写宿主项目的已有 ADR**（那是 append-only，属项目自身）。
- **不要动 playbook 的指针章**来承载通用规范——那章只放 AEF 接线。
- 本模块本身不假定任何宿主；可选集成钩子（宪法钉死 / 契约闸门 / CI 拦截）由宿主项目实现，列在 `README.md` §6 即可，不要在这里写宿主专属逻辑。

## 接入提示词（分发用）

- **新项目**：让新项目 Agent 读 `docs/new-project-prompt.md` 并按其执行——它根据自身特色选档、运行 `adr-init`、加指针横幅、可选接集成钩子。
- **已用 playbook 的旧项目**：让项目 Agent 读 `docs/existing-project-prompt.md`（曾用名 `MIGRATE.md`，同名异称）——它处理从 playbook 内联规范迁移到独立模块、收敛分叉。两份内容不同，按项目状态分发对应那份。
