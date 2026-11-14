---
id: 11
title: orphan 增量门禁索引缓存（消除每次提交全仓重读的固定 IO 开销）
type: keep
priority: medium
status: open
owner: 待拍板
dep_on: none
handoff_ref: 'impl-20261114-02-feature'
created: 2026-11-14
updated: 2026-11-14
---

- 要做什么：给 `units/orphan` 的 `check-diff` 加倒排索引缓存（键 = `git write-tree` 树哈希 + 受跟踪文件 mtime 签名），命中即复用，避免每次提交重读全仓。
- 当时为什么没做：本仓 207 个受跟踪文件合计仅 1.5MB，但该卷 `readFileSync` 实测 8–35ms/文件；拆解 `buildCurrentIndex` 得 `ls-files` 46ms + stat/read 1425ms + 索引 99ms —— 瓶颈在平台 IO 而非算法，且改动会触及刚经 `audit-20261114-02` 闭环的核心引擎。
- 重开会话条件：Fast Gate `real` 中位 > 2.5s，或出现 `--no-verify` 绕过迹象；由 orphan owner 拍板，引入缓存须同步补 fail-closed 失效判据（缓存损坏/树哈希不匹配必须回落全量）。
