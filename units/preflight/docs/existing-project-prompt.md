# 现有项目接入提示词（preflight）

> 用法：粘贴进**现有项目**（可能已有 hook / CI / lint）Agent 会话，替换占位符。规范细节永远以 `~/Documents/lab/preflight/README.md` 为准。

```text
给本项目接入「仓库不变量门禁」（preflight），不推倒重来。规范与模板在 /Users/churze/Documents/lab/preflight/（先读 README.md §2/§3/§5）。
项目根：<项目根目录>

【只读审计，先别改】
1. 现状盘点：现有 .githooks/ 或 core.hooksPath？已有几个 hook（pre-commit 是否被占用）？CI 有没有可插入的一步？根 AGENTS.md 现状（有无行数预算）？无关产物有没有已被跟踪的？
2. 产出一份「差距清单」发我：每个不变量 → 现状 / 缺口 / 是否阻断。特别标出：已跟踪的产物（这是最优先止血项）、与现有 hook 的共存点（dispatcher + `.d/`）。

【确认后分期落地】
1. 先止血：把已被跟踪的运行产物从索引移除并补 .gitignore（这步单独一次提交，附 diff 人审）。
2. 复制 templates/preflight.sh → scripts/preflight.sh，按本项目不变量校准默认值。
3. 门禁共存：复制 templates/pre-commit → .githooks/pre-commit（分发器）；把现有检查移入 .githooks/pre-commit.d/10-<现有>，preflight 放 20-preflight，保证两类检查都跑、互不覆盖也不焊死。
4. 复制 templates/wrap-up.md → docs/templates/wrap-up.md；复制 templates/check.sh → scripts/check-wrapup.sh，根 AGENTS.md 加指针一句。
5. CI（如成熟）：把 scripts/preflight.sh 作为一步，未绿不许合并。

【验收】
- 现有 hook 未被破坏（单跑仍正常）。
- bash scripts/preflight.sh exit 0/1 符合现状；制造违规能被点名阻断。
- 收尾报告过 `bash scripts/check-wrapup.sh <report.md>`。
完成后回报差距清单闭合情况 + preflight 结果 + 三节形状。
```
