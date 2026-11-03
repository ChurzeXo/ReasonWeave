# 依赖与架构拓扑 (Dependency Graph)

## 1. Unit 拓扑架构

各模块处于扁平正交架构，各自独立演进，依赖关系如下：

```mermaid
graph TD
    PLAYBOOK["units/playbook (方法论顶层母版)"]
    
    HANDOFFS["units/handoffs (协作中枢)"]
    PREFLIGHT["units/preflight (不变量门禁)"]
    REVIEW["units/review-gate (代码安全质量防线)"]
    ADR["units/adr (架构记忆)"]
    BACKLOG["units/backlog (待办捕获)"]
    
    PLAYBOOK -.->|"理论出处"| PREFLIGHT
    PLAYBOOK -.->|"理论出处"| REVIEW
    PLAYBOOK -.->|"理论出处"| ADR
    PLAYBOOK -.->|"理论出处"| BACKLOG
    PLAYBOOK -.->|"理论出处"| HANDOFFS
    
    PREFLIGHT -.->|"可协同编排 (pre-commit.d)"| REVIEW
    HANDOFFS -.->|"闭环回执可联动"| BACKLOG
```

## 2. Unit 详细清单与演进节奏

| Unit | 类型 | 版本源 | 外部依赖 | 演进频率 |
|---|---|---|---|---|
| `units/handoffs/` | Node CLI 引擎 | `VERSION.md` / README | Node.js >= 18 | 高频 (协作契约与状态机演进) |
| `units/preflight/` | Shell 脚本 + 探针 | `VERSION.md` | git, POSIX shell | 中频 (探针与门禁项扩充) |
| `units/review-gate/` | Shell 脚本 + SAST | `VERSION.md` | opengrep, git | 低频 (规则与基线优化) |
| `units/adr/` | Shell 引导 + 模板 | `VERSION.md` | bash | 低频 (模板档位演进) |
| `units/backlog/` | 规范文档 + 模板 | `VERSION.md` | 无 | 低频 (记录格式演进) |
| `units/playbook/` | 文档与方法论全集 | `README.md` | 无 | 持续积累 |

## 3. 隔离与变更规则
1. **独立发布**：任一 Unit 的逻辑调整，仅在该 Unit 目录下 bump `VERSION.md` 并记录 `CHANGELOG.md`。
2. **跨 Unit 变更流程**：
   - 当 `handoffs` 调度契约变动影响到回执模板或 backlog 联动时，需在 `group/contracts/` 记录契约变更。
   - 禁止在修改一个 Unit 时隐式篡改其他 Unit 的既有行为。
