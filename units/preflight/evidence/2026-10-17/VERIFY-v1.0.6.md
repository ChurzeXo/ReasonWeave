# 验证记录 — v1.0.6 A1 忽略源核对（2026-10-17）

源：`~/Documents/lab/handoffs/PROBLEM-2026-10-16-preflight-consumer-install-feedback.md` #4（P3，嵌套 .gitignore 掩盖根规则移除）。

## 修复内容
`templates/preflight.sh` A1 忽略断言改取 `git check-ignore -v --no-index` 的**匹配规则来源**：源落在产物目录内部（`case "$src" in "$d"/*)`）即 ✗「忽略规则来自产物目录内部——仓根规则可能已缺失，请补到仓根 .gitignore」。

## 实测矩阵（临时 git 仓，完整输出 verify-v1.0.6.txt）

| 态 | 状态 | 结果 |
|---|---|---|
| T1 | 根规则在 + 产物自带 .gitignore（= swoop/prospero 现况，无锚/有锚两形态均测） | ✅ PASS exit 0（-v 报仓根，合法双保险不误伤） |
| T2 | 仓根规则被注掉（仅剩产物目录内 `*`） | ✗「忽略规则来自产物目录内部（.codegraph/.gitignore）」exit 1——**旧版此态假绿** |
| T3 | 根规则在 + `git add -f` 跟踪 | 只报「✗ 被跟踪」，来源不误报（v1.0.5 解耦保持） |
| T4 | 完全无规则 | ✗「未被 .gitignore 覆盖」exit 1（原断言回归） |
| T5 | conf 500 + env 100 | `· DOC_BUDGETS: env 显式设置，压过 conf/默认` + ✗ exit 1（v1.0.5①回归） |
| T6 | conf 500，env 不设 | ✅ PASS exit 0 |
| T7 | 坏 backlog | ✗ 点名 exit 1；清理后 ✅ exit 0（A3 回归） |

## 过程中发现并修复的模板自身 bug（值得留存）
- **bash 全角括号吞变量名**：`bad "…（$src）——…"` 中 `$src` 后紧跟全角 `）`，bash 在 UTF-8 locale 下把 `）` 吞进变量名 → `set -u` 报 `src）: unbound variable` 直接退出（真机 T2/T4 崩被发现）。修为 `${src}` 花括号形式。
- 已对全部模板（preflight.sh / check.sh / pre-commit / pre-commit.d/20-preflight）做 `$var` 后紧跟非 ASCII 的全量扫描，无其他实例。
- 教训：**中文提示语里的 `$var` 一律加花括号**——尤其是后随 `（）：，` 等全角标点时。

另：`bash -n` 四模板全过；git 2.54.0（`--no-index`/`-v` 均支持，需 ≥2.28）。
