# ReasonWeave 标准作业程序 (SOP) 索引

> **工业级标准作业程序 (Standard Operating Procedures · AEF 2.0)**  
> 旨在终结“阅读三万字架构长文后依然漏步”的痛点，将工程纪律转化为**确定性、可机械执行、带自愈与降级**的操作流水线。

---

## SOP 全局清单

| 编号 | 文档 | 适用场景 | 核心工具 |
|:---:|---|---|---|
| **SOP-01** | [**全仓初始化与业务仓接入 SOP**](01-installation-and-onboarding-sop.md) | 新机器配置、CI 环境构建、业务项目（消费方仓）一键挂载能力库 | `lab doctor`, `baton install`, `baton doctor` |
| **SOP-02** | [**日常端到端工程协同与三态流转 SOP**](02-day-to-day-engineering-sop.md) | 日常需求立项、工单派发、微观工程实测、三态裁决 (GO/NO-GO/BLOCKED)、受阻免责呈报与闭环回收 | `baton new`, `baton forward --wait`, `skills`, `baton receipt` |
| **SOP-03** | [**Baton 跨端流转与自主双盲审计 SOP**](03-handoffs-and-audit-sop.md) | 跨 AI 客户端（Antigravity $\leftrightarrow$ ChatGPT/Claude）流转、防技能语义撞车、HMAC 防伪令牌核验、独立审计重跑 | `baton forward --blind`, `baton-audit-runner`, `baton reject` |
| **SOP-04** | [**全局死代码清道夫与反未接线排查 SOP**](04-anti-orphan-governance-sop.md) | 提交前增量切片反假接线门禁、S1~S3 求解器自检、孤儿依赖与废弃凭据治理 | `lab-orphan check-diff --staged`, `check-deps`, `scan-secrets` |

---

## 执行纪律准则
1. **机械照做**：严格遵循各 SOP 的前置检查、执行命令与完成判据（DoD）；
2. **三态处理**：若遇不可抗力系统权限阻断，严格遵循 SOP-02 提交 `BLOCKED` 受阻回执，严禁私自 reject 或挂起；
3. **闭环自愈**：当门禁拦截报错时，优先执行各 SOP 提供的自愈命令。
