# ADR INDEX

> 唯一索引表。**只有 Accepted 的条目才应被注入 Agent 上下文**（见 playbook docs/05 §4）。
> 会话启动可注入本表全量（一行一条，成本低）；具体任务只带最近 3–5 条的 Decision 段。

| ADR | 标题 | 状态 | 日期 | Unit | 文件 |
|-----|------|------|------|------|------|
| 0001 | 记录架构决策本身 | Accepted | YYYY-MM-DD | group | `0001-record-decisions.md` |
| 0002 | | | | | |
| 0003 | | | | | |

## 状态说明

- **Proposed** — 已起草，等人 review。不入 Agent 上下文。
- **Accepted** — 生效，代码须反映它。入索引。
- **Rejected** — 留档（含否掉的理由），不入索引。
- **Superseded by NNNN** — 被新决策取代，保留历史，链接到继任者。
