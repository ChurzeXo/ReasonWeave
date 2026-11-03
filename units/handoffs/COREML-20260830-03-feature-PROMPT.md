# 执行提示词 · COREML-20260830-03-feature（iggle-coreml 侧）

> 给 **iggle-coreml 维护者 / coreml 侧 agent** 的启动提示词，覆盖：任务范围 + **执行到什么程度需要写回执** + **回执如何写**。
> 用法：把本文件（或 §0–§6 全文）作为启动提示词发给 coreml 侧；也可直接给文件路径让其 Read。
> 配套：交接正文 `~/Documents/lab/handoffs/handoffs/COREML-20260830-03-feature.md`、回执规范 `~/Documents/lab/handoffs/RESPONSE-TEMPLATE.md`。

---

## §0 你是谁 / 你接到的交接

你是 **iggle-coreml 维护者**（iggle 生态的模型能力提供方；`crates/iggle-coreml` 由你侧执行，iggle agent 不写它）。

你收到一份来自 iggle 的 **feature 交接**，任务很小但卡着一条 gate：

- 交接文档：`~/Documents/lab/handoffs/handoffs/COREML-20260830-03-feature.md`（状态已 `forwarded`）
- **一句话任务**：让 `pull_real_samples` 读 iggle 新落盘的 `enumeration-misses.json`，把 `enumeration_recall` 写进 `pull_report.json`。
- **为什么必须做**：`continue_train.py:284` 已经在读这个键，但没人写过它 ⇒ 恒为 `None` ⇒ §9 第 3 项「端到端 recall」永远判「不可测」⇒ 真实流量 gate 永远无法闭环。

**上游已完成（你不必等）**：iggle 侧生产端已落地（`src/types.ts:354` `EnumerationMiss` / `src/api.ts:2038` 全词典扫描做分母 / `src-tauri/src/lib.rs:634` 落盘），门禁双绿。

---

## §1 先读这五处（精确落点，只读核实）

| # | 位置 | 看什么 |
|---|---|---|
| 1 | `crates/iggle-coreml/training/continue_train.py:284-285` | 读取位已预留：`enum_recall = (report or {}).get("enumeration_recall")` → `ev.end_to_end_recall(...)`。**这个文件你不需要改** |
| 2 | `crates/iggle-coreml/src/bin/pull_real_samples.rs:138-161` | `PullReport` 结构体 —— 要在这里加字段 |
| 3 | 同上 `:340` / `:357-358` | 构造 `PullReport` + 写 `pull_report.json` 的落点 |
| 4 | 同上 `:44-45` | `SAMPLES_FILE` 常量 + `iggle_app_config_dir()` —— 新文件与样本库**同目录并列** |
| 5 | 同上 `:167-169` + `:152-159` | `is_fixture_sample` / `fixture_samples` —— **照抄这个范式**处理「漏抓记录的溯源」 |

**边界**：本交接只改 `crates/iggle-coreml`。**不得修改 iggle 的 `src/` / `src-tauri/`**（只读定位行号）。

---

## §2 任务范围（四条，缺一不可）

### 2.1 读新文件

落盘位置：iggle Tauri `app_config_dir()`（macOS = `~/Library/Application Support/com.iggle.app/enumeration-misses.json`），与 `metric-samples.json` 并列。

新增常量与读取（照 `SAMPLES_FILE` 的写法）：

```
const ENUMERATION_MISSES_FILE: &str = "enumeration-misses.json";
```

文件不存在 ⇒ **不是错误**，是「还没跑过采集」，按空集处理（见 2.3）。

### 2.2 契约（每条记录 = 一次采集）

```json
{
  "id": "m9x2k1p-a3f7c2",
  "platform": "xiaohongshu",
  "denominatorKeys": 5,
  "enumeratedHitKeys": 3,
  "missedKeys": ["comments", "shares"],
  "denominatorBasis": "xhr_authoritative",
  "schemaVersion": 1,
  "at": "2026-08-30T18:00:00.000Z"
}
```

