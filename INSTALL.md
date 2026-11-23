# ReasonWeave (formerly Lab Agent Toolkit) — 安装与升级指南 (Installation & Upgrade Guide)

> 面向拿到源码压缩包 / Git 仓库的使用者与消费方 Agent：首次安装约 1 分钟（§2）；**已装过旧版本请先读 §4「升级」**，本次有一步必做且容易漏。
> 能力库采用「单一事实源 + 动态指针」模型：规范只存本库，项目里只放 `$(lab path <unit>)` 指针，**不复制规则正文**。

---

## 0. 当前版本快照（2026-11-22）

| 组件 | 版本 | 备注 |
|---|---|---|
| **Agent Baton / handoffs** | **v2.38.1** | 接入桩统一 (sha: `efc4fb85`)；支持 Rule 8 分级 SDD 验收与负向测试先行证明 (ADR-0012)、`--profile readonly` 生产源码写保护物理硬门禁、Windows 换行与转义归一化、cmdWait 平息自愈交付、密码学审计凭据防伪 |
| **spec-guard / drift-gate** | **v2.2.1** | 架构规约与物理接线守卫（ADR-064 机器信任根验签、三维热力表、约定阈值解耦、增量感知门禁、支持 `--version` / `-v` 动态对齐） |
| **preflight** | **v1.1.0** | 仓库不变量探针（A1~A5 配置化对账防漂移、工程落地指引） |
| **orphan** | **v1.4.2** | 全局死代码与孤儿资产清道夫（ADR-0009 / ADR-0011 / ADR-0013）：S1–S3 求解器、L1/L2/L3 正交解耦、新增 `check-deps [--strict]` 孤儿依赖求解器与 `scan-secrets [--strict]` 零调用假凭证探针、支持 `--version` / `-v` 动态对齐 |
| **worktree** | v0.1.0 | 多 Agent 物理工作树隔离调度（动态对齐 `VERSION.md`，支持 `--version`） |
| **review-gate** | **v1.2.2** | SAST + 双盲审计独立重跑器（ADR-0011 / ADR-0012 / ADR-0013）：`scan.sh --no-suppress` 穿透扫描、OpenGrep 原生模式对称注入 `engine: "opengrep"` 结构化元数据、Ruff Bandit 诚实降级、macOS bash 3.2 兼容自愈 |
| **specs / playbook** | — | Spec Kit 活文档模板全集 (`specs/templates/` 01-research 到 05-evidence) 与 RePPIT 五步工程闭环手册 |
| **adr / backlog** | v1.0.1 / v1.2.0 | 架构决策记录 (ADR-0011 ~ ADR-0014 🔒Frozen)、待办捕获跟踪 (Backlog 12 ~ 15) |

> 版本事实源 = `units/<unit>/VERSION.md` 与 `$(lab path handoffs)/README.md`。
> `package.json` 当前为 `1.3.1`（随全局能力演进做 minor/patch 递增，便于下游对齐基线）；本机仍是**单一 lab 仓 + 软链 / 动态指针**模型，没有 submodule 或 commit 钉值，lab 仓更新后软链自动指向最新。

---

## 1. 系统前提要求 (Prerequisites)

| 工具 | 最低版本 | 作用 | 验证命令 |
|---|---|---|---|
| **Node.js** | `>= 18.0.0`（推荐 20+） | 全部 CLI 引擎运行环境 | `node -v` |
| **Git** | `>= 2.20.0` | 版本控制、门禁 hooks、worktree 隔离 | `git --version` |
| **OpenGrep**（可选） | 最新版本 | `review-gate` 静态代码安全扫描 (L1) | `opengrep --version` |

> 引擎为纯 Node 原生模块，**零第三方生产依赖**。未装 `opengrep` 时门禁 fail-open（仅告警不阻断），`lab`、`baton`、`preflight`、`adr` 等核心能力不受影响；macOS 可用 `brew install opengrep`。

---

## 2. 首次安装 (Installation)

