# Rust 栈反未接线（Anti-Orphan）最佳实践指南

> **适用场景**：高可靠核心引擎、状态机、协议分发、CLI 动作原语。
> **核心哲学**：将“未接线”缺陷转化为编译器无法通过的硬错误（Compile-time Errors）。

---

## 1. 机制 A：穷尽模式匹配（Exhaustive Enum Matching）

严禁在核心调度器、命令分发器或状态转移函数中使用 `_ => {}` 通配符！

### 反模式（容易发生静默未接线）：
```rust
// ❌ 错误示范：通配符吞掉了新变体，导致新增原语未实际接线
match action {
    ActionPrimitive::ReadFile(path) => handle_read(path),
    ActionPrimitive::WriteFile(path, content) => handle_write(path, content),
    _ => eprintln!("Unhandled or no-op"), // AI 新增变体后，这里静默忽略，编译完全通过！
}
```

### 正确实践（穷尽匹配）：
```rust
// ✅ 正确示范：强制显式穷尽所有变体
match action {
    ActionPrimitive::ReadFile(path) => handle_read(path),
    ActionPrimitive::WriteFile(path, content) => handle_write(path, content),
    ActionPrimitive::DeleteFile(path) => handle_delete(path),
    // 严禁写 _ => {} 分支！
    // 只要在 ActionPrimitive 枚举中新增任何字段，此处立即报编译错误（E0004），
    // 强迫 Agent 在同一次提交中把调度逻辑闭环。
}
```

---

## 2. 机制 B：编译级死代码熔断

在核心模块（`src/lib.rs` 或 `src/main.rs`）顶部明确声明门禁属性：

```rust
#![deny(dead_code)]
#![deny(unused_imports)]
#![deny(unused_variables)]
```

### 避坑指南：
* **公共库（Library Crate）陷阱**：在 `lib.rs` 中使用 `pub fn` 或 `pub struct` 时，编译器默认认为它是对外 API，不会触发 `dead_code` 警告。
* **对策**：内部核心调度原语应放在私有模块或 internal crate 中，或者通过编写单元测试/集成测试来强制断言每个变体的覆盖。

---

## 3. 机制 C：门禁分级落地建议

1. **Fast Gate（本地 Git Pre-commit）**：
   ```bash
   # 仅检查语法与类型，耗时极短 (< 1.5s)
   cargo check --tests
   ```
2. **Heavy Gate（Pre-push 或 CI）**：
   ```bash
   # 深度静态扫描与全警告阻断
   cargo clippy --all-targets -- -D warnings
   cargo test
   ```
