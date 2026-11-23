# 调用链逆向溯源技术指南 (Root Cause Tracing)

当报错发生在调用栈较深的位置时，切勿在深层报错点直接套 `try/catch` 或加默认值掩盖问题。必须使用逆向溯源：

## 1. 溯源四问
1. **Bad Value 究竟是什么？**（如 `undefined`, `NaN`, 空字符串, 格式错误的 UUID）
2. **谁生成了这个 Bad Value？**（直接参数传入，还是内部计算错误？）
3. **是谁在上一层调用中传入了它？**（沿着调用链向上一层查 callers）
4. **源头为何会产出此值？**（读取了缺失的配置？文件被并发删除了？外部 API 返回异常？）

## 2. 诊断插桩规范 (Diagnostic Instrumentation)
在组件边界处打印关键数据，例如：
```javascript
// 边界层日志打印规范
console.error('[DIAGNOSTIC] Boundary check:', {
  caller: new Error().stack?.split('\n')[2]?.trim(),
  inputKeys: Object.keys(input || {}),
  criticalField: input?.criticalField,
  envState: process.env.TARGET_ENV ? 'SET' : 'UNSET'
});
```

在测试通过后，记得清理诊断插桩代码，保持提交历史整洁。
