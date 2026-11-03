# Codegraph 可用性排查提示词（跨仓复用）

> 用途：当某仓的 AI Agent 频繁"全仓 grep 找概念定义"而非用语义索引时，用本提示词让该仓的 Agent 自查并修复 codegraph 的三处断点。
> 背景事实：codegraph 二进制在本机是**全局用户级安装**（`~/.local/bin/codegraph` → `~/.workbuddy` 之外 `~/.codegraph/versions/...`）；**索引按仓独立**，位于各仓根的 `.codegraph/`。所以"工具"全局共享，"索引"必须每仓各建。已抽样：iggle / prospero 已建索引，MCP-Service 未建。

---

## 可复制提示词（贴给目标仓的 Agent）

```
排查本仓 codegraph 是否真的可用（避免 Agent 退化为全仓 grep）

背景：codegraph 是本机全局安装的用户级工具（二进制 ~/.local/bin/codegraph，
索引按仓独立、位于各仓根 .codegraph/）。它提供语义检索——CLI 的
codegraph explore/query/context，以及 MCP 工具 codegraph_explore/codegraph_node——
能替代全仓 grep 去理解"某概念/符号是什么意思"，大幅省 token。但装了≠能用，
典型有三处断点导致 Agent 架空它、退化成 grep。请在本仓按顺序排查并修复：

1. 索引是否存在（每仓独立）：在仓根跑 `codegraph status`。无索引→
   `codegraph init -y <仓根>` 建索引（约几十秒），再 status 确认节点数>0。
   已知 iggle/prospero 已建过，可跳过此步。

2. MCP 是否接进当前 Agent：查当前 Agent 的 MCP 配置里有无 codegraph server。
   `codegraph install --help` 列出的目标不含部分 Agent（如 WorkBuddy），需手动加：
   在对应 mcp.json 写入
   {"mcpServers":{"codegraph":{"type":"stdio",
   "command":"<codegraph 绝对路径>","args":["serve","--mcp"]}}}
   （绝对路径用 `which codegraph` 解析，勿用裸命令以免 PATH 不继承）。
   写完后需在 Agent 连接器页 Trust 才生效。

3. 仓库文档是否指死路：搜 AGENTS.md/README.md/CLAUDE.md 里的
   codegraph_index.artifact.md 或 file:///.../codegraph_index 这类 file:// 路径
   ——那通常是 IDE 缓存产物、已被清，属失效指针。改为指向正确用法：
   CLI（codegraph explore "<概念>" 取符号+调用链+源码；query "<符号>"；
   context "<任务>"）和/或 MCP 工具。

4. 验证：挑一个本仓真实概念跑 `codegraph explore "<概念>"`，确认返回相关
   符号+源码（非空）。确认后记入仓记忆：后续理解代码默认走 codegraph 而非 grep。

5. 收尾：把 .codegraph/ 加进本仓 .gitignore（本地可再建索引，不入库）。

完成后回报：步骤①②③④每步状态 + 最终 codegraph status 节点数。
```

---

## 单行复制版

> 排查本仓 codegraph 可用性：① `codegraph status` 无索引则 `codegraph init -y <仓根>`；② 查 Agent 的 mcp.json 有无 codegraph server（无则手动加绝对路径 `serve --mcp` 并在连接器页 Trust）；③ 修 AGENTS/README/CLAUDE 里失效的 `codegraph_index.artifact.md` file:// 指针；④ `codegraph explore "<概念>"` 验证非空；⑤ `.gitignore` 加 `.codegraph/`。完成后回报各步状态 + status 节点数。