### 2.1 模式 A：NPM 全局分发安装（小白推荐 · 30 秒开箱即用）
无需克隆本能力库源码，在任意终端执行：
```bash
npm install -g reasonweave
```
验证安装：
```bash
reasonweave doctor
```

### 2.2 模式 B：源码开发者模式（克隆本库 + 全局 npm link）
将仓库解压 / 克隆到任意目录（例如 `~/Documents/lab`），在仓库根目录运行：

```bash
cd /path/to/lab
npm link
```

`npm link` 会按 `package.json` 的 `bin` 字段一次性注册以下 CLI（**新增 CLI 只在这一步生成 shim**）：

| CLI | 作用 |
|---|---|
| `reasonweave`（别名 `lab`, `rw`） | 能力库总管、`lab init` 全套一键初始化、路径动态解析、环境体检 (`lab doctor`)、ZSpec 脚手架、下游一键批量同步分发 (`sync-consumers`)、全量转发核心工具 (v1.3.1，支持 `--version`) |
| `baton`（别名 `agent-baton` / `handoff`） | 跨仓 / 仓内任务交割中枢、统一会话ID、防跨会话硬门禁、会话锁、密码学防伪回执、事件驱动唤醒（v2.38.1） |
| `baton-worktree` | 为工单分配 / 回收独立物理工作树（v0.1.0，支持 `--version`） |
| `baton-audit-runner` | 无上下文独立进程重跑验收测试，真实 Exit 0 方可签发回执（v1.2.2，支持 `--version`） |
| `lab-orphan` | 死代码与孤儿资产清道夫（v1.4.2，支持 `--version`，也可 `lab orphan <cmd>`） |
| `spec-guard`（别名 `drift-gate`） | 架构规约与物理接线守卫、ADR 机器信任根验签、三维热力表（v2.2.1，支持 `--version`） |
| `adr-init` | 架构决策记录 (ADR) 三档脚手架 |

> **无全局写权限时**：把 `bin` 与 `units/handoffs` 加入 PATH，例如 `export PATH="$HOME/Documents/lab/bin:$HOME/Documents/lab/units/handoffs:$PATH"`；`baton link` 会自愈 `baton` / `handoff` 的 shim 到 `~/.local/bin`。

---

## 2.3 新项目引入 AEF 规范（面向小白 · 10 秒一键初始化）

在任意新老业务项目根目录中，只需运行一条命令：

```bash
cd /path/to/your-project
lab init
```

脚手架全自动非破坏性完成以下 7 项配置，无需任何手动繁琐配置：
1. **最高宪法与业务事实源**：自动生成 `constitution.md`、`group/product/intent.md`、`group/architecture/dependency-graph.md` 与 `group/contracts/api.md`。
2. **多 AI 客户端全覆盖**：自动生成 / 更新 `AGENTS.md`、`CODEBUDDY.md` (WorkBuddy)、`.cursorrules` (Cursor)、`.github/copilot-instructions.md` (Copilot) 并一键注入 Baton 接入桩。
3. **工作流交接中枢**：自动初始化 `.handoffs/` 目录结构与 `.handoffs/.handoff-hub.json` 仓内配置。
4. **仓库不变量探针**：自动安装 `scripts/preflight.sh` 与开箱即用的 `preflight.conf`。
5. **Git 物理门禁自动激活**：自动生成 `.githooks/pre-commit` 分发器与 `20-preflight`、`30-orphan-guard`，并自动执行 `git config core.hooksPath .githooks`。
6. **架构决策记录 (ADR)**：自动初始化 `docs/adr/INDEX.md`、起步决策 `0001-bootstrap.md` 与规范模板。
7. **待办捕获机制 (Backlog)**：自动就绪 `docs/backlogs/IRONRULES.md` 与单任务单文件模板。

### 2.4 Windows 平台专属说明 (Windows Setup & Best Practices)

Baton 引擎与 Lab 工具链对 Windows (10/11) 提供了原生跨平台兼容与免配置支持：

