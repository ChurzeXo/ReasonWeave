# 跨仓「开工先读分层速查」约定（LAYER-ATTRIBUTION-CONVENTION）

> 状态：**draft（待四仓各自 agent + 用户拍板后采纳）**。本文是约定草案，不是已生效门禁。
> 来源：Swoop 侧 agent 在 2026-09-21 的复盘（"读错层"导致执行慢、烧 token），经 iggle 侧 agent 评审，**复核 Swoop 实际文档后修订（2026-09-21 09:18）**。
> 配套记忆：`~/.workbuddy/MEMORY.md`「执行风格偏好（2026-09-21 用户明确）」已收录用户原话："开工先确认改动落在哪一层…再深读"。

---

## 0. 复核后的根因（已修正初版误判）

**初版误判**：我曾断言"Swoop 根目录无任何层/职责文档，故 S2 是结构性缺口"。**这是错的**——早前 Glob 假阴性，未用 `ls` 复核即写"已核实"。实际 Swoop 根目录有 38KB `AGENTS.md`（"架构工作地图"），且：

- §0 一句话定位（line 11）：Swoop = Rust daemon(`:5005`) + Node sidecar(`:5006`)，并明示**"真正的浏览器行为在 Node sidecar"**。
- §1.1 / §1.2：逐文件映射 Rust daemon 与 Node sidecar 职责——`tab-manager.js`/`browser-manager.js` 明确管 tab/窗口生命周期（`closeAfter` 这类语义就在 sidecar）。
- §3：跨层职责边界（Swoop ↔ iggle）。
- line 173：**"先用 CodeGraph 探索代码，不要直接 grep"**（Swoop 自己的代码探索规范）。

**修正后的真正根因（结构性）**：问题**不是文档缺失**，而是 agent 开工凭"语言刻板印象"（"Swoop 是 Rust daemon"）直接读 Rust，**没先读自己仓库已有的架构图**；且它自提的"grep 先定位层"（建议 1）与其 AGENTS.md 的"CodeGraph-first"规则**直接相悖**。即：失败在 **consult-first 纪律**，不在文档覆盖度。加更多文档（建议 2）是补丁式回应——文档已全，再写一份也不会让 agent 去读。

---

## 0.5 业界对标（2026-09-21 联网核实 · 修订 S2 采纳动作）

**核心结论**：concern→layer（语义关切→归属层）作为一个**独立、被工具化、高 star 的工件，业界基本没有专门解**。四个相邻解法各自覆盖一半：

| 解法 | 形态 / 热度 | 解决什么 | 覆盖本约定 |
|---|---|---|---|
| Aider repo map | tree-sitter 符号图 + PageRank + token 预算（~20k+ stars） | 「符号 X 在哪文件 / 谁依赖」 | 纪律 B（codegraph），成熟 |
| C4 模型（Simon Brown） | Context→Container→Component→Code 四层文档 | 「系统怎么分层、关切落哪层」 | 精神近 concern→layer，但给人读、不按 concern 索引 |
| LayerWhere | 架构概念框架（mental model，非工具） | 字面即「capability 该落技术栈哪层」 | = concern→layer 同款心智模型，未工具化 |
| CODEOWNERS | GitHub 工业标准，路径→owner，PR 时机器强制 | 「文件归哪团队」 | 最近的所有权地图，但按路径 keyed、PR 时才触发 |
| AGENTS.md 最佳实践 | Linux Foundation 标准（2025 起，6 万+ 项目 / 40+ 工具） | 顶部放「技术栈/结构/where things live」+ progressive disclosure | 纪律 A 正踩中此主线 |

**关键洞察**：
1. **符号定位很成熟、层归属预筛选是空白**：Aider/Cursor/Claude Code 都是「塞上下文让模型自己 figure out」，无「先判语义归哪层、别读错侧」的强制闸。本仓遇到的「读错层」bug 恰是主流工具**不预防**的失败模式。
2. **concern→layer 不是"造新库"问题，是"文档纪律 + agent 行为约束"问题**——借 AGENTS.md「顶部架构速查 + progressive disclosure」范式落地，比"另起 docs/layers.md"更贴主流、更省。
3. **LayerWhere 给概念名分，AGENTS.md 给落地载体**；2025 论文（arXiv:2602.11988）实证写好 AGENTS.md 显著提升陌生代码库 agent 成功率 → 支撑"强制先读分层"。

