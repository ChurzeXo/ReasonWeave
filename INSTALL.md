# Lab Agent Toolkit — 安装与环境配置指南 (Installation Guide)

本文档面向拿到源码压缩包或 Git 仓库的使用者（或开源贡献者），帮助你在 1 分钟内完成全仓库的安装、CLI 工具链接与环境自检。

---

## 1. 系统前提要求 (Prerequisites)

在开始安装前，请确保你的系统满足以下基础环境：

| 工具 | 最低版本要求 | 作用说明 | 验证命令 |
|---|---|---|---|
| **Node.js** | `>= 18.0.0` (推荐 20+) | `lab` 和 `handoff` CLI 引擎运行环境 | `node -v` |
| **Git** | `>= 2.20.0` | 版本控制与门禁 hooks 基础支持 | `git --version` |
| **OpenGrep** *(可选)* | 最新版本 | `review-gate` 静态代码安全扫描 (L1) | `opengrep --version` |

> 💡 **提示**：如果未安装 `opengrep`，门禁工具采取 `fail-open`（仅告警不阻断），基础的 `lab`、`handoff`、`preflight`、`adr` 等所有核心能力均不受影响。需要 SAST 扫描时可随时安装：
> - **macOS (Homebrew)**: `brew install opengrep` 或从 [OpenGrep Releases](https://github.com/opengrep/opengrep/releases) 下载二进制放到 PATH。

---

## 2. 快速安装 (Installation)

### 推荐方式：一键全局链接 (npm link)

将本仓库解压到你希望放置的目录（例如 `~/Documents/lab` 或任意自定义路径），进入仓库根目录运行：

```bash
cd /path/to/lab
npm link
```

运行后，npm 会自动将本库注册到全局，并在你的系统 PATH 中创建以下三大命令行工具：
- 🌐 `lab`：能力库总管、环境体检、路径解析与 ZSpec 项目脚手架
- 🔄 `handoff`：多 Agent / 多仓库 / 仓内工作流交接中枢与防伪回执引擎
- 📐 `adr-init`：架构决策记录 (ADR) 快速引导初始化脚本

> 💡 **如果没有全局写权限或不想使用 npm link：**
> 你也可以直接将 `bin` 与 `units/handoffs` 所在路径加入你的终端 PATH 中，例如在 `~/.zshrc` 或 `~/.bashrc` 添加：
> ```bash
> export PATH="$HOME/Documents/lab/bin:$HOME/Documents/lab/units/handoffs:$PATH"
> ```

---

## 3. 验证安装 (Health Check)

在任意终端窗口中运行自检命令：

```bash
lab doctor
```

如果输出如下，说明安装成功并已就绪：

```text
🔍 正在检查环境依赖:

  ✅ Node.js (>=18)              : v20.x.x
  ✅ Git                         : git version 2.x.x
  ✅ OpenGrep (review-gate L1)   : 1.x.x (或 ⚠️ 未安装)
```

随后检查 `handoff` 命令是否可用：

```bash
handoff --help
```

若能正常输出帮助手册，说明所有 CLI 均已配置完成。

---

## 4. 常用命令速查 (Quick Reference)

### 4.1 能力库总管 `lab`

```bash
lab list                  # 列出所有可用工程能力 Unit (handoffs, preflight, etc.)
lab path                  # 获取当前 lab 仓库的根目录绝对路径
lab path <unit>           # 获取特定 Unit 的绝对路径 (如: lab path handoffs)
lab doctor                # 检查 Node、Git、OpenGrep 环境
lab zspec init "<项目名>"  # 为你的新项目一键初始化 ZSpec / AEF 工业级架构骨架
lab zspec add-unit <端名> # 为多端项目新增工程端 (如: ios, android, backend)
lab zspec guide           # 查看面向 AI Agent 的 ZSpec 实施规范
lab migrate [目标项目路径] # 将老项目中硬编码的路径一键平滑迁移为动态规范
```

### 4.2 工作流交接中枢 `baton`（别名 `handoff`）

```bash
baton link                 # 自动检测并自愈本机的 baton / handoff PATH 软链接
baton status               # 查看当前活跃的交接单与待办状态（五态生命周期）
baton status --for <角色>  # 冷启动直取属于本方待办的任务单 (draft/forwarded)
baton new <目标> <类型> "<标题>"   # 创建新的交接单 (task/bug/feature/question)
baton forward <ID> --wait          # 转递交接单并挂起后台监听（到达后平息缓冲并 Exit 0 唤醒）
baton receipt <ID> -n "<回执正文>" --evidence-paths "文件,..." # 登记回执（状态翻为 received）
baton check                # 校验回执证据、锚节与接入桩合规性 (exit 0)
baton deliver <ID>         # 执行方终态交付并翻 delivered（触发平息缓冲后唤醒发起方）
baton accept <ID> -n "<验收结论>"  # 发起方独立实测后审计闭环 (closed)
```

### 4.3 架构决策记录 `adr-init`

```bash
adr-init <项目目录> <档位: light|standard|frozen> "<项目名>"
```

---

## 5. 在你的项目中接入能力库

接入能力库非常简单，**规范以单一事实源存在于本库，项目里只放动态指针，绝不复制代码**：

1. **新项目全新初始化（推荐）**：
   在你的项目根目录运行：
   ```bash
   lab zspec init "My Project"
   ```
   它会自动为你生成宪法 `constitution.md`、共享事实层 `group/`、规格区 `specs/` 以及标准门禁配置。

2. **给 AI Agent（Cursor、Claude、Windsurf 等）注入能力**：
   在项目根目录的 `AGENTS.md` 或系统提示词中引用对应的单元规范：
   ```markdown
   按 $(lab path preflight)/README.md 接入不变量门禁。
   按 $(lab path adr)/README.md 记录架构决策。
   ```

更多详细教程请参考 [使用说明.md](使用说明.md) 与 [docs/CONSUMER-PROMPTS.md](docs/CONSUMER-PROMPTS.md)。
