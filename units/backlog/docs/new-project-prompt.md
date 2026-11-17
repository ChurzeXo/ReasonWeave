# 新项目接入 Backlog（独立模块）· 提示词

> 用法：把下面整段复制，粘贴进**新项目**的 Agent 会话即可。

---

**【新项目接入 Backlog · 独立模块安装】**

待办捕获（backlog）已抽离为独立模块，位置可通过 `$(lab path backlog)` 动态获取（单一事实源，规范全貌见其 `README.md`）。**不要**把规范复制到本项目，只按下面接入：

1. **写一句指令**：在根 AGENTS.md 加一句：「识别到越界/待拍板/未来功能时，按 `$(lab path backlog)/README.md` 规范记入 `docs/backlogs/`，不打断、不丢弃。」
2. **目录与条目生成**：按「一任务一文件 + 数字 id + 关闭即删」原则在 `docs/backlogs/` 记录，首次记录会自动建目录。
3. **校验**：确认 `docs/backlogs/` 可正常写入，AGENTS.md 已接入动态指针。

完成后回复：① AGENTS.md 是否已加指令；② `docs/backlogs/` 是否就绪。

---

> 本提示词由 `units/backlog/` 维护，随模块版本演进更新。引用源：`$(lab path backlog)/docs/new-project-prompt.md`。
