# 已用 playbook 的项目接入 Backlog（独立模块）· 提示词

> 用法：把下面整段复制，粘贴进**已经在使用 playbook** 的项目的 Agent 会话即可。新项目用 `new-project-prompt.md`。

---

**【给已接入 playbook 的项目 · Backlog 独立化迁移】**

待办捕获已从 playbook 抽离为独立模块，位置：`~/Documents/lab/backlog/`（单一事实源）。playbook 的 `07-backlog.md` 现已降级为「指针 + AEF 路由接线」。规范以**已实现的 skill**（`~/Documents/Skill/backlog-capture/`）为准——即「一任务一文件 + 数字 id + 关闭即删文件」。

请按下列步骤收敛：

1. **核对本地 `docs/backlogs/` 约定**：
   - 若已是「一任务一文件 + 数字 id + 关闭即删」，说明本就按 skill 约定写，**无需迁移**，只补第 3 步指令。
   - 若存在按 playbook 旧稿写的条目（`B-NNN` 编号 / 按主题聚合 / append-only 不删），**保持原样不动**，新条目按模块规范写即可。
2. **清理对旧稿的引用**：如项目 AGENTS.md / CONTRIBUTING 里写过 `B-NNN` / 主题聚合 / 不删约定，改为「详见 `~/Documents/lab/backlog/README.md`」。
3. **加一句指令**：根 AGENTS.md 加：「识别到越界/待拍板/未来功能时，按 `~/Documents/lab/backlog/README.md` 规范记入 `docs/backlogs/`，不打断、不丢弃。」
4. **校验**：确认 playbook `07-backlog.md` 在本项目是被引用而非被复制；确认新条目用数字 id + 一任务一文件。

完成后回复：① 本地是否已有 `docs/backlogs/` 及约定类型；② 有无旧稿 `B-NNN` 条目需保留；③ AGENTS.md 是否已加指令。

---

> 本提示词由 `~/Documents/lab/backlog/` 维护，随模块版本演进更新。引用源：`~/Documents/lab/backlog/docs/existing-project-prompt.md`。
