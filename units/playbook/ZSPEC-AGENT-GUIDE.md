# ZSpec (AEF v1.0) Agent 实战工程规范与起步指南

> **目标受众**：面向负责新项目架构搭建、多端开发与工程维护的 **AI Coding Agent**。  
> **核心原则**：结构化、机械可判定、职责隔离、规范不漂移。

---

## 1. 架构拓扑 (Mental Model for Agents)

ZSpec 采用分层自治结构，Agent 必须严格遵守以下四层读取与修改边界：

```
+-------------------------------------------------------------+
| Layer 0: constitution.md (最高宪法，全端不变量，Agent不得擅自降级)  |
+-------------------------------------------------------------+
| Layer 1: group/ (全局事实层：产品意图 intent.md + 拓扑依赖 graph)  |
|          * 规则：跨端共享事实在此沉淀；任一端不得单方面破坏契约         |
+-------------------------------------------------------------+
| Layer 2: units/<端名>/ (各端自治上下文：iOS / Android / Web / ...) |
|          * 规则：Agent 工作必须限定在当前 Unit，禁止跨 Unit 乱窜改码   |
+-------------------------------------------------------------+
| Layer 3: 研发纪律机件 (ADR / Backlog / Preflight / Review-Gate)    |
|          * 规则：使用 lab-agent-toolkit 统一提供，项目内只保留指针   |
+-------------------------------------------------------------+
```

---

## 2. Agent 上下文读取顺序 (Deterministic Reading Order)

每次 Agent 接到任务或启动新会话时，**必须按以下严格顺序读取上下文**，严禁跳步：

1. **项目根 `AGENTS.md`**：获取全局架构、门禁指令与 Unit 映射。
2. **目标 Unit 的 `units/<unit>/AGENTS.md`**：获取当前端的专属技术栈、构建与验证指令。
3. **`constitution.md`**：核验改动是否触碰项目硬原则。
4. **`group/contracts/`（如涉及跨端/接口改动）**：只读共享接口契约。

---

## 3. 新项目从 0 到 1 初始化协议 (Bootstrap Protocol)

当用户要求“按 ZSpec 模式初始化新项目”时，Agent 必须执行以下标准步骤：

### Step 1: 运行脚手架一键生成骨架
在项目根目录运行命令：
```bash
lab zspec init "<项目名称>"
```
*该命令会自动生成以下标准骨架，并完成 lab 纪律机件的动态接线：*
- `constitution.md` — 预置 P/T/A/D 四维核心原则
- `group/product/intent.md` — 产品意图事实源
- `group/architecture/dependency-graph.md` — 拓扑依赖事实源
- `specs/` — Spec Kit 特性规格工作区
- `docs/backlogs/` — 待办与越界事项跟踪区
- `AGENTS.md` — 根指挥官规则（<150行，动态挂载 lab 能力库）

### Step 2: 填充核心业务事实（Agent 填空阶段）
Agent 必须根据用户初始需求，仅填充以下特定锚点，不要破坏骨架标记：
1. `group/product/intent.md`：
   - 填入本项目的核心问题定义与关键用户旅程（一句话一个旅程）。
2. `constitution.md`：
   - 在 `P1-P3` 替换业务专属的产品不变量（如“隐私数据绝不上云”、“必须支持离线”等）。

### Step 3: 根据端划分建立 Unit
若项目涉及多端（如 `frontend`、`backend`、`ios` 等），为每个端运行：
```bash
lab zspec add-unit <端名称>
```
*这会在 `units/<端名称>/` 下生成自治的 `AGENTS.md` 与工程上下文。*

### Step 4: 挂载工程纪律门禁
运行 `lab doctor`，并初始化项目首条架构决策：
```bash
adr-init . standard "<项目名称>"
```

---

## 4. Agent 日常维护守则 (Invariants for Agents)

| 场景 | 允许的行为 (DO) | 严禁的行为 (DON'T) |
|---|---|---|
| **改动需求/业务逻辑** | 优先更新 `group/product/intent.md` 达成一致再写代码 | ❌ 直接把需求细节硬编码进某端代码 |
| **跨端接口变动** | 更新 `group/contracts/api.md` 并标记影响端 | ❌ A 端悄悄改字段，B 端运行期报错 |
| **发现跨界/未来待办** | 按 `$(lab path backlog)/README.md` 写入 `docs/backlogs/` | ❌ 擅自顺手改掉非本任务范围的代码 |
| **引用工程规范** | 使用 `$(lab path <unit>)/...` 动态指针 | ❌ 把 lab 的规范大段复制到当前项目仓库 |
| **收尾交付** | 运行 preflight / review-gate 门禁并出示证据 | ❌ 只用文字声称“我已通过所有测试” |

---

## 5. 机器可验证检查清单 (Verification Checklist)

Agent 在声称“ZSpec 规范初始化完成”前，必须在终端自检并全部通过：
- [ ] `test -f constitution.md`
- [ ] `test -f group/product/intent.md`
- [ ] `test -f group/architecture/dependency-graph.md`
- [ ] `test -d docs/backlogs`
- [ ] `test -f AGENTS.md && grep -q "lab path" AGENTS.md`
- [ ] `test -f adr/INDEX.md`