1. **终端推荐**：
   - **PowerShell (推荐)** 或 **Windows Terminal**：原生支持所有 `baton`、`lab` 子命令及 `$(lab path <unit>)` 动态路径展开语法。
   - **Git Bash**：完全兼容 POSIX shell 语法与 `preflight.sh` 提交门禁。
   - **CMD**：支持 `baton` 与 `lab` 核心命令（动态路径建议直接写绝对路径或使用 PowerShell）。
2. **免管理员权限 CLI 注册**：
   - 在 Windows 上以普通用户权限运行 `npm link`，npm 会自动在 `%APPDATA%\npm\` 目录生成 `baton.cmd`、`baton.ps1`、`lab.cmd` 等 Windows 脚本包装。
   - 若不使用 `npm link`，运行 `node units/handoffs/handoff.mjs link` 亦会自动为当前用户生成 `.cmd` 与 `.ps1` 启动脚本，**无需开启 Windows 开发者模式 (Developer Mode) 或管理员权限**。
3. **换行符 (CRLF vs LF) 无感兼容**：
   - 引擎内置了完整的双换行（CRLF `\r\n` 与 LF `\n`）正则自动解构。无论 Windows 下 Git 的 `core.autocrlf` 设置为 `true`、`false` 还是 `input`，工单的 frontmatter 识别、状态判定与正文提取均 100% 稳健运行。
4. **桌面系统通知**：
   - 在 Windows 上，工单交付（Yellow Interrupt）与系统阻断（Red Interrupt）会自动调用 Windows 原生托盘气泡通知 (NotifyIcon / Toast)，无需安装第三方通知插件。

---

## 3. 验证安装 (Health Check)

```bash
lab doctor        # Node / Git / OpenGrep 环境体检
baton doctor      # 引擎版本 + shim 指向 + 各载体接入桩版本一致性（等价于 baton link --check）
baton --help      # 确认交接引擎可用
baton check       # 交接 / 回执合规自检（exit 0 = 合规）
```

`baton doctor` 期望输出：`✅ [桩版本一致] ... 桩版本 == 引擎版本 (v2.38.1)`。
仓内还有全量回归自检：`npm test`（Node 内置 test runner，无额外依赖，含全 CLI 物理契约门禁）。

---

## 4. 升级：已安装老版本的消费方（本次必读）

### 4.0 一键全自动批量同步（强烈推荐）

在 `lab` 根目录下运行一条命令，全自动完成本地 `npm link` 刷新、扫描同级目录或指定路径下的全部消费仓、刷新接入桩 (`baton install`) 与一致性检查 (`baton doctor`)、就绪 `spec-matrix.overlay.yml` 并执行全仓合规自检 (`baton check`)：

```bash
lab sync-consumers      # 或 npm run sync:consumers
# 若消费仓分布在其他目录：
lab sync-consumers /path/to/parent_dir
```

---

### 4.1 为什么必须做两件事（手动逐仓升级原理）

1. **重跑 `npm link`**：本轮新增了 `agent-baton`、`lab-orphan`、`spec-guard`、`drift-gate`、`baton-worktree`、`baton-audit-runner` 等 bin。全局 bin shim 只在 `npm link` 时生成，旧的软链不会凭空多出新命令。
2. **重跑 `baton install`**：接入桩正文已演进至最新版本（契约 v2.38.1），桩 sha 为 `efc4fb85`。旧桩留在 `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` / `README.md` 及全局载体里，`baton link --check` 会判「桩版本漂移」并 **exit 1**，Agent 也会继续按过期工作流行动。

> 对比 v2.22.0 那次「下游零文件改动」：那轮没动桩正文；**这轮动了，所以逐仓重刷是硬要求**。

### 4.2 上游 lab 仓（整台机器做一次）

```bash
cd /path/to/lab
git pull --ff-only        # 或重新解压覆盖到同一目录
npm link                  # 重跑，刷新全部 bin shim
lab doctor && baton doctor
npm test                  # 可选：全量回归，确认引擎无损
```

### 4.3 每个消费方仓（逐仓根目录执行）

```bash
baton install             # 幂等：刷新项目载体 + 全局载体的接入桩
baton link --check        # 必须 RC=0，且显示 v2.38.1 桩版本一致
baton check               # 本仓交接 / 回执合规自检
```

- `baton install` 默认写 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md`（若已存在）、`README.md`，外加全局载体 `~/.claude/CLAUDE.md`、`~/.config/opencode/AGENTS.md`；只刷项目用 `--project`，只刷全局用 `--global`，不写 README 用 `--no-readme`，指定语言用 `--lang zh`。
- 带接入桩的载体只需**重刷一次**，重复执行返回「已是最新」；`baton link`（不带 `--check`）检测到漂移也会自动重生成当前项目的桩。
- 无桩的消费方仓不必刻意新建桩；`baton link --check` 会显示「未发现接入桩，跳过桩版本判定」并 RC=0。

