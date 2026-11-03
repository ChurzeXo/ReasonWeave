# 交接枢纽契约 v2.0 → v2.1 同步（iggle 侧请跟着做）

Swoop 侧已把公共交接枢纽（Handoff Hub）的契约从 v2.0 升到 v2.1，核心改动是**命名前缀 = 接收方 = 回执撰写方**，用来区分「iggle→依赖方」与「Swoop→iggle 反向发现」两类交接，避免两边交接/回执搞混。脚本 `handoff.mjs` 与 `handoff-status.mjs` 已改完且 `check` 通过，你侧**无需改任何脚本**。

## 新规则（一句话）
- `SWOOP-*` / `PROSPERO-*` 交接：iggle 发出、依赖方（Swoop/Prospero）接收并写回执 `SWOOP-*-resp.md` / `PROSPERO-*-resp.md`。——和你一直做的完全一致。
- `IGGLE-*` 交接：Swoop → iggle **反向发现**（Swoop 落地了新能力/契约，需要你适配）。**你是接收方，你来写回执** `IGGLE-*-resp.md`，随后 `handoff close <ID> -n "<验收结论>"` 闭环。

## 你需要做的（iggle 侧）
1. 读 `~/Documents/lab/handoffs/README.md`（已是 v2.1），重点看「接收方即前缀（路由规则 · v2.1 新增）」与「迁移（仅前向生效）」两节。
2. 收到 Swoop 发来的 `IGGLE-*` 交接时，按既有流程处理：读交接 → 本仓适配（如升 `REQUIRED_SWEEP_COMMIT` 钉值、加 UI 入口、移除影子表等）→ 写 `receipts/<ID>-resp.md` → `handoff close <ID> -n "<结论>"`。
3. 你主动要 Swoop/Prospero 改动时，仍用 `handoff new swoop <type> ...` / `handoff new prospero <type> ...`，不变。
4. （可选但推荐）在本仓跑一次 `node ~/Documents/lab/handoffs/handoff.mjs install`，把接入桩里的「契约 v2.0」指针刷新成 v2.1（幂等）。
5. 不要手动把任何 `IGGLE-*` 文件改成 `SWOOP-*` 或反之——前缀就是方向，拧着改会破坏路由。

## 边界（不变）
- 你仍是验收责任方（消费回执的一方）；依赖 agent 仍不碰 iggle 仓库任何文件。
- 存量 `SWOOP-*`/`PROSPERO-*` 交接不动（前向生效）。

## 一个具体例子（反向发现）
假设 Swoop 落地某「自定义指标教学 API」后，会建 `IGGLE-20260825-XX-feature.md`（你为接收方）。你据此：升钉值 `a72e233`、在采集返回区加「指标录入」入口、移除 `FIELD_LABELS` 维护 → 写 `receipts/IGGLE-20260825-XX-feature-resp.md` → `handoff close IGGLE-20260825-XX-feature -n "已升钉值+接入指标录入UI"`。

任何歧义以 `~/Documents/lab/handoffs/README.md`（v2.1）为准。
