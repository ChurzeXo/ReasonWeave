# 一期一卉花 接入 review-gate · 定制提示词

> 给用户：把下方整段复制，粘贴进 **一期一卉花项目**（`~/Documents/Developer/一期一卉花`）的 Agent 会话即可。
> 定制依据：微信小程序（JS）+ 云函数（Node）· 无 remote · **无 .githooks（全新挂载，最简单）** · 无 `.semgrepignore` · **中文路径，命令必须加引号**。

---

**【给一期一卉花项目 · review-gate 评审防线接入（小程序+云函数定制版）】**

两层评审防线已抽离为通用模块，位置：`~/Documents/lab/review-gate/`（单一事实源，规范见其 `README.md`）。本机 OpenGrep **已全局装好**（`~/.local/bin/opengrep`，v1.30.2，standalone binary，非 npm），无需重装。Layer-2 是 WorkBuddy 内置 `code-review-and-quality` 技能，全局可用。

本仓事实（已替你核对，直接用）：路径 `~/Documents/Developer/一期一卉花`（**中文目录名，所有命令里的路径必须加双引号**）；语言栈 = **微信小程序前端**（`miniprogram/`：JS/WXSS/WXML）+ **云函数**（`cloudfunctions/`：Node，含 goods/inventory/rbac 模块）；**无 git remote**（PR 驱动的 CodeRabbit/PR-Agent 类工具失效，本地 review 是兜底）；**无** `.githooks`（全新挂载）；**无** `.semgrepignore`；根 `package.json` 仅有 test script。

请按下列步骤收敛（**不要**把模块规范复制进本仓，仓里只放指针 + 一句指令）：

1. **落地模板**：`mkdir -p "/Users/churze/Documents/Developer/一期一卉花/.githooks"`，复制模块 `templates/pre-commit` → `.githooks/pre-commit`、`templates/.semgrepignore` → 仓根、`templates/scan.sh` → `review-gate/scan.sh`（`mkdir -p review-gate`）。`.semgrepignore` 确认已含 `node_modules/`、`miniprogram/` 下的图标字体等资源目录（不需要扫的二进制资源），缺则补。
2. **规则集**：`RULESETS="p/default p/typescript p/javascript"`（写进 `review-gate/scan.sh` 与 `.githooks/pre-commit` 顶部默认值）。
3. **跑基线并人工过目**：`cd "/Users/churze/Documents/Developer/一期一卉花" && RULESETS="p/default p/typescript p/javascript" bash review-gate/scan.sh review-gate/baseline/baseline.json`。打开产物**逐条判断**：误报/可接受 → 留作已知信号（基线）；真问题 → 先修或记 `docs/backlogs/`（规范见 `~/Documents/lab/backlog/README.md`）。**基线是你主动接受的清单，不是自动信任。** 重点关注 `cloudfunctions/`（Node 服务端，注入/密钥/不安全传输类规则在这里最相关）；`miniprogram/` 老式 JS（var、全局函数）可能有风格类命中，按可接受处理或 nosem 豁免。
4. **挂载门禁**：`git -C "/Users/churze/Documents/Developer/一期一卉花" config core.hooksPath .githooks`（per-repo local，不加 `--global`；新克隆需重跑）。
5. **加一句指令**：根 `AGENTS.md` 与 `CLAUDE.md`（两个都在，都加）各加：「静态扫描与提交门禁按 `~/Documents/lab/review-gate/README.md` 接入；改基线前先人工 review。」
6. **校验**：① 构造一次会触发新发现的改动（如临时文件用 MD5），确认 `❌` 阻断、`EXIT=1`，然后清理；② 对含已知信号的文件做临时改动后提交，确认 `✅ passed`；③ 清理后 `git status` 核对只有预期改动。

**硬约束**：
- 本次只碰仓根配置与 hook（`.semgrepignore`、`review-gate/`、`.githooks/`），**不得编辑任何业务代码**（`miniprogram/`、`cloudfunctions/` 都不碰；基线过目发现真问题时：修 or 记 backlog 由用户拍板）。
- 不得碰工作树里用户既有的未提交文件；提交前 `git status` 全量核对、精确 stage 自己的文件。
- 只本地 commit，**不 push**（本仓无 remote）。
- 中文路径纪律：命令、脚本内路径一律双引号；提交信息用 ASCII。
- 别改坏模板里两处已验证的关键逻辑：**path 归一化**（opengrep 对绝对路径入参回写绝对 path，比较前必须归一化为仓库相对路径）与 **SCAN_EXTS 正则**（用 `\.(${SCAN_EXTS// /|})$` 字符串替换构造，勿退化成数组连接）。
- **诚实预期**：小程序生态的 SAST 规则很少，主要靠 `p/default` 通用规则 + `p/javascript`；这一仓的防线重心实际在 Layer-2（`code-review-and-quality`）——接入后对 cloudfunctions 的改动应常态跑 Layer-2 review，别指望 Layer-1 全覆盖。

完成后回复：① 模板落地路径；② 基线 findings 数量与人工过目结论（接受/修复/backlog 各几条，cloudfunctions 与 miniprogram 分开说）；③ 门禁挂载方式与三项校验结果。

---

> 本提示词由 `~/Documents/lab/review-gate/` 维护（v1.0.5 定制分发）。引用源：`~/Documents/lab/review-gate/docs/transfers/yiqiyihuihua.md`。