### 4.4 升级注意事项（踩过的坑）

- **不要覆盖消费方定制模板**：项目里 `review-gate/scan.sh`、`scripts/preflight.sh` 等副本多为项目定制（RULESETS、校准值），只要已用动态指针就**不要用 lab 源模板覆盖**。
- **`lab migrate --help` 不是只读帮助**，会立即执行单向有损替换；查用法请读 `bin/lab.mjs`，预览只能用 `lab migrate <dir> --dry-run`，且不要在 lab 仓根执行。
- **字段归一化**：同跨仓数据模型统一为 `needs_change`，引擎对历史 `needs_iggle_change` 透明向下兼容；若消费方有脚本自行解析该字段，需自行核对。
- **别在 AGENTS.md 正文写死 `契约 vX.Y.Z`**：`baton doctor` 用正则抓载体里第一个 `契约 v<版本>` 与引擎比对；正文残留旧版本号会让升级后误判「桩版本漂移」。版本串只留在标准接入桩内，正文只放动态指针。
- **行为变化**：写操作全面支持 `--as <lane>` 显式身份；`reject` / `reopen` 享无条件下车通道；`receipt --deliver` 一步直达终态交付；审计工单须带 `--audit-nonce`（用 `baton show <id> --nonce` / `baton nonce <id>` 取令牌）；`baton check <id> --fix` 可修复历史 `needs_change` 漂移。细则以 `$(lab path handoffs)/README.md` 契约为准。
- **新单元按需接入**：`orphan`、`spec-guard` 的门禁模板属于可选增强，不是升级必做项；接入用 `$(lab path orphan)/README.md`、`$(lab path spec-guard)/README.md` 指针，不复制正文。其中 `orphan v1.3.0` 的 `AGENTS.md`（`<= 12` 行）/ `GEMINI.md`（`<= 6` 行）反假接线路径映射**仅在已有真实业务代码的下游项目仓创建，一般由消费方 Agent 探测本仓真实路径后写入**；全局安装/升级 `lab-agent-toolkit` 或 0 代码空目录无需创建。

---

## 5. 常用命令速查 (Quick Reference)

### 5.1 能力库总管 `lab` (v1.3.1)

```bash
lab --version                   # 打印当前 Toolkit 引擎版本
lab list                        # 列出全部 9 个工程单元
lab path [unit]                 # 动态解析 Unit / lab 根绝对路径
lab doctor                      # 防御性环境体检（包含 Node/Git/OpenGrep 候选目录嗅探与各 Unit CLI 完备性）
lab sync-consumers [dir]        # 一键批量同步与体检所有下游消费仓（自动 link、刷桩与体检）
lab orphan <cmd>                # 死代码与孤儿资产清道夫（等价 lab-orphan）
lab spec-guard <cmd>            # 规约守卫（等价 spec-guard / drift-gate）
lab migrate [dir] --dry-run     # 预览硬编码路径迁移（不带 --dry-run 即真写）
lab zspec init "<项目名>"        # 新项目初始化 ZSpec / AEF 架构骨架
lab zspec add-unit <端名>       # 新增工程端
lab zspec guide                 # 面向 Agent 的 ZSpec 实施规范
```

