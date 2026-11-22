---
id: 13
title: feat(spec-guard/review-gate/handoffs): 规约驱动开发 (SDD) 与 RePPIT 分级工程防线落地
type: feature
priority: high
status: closed
owner: lab/spec-guard + lab/review-gate + lab/handoffs
dep_on: '12'
handoff_ref: 'ADR-0012'
created: 2026-11-22
updated: 2026-11-22
completed: 2026-11-22
---

- **要做什么**：
  依据 ADR-0012 架构决议与 WorkBuddy 裁决共识，系统性落地规约驱动开发（SDD）与 RePPIT 闭环分级工程防线：
  1. **Phase 0: 基线复用与交付契约加固（零新轮子）**
     - 更新 `units/handoffs/RESPONSE-TEMPLATE.md` 与工单交付契约，增加 Tier 1 / Tier 2 判定标识；
     - 在审计与交付模板中明确将“垂直切片四要素（实现+注册+入口+单测）”与“负向测试先行（先红后绿）”作为显式硬性 Checklist。
  2. **Phase 1: 穿透扫描与防线战法文档落地（搭车落实 Backlog-12）**
     - 在 `units/review-gate/templates/scan.sh` 中实现 `--no-suppress` 穿透扫描模式，并在门禁中拦截源码新增的未纳管行内裸免检；
     - 编写 `units/playbook/docs/20-vibe-security-and-anti-suppression.md`，固化“免检是声明不是证明”、“今天够不着不等于安全”、“分级拍板不可逆决策”等核心工程纪律。
  3. **Phase 2: 活文档脚手架与 spec-guard 三元对账**
     - 在 `specs/templates/` 建立标准 `01-research.md` 到 `05-evidence.md` 模板；
     - 扩展 `units/spec-guard`，支持将 `specs/<ticket-id>/03-spec.md` 中的 Invariant 声明与代码注解及单测断言进行机器化对账，杜绝静态文档坟场。
  4. **Phase 3: 运行态工具 Profile 治理**
     - 在 `baton` CLI 中支持 `tool-profile: readonly` 参数声明；
     - 结合 preflight 与提交门禁，核验调研阶段的只读不变量。

- **触发背景与依据**：
  - 吸收斯坦福大学 CS146S《现代软件开发者》工程精髓；
  - 经过工单 `1d5d6882-e43a-4a10-a5b3-cbcb9546799e` 双角色（arch ↔ audit）独立实测评审裁决（Verified / 裁剪采纳）；
  - 核心 ADR 决议：`group/architecture/adr/0012-spec-driven-development-reppit-and-tiered-guardrails.md` (Accepted / 🔒Frozen)。

- **验收判据（DoD）**：
  - [ ] `RESPONSE-TEMPLATE.md` 完成分级与垂直切片/负向测试交付 Checklist 升级；
  - [ ] `scan.sh` 具备 `--no-suppress` 穿透执行能力并通过自测；
  - [ ] `playbook` 沉淀第 20 章防线战法；
  - [ ] Tier 2 活文档脚手架在 `specs/templates/` 就绪；
  - [ ] 相关 Unit 版本号与 CHANGELOG 同步更新。
