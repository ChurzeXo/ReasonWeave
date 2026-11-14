# Lab Agent Engineering Toolkit

## Overview
本仓库是可复用的 Agent / AI 辅助工程能力库，为软件项目提供正交、可插拔的研发纪律机件与规范。

## Repository Layout (ZSpec / AEF v1.0)
```
constitution.md      最高宪法（单一事实源、门禁原则、无感兼容）
group/               全局事实层
  ├── product/       产品意图 (intent.md)
  ├── architecture/  拓扑依赖图 (dependency-graph.md)
  └── contracts/     打包与分发契约 (npm-packaging.md)
units/               独立工程单元（各模块自治上下文）
  ├── handoffs/      跨仓/仓内工作流交接中枢与 CLI 引擎
  ├── preflight/     仓库不变量探针与提交门禁
  ├── review-gate/   SAST 扫描与代码质量防线
  ├── adr/           架构决策记录机制与模板
  ├── spec-guard/    全局架构漂移与规约守卫 (P3' 对账矩阵)
  ├── backlog/       待办捕获制度与模板
  └── playbook/      Agent Engineering Framework 方法论全集
specs/               Spec Kit 规划与实施产物
docs/                辅助文档与待办 (docs/backlogs/)
<module> (symlinks)  根目录向后兼容软链接，无缝保障已有消费项目
```

## Isolation & Unit 规则
1. **Unit 自治**：各 Unit 独立维护自身的 `VERSION.md`、`CHANGELOG.md` 及核心规范。
2. **禁止破坏根目录兼容层**：根目录下的软链接（`handoffs`、`preflight` 等）必须保持完好，确保现有消费方不中断。
3. **运行态与能力库严格分离**：`units/handoffs/` 内的交接票据与回执属于本地使用记录，严禁进入 git 跟踪或打包发布。

## Key Documents
- `constitution.md` — 仓库最高宪法（修改须人类审核）
- `group/product/intent.md` — 产品意图
- `group/architecture/dependency-graph.md` — 依赖关系与发布节奏
- `group/contracts/npm-packaging.md` — NPM 打包与发布契约

## Agent Guidelines
- 读取上下文顺序：**本文件 → `constitution.md` → 目标 Unit 的 `AGENTS.md` 与 `README.md`**。
- 对任一 Unit 的改动，必须在该 Unit 内完成更新、测试并更新对应的 `VERSION.md` 与 `CHANGELOG.md`。
- 修改脚本文件（`*.sh` / `*.mjs`）必须保持 POSIX 兼容性或纯 Node 原生模块依赖。
- 未经请求不得随意引入重量级第三方依赖。
- **改源不改造实例（SSOT 核心铁律）**：动任何“种子/默认值/派生镜像/配置”前，必须先确认单一事实源（SSOT）；严禁绕过源直接在库中敲裸 UPDATE 或就地 patch 物化副本，任何源的修改必须与迁移同步脚本/重物化在同一 commit 提交。

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
