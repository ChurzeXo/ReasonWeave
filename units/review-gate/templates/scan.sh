#!/usr/bin/env bash
# 通用 OpenGrep 基线扫描（可复现 · source: ~/Documents/lab/review-gate/）
#
# 用法:
#   bash scan.sh [out.json]
#   RULESETS="p/default p/rust p/typescript" bash scan.sh   # 按语言栈切换
#
# 首次接入项目后跑一次生成基线，之后每次"有意为之接受新发现"时覆盖它。
# 依赖: ~/.local/bin/opengrep (v1.30.2+ standalone binary)
#
# 三层噪音治理:
#   1) .semgrepignore      —— 本仓根目录的目录/文件级忽略（复制模板后按项目增删）
#   2) --exclude-rule ×N   —— 全仓前提不成立的规则（下方 EXCLUDE_RULES，按需增删/清空）
#   3) 行内 nosem（源码）  —— 已验证的个案误报，在源码对应行尾加 `# nosem` / `// nosem`
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# ===== 语言栈预设（选一个，或用环境变量 RULESETS 覆盖）=====
#   Kotlin/Android + Python : p/default p/kotlin p/java
#   Rust + TypeScript       : p/default p/rust p/typescript
#   ị 纯 Python             : p/default p/python
#   Go                      : p/default p/golang
#   ị 全栈兜底              : p/default p/kotlin p/java p/rust p/typescript p/python p/golang
RULESETS="${RULESETS:-p/default p/java}"
# 把空格分隔的规则集展开为多个 --config 参数（opengrep 不接受 "p/a p/b" 单值）
CONFIG_ARGS=()
for r in $RULESETS; do
  [ -n "$r" ] && CONFIG_ARGS+=(--config "$r")
done

# ===== 全仓前提不成立的规则（按需增删；下方是 Tappy 的示例，不必照搬）=====
# Tappy 屏蔽原因: 所有 urllib 调用皆环回本地隧道 / chmod 0o755 仅给二进制补执行位。
EXCLUDE_RULES=(
  "python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected"
  "python.lang.security.audit.insecure-transport.urllib.insecure-urlopen.insecure-urlopen"
  "python.lang.security.audit.insecure-file-permissions.insecure-file-permissions"
)

# ===== 基线输出路径（项目内约定；pre-commit 默认读同一路径）=====
OUT="${1:-review-gate/baseline/baseline.json}"

EXCLUDES=$(printf -- '--exclude-rule %s ' "${EXCLUDE_RULES[@]}")
mkdir -p "$(dirname "$OUT")"
~/.local/bin/opengrep scan "${CONFIG_ARGS[@]}" --disable-version-check --timeout 60 \
  ${EXCLUDES} --json --output "$OUT" .
echo "wrote $OUT"
