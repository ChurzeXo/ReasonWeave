# 审计报告：Handoff Hub v2.12「接入桩真·单一源 + 生成件完整性」独立审计

> 审计员：INDEP01（独立会话，与 2026-10-14 修复方不同）
> 需求来源：`AUDIT-2026-10-14-v2.12-stub-integrity.md`
> 审计时间：2026-10-14
> 方法：真实 hub 只读取证 + 完整副本内做破坏性测试 + 沙箱 `HOME` 隔离全局载体
> 原则：不采信需求文档的断言；无证据视为未做

---

## 1. 结论

**总判定：有条件通过（Conditional Pass）**

v2.12 的**核心主张经实测全部成立**——marker 包裹已恢复、`stub:sha256` 确为实算、`install` 幂等且能去重、`checkStubCarrier` 三重探测有效、`check` 基线 101/98 exit 0 未被误伤。§3「基线事实」逐条复核**全部属实**（含 `5e4115fa` 与全部符号行号）。

但审计**新发现 10 个问题**，其中 1 个为静默数据损毁（P0）、1 个为未捕获异常导致部分写入（P1）。**建议在下一修订修掉 F1/F2 后，再把 `install` 用于会写用户文件的场景。**

| 档 | 结果 |
|---|---|
| Tier 1（9 项） | 8 PASS / 1 部分不符（T1-6 `--global` 越权写 cwd README） |
| Tier 2（7 项） | 5 PASS / 1 FAIL（T2-1 正则过度匹配）/ 1 部分（T2-6 文档缺口） |
| Tier 3（抽查） | T3-1 抽查 5/5 PASS、T3-2 PASS、T3-3 PASS |
| 红队（7 项） | 6 PASS / 1 FAIL（第 5 项正则注入，= F1） |

---

## 2. 环境与隔离声明

| 项 | 实测 |
|---|---|
| hub 根 | `~/Documents/lab/handoffs/` |
| git | `fatal: not a git repository` → 非 git ✓ |
| `.handoff-hub.json` | 根无此文件 → 跨仓模式，`ROOT = SCRIPT_ROOT` ✓ |
| 完整副本 | `mktemp -d` + `cp -R` 全量复制（含自带 `handoff.mjs`） |
| **额外隔离** | **沙箱 `HOME=/tmp/hubaudit-home`**（见 F9：副本本身不隔离全局载体） |

**隔离补足说明（重要）**：`cmdInstall`（`handoff.mjs:1013`）与 `checkStubCarrier`（`handoff.mjs:696`）都取 `process.env.HOME`，而 hub 副本只隔离 `ROOT`（=`SCRIPT_ROOT`）下的文件。**只复制 hub 并不能隔离 `~/.claude/CLAUDE.md` 与 `~/.config/opencode/AGENTS.md`** —— 在副本里跑 `install` 仍会改真实全局载体。本审计额外设置沙箱 `HOME` 规避。审计需求 §6「完整 hub 副本」的隔离保证对这两个文件**不成立**（F9）。

---

## 3. 逐项表

### Tier 1 — v2.12 变更集

