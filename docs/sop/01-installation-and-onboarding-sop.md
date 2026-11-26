# SOP-01: ReasonWeave 全仓初始化与业务仓接入标准作业程序

**版本**：v1.0  
**适用范围**：全新开发机配置、CI/CD 流水线构建、以及为下游业务项目（消费方仓库）接入 ReasonWeave 能力库。  
**关联宪法**：[`constitution.md`](file:///Users/churze/Documents/lab/constitution.md) P1, P4, T1, T10

---

## 阶段一：能力库宿主仓就绪（Lab Host Setup）

> 适用场景：在本地开发机或构建机上首次拉取 `ReasonWeave` 源码仓，建立全局能力中枢。

### 1. 前置依赖检查 (Input Verification)
在终端执行以下检查，确保基础环境达标：
```bash
node -v          # 要求 >= 18.0.0 (推荐 Node 20+)
git --version    # 要求 >= 2.20.0
```
- **判定标准**：两项命令均正常打印版本且高于基线。
- **异常自愈**：若版本过低，使用 `nvm install 20` 或包管理器升级。

### 2. 初始化权限与环境准备 (Execution)
进入 `ReasonWeave` 仓库根目录：
```bash
cd ~/Documents/lab   # 或你的克隆路径
npm run postinstall  # 为 bin/ 及各 unit 脚本赋予物理执行权限 (+x)
```

### 3. 全局 CLI 软链注册 (Global Registration)
选择以下模式之一：
- **模式 A（本地源码开发模式 · 推荐）**：
  ```bash
  npm link
  ```
- **模式 B（NPM 官方包模式）**：
  ```bash
  npm install -g reasonweave
  ```

### 4. 宿主健康度核验 (DoD Verification)
在任意空目录执行体检命令：
```bash
lab doctor
```
- **完成判定 (DoD)**：
  - Node.js、Git 显示绿色对勾；
  - 核心 CLI（`baton`, `lab-orphan`, `spec-guard`, `baton-worktree`, `lab-skills`）均处于就绪状态。
- **异常自愈**：若提示某命令未找到，检查 `npm bin -g` 是否已加入系统 `PATH`。

---

## 阶段二：下游业务仓一键接入（Consumer Project Onboarding）

> 适用场景：将 ReasonWeave 的研发纪律机件挂载到任意具体的业务项目（如 iOS / Android / Web / 后端仓）。

### 1. 注入接入桩 (Stub Injection)
进入目标业务仓库根目录，运行幂等安装命令：
```bash
cd /path/to/your-consumer-project
baton install
```
- **生效机制**：自动将轻量韧性接入桩（`handoff-stub`）安全注入至 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md` 与 `README.md`。
- **判定标准**：输出 `🎉 baton 接入桩安装完成`，各载体均打上当前版本戳。

### 2. 挂载物理提交门禁 (Pre-commit Hook)
将本仓的标准 Git Hooks 模板软链或复制到业务仓：
```bash
# 检查业务仓是否已有 hook
ls -la .git/hooks/pre-commit 2>/dev/null || true

# 若无，软链 ReasonWeave 提供的标准门禁模板 (以 Node 项目为例)
ln -sf "$(lab path orphan)/templates/wiring/pre-commit-node.sh.template" .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### 3. 连通性与事实源对账 (Connection Probe)
在业务仓根目录下执行一致性探针：
```bash
baton doctor   # 亦可执行 baton link --check
```
- **完成判定 (DoD)**：
  - 输出 `[事实源对账] VERSION.md == 引擎版本`；
  - 输出 `[桩版本一致] AGENTS.md / CLAUDE.md: 桩版本 == 引擎版本`；
  - 最终判定：`🎉 判定结果: 桩版本 == 引擎版本`。

### 4. 冒烟测试 (Smoke Test)
在业务仓执行状态查看：
```bash
baton status
```
- **完成判定**：成功读取或提示空待办，无报错退出（Exit 0）。业务仓接入正式完成。

---

## 阶段三：常见异常与自愈速查 (Troubleshooting)

| 异常现象 | 根因分析 | 一键自愈命令 |
|---|---|---|
| `command not found: baton` | NPM 全局 bin 路径未在系统环境变量 `$PATH` 中 | `export PATH="$(npm bin -g):$PATH"`（并写入 `~/.zshrc` 或 `~/.bashrc`） |
| `baton doctor` 提示桩版本漂移 | 业务仓 `AGENTS.md` 中的接入桩为旧版本 | 在业务仓根目录重跑 `baton install` |
| `npm link` 权限报错 EACCES | 本地 npm 全局目录权限受限 | 运行 `npm config set prefix ~/.npm-global` 并配置 PATH |
