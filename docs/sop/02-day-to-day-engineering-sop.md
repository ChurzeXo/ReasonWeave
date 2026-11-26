# SOP-02: 日常端到端工程协同与三态流转标准作业程序

**版本**：v1.0 (AEF 2.0 规范)  
**适用范围**：人类工程师与多 Agent 在日常开发中从需求立项、工单派发、微观工程执行到三态裁决与闭环的全生命周期。  
**关联宪法**：[`constitution.md`](file:///Users/churze/Documents/lab/constitution.md) T4, T5, T6, T8, T9, T11

---

## 阶段一：需求捕获与出站派发（发起方 Initiator）

### 1. 待办与架构立项 (Spec & Architecture)
- 若涉及重大决策或架构变更：
  ```bash
  adr-init "决策标题" --tier standard   # 在 units/adr 沉淀架构事实
  ```
- 若捕获未决待办或技术债：
  ```bash
  # 在 docs/backlogs/ 建立一任务一文件
  ```

### 2. 建立任务工单 (Create Ticket)
使用权威 CLI 创建工单（自动绑定发起方身份 `from_lane` 与会话 ID）：
```bash
baton new <目标角色|lane> <类型> "<业务母题标题>"
# 示例：baton new impl task "重构认证模块令牌轮转逻辑"
```
- **纪律红线（T5）**：`[任务主题]` 必须保持业务母题恒定，严禁写入轮次状态（如 `Round 2`、`修复xxx`）。

### 3. 原子转递并挂起监听 (Forward & Wait · 99% 场景)
填写工单内容（尤其是 `## 验收判据`）后，**必须原子一步完成转递与挂起**：
```bash
baton forward <TICKET-ID> --wait
```
- **输出物**：系统输出结构化交接卡片，终端自动挂起后台探针进入事件监听（毫秒级感知，等待回执唤醒）。
- **交接提示词规范**：复制输出的结构化代码块发送给接收方 Agent。

---

## 阶段二：接单与实测执行（接收方 Worker / Implementer）

### 1. 接单与会话身份锁 (Inbound & Lane Lock)
接收端 Agent 收到提示词后，冷启动第一条命令必须为：
```bash
baton status --for <本方角色>
# 并将当前会话锁定为本方角色 (如 impl)
baton lane impl
```
- **判定标准**：成功检出待办工单，且会话身份锁生效。

### 2. 调度微观工程技能库 (Micro-Skills Execution)
严禁跳过验证直接盲改代码，必须根据任务类型调度原子技能：
- **新增功能/重构**：运行 `skills tdd`，严格遵循「红灯单测先行 $\to$ 最小实现 $\to$ 绿灯重构」循环；
- **排查 Bug**：运行 `skills debug`，严格遵循「四步排错法」进行根因假设与证伪；
- **交割自验**：运行 `skills verification`，产出客观测试堆栈与变动爆炸半径分析。

---

## 阶段三：三态裁决与回执提交（三通道分流）

实测完成后，接收方根据实际测试结果分流走以下三个互斥通道之一：

```
                              ┌── 全量实测 Exit 0 ──► 通道 A: 交付验收 (GO)
                              │
[接收端实测 / 审计核验] ──────┼── 宿主环境硬阻断 ────► 通道 B: 受阻挂起 (BLOCKED)
                              │   (E_ENV: socketpair)
                              │
                              └── 独立审计验收未达标 ──► 通道 C: 裁决驳回 (NO-GO)
                                  (仅限 to_lane: audit)
```

### 通道 A：实测全部通过 $\to$ 终态交付（GO）
当且仅当全部验收判据通过且物理 Exit 0 时：
```bash
# 原子一步落盘回执并标记 delivered
baton receipt <TICKET-ID> --deliver \
  -n "## 状态 / 结论\n- **结论**：PASS (GO)\n- **变更概述**：...\n- **测试验证**：全量通过。" \
  --evidence-paths "受影响的核心文件路径,..."
```
- **单行收尾（T4）**：接收方在对话最后仅输出单行纯文本：`交付完成，回执已就绪`（严禁反向输出出站交接卡片）。

### 通道 B：遭遇不可抗力宿主限制 $\to$ 受阻呈报（BLOCKED · 破除死锁）
若因宿主沙箱权限（如 `socketpair E_ACCESSDENIED`）、基础设施缺失导致测试运行器崩溃（`E_ENV`）：
- **纪律红线（T8）**：**实现方严禁私自调用 `baton reject`**（会被 CLI 越界拦截）；亦**严禁伪造 PASS 交付**；
- **标准操作**：提交受阻回执，客观陈述环境证据：
  ```bash
  baton receipt <TICKET-ID> \
    -n "## 状态 / 结论
  - **结论**：BLOCKED (受阻挂起)
  - **阻断类型**：E_ENV (宿主环境权限限制)
  - **现场分析**：受宿主沙箱限制，全量 pytest/preflight 依赖的 socketpair 遭遇 E_ACCESSDENIED，测试无法拉起。
  - **请求协助**：请发起方放行沙箱套接字权限，或由发起方接手决策。" \
    --evidence-note "宿主环境权限拦截日志堆栈"
  ```
- **执行效果**：工单分流至 `recvBlocked`，解除 Agent 会话停滞，事实源安全移交人类/发起方。

### 通道 C：独立审计验收未通过 $\to$ 裁决驳回（NO-GO）
此通道**仅限独立审计方（`to_lane=audit`）**或发起方在验收阶段执行：
```bash
baton reject <TICKET-ID> -n "缺失验收条件或用例失败: 具体未通过项说明" --by audit
```
- **单行收尾**：审计方仅输出单行纯文本：`审计完成，裁决 NO-GO（工单已退回实现方进入 Round 2）`。

---

## 阶段四：发起方唤醒、验收与资源回收（闭环）

1. **响应式自动唤醒**：发起方后台的 `baton forward --wait` 探针在收到交付信号并经过 10 秒平息缓冲后，自动 Exit 0 唤醒发起方 Agent；
2. **独立实测验收**：发起方根据回执内容重跑回归测试；
3. **闭环收单与物理工作树回收**：
   ```bash
   baton accept <TICKET-ID> --as <发起方角色>
   ```
   - 系统原子将工单翻转为 `closed`，自动安全清理或回收关联的 `.worktrees/<TICKET-ID>` 目录；
   - 任务全生命周期正式闭环。
