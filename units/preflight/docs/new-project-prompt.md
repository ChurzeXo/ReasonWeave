# 新项目接入提示词（preflight）

> 用法：粘贴进**新项目** Agent 会话，替换占位符。规范细节永远以 `~/Documents/lab/preflight/README.md` 为准，项目里只放指针。

```text
给本项目接入「仓库不变量门禁」（preflight）。规范与模板在 /Users/churze/Documents/lab/preflight/（先读 README.md §2/§3/§4/§5）。
项目根：<项目根目录>

【只读规划，先别写】
1. 盘点本项目的不变量：哪些运行产物应被忽略（如索引库/本地 db/构建产物）？哪些根文档有行数预算？backlog 目录与条目格式？
2. 产出一份「不变量清单」发我确认：每条 名称 / 断言（机械可判定）/ 是否阻断。

【确认后落地】
1. 复制 templates/preflight.sh → scripts/preflight.sh，按清单改顶部默认值（或建 preflight.conf 覆盖）。
2. 装门禁：复制 templates/pre-commit → .githooks/pre-commit（分发器，唯一形态）；复制 templates/pre-commit.d/20-preflight → .githooks/pre-commit.d/20-preflight。若已有/将有 review-gate 等钩子，把它们的子检查放同一 .githooks/pre-commit.d/（数字前缀定序，如 10-review-gate），**不要**焊成一份脚本。随后 `git config core.hooksPath .githooks`。
3. 复制 templates/wrap-up.md → docs/templates/wrap-up.md；复制 templates/check.sh → scripts/check-wrapup.sh。
4. 根 AGENTS.md 加一句指令：「动手前跑 scripts/preflight.sh；收尾回报按 docs/templates/wrap-up.md 三节填；门禁细节见 ~/Documents/lab/preflight/README.md」。
5. 若宿主支持 Stop hook，把 scripts/preflight.sh 挂到回合结束前（未过则逼继续），见 README §5。

【验收】
- bash scripts/preflight.sh 在当前仓能跑出 ✅/❌ 并 exit 0/1。
- 故意制造一个违规（未忽略产物 / 超预算文档 / 坏 backlog），确认被点名且 exit 1；清理后 exit 0。
- 收尾报告过 `bash scripts/check-wrapup.sh <report.md>`（三节锚标题齐全）。
完成后回报 preflight 结果与三节形状。
```