**对 S2 的修订**：Swoop「建议 2（加 docs/layers.md）」进一步降权 —— Swoop 已有详尽架构图，且主流做法是"放 AGENTS.md 顶部而非另起文件"。各仓采纳动作统一改为"顶部补 concern→layer 反轴表 + 重申 consult-first"，不新建层文档。

---

## 1. 约定（四仓共用 · 主方案）

不是"每仓新建层文档"（多数仓已有），而是两条纪律：

**(A) Consult-first（先读分层速查再动手）**
每个仓库 `AGENTS.md` 顶部 MUST 有「一句话分层」+ 一张**可秒读的 concern→layer 速查**（语义/关切 → 归属层 → 关键文件 → owner）。agent 开工深读前 **MUST 先读这一段**。
- 参考实现：Swoop §0 一句话 + §1.1/§1.2 逐文件表；iggle「目录 → 身份映射表」。两者信息已足，缺的是"强制先读"与"concern→layer 速查"的显式化，而非覆盖度。

**(B) 用本仓符号索引确认层（repo-aware，不是裸 grep）**
当速查表未覆盖某符号时，用本仓的符号索引定位其层，而非直接 grep：
- Swoop / iggle：优先 `codegraph`（两仓都已 `codegraph init`）——`codegraph query` 确认符号存在、`callers`/`impact` 看归属；**不要直接 grep**（Swoop AGENTS.md line 173 明文）。
- 无 codegraph 的仓：退化为全局 grep 定位符号层。

---

## 2. 对 Swoop 侧四条建议的修订判定

| 建议 | 初版判定 | 修订判定 |
|---|---|---|
| **1 grep 先定位层** | 兜底行为 ✓ | **机制需改**：原则是"先确认层"，但 Swoop 应走 CodeGraph 而非 grep（与其 AGENTS.md 相悖）。该原则已入跨项目记忆（2026-09-21）。 |
| **2 加职责归属速查表** | 唯一结构性 ✓✓ | **对 Swoop 基本冗余**：文档已逐文件映射层。仅余"在顶层加一页 concern→layer 速查"为可选增强；真正缺口是 consult-first，不是文档。 |
| **3 决策文档写更紧** | 纪律强化 ✓ | 不变（已有共识，非设计项）。 |
| **4 收窄 decision-refs scope** | 治理权衡 ⚠ | 不变：宽 scope 故意（宁可多引不错引）；收窄须逐决策论证 + 用户拍板，不列默认动作。 |

---

## 3. 各仓采纳动作（均不跨仓改代码）

| 仓库 | 现状 | 动作 | 归谁 |
|---|---|---|---|
| iggle | 有目录→owner 表 + 一句话分层 | 顶部补"concern→layer 速查"；强调 consult-first | iggle 侧（可改） |
| Swoop | **已有详尽架构图**（AGENTS.md §0/§1.1/§1.2） | 仅在顶部加一页 concern→layer 速查（可选）；重申 consult-first + CodeGraph-first | Swoop 侧 |
| coreml | Rust+Python+Swift 多层（待核实现有文档） | 核实现有文档是否顶层可秒读；补 concern→layer 速查 | coreml 侧 |
| prospero | Rust-only，scan vs routing 两层 | 轻量版顶层速查 | prospero 侧 |

> 采纳动作均在各仓内部文档，须经各自 agent 落地 + 用户拍板；本文件不跨仓改代码。

---

## 4. 不变量（软性，不强加机器门禁）

- **INV-1**：每仓 `AGENTS.md` 顶部 MUST 有一句话分层 + 可秒读 concern→layer 速查。
- **INV-2**：跨层语义改动开工前，agent 先读该速查（或经本仓符号索引确认层），不应出现"凭语言刻板印象读错侧"的绕路。
- **INV-3（repo-aware）**：有 codegraph 的仓禁止"直接 grep 定位"作为首选（Swoop 明文），优先符号索引。
- 校验靠人工 review + 新 agent 实操反馈，避免过度 ceremony。
