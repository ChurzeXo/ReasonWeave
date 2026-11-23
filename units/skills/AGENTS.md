# units/skills — Agent Guidelines

## 核心职责
本 Unit 维护 ReasonWeave 的微观工程原子技能库与上下文零污染切片引擎。

## 维护原则（强制）
1. **体积硬约束（Skill Size Invariant · 20KB Cut）**：
   任何 `catalog/*/SKILL.md` 的正文字节数必须严格小于 `20,000 bytes`。
   若需提供长调用栈分析示例、深入的领域 checklist 或反例库，必须抽离为 `references/*.md` 子文件进行渐进式懒加载，严禁把长文塞入主 `SKILL.md`。
2. **心理阻断表硬约束（Anti-Rationalization Invariant）**：
   每个微观技能必须包含针对大模型常见偷懒借口（“这次改动很小”、“我先看看代码”、“测试肯定能过”等）的明确铁律（Iron Law）与对账表。
3. **CLI 契约对齐（CLI Contract Invariant · ADR-0013）**：
   `skills.mjs` 必须支持 `--version` / `-v` 与 `--help` / `-h` 并 Exit 0 退出，版本号严格解析自本 Unit 的 `VERSION.md`。
4. **单测沙箱隔离（Hermetic Testing Sandbox · ADR-0013）**：
   单测严禁直接在宿主环境修改 `~/.agents/skills/`；涉及文件操作必须在 `os.tmpdir()` 创建独立沙箱并在 `finally` 阶段可靠清场。
5. **纯 Node 原生与跨平台路径兼容**：
   切片脚本与 CLI 严禁引入重型第三方依赖；处理 Windows / POSIX 路径必须使用 `path.resolve` 与正斜杠标准化。