| # | 判据 | 方法（命令要点） | 结果 | 证据 |
|---|---|---|---|---|
| T1-1 | `STUB_BLOCK` 结构正确 | 从源码截取 `const STUB_MARKERS`…`const STUB_BLOCK` 区段，用 `new Function('crypto', seg+'return {...}')(crypto)` **运行时求值** | **PASS** | `STUB_BLOCK` 首 4 行 = `<!-- handoff-stub:v2.1 begin -->` / `<!-- generated — do not edit -->` / `<!-- stub:sha256:5e4115fa -->` / `### Handoff 接入桩（…v2.12 为准）`；末行 = `<!-- handoff-stub:v2.1 end -->`；`markers_in_block` 四项全 `true` |
| T1-2 | sha 是真 `sha256(STUB_BODY)` 前 8 位 | 同上运行时求值后 `crypto.createHash('sha256').update(STUB_BODY).digest('hex').slice(0,8)`；再用**独立路径**（从 5 个载体文件反推 body 再哈希）交叉验证 | **PASS** | `STUB_SHA_declared=5e4115fa`，`STUB_SHA_recomputed=5e4115fa`；`body_has_backtick=true`（规避了 §3 转义陷阱）；5 载体反推值**全部** `5e4115fa`；≠ 旧值 `1316b0a0` |
| T1-3 | 5 载体各恰 1 份且 canon 一致 | `STUB_REGION_RE` 取块 + `STUB_CANON` 归一，对比 5 路径 | **PASS** | 5 条全部 `regions=1 canonEqStd=true sha=5e4115fa`（hub `AGENTS.md`/`CLAUDE.md`/`README.md` + `~/.claude/CLAUDE.md` + `~/.config/opencode/AGENTS.md`） |
| T1-4 | `install` 幂等 | 副本内 `node handoff.mjs install` 连跑 3 次 | **PASS** | 3 次均输出 5 条 `↩️ 已是最新` + `全部无需变更。`，exit 0 |
| T1-5 | `install` 去重且保留周围内容 | 造 2 份桩（README + opencode 载体）→ `install` → 比对「非桩部分」sha256 | **PASS** | 输出 `🧹 去重 + 更新桩（原 2 份 → 1）`；去重后 `regions=1 canonEqStd=true`；非桩部分 sha256 前后完全一致：opencode `031ee5fb9b3f4efa`↔`031ee5fb9b3f4efa`（808 字节）、README `1855833ed1852238`↔`1855833ed1852238`（30264 字节） |
| T1-6 | `install` 目标集合正确 | 分别跑 6 种 flag 组合，列出写入文件 | **部分不符** | 无 flag=5 ✅；`--project`=cwd 3 件 ✅；`--no-readme`=4 ✅；**`--global`=3（含 cwd `README.md`）❌ 与「只全局」不符**（F3）；`--project --global` 退化成只写 cwd README 1 件 |
| T1-7 | `checkStubCarrier` 三重探测 | 副本内分别：① 正文改 1 字节 ② 复制成 2 份 ③ 只改 sha 值 → 各跑 `check` | **PASS** | ① `EXIT=1` `[桩] 载体漂移/被手工改: …/AGENTS.md`；② `EXIT=1` `[桩] 载体含 2 份接入桩（应恰 1）`；③ `EXIT=1` `[桩] 载体内嵌 sha(deadbeef) ≠ 实算(5e4115fa)` —— 三者均点名文件 |
| T1-8 | 无桩（手写指针）不误报 | 载体改为「含 `handoffs/README.md` 引用但无桩」的一般文本 → `check` + `install` | **PASS** | `check EXIT=0`（不报）；`install` 输出 `⚠️ 跳过（手写指针，无标准桩标记）` 且**未追加**内容 |
| T1-9 | `check` 基线未被误伤 | 真实 hub 只读跑 `node handoff.mjs check` | **PASS** | `✅ check 通过: 101 份交接 / 98 份回执，全部合规`，exit 0 |

### Tier 2 — 桩系统边界与文档一致性

