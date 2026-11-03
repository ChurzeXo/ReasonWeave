# 新项目接入 Backlog（独立模块）· 提示词

> 用法：把下面整段复制，粘贴进**新项目**的 Agent 会话即可。

---

**【新项目接入 Backlog · 独立模块安装】**

待办捕获（backlog）已抽离为独立模块，位置：`~/Documents/lab/backlog/`（单一事实源，规范全貌见其 `README.md`）。实现 skill 已全局就绪：`~/Documents/Skill/backlog-capture/`（symlink 至 `~/.workbuddy/skills`、`~/.agents/skills`、`~/.claude/skills`）。**不要**把规范复制到本项目，只按下面接入：

1. **写一句指令**：在根 AGENTS.md 加一句：「识别到越界/待拍板/未来功能时，按 `~/Documents/lab/backlog/README.md` 规范记入 `docs/backlogs/`，不打断、不丢弃。」
2. **（可选）确认 skill 可用**：skill 已全局 symlink 就绪；若项目想自带，把 `~/Documents/Skill/backlog-capture/` 链接/拷贝到项目的 `.agents/skills/`。
3. **目录自动建**：`docs/backlogs/` 无需手工 `mkdir`，首次 `add` 会自动创建。
4. **校验**：跑 `node ~/Documents/Skill/backlog-capture/backlog.mjs add "测试" --body "做什么|卡在哪|谁拍板"`，确认生成 `docs/backlogs/001-*.md`。

完成后回复：① AGENTS.md 是否已加指令；② skill 接入方式（全局 symlink / 项目自带）；③ 首条测试条目是否生成。

---

> 本提示词由 `~/Documents/lab/backlog/` 维护，随模块版本演进更新。引用源：`~/Documents/lab/backlog/docs/new-project-prompt.md`。
