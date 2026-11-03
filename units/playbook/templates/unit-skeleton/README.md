# Unit Skeleton

一个 Unit 的最小骨架。**不提供可执行脚手架**——Unit 怎么切、验证命令是什么，只有你知道，脚本生成的骨架会诱导照抄。

## 建一个新 Unit

```bash
mkdir -p units/<unit-name>
cp <playbook>/templates/AGENTS.unit.md units/<unit-name>/AGENTS.md
```

然后编辑 `units/<unit-name>/AGENTS.md`，**必须填满**：

- `Verification` 段的具体命令（没写验证命令的 Unit 不算建好）
- `Forbidden` 段的 ADR 编号
- `Tech Stack` 的版本基线

## 骨架目录

```
units/<unit-name>/
├── AGENTS.md          ← 从 templates/AGENTS.unit.md 拷（必建）
├── README.md          ← 人读的说明（可选，AGENTS.md 的补充）
├── docs/              ← 本端文档
├── .codegraph/        ← codegraph init 生成（必建，且提交 git）
└── <代码目录>
```

## 建完 Unit 之后必须同步的三处

1. `group/architecture/system.md` §2 Unit 清单加一行
2. `group/architecture/dependency-graph.md` 表 1 加行/列、表 3 重算顺序
3. 根 `AGENTS.md` 的 Repository Layout 加路径

**漏掉第 2 步 = 新 Unit 不在合并顺序里 = 有人会先合依赖方。**
