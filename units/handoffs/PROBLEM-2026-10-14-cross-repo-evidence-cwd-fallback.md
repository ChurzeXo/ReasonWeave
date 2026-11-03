# PROBLEM-2026-10-14 — 跨仓回执 `evidence_commits` 缺 `evidence_repo` → `check` 回落 cwd 硬判 → 他仓全库误红

> 状态：问题说明 + 解决方案建议（供 handoffs 维护方**统一处理**）
> 报告方：Prospero（跨仓模式 · 2026-10-14）
> 影响范围：**所有跨仓回执**——凡声明 `evidence_commits` 而未声明 `evidence_repo`，任何**非该提交所属仓**的 cwd 跑 `handoff check` 即误报 exit≠0
> 建议处理人：handoffs 契约维护方（改 `handoff.mjs` / `RESPONSE-TEMPLATE.md` / 接入桩，升版本号）

---

## 0. 一句话结论

`evidenceProblems` 在 **cross 模式**下对「有 commits 但无 `evidence_repo`」的回执，经 `resolveRepoRoot(undefined)` **回落 cwd** 后**硬核**提交——把「在他仓 cwd 跑 check」变成「拿本仓对象库验他仓提交」，对不上即 `problems.push` 硬失败。这与契约自述冲突：`RESPONSE-TEMPLATE.md:32`「跨仓**经 `HANDOFF_REPO_ROOTS` 配置后才硬核**」、README v2.12.3「跨仓目标仓不可达时**降级 warn**」——**未配置即应降级，而非回落 cwd 硬判**。

---

## 1. 现象（实证 · Prospero · PROSPERO-20261014-03）

- 收 `PROSPERO-20261014-03-feature`（v2.12.4 桩刷新），`install` + 写回执后跑 `handoff check`：**首跑 exit 0**（当刻无冲突回执）。
- 同批他仓（SWOOP）几乎同时落 `receipts/SWOOP-20261014-03-feature-resp.md`（声明 `evidence_commits: aff2ad8`，**无 `evidence_repo`**）。
- 再跑 `handoff check`（cwd=`~/Documents/Prospero`）→ **exit 1**：
  ```
  fatal: ambiguous argument 'aff2ad8': unknown revision or path not in the working tree.
  ❌ check 未通过（1 个问题）:
    - evidence 提交不存在: aff2ad8（root=/Users/churze/Documents/Prospero）
  ```
- `aff2ad8` **实为 swoop 仓 HEAD**（`git -C ~/Documents/swoop cat-file -e aff2ad8` 通过）；被误判只因 check 拿 Prospero 当解析根。
- 对称性：SWOOP 侧从 `~/Documents/swoop` 跑 check 时，任何**他仓**含 commits 的回执同样会误红。**全库 check 结果随 cwd 漂移**。

---

## 2. 根因（契约↔代码矛盾 · 附行号 · 已读实）

| # | 位置 | 现状 | 问题 |
|---|------|------|------|
| 1 | `handoff.mjs:242-248` `resolveRepoRoot` | `if (!repoKey) return process.cwd();` | 缺省 repo → **cwd**，而 cwd 只对 **intra-repo（仓内）** 才等于「本仓」；cross 模式不成立 |
| 2 | `handoff.mjs:270-286` `evidenceProblems` | `requireEvidence = mode==='intra-repo'`；但 `hasAny`（有 commits/paths）时 **两模式都**走 `root=resolveRepoRoot(ev.repo)` → `git cat-file -e` 硬核 | cross 模式下 `ev.repo` 缺省 → root=cwd → 硬核他仓提交 |
| 3 | `handoff.mjs:278-282` | `root===null` ⇒ 降级 warn | **仅当 repoKey 非空且不可解析**才 warn；缺省走 cwd 分支**绕过**该降级 |
| 4 | `handoff.mjs:912` | check 对**所有**回执用 `{mode:'cross'}` 调 `evidenceProblems` | 他仓回执在**任意 cwd** 都会被本仓对象库硬判 |
| 5 | `RESPONSE-TEMPLATE.md:32` | `evidence_repo: <可选，缺省=cwd> … 跨仓经 HANDOFF_REPO_ROOTS 配置后才硬核` | **同一句里自相矛盾**：既「缺省=cwd」（=硬核），又「跨仓配置后才硬核」 |
| 6 | `README.md` v2.12.3 条 | 「跨仓目标仓不可达时**降级 warn**（可用 `HANDOFF_REPO_ROOTS` 启用硬核）」 | 代码未落实：缺省时回落 cwd，**未降级** |