### 5.2 交接中枢 `baton`（别名 `handoff`，v2.38.1）

```bash
baton status [--for <lane|target> | --as <lane|target>]   # 待办入口（两者等价；加 --active 聚焦活跃）
baton lane [<lane>|--clear]     # 绑定/清空当前终端会话身份锁，防跨角色漂移
baton show <id> [--nonce]       # triage 摘要；审计工单取防伪令牌
baton new <target|lane> <type> "<标题>" [--workspace worktree]
baton forward <id> [--async] [--wait] # 转递并挂起监听；支持多工单批量派发与聚合监听
baton wait <id1> [id2 ...] [--any|--all]                  # 多工单聚合监听
baton receipt <id> -n "<正文>" --deliver --as <lane> --evidence-paths "真实文件,..." [--auto-nonce]
baton deliver <id> --as <lane> # 终态交付（唤醒发起方独立验收，校验结论硬锚点与 HMAC 凭据）
baton reject <id> -n "<理由>" --as <lane>                # 受阻 / NO-GO 安全下车（轮次唯一自增点）
baton accept <id> -n "<结论>" --as <lane>                # 发起方独立实测后闭环
baton reopen <id> -n "<理由>"  # 误闭环重开
baton nonce <id> [--reissue]   # 查看 / 重签 Audit Nonce
baton check [id] [--fix]       # 全库或单工单合规体检
baton throttle <id> -- <cmd>   # 静默管道跑长任务
baton install / baton link / baton doctor                # 接入桩 / shim / 一致性诊断
```

### 5.3 隔离、审计与新单元

```bash
baton-worktree allocate <id>            # 分配隔离工作树；list / status / prune / clean-all
baton-audit-runner run <id> --auto-receipt   # 无上下文重跑验收，Exit 0 才签发回执
lab orphan test-solver                 # S1–S3 求解器自检
lab orphan scan [--stack auto|android|python|web] [--out candidates.json]
lab orphan check-diff --staged         # 增量提交门禁
lab orphan clean --dry-run             # 安全清理（只读 Git HEAD）
spec-guard check --full                # 全景三维热力表（断言 ↔ 证据 ↔ 接线）
spec-guard check --incremental         # 暂存区增量感知（<0.05s 放行）
spec-guard verify-evidence [ADR-ID]    # 校验实测数据机器签名与凭据完整性（ADR-064 机器信任根）
spec-guard check-wiring [ADR-ID]       # 探测决策在生产代码中的真实接线（拦截孤儿决策）
spec-guard audit-adr ADR-060 [--out report.md]
spec-guard mutate --file <file> --cmd "<test-command>"
adr-init <项目目录> <light|standard|frozen> "<项目名>"
```

---

## 6. 在你的项目中接入能力库

规范只在本库，**项目里只放动态指针 + 一句指令**：

1. **全新项目**：在项目根运行 `lab zspec init "<项目名>"`，自动生成 `constitution.md`、`group/`、`specs/` 与门禁配置。
2. **给 AI Agent 挂载纪律**：在 `AGENTS.md` 中写指针，例如
   ```markdown
   按 $(lab path preflight)/README.md 接入不变量门禁。
   按 $(lab path adr)/README.md 记录架构决策。
   按 $(lab path handoffs)/README.md 执行任务交割（细则以该文件为准，勿在正文写死版本号）。
   ```
3. **升级 / 排障 / 逐场景可复制提示词**：见 [docs/CONSUMER-PROMPTS.md](docs/CONSUMER-PROMPTS.md)（场景五 = 已接入消费方升级安装）。
4. **详细使用指南**：[使用说明.md](使用说明.md)；交接权威细则：`$(lab path handoffs)/AGENT-GUIDE.md` 与 `COMMANDS.md`。