| # | 判据 | 方法 | 结果 | 证据 |
|---|---|---|---|---|
| T2-1 | `STUB_REGION_RE` 不误吞正文 | 构造「用户正文含 `### Handoff 接入桩（…` 标题 + 其后有真正的桩」的样本，观察匹配边界 | **FAIL** | 匹配数=1，**起点=8（用户标题处）长度=1955**，末行停在桩正文的 `详见 …获取完整版 Preflight。` —— 整段用户正文被吞进匹配区。见 **F1** |
| T2-2 | `STUB_CANON` 无假阴性 | 9 例归一化矩阵 | **PASS**（含 1 例 P2 观察） | 实质改动均判「异」：改标点、改版本号(v2.12→v2.11)、删整行；按设计判「同」：去掉生成注、改 sha（由 sha 分支另行拦截）、v2.0 marker、尾随空格。**CRLF 行尾被判「异」** → 见 F8 |
| T2-3 | marker 丢失能否自愈 | 副本内删 `begin/end` 两行留正文与生成注 → `check` → `install` → `check` | **PASS（install 侧）/ 缺口（check 侧）** | `install` 成功补回 marker（头部恢复为 `<!-- handoff-stub:v2.1 begin -->`），修复后 `regions=1 canonEqStd=true`、`check EXIT=0`；**但修复前 `check EXIT=0` —— check 检不出 marker 丢失**（见 F6） |
| T2-4 | 全局桩非桩内容不被破坏 | 比对 opencode 载体 `CODEGRAPH` 段 | **PASS** | 去重前后 `<!-- CODEGRAPH_START -->`(行1) / `<!-- CODEGRAPH_END -->`(行10) 均在，非桩部分 sha256 一致 |
| T2-5 | README §接入桩 前后内容完好 | 与变异前副本比对 README 非桩部分 | **PASS** | 非桩部分 30264 字节、sha256 `1855833ed1852238` 前后完全一致；`## 注意` 节、`# 公共交接目录` 标题均在 |
| T2-6 | 文档一致性 | 通读三文档 v2.12 条目 + 安装用法表 | **部分不符** | `README.md:5` = `契约版本 v2.12（2026-10-14）` ✅；CHANGELOG:106-110、DESIGN:171/188 均有 v2.12 条目 ✅；无残留「以 v2.11.1 为准」 ✅；**`--no-readme` 未进任何用法表**（F7）；AGENT-GUIDE.md 零处 v2.12（仅 `## receipt 强制模板（v2.11）`，P2 观察） |
| T2-7 | 载体指针不复制细则 | 比对 `STUB_BODY` 与 README 正文 | **PASS** | 桩正文 29 行 = 早拦 Preflight(10 条) + 出站/入站序列 + 指向 `AGENT-GUIDE.md` 的指针；README 中「早拦 Preflight（强制）」(行314)、「最小操作序列」(行326/331) **均位于桩区块内部**（行312–338），非第二份副本 → 无重复细则 |

### Tier 3 — 引擎其余门禁

| # | 判据 | 方法 | 结果 | 证据 |
|---|---|---|---|---|
| T3-1 | `check` 回测矩阵（抽查 5 例） | 副本内造非法样本各跑 `check` | **PASS** | 非法文件名→`[交接] 文件名不符合命名规范: BAD-20261014-01-bug.md`；缺 frontmatter→`缺 frontmatter`；非法 target→`target 非法(nope)`；closed 缺回执+缺验收记录→两条报文；孤儿回执→`[回执] 孤儿回执（无对应交接）`。**5/5 均 EXIT=1** |
| T3-2 | 阈值豁免逻辑 | 造阈值日 `2026-10-13` 前/后回执各一（均缺「## 转递提示词」节）+ COREML 一份 | **PASS** | `2026-10-12` 豁免（未报）、`2026-10-14` `EXIT=1` 硬校验、`COREML-*` 豁免（未报）—— 报文精确：`[回执] 缺「## 转递提示词」节 …: SWOOP-20261014-77-bug-resp.md` |
| T3-3 | 「先查状态」门禁 | 删 `/var/folders/.../handoff-last-status-<hash>.json` 后跑 `receipt`；跑 `status` 后再跑；`HANDOFF_STATUS_GATE=off` | **PASS** | ① `EXIT=1` `❌ 「先查状态」前置门禁未过…（本会话从未跑过 handoff status，要求 60 分钟内）`；② `EXIT=0` `✅ 已登记回执`；③ `EXIT=0` 放行。清理后副本 `check` 复位 EXIT=0 |

### 红队

