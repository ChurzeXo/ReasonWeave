# Backlog Entry — 单条模板

```markdown
## B-NNN <一句话标题>
- **类型**: 待拍板 | 未来功能 | 临时绕行 | 越界发现
- **涉及 Unit**: <unit-a>, <unit-b>
- **现状**: <当前是什么情况、为什么是问题（没这两句三个月后没人看得懂）>
- **需要什么**: <要人决定什么 / 要做什么>
- **拍板人**: （留空 = 待定）
- **来源**: <specs/NNN-* / 任务 / 代码位置，可写 FIXME(B-NNN) 反向引用>
- **日期**: YYYY-MM-DD
- **状态**: Open | Rejected（+一句理由）| Done（+去向）
```

## 使用约定

- 文件放 `docs/backlogs/`，**按主题聚合**（`1-content-storage.md`），不按日期
- 编号 `B-NNN` 全项目递增，**不复用**
- 代码里反向引用：`// FIXME(B-007)`
- 拍板去向只有三个：变成 feature（走 `/speckit.specify`）/ Rejected 留档 / 继续挂着
- **append-only**：已处理的条目改状态，不删除

## 边界

| 场景 | 去哪（不要进 backlog） |
|---|---|
| 跨仓 / 依赖方要改 | handoff |
| 架构级决策 | ADR |
| 本次 feature 未完成任务 | `/speckit.converge` 回写的 tasks.md |
| 产品需求本身 | `group/product/requirements.md` |
