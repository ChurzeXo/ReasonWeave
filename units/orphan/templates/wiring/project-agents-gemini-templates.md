# 新项目 `AGENTS.md` / `GEMINI.md` 反假接线接入规范与模板

> **单一事实源（SSOT）**：本模板源自 [units/orphan/README.md](../../README.md) 与 [19-anti-orphan-vertical-slicing.md](../../../playbook/docs/19-anti-orphan-vertical-slicing.md)（沉淀自 ADR-075 实战）。  
> **创建时机与职责**：本映射**仅在已有真实业务代码的下游消费方仓**（或新项目已建好首个真实入口与唯一运行时后）创建，一般由**消费方 Agent** 探测本仓真实路径后负责写入；全局安装/升级 `lab-agent-toolkit` 本身或 0 代码空目录**不创建**本映射（严禁残留 `<...>` 占位符）。  
> **核心铁律**：业务仓库**不得复制**长篇方法论或三层架构正文，只放极简本地路由映射，并保留 `$(lab path orphan)/README.md` 指针。

---

## 一、行数预算与 SSOT 约束

| 目标文件 | 接入段落 | 严格行数预算 | 职责边界 |
| :--- | :--- | :---: | :--- |
| `AGENTS.md` | 反假接线分级自查段 | **`<= 12` 行** | Tier 1 / Tier 2 本地目录与核心文件映射 + 自主呈批开单纪律 + SSOT 指针 |
| `GEMINI.md` | 反假接线执行守卫段 | **`<= 6` 行** | 唯一 `.venv` 运行时执行 L1/L2 + 禁 `SKIP_*` / `--no-verify` 绕过 |

---

## 二、标准复制模板

### 模板 A：`AGENTS.md` 分级自查段（`<= 12` 行，当前 6 行）

将以下片段复制到业务仓根目录 `AGENTS.md`，并将 `<...>` 替换为本项目真实路径：

```markdown
## 反假接线分级自查（SSOT: `$(lab path orphan)/README.md`）
- **Tier 1（轻量专项）**：参数全链路透传与单分支可达（本地链路：`<schema_or_registry>` → `<dispatcher>` → `<factory_or_handler>`）。
- **Tier 2（全局自查）**：注册表双向差集（含 `Tool(name=...)` 反向幽灵拦截）、`lab orphan scan`、动态加载盲区隔离（`<dynamic_dir>`）与跨端 SSOT 对账（`<ssot_targets>`）。
- **L2/L3 契约与存证**：L2 在唯一 `<.venv>` 跑全量路由非空产出 + 失败传播（`0`/`None`/异常）+ `--verify-mutations`；涉及真机/外部设备产出须过 L3 非对称 Ed25519 验签与新鲜度硬门限。
- **自主呈批开单**：本任务新引入断链当场修完复测；发现越界/历史/跨端假接线，禁静默跳过或越界硬改，须附 `文件:行号` + L1/L2 复现证据，主动询问人类是否 `baton new` 开单整改。
```

### 模板 B：`GEMINI.md` 执行守卫段（`<= 6` 行，当前 4 行）

将以下片段复制到业务仓根目录 `GEMINI.md`，并将 `<...>` 替换为本项目真实命令与虚拟环境路径：

```markdown
## 反假接线执行守卫（SSOT: `$(lab path orphan)/README.md`）
- **唯一运行时执行 L1/L2**：所有 L1 拓扑门禁与 L2 契约测试（含 `--verify-mutations`）一律使用项目唯一 `<.venv/bin/python>`（或唯一运行时）执行，严禁裂变环境。
- **严禁绕过**：提交前经 `preflight.conf` `RECONCILE_CMD` 与 `.githooks/pre-commit.d/`（含 OpenGrep SAST）联检；严禁使用 `SKIP_*` 环境变量或 `--no-verify` 绕过门禁，阻断即当场自愈。
```

### 模板 C：`preflight.conf` L1 + L2 串联参考片段

在业务仓根目录 `preflight.conf` 中配置 `RECONCILE_CMD`，确保本地 `preflight.sh` 与 CI 共同执行 L1 + L2 闭环：

```bash
# L1（静态拓扑零差集）+ L2（唯一 .venv 运行时失败传播与变异自证）
RECONCILE_CMD="<.venv/bin/python> scripts/audit_wiring.py --fast && <.venv/bin/python> tests/test_l2_failure_propagation_contract.py --verify-mutations"
```

---

## 三、4 项初始化验收清单（Initialization Acceptance Checklist）

新项目接入完成后，Agent 与人类须逐项核验以下 4 项硬指标（全绿方可视为初始化完成）：

- [ ] **1. 行数预算达标**：`AGENTS.md` 分级自查段严格 `<= 12` 行、`GEMINI.md` 执行守卫段严格 `<= 6` 行；正文无方法论长篇复制，且保留 `$(lab path orphan)/README.md` 指针。
- [ ] **2. 路径真实性核验**：模板中填写的本地注册表、分发器、工厂、动态加载目录及唯一 `.venv` 路径在当前仓库**真实存在且可执行**（无占位符残留或悬空路径）。
- [ ] **3. `preflight.conf` L1+L2 串联**：`preflight.conf` 的 `RECONCILE_CMD` 已串联 L1（`--fast`）与 L2（含 `--verify-mutations`），运行 `bash scripts/preflight.sh` A5 对账全绿，且 CI 工作流已同步接入。
- [ ] **4. `pre-commit` SAST 挂载**：`.githooks/pre-commit.d/` 已挂载 OpenGrep SAST（如 `10-review-gate`）守卫反射与动态执行（`eval`/`exec`/`getattr`/`importlib`），且 L1/L2 门禁无任何 `SKIP_*` 绕过后门。