| # | 判据 | 结果 | 证据 |
|---|---|---|---|
| 1 | 篡改 1 字节即报 | **PASS** | = T1-7①，EXIT=1 |
| 2 | 重复即报 | **PASS** | = T1-7②，EXIT=1 |
| 3 | sha 篡改即报 | **PASS** | = T1-7③，EXIT=1 |
| 4 | marker 回归复现 | **PASS** | = T2-3，install 可自愈（check 检不出，见 F6） |
| 5 | 正则注入 | **FAIL** | 见 T2-1 / **F1**：install 实测删除用户正文 |
| 6 | cwd 越权 | **PASS** | 从 `/tmp/rt6` 跑 install，真实 hub 6 个文件哈希全部与基线一致（`3902c6e2…`/`c38ef998…`/`97e88ab5…` 等）；全局载体亦未变（沙箱 HOME）。**但**默认行为仍会写 `$HOME` 两个全局文件（设计如此，非越权） |
| 7 | 跨仓 ROOT 陷阱反例 | **PASS（机制已证明）** | 诱饵对 A/B（A=102 交接，B=77 交接）：`cd B && node ./handoff.mjs check` → B 的 `❌ check 未通过（23 个问题）`；`cd B && node /tmp/rt7A/handoff.mjs check` → **A 的** `✅ check 通过: 101 份交接 / 98 份回执`；写命令实证：`cd B && node /tmp/rt7A/handoff.mjs new swoop bug …` → 文件落在 **`/private/tmp/rt7A/handoffs/SWOOP-20261014-01-bug.md`**（不是 B）。全程用诱饵，**未触碰真实 hub** |

---

## 4. 新发现的问题

### F1 · P0（阻断）· `STUB_REGION_RE` 过度匹配 → `install` **静默删除用户正文**

- **触发条件**：某文件在**桩之前**的正文里出现以 `### Handoff 接入桩（` 开头的标题（例如项目自己写了同名章节、或在代码块里引用了桩），且其后存在 `获取完整版 Preflight。`
- **复现**：
  ```bash
  # 构造：用户正文标题 + 真正的标准桩
  # "# 项目文档\n\n### Handoff 接入桩（这是我自己的章节标题，不是桩）\n\n这里是我对接入桩的说明文字，属于正文，应当被保留。\n\n" + STUB_BLOCK
  node handoff.mjs install
  ```
- **实测结果**：
  - 匹配区 `起=8 长=1955`，起点落在**用户标题**上 → `install` 把它连同说明文字一并删除；
  - install 后 `grep -c "这里是我对接入桩的说明文字"` = **0**（已删）、`grep -c "这是我自己的章节标题"` = **0**（已删）；
  - 文件里残留**孤儿** `<!-- handoff-stub:v2.1 end -->`（`grep -c` = 2）；
  - **事后 `check` EXIT=0、`regions=1 canonEqStd=true` —— 完全静默，无任何告警。**
- **根因**：`handoff.mjs:972` 的第二分支
  `(?:<!-- generated … -->\n<!-- stub:sha256:… -->\n)?### Handoff 接入桩（[^\n]*\n[\s\S]*?获取完整版 Preflight。`
  只靠**起始标题 + 尾句**锚定、中间用 `[\s\S]*?` 任意匹配，且该分支在**文件中出现得更早**（扫描自左向右，先于 marker 分支命中）。marker 分支因此被"抢跑"，整段被误判为桩。
- **建议最小修法**：让第二分支**只在不存在 marker 块时**才启用。两选一：
  1. 先 `if (c.includes(STUB_BEGIN))` 用 marker 正则，否则才用 heading 分支（改动最小）；
  2. 给 heading 分支加否定约束：开头加 `(?<![\s\S]*<!-- handoff-stub:v2\.\d+ begin -->)` 或把中间段收紧为 `(?:(?!<!-- handoff-stub:v2\.\d+ (begin|end) -->)[\s\S])*?`，并强制其**不跨越** marker。
  另建议：`install` 在"被删内容含非桩文本"时改为告警而非静默替换。

### F2 · P1 · `install` 遇 `~/.claude/` 或 `~/.config/opencode/` 目录不存在 → **未捕获 ENOENT 崩溃 + 部分写入**

- **复现**：
  ```bash
  D=$(mktemp -d); cp handoff.mjs "$D/"; cd "$D"
  mkdir -p "$D/home_none"          # HOME 存在，但 .claude / .config/opencode 均不存在
  printf '# 项目\n' > AGENTS.md
  HOME="$D/home_none" node handoff.mjs install
  ```
