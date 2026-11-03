# 02 — 从 0 搭建一个新项目

## 前置

- 你已经读过 [01-architecture.md](01-architecture.md)
- 你要建的是**多端、多 Agent 协作**的项目（单端小项目不需要 Group/Unit 全套，见 [AEF §20](../references/Agent-Engineering-Framework-AEF-v1.0.md) Minimal 结构）

## 三档目录结构（AEF §20）

先定档，再动手：

| 档位 | 适用 | 结构 |
|------|------|------|
| Minimal | 单人单端 | `.aef/{constitution,requirements,design,tasks}.md + evidence/` |
| Standard | 单端多 feature | `product/ architecture/ contracts/ units/ stories/ changes/ tasks/ evidence/` |
| Large | **多端多 Agent** | `group/ units/ stories/ changes/ tasks/ evidence/ agents/ workflows/` |

**多端多 Agent 项目直接上 Large 档**，本手册后续章节都按 Large 档讲。

---

## 步骤

### Step 1 — git init（不可跳过）

```bash
cd <new-project>
git init
```

为什么放第一步：并行 Agent 的隔离边界就是分支/worktree（[13-parallel.md](13-parallel.md)），没有 git 就没有隔离，Unit 隔离只能防"改错端"，防不了"两个 Agent 互踩"。

### Step 2 — 搭骨架

```text
<new-project>/
├── AGENTS.md                    # 根指令文件（全项目 Agent 都读）
├── constitution.md              # 项目宪法
├── group/
│   ├── product/
│   │   ├── intent.md            # 产品意图（一句话 + 为什么）
│   │   └── requirements.md      # 需求（EARS 风格，AEF §10.3）
│   ├── architecture/
│   │   ├── system.md            # 架构总览 + ADR 索引指向
│   │   └── dependency-graph.md  # 跨 Unit 依赖协调图（14 章）
│   └── contracts/
│       └── api.md               # 跨 Unit 契约
├── units/
│   ├── <unit-a>/AGENTS.md
│   └── <unit-b>/AGENTS.md
├── specs/                       # Spec Kit feature 产物
├── docs/
│   ├── PROGRESS.md              # 便携长期记忆（15 章）
│   └── backlogs/                # 待办捕获（07 章）
├── adr/                         # 架构决策记录（05 章）
│   └── INDEX.md
└── evidence/                    # 证据（11 章）
```

模板：`templates/` 下每个文件都有可直接拷的版本。**本手册不提供一键脚手架脚本**——每个项目的 Unit 切分和契约形态不同，脚本生成的骨架会诱导人照抄而不思考。

### Step 3 — 写 Constitution

见 [04-constitution.md](04-constitution.md)。

**门禁**：宪法未经人 review 之前，不要让任何 Agent 写代码。

### Step 4 — ADR-001 起步决策

至少先钉这几条（模板 `templates/adr/NNNN-template.md`）：

- 仓库形态：monorepo / polyrepo
- 跨 Unit 通信方式：HTTP / gRPC / 消息队列
- 设计权威：Figma？代码即设计？
- 国际化 / 主题等不可逆决策

见 [05-adr.md](05-adr.md)。

### Step 5 — 建依赖协调图

哪怕只有 2 个 Unit 也要建（`templates/group/architecture/dependency-graph.md`）。理由见 [14-dependency-graph.md](14-dependency-graph.md)：合并顺序错了会让先合的那端直接崩。

### Step 6 — 每个 Unit 建 AGENTS.md

拷 `templates/AGENTS.unit.md`，改包名/技术栈/验证命令。见 [03-units.md](03-units.md)。

### Step 7 — 装 Spec Kit

```bash
uv tool install specify-cli
specify init . --integration <你的 agent>
```

见 [06-spec-kit.md](06-spec-kit.md)。装完 `.specify/` 会被 git 跟踪，**必须提交**。

### Step 8 — 建 CodeGraph 索引

```bash
codegraph init     # 在每个 Unit 目录各跑一次
codegraph sync     # 改完代码后
```

见 [08-codegraph.md](08-codegraph.md)。

### Step 9 — 定项目级 Skills

至少一个"开发行为约束" skill（参照 OWSEL 的 `ios-vibe-coding`），见 [09-skills.md](09-skills.md)。

### Step 10 — 首个 feature 前的通读

给第一个要干活的 Agent 的 prompt 里显式要求读：根 `AGENTS.md` → 本 Unit `AGENTS.md` → `constitution.md` → [12-gates.md](12-gates.md)。

---

## 落地动作

```bash
mkdir <new-project> && cd <new-project> && git init
mkdir -p group/{product,architecture,contracts} units docs/backlogs adr evidence specs
cp <playbook>/templates/constitution.md .
cp <playbook>/templates/adr/NNNN-template.md adr/0001-*.md
cp <playbook>/templates/AGENTS.root.md AGENTS.md
# 之后逐项走 Step 3–10
```

> AEF 原文对应章节：§20 推荐目录结构、§6.1 Group、§13 Development Lifecycle、§19 Knowledge Model。
