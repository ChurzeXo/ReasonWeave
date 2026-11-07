# Telemetry — 可观测与遥测能力单元 (Universal Agent & App Observability)

> 本目录是 `telemetry` 通用可观测与遥测规范及协议的**单一事实源**。
> 解决端侧 AI（WorkBuddy / Antigravity / Cursor 等）全程自治执行时，对 MCP Tool、技能包及受控目标外部 App（如 Android/Web）的端到端调用链追溯、Zero-Leak 隐私脱敏与离线优先流式观测。

---

## 1. 核心定位与设计原则

1. **三级事件分层 (Three-Tier Event Taxonomy)**：
   - **L2 Incident (严重事故工单)**：Error / Warning / Crash / 门禁拦截 / 决策弃权。**恒开、永不丢失、后台即时冲刷**。
   - **L1 Event (意图级业务事件)**：Tool 调用、技能包执行步骤、宏决策路线。**默认开启、批量定时冲刷**。
   - **L0 Trace (底层物理动作与感知)**：目标 App 的点击/滑动/输入原子动作、UI 结构帧变化。**默认关闭或仅本地聚合、不上行**。
2. **四关联键唯一事实源 (Correlation Keys)**：
   - 所有事件必须携带 `trace_id`（任务全局 ID）、`span_id`（当前步骤 ID）、`seq`（端内单调递增序号）、`capture_run`（轮次分组键）。
3. **Zero-Leak 构造即脱敏 (Construct-Time Sanitization)**：
   - 框架层设立唯一发射接口（`emit`），未通过 `DataSanitizer` 脱敏的数据物理拒绝落盘与上行。
4. **外部受控端零新增网络栈 (Host Normalization)**：
   - 受控外部端（如 Android App、浏览器插件）不直连云端，通过内部总线（如 WebSocket `/ws/perception`）由宿主 MCP 归一化与脱敏。
5. **离线优先与无阻断 (Offline-First & Fail-Safe)**：
   - Outbox 物理落盘在先、单飞锁防重发、断网静默缓冲，端控业务主流程 P99 延迟劣化 ≤5%。

---

## 2. 目录规范

```text
units/telemetry/
├── schema/                 # 通用 JSON Schema 契约
│   └── canonical_event.json # CanonicalTelemetryEvent 跨语言事实源
├── python/                 # Python 运行时 SDK 骨架
├── node/                   # Node.js 运行时 SDK 骨架
├── adr/                    # 遥测领域架构决策记录
├── README.md               # 本规范
├── AGENTS.md               # Agent 维护纪律
├── VERSION.md              # 语义化版本
└── CHANGELOG.md            # 变更历史
```

---

## 3. 消费方（Consumer）集成规范

- **`units/handoffs` (Baton)**：作为特权只读消费者，在验证回执时，通过 `trace_id` 读取本地遥测文件（`received_telemetry.jsonl`），自动核对 Tool 与目标 App 的物理执行记录，杜绝伪回执。
- **`units/preflight`**：探针可检查遥测脱敏状态与未冲刷积压，保障离线与合规不变量。
