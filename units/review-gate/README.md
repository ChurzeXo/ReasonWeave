# review-gate — 通用评审防线（Layer-1 SAST + Layer-2 本地 review + 提交门禁）

> 本目录是「vibe coding / 多 Agent 长任务」评审防线的**单一事实源**，独立于任何具体项目。
> **实现（开源工具，不在本仓库）**：OpenGrep（Semgrep CE 社区 fork，纯 CLI 零外发）+ 本地 `code-review-and-quality` 技能（LLM）。
> **接入方式**：项目只按 `docs/*.md` 的提示词接入，**不要**把本 README 规范复制到项目仓库（防漂移）。

## 0. 这是什么 / 为什么独立

- vibe coding 下 AI 大量生成代码，容易引入「能跑但危险」的片段（硬编码密钥、不安全传输、弱哈希、导出未受控组件…）。
- 单靠 LLM 自我审查会漏**语义/并发**问题且有**幻觉**；单靠 SAST 会淹没在**噪音**里。两层**故障模式互补**。
- 从 Tappy 落地抽离：已在 Kotlin+Python+Android 项目跑通 131 → 3 findings 收敛、8 笔提交经门禁落库。实测证据见 Tappy `evidence/opengrep-baseline-20261013/`（BASELINE.md / scan.sh / round5.json）与 `evidence/l2_review_20261013.md`。

## 1. 架构（两层 + 门禁）

| 层 | 是什么 | 角色 |
|---|---|---|
| **Layer-1 OpenGrep** | SAST 静态扫描（零外发、纯 CLI） | **硬规则兜底**：覆盖常见安全/质量规则 |
| **Layer-2 本地 review 技能** | Agent 调 `code-review-and-quality` 审 diff/文件 | **语义层**：补 Layer-1 漏掉的语义/并发/设计问题 |
| **pre-commit 回归门禁** | 提交时对照基线 | **篱笆**：只拦「基线外的新发现」，已知信号放行 |

**互补关系**：Layer-1 漏的语义问题 → Layer-2 抓；Layer-2 的幻觉 → Layer-1 硬规则兜底；门禁保证「已接受的清单不再退化」。

## 2. 三层噪音治理（OpenGrep 收敛 131→3 的关键）

1. **`.semgrepignore`**：目录/文件级忽略（构建产物、文档、依赖…）。
2. **`--exclude-rule ×N`**：全仓前提不成立的规则（如「所有 urllib 调用皆环回隧道」故屏蔽 urllib 规则）。
3. **行内 `nosem`**：已验证的个案误报，在源码对应行尾加 `# nosem` / `// nosem`。**裸 `nosem` 最稳**，别用 `nosemgrep: <id>` 形式（曾匹配不可靠）。

## 3. 通用安装

### 3.1 一次性（全局，所有项目共用）

