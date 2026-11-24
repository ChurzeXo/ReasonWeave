# ReasonWeave — Agent Engineering Toolkit

## Overview
本仓库是可复用的 Agent / AI 辅助工程能力库（ReasonWeave，原 lab-agent-toolkit），为软件项目提供正交、可插拔的研发纪律机件与规范。

## Repository Layout (ZSpec / AEF v1.0)
```
constitution.md      最高宪法（单一事实源、门禁原则、无感兼容）
group/               全局事实层
  ├── product/       产品意图 (intent.md)
  ├── architecture/  拓扑依赖图 (dependency-graph.md)
  └── contracts/     打包与分发契约 (npm-packaging.md)
units/               独立工程单元（各模块自治上下文）
  ├── handoffs/      跨仓/仓内工作流交接中枢与 CLI 引擎
  ├── preflight/     仓库不变量探针与提交门禁
  ├── review-gate/   SAST 扫描与代码质量防线
  ├── adr/           架构决策记录机制与模板
  ├── spec-guard/    全局架构漂移与规约守卫 (P3' 对账矩阵)
  ├── backlog/       待办捕获制度与模板
  ├── worktree/      基于 Git Worktree 的物理目录隔离调度引擎
  ├── orphan/        全局死代码与孤儿资产清道夫公共单元 (Core + Adapters)
  ├── skills/        微观工程原子技能库与上下文零污染切片引擎 (TDD/Debug/Verification/Brainstorming)
  └── playbook/      Agent Engineering Framework 方法论全集
specs/               Spec Kit 规划与实施产物
docs/                辅助文档与待办 (docs/backlogs/)
<module> (symlinks)  根目录向后兼容软链接，无缝保障已有消费项目
```

## Isolation & Unit 规则
1. **Unit 自治**：各 Unit 独立维护自身的 `VERSION.md`、`CHANGELOG.md` 及核心规范。
2. **禁止破坏根目录兼容层**：根目录下的软链接（`handoffs`、`preflight`、`skills` 等）必须保持完好，确保现有消费方不中断。
3. **运行态与能力库严格分离**：`units/handoffs/` 内的交接票据与回执属于本地使用记录，严禁进入 git 跟踪或打包发布。

## Key Documents
- `constitution.md` — 仓库最高宪法（修改须人类审核）
- `group/product/intent.md` — 产品意图
- `group/architecture/dependency-graph.md` — 依赖关系与发布节奏
- `group/contracts/npm-packaging.md` — NPM 打包与发布契约

## Agent Guidelines
- 读取上下文顺序：**本文件 → `constitution.md` → 目标 Unit 的 `AGENTS.md` 与 `README.md`**。
- 对任一 Unit 的改动，必须在该 Unit 内完成更新、测试并更新对应的 `VERSION.md` 与 `CHANGELOG.md`。
- 修改脚本文件（`*.sh` / `*.mjs`）必须保持 POSIX 兼容性或纯 Node 原生模块依赖。
- 未经请求不得随意引入重量级第三方依赖。
- **改源不改造实例（SSOT 核心铁律）**：动任何“种子/默认值/派生镜像/配置”前，必须先确认单一事实源（SSOT）；严禁绕过源直接在库中敲裸 UPDATE 或就地 patch 物化副本，任何源的修改必须与迁移同步脚本/重物化在同一 commit 提交。
- **全 CLI 物理契约对齐律（CLI Contract Invariant · ADR-0013）**：所有 CLI 工具入口（`package.json` `bin`）必须提供 `--version` / `-v` / `--help` / `-h` 并以 Exit 0 退出；版本号必须动态解析自本模块 `VERSION.md`（或根目录 `package.json`），严禁手写静态版本字面量；由 `tests/cli-contract.test.mjs` 门禁常驻核验。
- **单测零环境寄生与沙箱隔离律（Hermetic Testing Sandbox · ADR-0013）**：单测严禁在宿主仓直接写操作或依赖宿主 ambient 状态；涉及文件/Git/Hub 操作必须强制使用 `createTestRepo()` 在 `os.tmpdir()` 创建独立沙箱并在 `finally` 阶段可靠清场；运行前必须清洗宿主注入的外部会话环境变量；脚本路径解析统一使用 `import.meta.url`。
- **结构化输出优先与单事实提取（Structured Output Protocol · ADR-0013）**：程序间交互必须优先使用 `--json`；纯文本解析严禁使用 `[a-f0-9\-]+` 等极易发生贪婪截断的简陋正则，统一使用权威提取函数（`extractTicketId`）。
- **产物同构与防御性探针（Schema Invariance & Defensive Probe · ADR-0013）**：多执行引擎（原生 vs 降级）工具的产物必须输出一致的顶层控制元数据（`engine`, `fallback`, `version`）；环境探针（`lab doctor`）严禁盲目吞没异常，必须明确区分物理文件缺失、进程超时与 PATH 未配置。
- **文档与规约联动对齐律（Doc-Code Synchronization Invariant）**：严禁代码演进但文档与规则滞后；提交前必须自主对照「变更触发矩阵」判定并联动更新：
  1. **动版本 / Unit / 接入桩** $\to$ 联动 `VERSION.md`、`CHANGELOG.md`，运行 `baton install` 幂等刷新全载体（`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`README.md`），同步对齐 `INSTALL.md`、`使用说明.md`、`README.md` 与 `docs/CONSUMER-PROMPTS.md` 预期版本字面量；
  2. **动 CLI 入口 / 参数 / 退出码** $\to$ 联动 `INSTALL.md`（CLI 矩阵与前置体检）、`使用说明.md`（命令速查与用法实战）、`README.md` 及 `tests/cli-contract.test.mjs` 门禁；
  3. **动架构决策 / 研发纪律 / 门禁防线** $\to$ 必立项 ADR，提炼核心不可违背铁律注入 `AGENTS.md` / `CLAUDE.md` 的 `## Agent Guidelines`，并在 `units/playbook/docs/` 沉淀对应方法论；
  4. **纯内部实现重构（外部契约、版本号与 CLI 未变）** $\to$ 仅更新 Unit 内部 `CHANGELOG.md` 与测试用例，**严禁**随意篡改全局安装与使用文档制造无意义噪音。

