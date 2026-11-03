# 12 — 硬门禁清单

门禁是这套方法论里**唯一不可协商**的部分。前面所有章节写的是"怎么做"，本章写"不满足就不许过"。

分两组：**项目启动门禁**（一次性）和**收尾门禁**（每个 feature / 每次任务收尾都要跑）。

---

## A. 项目启动门禁

在第一个 `/speckit.specify` 之前，以下全部 ✅：

```
□ git init 完成，`.gitignore` 就位
□ 目录骨架齐全（group/ units/ docs/ adr/ evidence/ specs/）
□ constitution.md 人 review 通过，并同步到 .specify/memory/
□ ADR-001 起步决策已 Accepted，adr/INDEX.md 建立
□ 依赖协调图存在（哪怕只有 2 个 Unit）
□ 每个 Unit 的 AGENTS.md 存在，且 Verification 段有具体命令
□ 根 AGENTS.md 含：隔离规则 / 跨 Unit 只读 contracts / 门禁指针 / 上下文预算
□ Spec Kit 已 init，.specify/ 已提交
□ 每个 Unit 的 CodeGraph 索引已 init 并提交
□ 项目级 Skill 已建，优先级规则已写进 AGENTS.md
□ 跨仓场景已接 handoff（10 章）
```

## B. 每次任务收尾门禁

**逐条自查，任何一条 ❌ 就不算完成。** 建议直接贴进根 AGENTS.md 和收尾报告模板。

### 1. Intent 回归
```
□ 本次改动服务于哪个 spec / 需求？能指到文件路径
□ 没有夹带 spec 之外的"顺手优化"
   （越界发现 → docs/backlogs/，见 07 章）
□ 中途变更走了 CR 流程：spec 变更记录里有登记 + 影响面评估 + 人批准（16 章）
□ spec 修订与对应代码在同一 commit，tasks.md 已回写，无遗留旧条目（16 章 §4）
```

### 2. Architecture
```
□ 未违反任何 Accepted ADR
□ 架构级改动有对应 ADR（编号在报告里）
□ 宪法 Constitution Check 无 CRITICAL
```

### 3. Isolation
```
□ 改动只落在本 Unit（或已声明的跨 Unit 范围）
□ 在独立分支/worktree 上工作，未污染他人（13 章）
□ 未直接读改其他 Unit 的实现代码，契约变更有 ADR（14 章）
```

### 4. Evidence（不可协商）
```
□ 达到本改动要求的 E 级别（11 章 §2）
□ 每条"已完成"都挂了证据路径，且时间戳晚于最后一次改动
□ 失败/跳过的验证项已如实列出
□ E0（只有口头声称）零出现
□ 改动前的影响面清单在报告里，清单内的回归测试已跑（11 章 §6.1）
□ golden / snapshot 基线有变更的，diff 已人审，非无脑更新（11 章 §6.3）
□ 无测试的既有行为改动，已先补特征化测试（11 章 §6.2）
```

### 5. Convergence
```
□ /speckit.converge 报告 Converged
□ Convergence Checklist（11 章 §5）全绿
□ tasks.md 与实际改动一致
```

### 6. 交接与记忆
```
□ 越界/待拍板项已入 docs/backlogs/
□ 跨仓改动 handoff check exit 0（10 章，如适用）
□ docs/PROGRESS.md 已更新（本次做了什么、下一步是什么）（15 章）
□ codegraph sync 已跑（08 章）
```

---

### 7. 回报形状（可机检，18 章 D6）
```
□ 回报含「## 变动分类」节：每条非请求发现三选一（我引入→已修 / 既有→backlog id / 已豁免→出处）
□ 回报含「## 不变量触点」节：逐共享面，面名 + 是/否 + 理由
□ 回报含「## 遗留与路由」节：每项一个主（backlog id / handoff id / 待人类拍板行），或「无」
```
三节的**存在性可机检**（类比 handoff check 硬校验锚节）；模板见 `~/Documents/lab/preflight/templates/wrap-up.md`，方法见 [18 章](18-shift-left.md)。

---

## 门禁的执行方式

按自动化程度选一档（AEF §27 自动化等级）：

| 等级 | 怎么跑 | 适用 |
|---|---|---|
| L1（推荐起步） | Agent 自查 + **输出门禁表**，人看表决定 | 人能逐条复核的项目 |
| L2 | 自动化项（build/test/lint/handoff check）CI 强制，人工项 Agent 自查 | 中型项目 |
| L3 | 全自动，未过不许合并 | 成熟稳定项目 |

**关键纪律**：即便在 L1，**Agent 也必须把门禁表逐条写出来**，不许写"已通过所有检查"。写不出表格 = 没查。

**门禁要挂到模型动不了的地方（18 章 §8）**：prompt 里写"记得验证"是**请求**，hook / CI 里的 exit code 才是**法律**。自动化项优先落成 `~/Documents/lab/preflight/templates/pre-commit`（提交前跑 `preflight.sh`，未过即阻断）或宿主 Stop hook；详见 18 章。

## 反模式：门禁疲劳

如果每次收尾门禁都有 5 条以上形式主义的 ✅，说明：

- 有检查项该自动化（→ 升到 L2，CI 跑）
- 有检查项该删（对防止真实事故没有贡献）
- 有检查项写得太模糊（"代码质量良好"→ 无法判定，删）

门禁的价值在于**每一条都对应一次曾经发生的真实事故**。没有事故支撑的检查项，第一次 review 就该删掉。

---

## 落地动作

1. 把 §B 的六组表复制进根 AGENTS.md，标注"收尾必填"。
2. 收尾报告模板里用同一份表（Agent 填 ✅ + 证据路径）。
3. 每个 feature 收尾后人抽查一次：挑一条 ✅ 要证据，给不出就整表作废。

> AEF 原文对应章节：§15 Definition of Done、§16 Convergence、§28 Stop Conditions、§30 Quality Gates、§31 Risk-Based Workflow、附录 B。
