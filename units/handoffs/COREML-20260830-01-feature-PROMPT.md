# 执行提示词 · COREML-20260830-01-feature（iggle-coreml 侧）

> 本文件是给 **iggle-coreml 维护者 / coreml 侧 agent** 的启动提示词，覆盖：任务范围（步 B/C/D）+ **执行到什么程度需要写回执** + **回执如何写**。
> 用法：把本文件（或 §0–§6 全文）作为启动提示词发给 coreml 侧；也可直接给文件路径让其 Read。
> 配套：交接正文 `handoffs/COREML-20260830-01-feature.md`、待办清单 `COREML-20260830-01-feature-TODO.md`、设计规范 `docs/metric-attribution-model-design.md`、回执规范 `RESPONSE-TEMPLATE.md`。

---

## §0 你是谁 / 你接到的交接

你是 **iggle-coreml 维护者**（iggle 生态的模型能力提供方；`crates/iggle-coreml` 是 iggle workspace 的 member crate，按「逻辑分离」约定由你侧执行，iggle agent 不写它）。

你收到一份来自 iggle 的 **feature 交接**（步 B/C/D 真模型训练）：

- 交接文档：`~/Documents/lab/handoffs/handoffs/COREML-20260830-01-feature.md`（状态已 `forwarded`，等你侧执行）
- 待办清单：`~/Documents/lab/handoffs/COREML-20260830-01-feature-TODO.md`（B/C/D 勾选式）
- 设计规范总源：`docs/metric-attribution-model-design.md`
- 回执规范：`~/Documents/lab/handoffs/RESPONSE-TEMPLATE.md`

---

## §1 先读这四节（边界与前置）

1. **边界定位**：特征化 / 词典 / 规则桩 / 训练管线 / 首个树模型 = **你侧自闭环**。iggle 只写交接文档，不改 `crates/iggle-coreml`。
2. **根因证据**：3057000 脏值事故根因 = 规则桩 `model_metric_extraction.rs` 的 `KEY_LABELS` 硬编码 + 平面启发式（缺「区域/归属」判别维度）→ 模型以结构特征为主力补此维度。
3. **前置已就绪（你不阻塞）**：
   - 步 0 契约冻结（`COREML-20260829-01-feature` 已闭环）
   - 步 A 候选枚举（Swoop commit `6aad880`）已产出 `MetricCandidate`
   - iggle 消费侧 4 个预留函数（`buildCandidateCrossVerdict` / `applyModelConfidenceGate` / `validateSampleTrainingContract` / `metricSamplesToTrainingCandidates`）**刻意 0 引用**，等你真模型产物
4. **隐私硬约束（§6.3）**：本地推理可传完整 candidates；训练上传中心**只传结构特征 + label_category + 对错标签**，不传数值 / 原始 label / DOM / 截图。

---

## §2 任务范围（步 B/C/D 概要）

> 完整勾选项见 `COREML-20260830-01-feature-TODO.md`，此处只给脉络。

- **步 B — 特征化 + 词典 v1 + 规则桩词表数据化**
  - 特征化：从 `MetricCandidate.dom` 派生特征向量（`region` / `relation` / `dom_distance` / `ancestor_depth` / `container_sibling_pairs` / `label_category` / `metric_key_hint` / `value_suffix` / `value_modifier` / `page_zone`）；**不喂原始 label、不依赖平台 class 名**；一等特征 = 平台无关结构信号（`is_repeating_container` + `container_sibling_pairs`），位置特征降级辅助。
  - 中文字典 v1：`dictionary/xiaohongshu.json`（每平台一份，`label → {canonical_key, label_category, metric_key_hint}`）。
  - 规则桩数据化：`model_metric_extraction.rs` 硬编码 `KEY_LABELS` → 每平台 json 数据驱动加载；引擎保持无业务语义。
- **步 C — 训练管线骨架 + 混合种子标注规范**
  - 训练脚本 `import` crate 内同一特征函数（train/serve 特征一致性，消 skew）。
  - LightGBM/XGBoost → CoreML tree ensemble（`model.mlmodelc`）+ ONNX。
  - 混合种子：小种子（人工标注几百条）+ 确定性扩（header text/XHR/导出反向定位正样本；无值区域→负样本）。