## 反未接线与反假接线宪章（Anti-Orphan & Anti-Fake-Wiring · 强制）

> 权威出处：[ADR-0009](group/architecture/adr/0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md) → `units/playbook/docs/19-anti-orphan-vertical-slicing.md` & `units/orphan/README.md`（§5–§8）。与 `CLAUDE.md` 同名章节等价，改一处须同步另一处。

1. **垂直切片铁律**：严禁水平单层交付。任何新增原语、CLI 子命令、`export` 符号或路由，必须在**同一次提交**内完成 `底层实现 → 注册表/Schema 声明 → 主入口可见（bin/lab.mjs、index.mjs、package.json bin）` 闭环。
2. **DoD 接线与三层正交判据**：单元测试通过**不等于**完成，必须附接线证据（"系统的哪个主入口现在能实际触发它"）。业务仓按三层正交解耦落地：L1（静态双向拓扑零差集，禁追逐无穷表达式/反射黑名单，反射归 OpenGrep SAST）→ L2（唯一 `.venv` 运行时非空产出 + 失败传播 + `--verify-mutations`，接入 CI 与 `preflight.conf` `RECONCILE_CMD`）→ L3（真机/外设产出非对称 Ed25519 + 新鲜度硬门限）。
3. **物理门禁**：本仓 Fast Gate 挂载于 `.git/hooks/pre-commit`（软链至 `$HOME/dev-templates/hooks/pre-commit-node`，SSOT 为 `units/orphan/templates/wiring/pre-commit-node.sh.template`），提交时自动执行 `node --check` + `lab-orphan check-diff --staged`；被拦截时按输出的「缺失清单 + 修复动作」自愈，**禁止用 `--no-verify` 绕过**（紧急豁免仅限 `SKIP_WIRING_GATE=1`，且需在回执/PR 补交 Wiring Proof）。
4. **交割审计与自主呈批开单**：审计方（`to_lane: audit`）第一道防线为孤儿与接线检查，新增导出无生产调用者一律驳回。发现本任务新引入断链当场修完复测；发现越界/历史/跨端断链禁静默跳过或越界硬改，须附 `文件:行号` + L1/L2 复现证据，主动询问人类是否执行 `baton new` 开单整改。

<!-- handoff-stub:v2.1 begin -->
<!-- generated — do not edit -->
<!-- stub:sha256:668a586b -->
### Agent Baton (Handoff) 接入桩（轻量韧性版 · 细则以 $(lab path handoffs)/README.md 契约 v2.41.0 为准）

