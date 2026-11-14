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

---

## 全局 AI 行为规约：全栈“反未接线”（Anti-Orphan）确定性交付宪章

> **权威出处**：遵循 [ADR-0009](file:///Users/churze/Documents/lab/group/architecture/adr/0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md) 与 `$(lab path playbook)/docs/19-anti-orphan-vertical-slicing.md`。
> **核心铁律**：拒绝依赖 AI 自觉（Prompt 祈祷），建立机器可验证的物理级确定性门禁；严禁底层能力已实现但上层未接线。

### 1. 垂直切片铁律（Vertical Slicing Rule）
- **禁止水平分层交付**：严禁只编写底层 Executor 函数、API 接口、数据模型或独立 UI 组件而不接入主调用链。
- **端到端原子提交**：任何新增的原语（Primitive）、工具能力、路由或页面，必须在同一次变更中完成全链路闭环：`底层实现 -> 注册表/Schema/路由声明 -> 上层调度器/Planner/主导航入口`。

### 2. 完成定义（Definition of Done, DoD）
- 仅通过底层函数的单元测试（Unit Test）**绝对不视为任务完成**。
- 必须同步提供**接线验证（Wiring Verification）**——证明上层调度器（如 LLM Planner、NavigationStack、App 路由、`app.json`）已能识别并实际触发该能力。

### 3. 交割与审计契约（Handoff & Audit Protocol）
- 在多窗口或跨 Agent 异步交割任务时，审计方（`to_lane: audit`）代码审查的第一道防线为“孤儿与接线检查（Orphan Check）”：凡新增的导出函数、Struct、View 或 Page 未在主入口调用树中被引用，一律直接打回（Reject），禁止合并。

