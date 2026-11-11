# Lab — Agent 工程能力库 (Agent Engineering Toolkit)

> 一套**可复用的 Agent / AI 辅助工程纪律机件与规范全集**（采用 ZSpec / AEF v1.0 架构）。  
> 每个模块独立、正交，按需挑选接入项目；规范以「单一事实源」方式集中在本库，项目里只放**动态指针 + 一句指令**，规范不内联、不漂移。

---

## 快速导航

- 📥 **安装与配置手册**：👉 [INSTALL.md](INSTALL.md)（1 分钟快速上手）
- 📋 **消费方接入与改造提示词大全**：👉 [docs/CONSUMER-PROMPTS.md](docs/CONSUMER-PROMPTS.md)（新项目接入 / 老项目平滑升级，直接复制给 AI 即可使用）
- 📖 **详细使用指南**：[使用说明.md](使用说明.md)（ZSpec 思想背景与各模块接入实操）
- 📜 **工程宪法**：[constitution.md](constitution.md)（单一事实源、门禁原则、无感兼容）
- 🤖 **Agent 维护守则**：[AGENTS.md](AGENTS.md)
- 📐 **架构与依赖图**：[group/architecture/dependency-graph.md](group/architecture/dependency-graph.md)
- 📦 **NPM 打包契约**：[group/contracts/npm-packaging.md](group/contracts/npm-packaging.md)

---

## 📦 1 分钟快速安装 (Quick Start)

### 1. 前置依赖要求
- **Node.js** `>= 18.0.0` (推荐 Node 20+)
- **Git** `>= 2.20.0`
- *(可选)* **OpenGrep**（用于 `review-gate` 静态安全扫描，未安装时采取 fail-open 告警不阻断）

### 2. 全局挂载 CLI
解压或克隆本仓库到本地任意目录（例如 `~/Documents/lab`），在根目录运行：

```bash
cd lab
npm link
```

运行后，系统全局即可直接使用以下核心 CLI 工具链：
- 🌐 `lab`：能力库总管、环境体检、路径动态解析与 ZSpec 脚手架
- 🔄 `baton` / `handoff`：工作流交割中枢、防伪回执、注意力节流静默管道与事件驱动引擎 (v2.21)
- 🌳 `baton-worktree`：基于 Git Worktree 的多 Agent 物理目录隔离调度引擎
- 🛡️ `baton-audit-runner`：双盲审计自动化运行器（无上下文独立重跑测试，Exit Code 真实裁决）
- 📐 `adr-init`：架构决策记录 (ADR) 快速引导初始化
- 🛡️ `spec-guard` / `drift-gate`：全局架构漂移与规约守卫 CLI（P3' 三元映射对账、防半山腰挂起与装饰性空壳接线）

### 3. 环境自检 (Doctor)
在终端执行自检，确认依赖就绪：

```bash
lab doctor
```

---

## 🛠️ 核心 CLI 工具速查

### 1. `lab` — 架构与路径总管
```bash
lab list                    # 列出所有可用的工程单元 (Units)
lab path [unit]             # 动态获取 Unit 绝对路径 (如: lab path handoffs)
lab doctor                  # 本地前置环境健康自检
lab zspec init "<项目名>"    # 为新项目一键初始化 ZSpec (AEF v1.0) 工业架构
lab zspec add-unit <端名>   # 为多端项目添加工程单元 (如: ios, android, web)
lab zspec guide             # 查看面向 AI Agent 的 ZSpec 实施指南
lab migrate [项目路径]      # 将老项目中硬编码的路径一键平滑升级
```

### 2. `baton` / `handoff` — 任务交割与注意力节流引擎 (v2.21)
> **跨仓/同仓 Agent 间任务交割像调 API 一样无损直达**  
> 拒绝人肉传话与上下文衰减。一条命令穿透仓库边界，接口与协作契约严密对齐，独立窗口双盲审计，事件驱动无感闭环。

