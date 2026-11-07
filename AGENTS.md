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
  ├── backlog/       待办捕获制度与模板
  ├── telemetry/     通用可观测与遥测规范 (JSON Schema / SDK / 证据链)
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

<!-- handoff-stub:v2.1 begin -->
<!-- generated — do not edit -->
<!-- stub:sha256:179136b9 -->
### Agent Baton (Handoff) 接入桩（强制守卫 · 细则以 $(lab path handoffs)/README.md 契约 v2.18.0 为准）

**早拦 Preflight（强制）**
- **命令形态**：一律 `baton <op>` 或 `handoff <op>`（PATH shim → 中央引擎；幂等自愈 `baton link`）。若报 command not found：运行 `baton link`（或 `handoff link`）自愈（或通过 lab-agent-toolkit 重新 `npm link`）。
- 调用 `show/receipt/deliver/accept/reject/check` 前，**必须先跑** `baton status`（或 `handoff status`，执行方冷启动用 `baton status --for <本方 lane|target>` 直取本方待办）且其输出在上下文中。
- **状态语义（v2.18.0 · 五态生命周期）**：「进行中」= 未闭环（`status ≠ closed`）且归属当前方。**待办 = `draft` + `forwarded`**——落我归属即该我动工；`received` = 回执草稿已登记（待执行方交付）；`delivered` = 执行方已完成终态交付（等待发起方验收）；`closed` = 审计闭环完成。
- **终态交付机制（v2.18.0 · 防抢跑竞态）**：回执文件落盘不等于会话结束。执行方必须通过 `baton deliver <ID>`（或 `baton receipt <ID> --deliver`）显式标记终态交付；未 deliver 之前发起方 wait 探针不唤醒、accept 硬拒闭环。发起方严禁在收到显式交付信号前提前修改 Backlog 或规划文档。
- 指定 ID 必须在「进行中」且归属当前方（仓内：`to_lane == 当前 lane`；跨仓：落在目标收件箱且未闭环）。找不到→停下并说明。
- 未指定 ID 却有多条归属当前方的待办（draft/forwarded）→ 列出清单请用户点名，不擅自选。
- receipt 前确保 status 快照 **< 60 分钟**（超时重跑）。
- 仓内优先读 frontmatter `workspace`（same/separate），禁用 mtime 推断。
- 执行方**只写 receipt / deliver**，**不做 accept/reject**。
- **严禁抢跑/虚假回执**：验收判据**全部实测通过**方可提交回执与交付。执行中途遇阻、环境/多实例冲突或需讨论的中间状态，**仅记录于 reviews/ 或对话说明，严禁提交包含「已通过」的抢跑回执**。
- 回执正文唯一源 = `$(lab path handoffs)/RESPONSE-TEMPLATE.md`：**照抄其「回执模板（可直接复制）」骨架**（含 evidence 字段），勿另起格式、勿凭记忆重建（骨架外 = 没有）。
- **evidence 硬门禁（v2.12.3）**：仓内新回执（2026-10-14 起）**必须**附可核验证据 `--evidence-paths "真实文件,..."` / `--evidence-commits "<sha>"`（无文件改动用 `--evidence-note "<原因>"`）；声称的路径须真实存在、提交须 `git cat-file -e` 可查，否则 receipt / deliver / accept / check 拒收。**只声明不改 = 伪回执**（2026-10-13 goods-stores 事故教训）。
- 收尾必须 `baton check`（或 `handoff check`）exit 0（2026-10-13 起回执须「非空正文 + 含 ## 节 + 含『状态 / 结论』锚节」；存量豁免）。
- **回复收尾（交接提示词规范）**：发起交接（出站）时，回复最末块**必须固定为交接提示词（由本地 AI 根据用户本地语言自适应呈现：中文使用 `## 交接提示词`，英文使用 `## Baton Pass Prompt`）**。标题、描述说明与具体的接单指令必须严格分离，提示词置于独立代码块（```text）中，方便人类一键复制发给接收方 Agent（其后无任何正文）。执行方交付（入站）后，因发起方已挂起后台探针自动唤醒，无需再写回执提示词。
- **审计动作契约（v2.13 · to_lane=audit 强制）**：审计方（接收方 to_lane=audit）**严禁仅静态读码**——必须在终端**独立执行**交接文档「验收判据」中的**所有测试与校验命令**，以实测输出为唯一准绳，**严禁采信自报**（执行方回执里的「已通过」一律视为待验证声明，不采信）。其余 lane 亦建议独立实测，但审计 lane 为硬纪律。
- **仓内提示词用自然角色（v2.13）**：同仓提示词**严禁出现项目名 / lane slug 当角色**（如「请 Tappy 收交接」「请 impl lane 收交接」）。出站 = `请【<目标角色>】接单：<交接路径>（<主题>）`。角色由 lane 映射（impl→实现方 / audit→审计方 / arch·design→架构设计方；`.handoff-hub.json` 的 `lane_labels` 可覆盖）。
- **防提前闭环与双盲审计防伪（v2.16.0）**：回执**必须由接收方 to_lane 独立撰写**——发起方（from_lane）禁止自填回执；`to_lane=audit` 派发时自动签发一次性 `Audit Nonce`，审计回执必须携带 `--audit-nonce "<nonce>"`，硬性拦截同一会话自签；支持 `baton forward --blind` 物理脱敏主观思维链与自辩借口。

**最小操作序列（出站 = 建/发交接 · 强制闭环）**
1. `baton new <target|lane> <type> "<标题>"`（或 `handoff new ...`）并填写正文
2. **转递并挂起后台监听（必须执行）**：
   执行 `baton forward <ID> --wait`（AI 客户端宿主进程树托管；人类终端可用 `--daemon` 脱钩；需双盲脱敏加 `--blind`）
   ——无论同工作区还是跨工作区，必须启动监听探针；交付完成后探针唤醒进行独立验收闭环。
3. **输出交接提示词（末块规范）**：本地 AI 根据用户本地语言自适应输出，标题、描述与独立代码块分离（其后无任何正文）：
   ## 交接提示词
   > 直接复制下方提示词，发送给接收方 Agent 接单：
   ```text
   请【<目标角色>】接单：<交接路径>（<主题>）
   ```

**最小操作序列（入站 = 接单/回执/交付）**
1. `baton status --for <本方 lane|target>`（冷启动直取本方待办；全量 `baton status` 供发起方巡检）
2. 从「待办」（draft/forwarded）筛选归属当前方（仓内 `to_lane == 当前 lane`；跨仓 = 落在目标收件箱）→ 确认目标 ID
3. `baton show <ID>`
4. 按边界最小改动（仅该 lane 应改文件）
5. 实测全过方写回执与交付：**照抄 `$(lab path handoffs)/RESPONSE-TEMPLATE.md` 骨架** → 优先使用 `baton receipt <ID> --deliver -n "<正文>" --evidence-paths "真实文件,..." --evidence-commits "<sha>"`（或分步执行 receipt 后收尾执行 `baton deliver <ID>`）。（若 `to_lane=audit` 须附 `--audit-nonce "<nonce>"`；仓内必附 evidence；无文件改动用 `--evidence-note`；中途受阻仅写 reviews/ 严禁提回执）
6. `baton check`（exit 0）
7. **自动唤醒闭环**：执行方 deliver 登记后，发起方后台监听探针将自动 Exit 0 唤醒进行独立验收，无需人工回传回执。

详见 `$(lab path handoffs)/AGENT-GUIDE.md` 获取完整版 Preflight。
<!-- handoff-stub:v2.1 end -->
