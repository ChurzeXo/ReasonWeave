# AGENTS.md — Backlog 独立模块维护指南

本文件给**维护本模块（`~/Documents/lab/backlog/`）的 Agent** 看，不是给使用 backlog 的项目看。使用方看 `README.md`；项目接入提示词见 playbook `07-backlog.md`（AEF 接线）。

## 定位与关系

- **本模块 = 规范单一事实源**。独立于任何项目 / playbook。
- **实现（skill）在别处**：`~/Documents/Skill/backlog-capture/`（SKILL.md + backlog.mjs + DESIGN.md），已 symlink 至 `~/.workbuddy/skills`、`~/.agents/skills`、`~/.claude/skills`。**规范改版时以本 README 为准，skill 的 DESIGN.md 是早期设计草案。**
- playbook 的 `07-backlog.md` 只是「指针 + AEF 接线」，不是本模块的副本。

## 核心约定（不变量，改动不得破坏）

1. **一任务一文件**：`docs/backlogs/<id>-<slug>.md`，入库 git，禁 `.gitignore`。
2. **关闭即删文件**（git 留史），backlog 只含活工作。
3. **id 仓库内递增数字、不复用**；已关闭未删的条目仍占用 id（撞号会二义）。
4. **三情形禁静默写入**：用户要求 / 一行确认后 / 无人可问（汇报必须带清单）。
5. **依赖方条目必带三行声明**（涉及仓 / 依赖方需要什么 / 现状）。

## 与 ADR 的关键差异（别混淆）

- ADR：**append-only，永不改已冻结原文**，变更走 Supersedes。
- backlog：**关闭即删**，靠 git 留史；没有「冻结/不改」概念。活决策碎片，不是决策记录。

## 版本化纪律

- 模板头部带版本：`<!-- backlog-template v1.0 · ... -->`。
- 改模板/规范 → bump `VERSION.md` + 写 `CHANGELOG.md` 迁移说明。
- **同步 skill**：改规范后，若与 skill 行为不一致，须同步 `~/Documents/Skill/backlog-capture/SKILL.md`（及其 `backlog.mjs` 行为），避免规范与实现再次漂移。

## 维护后的验证

改规范/模板后（若动了 CLI 则跑 `node --check`）：

```bash
cd /tmp && rm -rf bl-test && mkdir bl-test && cd bl-test
node ~/Documents/Skill/backlog-capture/backlog.mjs add "测试条目" --type future --body "要做什么|卡在哪|谁拍板"
node ~/Documents/Skill/backlog-capture/backlog.mjs list
node ~/Documents/Skill/backlog-capture/backlog.mjs status
cd /tmp && rm -rf bl-test
```

## 接入提示词（分发用）

- **新项目** → `docs/new-project-prompt.md`。
- **已用 playbook 的旧项目** → `docs/existing-project-prompt.md`。
- **已接入、需把依赖方铁律泛化** → `docs/existing-project-ironrules-prompt.md`。
三份按项目状态分发对应那份；内容与 README §7 一致。

## 红线

- **不要把本模块规范复制回项目仓库**（项目只按格式写 `docs/backlogs/`，细节读本 README）。
- **不要动 skill 的 symlink 结构**（三客户端 symlink 是既有事实，改它会造成单一真相源回归）。
- **不要把 playbook 的 AEF 路由边界（CR/handoff/ADR/spec-kit）搬进本模块**——那是接线，留在 playbook 07 章。
