<!-- adr-index v1.0 · source: ~/Documents/lab/adr/ -->
# ADR INDEX

> Adopted: adr-template v1.0 (tier: <填入 light | standard | frozen>)
> 唯一索引表。**只有 Accepted / 🔒 Frozen 的条目才应被注入 Agent 上下文**（最近 3–5 条最佳）。
> 会话启动可注入本表全量（一行一条，成本低）；具体任务只带该范围 Decision 段。

| ADR | 标题 | 状态 | 日期 | 范围/Unit | 文件 |
|-----|------|------|------|-----------|------|
| 0001 | 项目 bootstrap 决策 | <Accepted|Frozen> | YYYY-MM-DD | <group/…> | `0001-*.md` |
| 0002 | | | | | |
| 0003 | | | | | |

## 状态说明

- **Proposed** — 已起草，等人 review。不入 Agent 上下文。
- **Accepted / 🔒 Frozen** — 生效。Frozen 不可改，变更走 Supersedes。
- **Rejected** — 留档（含否掉理由），不入索引。
- **Superseded by NNNN** — 被新决策取代，保留历史并链接继任者。
