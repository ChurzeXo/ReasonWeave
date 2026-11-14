# Lab — Agent 工程能力库 (Agent Engineering Toolkit)

> 一套**可复用的 Agent / AI 辅助工程纪律机件与规范全集**（采用 ZSpec / AEF v1.0 架构）。  
> 每个模块独立、正交，按需挑选接入项目；规范以「单一事实源」方式集中在本库，项目里只放**动态指针 + 一句指令**，规范不内联、不漂移。

---

## 快速导航

- 📥 **安装与配置手册**：👉 [INSTALL.md](INSTALL.md)（1 分钟快速上手；§4 为老版本升级必读）
- 📋 **消费方接入与改造提示词大全**：👉 [docs/CONSUMER-PROMPTS.md](docs/CONSUMER-PROMPTS.md)（新项目接入 / 老项目平滑改造 / **场景五：升级安装**，直接复制给 AI 即可使用）
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

运行后，系统全局即可直接使用以下核心 CLI 工具链（`package.json` 的 `bin` 字段为唯一清单）：

| CLI | 作用 |
|---|---|
| 🌐 `lab` | 能力库总管、环境体检、路径动态解析、ZSpec 脚手架，转发 `orphan` / `spec-guard` |
| 🔄 `baton` / `agent-baton` / `handoff` | 工作流交割中枢、防伪回执、静默管道与事件唤醒（Baton v2.29.0） |
| 🌳 `baton-worktree` | 基于 Git Worktree 的多 Agent 物理目录隔离调度引擎 |
| 🛡️ `baton-audit-runner` | 双盲审计自动化运行器（无上下文独立重跑测试，Exit Code 真实裁决） |
| 🧹 `lab-orphan` | 全局死代码与孤儿资产清道夫（S1–S3 求解器、增量提交门禁，v1.1.0） |
| 🛡️ `spec-guard` / `drift-gate` | 架构漂移与规约守卫（P3' 三元映射对账、变异敏感度，v1.1.0） |
| 📐 `adr-init` | 架构决策记录 (ADR) 快速引导初始化 |

> 💻 **Windows 用户提示**：支持 Windows 10/11 原生免配置运行。推荐使用 **PowerShell** 或 **Windows Terminal**（原生支持 `$(lab path <unit>)` 动态路径）；`npm link` 会自动注册 `.cmd` 与 `.ps1` 包装，无需开启开发者模式或管理员权限；换行符 CRLF `\r\n` 与托盘气泡通知已在底层 100% 原生适配。详见 [INSTALL.md §2.1](INSTALL.md)。

> **已装过旧版本？** 本轮新增了多个 bin，且接入桩正文已变更（sha `1d843498` → `ca438a6f`）。升级必须：①在 lab 仓重跑 `npm link`；②在每个消费方仓根跑 `baton install` + `baton link --check`。详见 [INSTALL.md §4](INSTALL.md) 与 [消费方升级提示词](docs/CONSUMER-PROMPTS.md)（场景五）。

### 3. 环境自检 (Doctor)
在终端执行自检，确认依赖就绪：

