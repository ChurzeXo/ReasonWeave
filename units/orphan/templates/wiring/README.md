# 联邦分栈反未接线参考模板库 (Federated Wiring Recipes)

> **导读**：本目录沉淀了针对主流技术栈（Python / Rust / SwiftUI / 微信小程序）的**反未接线（Anti-Orphan）最佳实践与参考实现模板**。
> **架构定位**：遵循 [ADR-0009](file:///Users/churze/Documents/lab/group/architecture/adr/0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md) 的“联邦门禁”哲学——**本仓不强绑任何栈的特定门禁，仅提供验证模式，下游消费方 Agent 依据自身框架与工程规模按需取用、自适配落地。**

---

## 一、 快速索引表

| 技术栈 | 核心场景 | 推荐策略 / 模板 | 门禁分级建议 |
| :--- | :--- | :--- | :--- |
| **Python** | Agent 原语、Tool Schema、Planner 动作空间 | [`python-parity-test.py.template`](./python-parity-test.py.template) | **Fast Gate** (本地 pytest，纯内存对账，毫秒级) |
| **Rust** | 高可靠核心引擎、状态机、协议分发 | [`rust-exhaustive-match.md`](./rust-exhaustive-match.md) | **Fast Gate** (本地 `cargo check`) + **Heavy Gate** (CI `clippy -D warnings`) |
| **SwiftUI** | iOS 页面、ViewModel、导航树 | [`swift-periphery.md`](./swift-periphery.md) | **Heavy Gate** (CI 或 Pre-push 运行 Periphery，避免阻塞本地 commit) |
| **微信小程序 / TS** | 页面路由、组件依赖、云函数 | [`miniprogram-route-guard.js.template`](./miniprogram-route-guard.js.template) | **Fast Gate** (本地 pre-commit 轻量 AST 路由探针) |
| **Node.js / ESM** | CLI 子命令、公共导出原语、core 模块 | [`pre-commit-node.sh.template`](./pre-commit-node.sh.template) | **Fast Gate** (语法硬校验 + `lab-orphan check-diff --staged`，lab 实测 ~1.8–2.0s) |

---

## 二、 核心设计准则

1. **拒绝高假阳性工具（The Vulture Lesson）**：
   动态语言（如 Python）严禁将全仓死代码扫描工具（如 `vulture`）配置为本地 Git Commit 的强阻断项。框架反射、动态装饰器与动态导入会产生大量假阳性，导致维护白名单成本极高，甚至促使 Agent 投机扩充白名单。
2. **推崇“单一事实源（SSOT）+ 集合对等性测试（Parity Test）”**：
   底层使用装饰器（如 `@primitive` / `@tool`）自动提取元数据并向全局注册表注入；测试层直接比对 `set(implemented) <= set(planner_visible)`，执行确定性对账。
3. **分级防御（Fast Local vs Heavy CI）**：
   - 本地 `pre-commit` 门禁执行时间必须控制在 **2 秒以内**，保护本地心流；
   - 依赖全量编译或深层 AST 依赖分析的重型工具（如 Periphery、全量 Clippy）统一放置在 `pre-push` 或 CI 阶段执行。
4. **错误输出驱动自愈（Self-Healing Error Output）**：
   所有校验失败时，必须打印**具体缺失的原语/组件名称**以及**推荐的注册文件路径**，以便 Agent 能够根据错误日志一次性精准修复。

---

## 三、 层内自举：本仓（lab · Node.js/ESM）的挂载方式

本仓自身是 Node.js/ESM 技术栈，因此**以第一消费方身份自举**该配方（防止“规范写了但自己没接线”）：

```bash
# 从统一本地模板库挂载（推荐，跨项目复用）
ln -sf ~/dev-templates/hooks/pre-commit-node .git/hooks/pre-commit

# 或直接从本仓模板就地挂载（无全局模板库时）
ln -sf "$(pwd)/units/orphan/templates/wiring/pre-commit-node.sh.template" .git/hooks/pre-commit
```

* **SSOT 约定**：本文件 `pre-commit-node.sh.template` 为**唯一事实源**；`~/dev-templates/hooks/pre-commit-node` 是联邦边缘副本。修改顺序恒为「先改本仓模板 → 再 `cp` 覆盖边缘副本」，禁止反向就地修改边缘副本。
* **三层结构**：L1 `node --check` 暂存区语法硬校验 → L2 `lab-orphan check-diff --staged` 增量接线对账（O(Δ)）→ L3 新增导出符号垂直切片提示。
* **耗时实测**：lab 全仓 185 个受跟踪文本文件 / 2.9 万行下约 **1.8–2.0s**，恰在 Fast Gate ≤ 2s 预算内。其中约 1.2s 消耗在 145 个 `.md` 文档（1.28 万行）的分词入索引上；纯代码仓（md 稀少）会显著更快。
  > 若某消费方仓库文档极密集且超预算，优先评估「排除 `.md` 弱引用索引」而非缩短检查面（`.md` 仅影响 `hasWeakDocOnly` 诊断文案，不影响 pass/fail 判定）。
* **紧急豁免**：`SKIP_WIRING_GATE=1 git commit ...`，豁免后必须在 PR/回执中补交 Wiring Proof。
