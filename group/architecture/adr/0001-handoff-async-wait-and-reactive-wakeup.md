<!-- adr-template v1.0 · tier: frozen · source: ~/Documents/lab/adr/ -->

# ADR-0001: Handoff 异步后台监听与响应式唤醒架构规范

- **状态（Status）**：🔒 Frozen
- **冻结日期**：2026-11-04
- **决策人**：churze + Antigravity
- **关联证据**：`units/handoffs/README.md` (契约 v2.14.0), `units/handoffs/handoff.mjs` (commit `7c88965`)

---

## 1. Context（背景 / 问题）

1. **多 Agent 协同的“人肉消息队列”痛点**：
   在跨仓或同仓多窗口的多 Agent 协作流程中，发起方 Agent 建好交接单后，只能停下会话输出 `## 转递提示词`，依赖人类开发者复制到执行方 Agent 会话；执行方完成后再输出回执提示词，由人类搬运回复发起方。这种“半中断等待”造成协作流极度割裂，无法实现自动化连续编排。
2. **宿主执行机制的演进契机**：
   现代 Agent 运行时（如 WorkBuddy / Antigravity）已具备完善的**同步 + 异步后台双模式**：
   - 异步后台运行：通过 `run_in_background: true` 将命令置于后台，立即返回 `task_id`，Agent 进入待机状态；
   - 零 Token 消耗：进程运行期间不占用模型上下文 Token，取回 `TaskOutput` 仅作为一次观察返回；
   - 响应式唤醒（Reactive Wakeup）：当后台任务以 Exit 0（或完成）退出时，宿主系统自动唤醒主 Agent 会话。
3. **安全与边界约束**：
   若无严谨的协议状态机与超时保护，后台监听容易陷入文件半写竞态、僵尸挂起（Zombie Watcher）以及跳过审计偷工减料等工程陷阱。必须在契约层将监听与唤醒动作规范化。

---

## 2. Decision（决策 · 冻结内容）

1. **引入原生 `handoff wait <id>` 子命令**（`units/handoffs/handoff.mjs`）：
   - 提供标准命令：`handoff wait <id> [--timeout <dur>] [--interval <dur>]`。
   - 默认轮询周期 3 秒（支持 `ms`、`s`、`m`、`h` 解析），CPU 与磁盘开销近乎为 0。
2. **状态原子性判定**：
   - 严禁以“回执文件刚 touch 创建”判定完成；
   - 必须等待交接单或回执单正式通过内容与 evidence 门禁，状态变为 `received`（或已 `closed`）后方可唤醒退出。
3. **强制防死锁超时（TTL）机制**：
   - 默认超时 30 分钟（可配 `--timeout 10m` 等）；
   - 超时后强制以 **Exit 124** 退出，并格式化输出告警，提醒人工排查执行方状态，严禁无期限僵尸悬挂。
4. **审计动作契约强校验注入**：
   - 当检测到回执就绪时，进程打印回执摘要（文件路径、提交角色、结论、evidence 文件与提交）并以 **Exit 0** 正常退出；
   - **退出输出中强制注入硬约束**：严禁发起方仅静态读码或盲信自报，必须在终端独立实测交接单验收命令后，方可执行 `handoff close`。
5. **多模式协同边界规范**：
   - **跨仓模式**：自动识别 `receipts/<ID>-resp.md` 并执行轻量状态同步；
   - **同仓多窗口模式**：基于 `HANDOFF_LANE` 隔离窗口身份，共享同一源码树（`workspace=same`），执行方交完回执发起方原地秒级唤醒；
   - **单 Agent 串行会话禁止使用**：严禁单窗口内自己给自己发单并挂起等待，防止出现自我死锁。
6. **接入桩全网同构（Single Source of Truth）**：
   - 接入桩契约升至 `v2.14.0`，在出站最小序列中补充第 4 步 `[异步协同推荐] handoff wait <ID>`；
   - 统一由 `handoff install` 与维护脚本保证全网各消费方仓库的 SHA 级一致性。

---

## 3. Implementation Status（落地情况 · 截至 2026-11-04）

| 项 | 状态 | 说明 |
|---|:---:|---|
| CLI `handoff wait` 引擎实现 | ✅ 已实现 | `units/handoffs/handoff.mjs` (commit `7c88965`) |
| 契约升版与文档对齐 | ✅ 已实现 | `README.md` (v2.14.0), `COMMANDS.md`, `CHANGELOG.md` |
| 接入桩规范与 SHA 守卫 | ✅ 已实现 | `STUB_BODY` 包含 wait，`handoff install` 幂等自愈 |
| 真实多窗口并发自动化测试 | ✅ 已通过 | 验证毫秒级捕获 Exit 0 与超时 Exit 124 |
| 6 大下游消费方统一升级 | ✅ 已完成 | iggle, Swoop, Prospero, Tappy, 一期一卉花, WarmTag 已精准提交 |
| 批量同步工具脚本 | ✅ 已固化 | `units/handoffs/scripts/commit-consumer-stubs.mjs` |

> **结论**：Handoff 异步后台协同协议已全链路闭环落地，并完成生态内 6 大工程仓库的同步覆盖。

---

## 4. Rationale（架构依据 / 证据背书）

1. **分布式通信原理**：将 RPC 机制（发起 -> 挂起待机 -> 事件通知 -> 唤醒收尾）引入本地多 Agent 工作流，彻底解耦人机交互与异步执行，消除轮询与长轮询的 Token 浪费。
2. **Unix 哲理兼容**：遵循 Exit 0 成功唤醒、Exit 124 超时中断、Exit 1/2 参数或文件异常的标准进程哲学，使任何支持标准 Shell 后台执行的 Agent 宿主（Antigravity, WorkBuddy, Claude Code, Cursor）均能无缝调度。
3. **P1/P2/T1 宪法守卫**：
   - 遵循 `constitution.md §P1`：所有逻辑与校验收口在 `units/handoffs` 引擎，消费方只通过指针桩调用；
   - 遵循 `constitution.md §T1`：以可执行 exit code 与证据门禁作为“法律”，杜绝模型自然语言自欺欺人。

---

## 5. Consequences / Invariants（冻结后不可变量）

1. **【铁律一】严禁自我等待死锁**：同一个 Agent 会话在担任执行方职责时，严禁对自己待办的单据执行 `handoff wait`。
2. **【铁律二】严禁空/半写假唤醒**：`handoff wait` 的退出条件必须严格绑定 `status: received` 或 `status: closed`，文件不完整或正在写入时必须容错并继续等待。
3. **【铁律三】严禁跳过独立审计**：`handoff wait` 唤醒主 Agent 后，Agent 必须执行验收测试，严禁直接调用 `handoff close`。
4. **【铁律四】不可变更历史**：本 ADR 为 🔒 Frozen 态，后续若有协议调整必须通过发布新编号 ADR 并显式声明 `Supersedes: ADR-0001` 进行。

---

## 6. Future（后续演进任务，不在本决策变更范围）

- [ ] 探索基于 WebSocket / 本地 IPC 管道的零轮询纯事件唤醒扩展；
- [ ] 针对 `workspace=separate`（Git Worktree）模式，支持在唤醒时自动提示拉取并检出对应的证据 commit。
