---

## 全局 AI 行为规约：全栈“反未接线与反假接线”（Anti-Orphan & Anti-Fake-Wiring）确定性交付宪章

> **权威出处**：遵循 [ADR-0009](file:///Users/churze/Documents/lab/group/architecture/adr/0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md)、`$(lab path playbook)/docs/19-anti-orphan-vertical-slicing.md` 与 `$(lab path orphan)/README.md`（§5–§8）。
> **核心铁律**：拒绝依赖 AI 自觉（Prompt 祈祷），建立机器可验证的物理级确定性门禁；严禁底层能力已实现但上层未接线或假接线。

### 1. 垂直切片铁律（Vertical Slicing Rule）
- **禁止水平分层交付**：严禁只编写底层 Executor 函数、API 接口、数据模型或独立 UI 组件而不接入主调用链。
- **端到端原子提交**：任何新增的原语（Primitive）、工具能力、路由或页面，必须在同一次变更中完成全链路闭环：`底层实现 -> 注册表/Schema/路由声明 -> 上层调度器/Planner/主导航入口`。

### 2. 完成定义（DoD）与三层正交判据
- 仅通过底层函数的单元测试（Unit Test）**绝对不视为任务完成**，必须同步提供**接线验证（Wiring Verification）**。
- 业务仓按三层正交解耦落地：L1（静态双向拓扑零差集，禁追逐无穷表达式/反射黑名单，反射归 OpenGrep SAST）→ L2（唯一 `.venv` 运行时非空产出 + 失败传播 + `--verify-mutations`，接入 CI 与 `preflight.conf` `RECONCILE_CMD`）→ L3（真机/外设产出非对称 Ed25519 + 新鲜度硬门限）。

### 3. 交割与自主呈批开单契约（Handoff & Audit Protocol）
- 在多窗口或跨 Agent 异步交割任务时，审计方（`to_lane: audit`）代码审查的第一道防线为“孤儿与接线检查（Orphan Check）”：凡新增的导出函数、Struct、View 或 Page 未在主入口调用树中被引用，一律直接打回（Reject），禁止合并。
- 发现本任务新引入断链当场修完复测；发现越界/历史/跨端断链禁静默跳过或越界硬改，须附 `文件:行号` + L1/L2 复现证据，主动询问人类是否执行 `baton new` 开单整改。

### 4. 物理门禁（Physical Gate，与 `AGENTS.md` 同名章节等价）
- 本仓 Fast Gate 挂载于 `.git/hooks/pre-commit`（软链至 `$HOME/dev-templates/hooks/pre-commit-node`，SSOT 为 `units/orphan/templates/wiring/pre-commit-node.sh.template`），提交时自动执行 `node --check` + `lab-orphan check-diff --staged`。
- 被拦截时按输出的「缺失清单 + 修复动作」自愈，**禁止用 `--no-verify` 绕过**；紧急豁免仅限 `SKIP_WIRING_GATE=1`，且需在回执/PR 补交 Wiring Proof。

<!-- handoff-stub:v2.1 begin -->
<!-- generated — do not edit -->
<!-- stub:sha256:5090fcd4 -->
### Agent Baton (Handoff) 接入桩（轻量韧性版 · 细则以 $(lab path handoffs)/README.md 契约 v2.41.2 为准）

**核心守卫与身份（强制）**
- **物理工作区边界**：会话严格绑定当前宿主工作区，严禁跨仓 cd 操作外部代码；跨仓请输出交接提示词引导人类在目标仓 Agent 会话中派发。
- **一单到底与会话ID统一（强制 · v2.36.0）**：工单物理 ID 即为会话 ID（全局唯一统一），严禁物理 ID 与会话 ID 分裂。所有轮次（Round 1..N）在原单同一 ID 下流转闭环，严禁轮次变异；任务主题全生命周期保持一致。
- **严禁跨会话处理工单（最高宪法级隔离）**：工单全程严格绑定发起会话；严禁跨会话处理/推进/闭环外部工单（`forward`/`accept`/`reopen` 仅限原发起会话执行；接收方接单必须显式带工单编号，严禁从全局待办中盲目抢单）。
- **命令形态与显式身份**：一律 `baton <op>` 或 `handoff <op>`。全面支持 `--as <lane>` 显式声明身份，同一会话无缝切换多工单。
- **会话身份锁与凭证防伪**：支持 `baton lane <lane>` 锁定会话身份；环境绑定优先级 `HANDOFF_LANE` > `baton lane` > `--as <lane>`；审计交付必须持有 `audit.token` 密码学签章，禁止发起方跨角色自我闭环。
- **确定性自愈**：校验细节（Nonce、证据路径、数据一致性）由 CLI 运行时精准拦截；若命令报错，末尾 100% 打印可直接复制的一键自愈命令。

**入站工作流（接单 · 交付 · 退回）**
1. **查待办**：运行 `baton status --as <本方 lane|target>`（直取本方未闭环待办工单，或全量 `baton status`）。
2. **读工单**：运行 `baton show <id>`，根据验收判据改动本 lane 范围代码并实测。
3. **交付或退回（实测为唯一准绳）**：
   - **实测通过**：照抄 `$(lab path handoffs)/RESPONSE-TEMPLATE.md` 骨架 → 运行 `baton receipt <id> -n "<正文>" --deliver --as <本方 lane> --evidence-paths "<路径>"`（审计工单附 `--audit-nonce "<nonce>"` 或同工作区授权下使用 `--auto-nonce` 自动绑定最新令牌；红队用例严格遵循 NO_DISPATCH / NO_COMPLETE / COMPLETE 三态标准）。
   - **实测未过（NO-GO/受阻）**：审计方享有安全下车通道，运行 `baton reject <id> -n "<理由/差异在哪>" --as audit` 退回整改；普通执行方若受阻/缺失条件，登记受阻回执 `baton receipt <id> -n "<缺失条件/受阻理由>" --evidence-note "<说明>" --as <本方 lane>` 由发起方核实并处理。
4. **收尾自检**：运行 `baton check [id]`（若有数据漂移可加 `--fix` 自动修复）。
5. **入站回复收尾（简洁单行裁决 · 严禁角色漂移）**：接收方必须严格保持本方执行/审计角色，严禁切换为发起方角色；**严禁反向输出 `## 交接提示词` 卡片或调用 `baton close` 越权闭环**；最终回复人类的最末尾仅输出单行纯文本（无需标题，无需代码块，严禁多行出站卡片）：
   - 审计驳回：`审计完成，裁决 NO-GO（工单已退回<发起方角色>进入 Round <N>）`
   - 审计通过：`审计完成，裁决 GO`
   - 普通交付：`交付完成，回执已就绪`
   后续 Round 轮次由发起方在出站重新转递时统筹计算并派发。

**出站工作流（派发 · 监听 · 严禁漏开监听）**
1. **建单与转递（单工单原子闭环 · 99%场景）**：`baton new <target|lane> <type> "<标题>"`，填写正文后直接作为宿主后台任务（如 `WaitMsBeforeAsync: 500`）运行 `baton forward <id> --wait`（双盲审计附加 `--blind` 脱敏思考自辩；单工单严禁使用 `--async` 拆分两步！）。
2. **多单并发派发（仅限一次性派发多单）**：`baton forward <id1> <id2> ... --async`，派发后必须立即作为后台任务运行 `baton wait <id1> <id2> ... --all` 聚合监听平账（严禁将多单提示词混杂在同一个代码块内）。
3. **出站回复收尾（交接提示词规范）**：出站由发起方统一计算与推进 Round 轮次；回复最末块必须固定为独立代码块，方便人类一键复制给接收方 Agent（其后无任何正文）：
   ## 交接提示词
   ```text
   请 [<目标角色>] 接单：
   [发起角色] [<发起角色>]
   [任务主题] <主题>
   [任务轮次] Round <round>（第 <round> 轮复审）
   [工单编号] [<conversation_id>]
   [工单路径] <交接路径>
   [接单指令] baton lane <to_lane>（或操作时附带 --as <to_lane>）
   ```

详见 `$(lab path handoffs)/AGENT-GUIDE.md` 获取完整版 Preflight。
<!-- handoff-stub:v2.1 end -->
