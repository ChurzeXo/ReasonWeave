# Dependency Graph — 跨 Unit 依赖协调图

> **唯一权威。** 谁依赖谁、契约归谁、谁先合，只认本文件。
> 不要在 AGENTS.md、PR 描述、聊天里另说一套依赖关系。
> 使用规则见 playbook `docs/14-dependency-graph.md`。

**Updated:** YYYY-MM-DD

---

## 表 1 — Unit 依赖矩阵

读法：行依赖列 ⇒ **列必须先合、先发**。`✅` = 依赖，`—` = 无依赖。

| 依赖方 ↓ / 被依赖方 → | `<unit-A>` | `<unit-B>` | `<unit-C>` |
|---|---|---|---|
| `<unit-A>` | — | ✅ | — |
| `<unit-B>` | — | — | — |
| `<unit-C>` | ✅ | ✅ | — |

## 表 2 — 契约与版本

| 契约文件 | 生产者 | 消费者 | 版本 | 最近变更 ADR |
|---|---|---|---|---|
| `group/contracts/api.md` | `<unit-A>` | `<unit-B>`, `<unit-C>` | v1 | ADR-0001 |

## 表 3 — 合并 / 发布顺序（拓扑序）

```
1. group/contracts/      （契约变更，如有 — 必须最先）
2. <unit-A>
3. <unit-B>
4. <unit-C>
```

> 依赖方永远排在被依赖方之后。表 1 变了，本表必须重算。

---

## 变更记录

| 日期 | 变更 | ADR |
|---|---|---|
| YYYY-MM-DD | 初版 | ADR-0001 |

## 待确认

- <未定的依赖关系 → 记入 `docs/backlogs/`>