- **步 D — 训首个模型（Phase 1 关键路径）**
  - 在步 A 真实 `candidates`（`6aad880`）上训练首个树模型。
  - 导出：`model.mlmodelc` / `model.onnx` → `~/.iggle-coreml/models/swoop/metric_attribution/` + `metadata.json`（version / accuracy / training_samples）。
  - 降级链（§8）：确定性源已覆盖→直接用；未覆盖→真模型→规则桩；置信度 < `MODEL_CONFIDENCE_GATE`(0.6) → 回退「暂无数据」，**绝不硬给值**。
  - 评估基线（§9）必须达标：账号指标 precision/recall ≥ **0.95 / 0.90**（留出平台 × 留出语言）；噪声误收率 ≤ **1%**；跨平台+跨语言泛化无显著掉点。

---

## §3 执行到什么程度需要写回执（最关键）

### ✅ 触发写回执的唯一闭环点

步 B/C/D **全部完成**，且同时满足：

- [ ] 步 B 落地：特征函数 + `dictionary/xiaohongshu.json` + 规则桩 `KEY_LABELS` 数据化
- [ ] 步 C 落地：训练管线跑通 + 混合种子标注规范可操作
- [ ] 步 D 落地：首个树模型已训出并导出（`model.mlmodelc` / `model.onnx` 落到 `~/.iggle-coreml/models/swoop/metric_attribution/`，`metadata.json` 含 version/accuracy/training_samples）
- [ ] **§9 评估基线已测且达标**（precision/recall ≥0.95/0.90、噪声误收率 ≤1%、留出平台×留出语言无显著掉点）
  - ⚠️ 若不达标：**必须在回执里如实写明差距与原因，不得谎称达标**。iggle 侧 `close` 门禁 + 复核会驳回虚报。

### ❌ 以下情况【不】写回执（继续做 / 先拍板）

- 只完成步 B（特征化+词典+规则桩数据化），还没训模型 → **不写**，继续步 C/D；进度在 TODO 勾除即可。
- 卡在 §11 开放问题（离线训练形态 / 飞轮合规 / header 锚点识别 / label_category 派生规则）→ **先在你侧拍板或暂停回报**，不要硬写回执。需要 iggle 决策的，停下来问用户，不要猜。
- 特征 schema 未冻结就训 → **先冻结**（§10 Phase 1 最小契约），再训。
- 任何「已开始 / 进行中」状态 → **不写回执**；中途进度只更新 TODO 或交接文档 body，**不翻回执状态**。

### 🟡 部分交付怎么办

若确实只能先交 B/C、D 暂不做（如训练环境未就绪），**仍可写回执**，状态用 `🟡 部分交付`，回执里明确「已完成 B/C，D 未完成原因 + 下一步 + 预计时间」，并在 TODO 注明。但**更建议一次训出首个模型再闭环**（C 训练管线与 D 训练是连续动作，拆开收益低）。

### 快速判定

> 问自己：**「首个树模型是否已导出到 `~/.iggle-coreml/models/swoop/metric_attribution/` 且 §9 基线已测？」**
> - 是 → 写回执（§4）。
> - 否 → 不写，继续做 / 先拍板。

---

## §4 回执如何写

### 4.1 落点与命名

- 文件：`~/Documents/lab/handoffs/receipts/COREML-20260830-01-feature-resp.md`
- 文件名必须 == `handoff_id` 加 `-resp`：`COREML-20260830-01-feature-resp.md`（Hub `check` 会校验此命名）

### 4.2 frontmatter（首行必须是 `handoff_id`）

```yaml
---
handoff_id: COREML-20260830-01-feature
needs_iggle_change: false
from_repo: iggle-coreml
to_repo: iggle
date: YYYY-MM-DD
---
```

> `needs_iggle_change: false` 是铁律：消费侧接线已就绪，4 个预留函数待步 E 另开交接接线，本交接不要求 iggle 改代码。

### 4.3 正文必含节（适配 feature 交付，非 bug fix）