**核心守卫与身份（强制）**
- **物理工作区边界**：会话严格绑定当前宿主工作区，严禁跨仓 cd 操作外部代码；跨仓请输出交接提示词引导人类在目标仓 Agent 会话中派发。
- **一单到底与会话ID统一（强制 · v2.36.0）**：工单物理 ID 即为会话 ID（全局唯一统一），严禁物理 ID 与会话 ID 分裂。所有轮次（Round 1..N）在原单同一 ID 下流转闭环，严禁轮次变异；任务主题全生命周期保持一致。
- **严禁跨会话处理工单（最高宪法级隔离）**：工单全程严格绑定发起会话；严禁跨会话处理/推进/闭环外部工单（`forward`/`accept`/`reopen` 仅限原发起会话执行；接收方接单必须显式带工单编号，严禁从全局待办中盲目抢单）。
- **命令形态与显式身份**：一律 `baton <op>` 或 `handoff <op>`。全面支持 `--as <lane>` 显式声明身份，同一会话无缝切换多工单。
- **会话身份锁与凭证防伪**：支持 `baton lane <lane>` 锁定会话身份；环境绑定优先级 `HANDOFF_LANE` > `baton lane` > `--as <lane>`；审计交付必须持有 `audit.token` 密码学签章，禁止发起方跨角色自我闭环。
- **确定性自愈**：校验细节（Nonce、证据路径、数据一致性）由 CLI 运行时精准拦截；若命令报错，末尾 100% 打印可直接复制的一键自愈命令。

**入站工作流（接单 · 交付 · 退回）**
1. **查待办**：运行 `baton status --as <本方 lane|target>`（直取本方未闭环待办工单，或全量 `baton status`）。
2. **读工单**：运行 `baton show <id>`，根据验收判据改动本 lane 范围代码并实测。
3. **交付或退回（实测为唯一准绳）**：
   - **实测通过**：照抄 `$(lab path handoffs)/RESPONSE-TEMPLATE.md` 骨架 → 运行 `baton receipt <id> -n "<正文>" --deliver --as <本方 lane> --evidence-paths "<路径>"`（审计工单附 `--audit-nonce "<nonce>"` 或同工作区授权下使用 `--auto-nonce` 自动绑定最新令牌；红队用例严格遵循 NO_DISPATCH / NO_COMPLETE / COMPLETE 三态标准）。
   - **实测未过（NO-GO/受阻）**：享有安全下车通道，直接运行 `baton reject <id> -n "<理由/缺失条件>" --as <本方 lane>` 退回整改。
4. **收尾自检**：运行 `baton check [id]`（若有数据漂移可加 `--fix` 自动修复）。
5. **入站回复收尾（简洁单行裁决 · 严禁角色漂移）**：接收方必须严格保持本方执行/审计角色，严禁切换为发起方角色；**严禁反向输出 `## 交接提示词` 卡片或调用 `baton close` 越权闭环**；最终回复人类的最末尾仅输出单行纯文本（无需标题，无需代码块，严禁多行出站卡片）：
   - 审计驳回：`审计完成，裁决 NO-GO（工单已退回<发起方角色>进入 Round <N>）`
   - 审计通过：`审计完成，裁决 GO`
   - 普通交付：`交付完成，回执已就绪`
   后续 Round 轮次由发起方在出站重新转递时统筹计算并派发。

**出站工作流（派发 · 监听 · 严禁漏开监听）**
1. **建单与转递（单工单原子闭环 · 99%场景）**：`baton new <target|lane> <type> "<标题>"`，填写正文后直接作为宿主后台任务（如 `WaitMsBeforeAsync: 500`）运行 `baton forward <id> --wait`（双盲审计附加 `--blind` 脱敏思考自辩；单工单严禁使用 `--async` 拆分两步！）。
2. **多单并发派发（仅限一次性派发多单）**：`baton forward <id1> <id2> ... --async`，派发后必须立即作为后台任务运行 `baton wait <id1> <id2> ... --all` 聚合监听平账（严禁将多单提示词混杂在同一个代码块内）。
3. **出站回复收尾（交接提示词规范）**：出站由发起方统一计算与推进 Round 轮次；回复最末块必须固定为独立代码块，方便人类一键复制给接收方 Agent（其后无任何正文）：
   ## 交接提示词
   ```text
   请 [<目标角色>] 接单：
   [发起角色] [<发起角色>]
   [任务主题] <主题>
   [任务轮次] Round <round>（第 <round> 轮复审）
   [工单编号] [<conversation_id>]
   [工单路径] <交接路径>
   [接单指令] baton lane <to_lane>（或操作时附带 --as <to_lane>）
   ```

详见 `$(lab path handoffs)/AGENT-GUIDE.md` 获取完整版 Preflight。
<!-- handoff-stub:v2.1 end -->
