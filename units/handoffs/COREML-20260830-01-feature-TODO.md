# COREML-20260830-01-feature · coreml 侧执行待办清单

> 配套交接：`handoffs/COREML-20260830-01-feature.md`（已标记「已转递」）
> 目标仓库：`crates/iggle-coreml/`（iggle workspace member，逻辑分离，由 coreml 维护者执行）
> 设计规范总源：`docs/metric-attribution-model-design.md`
> 前置（已闭环）：`COREML-20260829-01-feature`（步 0 冻结最小契约）；步 A 候选枚举 commit `6aad880`；iggle 消费接线就绪
> 本清单只列「coreml 侧要落的事」，不要求 iggle 改动（`needs_iggle_change=false`）

---

## 步 B — 特征化 + 词典 v1 + 规则桩词表数据化

### B1. 特征化（Rust crate 单点自闭环，§3）
- [x] 新建/落地特征派生函数：输入 `MetricCandidate.dom`，输出完整特征向量：
  `region` / `relation` / `dom_distance` / `ancestor_depth` / `container_sibling_pairs` /
  `label_category` / `metric_key_hint` / `value_suffix` / `value_modifier` / `page_zone`
- [x] **不喂原始 label 文本、不依赖平台 class 名**（§2.1 平台/语言无关）
- [x] **一等特征 = 平台无关结构信号**：
  - `is_repeating_container`（容器重复次数）
  - `container_sibling_pairs`（聚簇度）
- [x] **位置类特征降级为辅助**（§3）：`region` / `page_zone` / `near_header_anchor` 不硬编码强依赖，交给树模型自学习权重
- [x] 特征函数放 crate 内**单点**，训练脚本与 serve 共用（§6.4 消 train/serve skew 的根因手段）

### B2. 中文字典 v1（确定性层，§4）
- [x] 建 `dictionary/xiaohongshu.json`（每平台一份，与模型解耦、可独立热更新）
- [x] 结构：`label → { canonical_key, label_category, metric_key_hint }`
- [x] `label_category` 派生规则：`metric` / `participation` / `button` / `topic` / `other`（§4 细化，可落初版）
- [x] 词典产出 `label_category` + `metric_key_hint` 供模型消费

### B3. 规则桩词表数据化（§8）
- [x] 改 `src/model_metric_extraction.rs`：把硬编码 `KEY_LABELS` 改为**每平台一份 json 词典数据驱动加载**
- [x] 引擎保持「无业务语义」（词表外置，不迁回 Swoop）
- [x] 保留规则桩作为降级链 fallback（见 D3）

---

## 步 C — 训练管线骨架 + 混合种子标注规范

### C1. 训练管线骨架（§6.4）
- [x] 训练脚本 `import` crate 内同一特征函数（train/serve 特征一致性，从根源消除 skew）
- [x] LightGBM/XGBoost 训练 → 导出 CoreML tree ensemble（`model.mlmodelc`）+ ONNX
- [x] 离线训练形态拍板（§11 开放问题 1）：训练脚本放 `crates/iggle-coreml` 加 `training/` bin，还是独立工具？

### C2. 混合种子标注规范（§6.2）
- [x] **小种子**：人工标注几百条候选（各平台 header 指标 vs 噪声），标注规则 = 对候选打「是账号指标（+key）/ 是噪声」
- [x] **确定性扩**：确定性源（header text / XHR / 导出）反向定位到候选 → 正样本；明确无值区域 → 负样本
- [x] **header 指标正样本**靠「小种子 + header text 反向定位」（XHR 只覆盖看板指标，是污染重灾区，§6.1 覆盖空洞）
- [x] header 锚点识别（region 判定前置启发式）跨平台稳定性方案（§11 开放问题 3）

---

## 步 D — 训首个模型（Phase 1 关键路径，§10）

### D1. 训练
- [x] 在步 A 真实 `candidates`（`6aad880` 已产出）上训练首个树模型（LightGBM/XGBoost → CoreML/ONNX）
- [x] **冻结特征 schema**（训前先定，扩平台不从头训，§10 Phase 2 在其上继续训练 + 加词典条目）

### D2. 导出与落盘
- [x] 推送 `model.mlmodelc` / `model.onnx` → `~/.iggle-coreml/models/swoop/metric_attribution/`
- [x] 写 `metadata.json`：`version` / `accuracy` / `training_samples`

### D3. 降级链（§8，必实现）
确定性源（header text / XHR / 导出）已覆盖 → 直接用，模型不覆盖
→ 确定性未覆盖 → 真模型（加载成功）→ 规则桩 fallback
→ 置信度 < `MODEL_CONFIDENCE_GATE`(0.6) → 回退「暂无数据」，**绝不硬给值**（参考 3057000 脏值事故）

### D4. 评估基线（§9，必须达标）
- [x] 账号指标 precision / recall ≥ **0.95 / 0.90**（留出平台 × 留出语言）
- [x] 噪声误收率（把话题数字当指标）≤ **1%**
- [x] 端到端 recall 含候选枚举 recall
- [x] 跨平台 + 跨语言泛化无显著掉点

---

## 飞轮与隐私（§6.3 硬约束，落地即遵守）

- [x] 本地推理（Swoop→iggle-coreml，进程内）可传完整 candidates（含 value/label 原文/DOM），不出机器
- [x] 训练数据上传中心：仅传**结构特征 + `label_category` + 对错标签**，不传数值 / 原始 label 文本 / DOM / 截图 / 任何可反推身份的信息
- [ ] iggle 侧 `metricSamplesToTrainingCandidates({stripPrivate:true})` 生成上传形态，coreml 训练上传通道须走此形态（数据飞轮上传通道待建，Phase 1 训练全本地、未触达）
- [ ] 数据飞轮合规（§11 开放问题 2）：opt-in 上传的用户协议/隐私政策责任方 + 上传通道（自有服务/第三方）（待步 E 前拍板）

---

## 待拍板 / 细化（§11 开放问题，执行中解决）

- [x] 离线训练形态：crate 内 `training/` bin vs 独立工具 —— **已拍板：crate 内 `training/` + bin 形态**（见 `train_metric_attribution.py` / `src/bin/featurize.rs`）
- [ ] 数据飞轮合规：用户协议/隐私政策责任方 + 上传通道（待步 E 前拍板）
- [ ] header 锚点识别跨平台稳定性实现与验证（位置特征 §3 后置，跨平台扩展时验证）
- [ ] `label_category` 派生规则（participation/button/topic）评审细化（初版已落 dictionary.rs `classify_label`，待真人评审）

---

## 闭环动作（coreml 侧完成后）

1. 写回执 `receipts/COREML-20260830-01-feature-resp.md`（frontmatter 首行 `handoff_id: COREML-20260830-01-feature`，`from_repo: iggle-coreml`）
2. 回执填「验收记录」：交付物落点（特征函数 / `dictionary/xiaohongshu.json` / 训练管线 / 首个树模型路径 + `metadata.json` 指标）、§9 基线是否达标
3. 通知 iggle 侧 `handoff receipt COREML-20260830-01-feature` 登记回执 → `handoff close` 闭环
4. 步 E（iggle 接 4 个预留函数 + Swoop 仲裁层接真模型）不在本交接范围，需另开 Swoop/iggle 交接