支持物理工作树隔离（`--workspace worktree`）、静默管道（`baton throttle`）、双盲审计脱敏（`--blind`）、一次性审计防伪 Nonce（`--audit-nonce`）与后台待机自动唤醒（`--wait` / `--daemon`）：
```bash
baton status --for <角色>           # 冷启动直取当前角色的进行中待办
baton new <目标> <类型> "<标题>" [--workspace worktree] # 创建交接单，支持自动分配物理工作树
baton forward <ID> --wait           # 转递并挂起后台监听，对方回执到达后自动唤醒闭环
baton throttle <ID> -- <command...> # 静默管道运行长任务，阻断过程噪音，失败即刻触发 Red 告警
baton receipt <ID> -n "<正文>" --evidence-paths "真实文件,..." # 提交可核验证据回执
baton deliver <ID>                  # 执行方终态交付并翻 delivered
baton close <ID> [--prune-worktree] # 发起方验收闭环并自动回收临时隔离工作树
baton check                         # 闭环状态与回执规范性核验
```

### 3. `baton-worktree` — 物理隔离调度引擎
```bash
baton-worktree allocate <ID>        # 为工单创建专属物理目录 (.worktrees/<ID>) 并软链依赖缓存
baton-worktree list                 # 查看所有活跃工作树状态与分支
baton-worktree prune <ID> [--force] # 安全回收工作树与临时分支
```

### 4. `baton-audit-runner` — 双盲审计自动化运行器
```bash
baton-audit-runner run <ID> [--auto-receipt] # 在无上下文隔离进程中自动重跑测试命令，Exit 0 自动签发回执
```

### 5. `adr-init` — 架构决策记录脚手架
```bash
adr-init <目标目录> <档位: light|standard|frozen> "<项目名>"
```

---

## 🧩 模块清单 (Units)

| 模块 (Unit) | 路径 | 核心作用 |
|---|---|---|
| **adr** | [`units/adr/`](units/adr/) | 架构决策记录（ADR），三档强度 light / standard / frozen，跨会话架构记忆 |
| **spec-guard** | [`units/spec-guard/`](units/spec-guard/) | 全局架构漂移与规约守卫，P3' Invariant ↔ Assertion ↔ Code 三元映射对账矩阵，防半成品挂起与装饰性接线 |
| **backlog** | [`units/backlog/`](units/backlog/) | 待办捕获：越界 / 待拍板 / 未来功能，一任务一文件，不打断当前工作流 |
| **preflight** | [`units/preflight/`](units/preflight/) | 仓库不变量探针 + Git 提交门禁，防止“做完才发现还有一件事” |
| **review-gate** | [`units/review-gate/`](units/review-gate/) | 本地 SAST 扫描 (OpenGrep) + 本地 review 门禁 + 双盲审计自动化重跑器 (`baton-audit-runner`) |
| **handoffs** | [`units/handoffs/`](units/handoffs/) | 跨仓 / 同仓任务交割中枢（Agent Baton / 契约 v2.21），任务交接 API 化、注意力节流静默管道与事件唤醒 |
| **worktree** | [`units/worktree/`](units/worktree/) | 基于 Git Worktree 的物理目录隔离调度引擎，为多 Agent 并发分配独立沙盒并智能共享依赖缓存 |
| **playbook** | [`units/playbook/`](units/playbook/) | Agent Engineering Framework (AEF) 完整方法论手册与模板库 |

> **向后兼容保证**：根目录下保留了指向各 Unit 的软链接（`adr`、`preflight`、`handoffs` 等），无论通过 `$(lab path <unit>)` 还是旧绝对路径均可无缝兼容。

---

## 🚀 如何在你的项目中使用

规范以单一事实源存在于本能力库，**你的项目不需要复制代码，只放指针**：

