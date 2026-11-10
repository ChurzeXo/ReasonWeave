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

---

## 2. 架构概览

```
units/orphan/
├── README.md               # 本规范入口
├── DESIGN.md               # 完整立项调研与架构设计方案 (必读)
├── VERSION.md              # 单一版本事实源
├── CHANGELOG.md            # 变更日志
├── bin/                    # CLI 命令行入口
├── core/                   # 核心求解器引擎 (Language-Agnostic)
│   ├── blob-reader.mjs     # Git HEAD 只读提取
│   ├── inverted-index.mjs  # 内存行级倒排索引
│   ├── classifier.mjs      # 引用三分类器
│   ├── protocol-s1-s3.mjs  # S1-S3 自检门禁套件
│   └── solver.mjs          # 统一求解器
├── adapters/               # 各技术栈专属适配器
│   ├── android/            # Android (Manifest / R / XML / Kotlin)
│   ├── python/             # Python (AST / pyproject / getattr heuristics)
│   ├── web/                # Web / TS (package.json / exports / assets)
│   └── assets/             # 通用静态资源与媒体文件
└── templates/              # 接入配置与 Preflight 门禁脚本模板
```

---

## 3. CLI 快速开始（草案设计）

```bash
# 1. 运行求解器自检协议（S1-S3 校验）
lab orphan test-solver

# 2. 全量扫描当前 HEAD 状态，输出结构化候选文件
lab orphan scan --out candidates.json

# 3. 增量提交门禁校验（与 pre-commit 集成，阻断新引入孤儿）
lab orphan check-diff --staged

# 4. 受控安全清理（支持 dry-run 演练）
lab orphan clean --candidates candidates.json --dry-run
```

---

## 4. 与现有工作流协同

1. **左移防腐（`units/preflight`）**：通过 `templates/30-orphan-guard.sh` 挂载至项目 `.githooks/pre-commit.d/`，将孤儿增量拦截在提交之前；
2. **安全审查（`units/review-gate`）**：清理前后自动比对 `candidates.json` 求解器差集，输出 SAST 审计证据；
3. **闭环交付（`units/handoffs`）**：在工单中附带证据路径与 commit SHA，配合 `baton-audit-runner` 进行双盲独立重跑验收。

---
*完整技术细节、业界横向对比矩阵与算法伪代码请参阅 [DESIGN.md](./DESIGN.md)。*
