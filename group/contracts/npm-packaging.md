# NPM 打包与分发契约 (NPM Packaging Contract)

## 1. 打包策略定位
本能力库采用 **统一整包分发模式**（Package Name: `reasonweave`，托管于 npm 官方公共仓库 `registry.npmjs.org`）：
- **全家桶开箱即用**：消费方只需安装一个包，即可获得 `reasonweave`、`lab`、`baton`、`lab-skills` 等全套 CLI，以及各 Unit 的全部探针、模板与 AEF 方法论资产。
- **绝不绕过 npm**：全面纳入 npm 生命周期管理，支持 `npm install -g`、`npm update -g`、`npm list -g` 与 `npm uninstall -g`。
- **运行态数据绝对隔离**：严格通过 `package.json` 的 `files` 白名单机制，绝对物理隔离 `units/handoffs/receipts/`、`archive/` 等运行时业务票据和本地历史痕迹。
- **使用者零认证负担**：安装方无需配置任何 PAT、Token 或 `.npmrc`，直接一条命令秒装。

## 2. 核心 CLI 与 Bin 导出

| 命令 | 对应执行入口 | 功能角色 |
|---|---|---|
| `reasonweave` / `lab` / `rw` | `bin/lab.mjs` | 能力库总管命令（`lab init` 全套一键初始化, `lab list`, `lab path <unit>`, `lab doctor`, `lab sync-consumers`） |
| `baton` / `handoff` / `agent-baton` | `units/handoffs/handoff.mjs` | 工作流交接与回执闭环引擎（v2.38.1，身份防御、会话锁与密码学防伪凭据） |
| `baton-worktree` | `units/worktree/worktree.mjs` | 多 Agent 物理工作树隔离调度引擎 |
| `baton-audit-runner` | `units/review-gate/clean-runner.mjs` | 双盲审计自动化独立重跑器 |
| `lab-orphan` | `units/orphan/bin/lab-orphan.mjs` | 全局死代码与孤儿资产清道夫、反未接线联邦门禁 |
| `spec-guard` / `drift-gate` | `units/spec-guard/bin/spec-guard.mjs` | 架构规约与物理接线守卫 CLI（ADR 机器信任根验签、三维热力表） |
| `lab-skills` / `skills` | `units/skills/skills.mjs` | 微观工程原子技能库与上下文零污染切片引擎 |
| `adr-init` | `units/adr/scripts/adr-init.sh` | 架构决策记录引导初始化 |

## 3. 消费方集成模式

### 3.1 全局标准安装与生命周期管理 (推荐)
```bash
# 1. 全局安装（零配置，无需任何 Token）
npm install -g reasonweave

# 2. 全局状态查询
npm list -g reasonweave

# 3. 全局一键升级
npm update -g reasonweave

# 4. 进入任意项目目录，10 秒一键初始化全套规范 (Baton + Preflight + 门禁 + ADR + Backlog + 全客户端桩)
cd /path/to/my-project
lab init
```
- 新项目直接在终端调用 `baton`、`lab` 与 `adr-init`。
- 项目的 `AGENTS.md` 引用规范时，可直接使用动态路径：
  ```markdown
  按 $(lab path preflight)/README.md 接入不变量门禁。
  ```

### 3.2 项目局部安装模式
```bash
npm install -D reasonweave
npx lab doctor
```

## 4. 发布与校验流水线
```bash
# 1. 运行全套门禁
npm test

# 2. 发布到官方 npm (由 CI 自动化或本地执行)
npm publish --access public
```
# 1. 运行自检
npm test

# 2. 预览包内容与体积 (断言无敏感运行态数据，包体积应在 700KB 以内)
npm pack --dry-run

# 3. 发布至 GitHub Packages 私有源
npm publish
```
> CI 自动化：仓库已接入 `.github/workflows/publish-package.yml`，在发布 GitHub Release 或手动派发时自动完成构建与推包。
