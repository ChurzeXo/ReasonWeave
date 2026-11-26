# SOP-03: Baton 跨端流转与自主双盲审计标准作业程序

**版本**：v1.0 (AEF 2.0 规范)  
**适用范围**：跨 Agent 协作（如 Antigravity $\leftrightarrow$ ChatGPT / Claude / WorkBuddy）、独立第三方代码审计与自主双盲验收流转。  
**关联宪法**：[`constitution.md`](file:///Users/churze/Documents/lab/constitution.md) T4, T6, T8, T9

---

## 阶段一：自主双盲审计派发（发起方 Initiator）

> 适用场景：实现方代码完成，向独立审计方（`to_lane=audit`）派发双盲验收工单。

### 1. 建立双盲审计工单 (Ticket Creation)
```bash
baton new audit task "重构核心模块双盲独立验收"
```

### 2. 编写客观机器判据 (Acceptance Criteria Gate)
在工单 `## Acceptance Criteria` 节中，必须编写**机器可判、无上下文歧义的物理断言**（例如可执行的测试命令与退出码）。
- **门禁红线**：严禁仅写主观语言（如“代码结构优美”），缺少客观机器判据将触发双盲脱敏物理拦截。

### 3. 双盲脱敏转递与挂起 (Blind Forward & Wait)
```bash
baton forward <TICKET-ID> --blind --wait
```
- **脱敏机制 (D1)**：系统物理清洗工单中的思维链、实现者自辩、中间试错过程；烙印 `blind: true`；为审计方签发高熵 HMAC 挑战令牌（`audit_nonce`）；
- **角色锚定 (D2)**：出站提示词卡片自动注入：
  ```text
  [角色锚定] 本会话即为独立审计沙箱，请直接作为审计执行员进行独立测试与核验（切勿触发派单逻辑）
  [接单指令] baton lane audit
  ```
  彻底阻断接收端 Agent（如 ChatGPT）误召回派单技能造成的死锁。

---

## 阶段二：独立审计沙箱实测（审计方 Auditor）

### 1. 接单与身份加锁 (Audit Identity Lock)
审计端 Agent 读取提示词后，冷启动执行：
```bash
baton lane audit
baton status --for audit
```
- **令牌自动探测**：输出将安全展示系统签发的有效 Audit Nonce。

### 2. 独立重跑测试套件 (Clean Runner)
审计方必须在无污染环境下直接运行物理验收命令：
```bash
# 推荐使用双盲自动化运行器在独立 worktree 重跑
baton-audit-runner run <TICKET-ID> --cmd "npm test"
```
- **铁律**：只有子进程真实 Exit 0 方为有效通过，严禁口头脑补。

### 3. 签署防伪凭据回执 (Cryptographic Receipt)
- **若实测通过（GO）**：
  ```bash
  baton receipt <TICKET-ID> --deliver \
    --audit-nonce "<NONCE>" \
    -n "## 状态 / 结论\n- **结论**：ACCEPT / GO\n- **审计核验**：物理 Exit 0，无安全风险。" \
    --evidence-paths "测试日志或报告路径"
  ```
  *(注：在同工作区授权下可直接追加 `--auto-nonce` 自动绑定最新令牌)*
- **若实测不通过（NO-GO 驳回）**：
  ```bash
  baton reject <TICKET-ID> -n "测试挂起或断言失败: <详细失败堆栈>" --by audit
  ```
  系统原子更新 `needs_change=true`、轮转新 Nonce 并打回发起方整改。
- **单行裁决收尾（T4）**：
  - 驳回：输出单行 `审计完成，裁决 NO-GO（工单已退回实现方进入 Round 2）`
  - 通过：输出单行 `审计完成，裁决 GO`

---

## 阶段三：超时防空转与自愈破局 (Escalation)

| 异常现象 | 触发原因 | 标准自愈与破局动作 |
|---|---|---|
| 接收方 Agent 误将自己当成派发官拒绝接单 | 接收端召回了全局派单技能 | 在出站提示词中强化 `[角色锚定]`，在接收端强制执行 `baton lane audit` |
| `cmdReceipt` 报 Nonce 不匹配 | 工单经历过驳回整改，Nonce 发生轮转 | 运行 `baton show <ID> --nonce` 提取最新令牌，或使用 `--auto-nonce` 自动对齐 |
| 审计端遭遇环境限制（如 socket 权限） | 容器沙箱缺少内核特权 | 运行 `baton reject <ID> -n "宿主环境权限限制阻断测试" --by audit` 退回发起方 |
