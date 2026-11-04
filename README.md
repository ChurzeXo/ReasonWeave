# Lab — Agent 工程能力库

> 一套**可复用的 Agent / AI 辅助工程纪律模块集合**（采用 ZSpec / AEF v1.0 架构）。  
> 每个模块独立、正交，按需挑选接入项目；规范以「单一事实源」方式集中在本库，项目里只放**指针 + 一句指令**。

---

## 快速导航

- 📋 **消费方接入与改造提示词大全**：👉 [docs/CONSUMER-PROMPTS.md](docs/CONSUMER-PROMPTS.md)（新项目接入 / 老项目平滑升级，直接复制即可使用）
- 📖 **详细使用指南**：[使用说明.md](使用说明.md)
- 📜 **工程宪法**：[constitution.md](constitution.md)
- 🤖 **Agent 维护守则**：[AGENTS.md](AGENTS.md)
- 📐 **架构与依赖图**：[group/architecture/dependency-graph.md](group/architecture/dependency-graph.md)
- 📦 **NPM 打包契约**：[group/contracts/npm-packaging.md](group/contracts/npm-packaging.md)

---

## 模块清单 (Units)

| 模块 (Unit) | 路径 | 解决什么 |
|---|---|---|
| **adr** | [`units/adr/`](units/adr/) | 架构决策记录（ADR），三档强度 light / standard / frozen，跨会话架构记忆 |
| **backlog** | [`units/backlog/`](units/backlog/) | 待办捕获：越界 / 待拍板 / 未来功能，一任务一文件 |
| **preflight** | [`units/preflight/`](units/preflight/) | 不变量探针 + Git 提交门禁，防止“做完才发现还有一件事” |
| **review-gate** | [`units/review-gate/`](units/review-gate/) | 本地 SAST 扫描 (OpenGrep) + 本地 review 门禁 |
| **handoffs** | [`units/handoffs/`](units/handoffs/) | 跨仓 / 仓内离线交接枢纽（`handoff.mjs` 引擎） |
| **playbook** | [`units/playbook/`](units/playbook/) | Agent Engineering Framework (AEF) 完整方法论手册与模板库 |

> **向后兼容提示**：根目录下保留了指向各 Unit 的同名软链接（如 `lab/preflight`、`lab/handoffs` 等），确保已接入的本地项目路径不受任何影响。

<!-- handoff-stub:v2.1 begin -->
<!-- generated — do not edit -->
<!-- stub:sha256:e954015f -->
### Handoff 接入桩（强制守卫 · 细则以 $(lab path handoffs)/README.md 契约 v2.15.0 为准）

