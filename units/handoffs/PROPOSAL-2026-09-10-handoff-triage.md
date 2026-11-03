# 提案：Handoff Hub 改为「散文触发 + Path 定向 + 单一模版源」

> 状态：**方案文档**，尚未落地。
> 范围：仅改 `~/Documents/lab/handoffs/` 下的 CLI、skills、README；不碰交接/回执正文，不动协作边界、状态机、drift 机制、不动 `~/Documents/iggle` 仓库。
> 本文为 2026-09-10 早间 `handoff-triage` 提案的**合成替代版**（原 triage 只解决"被迫读全部"，本版吸收其 F1 并纳入"去 / 命令"）。
> 背景：用户原话「handoff 太乱了，每次收交接/写回执/收回执都要读所有内容」+「移除所有 / 命令，改为按模版写提示词，提示词带文档 Path，文档内含回执模版」。经讨论收敛为：**砍 / 别名、留引擎、Path 定向、模版单一来源**。

## 1. 问题证据（实测，非推测）

| 观测项 | 数据 | 来源 |
|---|---|---|
| 交接文件数 | 41 份 | `ls handoffs/` |
| 回执文件数 | 42 份 | `ls receipts/` |
| 交接正文行数 | 平均 100+，最大 **178** 行（预算 ≤60） | `wc -l handoffs/*.md` |
| 回执正文行数 | 最大 174 行（预算 ≤50） | `wc -l receipts/*.md` |
| `status`(central) 行为 | 遍历**全部**非闭环项平铺 dump | `handoff-status.mjs:231-254` |
| `brief` 行为 | 只列 `status==='draft'` 项，漏 forwarded/received | `handoff.mjs:546` |
| inbox 快照定位 | README 判为「非权威、可能过期」 | `README.md:158` |
| 通读意图 | 「交接与回执是要被执行方和验收方通读的文档」 | `README.md:191` |

**根因（一句话）**：Hub 没有「单条 triage / Path 定向」视图，且 slash 命令 + skill 层强制全量 dump，于是每次收/写/收回执都被迫读全部；同时 slash 触发面过宽（4 命令 + 15 子命令 + 3 skills + 5 shim）徒增维护面。

## 2. 设计原则（不可妥协）

- **P1 留引擎**：`node handoff.mjs <op> <Path>` 是**强制层**（frontmatter 真相源、状态转换合法性、`check` 门禁、回执四要素自动落写、`--json` v1）。**移除 / 别名 ≠ 移除脚本。**
- **P2 Path 定向**：所有交互都带单份文档 Path，LLM 只读那一份，绝不扫描 `handoffs/`。直接解决「读所有内容」。
- **P3 模版单一来源**：回执/转递模版只在 `RESPONSE-TEMPLATE.md`，文档用**指针**引用，**不每文档内嵌**（避免 v2.8 刚修好的"双份维护→41 倍漂移"复发；且回执写法归接收方，塞进发送方文档是倒置所有权）。
- **P4 不破边界**：不动 `status` 机、不动协作边界、不动 drift、不碰 `~/Documents/iggle` 仓库、`--json` v1 字段零变化。

## 3. 改动清单

### A. 新增 `handoff show <ID>`（triage 视图，纯加法 · 最大单一杠杆）

给单条交接/回执一个摘要视图：frontmatter + 各 `## 节` 标题 + 每节首行，**不 dump 全文**。支持 `handoffs/<ID>.md` 与 `receipts/<ID>-resp.md`（按 `<ID>-resp` 判定）。

落点：`handoff.mjs` 新增 `cmdShow(args)`，在入口 `switch` 加 `'show': cmdShow(rest)`。