**根因（一句话）**：`resolveRepoRoot` 的「缺省 ⇒ cwd」是为 **intra-repo** 设计的（cwd 即本仓），却被 **cross 模式**继承；cross 下缺省 `evidence_repo` 应视为「目标仓不可达」→ 降级 warn，而非拿 cwd 硬判。

---

## 3. 影响面

- **所有跨仓回执**：任意仓的 `handoff install` / 收交接回执任务，其验收判据「`handoff check` exit 0」在**多仓并发落回执**时**恒不可满足**——一条他仓回执即可让所有其他仓 check 变红。
- 今日实例：v2.12.4 桩刷新批次（SWOOP / PROSPERO / IGGLE / TAPPY / YIQIYIHUIHUA，2026-10-14）已触发。
- 无安全/数据风险；纯「门禁可信度」与「协作吞吐」风险——**误红会训练 agent 忽视 check**，恰是 v2.12.3 要杜绝的伪绿之镜像。

---

## 4. 建议修复（按力度递增 · 供维护方择一或组合）

### P0 · 落实契约：cross 模式缺省 `evidence_repo` 一律降级 warn（不回落 cwd）
在 `evidenceProblems` 显式区分模式：
- cross 模式且 `!ev.repo` 且 `hasAny` → **按「目标仓不可达」降级 warn**（`跳过路径/提交核验`），**不** `resolveRepoRoot(undefined)=cwd`；
- **intra-repo 模式保持现状**（cwd=本仓，硬核不变）。
- 同步 `RESPONSE-TEMPLATE.md:32` 措辞（消除「缺省=cwd」与「配置后才硬核」的矛盾）。

### P1 · `handoff receipt` 自动回填 `evidence_repo`（回执自描述）
`receipt` 落盘时以 **cwd 的仓根**自动写 `evidence_repo`（跨仓回执达『自描述』，check 在任意 cwd 都能确定解析根）：
- 对齐 IGGLE / TAPPY 回执现状（已手填绝对路径）；SWOOP 回执即因漏填而炸。
- 与 P0 不冲突：P0 兜「漏填」，P1 治「漏填」本身。

### P2 · 跨仓含 `evidence_commits` 时把 `evidence_repo` 升为**必填**
骨架 + `receipt`/`check` 门禁：跨仓回执声明 commits 却无 repo → 拒收（或至少 warn 点名），把「隐式 cwd」彻底消灭。

---

## 5. 边界 / 不变式（防误伤）

- **不松跨仓内容门禁**：仅治「解析根缺省」；有 `evidence_repo`（key 或路径）时的解析/硬核逻辑不变。
- **仓内不回退**：intra-repo `mode` 下 cwd 仍为解析根，证据硬核**只增不减**。
- **不改状态机 / `--json` v1 schema / drift**；不改回执锚节与「## 转递提示词」硬校验。
- **单一源**：仍以 `RESPONSE-TEMPLATE.md` 为回执唯一规范；本报告不引入第二份模板。

---

## 6. 复现（维护方自测）

```bash
# ① 他仓回执声明提交却不声明 evidence_repo（以 SWOOP-20261014-03 为例）：
grep -n "evidence_commits\|evidence_repo" ~/Documents/lab/handoffs/receipts/SWOOP-20261014-03-feature-resp.md
#   → evidence_commits: aff2ad8   （无 evidence_repo）

# ② 该提交属 swoop 仓，不在 Prospero：
git -C ~/Documents/swoop   cat-file -e aff2ad8 && echo "in swoop"
git -C ~/Documents/Prospero cat-file -e aff2ad8 2>&1 || echo "NOT in Prospero"

# ③ 任意他仓 cwd 跑 check → 回落 cwd 硬判 → exit 1：
cd ~/Documents/Prospero && node ~/Documents/lab/handoffs/handoff.mjs check   # ❌ evidence 提交不存在: aff2ad8（root=…/Prospero）

# ④ 反证：给该回执补 evidence_repo 即消失（勿在真库改，用 /tmp 副本）：
#   evidence_repo: /Users/churze/Documents/swoop   → check 复跑 no problem
```

---

## 附：来源与关联

- 触发交接：`PROSPERO-20261014-03-feature`（v2.12.4 桩刷新；其回执 `receipts/PROSPERO-20261014-03-feature-resp.md`「备注」节留证）。
- 同批受影响：`SWOOP-20261014-03` / `IGGLE-20261014-03` / `TAPPY-20261014-02` / `YIQIYIHUIHUA-20261014-02`。
- 相关代码：`handoff.mjs` `resolveRepoRoot` / `evidenceProblems` / `cmdCheck`(cross)；`RESPONSE-TEMPLATE.md:32`；README v2.12.3「evidence 内容完整性」条。
- 相关机制：v2.12.3 P0-c evidence 门禁（`EVIDENCE_SINCE=2026-10-14`）。