- **实测结果**：
  ```
  ✅ 已写入桩: …/AGENTS.md
  ✅ 已写入桩: …/CLAUDE.md
  Error: ENOENT: no such file or directory, open '…/home_none/.claude/CLAUDE.md'
      at cmdInstall (file:///…/handoff.mjs:1050:8)
  ```
  exit≠0，抛出 **Node 栈回溯**（非友好报错）；`AGENTS.md`/`CLAUDE.md` **已被写入**（部分完成）。
- **连带后果（针对 v2.12 主打功能）**：`targets` 顺序为 `[cwd AGENTS, cwd CLAUDE, ~/.claude/CLAUDE.md, ~/.config/opencode/AGENTS.md, cwd README]`，崩溃发生在第 3 项 → **cwd `README.md` 永远轮不到写入**。即"README §接入桩 纳入 install 目标"在这类环境（新机器、未装 Claude Code / opencode）**静默失效**。
- **根因**：`handoff.mjs:1037` 与 `1050` 的 `fs.writeFileSync` 无 `mkdirSync(dirname, {recursive:true})`，也无 try/catch。
- **建议最小修法**：写前 `fs.mkdirSync(path.dirname(t), { recursive: true })`；并用 try/catch 包住单个目标的写入，失败时告警并**继续处理其余目标**（避免部分完成）。

### F3 · P2 · `--global` 未抑制 cwd `README.md`

- **实测**：`install --global` 输出 3 个文件，其中 `✅ 已写入桩: /private/tmp/t16d_global/README.md`。
- **根因**：`handoff.mjs:1022` 的 README 目标只受 `--no-readme` 控制，未纳入 `--global` 分支。
- **影响**：在任意仓库跑 `install --global` 会**新建/改写该仓库的 README.md**（若该仓库无 README，则凭空生成一个只含 hub 桩的 README）。
- **建议**：`if (!args.includes('--no-readme') && !args.includes('--global'))`。

### F4 · P2 · 去重分支对**整份文件**做空白规范化，会静默重排用户排版

- **实测**：文件含 3 个连续空行 + 桩，`install` 后非桩部分由
  `"# 标题\n\n\n\n段落A（3空行保留）\n\n\n段落B\n\n\n"` 变为 `"# 标题\n\n段落A（3空行保留）\n\n段落B\n\n\n"`。
- **根因**：`handoff.mjs:1034` `c.replace(STUB_REGION_RE,'').replace(/^\n+/,'')**.replace(/\n{3,}/g,'\n\n')**.replace(/\s+$/,'')` —— 该规范化作用于**全部剩余内容**，而非仅桩接缝处。
- **影响**：用户刻意的多空行排版被改；当前 5 个载体恰好是规范形态故未触发（这也是 T1-5 能通过的原因）。
- **建议**：把 `/\n{3,}/g` 的作用范围限制在被删除区域的接缝（例如先记录 regions 位置，仅对接缝做压缩）。

### F5 · P2 · `findStubBlock` / `STUB_MARKERS` / `STUB_BEGIN` / `STUB_END` 已成**死代码**，文档叙事与实现不符

- **实测**：`grep -nE "findStubBlock" handoff.mjs` 只命中 `962:function findStubBlock(c) {` —— **零调用点**。`STUB_MARKERS` 仅被 `findStubBlock`(963) 与 `STUB_BEGIN/END`(958-959) 使用；`STUB_BEGIN` 另有 2 处用于拼装与文案(1011/1045)。
- **影响**：v2.12 之所以不再出现"install 跳过 / check 形同虚设"，**并不是因为 `findStubBlock` 被修好**，而是整条链路改走 `STUB_REGION_RE`（`install:1031` / `check:710`），把 marker 检测**旁路**了。而 README:10、CHANGELOG:107、DESIGN:188 三处仍按"findStubBlock 恒 null"叙事，读者按图索骥会找错位置。
- **建议**：删除 `findStubBlock`（或补注释说明其保留用途）；把三处文档叙事改为"install/check 统一走桩区块正则（兼容无 marker 历史块）"。