### 场景 A：新项目从 0 搭建标准架构（推荐）
在你的新项目根目录下运行：
```bash
lab zspec init "My Project"
```
会自动生成：`constitution.md`（宪法）、`group/`（共享事实层）、`specs/`（规格区）以及门禁脚本。

### 场景 B：给 AI Agent (Cursor, Claude, Windsurf, Trae) 挂载纪律门禁
在项目的 `AGENTS.md` 或系统规则中添加指针指令：
```markdown
- 架构决策：按 $(lab path adr)/README.md 记录架构变更。
- 提交门禁：按 $(lab path preflight)/README.md 执行不变量检查。
- 代码质量：按 $(lab path review-gate)/README.md 执行提交前安全扫描。
```

### 场景 C：多 Agent / 多端跨仓协作
多个 Agent 各自独立工作，不直接修改对方代码，通过 `handoff` 离线派发与证据回执闭环。详见 [units/handoffs/AGENT-GUIDE.md](units/handoffs/AGENT-GUIDE.md)。

---

## 🔒 纯净能力库说明 (Clean Distribution)

为了保护用户隐私与控制分发体积，本仓库的分发与压缩包严格遵循以下纪律：
- **运行态数据物理隔离**：不包含任何本机的交接票据、回执与审查历史（`handoffs/`、`receipts/`、`archive/` 等在使用时会自动按需创建）。
- **零脏文件**：已排除所有 `.git/`、`.DS_Store`、`.workbuddy/` 缓存与本地开发日志。
- 开箱即可直接打包分发（`npm pack` 或 `zip`），开箱即用。

---

<!-- handoff-stub:v2.1 begin -->
<!-- generated — do not edit -->
<!-- stub:sha256:e39e8e0c -->
### Agent Baton (Handoff) 接入桩（强制守卫 · 细则以 $(lab path handoffs)/README.md 契约 v2.24.0 为准）

