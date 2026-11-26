<!-- adr-template v1.0 · tier: frozen · source: ~/Documents/lab/adr/ -->

# ADR-0017: 三态裁决体系 (GO/NO-GO/BLOCKED)、宿主基座指纹与 AEF 2.0 研发纪律升维架构决策 (Three-State Verdict Protocol, Runtime Capability Fingerprinting & AEF 2.0 Engineering Discipline Invariant)

- **状态（Status）**：Accepted (🔒Frozen)
- **生效日期**：2026-11-26
- **决策人**：churze + Agent (AEF 架构委员会 · core/constitution/handoffs/playbook)
- **关联证据**：
  - 宿主受限沙箱（无特权 Docker、seccomp 策略、macOS Seatbelt）拦截系统调用 `socketpair` / `fork` 导致 `pytest/preflight` 抛出 `E_ACCESSDENIED`，引发执行端 Agent 认知死锁案例
  - Baton RBAC 权限拦截执行方越界 reject，但在二元（GO/NO-GO）模式下缺乏标准受阻呈报路径导致的长期挂起事故
  - `constitution.md` 停留在 v1.0 与机件能力演进（ADR-0007 ~ ADR-0016）之间的体系性剪刀差
- **引擎版本**：`reasonweave` v1.4.3+ / `units/handoffs` v2.41.2+
- **关联契约**：[`constitution.md`](file:///Users/churze/Documents/lab/constitution.md) v2.0, [`units/handoffs/README.md`](file:///Users/churze/Documents/lab/units/handoffs/README.md)

---

## 1. Context（背景与系统性矛盾）

随着 ReasonWeave 从单机辅助工具演进为覆盖异构多 Agent（Antigravity, WorkBuddy, Cursor, Claude Code, CI）的工程纪律机件，在真实复杂交付场景中暴露出了三大深层矛盾与制度死角：

### 1.1 二元裁决在宿主环境崩溃下的认知死锁（The Binary Verdict Trap）
- **现有设计**：AEF 宪法强调“实测是唯一准绳”，未通过测试严禁交付；Baton CLI 严格推行 RBAC 门禁，普通实现方（`to_lane: impl/worker`）严禁调用 `baton reject`（驳回权专属于发起方验收与独立审计方裁决）。
- **现实碰撞**：当测试环境本身发生底层故障（例如容器沙箱禁止 `socketpair`、缺系统共享库、缺设备依赖）导致测试套件启动阶段即崩溃时，实现方 Agent 既不能执行 `deliver`（违背实测律），又无法执行 `reject`（被 CLI 拦截），还不敢空手交付，导致 Agent 陷入“不敢交又退不回”的逻辑死锁（Catch-22），任务在 `forwarded` / `received` 态无限空转。

### 1.2 宿主环境探测的“静态假象”（Static Probe vs Dynamic Capability）
- 现有 `lab doctor` 与 `preflight` 只探查静态文件或命令是否存在（`node -v`, `git --version`），完全缺乏对**宿主底层动态系统调用与沙箱能力边界**（Syscall / IPC Capability：如 `AF_UNIX` 套接字、命名管道 FIFO、文件锁 `flock`、子进程派生）的探测。
- 当上游把任务派发至一个高度受限的沙箱时，测试运行器必然在启动时直接崩溃。

### 1.3 宪法与顶层方法论滞后（Constitutional Lag）
- `constitution.md` 自 2026-11-03 设立 1.0 版以来，仅收录 P1~P3、T1~T6、U1~U2 共 11 条早期原则。
- 过去 3 周内沉淀的 ADR-0007 至 ADR-0016（反未接线 L1~L3 垂直切片、密码学防伪凭据、Vibe 安全防抑噪、SDD RePPIT 闭环分级、全 CLI 契约律、微观原子技能零污染引擎等）全部分散在各子模块中，最高工程宪法缺乏收敛升维，导致研发纪律“头轻脚重”。

---

## 2. Decision（核心架构与纪律决策）

为彻底解决上述矛盾，确立 **AEF 2.0 研发纪律升维体系**，包含以下五大核心机制：

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AEF 2.0 Engineering Discipline Model                 │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. 三态裁决体系 (Three-State)  │ GO (交付) / NO-GO (驳回) / BLOCKED (受阻) │
│    确立受阻为一等公民           │ 终结“不敢交又退不回”的二元死锁        │
├────────────────────────────────┼───────────────────────────────────────┤
│ 2. 免责受阻呈报协议 (Blocked)  │ 区分 E_ENV (环境故障) 与 E_LOGIC (缺陷) │
│    实现方安全呈报通道          │ 强制 15 分钟内附带系统日志交付 BLOCKED │
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. 宿主基座指纹与防御性降级    │ 动态探测 socketpair / IPC / tmpfs 权限 │
│    (Capability Fingerprinting) │ 提供 pytest --capture=sys 等优雅降级  │
├────────────────────────────────┼───────────────────────────────────────┤
│ 4. 异常死锁熔断纪律            │ 挂起与越界拦截时提供一键破局自愈引导   │
│    (Deadlock Circuit Breaker)  │ 杜绝 Agent 在会话内静默失踪与长期空转 │
├────────────────────────────────┼───────────────────────────────────────┤
│ 5. 宪法升维至 Version 2.0      │ 固化 T7~T11 核心法条，统一生态最高法典  │
│    (Constitution v2.0 Sync)    │ 确立标准作业程序（SOP）为工业级执行载体│
└────────────────────────────────┴───────────────────────────────────────┘
```

### 2.1 确立三态裁决体系（Three-State Verdict Architecture）
彻底废除二元思维，在 Baton 回执协议、状态机和 AEF 研发纪律中，将裁决明确划分为正交的三态：
1. **GO（交付验收）**：全量测试真实 Exit 0 通过，产出客观 E1 级证据，由执行方签发 `baton receipt --deliver`；
2. **NO-GO（裁决驳回）**：业务逻辑或规约未达标，由发起方（`from_lane`）或独立审计方（`to_lane=audit`）签发 `baton reject -n "..."`；
3. **BLOCKED（受阻挂起）**：因宿主基础设施不可用、外部依赖宕机或沙箱权限硬拦截导致测试无法拉起，**普通实现方有权且必须提交受阻回执（BLOCKED Receipt）**，解除会话死锁。

### 2.2 制定《受阻与不可抗力免责呈报协议》（Blocked Reporting Protocol）
- **客观证据区分律**：必须严格区分 **`E_ENV`（环境阻断）** 与 **`E_LOGIC`（业务缺陷）**。
  - `E_ENV`：如系统调用拒绝（`socketpair: E_ACCESSDENIED`）、磁盘只读、网络断开；
  - `E_LOGIC`：断言失败、业务异常、崩溃退出码。
- **免责与时效保障**：遭遇不可抗力 `E_ENV` 时，执行方**严禁私自调用 `baton reject`**，亦**严禁挂起不作为**；必须在 15 分钟内执行：
  ```bash
  baton receipt <ID> -n "## 状态 / 结论\n- **结论**：BLOCKED（受阻）\n- **阻断类型**：E_ENV (宿主环境权限限制)\n- **根因分析**：..." --evidence-note "宿主环境阻断日志与系统调用错误堆栈"
  ```
- 回执提交后，任务状态分流至 `recvBlocked`，发起方收到客观阻断证据后接入决策（放行环境特权、更换执行节点或由发起方合法关闭/驳回）。

### 2.3 宿主基座指纹探测与优雅降级（Runtime Capability Fingerprinting）
- 升级 `lab doctor` 与 `preflight` 探针，由单纯的静态 PATH 探查升级为**动态调用能力指纹扫描**：
  - 检查当前沙箱是否支持 `socketpair` / `AF_UNIX`；
  - 检查临时目录是否具备执行权限（`noexec` 探测）；
  - 检查 Git 是否配置完备 `user.name` 与 `user.email`（防 CI 静默假死）。
- **测试框架降级规范**：当检测到沙箱拦截 socket 时，自动化套件必须支持自适应降级配置（例如 pytest 自动切换为 `--capture=sys -p no:xdist`，禁用多进程通信管道，保证单进程核心测试可跑通）。

### 2.4 最高宪法升维（Constitution v2.0）
正式修订 `constitution.md`，将版本提升为 `Version 2.0`，在原有 T1~T6 基础上，正式注入过去实践验证成熟的 5 条铁律：
- **T7 — 反未接线垂直切片与分层治理律 (Anti-Orphan & Vertical Slicing)**
- **T8 — 三态裁决与环境阻断呈报律 (Three-State Verdict & Blocked Environment Protocol)**
- **T9 — 密码学防伪凭据与反自审闭环律 (Cryptographic Audit & Anti-Self-Closing Guarantee)**
- **T10 — 全 CLI 物理契约对齐与零环境寄生律 (CLI Contract & Hermetic Testing Invariant)**
- **T11 — 微观工程原子技能零污染切片调度律 (Zero-Pollution Micro-Skills Invariant)**

### 2.5 建立工业级标准作业程序（SOP）体系
在 `docs/sop/` 建立标准作业程序体系，解耦“长文理论指南”与“机械执行动作”，确立 4 大核心 SOP：
1. `docs/sop/01-installation-and-onboarding-sop.md`：全仓初始化与业务仓接入 SOP
2. `docs/sop/02-day-to-day-engineering-sop.md`：日常端到端工程协同作业 SOP
3. `docs/sop/03-handoffs-and-audit-sop.md`：任务交割与双盲独立审计流转 SOP
4. `docs/sop/04-anti-orphan-governance-sop.md`：死代码清道夫与反未接线排查治理 SOP

---

## 3. Consequences（影响与收益）

1. **彻底消除执行端死锁**：实现方在面对宿主环境崩溃时拥有合法合规的呈报退出通道（BLOCKED），杜绝越界 reject 被拦截后挂起空转。
2. **基座环境具备自愈与感知能力**：从盲目相信宿主环境，演进为主动探查沙箱边界并支持优雅降级。
3. **顶层宪法与底层机件重新统一**：最高法典与现有的 16 个 ADR 严密咬合，形成自顶向下的确定性工程纪律。
4. **可操作性大幅提升**：SOP 体系让无论新工程师还是新 Agent，均能对照 1-2-3-4 步骤精准执行，消除因阅读三万字手册产生的信息遗漏。