| 字段 | 含义 |
|---|---|
| `platform` | 采集平台（**必须分平台统计**，与 `<platform>.jsonl` 同口径） |
| `denominatorKeys` | 分母：本次采集 XHR 通道给出权威值的 metricKey 数 |
| `enumeratedHitKeys` | 分子：权威集 ∩ 候选枚举集 |
| `missedKeys` | 漏抓：权威集 − 枚举集（已排序） |
| `denominatorBasis` | 口径标记，当前唯一取值 `"xhr_authoritative"` |
| `schemaVersion` | 结构版本，当前 `1` |

### 2.3 聚合口径

```
按 platform 分组：
  denominator = Σ denominatorKeys
  numerator   = Σ enumeratedHitKeys
  recall      = numerator / denominator        # denominator > 0 才有定义
  denominator == 0 ⇒ 记 null（不可测），不记 1.0 / 0.0
```

**空集不是满分**：无记录 / 空数组 / 文件不存在 ⇒ `enumeration_recall` 写 **`null`** 并带 `enumeration_recall_reason`。这与你们 `eval_common.py` 里「precision/recall 空集记 None」是同一条纪律。

**口径声明（写进 `pull_report.json`，防误读）**：`denominatorBasis = "xhr_authoritative"` 表示分母 = XHR 给出权威值的 key 集。XHR **不覆盖 header 指标**（设计文档 §6.1 覆盖空洞），所以这是**下界口径**——只回答「XHR 可见的指标里候选枚举抓到了多少」，**不是**「页面全部指标的 recall」。请透传该字段，别让下游把它当全量 recall 引用。

### 2.4 不变式校验（必须有，这是本交接的核心价值）

```
denominatorKeys === enumeratedHitKeys + missedKeys.length
```

不成立 ⇒ **记契约漂移并显式失败**（fatal 或标不可测），**不要**静默取一半字段继续算。
理由：这是分母侧证据唯一的自洽性担保；静默降级会重新长出「假达标」——这正是 `COREML-20260830-02` 整轮在根治的东西。

**`schemaVersion` 处理**：不是 `1` 的记录 = 契约漂移。按你们既有范式（`unknown_relation_is_dropped_as_contract_drift`）**计数并显式暴露**，不要塞进兜底桶静默当 0。

---

## §3 执行到什么程度需要写回执（最关键）

### ✅ 触发写回执的闭环点

代码落地 **且** 夹具链路验证通过：

- [ ] `pull_real_samples` 读 `enumeration-misses.json`（文件缺失不报错，按空集处理）
- [ ] `PullReport` 新增字段并写入 `pull_report.json`（至少 `enumeration_recall` + `denominatorBasis`；建议再给 `enumeration_misses` 原始计数便于交叉校验）
- [ ] **不变式校验已实现**（2.4），失败时显式失败而非静默
- [ ] 空集 ⇒ `null` + reason，已验证
- [ ] `cargo test -p iggle-coreml --no-default-features` 全绿
- [ ] 用 `make_pipeline_fixture.py` 造含 miss 记录的夹具跑通链路，`pull_report.json` 里能看到预期的 recall 数值

### ❌ 不需要等的东西（别把自己卡住）

**不要等真实样本。** 真实样本由 iggle 侧 P0-1（跑真实账号采集）供给，那是**另一条线、另一个 blocker**，不在本交接范围内。

也就是说：本交接**可以、也应该**在「代码落地 + 夹具验证通过」时就闭环。真实流量上的 §9③ 实测值留到 P0-1 之后自然会有。

### ❌ 以下情况【不】写回执

- 只读了文件、还没写 `PullReport` 字段 → 继续做
- 不变式校验没做 → **不能算完成**（这是本交接的核心，不是可选优化）
- 任何「进行中」状态 → 不翻回执状态

### 快速判定

> 问自己：**「`pull_report.json` 里是否已经能出现 `enumeration_recall`，且不变式校验会在数据不自洽时炸掉？」**
> - 是 → 写回执（§4）
> - 否 → 继续做

---

## §4 回执如何写

### 4.1 落点与命名

- 文件：`~/Documents/lab/handoffs/receipts/COREML-20260830-03-feature-resp.md`
- 文件名必须 == `handoff_id` + `-resp`（Hub `check` 会校验）

### 4.2 frontmatter（首行必须是 `handoff_id`）

```yaml
---
handoff_id: COREML-20260830-03-feature
needs_iggle_change: false
from_repo: iggle-coreml
to_repo: iggle
date: YYYY-MM-DD
---
```

