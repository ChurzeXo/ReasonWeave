# 优秀单测设计指南 (Writing Good Tests)

## 1. 黄金准则
1. **一个测试只验证一件事**：单一职责原则同样适用于单测。
2. **测试名称清晰自描述**：`test('rejects expired token with EXPIRED_TOKEN error')` 优于 `test('auth test')`。
3. **隔离性（Hermetic Sandbox）**：
   - 严禁依赖运行环境残留状态；
   - 凡涉及文件 IO、网络或 Git 操作，必须在独立临时目录沙箱（`createTestRepo()`）中运行并在 `finally` 阶段删除。

## 2. 坏测试坏味道清单
- **过度 Mock**：Mock 掉了 90% 的真实代码，结果测试绿了但上线就崩；
- **脆弱断言**：断言一整个大对象的字符串表现形式，微小的空格或换行改动都会引发误报；
- **测试间相互污染**：Test 1 修改了全局变量，导致 Test 2 依赖于 Test 1 的执行顺序。
