<!-- adr-template v1.0 · tier: frozen · source: ~/Documents/lab/adr/ -->

# ADR-0003: 基于注意力节流（Attention-Throttle）的分层协同与 Handoff 微内核解耦架构

- **状态（Status）**：🔒 Frozen
- **冻结日期**：2026-11-09
- **决策人**：churze + Antigravity
- **关联证据**：`units/handoffs/README.md` (契约 v2.20.0), `group/contracts/npm-packaging.md`, `constitution.md`

---

## 1. Context（背景 / 问题）

1. **认知负荷与过程噪音（Attention Overhead）**：
   在现有多 Agent 协作中，Agent 倾向于向控制台输出大量低信息密度的过程推演（如“正在分析某个文件”、“尝试修改测试”），造成人类开发者的严重注意力打扰与警报疲劳。系统应贯彻哲学：“Take as little human attention as possible, and give as much value as possible.”
2. **工作区物理并发污染**：
   多 Agent 并行或流水线作业时，若共享同一主代码目录，极易发生 Git 索引脏污、未完成修改交叉覆盖、分支冲突等问题。需要目录级别的物理隔离机制（如 Git Worktree）。
3. **Handoff 独立开源的定位与边界保护**：
   `units/handoffs`（Baton）作为独立开源工具（Zero-Infrastructure、基于文件的状态机），服务广泛的外部开源社区。若将重型 Git Worktree 缓存共享、容器化/进程级环境测试重跑、影子记账等特定场景强行塞入 Handoff 核心，会导致协议毒化与过度膨胀，破坏 P1（单一事实源）与 P2（正交解耦）。
4. **工程诚实与双盲自动化**：
   现有的 Audit Nonce 与 `--blind` 机制解决了思维链脱敏与防伪，但审计步骤仍依赖人工执行测试。需要进一步演进为在干净工作区内自动唤醒子进程重跑测试并捕获物理 Exit Code。

---

## 2. Decision（决策 · 冻结内容）

1. **分层混合架构原则（Layered Hybrid Architecture）**：
   - **全局层（lab / 协议层）**：定义注意力节流规范、工单状态机、Workspace 扩展驱动接口；
   - **下游层（消费方项目）**：声明项目差异（构建与测试命令、Worktree 根路径），持有本地运行态数据（`.handoffs/`、`.worktrees/`），遵守宪法 T3（运行态不入库）。

2. **注意力节流规范（Attention Throttle Specification）**：
   - 规定协作流为全链路静默执行，过程日志重定向存入 `.handoffs/.logs/<ticket-id>.log`；
   - **三级事件中断模型**：
     - **绿灯（静默 / Silent）**：单步工具调用、单测通过、重试中、平息等待中 → 静默吞吐，零打扰；
     - **黄灯（交付 / Deliver）**：工单执行完毕并通过 Settle Window → 触发终态通知，唤醒验收方；
     - **红灯（阻断 / Block）**：重试超限、环境崩溃、权限缺失、死锁熔断 → 触发中断告警，呼叫人类介入。

3. **Handoff 开源微内核与可插拔驱动抽象（Workspace Driver Protocol）**：
   - Handoff 保持独立开源、零生产依赖（Zero-deps）与中立协议定位；
   - Handoff 原生扩展票据元数据支持：`workspace: same | separate | worktree`；
   - 暴露 `Workspace Driver` 钩子接口：
     - 派发时触发 `allocate(ticket_id)` 获取专属工作目录；
     - 交付与闭环时触发 `clean/prune(ticket_id)` 回收物理资源；
     - 默认无驱动时平滑降级（Graceful Degradation）为现有的 `same`（主目录）行为。

4. **独立单元承载重型基础设施**：
   - 新建 `units/worktree` 作为 Git Worktree 物理隔离的标准驱动，负责目录创建、符号链接依赖复用（Node `node_modules` / Rust `target`）与生命周期清理；
   - 门禁演进归属 `units/review-gate`：在 Worktree 干净目录中以无上下文 Clean Subshell 自动重跑测试，强制校验真实 Exit Code；
   - 影子巡检归属独立单元 `units/shadow-ledger`：仅记账不落盘，杜绝噪音告警。

5. **跨仓边界与人类兜底原则**：
   - 仓内（Intra-repo）多窗口协作全面自动化，由 `baton wait` / `forward --wait` 自动监听唤醒；
   - 跨仓（Cross-repo）边界默认保持“人类作为终审与转递通道”（Human-in-the-loop），防止跨仓未受控自动化级联崩溃；未来跨仓自动投递必须受独立 ADR 约束与授权。

---

## 3. Implementation Status（落地规划）

| 模块 | 归属单元 | 演进形态 |
|---|:---:|---|
| 注意力节流状态与三级中断 | `units/handoffs` | 原生契约支持，合并至主干 |
| Workspace Driver 钩子协议 | `units/handoffs` | 抽象驱动注册与回调接口 |
| Worktree 隔离驱动引擎 | `units/worktree` | 新建 Unit，负责物理目录与依赖缓存 |
| 双盲自动化 Clean Runner | `units/review-gate` | 演进支持无上下文进程级重跑与 Exit Code 捕获 |
| 影子记账最小可行版 | `units/shadow-ledger` | 新建 Unit，虚拟分支记账与一键 Diff 检视 |
