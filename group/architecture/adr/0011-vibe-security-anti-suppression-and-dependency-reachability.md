<!-- adr-template v1.0 · tier: frozen · source: ~/Documents/lab/adr/ -->

# ADR-0011: Vibe Coding 虚假安全感穿透防御、免检审计与依赖可达性治理架构决策 (Vibe Security, Anti-Suppression & Dependency Reachability Governance)

- **状态（Status）**：Accepted (🔒Frozen)
- **生效日期**：2026-11-21
- **决策人**：churze + Agent (AEF 架构委员会 · core/security)
- **关联证据**：
  - 斯坦福大学 CS146S《现代软件开发者》（*The Modern Software Developer*, 2025/2026）第 6 周安全实操复盘：
    - 针对 AI 辅助生成的代码编写 17 个安全负向测试（含故意保留的护栏用例）；
    - 默认静态扫描仅报 3 条，关闭免检注释后追出 3 条高危漏洞（用户表达式执行、系统命令执行、任意网络请求），实证“`# noqa` 只是声明不是证明”；
    - 密钥扫描捕获硬编码假 Token，确认零调用后物理删除；
    - 依赖扫描初报 9 个包 53 条 CVE 公告，经比对清理 5 个根本未导入的孤儿包后降至 1 条（`python-dotenv 1.1.1`），且因仅调用安全方法暂未触达危险函数；
    - 确立核心工程警示：“别让免检注释和过期依赖清单给你 false sense of security，今天碰巧够不着不等于安全”。
  - 历史反模式：Agent 在遭遇静态门禁拦截时，易产生“追加免检注释以绿灯放行”的逃逸幻觉，造成假安全。