```js
function cmdShow(args) {
  const [id] = args.filter(a => !a.startsWith('-'));
  if (!id) { console.error('用法: handoff show <id>'); process.exit(2); }
  const hFile = path.join(H_DIR, `${id}.md`);
  if (!fs.existsSync(hFile)) { console.error('找不到: ' + hFile); process.exit(1); }
  const raw = fs.readFileSync(hFile, 'utf8');
  const fm = readFM(raw);
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
  console.log(`# ${id}`);
  for (const k of ['target','type','status','needs_iggle_change','created','closed']) {
    if (fm && fm[k] !== undefined && fm[k] !== '') console.log(`- ${k}: ${fm[k]}`);
  }
  console.log('\n## 节结构（标题 + 首行）');
  const secs = body.split(/^## /m).slice(1);
  for (const s of secs) {
    const lines = s.split('\n');
    const title = lines[0].trim();
    const first = lines.find((l, i) => i > 0 && l.trim()) || '';
    console.log(`- ${title}${first ? '：' + first.trim().slice(0, 80) : ''}`);
  }
  console.log(`\n（全文: ${hFile}）`);
}
```

### B. 移除 / 命令别名，改散文触发

- `handoff.mjs`：删除 `*_SHIM_BODY` 中的 `/handoff` `/sync` `/inbox` `/receipt` **slash 触发注册**；脚本全部 op 能力保留，仍经 `node handoff.mjs <op> <Path>` 调用。
- skills：删除独立的 `/sync` `/inbox` `/receipt` 命令式技能触发器；**收敛为单一 `handoff` 技能**（prose 触发，接收 Path 参数，内部按 Path + 对话意图路由到对应 op）。`swoop-handoff-compliance` 降级为内部参考，不再注册为命令。

### C. README 重写交互段

- 「命令」表 → 「操作（散文触发）」：写明「在对话里说『处理交接 `<Path>`』『登记回执 `<Path>`』等自然语言，LLM 加载 `handoff` 技能并跑 `node handoff.mjs <op> <Path>`」。
- 删除「斜杠命令」表，标注 / 命令已废弃（保留期可注"兼容别名，不建议新用"）。
- 「人类用法」「Agent 接入桩」改为 **Path 定向 + 单一模版源**口径；`handoff install` 改为只装 prose 接入桩（不再写 / 别名）。
- 保留 `status`/`show`/`check`/`close`/`receipt`/`forward`/`new`/`prompt`/`drift` 等 op 文档（仍是脚本子命令，只是不靠 / 触发）。
- `prompt <ID>` 仍生成 3 行转递词（路径 + `RESPONSE-TEMPLATE.md` 指针 + 回执落点），但其"命令开头"从 `/inbox` `/sync` 改为「把路径交给接收方，让其用自然语言处理」。

### D. 文档「给执行方」节 = 唯一内嵌内容

- 交接文档正文保留「给执行方」节（≤8 行：下一步动作 + 回执落点**指针**），**不内嵌回执模版全文**；回执模版指针指向 `RESPONSE-TEMPLATE.md`。
- 体积预算维持（交接≤60 / 回执≤50）；超限外链纪律不变。

## 4. 验收判据

- [ ] `handoff show <ID>` 对任意 handoff/receipt 输出 frontmatter + 节标题 + 首行，且**不输出全文 body**；支持 `handoffs/` 与 `receipts/` 两类。
- [ ] 任意自然语言「处理交接 `<Path>`」「登记回执 `<Path>`」「收回执 `<Path>`」能驱动引擎完成对应 op（新窗口实测：建/收/回执/收回执各一例，确认不扫描全库）。
- [ ] `node handoff.mjs check` 仍 **exit 0**；`--json` v1 字段零变化；`--json=v2` 不动。
- [ ] README 无 / 命令表；交互段为散文触发 + Path 定向 + 单一模版源；`install` 不再写 / 别名。
- [ ] 41 份存量交接未内嵌回执模版（仅指针）；其正文未被改动。
- [ ] 未碰 `~/Documents/iggle`、`status` 机、drift 机制、协作边界。

## 5. 明确不改动（守边界）

- 不修改任何交接/回执**正文**内容；超 60/50 行的体量属历史证据，不回改。
- 不动状态机（`draft→forwarded→received→closed`）与生命周期语义。
- 不动协作边界（依赖 agent 不改 iggle 文件）、不动 `RESPONSE-TEMPLATE.md` 的回执字段要求。
- 不动 `common_version` / `platform_versions` 的 drift 机制。
- 不内嵌"每文档回执模版"（P3）。

## 6. 审核约定（本次执行分工）

- **落地**由新窗口执行；**本会话（审核方）只审不写**。
- 落地完成后，新窗口输出「交付摘要 + `check` 输出 + 改动文件清单（含行数）」，用户带回本会话，由审核方对照 §4 判据逐项核验，全部通过才算闭环。
- 任何超出 A–D 的改动，落地方须先停下说明，不得擅自动作。
