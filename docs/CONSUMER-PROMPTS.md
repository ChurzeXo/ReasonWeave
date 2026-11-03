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

---

### 0. 前置环境就绪声明（必读）
由于本能力库目前在本地开发态，各机器首次使用前，只需在终端执行一次全局软链接挂载：
```bash
cd ~/Documents/lab && npm link
```
*挂载后，系统全局即拥有 `lab`、`handoff`、`adr-init` 三大 CLI。*

---

### 场景一：全新项目 ZSpec 架构初始化与规范挂载（推荐）

> 📋 **适用场景**：新建项目从第 0 天起建立工业级 ZSpec (AEF v1.0) 架构，包含宪法、共享事实层、规格区与门禁。  
> 📋 **使用方式**：复制以下内容发送给新项目的 AI Agent 会话：

```markdown
请按 ZSpec (AEF v1.0) 工业标准为本项目初始化工程架构与纪律门禁。

### 执行工序（确定性 CLI 驱动）：
1. **环境检查**：
   - 运行 `lab doctor`，若命令不存在则执行 `cd ~/Documents/lab && npm link` 挂载。
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
  再次运行 `lab doctor` 确认三大 CLI（`lab`, `handoff`, `adr-init`）全部就绪。

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

#### 3. 检查 6 大能力单元是否齐全（补全遗漏）
- 核对 AGENTS.md 中的工程规范，确保包含全部 6 个 Unit：
  - [ ] `adr`（架构决策记录，配套 `adr-init`）
  - [ ] `backlog`（待办捕获，`docs/backlogs/`）
  - [ ] `preflight`（不变量探针与提交门禁）
  - [ ] `review-gate`（代码静态扫描与评审防线）
  - [ ] `handoffs`（工作流交接中枢，`handoff` 命令）
  - [ ] `playbook`（AEF 架构方法论与 Spec-kit 契约：`$(lab path playbook)/README.md`）
- **自愈规则**：若缺少 `playbook` 或 `handoffs` 规范说明，请直接在 AGENTS.md 对应节中补上一行标准指针。

#### 4. 检查是否违背“规范不内联”铁律
- 检查 AGENTS.md 是否不小心大段复制了某模块的 README 正文或细则。
- **自愈规则**：若有大段复制，将其精简为“指针 + 一句操作指令”，保持 AGENTS.md 紧凑清晰。

---

### 验收交付报告：
排查修复完成后，向我汇报：
1. `lab doctor` 环境状态（绿灯/黄灯/红灯）
2. 修复/补全了哪些项（如路径替换、补充 playbook 引用等）
3. 最终 AGENTS.md 的规范声明片段
```

---

### 场景四：轻量项目仅接入纪律机件（不做 ZSpec 宏观重构）

> 📋 **适用场景**：已有成熟目录结构的小型项目，只想接入门禁（preflight）、代码扫描（review-gate）和 ADR，不调整顶层目录。  
> 📋 **使用方式**：复制以下内容发送给该项目的 AI Agent 会话：

```markdown
请为本项目接入轻量级工程纪律机件（来自 lab-agent-toolkit）：

1. **环境检查**：终端运行 `lab doctor`，若未就绪执行 `cd ~/Documents/lab && npm link`。
2. **在 AGENTS.md 增加指令指针**：
   - 架构决策：按 `$(lab path adr)/README.md` 接入，新建决策运行 `adr-init . light "<项目名>"`。
   - 待办捕获：按 `$(lab path backlog)/README.md` 将待办记录至 `docs/backlogs/`。
   - 提交门禁：按 `$(lab path preflight)/README.md` 将 `$(lab path preflight)/templates/preflight.sh` 接入为提交前检查。
   - 代码扫描：按 `$(lab path review-gate)/README.md` 接入本地扫描。
3. **铁律**：严禁复制规则全文，只保留动态指针。接入后运行一次 `git status` 汇报。
```
