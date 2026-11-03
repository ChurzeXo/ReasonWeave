#!/usr/bin/env bash
# preflight 收尾回报形状检查（source: ~/Documents/lab/preflight/）
#
# 断言报告的三个锚节存在（## 变动分类 / ## 不变量触点 / ## 遗留与路由），exit 0/1。
# 只查"形状存在性"（可机检的那部分）；三节内容对不对是语义判断，交独立上下文。
#
# 用法:
#   bash check.sh <report.md>          # 检查文件
#   cat report.md | bash check.sh -    # 从 stdin
set -uo pipefail

src="${1:--}"
tmp=""
if [ "$src" = "-" ]; then
  tmp=$(mktemp)
  cat > "$tmp"
  src="$tmp"
fi

if [ ! -f "$src" ]; then
  echo "✗ 报告不存在: $src"
  [ -n "$tmp" ] && rm -f "$tmp"
  exit 1
fi

fail=0
for sec in "## 变动分类" "## 不变量触点" "## 遗留与路由"; do
  if grep -qF -- "$sec" "$src"; then
    echo "✓ $sec"
  else
    echo "✗ 缺锚节: $sec"
    fail=1
  fi
done

[ -n "$tmp" ] && rm -f "$tmp"

if [ "$fail" -eq 0 ]; then
  echo "wrap-up 形状 ✅ PASS"
else
  echo "wrap-up 形状 ❌ FAIL"
fi
exit "$fail"
