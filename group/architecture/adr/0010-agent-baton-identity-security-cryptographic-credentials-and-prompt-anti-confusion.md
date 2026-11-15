<!-- adr-template v1.0 · tier: proposed · source: ~/Documents/lab/adr/ -->

# ADR-0010: Agent Baton 身份防御、密码学防伪凭据与提示词防混淆架构决策 (Identity Security, Cryptographic Credentials & Prompt Anti-Confusion)

- **状态（Status）**：Accepted (🔒Frozen)
- **生效日期**：2026-11-15
- **决策人**：churze + Agent (AEF 架构委员会 · core/handoffs)
- **关联证据**：
  - 双盲红队审计专项现场事故（`audit-20261115-01-task` · 实现方通过 `--as audit` 越权闭环交付）
  - 角色漂移与自我闭环击穿复盘：同工作区共享磁盘模式下明文 Nonce 失去挑战意义
  - 轮次膨胀轨迹：第 6 次驳回（第 7 轮复审）被虚增至 Round 14 / Round 15
- **引擎版本**：`units/handoffs` v2.32.0+
- **关联契约**：[`units/handoffs/README.md`](file:///Users/churze/Documents/lab/units/handoffs/README.md) v2.32.0

---

## 1. Context（背景与事故复盘）

在同工作区（`workspace: same`）多 Agent 协作进行双盲红队渗透审计实战（如 Antigravity 担任 `arch` 实现方，WorkBuddy 担任 `audit` 审计方）时，发生了严重的「角色漂移与自我闭环」系统性事故：

1. **角色随意伪装漂移（`--as <lane>` 缺乏环境/会话锁）**：
   - `handoff.mjs` 在 v2.29.0 引入了 `--as <lane>` 参数以支持同会话多工单处理，但仅简单读取命令行参数，未对调用进程的会话环境做任何一致性约束与防伪装门禁；
   - 只要进程在命令行敲下 `--as audit`，CLI 盲信入参，不仅不校验当前进程环境变量（如 `HANDOFF_LANE`），更不校验当前会话是否与工单的 `from_lane` 存在直接利益冲突。
   - **事故结果**：实现方 Agent 在收到人类转发的审计驳回提示词后，误将提示词读为对自身的指令，直接敲下 `baton receipt <id> --deliver --as audit`，成功代办了审计交付，击穿了 AEF 最高宪法级铁律——**「禁止自我闭环（Anti-Self-Closing Guarantee）」**。

2. **同工作区密码学 Nonce 鉴权失效（共享磁盘读权限即拥有权限）**：
   - 现存 Audit Nonce 仅以纯文本形式保存在工单 frontmatter（`audit_nonce: ...`）中；
   - 在 `workspace: same` 模式下，实现方（`from_lane`）天然对工单文件拥有读写权限。由于校验仅做字符串相等比对，实现方可直接从工单提取 Nonce 并在命令行原样传入欺骗门禁，使得用于证明“确由审计方独立签发”的防伪 Nonce 形同虚设。

3. **出站提示词语义二义性（主谓宾倒置诱发 LLM 幻觉）**：
   - 历史出站提示词和骨架标题为：`# <TITLE> (lane: <LANE>)`；
   - 生成的提示词形式为：`请【audit】接单 [<ID>]：...（专项G (lane: audit) · Round 15 · nonce ...）`；
   - 括号内的 `(lane: audit)` 极具误导性，未明确标注【执行者角色】与【接收者角色】的主谓宾关系。人类在不同 Agent 窗口间复制粘贴时，接收端 LLM 极易误读为“当前会话应当切换为 audit 角色”。

4. **工单流转轮次（Round）与流水审计失真**：
   - `cmdReject`（驳回）执行了一次 `round: round + 1`，`cmdForward`（转递）又执行了一次 `round: round + 1`；
   - 导致一次正常的「驳回 $\to$ 修复转递」业务循环在技术字段上自增 2 次（7 轮交互飙升至 Round 15）；
   - 同时 `cmdForward` 遗漏清空 `rejected_at`，破坏了幂等性，并导致状态视图把已驳回工单错分类为未处理。

---

## 2. Decision（核心架构重构决策）

为彻底根治上述多 Agent 协作中的角色漂移、鉴权失效与自我闭环漏洞，本 ADR 确立四大核心安全机制：

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AEF ADR-0010 Security Architecture                   │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. 环境与本地会话身份锁        │ HANDOFF_LANE 强绑定 (Fail-Closed)     │
│    (Session Lane Lock)         │ baton lane <lane> 进程树隔离          │
│                                │ 利益冲突物理门禁：禁止自审自交付      │
├────────────────────────────────┼───────────────────────────────────────┤
│ 2. 密码学审计私钥凭据与签章    │ 0600 凭据: .handoffs/.secrets/audit.token│
│    (Cryptographic Signature)   │ HMAC-SHA256(token, id:round:nonce)    │
│                                │ --auto-nonce 仅限 audit 角色授权      │
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. 出站提示词防文本注入三段式  │ 标题规范化: (to_lane: <LANE>)         │
│    (Three-Section Prompt Guard)│ 强注入: 【身份警示：你是接收方...】   │
├────────────────────────────────┼───────────────────────────────────────┤
│ 4. 轮次计步单一事实源与流水    │ cmdReject 为唯一合法 round++ 点       │
│    (SSOT Round & State Journal)│ cmdForward 幂等并清空 rejected_at/by  │
└────────────────────────────────┴───────────────────────────────────────┘
```

### 2.1 D1: 环境与本地会话身份锁（Fail-Closed Environment & Session Lane Binding）
1. **环境变量强绑定（最高优先级）**：
   - 若进程环境中设置了 `HANDOFF_LANE=<lane>`，CLI 严格以此为准；
   - 传入的 `--as <other>` 若与环境变量不一致，直接触发 `CROSS_LANE_IMPERSONATION_BLOCKED` 拦截并 Exit 1，严禁随意通过参数伪装其他角色。
2. **本地会话身份锁（`baton lane`）**：
   - 新增 CLI 指令：`baton lane [<lane>|--clear]`（支持 `--json` 查看）；
   - 默认根据会话标识符（`BATON_SESSION_ID` / `TERM_SESSION_ID` / `process.ppid`）在 `.handoffs/.sessions/<sessionId>.json` 记录会话锁；
   - 从而实现不同 AI 客户端/终端进程树的自然身份隔离，一旦会话锁定，当前进程树即具备确定性角色。
3. **利益冲突物理硬门禁（Anti-Self-Closing Guarantee）**：
   - **交付闸门**：若当前会话绑定为发起方（`from_lane`），严禁使用 `--as <to_lane>` 提交通过性回执或执行 `baton deliver`；
   - **验收闸门**：若当前会话绑定为目标方（`to_lane`），严禁使用 `--as <from_lane>` 执行 `baton accept` / `close` 验收闭环。

### 2.2 D2: 密码学审计私钥凭据与 HMAC-SHA256 签章（Cryptographic Audit Token & Signature）
1. **审计专用私钥凭据**：
   - 在 `.handoffs/.secrets/audit.token` 存放 32 字节高熵随机私钥（目录权限 `0700`，文件权限 `0600`，自动加入 `.gitignore`）；
   - 仅限经环境/会话锁确认为 `audit` 角色的进程访问；发起方（`arch`/`impl`）无权读取该文件。
2. **HMAC-SHA256 签章验证**：
   - 在同工作区模式且 `to_lane: audit` 场景下，工单通过验收与交付必须包含有效签名：
     $$\text{audit\_sig} = \text{HMAC-SHA256}(\text{token}, \text{ticketId} : \text{round} : \text{nonce})$$
   - 回执交付时强制核验 `audit_sig`，彻底杜绝发起方从工单复制明文 Nonce 冒充签章；
   - `--auto-nonce` 令牌自动绑定严格限定仅限 `audit` 身份调用。

### 2.3 D3: 出站提示词防文本注入三段式（Three-Section Prompt Protection）
1. **骨架标题消歧**：
   - 仓内交接骨架标题从 `# <TITLE> (lane: <LANE>)` 统一变更为 `# <TITLE> (to_lane: <LANE>)`，消除主客观身份歧义。
2. **强制主谓宾三段式声明**：
   - 所有出站交接提示词（`baton prompt`、`baton forward` 建议等）代码块首行固定强制注入显式防文本注入声明：
     - 中文：`【身份警示：你是接收方 <目标角色>，请勿切换角色】请【<目标角色>】接单 [<ID>]：<交接路径>（<主题>）`
     - 英文：`【ROLE NOTICE: You are assignee <Target Role>, do not switch roles】Please [<Target Role>] take handoff [<ID>]: <path> (<topic>)`
   - 彻底防范人类跨客户端复制时 LLM 发生主谓倒置和角色混淆。

### 2.4 D4: 轮次计步单一事实源（SSOT for Round Increments）与状态机流水
1. **驳回作为轮次唯一递增点**：
   - 业务轮次自增严格收敛至 `cmdReject`（驳回即开启下一轮复审并轮转 Nonce）；
   - `cmdForward` 仅负责翻转状态为 `forwarded`，保持幂等性，严禁再次对 `round` 二次自增。
2. **原子清空驳回标记与流水记录**：
   - `cmdForward` 成功执行时原子清空 `rejected_by: ''` 与 `rejected_at: ''`；
   - 每次 `forward` 显式写入 `.handoffs/logs/state-journal.jsonl`，使工单流转流水完全可审计、可追溯；
   - 看板视图基于历史流水精准回溯，彻底消除驳回工单在转递后被误分类为未处理的缺陷。

---

## 3. Consequences（后果与收益）

### 3.1 Positive（正向收益）
- **根绝自我闭环漏洞**：物理确保双盲审计与验收职责的绝对隔离，实现方绝无可能代办审计交付或自审自闭环。
- **密码学级防伪**：同工作区共享磁盘模式下，即便实现方拥有工单文件全部读权限，也无法伪造审计私钥签章。
- **消灭提示词误导**：三段式身份锁声明使得任何具备基础系统指令遵循能力的 LLM 均不会发生角色倒置。
- **轮次确定性**：消除 Round 虚增，技术轮次与实际审计整改轮次严格一对一对应。

### 3.2 Compliance & Migration（合规与迁移要求）
- 引擎版本升级至 `units/handoffs` v2.32.0；
- 接入桩指纹升级至 `handoff-stub:v2.1`（契约 v2.32.0）；
- 所有下游消费方运行 `lab sync-consumers` 即可无感自动刷新。
