# P0-1 真实样本采集操作指引（解阻 gate 的第一步）

> 触发：`COREML-20260830-02-feature` 回执 P0-1（真实样本 0 条，`metric-samples.json` 文件都不存在）
> 前置：**P1-2 代码已补齐并已重新构建**——漏抓是按次计算的差集，先采集后补代码 ⇒ 第一批样本的
> recall 分母永久残缺，只能重采。**定序不能反。**
> 配套：`COREML-20260830-03-feature`（消费端交接，已转递）

## 0. 前置检查（1 分钟）

```bash
# 确认训练 venv 还在（/tmp 会被系统清理，没了就用 COREML_PY 指向稳定 venv）
ls /tmp/coreml-train-venv/bin/python || echo "⚠️ venv 已失效，重建或 export COREML_PY=<稳定venv>/bin/python"

# 确认当前 gate 状态（预期：synthetic_seed 0.1.0 blocked）
/tmp/coreml-train-venv/bin/python -c "
import json;d=json.load(open('/Users/churze/.iggle-coreml/models/swoop/metric_attribution/metadata.json'))
print(d['data_source'], d['version'], d['gate']['status'], d['gate']['run_kind'], d['gate']['input_state'])"
```

预期：`synthetic_seed 0.1.0 blocked non_real_traffic no_report_or_empty`

## 1. 重新构建并启动（关键：必须带 P1-2 改动）

```bash
cd /Users/churze/Documents/iggle
npm run tauri dev          # 或 npm run tauri build 后启动 Release
```

改动清单（已在位）：`src/types.ts`（`EnumerationMiss`）、`src-tauri/src/lib.rs`
（`append_enumeration_misses` / `list_enumeration_misses`）、`src/api.ts`
（`saveEnumerationMiss` + 重做 `wireCandidateAutoVerify`）。
校验：`cargo check -p iggle` ✅ / `npm run build` ✅。

## 2. 跑一次真实账号采集（小红书优先）

- 应用内进入**账号诊断页** → 点「**立即诊断**」。
- 该 CTA 的采集序列 = `profile` → `trend`（与自动诊断循环同一通道）。
  **必须让 trend 那一路成功**：只有 `scope=trend/all` 才带 `site` → daemon 追加
  export lane → 才有 `exported.metricCandidates`（候选枚举）。
  `profile` 快读不带 site，`exported` 为空，产不出候选，**也产不出样本**。
- 账号必须真实登录（登录态失效会在取数时被平台响应判定并中止）。

## 3. 生效条件（三条同时满足才落样本）

| # | 条件 | 代码位置 |
|---|---|---|
| 1 | `collect` 产出非空 `metricCandidates` | `src/api.ts` `wireCandidateAutoVerify` |
| 2 | 候选 label 命中词典（`resolveMetricKeyByLabel` 返回 key） | `src/api.ts` 候选反查处 |
| 3 | 同一 metricKey 在 `xhrIntercepts` 中有权威值 | `extractXhrMetrics` |

## 4. 验收（两个文件都要有）

```bash
D=~/Library/Application\ Support/com.iggle.app

# ① 漏抓记录（P1-2 新产物）
cat "$D/enumeration-misses.json"
#   期望看到 denominatorKeys / enumeratedHitKeys / missedKeys；
#   missedKeys 为空也正常（说明本次枚举全抓到了），但文件必须存在。

# ② 样本库
python3 -c "
import json,collections
d=json.load(open('$D/metric-samples.json'))
print('total', len(d))
print(collections.Counter(x.get('sampleVerdict') for x in d))
"
#   期望：agreed / conflict 条数 > 0
#   ⚠️ single 不作标签，会被 coreml 拉取侧剔除 —— 全是 single 等于没采到。
```

**文件不存在 = 一次都没跑成功**，不是「样本少」。回头看第 2 步的 trend 是否真的成功了。

## 5. 跑认证（干跑 → 全绿才提升）

```bash
cd /Users/churze/Documents/iggle
bash crates/iggle-coreml/training/certify_real_traffic.sh            # 干跑
bash crates/iggle-coreml/training/certify_real_traffic.sh --promote  # 全项达标才提升
```

读结论的正确姿势：

| 报什么 | 含义 | 动作 |
|---|---|---|
| `sample_sufficiency` 不可测（负样本 < 100） | **预期**，不是失败 | 继续攒样本（多跑几次采集） |
| `end_to_end_recall` 不可测 | 消费端还没接（`COREML-20260830-03-feature` 未闭环） | 等 coreml 回执 |
| §9 七项全绿 | 可以 `--promote` | 提升后 `data_source` → `real_traffic`、version → `0.2.0`，**此时才放行步 E** |

⚠️ **夹具数字不得引用为认证证据**。§9 指标只在真实流量上才算数。

## 6. 不需要做的事（回执已明确）

- **不用更新钉值 `REQUIRED_SWEEP_COMMIT`** —— 本轮未改 Swoop、未重建任何二进制。
- **不用重编译 / 重启 daemon** —— 训练产物在 `~/.iggle-coreml/`（仓库外运行时目录）。
- **不用改 `crates/iggle-coreml`** —— 那是 coreml 侧的目录，走交接。
