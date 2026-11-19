# orphan — 全局死代码与孤儿资产清道夫公共单元

> 本单元是 `lab-agent-toolkit` 面向跨语言代码库与多媒体资产的**公共清道夫事实源**，专治死代码膨胀、无主孤儿资产堆积与 AI Agent 误读废弃逻辑等工程退化问题。  
> **详细设计方案与工业界调研**：请完整阅读 [DESIGN.md](./DESIGN.md)。

---

## 0. 这是什么 / 为什么独立

在长期演进的软件项目与 AI 辅助研发过程中，代码和资产往往「只增不减」：
- 废弃的类、函数与接口无人敢删，怕触发隐式调用；
- 迭代遗留的布局文件、矢量图标、切图资源悄然变成无主孤儿（Orphan Assets）；
- 过期的特性开关分支（Feature Flags）与测试桩代码在主干长期堆积。

**解法不是「凭感觉人肉排查」，而是「严格数学求解与自检自证」**：
`units/orphan` 沉淀了消费方（如 Tappy）实战验证的 169 项清理成果与求解器范式，将其抽象为可复用、跨技术栈、绝对只读零污染的工程机件。

---

## 1. 核心设计原则

| 原则 | 核心含义 | 为什么必须 |
|---|---|---|
| **只读第一 (Read-Only Invariant)** | 恒基于 Git HEAD blob，严禁依赖脏工作树，扫描过程零修改零污染。 | 保证扫描随时可在 CI/本地并发安全执行，不引发 git 冲突与污染。 |
| **行级倒排索引 (Inverted Index)** | 在内存中对全仓 Token 建立行级倒排索引，毫秒级快速逆向追溯引用。 | 摆脱慢速 grep，消除跨语言全仓大范围扫描的 IO 瓶颈。 |
| **引用三分类器 (3-Tier Classifier)** | 细分 Code (强)、Resource (中)、Doc/Comment (弱) 三种引用类型。 | 文档或注释中提到的旧名字不能误判为代码存活，也不能草率误删。 |
| **S1–S3 求解器自检协议** | 严禁硬编码白名单。每次扫描均运行 S1 注入假死检出、S2 在用保护、S3 逐字节可重复自检。 | 求解器自身的正确性与鲁棒性必须机器可判、持续自证。 |
| **Fail-Closed 安全降级** | 遇动态反射、复杂拼接或不确定契约时，一律标记为待证或保留。 | 杜绝由于静态分析局限导致的线上生产误杀事故。 |
| **增量只扫新增 (O(Δ) 复杂度)** | 提交门禁仅提取 `git diff` 中添加的行发现新符号，秒级完成拦截。 | 保证 Git 提交体验流畅，门禁耗时 ≤ 1.5s。 |

---

## 2. 架构概览

```
units/orphan/
├── README.md               # 本规范入口
├── DESIGN.md               # 完整立项调研与架构设计方案 (必读)
├── VERSION.md              # 单一版本事实源 (v1.0.0)
├── CHANGELOG.md            # 变更日志
├── bin/                    # CLI 命令行入口 (lab-orphan.mjs)
├── core/                   # 核心求解器引擎 (Language-Agnostic)
│   ├── blob-reader.mjs     # Git HEAD 只读提取
│   ├── inverted-index.mjs  # 内存行级倒排索引
│   ├── classifier.mjs      # 引用三分类器
│   ├── protocol-s1-s3.mjs  # S1-S3 自检门禁套件
│   ├── solver.mjs          # 统一求解器
│   ├── diff-checker.mjs    # 增量差异比对与门禁判定
│   └── cleaner.mjs         # 安全修剪与 Diff 生成器
├── adapters/               # 各技术栈专属适配器
│   ├── android/            # Android (Manifest / R / XML / Kotlin / Qualifiers)
│   ├── python/             # Python (__all__ / pytest / magic / routes / getattr)
│   └── web/                # Web / TS (package.json entrypoints / ESM / CJS / exports)
├── templates/              # 接入配置与 Preflight 门禁脚本模板
│   ├── pre-commit.d/30-orphan-guard  # pre-commit.d 门禁子片
│   └── ci/orphan-guard.yml           # GitHub Actions 工作流
└── tests/                  # 自动化测试套件
```

---

## 3. CLI 命令行用法

```bash
# 1. 运行求解器自检协议（S1 假死检出、S2 在用保护、S3 逐字节一致）
lab orphan test-solver

# 2. 全量扫描当前 HEAD 状态，输出结构化候选文件（只读零污染）
lab orphan scan [--stack auto|android|python|web] [--out candidates.json] [--json]

# 3. 增量提交门禁校验（与 git commit 暂存区联动，拦截新增孤儿）
lab orphan check-diff --staged
lab orphan check-diff --base origin/main

# 4. 受控安全清理（支持 dry-run 演练预览统一 Patch）
lab orphan clean [--candidates candidates.json] --dry-run
lab orphan clean --force
```

---

## 4. 与工程工作流接入

### 4.1 接入 Preflight 提交门禁（本地左移防腐）
将门禁子片安装至项目的 `.githooks/pre-commit.d/`：
```bash
cp "$(lab path orphan)/templates/pre-commit.d/30-orphan-guard" .githooks/pre-commit.d/30-orphan-guard
chmod +x .githooks/pre-commit.d/30-orphan-guard
```
在开发者或 Agent 运行 `git commit` 时，门禁将毫秒级分析暂存区新增代码。若引入了从未引用的假死符号或无主资源，将以 Exit 1 阻断提交。

### 4.2 接入 CI 流水线（远端合入防腐）
复制 `templates/ci/orphan-guard.yml` 到项目 `.github/workflows/orphan-guard.yml`，在 Pull Request 评审中自动校验增量改动。

