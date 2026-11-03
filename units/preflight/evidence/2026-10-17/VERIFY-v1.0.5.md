# 验证记录 — v1.0.5 三项缺陷修复（2026-10-17）

源：`~/Documents/Swoop/reviews/2026-10-16-preflight-upstream-defects.md`（缺陷①/②/③；③另见 `~/Documents/lab/handoffs/PROBLEM-2026-10-16-preflight-consumer-install-feedback.md` P1）

方法：临时 git 仓（AGENTS.md 499 行 + preflight.conf DOC_BUDGETS=500 + .gitignore 含 .codegraph/），复制修复后 `templates/preflight.sh` 实跑。完整输出：`verify-v1.0.5.txt`。

| 场景 | 结果 |
|---|---|
| S0 旧行为复现（conf 后置于默认 source） | 生效值 = conf 的 500，env 的 100 被吞 → 假绿 PASS（缺陷①曾存在，实证） |
| S1 干净态（无 env，conf 生效） | ✅ PASS exit 0 |
| S2 缺陷①修复：`DOC_BUDGETS=AGENTS.md:100` + conf 500 | `· DOC_BUDGETS: env 显式设置，压过 conf/默认` + `✗ AGENTS.md = 499 行 (> 100)` exit 1 |
| S3 env 与 conf 同值(500) | 不留痕、PASS exit 0（不打扰） |
| S4 env 放宽 600 压过 conf 500 | 留痕 + PASS（对窄对宽都生效） |
| S5 缺陷②修复：`git add -f` 已忽略目录 | `check-ignore`(旧) exit 1 = 假红来源；`--no-index` exit 0 = 规则覆盖；A1 只报 `✗ .codegraph/ 或其下有文件被跟踪`，**不**报「未被 .gitignore 覆盖」exit 1 |
| S6 `git rm --cached` 清理后 | 回全绿 exit 0 |
| S7 A3 坏 backlog 回归 | 仍被点名 exit 1（修复未破坏其它断言） |
| S8 缺陷③：侦察命令对照 | 旧 `awk 'END{print FILENAME": "NR}'` → `CLAUDE.md: 540`（499+41 累计，错）；新 `wc -l` → 499 / 41 / total 540（对） |

另：`bash -n` 四个模板全过；git 2.54.0 支持 `--no-index`（该开关需 git ≥ 2.28，2020-10，消费方无兼容风险）。
