# COREML 同工作区侧 · 背景说明

> **本文是说明文档，不是契约。** 契约（行为规则、命名、状态机）以 `README.md` §同工作区侧（COREML）为准；
> 与 README 冲突时**以 README 为准**。本文只回答「为什么这么定」并给出实证，供接手的人理解意图。
> 建立：2026-08-31

---

## 为什么需要这一档

```
/Users/churze/Documents/iggle/          ← 一个 Cargo workspace、一个编辑器工作区
├── src/  src-tauri/                          ← iggle 侧
└── crates/iggle-coreml/                     ← coreml 侧（workspace member）
```

Hub 的转递机制是为**真跨仓**设计的：Swoop / Prospero 在别的目录、由别的 agent 处理，用户是唯一通道——这时候转递是必要成本。

`crates/iggle-coreml` 不是这种情况。它在同一个目录树里。套同一套流程，转递就变成纯仪式：我写 PROMPT → 用户复制 → 另一窗口执行 → 用户把回执转回来。几次交接都是这么绕一圈走完的，没有一次真正需要"搬运"。

**副作用比仪式本身更贵**：因为流程暗示"两侧是独立实体"，曾经有个会话把我 15:25 写在同一批文件里的 P1-2 实现判定成"另一窗口已补"，还专门写了一轮核验。同一台机、同一份文件，要靠 `mtime` 猜是谁写的——这是流程设计的错。

## 为什么角色分离仍然保留

治理上刻意保持：iggle agent 不编辑 `crates/iggle-coreml`，反之亦然。
理由不是物理隔离，是**评审边界**——自己写的代码不能自己验收。

所以去掉的是**转递**，不是**边界**。这两件事容易被一起丢掉，丢错方向就会变成自证。

## 实证：为什么「验收方自备夹具」值得较真

`COREML-20260830-03` 验收时没有采信对方给的 `0.8168`，而是自备三组最小 JSON 夹具直接喂 Rust bin：

| 用例 | 实测 | 说明了什么 |
|---|---|---|
| 干净集 Σ13/Σ15 | `0.8666666666666667` | 池化公式吻合 |
| 注入 1 条不变式违反 | 顶层 `null`，而 `per_platform.xiaohongshu` 仍算出 0.8667 | **全局 fail-closed**，不是"剔掉坏的继续算" |
| 文件缺失 | `null` + reason（不是 1.0） | 空集不记满分 |

第二条只有自备夹具才看得到。对方的回执里它只是一句断言"漂移即 fail-closed"；自己跑一遍，才发现未违规平台明明算得出值，顶层照样给 null——这才是真的全局置不可测。而"剔掉坏记录继续算"会让 recall **偏高**，偏的方向正是假达标。

## 自备夹具的低成本做法

不用跑对方的完整链路（会污染 `~/.iggle-coreml/staging/`、还需要 Python venv）。直接喂 CLI：

```bash
cargo run -q -p iggle-coreml --no-default-features --bin pull_real_samples -- \
  --samples /tmp/nonexistent.json \
  --enumeration-misses /tmp/my-own-fixture.json \
  --out-dir /tmp/verify-out
```

快、可复现、不依赖 venv、不碰真实目录。

⚠️ **`--out-dir` 必须指 `/tmp`** —— 默认值是 `~/.iggle-coreml/training-data/real/`，那是真实数据目录，会覆盖。

## 反面清单

- ❌ 为了"走流程"让用户复制粘贴同一台机上的文件。
- ❌ 执行方自己 `close`（等于自己给自己验收）。
- ❌ 拿对方提供的夹具数字当验收结论。
- ❌ 看到 `mtime` 变了就猜"另一窗口改的"——先读文件确认；同一工作区里多会话并存是常态。
- ❌ 把 COREML 交接搬进仓库内 `docs/`——会丢掉 `handoff status` 的统一未了项视图（交接应走仓内子 Hub / lab Hub，而非散落 `docs/`）。
