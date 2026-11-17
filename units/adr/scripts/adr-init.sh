#!/usr/bin/env bash
# adr-init — 为新项目初始化 ADR 仓库（独立模块 ~/Documents/lab/adr 提供）
#
# 用法:
#   adr-init <target-dir> <tier:light|standard|frozen> [project-name]
#
# 例:
#   bash ~/Documents/lab/adr/scripts/adr-init.sh ./my-repo frozen "My Repo"
#
# 行为:
#   1. 建 <target-dir>/adr/ 与 <target-dir>/adr/templates/
#   2. 写 INDEX.md（带 Adopted 版本声明）
#   3. 拷所选档模板为起步 ADR-0001（标题替换为 <project> bootstrap 决策）
#   4. 拷所选档模板到 templates/adr-template.md 作参考
#
# 环境变量 ADR_HOME 可覆盖模块路径（默认 ~/Documents/lab/adr）。

set -eo pipefail

if [ "$1" = "-h" ] || [ "$1" = "--help" ] || [ "$1" = "help" ]; then
  cat <<'EOF'
adr-init — 为新项目初始化 ADR 仓库 (units/adr)

用法:
  adr-init <target-dir> [tier:light|standard|frozen] [project-name]

参数:
  target-dir    目标仓库目录（默认为当前目录 .）
  tier          规范档位: light | standard | frozen（默认 standard）
  project-name  项目名称（默认取目标目录名）

选项:
  -h, --help    显示帮助信息
EOF
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADR_HOME="${ADR_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"
TARGET="${1:-.}"
TIER="${2:-standard}"
PROJ="${3:-$(basename "$(cd "$TARGET" 2>/dev/null && pwd)")}"

case "$TIER" in
  light|standard|frozen) ;;
  *) echo "❌ 未知档位: $TIER（须 light|standard|frozen）" >&2; exit 2 ;;
esac

SRC_TPL="$ADR_HOME/templates/adr-$TIER.md"
if [ ! -f "$SRC_TPL" ]; then
  echo "❌ 找不到模板: $SRC_TPL" >&2
  exit 2
fi

# 从模板头部注释解析版本（adr-template vX.Y）
TPL_VER="$(grep -oE 'adr-template v[0-9.]+' "$SRC_TPL" | head -1 | sed 's/adr-template //')"
TPL_VER="${TPL_VER:-1.0}"

ADR_DIR="$TARGET/adr"
mkdir -p "$ADR_DIR/templates"

# 1) INDEX
cat > "$ADR_DIR/INDEX.md" <<EOF
<!-- adr-index v1.0 · source: ~/Documents/lab/adr/ -->
# ADR INDEX

> Adopted: adr-template $TPL_VER (tier: $TIER)
> 唯一索引表。只有 Accepted / 🔒 Frozen 的条目才注入 Agent 上下文（最近 3–5 条最佳）。
> 会话启动注入本表全量；具体任务只带该范围 Decision 段。

| ADR | 标题 | 状态 | 日期 | 范围/Unit | 文件 |
|-----|------|------|------|-----------|------|
| 0001 | $PROJ bootstrap 决策 | Proposed | $(date +%Y-%m-%d) | group | \`0001-$PROJ-bootstrap.md\` |
| 0002 | | | | | |
| 0003 | | | | | |

## 状态说明
- **Proposed** — 已起草，等人 review。不入 Agent 上下文。
- **Accepted / 🔒 Frozen** — 生效。Frozen 不可改，变更走 Supersedes。
- **Rejected** — 留档（含否掉理由），不入索引。
- **Superseded by NNNN** — 被新决策取代，保留历史并链接继任者。
EOF

# 2) 起步 ADR-0001
cp "$SRC_TPL" "$ADR_DIR/0001-$PROJ-bootstrap.md"

# 3) 参考模板副本
cp "$SRC_TPL" "$ADR_DIR/templates/adr-template.md"

# 标题占位替换（light/standard 用 ADR-NNNN，frozen 用 ADR-XXX）
# 用临时文件 + mv 实现 in-place，规避 toybox/BSD/GNU sed -i 差异
_TMP="$(mktemp)"
sed \
  -e "s|^# ADR-NNNN: <决策标题>|# ADR-0001: $PROJ bootstrap 决策|" \
  -e "s|^# ADR-XXX: <标题>|# ADR-0001: $PROJ bootstrap 决策|" \
  "$ADR_DIR/0001-$PROJ-bootstrap.md" > "$_TMP" \
  && mv "$_TMP" "$ADR_DIR/0001-$PROJ-bootstrap.md"

echo "✅ ADR 仓库已初始化: $ADR_DIR"
echo "   档位: $TIER | 模板版本: $TPL_VER"
echo "   下一步: 填写 $ADR_DIR/0001-$PROJ-bootstrap.md，状态转 Accepted/Frozen 后入 INDEX。"