- 安装 OpenGrep standalone binary（这是独立二进制，**无需 npm/Python 环境**）：
  ```bash
  curl -L https://github.com/opengrep/opengrep/releases/latest/download/opengrep-darwin-arm64 \
    -o ~/.local/bin/opengrep && chmod +x ~/.local/bin/opengrep
  ```
  （其它平台/架构见 [releases](https://github.com/opengrep/opengrep/releases)；本机已装则可跳过。）
- 本地 review 技能是 WorkBuddy 内置 `code-review-and-quality`，**全局可用，无需安装**。

### 3.2 每仓（per-repo，现有 / 新建项目都走这套）

1. 复制 `templates/` 三文件：`.semgrepignore` → 项目根；`scan.sh` → 根或 `scripts/`；`pre-commit` → `.githooks/pre-commit`（先 `mkdir -p .githooks`）——**单门禁**时即此形态。
   - **已有别的 pre-commit 门禁**：git 一仓只允许一个 `.githooks/pre-commit`，**不要「合并/焊入」**既有脚本；改用 **dispatcher 模式**——各门禁作 `.githooks/pre-commit.d/` 子检查（本模块 → `10-review-gate`，既有门禁 → `00-`/`05-`），编排器见 `~/Documents/lab/preflight/templates/pre-commit`。口径与 preflight 统一。
2. 按语言栈选 `RULESETS`（见 §4）。
3. 跑基线：`RULESETS="<预设>" bash scan.sh review-gate/baseline/baseline.json`。
4. **人工过目基线**：打开产物，逐条判「误报/可接受」（留作已知信号）或「真问题」（先修或记 backlog）。**基线 = 你主动接受的清单，不是自动信任。**
5. 挂载门禁：`git config core.hooksPath .githooks`（per-repo local，不污染全局；新克隆需重跑）。
6. 根 AGENTS.md / CLAUDE.md 加一句指令（见 §8）。

## 4. 按语言栈选规则集（RULESETS 预设）

| 项目语言 | RULESETS |
|---|---|
| Kotlin/Android + Python | `p/default p/kotlin p/java` |
| Rust + TypeScript | `p/default p/rust p/typescript` |
| 纯 Python | `p/default p/python` |
| Go | `p/default p/golang` |
| 全栈兜底 | `p/default p/kotlin p/java p/rust p/typescript p/python p/golang` |

> ⚠️ **已知边界**：`p/android` slug 在 semgrep.dev **404 不存在**；`p/java` 只认 `.java` 不认 `.kt`，故 Kotlin 项目需 `p/kotlin` 补位（开源 Kotlin 规则约 17 条，是天花板）。Rust/TS 规则集可用但深度有限——这是 SAST 固有边界，由 Layer-2 补语义。

## 5. 使用

- **手动全量扫描**：`opengrep scan --config p/default --config p/kotlin --config p/java --disable-version-check .`
- **可复现基线**：`RULESETS="..." bash scan.sh /tmp/og.json`（正常仅你已接受的信号）
- **穿透式无免检扫描 (Anti-Suppression · ADR-0011)**：`bash scan.sh --no-suppress /tmp/og.json`（或 `NO_SUPPRESS=1 bash scan.sh`），强制忽略行内 `# nosem` / `// nosem`，穿透排查被免检注释掩盖的严重漏洞。
- **诚实降级扫描 (ADR-0011 §2.2)**：若未安装 OpenGrep，`scan.sh` 与 `pre-commit` 自动平滑降级至 `ruff check --select S`（Bandit 规则集）本地扫描，并在产物 JSON 中结构化注入 `engine: fallback-ruff-bandit` 与 `fallback: true`。
- **提交时自动**：`git commit` → pre-commit 扫暂存代码文件，对照基线，新发现才阻断。
- **重新基线**（有意为之接受新发现后）：`RULESETS="..." bash scan.sh review-gate/baseline/baseline.json`（覆盖），然后提交基线 JSON。
- **个案豁免**：源码行尾加 `# nosem` / `// nosem`。

## 6. Layer-2 本地 review 用法

- 让 Agent 调用 `code-review-and-quality` 技能，针对：当前 diff、指定文件、或指定 PR/分支。
- **结合 `code-review-graph`（爆炸半径与测试关联）**：
  对复杂或核心模块改动，建议在 Review 前运行 `code-review-graph impact`（或通过 MCP `detect_changes_tool` / `get_impact_radius_tool`），自动计算受影响的 Callers、下游依赖与现存单测覆盖，将精准切片喂给审查 Agent，兼顾深度与 Token 经济性（详见 `docs/code-review-graph-guide.md`）。
- 输入建议：`git diff <base>...HEAD` 或指定路径；输出按「必须修 / 建议修 / 正向发现」分级。
- 与 Layer-1 关系：Layer-2 抓语义/并发/设计，Layer-1 抓硬规则；两者结论冲突时以「能跑通且人工验证」为准，**不盲信任一层**。
- 对**无 remote 的本地仓**：PR-Agent / CodeRabbit / pr-af 等 PR 驱动工具**失效**（无 PR 触发），本地 review 技能是兜底。

## 6.5 Layer-3 双盲审计自动化重跑器 (Clean Context Runner)

> **定位（v1.1.0 引入 · ADR-0003）**：在多 Agent 协同流程中（尤其是 `to_lane=audit`），杜绝实现方自测自评与粉饰测试结果；由独立的无上下文干净进程自动重跑「验收判据」命令。

- **原则**：Hooks are Law —— 唯有实际物理子进程 Exit 0 算通过，严禁口头声明。
- **环境隔离**：自动识别并进入 `.worktrees/<ticket-id>` 隔离工作树，清洗大模型主观环境变量。
- **CLI 用法**：
  ```bash
  # 自动重跑工单的验收测试
  baton-audit-runner run <ticket-id>

  # 显式指定测试命令与物理工作树并自动落盘回执
  baton-audit-runner run <ticket-id> --cmd "npm test" --auto-receipt
  ```

## 7. 诚实边界（必读）

- **规则仍从 semgrep.dev 下载**（只读 GET，未上传）；离线/防火墙可能拉不到 → 进阶：把规则缓存到本地目录用 `--config <本地路径>`。
- **二进制未做 cosign 验签**：从 GitHub releases 下载 standalone binary，未验证签名。
- **Kotlin/Android 覆盖最薄**：见 §4 备注；SAST 不是银弹。
- **门禁是回归篱笆不是零误报墙**：基线需人工 review 接受才固定；它保证「已接受的清单不退化」，不保证「无新漏洞」。
- **Layer-2 是 LLM 可能幻觉**：结论需人工/测试复核，不替代 Layer-1。
- 已在 Tappy 实测；其它语言栈（Rust/TS/Go）的基线收敛需各自跑一遍验证。模板给的是起点不是保证。

## 8. 模板与分发（不要复制规范回项目）

- `templates/.semgrepignore`、`templates/scan.sh`、`templates/pre-commit` —— 项目复制这三份并按注释增删。
- `docs/new-project-prompt.md` —— 粘贴进**新项目** Agent 会话的完整接入提示词。
- `docs/existing-project-prompt.md` —— 粘贴进**现有项目**（可能已有 lint/CI）的接入提示词。
- `docs/transfers/<repo>.md` —— **已定制好的分仓提示词**（iggle / prospero / swoop / yiqiyihuihua），参数按各仓实况写死，拿来即转递。
- **多门禁共存（dispatcher 口径，与 preflight 统一）**：git 一仓只允许一个 `.githooks/pre-commit`。已有原生门禁时**不要「合并/焊入」**，改用 dispatcher：各门禁作 `.githooks/pre-commit.d/` 子检查，编排器见 `~/Documents/lab/preflight/templates/pre-commit`（手改焊死 hook 正是本模块 v1.0.2/v1.0.3 两 bug 的根因模式）。
- 项目只按 prompt 接入；规范细节永远以本 README 为准，项目里只放指针 + 一句指令。
- 根指令一句示例：「静态扫描与提交门禁按 `~/Documents/lab/review-gate/README.md` 接入；改基线前先人工 review。」

## 9. 参考

- OpenGrep: https://github.com/opengrep/opengrep
- Tappy 实测: `evidence/opengrep-baseline-20261013/`、`evidence/l2_review_20261013.md`
- 同范式模块: `~/Documents/lab/backlog/`、`~/Documents/lab/handoffs/`