---

## 5. 反假接线三层正交治理规范 (L1 / L2 / L3 · 沉淀自 ADR-075)

在解决“未接线（Orphan）”之后，更隐蔽的工程退化是**“假接线（Fake Wiring）”**——如仅补齐 Schema 声明但分发器/工厂未装配、路由映射存在但返回空任务列表、或底层吞错/伪造成功。为此确立**三层正交解耦原则**，各层只解决可判定的一类问题：

| 层级 | 定位与执行环境 | 强制职责边界 | 明令禁止（反假阳性/防死循环） |
| :--- | :--- | :--- | :--- |
| **L1 (Fast Gate)** | 本地 `pre-commit` / `audit_wiring --fast`（亚秒级静态检查） | ① **双向拓扑零差集**：显式 `Tool(name=...)` / `types.Tool(name=...)` 注册表 ↔ 分发分支 ↔ 工厂实现，含**反向幽灵工具拦截**；② **基础结构存在性**：分支须调用真实工厂并流入返回、禁 `pass` 空分支、禁 `SKIP_*` 环境变量绕过。 | **严禁**在 L1 离线 AST 中追逐无穷表达式、恒假求值或反射黑名单（防 Rice 定理不可判定性死循环）；**反射/动态执行**统一由 `.githooks/pre-commit.d/10-review-gate`（OpenGrep SAST）守卫。 |
| **L2 (Contract Tests)** | 唯一项目运行时（如 `.venv/bin/python`），强制接入 **CI** 与 **`preflight.conf` `RECONCILE_CMD`** | ① **全量路由非空产出**：遍历全部注册目标，验证真实产出非空实体（如 `List[TaskDefinition]`）；② **失败传播与反假成功**：验证 `0` / `None` / 空事件 Fail-Closed、异常向上传播不吞没；③ **内置变异自证（`--verify-mutations`）**：证明吞错或强行篡改成功时契约测试必红。 | **严禁**用离线 `exec()` + `MockPipe` 伪微沙箱替代真实运行时，或私自裂变多套 `.venv-*`。 |
| **L3 (Runtime Attestation)** | 真机 / 外部设备产出写入持久化存储前 | 采用**非对称 Ed25519**（设备侧隔离区持私钥签发，宿主仅持公钥验签）+ **新鲜度硬门限校验**（绑定设备序列号 `serial` + 时间戳新鲜度 `<= 60s` + 状态哈希 + 结果摘要）；缺失/过期/篡改/不匹配时 100% Fail-Closed 熔断拒写。 | **严禁**使用对称 HMAC 替代非对称 Ed25519，严禁无新鲜度校验或静默跳过验签。 |

---

## 6. Tier 1 / Tier 2 分级自查触发矩阵

| 分级 | 触发场景 | 自查动作 |
| :--- | :--- | :--- |
| **Tier 1（轻量专项）** | 单点参数透传修改、单路由/单分支新增或局部逻辑调整 | 核对参数全链路透传（Schema → 分发器 → 工厂/执行器）与单分支可达性，跑通对应 L1 局部检查与 L2 定向契约测试。 |
| **Tier 2（全局自查）** | 新增/重构注册表、跨模块/跨端契约变更、动态加载区调整或发布前验收 | 执行全量 **注册表双向差集**（含反向幽灵工具拦截）、全仓 **孤儿扫描**（`lab orphan scan`）、**动态加载盲区定性隔离**（历史盲区显式标注，禁用原型文件头打标 `[实验态/禁止接入]`）与 **跨端 SSOT 对账**，并跑通 L1 + L2（含 `--verify-mutations`）全量串联。 |

---

## 7. Agent 自主识别与呈批开单协议

Agent 在执行研发或审计任务中发现未接线或假接线时，必须按归属边界分类处置：

1. **本任务新引入断链**：必须**当场修完并复测**（跑通 L1 + L2 正反双向实测），严禁带病提交或仅靠口头说明收尾。
2. **越界 / 历史 / 跨端未接线或假接线**：**严禁静默跳过**，也**严禁越界硬改**；必须在收尾汇报中附带 **`文件:行号` + L1/L2 复现证据**，主动询问人类是否执行 `baton new` 开立专项整改工单。

---

## 8. 新项目 `AGENTS.md` / `GEMINI.md` 接入规范与模板

* **创建时机与职责分工**：
  * **何时创建**：仅在**已有真实业务代码的下游消费方仓**（或新项目完成骨架搭建、已存在首个真实注册表/路由/入口与唯一运行时后）创建；**全局安装/升级 `lab-agent-toolkit` 本身或 0 代码空目录严禁创建或强填 `<...>` 占位符**。
  * **由谁创建**：一般由**消费方项目的 Agent** 结合本仓真实目录与运行时路径负责创建并自检，不通过中央脚手架硬编码注入。
* **SSOT 原则**：业务仓库**不得复制**本单元或 Playbook 的长篇方法论，只放极简本地路由映射（`AGENTS.md` 分级自查段 **`<= 12` 行**、`GEMINI.md` 执行守卫段 **`<= 6` 行**），并保留 `$(lab path orphan)/README.md` 指针。
* **标准复制模板与 4 项初始化验收清单**（行数预算、路径真实性、`preflight.conf` L1+L2 串联、`pre-commit` SAST 挂载）：完整模板见 [`templates/wiring/project-agents-gemini-templates.md`](./templates/wiring/project-agents-gemini-templates.md)。

---
*完整技术细节、业界横向对比矩阵与算法伪代码请参阅 [DESIGN.md](./DESIGN.md)。*