> `needs_iggle_change: false` 是铁律：iggle 侧生产端已就绪，本交接不要求它改代码。

### 4.3 正文模板（可直接复制填写）

```markdown
# 回执：消费 enumeration-misses.json 计算候选枚举 recall（iggle-coreml → iggle）

## 关联
- 来源交接文档：~/Documents/lab/handoffs/handoffs/COREML-20260830-03-feature.md
- 日期：YYYY-MM-DD
- 前置：COREML-20260830-02-feature（gate 未闭环，真实样本 0 条）

## 交付状态
- 状态：✅ 已交付 / 🟡 部分交付
- **是否需 iggle 改动**：否

## 实际改动
| 文件 | 改动 |
|---|---|
| src/bin/pull_real_samples.rs:<行号> | 读 enumeration-misses.json（缺文件按空集） |
| src/bin/pull_real_samples.rs:<行号> | PullReport 新增 enumeration_recall / denominatorBasis / enumeration_misses |
| src/bin/pull_real_samples.rs:<行号> | 不变式校验 + schemaVersion 契约漂移计数 |

## 聚合口径
- 是否按 platform 分组：<是/否 + 理由>
- 空集处理：enumeration_recall = null + reason（实测：<验证方式与结果>）
- 不变式校验：denominatorKeys === enumeratedHitKeys + missedKeys.length，失败时 <fatal / 标不可测>
- schemaVersion 非 1 的记录：<计数并暴露为契约漂移 / 其他>

## §9 第 3 项实测值
- **真实流量**：<不可测（真实样本 0 条，等 iggle P0-1）/ 数值>
  ⚠️ 若不可测就如实写不可测，**不得用夹具数字冒充**。
- 夹具链路：<数值，并明确标注这是夹具数据，不构成认证证据>

## 验证
- cargo test -p iggle-coreml --no-default-features：<结果>
- 夹具链路：pull_report.json 实况（贴关键字段）

## 部署提示
- 是否需 iggle 更新钉值 REQUIRED_SWEEP_COMMIT：否
- 是否需重建二进制 / 重装构建物：<是（Rust bin 需重建）/ 否>
```

### 4.4 写完后的闭环动作（coreml 侧）

1. 把回执路径交给用户转递。
2. 运行（Hub 会保留你自写的 `from_repo` / `to_repo` / `date`）：
   ```bash
   node ~/Documents/lab/handoffs/handoff.mjs receipt COREML-20260830-03-feature
   ```
   → 状态翻 `received`。
3. **不要**自己跑 `handoff close` —— 闭环验收由 **iggle 侧**做：
   ```bash
   node ~/Documents/lab/handoffs/handoff.mjs close COREML-20260830-03-feature -n "<验收结论>"
   ```

---

## §5 禁止项 / 边界（铁律）

- 不得修改 iggle 的 `src/` / `src-tauri/`（只读定位）。
- **不得用夹具数字冒充真实 §9 指标** —— 夹具跑通只证明链路通，不证明达标。回执里必须分开写。
- 不得静默降级：不变式不成立 / schemaVersion 不认识，都要显式暴露，不能塞兜底桶。
- 不得把「等真实样本」当成本交接的 blocker —— 那是 P0-1，归 iggle。

## §6 环境提示

- Rust bin 改动需要 `cargo build` 才生效（`certify_real_traffic.sh` 会调 `pull_real_samples`）。
- 若跑 `certify_real_traffic.sh` 验证链路：它默认用 `/tmp/coreml-train-venv/bin/python`，**`/tmp` 会被系统清理**，先确认还在，或用 `COREML_PY=<稳定venv>/bin/python` 覆盖。
- 夹具请照旧带 `_fixture` 标记，别让夹具 miss 记录混进真实认证（与 `fixture_samples` 同源纪律）。

## §7 流程图

```
iggle: handoff forward ──► [forwarded] ──► 你读 §0–§2
        │                                      │
        │                                      ├─ 读数 → PullReport 加字段 → 不变式校验
        │                                      │            │
        │                                      │      夹具链路通过？
        │                                      │        是 ▼
        │                                      │   写回执（§4）→ handoff receipt ──► [received]
        │                                      │   （§9③ 真实值如实写「不可测，等 P0-1」）
iggle: handoff close -n ──► [closed] ◄────┘
```