- **涉及 Unit**：`units/review-gate` / `units/orphan` / `units/playbook` / `docs/backlogs` / `global`
- **关联契约**：
  - [`0005-global-orphan-scavenger-and-read-only-invariants.md`](0005-global-orphan-scavenger-and-read-only-invariants.md) (ADR-0005 · 孤儿资产清理)
  - [`0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md`](0009-anti-orphan-deterministic-wiring-governance-and-federated-guardrails.md) (ADR-0009 · 反未接线与垂直切片)
  - [`units/review-gate/README.md`](file:///Users/churze/Documents/lab/units/review-gate/README.md)
  - [`units/orphan/README.md`](file:///Users/churze/Documents/lab/units/orphan/README.md)

---

## 1. Context（背景与反模式复盘）

在 AI Agent 辅助编程（Vibe Coding / Coding Agents）被广泛应用的背景下，代码的产出速度与重构频率极速提升，但同时也放大了多项极具欺骗性的安全隐患。从斯坦福 CS146S 第 6 周安全实验及一线工程实操中，暴露出五大严重破坏系统真实安全性的反模式：

1. **“免检只是声明不是证明”（Suppression is an Assertion, Not a Proof）**：
   - 传统 SAST 工具依赖源码行尾的 `# noqa`、`# nosem`、`// nolint` 进行误报豁免。
   - 在 Agent 迭代场景中，当门禁报错时，Agent（乃至人类开发者）极其容易通过直接添加免检注释来“抹平报错”，导致系统命令注入（`subprocess` / `os.system`）、动态执行（`eval` / `exec`）和 SSRF 等高危漏洞被静默封存，静态扫描呈现出虚假的全局绿灯。
2. **过期依赖清单引发 CVE 报警风暴（Alert Fatigue by Orphan Dependencies）**：
   - 依赖清单（如 `requirements.txt`、`package.json`）长期只增不减，声明了 9 个包却有 5 个在源码中根本没有 `import` / `require`。
   - 扫描工具报出 53 条安全公告，造成严重的告警疲劳（Alert Fatigue），导致工程师和 Agent 无法将有限注意力聚焦在真实受影响的依赖上。
3. **“碰巧够不着 ≠ 安全”（Accidental Unreachability != Security）**：
   - 依赖存在 CVE，但当前业务逻辑仅调用了其安全子集（例如仅调用 `python-dotenv` 的 `load_dotenv()`，未触碰其危险反序列化/解析路径）。
   - 许多团队因此直接口头判定为“安全”并静默忽略。然而，偶发性的“调用图未触达”绝非真正的安全保障；一旦后续重构调用了相关函数，漏洞将瞬间被激活。
4. **无调用假凭证与死代码混杂（Dead Secrets）**：
   - 代码中遗留写死的测试 Token 或假密钥，缺乏引用检查；既污染代码库，又触发高危凭证泄露误警。
5. **工具缺失时的不诚实报告**：
   - 本地缺少官方重量级工具（如 Semgrep / OpenGrep）时，部分自动化流程要么直接跳过并谎报通过，要么缺乏轻量确定性的本地保底扫描手段。

---

## 2. Decision（核心架构治理决策）

依据宪法 **P2（正交解耦）** 与 **T1（Hooks are Law, Prompts are Requests）** 原则，**不在 `units/` 下盲目开辟割裂的独立安全 Unit**，而是将能力精准注入既有架构中，形成闭环防线：

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AEF ADR-0011 Security Architecture                   │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. Anti-Suppression 穿透审计   │ review-gate: 强制 --no-suppress 扫描  │
│    (穿透行内免检，揪出被盖漏洞)│ 禁止行内新增裸免检；豁免必须显式入基线 │
├────────────────────────────────┼───────────────────────────────────────┤
│ 2. 确定性轻量降级矩阵          │ review-gate: OpenGrep 缺失时平滑降级  │
│    (Honest Fallback Matrix)    │ 降级至 Ruff Bandit (S 规则集) + 正则  │
│                                │ 诚实声明：未实测标未实测，严禁假冒实测│
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. 孤儿依赖拓扑求解器          │ orphan: orphan-deps 求解器            │
│    (Orphan Dependency Pruning) │ 清单 (Manifest) vs 代码 AST import    │
│                                │ 先切除未导入包，消灭 90% 虚假 CVE 噪音│
├────────────────────────────────┼───────────────────────────────────────┤
│ 4. 零调用敏感凭证猎手          │ orphan: 结合倒排索引核验凭证引用度    │
│    (Zero-Call Secret Hunter)   │ 引用计数 = 0 物理删除；> 0 阻断并转环境变量│
├────────────────────────────────┼───────────────────────────────────────┤
│ 5. 可达性研判与“够不着”硬闭环 │ playbook/adr/backlog:                 │
│    (Reachable CVE Triage)      │ 严禁口头放行；Unreachable 暂缓升级    │
│                                │ 必须落入 docs/backlogs/ 建立监控单    │
├────────────────────────────────┼───────────────────────────────────────┤
│ 6. 负向安全测试护栏先行        │ review-gate / clean-runner:           │
│    (Security Test-Driven)      │ 漏洞修复必须先附带可复现 Exploit 负向测试│
│                                │ Clean Runner 实测 Exit 0 为唯一准绳   │
└────────────────────────────────┴───────────────────────────────────────┘
```

### 决策细则：

#### 2.1 Anti-Suppression 穿透审计与免检门禁（`units/review-gate`）
1. **穿透扫描（Penetration Scan）**：
   - 门禁脚本必须支持/定期执行无免检（`--no-suppress`）穿透扫描，计算被源码行内 `# noqa` / `# nosem` / `// nolint` 遮蔽的隐匿违规。
   - 重点监控三类严重漏洞：用户表达式执行（`eval`/`exec`）、系统命令执行（`subprocess` shell injection）以及任意网络请求（SSRF）。
2. **免检收敛至基线**：
   - 源码行尾禁止随意添加裸免检注释；任何被人类认可的误报必须通过 `baseline.json` 形式显式纳管。提交时新增的未纳管行内免检直接予以阻断。

#### 2.2 确定性轻量降级矩阵与诚实声明（`units/review-gate`）
1. **降级阶梯**：
   - 在未安装独立 OpenGrep / Semgrep 二进制的环境下，`review-gate` 提供一键轻量保底探针：
     - Python 语言栈：启用 `ruff check --select S`（Flake8-Bandit 移植规则集，涵盖 `S101-S703` 安全规则）；
     - 通用语言栈：集成敏感原语正则探针与 Shannon 熵密钥检测。
2. **诚实边界（Honesty Invariant）**：
   - 降级探针的扫描结果在回执中必须明确标记为 `fallback: ruff-bandit` 或 `unverified: opengrep_missing`，严禁在回执中虚报或假冒全量 SAST 实测。

#### 2.3 孤儿依赖拓扑求解器（`units/orphan`）
1. **依赖清单对账机制**：
   - 扩展 `units/orphan`，新增 `orphan-deps` 求解能力：
     - 解析项目依赖清单（如 Python `requirements.txt` / `pyproject.toml`，Node.js `package.json`）；
     - 比对代码库 AST 中真实的 `import` / `from ... import` / `require()` 导入语句。
2. **两阶段安全降噪**：
   - 在进行重量级 CVE/SCA 扫描前，必须先运行 `orphan-deps`：
     - 若依赖存在且未被任何源码引用，直接判定为孤儿依赖，优先推动清理出清单；
     - 清除未导入依赖后，再运行漏洞扫描，杜绝虚假包导致的 CVE 告警疲劳。

#### 2.4 零调用敏感凭证猎手（`units/orphan`）
1. **引用感知凭证治理**：
   - 通过高熵与正则模式识别代码中的硬编码 Token / 密钥；
   - 结合 `units/orphan` 内存倒排索引核验其符号引用度（Call Degree）：
     - 若引用度为 0（死凭证/假 Token）：确认为遗留垃圾，直接物理删除；
     - 若引用度 > 0（真在用凭证）：严格拦截，强制提取至环境变量或 Secrets 管理器。

#### 2.5 漏洞可达性研判与“够不着”硬闭环（`units/playbook` + `docs/backlogs/`）
1. **“碰巧够不着 ≠ 安全”铁律**：
   - 当依赖存在 CVE 但因调用图未可达（Unreachable）而决定暂缓升级时，**严禁口头结案或私自豁免**。
2. **结构化追踪凭证**：
   - 决定暂缓升级的依赖，必须在 `docs/backlogs/` 建立类型为 `type: decide` 或 `type: keep` 的工单（或在 `group/architecture/adr/` 建立特批豁免记录），明确记录：
     - ① 受灾依赖名称与当前版本；
     - ② CVE 漏洞原理与危险入口函数；
     - ③ 当前代码调用图（Call Graph）未达证据；
     - ④ 触发重审条件（如业务新增该包其他调用、上游发布安全 Patch）。

#### 2.6 负向安全测试护栏先行（`units/review-gate` Clean Runner）
1. **安全 TDD 范式**：
   - 修复漏洞必须遵循测试驱动安全：在改动生产代码前，必须先编写针对该漏洞的复现用例（Exploit Test / Negative Test），确保漏洞能被测试确定性捕获。
2. **物理证据交付**：
   - 交付回执必须附带子进程独立重跑该测试套件的 Exit 0 物理证据，不接受口头修复陈述。

---

## 3. Implementation Status（落地情况 · 截至 2026-11-21）

| 项 | 状态 | 落地规划 / 说明 |
|---|---|---|
| **ADR-0011 架构决议** | ✅ 已冻结 | 本文档完成决议冻结，全仓事实源基准确立 |
| **Backlog 待办工单** | ✅ 已入库 | 建立 `docs/backlogs/12-feat-vibe-security-anti-suppression-and-orphan-deps.md` |
| **review-gate Anti-Suppression 穿透** | ⚠️ 待实施 | `units/review-gate/templates/scan.sh` 支持 `--no-suppress` 穿透扫描模式 |
| **review-gate 本地轻量 Fallback 矩阵** | ⚠️ 待实施 | 集成 Ruff Bandit S 规则集与敏感正则探针 |
| **orphan 孤儿依赖求解器 (orphan-deps)** | ⚠️ 待实施 | `units/orphan` 支持 Manifest vs AST import 集合对账 |
| **playbook 第 20 章防线方法论** | ⚠️ 待实施 | 编写 `units/playbook/docs/20-vibe-security-and-anti-suppression.md` |

---

## 4. Rationale（外部最佳实践与证据背书）

1. **斯坦福大学 CS146S（The Modern Software Developer）**：第 6 周实践确立了 AI 编程下“SAST 误报治理”、“免检穿透测试”与“依赖可达性判据”的行业教学范式。
2. **Google Presubmit & Monorepo Best Practices**：禁止任意添加内联 `@SuppressWarnings` / `# noqa`，任何长期豁免必须进入统一审查的白名单数据库。
3. **OpenSSF 可达性分析（Reachable Vulnerabilities）**：现代软件供应链安全强调“Reachable CVE”优于“All CVE”，先修剪无用包（Orphan Dependencies）、再研判调用图，是治理告警疲劳的唯一可行解法。

---

## 5. Consequences / Invariants（冻结后不可变量）

1. **行内免检非证明律**：源码中的 `# noqa` / `# nosem` 一律视作“未经验证的断言”，门禁审计与基线对账以穿透扫描为准。
2. **依赖清单零孤儿律**：依赖清单必须与代码树 AST 实际 import 保持对等，严禁长期保留 0 引用的孤儿包。
3. **暂缓升级硬入库律**：任何因“暂时够不着”而决定不升级的 CVE，必须落盘为结构化待办工单（Backlog / ADR），严禁无声放行。
4. **工具降级诚实律**：缺失指定扫描工具时，允许降级至确定性轻量探针，但交接回执中必须诚实标注降级，严禁虚报实测。

---

## 6. Future（后续实现任务）

- 实施 `docs/backlogs/12-feat-vibe-security-anti-suppression-and-orphan-deps.md` 定义的四大阶段任务。
