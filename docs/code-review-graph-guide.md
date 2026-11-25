# code-review-graph 落地与使用指引（审查与影响面图谱）

> **定位**：代码变更审查与爆炸半径（Blast Radius）分析引擎。
> **分工原则**：
> - 现有的 **`codegraph`**：负责**写前/阅读检索**（`explore` / `query` 自然语言概念检索，避免盲目 grep）；
> - 新引入的 **`code-review-graph`**：负责**写后/评审与审计**（基于 Git Diff 计算变动受灾面、关联 Callers、关联单测遗漏与死代码）。

---

## 1. 安装与就绪检查

`code-review-graph` 是本地安装的 Python 全局工具，使用 `uv` 进行沙箱隔离安装：

```bash
# 全局隔离安装 / 升级
uv tool install code-review-graph
# 或已有环境更新
uv tool upgrade code-review-graph

# 检查安装
code-review-graph --version
```

---

## 2. 仓库索引与更新

每个项目仓库使用独立的本地 SQLite 图数据库（存储于 `.code-review-graph/`，已配置在 `.gitignore` 中）：

```bash
# 1. 首次全量建图（解析全仓语法树、函数、调用链与测试关系）
code-review-graph build

# 2. 代码修改后增量更新（秒级，只重新解析变动文件）
code-review-graph update

# 3. 查看当前图谱节点、边数与支持语言统计
code-review-graph status
```

---

## 3. 核心审查命令与实战用法

### A. 爆炸半径（Blast Radius）分析 —— 审查必备
在修改完代码准备提交或交付时，运行：
```bash
code-review-graph impact
```
- **自动检测当前未提交变动（Git Diff）**；
- 输出受波及的函数节点、直接/间接调用方（Callers）以及关联的测试文件；
- 估算可为 Review Agent 节省的 Token 比例（通常达 70%~90%）。

如果想针对特定文件或指定提交对比：
```bash
code-review-graph impact --files units/handoffs/handoff.mjs
code-review-graph impact --base main
```

### B. 孤儿代码与无调用符号检测（Dead Code）
配合 `units/orphan` 治理，扫描无调用方、无单测引用的符号：
```bash
# 查看死符号（支持过滤函数或类）
code-review-graph dead-code --kind Function --limit 30

# 机器可读 JSON 输出
code-review-graph dead-code --json
```

---

## 4. MCP Agent 工具接入

已在 Antigravity 全局配置（`~/.gemini/antigravity/mcp_config.json`）中注册：

```json
{
  "mcpServers": {
    "code-review-graph": {
      "command": "/Users/churze/.local/bin/code-review-graph",
      "args": ["serve"]
    }
  }
}
```

Agent（如 Antigravity / Claude Code / Cursor）可在会话中直接调用的核心 MCP 工具：
- `detect_changes_tool`：自动对当前变更生成风险打分和影响面总结；
- `get_impact_radius_tool`：输入改动点，返回精简的爆炸半径切片；
- `get_review_context_tool`：只提取受影响源码切片，极度节省 Review 上下文；
- `query_graph_tool`：按 `callers_of` / `callees_of` / `tests_for` 查询依赖。

---

## 5. 配合 ReasonWeave / AEF 工程纪律

1. **作为 E1 静态证据附入交付回执**：
   在 `baton receipt <id> --deliver` 中，Audit 或开发角色可将 `code-review-graph impact` 的摘要直接作为证据链（证明“本次变动影响的下游调用已核对，对应单测均覆盖”）。
2. **审查防线（Review Gate）协同**：
   在审查大型 PR 时，禁止盲目全仓塞上下文；优先通过 `detect_changes_tool` 聚焦风险点。