**早拦 Preflight（强制）**
- **命令形态**：一律 `baton <op>` 或 `handoff <op>`（PATH shim → 中央引擎；幂等自愈 `baton link`）。若报 command not found：运行 `baton link`（或 `handoff link`）自愈（或通过 lab-agent-toolkit 重新 `npm link`）。
- 调用 `show/receipt/deliver/accept/reject/check` 前，**必须先跑** `baton status`（或 `handoff status`，执行方冷启动用 `baton status --for <本方 lane|target>` 直取本方待办）且其输出在上下文中。
- **状态语义（v2.20.0 · 五态生命周期）**：「进行中」= 未闭环（`status ≠ closed`）且归属当前方。**待办 = `draft` + `forwarded`**——落我归属即该我动工；`received` = 回执草稿已登记（待执行方交付）；`delivered` = 执行方已完成终态交付（等待发起方验收）；`closed` = 审计闭环完成。
- **终态交付与平息机制（v2.20.0 · 防抢跑竞态与会话平息）**：回执文件落盘不等于会话结束。执行方必须通过 `baton deliver <ID>`（或 `baton receipt <ID> --deliver`）显式标记终态交付；探针检测到交付信号后启动平息缓冲（Settle Window），等待执行方会话彻底收尾退出后方 Exit 0 唤醒发起方。未 deliver 之前发起方 wait 探针不唤醒、accept 硬拒闭环。发起方严禁在收到显式交付信号前提前修改 Backlog 或规划文档。
- **物理工作树隔离（v2.21.0 · workspace: worktree）**：支持 `workspace: worktree`，自动在 `.worktrees/<id>` 下创建轻量沙箱并软链共享构建缓存（`node_modules`、`target`、`.venv`），主仓库零污染且构建零损耗。工单闭环时使用 `baton close <ID> --prune-worktree` 自动安全回收。
- **注意力节流管道（v2.21.0 · baton throttle）**：执行方在后台长任务运行时，推荐使用 `baton throttle <ID> -- <cmd>` 包装运行。三级中断过滤机制阻断日志刷屏对人类与主控上下文的注意力劫持（仅致命错误红灯突破，常规流直接静默落盘）。
- **无污染双盲重跑（v2.21.0 · clean-runner / baton-audit-runner）**：审计方验收时，推荐使用 `baton-audit-runner <ID>` 在干净上下文独立重跑验收判据命令，自动校验真实 Exit Code 并固化 `--evidence-commits` 与 `--evidence-paths`。
- **监听必须性与反借口（v2.23.0 · 严禁擅跳监听）**：无论执行方是同窗口子 Agent、外部客户端（Cursor/WorkBuddy/Antigravity 等）、独立终端还是人工，`baton` 是底层文件系统事件总线（`fs.watch`），外部任何终端执行 `baton deliver` 会直接写入工单，探针能瞬间感知并唤醒。**严禁以「执行方是外部客户端/等不到回执/会空耗超时」为由擅自跳过后台监听**；发起方转递后必须挂起 `baton forward <ID> --wait`（或由宿主作为后台任务挂起 `baton wait <ID>`）。
- 指定 ID 必须在「进行中」且归属当前方（仓内：`to_lane == 当前 lane`；跨仓：落在目标收件箱且未闭环）。找不到→停下并说明。
- 未指定 ID 却有多条归属当前方的待办（draft/forwarded）→ 列出清单请用户点名，不擅自选。
- receipt 前确保 status 快照 **< 60 分钟**（超时重跑；长任务收尾时 deliver 自动宽容续期）。
- 仓内优先读 frontmatter `workspace`（same/separate/worktree），禁用 mtime 推断。
- 执行方**只写 receipt / deliver**，**不做 accept/reject**。
- **严禁抢跑/虚假回执**：验收判据**全部实测通过**方可提交回执与交付。执行中途遇阻、环境/多实例冲突或需讨论的中间状态，**仅记录于 reviews/ 或对话说明，严禁提交包含「已通过」的抢跑回执**。
- 回执正文唯一源 = `$(lab path handoffs)/RESPONSE-TEMPLATE.md`：**照抄其「回执模板（可直接复制）」骨架**（含 evidence 字段），勿另起格式、勿凭记忆重建（骨架外 = 没有）。
- **evidence 硬门禁（v2.12.3）**：仓内新回执（2026-10-14 起）**必须**附可核验证据 `--evidence-paths "真实文件,..."` / `--evidence-commits "<sha>"`（无文件改动用 `--evidence-note "<原因>"`）；声称的路径须真实存在、提交须 `git cat-file -e` 可查，否则 receipt / deliver / accept / check 拒收。**只声明不改 = 伪回执**（2026-10-13 goods-stores 事故教训）。
- 收尾必须 `baton check`（或 `handoff check`）exit 0（2026-10-13 起回执须「非空正文 + 含 ## 节 + 含『状态 / 结论』锚节」；存量豁免）。
- **回复收尾（交接提示词规范）**：发起交接（出站）时，回复最末块**必须固定为交接提示词（由本地 AI 根据用户本地语言自适应呈现：中文使用 `## 交接提示词`，英文使用 `## Baton Pass Prompt`）**。标题、描述说明与具体的接单指令必须严格分离，提示词置于独立代码块（```text）中，方便人类一键复制发给接收方 Agent（其后无任何正文）。执行方交付（入站）后，因发起方已挂起后台探针自动唤醒，无需再写回执提示词。
- **对外话术（v2.24.0 · 简洁通俗 · 强制）**：跟用户交代进度与收尾时，让人只读该段即知「谁在做、我这边还动不动」——**禁止机械罗列三要素题头填空**，精简为两行自然人话：①**我方状态**（完成项 + 我方是否还有待办）；②**后续接手**（接手角色 + 后续动作 + 人类是否需介入，如「系统会自动通知，你不用转告」）。**严禁浮夸邀功修辞与「无需转递/已闭环」纯机制缩写**。机器锚点（`## 转递提示词` 节名、`forward`/`deliver` 子命令）不变，勿改名。
- **审计动作契约（v2.13 · to_lane=audit 强制）**：审计方（接收方 to_lane=audit）**严禁仅静态读码**——必须在终端**独立执行**交接文档「验收判据」中的**所有测试与校验命令**，以实测输出为唯一准绳，**严禁采信自报**（执行方回执里的「已通过」一律视为待验证声明，不采信）。其余 lane 亦建议独立实测，但审计 lane 为硬纪律。
- **仓内提示词用自然角色（v2.13）**：同仓提示词**严禁出现项目名 / lane slug 当角色**（如「请 Tappy 收交接」「请 impl lane 收交接」）。出站 = `请【<目标角色>】接单 [<ID>]：<交接路径>（<主题>）`。角色由 lane 映射（impl→实现方 / audit→审计方 / arch·design→架构设计方；`.handoff-hub.json` 的 `lane_labels` 可覆盖）。
- **防提前闭环与双盲审计防伪（v2.16.0）**：回执**必须由接收方 to_lane 独立撰写**——发起方（from_lane）禁止自填回执；`to_lane=audit` 派发时自动签发一次性 `Audit Nonce`，审计回执必须携带 `--audit-nonce "<nonce>"`，硬性拦截同一会话自签；支持 `baton forward --blind` 物理脱敏主观思维链与自辩借口。