**早拦 Preflight（强制）**
- **命令形态**：一律 `handoff <op>`（PATH shim → 中央引擎；幂等自愈 `handoff link`）。若报 `command not found: handoff`：运行 `handoff link` 自愈（或通过 lab-agent-toolkit 重新 `npm link`）。
- 调用 `show/receipt/accept/reject/check` 前，**必须先跑** `handoff status`（执行方冷启动用 `handoff status --for <本方 lane|target>` 直取本方待办）且其输出在上下文中。
- **状态语义（v2.12.5 ·「进行中」唯一定义，与 README/AGENT-GUIDE 同义）**：「进行中」= 未闭环（`status ≠ closed`）且归属当前方。**待办 = `draft` + `forwarded`**——落我归属即该我动工（含驳回退回的返工单），`forward` 只是发起方可选的事后标记，**严禁**用「`draft`/`forwarded` 不处理」判退（旧桩此条与 README v2.7 直接相悖、且把同仓新单全量拉黑，v2.12.5 废）；`received` = 已回执、执行方跳过（发起方收回执=审计）；`closed` 不处理；`accepted`/`rejected` 为废止状态、不存在。
- 指定 ID 必须在「进行中」且归属当前方（仓内：`to_lane == 当前 lane`；跨仓：落在目标收件箱且未闭环）。找不到→停下并说明。
- 未指定 ID 却有多条归属当前方的待办（draft/forwarded）→ 列出清单请用户点名，不擅自选。
- receipt 前确保 status 快照 **< 60 分钟**（超时重跑）。
- 仓内优先读 frontmatter `workspace`（same/separate），禁用 mtime 推断。
- 执行方**只写 receipt**，**不做 accept/reject**。
- 回执正文唯一源 = `$(lab path handoffs)/RESPONSE-TEMPLATE.md`：**照抄其「回执模板（可直接复制）」骨架**（含 evidence 字段；仓内同工作区免写转递提示词节），勿另起格式、勿凭记忆重建（骨架外 = 没有）。
- **evidence 硬门禁（v2.12.3）**：仓内新回执（2026-10-14 起）**必须**附可核验证据 `--evidence-paths "真实文件,..."` / `--evidence-commits "<sha>"`（无文件改动用 `--evidence-note "<原因>"`）；声称的路径须真实存在、提交须 `git cat-file -e` 可查，否则 receipt / accept / check 三处拒收。**只声明不改 = 伪回执**（2026-10-13 goods-stores 事故教训）。
- 收尾必须 `handoff check` exit 0（2026-10-13 起回执须「非空正文 + 含 ## 节 + 含『状态 / 结论』锚节」；v2.15.0 减负：仓内同工作区已有状态机监听自动唤醒，免写「## 转递提示词」节；仅跨仓回执须含该节；存量豁免）。
- **回复收尾（v2.15.0 减负）**：仓内同工作区回执免转递、免产出回复末块 `## 转递提示词`（执行方登记回执即完成，发起方由后台监听自动唤醒）；仅跨仓 / separate 产生转递词时，回复最末块固定为 `## 转递提示词`（其下一行转递提示词，其后无任何正文）。
- **审计动作契约（v2.13 · to_lane=audit 强制）**：审计方（接收方 to_lane=audit）**严禁仅静态读码**——必须在终端**独立执行**交接文档「验收判据」中的**所有测试与校验命令**，以实测输出为唯一准绳，**严禁采信自报**（执行方回执里的「已通过」一律视为待验证声明，不采信）。其余 lane 亦建议独立实测，但审计 lane 为硬纪律。
- **仓内提示词用自然角色（v2.13）**：同仓提示词**严禁出现项目名 / lane slug 当角色**（如「请 Tappy 收交接」「请 impl lane 收交接」）。出站 = `请【<目标角色>】接单：<交接路径>（<主题>）`；入站回执交付 = `请【<发起角色>】查收【<本方角色>】回执：<回执路径>（<结论> · 是否需改动：<是/否>）`。角色由 lane 映射（impl→实现方 / audit→审计方 / arch·design→架构设计方；`.handoff-hub.json` 的 `lane_labels` 可覆盖）。
- **防提前闭环（v2.13）**：回执**必须由接收方 to_lane 独立撰写**——发起方（from_lane）禁止自填回执、禁止未收到真实回执前预填；窗口声明 `HANDOFF_LANE=<本方 lane>` 后，引擎据身份硬拒越界 / 自填，并在 receipt 落 `author_lane`、accept/check 双侧核验。

**最小操作序列（出站 = 建/发交接 · 强制闭环）**
1. `handoff new <target|lane> <type> "<标题>"` 并填写正文
2. **转递并挂起后台监听（必须执行）**：
   执行 `handoff forward <ID> --wait`（置于后台运行 `run_in_background: true`）
   ——一条命令完成标记转递、打印提示词与挂起待机；回执到达后 Exit 0 自动唤醒本会话进行独立验收闭环（跨仓与同仓多窗口均适用）。
3. （若需给对方发消息）将控制台打印的转递提示词贴在**回复最末块** `## 转递提示词` 下（仓内 `workspace=same` 免转递，此步跳过）。

**最小操作序列（入站 = 接单/回执 · v2.15.0 减负）**
1. `handoff status --for <本方 lane|target>`（冷启动直取本方待办；全量 `handoff status` 供发起方巡检）
2. 从「待办」（draft/forwarded）筛选归属当前方（仓内 `to_lane == 当前 lane`；跨仓 = 落在目标收件箱）→ 确认目标 ID
3. `handoff show <ID>`
4. 按边界最小改动（仅该 lane 应改文件）
5. 写回执：**照抄 `$(lab path handoffs)/RESPONSE-TEMPLATE.md` 骨架**（仓内同工作区免写转递提示词节）→ `handoff receipt <ID> -n "<正文>" --evidence-paths "真实文件,..." --evidence-commits "<sha>"`（仓内必附 evidence；无文件改动用 `--evidence-note`）
6. `handoff check`（exit 0）
7. **自动唤醒闭环（v2.15.0 减负）**：仓内同工作区免转递、免产出回执交付行（发起方由后台监听自动唤醒，执行方正常结束回合）；仅跨仓 / separate 保留末块转递行收尾。

详见 `$(lab path handoffs)/AGENT-GUIDE.md` 获取完整版 Preflight。
<!-- handoff-stub:v2.1 end -->
