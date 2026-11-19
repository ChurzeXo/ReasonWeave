# 消费方项目接入与改造提示词手册 (Consumer Prompts)

> 本文档汇总了为**新项目初始化**与**老项目平滑改造**定制的 AI Agent 提示词。  
> 后续在任何消费方项目的 Agent 会话中，直接按场景**复制对应小节的 Markdown 提示词**发送即可。

---

## 目录
1. [前置环境就绪声明（必读）](#0-前置环境就绪声明必读)
2. [场景一：全新项目 ZSpec 架构初始化与规范挂载（推荐）](#场景一全新项目-zspec-架构初始化与规范挂载推荐)
3. [场景二：老项目全自动平滑升级（一键干掉硬编码路径）](#场景二老项目全自动平滑升级一键干掉硬编码路径)
4. [场景三：新/老项目接入健康排查与自动治愈](#场景三新老项目接入健康排查与自动治愈)
5. [场景四：轻量项目仅接入纪律机件（不做 ZSpec 宏观重构）](#场景四轻量项目仅接入纪律机件不做-zspec-宏观重构)
6. [场景五：已接入消费方升级到最新版能力库](#场景五已接入消费方升级到最新版能力库)
7. [场景六：消费方接入与升级 spec-guard v2.0 机器信任根与接线守卫](#场景六消费方接入与升级-spec-guard-v20-机器信任根与接线守卫)
8. [场景七：消费方接入或升级 orphan v1.3.0 反假接线三层治理与 AGENTS/GEMINI 极简路由](#场景七消费方接入或升级-orphan-v130-反假接线三层治理与-agentsgemini-极简路由)

---

### 0. 前置环境就绪声明（必读）
由于本能力库目前在本地开发态，各机器**首次使用前**、以及**每次 lab 仓功能更新后**，都需在终端重跑一次全局软链接挂载：

```bash
cd ~/Documents/lab && npm link
```

挂载后系统全局拥有 `lab`、`baton` / `agent-baton` / `handoff`、`baton-worktree`、`baton-audit-runner`、`lab-orphan`、`spec-guard` / `drift-gate`、`adr-init`。
**为什么更新后必须重跑**：新增 CLI 的 bin shim 只在 `npm link` 时生成；老软链不会凭空多出新命令。

本项目另需执行一次接入桩刷新（幂等）并验证：

```bash
baton install && baton link --check && lab doctor && baton check
```

完整升级工序与坑位见 [INSTALL.md §4](../INSTALL.md)，逐场景可执行提示词见下方**场景五**。

---

### 场景一：全新项目 ZSpec 架构初始化与规范挂载（推荐）

> 📋 **适用场景**：新建项目从第 0 天起建立工业级 ZSpec (AEF v1.0) 架构，包含宪法、共享事实层、规格区与门禁。  
> 📋 **使用方式**：复制以下内容发送给新项目的 AI Agent 会话：

```markdown
请按 ZSpec (AEF v1.0) 工业标准为本项目初始化工程架构与纪律门禁。

### 执行工序（确定性 CLI 驱动）：
1. **环境检查**：
   - 运行 `lab doctor`，若命令不存在则进入 toolkit 源码根目录执行 `npm link`（默认位置 `cd ~/Documents/lab && npm link`）挂载。
2. **生成 ZSpec 标准架构骨架**：
   - 在项目根目录运行脚手架命令：
     ```bash
     lab zspec init "<本项目名称>"
     ```
   - 若本项目涉及多端（如前端/后端），为对应端运行：
     ```bash
     lab zspec add-unit <端名>
     ```
3. **事实层填空（Agent 职责）**：
   - 阅读 `lab zspec guide` 获取填空指引。
   - 编辑 `group/product/intent.md` 写入本项目的核心问题与用户旅程。
   - 编辑 `constitution.md` 确认本项目的核心产品不变量（P1-P3）。
4. **初始化首条架构决策**：
   - 运行 `adr-init . standard "<本项目名称>"`。
5. **机器自检**：
   - 核验 `test -f constitution.md` 与 `test -f group/product/intent.md`，汇报已生成的架构树。
```

---

### 场景二：老项目全自动平滑升级（一键干掉硬编码路径）

> 📋 **适用场景**：已接入过 lab 的老项目，代码中散落有 `~/Documents/lab/...` 路径，希望全盘自动化升级为动态规范。  
> 📋 **使用方式**：复制以下内容发送给老项目的 AI Agent 会话：

```markdown
请帮我把本项目中引用的 Agent 工程能力库规范，从旧的本地绝对路径（~/Documents/lab/）平滑升级到全局 npm/lab 标准。

### 执行步骤（由 lab CLI 自动化保证 100% 覆盖）：

1. **环境自检**：
   - 终端运行 `lab doctor`，确认全局环境已就绪（Node >=18, Git, OpenGrep）。
   - 运行 `lab path`，确认能正确解析出能力库根路径。

2. **全盘自动化无损迁移**：
   - 在本项目根目录直接运行迁移命令（内置规则会自动处理全部 21+ 处引用，包括 handoffs、playbook 及所有 unit 规范）：
     ```bash
     lab migrate .
     ```
   - 该命令会自动完成：
     - 命令调用：`node ~/Documents/lab/handoffs/handoff.mjs` → `handoff`
     - 脚本调用：`bash ~/Documents/lab/adr/scripts/adr-init.sh` → `adr-init`
     - 6 大 Unit 规范路径（handoffs、playbook、preflight、review-gate、adr、backlog）：统一转为 `$(lab path <unit>)/...`
     - 根目录文件引用：统一转为 `$(lab path)/...`

3. **校验与验收**：
   - 运行 `git diff` 检查所有被修改的文件清单（重点确认 AGENTS.md、.githooks/、scripts/）。
   - 确认工作区内不再存在写死的 `~/Documents/lab/` 或绝对路径。
   - 触发一次项目的预检探针或提交门禁（如 `scripts/preflight.sh` 或 `git status`），确认门禁正常生效。
   - 汇报修改的文件列表及替换处数。
```

---

### 场景三：新/老项目接入健康排查与自动治愈

> 📋 **适用场景**：项目在升级或接入过程中卡住、因公网 404 报错、或者怀疑有遗漏路径时。  
> 📋 **使用方式**：复制以下内容发送给目标项目的 AI Agent 会话：

```markdown
请帮我对本项目刚刚接入的 Agent 工程能力库（lab-agent-toolkit）进行一次全面的健康检查与自愈修复。

### 检查与自愈工序：

#### 1. 全局工具链与环境检查（防 404 与断网遗留）
- 在终端运行：`which lab` 与 `lab doctor`
- **自愈规则**：若报 `command not found` 或之前因公网 404 未能安装，请立即在终端执行本地挂载命令自愈：
  ```bash
  cd ~/Documents/lab && npm link
  ```
  再次运行 `lab doctor` 与 `baton doctor`，确认工具链就绪且「桩版本 == 引擎版本」。

#### 2. 检查 AGENTS.md 指针有效性与路径语法
- 检查本项目根目录的 `AGENTS.md`（及其他说明文档）：
  - **断言 A（无硬编码路径）**：全文绝不应包含 `~/Documents/lab/` 或 `/Users/.../Documents/lab/`。若发现残留，请立即在项目根目录运行 `lab migrate .` 一键转换。
  - **断言 B（动态路径可真实解析）**：测试以下核心路径是否全部能在本地终端中展开且真实存在：
    ```bash
    ls -l "$(lab path adr)/README.md"
    ls -l "$(lab path preflight)/templates/preflight.sh"
    ls -l "$(lab path review-gate)/README.md"
    ls -l "$(lab path handoffs)/README.md"
    ls -l "$(lab path playbook)/README.md"
    ```

#### 3. 检查能力单元引用（`lab list` 全集 9 个 · 按项目实际需要挑，不强求全接）
- 运行 `lab list` 取当前全集，核对 AGENTS.md 中实际使用的单元指针是否可解析：
  - [ ] `adr`（架构决策记录，配套 `adr-init`）
  - [ ] `backlog`（待办捕获，`docs/backlogs/`）
  - [ ] `preflight`（不变量探针与提交门禁）
  - [ ] `review-gate`（代码静态扫描与评审防线）
  - [ ] `handoffs`（工作流交接中枢，`baton` / `handoff` 命令，契约 v2.36.0）
  - [ ] `worktree`（物理工作树隔离，`baton-worktree`）
  - [ ] `orphan`（死代码与孤儿资产清道夫，`lab orphan`）
  - [ ] `spec-guard` / `drift-gate`（架构规约与漂移守卫）
  - [ ] `playbook`（AEF 架构方法论与 Spec-kit 契约：`$(lab path playbook)/README.md`）
- **断言**：对每个已引用的单元，`test -f "$(lab path <unit>)/README.md"` 必须为真。
- **自愈规则**：路径解析失败先重跑 `cd ~/Documents/lab && npm link`；若只是缺某单元的指针，在 AGENTS.md 对应节补「一行动态指针 + 一句操作指令」，**不要复制规则正文**。

#### 4. 检查是否违背“规范不内联”铁律
- 检查 AGENTS.md 是否不小心大段复制了某模块的 README 正文或细则。
- **自愈规则**：若有大段复制，将其精简为“指针 + 一句操作指令”，保持 AGENTS.md 紧凑清晰。

---

### 验收交付报告：
排查修复完成后，向我汇报：
1. `lab doctor` 环境状态（绿灯/黄灯/红灯）与 `baton doctor` 桩版本一致性结论
2. 修复/补全了哪些项（如路径替换、补充单元引用、接入桩重刷等）
3. 最终 AGENTS.md 的规范声明片段
```

---

### 场景四：轻量项目仅接入纪律机件（不做 ZSpec 宏观重构）

> 📋 **适用场景**：已有成熟目录结构的小型项目，只想接入门禁（preflight）、代码扫描（review-gate）和 ADR，不调整顶层目录。  
> 📋 **使用方式**：复制以下内容发送给该项目的 AI Agent 会话：

```markdown
请为本项目接入轻量级工程纪律机件（来自 lab-agent-toolkit）：

1. **环境检查**：终端运行 `lab doctor`，若未就绪先进入 toolkit 源码根目录执行 `npm link`（默认位置 `cd ~/Documents/lab && npm link`）。
2. **在 AGENTS.md 增加指令指针**：
   - 架构决策：按 `$(lab path adr)/README.md` 接入，新建决策运行 `adr-init . light "<项目名>"`（或 `lab adr . light "<项目名>"`）。
   - 待办捕获：按 `$(lab path backlog)/README.md` 将待办记录至 `docs/backlogs/`。
   - 提交门禁：按 `$(lab path preflight)/README.md` 将 `$(lab path preflight)/templates/preflight.sh` 接入为提交前检查。
   - 代码质量：按 `$(lab path review-gate)/README.md` 接入本地扫描。
   - 任务交接：运行 `baton install` 注入标准接入桩（契约 v2.36.0，严格会话ID统一，严禁跨会话处理工单）。
3. **铁律**：严禁复制规则全文，只保留动态指针。接入后运行一次 `git status` 汇报。
```

---

### 场景五：已接入消费方升级到最新版能力库

> 📋 **适用场景**：本项目已接入 lab 能力库，lab 仓刚发布功能更新（当前 **Agent Baton v2.36.0 / 接入桩 sha `4c82924b`**，包含 **全局统一会话ID与一单到底 (`id === conversation_id`)、严禁跨会话处理工单硬门禁 (`CROSS_SESSION_MUTATION_BLOCKED`)、入站极简裁决提示词、出站 Round 轮次单一事实源与独立计算、会话亲和性与并发监听、ADR-0010 会话环境身份锁与防跨角色漂移、密码学审计凭据与 HMAC-SHA256 签章防伪、出站防注入提示词三段式、并发异步派发 `forward --async`、`--auto-nonce` 自动绑定**，以及新增 `orphan`、`spec-guard`、`worktree` 单元与多个 CLI）。
> 📋 **使用方式**：复制下方整块 Markdown，发给**本项目**的 AI Agent 会话；每个消费方仓各发一次。上游细节见 [INSTALL.md §4](../INSTALL.md)。

````markdown
请把本项目已接入的 lab 能力库（lab-agent-toolkit）升级到最新版并实测验证生效。

背景：本机是「单一 lab 仓 + 软链 / 动态指针」模型，没有 submodule、npm 版本依赖或 commit 钉值，因此不需要逐仓 bump 版本号。但有两样东西不会自动刷新，必须显式处理：
① 全局 CLI 的 bin shim（新增 lab-orphan / spec-guard / drift-gate / agent-baton 等）只在 npm link 时生成；
② 各载体（AGENTS.md / CLAUDE.md / GEMINI.md / README.md 及全局载体）里的 Baton 接入桩正文已变更至最新契约 v2.36.0，旧桩会被判「桩版本漂移」并 exit 1。
本次升级重点落地了：全局统一会话ID与一单到底（`id === conversation_id`，消除多端混淆）、防跨会话处理工单硬门禁（`CROSS_SESSION_MUTATION_BLOCKED`）、入站极简裁决提示词、出站 Round 轮次单一事实源与独立计算、会话亲和性与基于 `Atomics.wait` 的低耗并发监听、ADR-0010 会话与环境身份锁（Fail-Closed 防跨角色漂移）、密码学审计私钥凭据与 HMAC-SHA256 签章防伪（防共享磁盘明文 Nonce 冒用）、出站防注入三段式提示词、并发异步转递（--async）与多工单聚合监听。

### 执行工序（按顺序，全部在终端真实运行，不要只静态读码）
1. 定位并更新 lab 仓：
   - 若 `lab` 命令可用：`cd "$(lab path)" && git pull --ff-only`（Windows PowerShell: `cd $(lab path); git pull --ff-only`）
   - 若 `lab` 不可用，或本机是压缩包分发：`cd ~/Documents/lab`（换成你的实际路径）后重新解压最新版覆盖，再继续。
   - pull 因本地改动失败时不要 reset / force，如实报告并停下来。
2. 重挂全局 CLI 并体检：`npm link`，随后 `lab doctor` 与 `baton doctor`。
3. 在**本项目根目录**刷新接入桩并自检：
   ```bash
   baton install             # 幂等：刷新项目载体 + 全局载体的接入桩（需固定中文桩可加 --lang zh）
   baton link --check        # 必须 RC=0，显示「桩版本 == 引擎版本 (v2.36.0)」
   baton check               # 本仓交接 / 回执合规自检；历史存量工单告警不阻断当前工单
   ```
4. 核对新能力可达（只读）：
   ```bash
   lab list
   for u in handoffs orphan spec-guard worktree; do test -f "$(lab path $u)/README.md" || echo "MISSING: $u"; done
   which lab-orphan spec-guard drift-gate 2>/dev/null || where.exe lab-orphan spec-guard drift-gate
   ```
5. 检查本项目 AGENTS.md / CLAUDE.md / README.md 的接入桩：版本串为 v2.36.0 且每个文件只有一份桩（无重复块）。若某载体是手写指针（缺 `<!-- handoff-stub:v2.1 begin -->` 标记）导致 install 跳过，请用 `$(lab path handoffs)/README.md` 的标准桩替换该段后重跑 `baton install`。另外：`baton doctor` 会用正则抓载体里第一个 `契约 v<版本>` 做比对，正文若残留手写的旧版本号请删掉（版本串只留在标准桩内），否则升级后仍误报漂移。

### 禁止事项（踩过的坑）
- 不要用 lab 源模板覆盖本项目定制的 `review-gate/scan.sh`、`scripts/preflight.sh`、`.githooks/` 等副本（多为项目校准值）。
- 不要运行 `lab migrate --help`：它**不是只读帮助**，会立即执行单向有损替换；查用法请读 `$(lab path)/bin/lab.mjs`，预览只能用 `lab migrate <dir> --dry-run`，且不要在 lab 仓根执行。
- 不要手工编辑接入桩正文，不要把规则全文复制进 AGENTS.md（只留动态指针 + 一句指令）。
- 不要修改 lab 仓内任何文件；本项目之外的仓库一律不动。

### 验收判据（全部实测满足才算完成）
- [ ] `baton link --check` / `baton doctor` RC=0，输出「桩版本 == 引擎版本 (v2.36.0)」
- [ ] `lab doctor` RC=0；`baton check` RC=0
- [ ] `lab path orphan`、`lab path spec-guard` 可解析且对应 README.md 存在
- [ ] 各载体接入桩唯一、版本串为 v2.36.0
- [ ] `git status --porcelain` 只有接入桩刷新带来的预期改动，无意外文件

### 汇报
3 句话内说明：①本项目升级了哪些载体文件；②上述 5 条判据的实测结果（贴关键输出行）；③`baton status --for <本方 lane|target>` 当前待办有无变化。`orphan` / `spec-guard` 的门禁模板属可选增强，本次不必接入，也不要擅自改动既有门禁配置。
````

> **分工**：lab 仓的 `git pull` + `npm link` 整机做一次；第 3–5 步每个消费方仓各跑一次。跨机器分发时把第 1 步换成「重新解压最新版到同一路径」即可。

---

### 场景六：消费方接入与升级 spec-guard v2.0 机器信任根与接线守卫

> 📋 **适用场景**：消费方项目（如 Tappy 等）需升级防漂移守卫至 **spec-guard v2.0**，落地实测数据机器信任根对账（根除 ADR-066 式的文本伪造实测数据漂移）与生产代码物理接线探测（拦截 🔒Frozen 孤儿决策）。  
> 📋 **使用方式**：复制下方整块 Markdown，发送给**消费方项目**的 AI Agent 会话。

````markdown
请将本项目已接入的架构规约与漂移守卫升级至 spec-guard v2.0，并对全仓 ADR 与生产代码执行实测对账与治愈。

### 背景与升级目标
上位能力库 `lab-agent-toolkit` (units/spec-guard) 已正式发布 v2.0.0，重点落地三大工业级守卫机件：
1. **实测数据机器信任根（ADR-064 对账）**：任何包含量化性能指标（ms, s, MB, FPS, %, Tokens, P95, INT8 等）的 ADR，严禁纯文本自述，必须显式引用 `evidence_ref: evidence/*.json` 与不可伪造的机器签名摘要（`digest: sha256:...`），容差恒等于 0%；
2. **生产代码物理接线探针（No-Cheat 铁律）**：反查 ADR 决策在生产代码（排除测试目录）中的真实存活性，严厉拦截 `🔒Frozen` 但生产代码零符号命中的孤儿决策（ORPHAN_DECISION）；
3. **全景三元热力表**：一键输出「断言 (Assertion) ↔ 证据 (Evidence) ↔ 接线 (Wiring)」三元闭环。

---

### 执行工序（全部在终端实机运行）

#### 1. 工具链与环境自检
- 确认全局已挂载最新能力库：
  ```bash
  which spec-guard || (cd ~/Documents/lab && npm link)
  spec-guard --help  # 确认输出 (v2.0.0)
  ```

#### 2. 全仓三元体检与基线摸底
- 在本项目根目录运行一键全景对账热力表：
  ```bash
  spec-guard check --full
  ```
- 记录输出中的「数据漂移 (TELEMETRY_DRIFT)」与「孤儿决策 (ORPHAN_DECISION)」清单。

#### 3. 专项实测数据自述凭据排查与治愈 (ADR-064 机器信任根)
- 运行实测数据验签：
  ```bash
  spec-guard verify-evidence
  ```
- **自愈整改规范**：
  若存在自述漂移（如 ADR-066 包含 39.42ms、P95 44.37ms、INT8 等实测指标却缺少凭证）：
  1. 在 `evidence/` 目录下生成或整理真实的自动化测试输出 JSON 文件（如 `evidence/in_situ_ocr_benchmark.json`）；
  2. 计算该凭据文件的 SHA-256 摘要：
     ```bash
     shasum -a 256 evidence/<file>.json
     ```
  3. 在对应 ADR 文档的元数据节或正文中显式追加凭据引用与签名摘要：
     ```markdown
     - **evidence_ref**: evidence/<file>.json
     - **digest**: sha256:<sha256-hex>
     ```
  4. 确保 ADR 文本中自述的实测指标与 JSON 中的真实字段数值严格一致（容差 0%）。
  5. 再次运行 `spec-guard verify-evidence <ADR-ID>` 验证通过。

#### 4. 生产物理接线与孤儿决策排查与治愈
- 运行物理接线探测：
  ```bash
  spec-guard check-wiring
  ```
- **自愈整改规范**：
  若检测到 `🚨 [FAIL] 孤儿决策 (ORPHAN_DECISION)`（规约标记为 `🔒Frozen` 但生产代码零符号命中）：
  - 若生产代码已实现：检查是否符号拼写不一致，补齐生产代码引用或声明；
  - 若实际尚未接线或处于原型期：**严禁虚假冻结**，必须遵循 ADR 宪法将状态改回 `Draft` 或 `In Progress`，待底层接入闭环后再申请人类冻结。

#### 5. 门禁更新与提交自检
- 检查或更新本地 pre-commit 门禁片：
  ```bash
  mkdir -p .githooks/pre-commit.d
  cp "$(lab path spec-guard)/templates/pre-commit.d/15-spec-guard" .githooks/pre-commit.d/
  chmod +x .githooks/pre-commit.d/15-spec-guard
  ```
- 跑一次全量自检确保门禁全绿：
  ```bash
  spec-guard check --full
  ```

---

### 验收报告要求
执行完成后，向我汇报：
1. `spec-guard check --full` 最终输出的三元热力表汇总行（总规约数、数据漂移数、孤儿决策数）；
2. 本次治理修复了哪些 ADR（特别说明 ADR-066 机器信任根治理情况）；
3. 生产接线与门禁配置确认。
````

---

### 场景七：消费方接入或升级 orphan v1.3.0 反假接线三层治理与 AGENTS/GEMINI 极简路由

> 📋 **适用场景**：新项目初始化或已接入消费方同步升级 `orphan v1.3.0`（L1/L2/L3 三层正交反假接线规范、Tier 1/2 分级自查、Agent 自主呈批开单协议与 `AGENTS.md`/`GEMINI.md` 极简接入模板）。  
> 📋 **使用方式**：复制以下内容发送给消费方项目的 AI Agent 会话：

````markdown
请同步 `lab-agent-toolkit` 最新 `orphan v1.3.0` 反假接线规范与极简接入模板，完成本项目的接线治理对齐。

### 执行工序（SSOT 指针制，严禁复制长篇正文）
1. **拉取与核验指针**：
   - 确认本地 `$(lab path orphan)/README.md`（§5–§8）与 `$(lab path orphan)/templates/wiring/project-agents-gemini-templates.md` 可读；若不存在或版本落后，先到 `lab` 仓根目录执行 `git pull --ff-only && npm link && lab doctor`。
2. **更新 `AGENTS.md` 与 `GEMINI.md`（严格行数预算）**：
   - 参照 `$(lab path orphan)/templates/wiring/project-agents-gemini-templates.md`，只替换 `<...>` 为本项目真实路径：
     - `AGENTS.md` 新增/更新「反假接线分级自查段」（**`<= 12` 行**，含 Tier 1/2 本地映射 + 自主呈批开单纪律 + `$(lab path orphan)/README.md` 指针）；
     - `GEMINI.md` 新增/更新「反假接线执行守卫段」（**`<= 6` 行**，指定唯一 `.venv` 或唯一运行时执行 L1/L2，严禁 `SKIP_*` 与 `--no-verify` 绕过）。
3. **对齐 L1 / L2 / L3 与门禁串联**：
   - 检查 `preflight.conf` 中的 `RECONCILE_CMD` 是否已串联 L1（静态双向拓扑零差集 `--fast`）与 L2（唯一运行时失败传播与 `--verify-mutations` 变异自证），并确认 CI 同步接入；
   - 确认 `.githooks/pre-commit.d/` 已挂载 OpenGrep SAST（如 `10-review-gate`）守卫反射与动态执行；若涉及真机/外设产出，核验 L3 非对称 Ed25519 + 新鲜度硬门限。
4. **4 项初始化验收自检**：
   - 逐项核验：① 行数预算（`AGENTS.md <= 12` 行、`GEMINI.md <= 6` 行，无长篇方法论复制）；② 本地路径与唯一 `.venv` 真实可执行；③ `bash scripts/preflight.sh`（A5 `RECONCILE_CMD` L1+L2 串联）全绿；④ `pre-commit` SAST 已挂载且无 `SKIP_*` 绕过后门。

### 汇报要求
3 句话内说明：① 修改了哪些文件及对应段行数；② `preflight.sh` 与 L1/L2 实测结果；③ 是否存在越界/历史假接线需要 `baton new` 开单整改（如有，附 `文件:行号` + 复现证据）。
````

