<!-- adr-template v1.0 · tier: proposed · source: ~/Documents/lab/adr/ -->

# ADR-0016: 跨客户端交接角色锚定、CLI 执行态分流与状态机归属确定性架构决策 (Cross-Client Role Pinning, CLI Context Routing & Deterministic State Machine Attribution)

- **状态（Status）**：Accepted (🔒Frozen)
- **生效日期**：2026-11-24
- **决策人**：churze + Agent (AEF 架构委员会 · core/handoffs)
- **关联证据**：
  - 多 AI 客户端（Antigravity, WorkBuddy, Cursor, Claude Code）跨窗口协同实战角色漂移案例
  - 缺陷 1：仓内建单 `from_lane: ''` 导致看板待办丢失、`lane=` 空白与无法 `accept` 闭环
  - 缺陷 2：状态机保底逻辑将 `rejected_by` 错判为 `from_lane`、`cmdReject` 写死 `to_lane: audit` 导致角色倒错
- **引擎版本**：`units/handoffs` v2.41.0
- **关联契约**：[`units/handoffs/README.md`](file:///Users/churze/Documents/lab/units/handoffs/README.md) v2.41.0

---

## 1. Context（背景与事故复盘）

在异构多 AI 客户端（如发起方在 Antigravity 担任实现方，接收方在 WorkBuddy / Cursor / 独立终端担任审计方）通过本地文件总线进行交接协同实战时，暴露出三大系统性缺陷与顽固角色漂移现象：

### 1.1 跨客户端交接严重角色漂移（Cross-Client Role Drift）
1. **提示词上下文单向失焦**：出站提示词卡片仅声明 `请 [审计方] 接单`，未声明发起方是谁（`from_lane` 缺失），亦未在卡片内提供明确的接收方身份锁定指令。接收端 LLM 读取后，心智模型无法自动锚定为“入站审计者”。
2. **CLI 工具输出无差别诱导闭环（核心爆点）**：接收方在终端执行 `baton deliver --as audit` 时，CLI 调用的 `printReceiptDeliveryLine` 竟然打印出本应面向发起方的指引——“👉 下一步（发起方/审计方核心职责）：4. 验收通过后闭环：baton close ...”。LLM Agent 天生顺从工具输出的 Next Steps，读取后立刻漂移为发起方试图闭环。
3. **入站接收方反向生成提示词卡片**：接收方在交付后模仿全局模板反向输出出站交接卡片（`请 [实现方] 接单`），人类操作员复制回发起方后，发起方误以为接到新任务被夺舍，形成主客颠倒回路。

### 1.2 缺陷 1：发起方建单 `from_lane: ''` 导致看板瘫痪与闭环受阻
- 在仓内建单函数 `cmdNewIntra` 中，`fromLane` 仅读取环境变量 `HANDOFF_LANE` 与参数 `--from`；常规命令行建单既未读取已绑定的会话身份锁 `getSessionLane()`，亦未解析 `--as <lane>`。
- 这导致工单元数据恒为 `from_lane: ''`。被审计方驳回退回时，发起方看板因为 `r.from_lane === FOR` 计算为 `false` 而**完全丢失整改待办**；审计方看板亦直接回显 `lane=`（名称空白）；发起方修复后执行 `baton accept` 触发越界自审拦截。

### 1.3 缺陷 2：上游角色倒错与双盲审计话术错配
- **保底逻辑倒错**：在 `handoff-status.mjs` 中，当状态流水缺失时，保底代码竟然写死 `rejected_by = r.from_lane`。在双盲审计流中，明明是下游审计方驳回了上游发起方，系统却将上游发起方记录为驳回者，主客彻底颠倒。
- **回执元数据方向倒置**：在 `cmdReject` 生成回执时，硬编码写死 `from_lane: to_lane`、`to_lane: from_lane` 且说明写死“工单被审计方直接驳回退回整改”。当上游架构方验收驳回下游实现方时，系统却宣称是“审计方驳回实现方”。
- **唤醒语义倒错**：唤醒话术将发起方与审计方职责混为一谈，要求被审的实现方在唤醒后“独立实测核验审计方”。

---

## 2. Decision（核心架构重构决策）

为从根本上杜绝跨客户端角色漂移并彻底修复上述缺陷，本 ADR 确立五大核心工程机制：

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AEF ADR-0016 Architecture Blueprint                  │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. 发起方身份权威自推导与防空   │ getSessionLane() / --as 级联自愈      │
│    (SSOT Initiator Auto-Bind)  │ 强制非空断言：from_lane !== ''        │
├────────────────────────────────┼───────────────────────────────────────┤
│ 2. 出站提示词显式双向角色锚定 │ 卡片显式声明 [发起方] 与 [接收方]     │
│    (Bidirectional Role Pinning)│ 强注入接收方指令：baton lane <lane>   │
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. CLI 执行态上下文分流隔离    │ deliver / receipt 彻底剥离 close 诱导 │
│    (Next-Step Context Routing) │ 接收方交付后严格打印单行收尾指引      │
├────────────────────────────────┼───────────────────────────────────────┤
│ 4. 驳回与状态机回溯去倒错      │ 动态计算真实驳回方与被驳回方          │
│    (Deterministic State & SSOT)│ 消除保底逻辑盲信 from_lane 为 rejector│
├────────────────────────────────┼───────────────────────────────────────┤
│ 5. 入站单行纯化与防反向派单    │ 接入桩物理封杀接收方输出交接卡片      │
│    (Inbound Pure Verdict SSOT) │ 明确出站 Round 统筹权专属发起方       │
└────────────────────────────────┴───────────────────────────────────────┘
```

### 2.1 D1: 发起方身份权威自推导与建单防空闭环（SSOT Initiator Auto-Bind）
1. **级联解析链**：
   在 `cmdNewIntra` / `cmdNew` 中建立权威推导链：
   $$\text{参数 } \text{--from} \ / \ \text{--as} > \text{环境变量 } \text{HANDOFF\_LANE} > \text{本地会话锁 } \text{getSessionLane()} > \text{默认兜底 (impl)}$$
2. **建单原子赋锁**：
   若当前会话未绑定身份锁，建单时自动将推导出的 `fromLane` 原子固化至当前会话（`setSessionLane(fromLane)`），确保冷启动发起方会话天然具备身份锚定。
3. **强制非空不变式（Non-Empty Invariant）**：
   工单 frontmatter 写入前，强制断言 `from_lane` 不得为空字符串。彻底消除 `from_lane: ''`。

### 2.2 D2: 出站提示词显式双向角色锚定（Bidirectional Role Pinning）
1. **重构出站卡片语义结构**：
   出站卡片首行明确声明对端与本端双向身份，并在卡片末尾显式告知接收方接单锁定命令：
   ```text
   请 [目标角色] 接单（来自发起方: [发起角色]）：
   [任务主题] <主题>
   [任务轮次] Round <round>（第 <round> 轮复审）
   [工单编号] [<conversation_id>]
   [工单路径] <交接路径>
   [接单指令] baton lane <to_lane>（或执行命令时附带 --as <to_lane>）
   ```
2. **心智模型物理锚定**：
   接收端 LLM 读取卡片瞬间即可确立本方角色（`to_lane`）与对端角色（`from_lane`），彻底根绝主客颠倒。

### 2.3 D3: CLI 执行态上下文分流与交付零误导（Next-Step Context Routing）
1. **彻底拆分 `cmdDeliver` / `cmdReceipt` 与 `cmdWait` 的输出指引**：
   - 当接收方执行 `baton deliver` 时，**严禁输出任何“👉 下一步（发起方核心职责）：4. 验收通过后闭环：baton close”**！
   - 改为输出清晰的“接收方交付完成回执”，并明确告诫接收方：“本端职责已完成，发起方已自动唤醒独立验收；严禁接收方越权 close；最终回复人类仅单行纯文本”。
2. **从工具源头上切断 LLM 盲从“下一步”闭环的诱因**。

### 2.4 D4: 驳回与状态机回溯去倒错（Deterministic Rejection State）
1. **修复 `handoff-status.mjs` 保底倒错**：
   状态机回退判定逻辑严禁盲信 `rejected_by = r.from_lane`。若为审计工单（`to_lane === 'audit'`），驳回方必为 `to_lane`（`audit`）；非审计工单优先取工单真实 `rejected_by`，确保角色判定绝对精确。
2. **重构 `cmdReject` 回执元数据写入**：
   回执写入的 `from_lane` 必须为**当前真实驳回者（`cur`）**，`to_lane` 必须为**真实被驳回目标（`targetLane`）**，动态生成说明与角色文本，彻底消除硬编码与方向倒错。

### 2.5 D5: 入站单行纯化与防反向派单宪法级加固（Inbound Pure Verdict SSOT）
1. **收尾格式红线**：
   接收方在交付或驳回后，末尾**仅且只能输出单行纯文本**，**绝对禁止生成 `## 交接提示词` 代码块**。
2. **Round 轮次统筹单一事实源**：
   出站卡片生成与 Round 轮次推进特权 100% 归属于发起方重新转递出站时统筹。

---

## 3. Consequences（后果与收益）

### 3.1 Positive（正向收益）
- **根绝跨客户端角色漂移**：出站卡片明确双向角色，CLI 输出彻底消除了对接收方的 `baton close` 诱导，入站端不再反向派单。
- **状态机与看板 100% 精准**：`from_lane` 永不为空，整改待办精准展现，看板名称完整回显，闭环链路畅通。
- **主客角色绝对确定**：驳回流水与状态回溯逻辑彻底纠偏，消除任何场景下的角色颠倒。

### 3.2 Compliance & Migration（合规与迁移要求）
- 升级引擎至 `units/handoffs` v2.41.0；
- 刷新接入桩指纹；
- 运行 `baton install` 幂等同步全仓载体；
- 新增单测覆盖建单身份自推导、`deliver` 输出纯化与跨客户端防漂移闭环。