### F6 · P2 · `check` **检不出 marker 丢失**（T2-3 修复前 EXIT=0）

- **实测**：剥离 `begin/end` 两行后 `check EXIT=0 ✅ check 通过`。
- **根因**：`STUB_CANON` 会把 marker/生成注/sha 全部剥掉，marker 有无对归一结果**无影响**（矩阵中"⑨ v2.11.1 回归态"判 canon 同）。
- **影响**：marker 丢失不影响 install 自愈（install 能补回），故风险有限；但"载体缺 marker"这一形态在 check 层完全不可见。
- **建议**：如需检出，在 `checkStubCarrier` 增加一条 `regions[0]` 是否含 `STUB_BEGIN` 的检查。

### F7 · P2 · `--no-readme` 未进入任何命令用法表

- **实测**：`grep -nE "no-readme"` 在 README/CHANGELOG/DESIGN/COMMANDS/AGENT-GUIDE 中**仅命中变更说明散文**（README:10、CHANGELOG:110）；用法表 `README.md:255`、内建 usage `handoff.mjs:1354`、`COMMANDS.md:44` 均只写 `install [--global|--project]`。
- **建议**：三处用法表补 `--no-readme`。

### F8 · P2 · CRLF 载体会被误判"漂移"

- **实测**：canon 矩阵中"⑦ CRLF 行尾"判**异**（`STUB_CANON` 不归一 `\r`）。
- **影响**：当前 5 载体均为 LF，暂无影响；但若某载体被 Windows 工具改写，`check` 会报 `[桩] 载体漂移/被手工改`（假阳性），`install` 随后会整块重写。
- **建议**：`STUB_CANON` 开头加 `.replace(/\r\n/g,'\n')`。

### F9 · P2 · 「完整 hub 副本」**不足以**隔离全局载体（审计方法学缺口）

- **实测**：`handoff.mjs:1013`（`cmdInstall`）与 `handoff.mjs:696`（`checkStubCarrier`）均取 `process.env.HOME`；副本只隔离 `ROOT= SCRIPT_ROOT`。
- **影响**：审计需求 §6「破坏性测试只在完整 hub 副本内做」对 `~/.claude/CLAUDE.md` 与 `~/.config/opencode/AGENTS.md` **不成立** —— 在副本里跑 `install` 仍会写真实全局文件（这 2 个正是 5 载体中的 2 个）。本审计用 `HOME=<沙箱>` 补足。
- **建议**：把该条写进审计/开发规范：破坏性测试须**同时**复制 hub 与重定向 `HOME`。

### F10 · P2（卫生）· hub 数据目录混放非 `.md` 文件，`check` 不覆盖

- **实测**：`handoffs/SWOOP-20260903-04-feature.md.bak`、`receipts/SWOOP-20260903-03-feature-resp.report.json`、`receipts/SWOOP-20260903-03-feature-resp.weak_labels.jsonl`。故 `ls` 计数 102/100 而 `check` 报 101/98。
- **影响**：无功能性影响（check 只扫 `.md`），但 `.bak` 留在数据目录易被误当作交接。
- **建议**：移入 `legacy/` 或 `reviews/`。

---

## 5. 与「声称已修」的差异

