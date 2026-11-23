# 简明设计文稿模板 (Design Doc Template)

```markdown
# [Design] <特性或重构标题>

- **日期**：YYYY-MM-DD
- **状态**：Draft / Approved

## 1. 意图与核心痛点 (Why)
<用 2-3 句话阐述为什么要做这个改动，当前面临什么问题>

## 2. 方案权衡 (Approaches)
- **方案 A (推荐)**：<描述>
  - 优势：
  - 劣势与成本：
- **方案 B**：<描述>
  - 优势：
  - 劣势与成本：

## 3. 详细设计 (What & How)
- **核心契约 / 接口定义**：
- **数据结构与文件布局**：
- **向后兼容性 (Backward Compatibility)**：

## 4. 验证与回归闭环 (Verification)
- <如何编写单测证实正确性>
- <涉及哪些端到端回归命令>
```
