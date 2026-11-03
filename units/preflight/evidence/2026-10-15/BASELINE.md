# preflight 审计基线 — 2026-10-15

> 对象：`~/Documents/lab/preflight/`（v1.0.1 → v1.0.4；本基线初写于 v1.0.2 阶段，KF-8/KF-4 后续闭环见 `run-kf8.txt` 与 `review-gate/CHANGELOG.md` v1.0.5）。
> 对应需求：`docs/audit-requirements.md`。
> 原始输出：`run.txt`（同目录，本次实际执行的命令与回显）。

## 复现命令

```bash
# 语法（四件；pre-commit-dispatcher 已于 v1.0.3/KF-8 删除，门禁唯一形态即 templates/pre-commit）
for f in preflight.sh pre-commit pre-commit.d/20-preflight check.sh; do
  bash -n ~/Documents/lab/preflight/templates/$f; done
# 行为（详见 run.txt 内的临时仓场景）
```

## 结果（修复前 → 修复后）

| 项 | 修复前行为 | 修复后行为 |
|---|---|---|
| **KF-1/2/3** 共存口径 | 模板头 + 两套 prompt 写「合并/并入」hook（与 v1.0.1 dispatcher 矛盾） | 统一改为 dispatcher，禁焊脚本；`grep` 不再命中 hook 共存语境的"合并/并入" |
| **KF-5** "可机检" | 声称三节可机检，**无**对应工具 | 新增 `templates/check.sh`；三节齐 → exit 0，缺一节 → exit 1（已验证：文件/ stdin 两路） |
| **KF-6** 证据 | "已实测"仅临时目录，不留痕 | 本目录（持久） |
| **KF-7** conf 定位 | `CONF=$PWD/preflight.conf`，子目录调用找不到仓根 conf | 先归位 REPO_ROOT，默认读 `$REPO_ROOT/preflight.conf`；实测：从 `sub/` 调用命中仓根 conf（AGENTS.md 2 > 预算 1 → FAIL） |
| **KF-9** 坏 DOC_BUDGETS | `max` 非数字 → bash 报 "integer expression expected" | 显式点名 `✗ DOC_BUDGETS 格式应为 file:maxLines…`，exit 1 |
| **KF-11** 非 git 目录 | `git` 逐条 `fatal: not a git repository` 刷屏 | 提前 `⚠️ 不在 git 工作树内`，git 调用静音；仍可跑其余检查，exit 1 |
| **KF-10** fail-open | 隐式（无说明） | README §7 + AGENTS 红线显式声明为既定立场（与 review-gate 一致） |

## 通过的行为断言（全绿）

- clean 仓 → `preflight ✅ PASS` exit 0
- 运行产物被跟踪 → 两项点名 + exit 1
- 坏 `DOC_BUDGETS` → 点名 + exit 1
- 子目录调用命中仓根 conf
- 非 git 目录 → 告警不刷屏 + exit 1
- `check.sh` 三节齐 exit 0 / 缺节 exit 1 / stdin 路
- dispatcher：一过一败 → **两条都跑** + 整链 exit 1（run-all）
- `bash -n` 四件全绿

## 未闭环

- **KF-4**：review-gate 仍主张「已有 3 hook 须合并」→ 跨模块口径统一（改 review-gate 走路由）。

## 后续（KF-8 拍板后，同日）
- KF-8 已拍板「只留 dispatcher」：删除单独 `templates/pre-commit`，把分发器改名为 `templates/pre-commit`（即门禁唯一形态）；README/AGENTS/两套 prompt 同步。见 CHANGELOG v1.0.3。

## 未测（诚实边界）

- Linux/GNU 工具链、Windows git-bash 未实机（macOS + bash 3.2/zsh 为实机）。
- 消费仓真实接入（属各仓任务，非本审计）。