| 声称（需求文档 §1/§3） | 实测 | 差异 |
|---|---|---|
| v2.11.1 回归致"载体已出现重复桩（各 2 份）" | 5 载体**各 1 份** | 已消除 ✅ |
| v2.11.1 回归致"install 全部告警跳过" | install 能刷新、能去重、幂等 | 已修复 ✅ |
| v2.11.1 回归致"checkStubCarrier 形同虚设" | 三重探测（漂移/重复/sha）均生效 | 已修复 ✅（但机制是旁路 marker 检测，非修好 `findStubBlock` —— 见 F5） |
| `stub:sha256` 实算，`5e4115fa` | 运行时重算 + 独立路径反推，5/5 一致 | 属实 ✅（≠ 旧值 `1316b0a0`） |
| 契约版本 v2.12 | `README.md:5` = `契约版本 v2.12（2026-10-14）` | 属实 ✅ |
| `check` 基线 101 交接 / 98 回执 exit 0 | 实测同 | 属实 ✅ |
| §3 全部符号行号（954/962/972/974/980/1010/1011/1012/694/730/776/213/214/861） | 逐条核对**全部准确** | 属实 ✅ |
| 5 个桩载体清单 | 与实测一致 | 属实 ✅ |
| 文档已升版（README/CHANGELOG/DESIGN 均含 v2.12） | 三处均有 | 属实 ✅（但 CHANGELOG/DESIGN 的 v2.12 叙事沿用"findStubBlock 恒 null"，与实现的 `STUB_REGION_RE` 旁路不符 —— F5） |
| "README §接入桩 纳入 install 目标" | 无 flag 时确含 README | 属实 ✅（但 `--global` 下仍写 cwd README —— F3；且全局目录缺失时崩溃导致 README 装不上 —— F2） |
| **（需求文档未提及）** | 正则过度匹配删正文、install 崩溃、空白规范化、死代码、CRLF、隔离缺口等 | **新发现，见 §4** |

---

## 6. 操作留痕

**对真实 hub 的写操作：无。**

- 全程仅在副本（`/tmp/hubaudit.hjz2oF`）与临时目录（`/tmp/t16*`、`/tmp/t21`、`/tmp/rt6`、`/tmp/rt7A`、`/tmp/rt7B`）内做写操作；`HOME` 一律重定向到沙箱。
- 对真实 hub 只执行过**只读**命令：`ls`、`cat`/`sed`/`grep`、`shasum`、`node handoff.mjs status`、`node handoff.mjs check`、`node` 探针（只读）。
- `install` **从未**在真实 hub 上执行。
- 唯一副作用：真实 hub 之外的 `os.tmpdir()` 状态戳仅由副本脚本生成（按 ROOT 哈希分文件，与真实 hub 互不影响）。

**最终完整性核验（审计结束时，对比审计开始时基线）：**

```
✅ AGENTS.md                          3902c6e286c5483c
✅ CLAUDE.md                          3902c6e286c5483c
✅ README.md                          c38ef998ee9270c2
✅ handoff.mjs                        97e88ab5900e7c27
✅ CHANGELOG.md                       c41466e56a70cd30
✅ DESIGN.md                          83c89b3821db93ae
✅ ~/.claude/CLAUDE.md                3902c6e286c5483c
✅ ~/.config/opencode/AGENTS.md       f04075ede96e1cbd
真实 hub check EXIT=0 :: ✅ check 通过: 101 份交接 / 98 份回执，全部合规
```

---

## 7. 复现要点（关键命令）

```bash
# ① 运行时求值 STUB_*（规避反引号转义陷阱）
#    取 handoff.mjs 中 `const STUB_MARKERS` … `const STUB_BLOCK` 区段，
#    用 new Function('crypto', seg + '\nreturn {STUB_BODY,STUB_SHA,STUB_BLOCK,...}')(crypto) 求值
#    再 crypto.createHash('sha256').update(STUB_BODY).digest('hex').slice(0,8)

# ② 隔离（F9：必须同时重定向 HOME）
cd ~/Documents/lab/handoffs && node handoff.mjs check     # 基线 101/98 exit 0
TMP=$(mktemp -d); cp -R ./. "$TMP/"
cd "$TMP" && HOME=/tmp/sandbox-home node handoff.mjs install

# ③ F1 复现：正文含 "### Handoff 接入桩（…" 标题 + 标准桩 → install → 正文被删且 check 仍 0
# ④ F2 复现：HOME 下无 .claude 目录 → install 抛 ENOENT 且 cwd README 未写
```

> 注：`grep` 在本机（BSD grep）不支持 BRE 的 `\|`，需用 `grep -E`；`zsh` 不对未加引号的变量做词分割（本审计初版脚本曾因此误判 `--project --no-readme` 为"失效"，实为测试脚本问题，已修正并复测）。
