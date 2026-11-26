# SOP-04: 全局死代码清道夫与反未接线排查治理标准作业程序

**版本**：v1.0 (AEF 2.0 规范)  
**适用范围**：代码重构、新特性接入、提交前反未接线门禁核验、孤儿依赖（`check-deps`）与零调用假凭证（`scan-secrets`）排查。  
**关联宪法**：[`constitution.md`](file:///Users/churze/Documents/lab/constitution.md) T1, T7, T10

---

## 阶段一：提交前增量快速门禁（Fast Staged Gate）

> 适用场景：开发者或 Agent 在 `git commit` 前核验本次变动是否符合“垂直切片铁律”（反未接线）。

### 1. 运行暂存区接线检查
```bash
lab-orphan check-diff --staged
```
- **核心断言**：新增的函数/类/常量导出，是否在当前暂存区中存在真实的调用者闭环；
- **通过判定**：输出 `🎉 暂存区接线检查通过，零断链未接线导出`，Exit 0；
- **被拦截自愈**：
  - 若提示 `CONFIRMED_ORPHAN: export function foo()` 未被任何文件导入，必须**在同一次提交内**将该函数接入主入口（如 `index.mjs` / CLI 路由）或补齐调用者；
  - **严禁使用 `git commit --no-verify` 绕过拦截**。

---

## 阶段二：全仓深度死代码与依赖治理（Deep Scan）

> 适用场景：周期性技术债清理、重大版本发版前的大扫除、或重构交割审计。

### 1. 求解器协议自检 (Solver Preflight)
在执行全局扫描前，确保底层 S1~S3 求解器物理算法未受污染：
```bash
lab-orphan test-solver
```
- **完成判定 (DoD)**：S1（假死检出）、S2（在用保护）、S3（逐字节哈希一致）三项自检全部通过。

### 2. 全仓孤儿代码扫描 (Unused Exports Scan)
```bash
lab-orphan scan --strict
```
- **分析输出**：
  - `ALIVE`：受在用保护（入口、公共导出、框架反射）；
  - `CONFIRMED_ORPHAN`：已确认的无引用死代码。
- **清理操作**：核验后直接物理删除对应死符号或死文件，重新执行 `npm test` 确认无破坏。

### 3. 孤儿依赖排查 (Orphan Dependencies)
排查 `package.json` 或 `requirements.txt` 中声明但源码从未 `import` / `require` 的冗余三方包：
```bash
lab-orphan check-deps --strict
```
- **自愈处置**：对列出的无用依赖执行 `npm uninstall <pkg>` 或从依赖清单剔除。

### 4. 零调用高熵假凭证探测 (Fake Secrets Scan)
扫描项目中残留的测试用 Hardcoded Token、废弃密钥或无引用的高熵伪凭证：
```bash
lab-orphan scan-secrets --strict
```
- **完成判定**：确保所有生产代码与测试资产中无遗留孤儿凭证与敏感数据。
