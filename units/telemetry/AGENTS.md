# Telemetry Unit — Agent 维护纪律

1. **唯一事实源**：`schema/canonical_event.json` 是全工程跨栈（Python/Node/Go）事件定义的唯一真相源，任何字段增改必须先改 Schema 并更新版本。
2. **零泄漏铁律**：事件模型中严禁添加包含明文敏感信息的原始字段；所有 Payload 必须是经 Sanitizer 处理过的脱敏结构。
3. **Fail-Safe 原则**：遥测单元在任何异常、磁盘满或断网场景下，绝不可抛出未捕获异常阻塞调用宿主。