```bash
lab doctor        # Node / Git / OpenGrep
baton doctor      # 引擎版本 + shim 指向 + 接入桩版本一致性（等价 baton link --check）
baton check       # 交接 / 回执合规自检
npm test          # 可选：全量回归
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

### 2. `baton` / `handoff` — 任务交割与注意力节流引擎 (v2.29.0)
> **跨仓/同仓 Agent 间任务交割像调 API 一样无损直达**  
> 拒绝人肉传话与上下文衰减。一条命令穿透仓库边界，接口与协作契约严密对齐，独立窗口双盲审计，事件驱动无感闭环。

五态生命周期 `draft → forwarded → received → delivered → closed`；支持物理工作树隔离（`--workspace worktree`）、静默管道（`throttle`）、双盲脱敏（`--blind`）、审计防伪 Nonce、显式身份 `--as <lane>`、受阻无条件下车（`reject`）与 0-Token 后台唤醒（`--wait`）：
```bash
baton status --as <lane|target>     # 冷启动直取本方待办（等价 --for）
baton new <目标> <类型> "<标题>" [--workspace worktree]
baton forward <ID> --wait           # 转递并挂起监听；严禁以「外部客户端等不到回执」为由跳过
baton show <ID> --nonce             # 审计工单取防伪令牌；baton nonce <ID> --reissue 重签
baton receipt <ID> -n "<正文>" --deliver --as <lane> --evidence-paths "真实文件,..."
baton deliver <ID> --as <lane>      # 执行方终态交付并翻 delivered
baton reject <ID> -n "<理由>" --as <lane>   # 实测未过 / 受阻：直接退回整改
baton accept <ID> -n "<结论>" --as <lane>   # 发起方独立实测后闭环（close 为同义别名）
baton check [ID] [--fix]            # 闭环状态、回执证据与 needs_change 漂移核验
baton install / baton doctor        # 刷新接入桩 / 校验桩版本 == 引擎版本
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
| **spec-guard** | [`units/spec-guard/`](units/spec-guard/) | 全局架构漂移与规约守卫（v1.1.0），P3' Invariant ↔ Assertion ↔ Code 三元映射对账，变异敏感度自检，防半山腰挂起与装饰性接线 |
| **orphan** | [`units/orphan/`](units/orphan/) | 死代码与孤儿资产清道夫（v1.1.0），只读 Git HEAD + S1–S3 求解器自检 + 增量提交门禁 |
| **backlog** | [`units/backlog/`](units/backlog/) | 待办捕获：越界 / 待拍板 / 未来功能，一任务一文件，不打断当前工作流 |
| **preflight** | [`units/preflight/`](units/preflight/) | 仓库不变量探针 + Git 提交门禁（v1.1.0），A1~A5 探针（含单一事实源与派生状态防漂移对账），防止“做完才发现还有一件事” |
| **review-gate** | [`units/review-gate/`](units/review-gate/) | 本地 SAST 扫描 (OpenGrep) + review 门禁 + 双盲审计自动化重跑器 (`baton-audit-runner`) |
| **handoffs** | [`units/handoffs/`](units/handoffs/) | 跨仓 / 同仓任务交割中枢（Agent Baton v2.29.0），显式身份 `--as`、审计防伪 Nonce、无条件下车、五态状态机与事件唤醒 |
| **worktree** | [`units/worktree/`](units/worktree/) | 基于 Git Worktree 的物理目录隔离调度引擎，为多 Agent 并发分配独立沙盒并智能共享依赖缓存 |
| **playbook** | [`units/playbook/`](units/playbook/) | Agent Engineering Framework (AEF) 完整方法论手册与模板库 |

> **向后兼容保证**：根目录下保留了指向各 Unit 的软链接（`adr`、`preflight`、`handoffs`、`orphan`、`spec-guard` 等），无论通过 `$(lab path <unit>)` 还是旧绝对路径均可无缝兼容。
> **版本以各 Unit 的 `VERSION.md` 为准**；`lab list` 可随时列出全部 9 个单元。

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
- 提交门禁：按 $(lab path preflight)/README.md 执行不变量检查（支持通过 preflight.conf 配置 A5 事实源对账防漂移）。
- 代码质量：按 $(lab path review-gate)/README.md 执行提交前安全扫描。
- SSOT 铁律：动任何“种子/默认值/派生镜像/配置”前必认单一事实源，改源与迁移脚本必须同 commit 提交。
```

### 场景 C：多 Agent / 多端跨仓协作
多个 Agent 各自独立工作，不直接修改对方代码，通过 `handoff` 离线派发与证据回执闭环。详见 [units/handoffs/AGENT-GUIDE.md](units/handoffs/AGENT-GUIDE.md)。

### 场景 D：已接入的消费方升级到最新版
lab 仓更新后引用自动指向最新（软链模型），但**新增 CLI 的 shim** 与**接入桩正文**不会自动刷新：

```bash
# lab 仓（一次）
cd /path/to/lab && git pull --ff-only && npm link && lab doctor && baton doctor