```markdown
# 回执：指标归属真模型训练 步 B/C/D（iggle-coreml → iggle）

## 关联
- 来源交接文档：~/Documents/lab/handoffs/handoffs/COREML-20260830-01-feature.md
- 日期：YYYY-MM-DD

## 交付状态
- 状态：✅ 已交付（B/C/D 全完成）/ 🟡 部分交付 / 🔁 转为需求
- **是否需 iggle 改动**：否（needs_iggle_change=false；消费接线已就绪，4 个预留函数待步 E 另开交接）

## 实际交付物（feature 重点是「交付物落点」）
- 特征函数：<文件:行号> + 函数名（输入 MetricCandidate.dom → 特征向量）
- 词典：dictionary/xiaohongshu.json 路径 + 结构说明
- 训练管线：<training/ bin 或独立工具入口> + 训练脚本 import 同一特征函数的证据
- 首个树模型：~/.iggle-coreml/models/swoop/metric_attribution/model.mlmodelc + model.onnx + metadata.json（version/accuracy/training_samples）
- 规则桩 KEY_LABELS 数据化改造点：<文件:行号>

## 影响面
- 仅 crates/iggle-coreml；不改 iggle / Swoop / Prospero 源码。
- 模型未接入前 iggle 继续走前 4 层确定性逻辑，无回归。

## 验证
- cargo check -p iggle-coreml 通过。
- §9 评估基线数值：precision / recall / 噪声误收率（留出平台 × 留出语言）。
- train/serve 特征一致性核验（训练脚本 import 同一特征函数，无 skew）。

## 版本 / commit
- coreml crate commit 短哈希（7 位）。

## 给 iggle 的回归指引
- 模型接入后数据流：Swoop 候选 → buildCandidateCrossVerdict 多源比对 → applyModelConfidenceGate(<0.6 回退「暂无数据」) → 确定性优先仲裁。
- 明确：本交接产物是步 E 前置，iggle 当前无需改。
```

### 4.4 写完后的闭环动作（coreml 侧）

1. 把回执文件路径交给用户转递。
2. 运行（Hub 会保留你写的 `from_repo` / `to_repo` / `date`，只补 `handoff_id` + `needs_iggle_change` 并翻状态）：
   ```bash
   node ~/Documents/lab/handoffs/handoff.mjs receipt COREML-20260830-01-feature
   ```
   → 交接状态翻为 `received`，回执已登记。
3. **不要**自己跑 `handoff close` —— 闭环验收（写「验收记录」+ 翻 `closed`）由 **iggle 侧**做。提示用户执行：
   ```bash
   node ~/Documents/lab/handoffs/handoff.mjs close COREML-20260830-01-feature -n "<验收结论：如 B/C/D 已落地、首个树模型导出、§9 基线达标>"
   ```
4. 步 E（iggle 接 4 个预留函数 + Swoop 仲裁层接真模型）**不在本交接范围**，若需推动另开 Swoop / iggle 交接。

---

## §5 禁止项 / 边界（铁律）

- 不得修改 iggle 仓库任何文件（只读定位调用行号）。
- 不得把实现 / 根治责任推给 iggle（除非确属调用方误用，须给精确证据）。
- 隐私 §6.3 硬约束：训练上传只传结构特征 + label_category + 对错标签，不传数值 / 原文 / DOM / 截图。
- 不得谎报 §9 评估基线（不达标就写不达标 + 原因）。

---

## §6 闭环流程图

```
iggle: handoff forward ──► [forwarded] ──► 你（coreml 侧）读 §0–§2
        │                                      │
        │                                      ├─ 执行 步 B → C → D
        │                                      │      │
        │                                      │      └─ §9 基线达标？
        │                                      │          是 ▼
        │                                      │      写回执（§4）→ handoff receipt ──► [received]
        │                                      │                                      │
iggle: handoff close -n ──► [closed] ◄────┘                                      │
（写验收记录，闭环）                                                                      │
                                                                                         │
  注：途中只更新 TODO / 交接 body，不翻回执状态；部分交付用 🟡 状态，不建议中途反复写回执。
```
