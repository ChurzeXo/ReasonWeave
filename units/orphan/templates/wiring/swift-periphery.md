# SwiftUI / iOS 栈反未接线（Anti-Orphan）实践指南

> **适用场景**：SwiftUI 客户端、iOS 原生应用架构。
> **痛点定位**：AI 极易生成漂亮的独立 `View` 或 `ViewModel`，但遗漏挂载到主 `NavigationStack`、`TabView` 或触发按钮上。

---

## 1. 核心工具选型：Periphery

[Periphery](https://github.com/peripheryapp/periphery) 是 Swift 生态中用于精确探测未引用代码（Unused Code / Dead Code）的工业级工具。它基于 Swift 编译器生成的真实索引图谱（IndexStore），而非粗糙的正规匹配。

### 常用命令：
```bash
# 全局快速扫描（依赖已构建好的 Index）
periphery scan --quiet
```

---

## 2. 门禁分级落地原则（极其重要）

> ⚠️ **警告**：**严禁将 `periphery scan` 挂入本地 `pre-commit`！**
> 
> Periphery 依赖 Xcode 编译生成的 IndexStore。在本地每次 `git commit` 时调用 Periphery 会消耗 15s 至 2 分钟不等，这会严重破坏开发者和 Agent 的本地心流，必然引发滥用 `--no-verify` 的反弹。

### 推荐分级架构：

1. **Fast Gate（本地 Pre-commit）**：
   * 开启 Xcode 项目编译选项：`SWIFT_TREAT_WARNINGS_AS_ERRORS = YES`。
   * 本地仅做快速 SwiftLint 语法格式与基础静态校验（耗时 < 1.5s）。

2. **Heavy Gate（Pre-push 钩子 或 GitHub Actions CI）**：
   * 在代码推送到远端或提 PR 时执行 Periphery：
   ```yaml
   # .github/workflows/periphery.yml
   name: Periphery Unused Code Scan
   on: [pull_request]
   jobs:
     scan:
       runs-on: macos-latest
       steps:
         - uses: actions/checkout@v4
         - name: Install Periphery
           run: brew install peripheryapp/periphery/periphery
         - name: Run Scan
           run: periphery scan --strict
   ```

---

## 3. SwiftUI 动态路由避坑指南

SwiftUI 采用强类型路由机制（如 `.navigationDestination(for: Route.self)`）时，由于是运行时类型分发，静态分析有时难以确认枚举变体是否全量被导航树消费。

**推荐配合穷尽枚举与状态机**：
与 Rust 类似，在 iOS 客户端中定义统一的 `AppRoute` 枚举，并在导航调度器中严禁使用 `default:` 分支，利用 Swift 编译器的穷尽检查（Exhaustive Switch）从源头上保证所有路由均有接线。