**最小操作序列（出站 = 建/发交接 · 强制闭环）**
1. `baton new <target|lane> <type> "<标题>"`（或 `handoff new ...`）并填写正文
2. **转递并挂起后台监听（必须执行）**：
   执行 `baton forward <ID> --wait`（多工单并发聚合监听可执行 `baton wait <id1> [id2 ...] [--any|--all]`；AI 客户端宿主进程树托管；人类终端可用 `--daemon` 脱钩；需双盲脱敏加 `--blind`）
   ——无论同工作区还是跨工作区、内部还是外部客户端，必须启动监听探针（严禁以等不到为由跳过）；交付完成并平息后探针唤醒进行独立验收闭环。
3. **输出交接提示词（末块规范）**：本地 AI 根据用户本地语言自适应输出，标题、描述与独立代码块分离（其后无任何正文）：
   ## 交接提示词
   > 直接复制下方提示词，发送给接收方 Agent 接单：
   ```text
   请【<目标角色>】接单 [<ID>]：<交接路径>（<主题>）
   ```

**最小操作序列（入站 = 接单/回执/交付）**
1. `baton status --for <本方 lane|target>`（冷启动直取本方待办；全量 `baton status` 供发起方巡检）
2. 从「待办」（draft/forwarded）筛选归属当前方（仓内 `to_lane == 当前 lane`；跨仓 = 落在目标收件箱）→ 确认目标 ID
3. `baton show <ID>`
4. 按边界最小改动（仅该 lane 应改文件）
5. 实测全过方写回执：**照抄 `$(lab path handoffs)/RESPONSE-TEMPLATE.md` 骨架** → 运行 `baton receipt <ID> -n "<正文>" --evidence-paths "真实文件,..." --evidence-commits "<sha>"`（或原子复合命令 `baton receipt <ID> --deliver ...` 直达交付）。（若 `to_lane=audit` 须附 `--audit-nonce "<nonce>"`；仓内必附 evidence；无文件改动用 `--evidence-note`；中途受阻仅写 reviews/ 严禁提回执）
6. `baton check`（核验证据与锚节合规，exit 0）
7. **终态交付与会话收尾**：运行 `baton deliver <ID>`（烙印 delivered 并触发平息缓冲后自动唤醒发起方；会话彻底收工结束）。

详见 `$(lab path handoffs)/AGENT-GUIDE.md` 获取完整版 Preflight。
<!-- handoff-stub:v2.1 end -->
