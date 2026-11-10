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
*完整技术细节、业界横向对比矩阵与算法伪代码请参阅 [DESIGN.md](./DESIGN.md)。*
