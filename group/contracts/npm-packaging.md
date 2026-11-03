# NPM 打包与分发契约 (NPM Packaging Contract)

## 1. 打包策略定位
本能力库采用 **统一整包分发模式**（Package Name: `lab-agent-toolkit` 或带有组织 scope 的 `@org/lab`）：
- **全家桶开箱即用**：消费方只需安装一个包，即可获得 `handoff`、`adr-init`、`lab` 三大 CLI，以及各 Unit 的全部探针、模板与 AEF 方法论资产。
- **运行态数据绝对隔离**：严格通过 `package.json` 的 `files` 白名单机制，绝对物理隔离 `units/handoffs/receipts/`、`archive/` 等运行时业务票据和本地历史痕迹。

## 2. 核心 CLI 与 Bin 导出

| 命令 | 对应执行入口 | 功能角色 |
|---|---|---|
| `lab` | `bin/lab.mjs` | 能力库总管命令（`lab list`, `lab path <unit>`, `lab doctor`） |
| `handoff` | `units/handoffs/handoff.mjs` | 工作流交接与回执闭环引擎 |
| `adr-init` | `units/adr/scripts/adr-init.sh` | 架构决策记录引导初始化 |

## 3. 消费方集成模式

### 3.1 全局安装模式 (推荐)
```bash
npm install -g lab-agent-toolkit
```
- 新项目可以直接在终端调用 `handoff` 与 `adr-init`。
- 项目的 `AGENTS.md` 引用规范时，可直接使用动态路径：
  ```markdown
  按 $(lab path preflight)/README.md 接入不变量门禁。
  ```

### 3.2 项目局部安装模式
```bash
npm install -D lab-agent-toolkit
npx lab doctor
```

## 4. 发布与校验流水线
```bash
# 1. 运行自检
npm test

# 2. 预览包内容与体积 (断言无敏感运行态数据，包体积应在 300KB 以内)
npm pack --dry-run

# 3. 发布
npm publish
```