# 每个消费方仓根
baton install && baton link --check && baton check
```

可直接复制给消费方 Agent 的完整升级提示词见 [docs/CONSUMER-PROMPTS.md 场景五](docs/CONSUMER-PROMPTS.md)；升级坑位与命令差异见 [INSTALL.md §4](INSTALL.md)。

---

## 🔒 纯净能力库说明 (Clean Distribution)

为了保护用户隐私与控制分发体积，本仓库的分发与压缩包严格遵循以下纪律：
- **运行态数据物理隔离**：不包含任何本机的交接票据、回执与审查历史（`handoffs/`、`receipts/`、`archive/` 等在使用时会自动按需创建）。
- **零脏文件**：已排除所有 `.git/`、`.DS_Store`、`.workbuddy/` 缓存与本地开发日志。
- 开箱即可直接打包分发（`npm pack` 或 `zip`），开箱即用。

---

<!-- handoff-stub:v2.1 begin -->
<!-- generated — do not edit -->
<!-- stub:sha256:ca438a6f -->
### Agent Baton (Handoff) 接入桩（轻量韧性版 · 细则以 $(lab path handoffs)/README.md 契约 v2.29.0 为准）

**核心守卫与身份（强制）**
- **物理工作区边界**：会话严格绑定当前宿主工作区，严禁跨仓 cd 操作外部代码；跨仓请输出交接提示词引导人类在目标仓 Agent 会话中派发。
- **命令形态与显式身份**：一律 `baton <op>` 或 `handoff <op>`。全面支持 `--as <lane>` 显式声明执行身份，同一会话内可无缝切换角色并发处理多工单。
- **确定性自愈**：校验细节（Nonce、证据路径、数据一致性）由 CLI 运行时精准拦截；若命令报错，末尾 100% 打印可直接复制的一键自愈命令，按提示执行即可恢复。

**入站工作流（接单 · 交付 · 退回）**
1. **查待办**：运行 `baton status --as <本方 lane|target>`（直取本方未闭环待办工单，或全量 `baton status`）。
2. **读工单**：运行 `baton show <id>`，根据验收判据改动本 lane 范围代码并实测。
3. **交付或退回（实测为唯一准绳）**：
   - **实测通过**：照抄 `$(lab path handoffs)/RESPONSE-TEMPLATE.md` 骨架 → 运行 `baton receipt <id> -n "<正文>" --deliver --as <本方 lane> --evidence-paths "<真实文件路径>"`（审计工单附 `--audit-nonce "<nonce>"`）。
   - **实测未过（NO-GO/受阻）**：享有【无条件安全下车通道】，直接运行 `baton reject <id> -n "<驳回理由/缺失条件>" --as <本方 lane>` 退回整改（中间受阻回执亦可直接无阻碍登记）。
4. **收尾自检**：运行 `baton check [id]`（若有数据漂移可加 `--fix` 自动修复）。

**出站工作流（派发 · 监听）**
1. **建单与转递**：`baton new <target|lane> <type> "<标题>"`，填写正文后执行 `baton forward <id> --wait`（挂起后台监听；交付完成并平息后自动唤醒验收）。
2. **回复收尾（交接提示词规范）**：出站回复最末块必须固定为独立代码块，方便人类一键复制给接收方 Agent（其后无任何正文）：
   ## 交接提示词
   ```text
   请【<目标角色>】接单 [<ID>]：<交接路径>（<主题>）
   ```

详见 `$(lab path handoffs)/AGENT-GUIDE.md` 获取完整版 Preflight。
<!-- handoff-stub:v2.1 end -->
