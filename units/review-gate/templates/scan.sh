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
OUT=""
POSITIONAL_ARGS=()
NO_SUPPRESS="${NO_SUPPRESS:-0}"

for arg in "$@"; do
  case "$arg" in
    --no-suppress)
      NO_SUPPRESS=1
      ;;
    *)
      POSITIONAL_ARGS+=("$arg")
      ;;
  esac
done

OUT="${POSITIONAL_ARGS[0]:-review-gate/baseline/baseline.json}"
if [ -d "$OUT" ] || [ "$OUT" = "." ]; then
  OUT="${OUT%/}/review-gate-report.json"
fi

# ===== 穿透扫描选项（ADR-0011 / ADR-0012：忽略行内 # nosem 免检）=====
NO_SUPPRESS_ARGS=()
if [ "$NO_SUPPRESS" = "1" ]; then
  echo "🔍 [review-gate] 启用 Anti-Suppression 穿透模式：忽略源码行内 # nosem 免检注释"
  NO_SUPPRESS_ARGS=(--disable-nosem)
fi

EXCLUDES=$(printf -- '--exclude-rule %s ' ${EXCLUDE_RULES[@]+"${EXCLUDE_RULES[@]}"})
mkdir -p "$(dirname "$OUT")"

# ===== 工具可用性探测与降级矩阵（ADR-0011 / ADR-0012 诚实降级）=====
if [ -n "${OPENGREP_BIN:-}" ]; then
  OG="$OPENGREP_BIN"
else
  OG="${HOME}/.local/bin/opengrep"
  if ! [ -x "$OG" ]; then
    OG=$(command -v opengrep || true)
  fi
fi

if [ -n "$OG" ] && ([ -x "$OG" ] || command -v "$OG" >/dev/null 2>&1); then
  "$OG" scan ${CONFIG_ARGS[@]+"${CONFIG_ARGS[@]}"} ${NO_SUPPRESS_ARGS[@]+"${NO_SUPPRESS_ARGS[@]}"} --disable-version-check --timeout 60 \
    ${EXCLUDES} --json --output "$OUT" .
  if command -v node >/dev/null 2>&1; then
    node -e '
      const fs = require("fs");
      try {
        const file = process.argv[1];
        if (fs.existsSync(file)) {
          const raw = JSON.parse(fs.readFileSync(file, "utf8"));
          raw.engine = "opengrep";
          raw.fallback = false;
          fs.writeFileSync(file, JSON.stringify(raw, null, 2));
        }
      } catch (e) {}
    ' "$OUT"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c '
import sys, json, os
try:
  file = sys.argv[1]
  if os.path.exists(file):
    with open(file, "r") as f: data = json.load(f)
    data["engine"] = "opengrep"
    data["fallback"] = False
    with open(file, "w") as f: json.dump(data, f, indent=2)
except: pass
' "$OUT"
  fi
  echo "wrote $OUT (engine: opengrep)"
else
  echo "⚠️  OpenGrep 未安装 — 触发轻量级降级矩阵 (ADR-0011 §2.2)"
  RUFF=$(command -v ruff || true)
  if [ -n "$RUFF" ]; then
    echo "ℹ️  [Fallback 阶梯 · 诚实声明] 降级至 Ruff Bandit (S 规则集) 本地扫描"
    RUFF_RAW=$("$RUFF" check --select S --output-format json . 2>/dev/null || true)
    if command -v node >/dev/null 2>&1; then
      node -e '
        const fs = require("fs");
        let findings = [];
        try { findings = JSON.parse(process.argv[1] || "[]"); } catch (e) {}
        const payload = {
          engine: "fallback-ruff-bandit",
          fallback: true,
          version: "ruff-bandit",
          results: findings.map(f => ({
            check_id: f.code,
            path: f.filename,
            start: { line: f.location?.row, col: f.location?.column },
            end: { line: f.end_location?.row, col: f.end_location?.column },
            extra: { message: f.message, severity: "WARNING" }
          }))
        };
        fs.writeFileSync(process.argv[2], JSON.stringify(payload, null, 2));
      ' "$RUFF_RAW" "$OUT"
    elif command -v python3 >/dev/null 2>&1; then
      python3 -c '
import sys, json
findings = []
try:
  raw = json.loads(sys.argv[1]) if sys.argv[1] else []
  if isinstance(raw, list):
    for f in raw:
      if isinstance(f, dict):
        loc = f.get("location") or {}
        end_loc = f.get("end_location") or {}
        findings.append({
          "check_id": f.get("code"),
          "path": f.get("filename"),
          "start": { "line": loc.get("row"), "col": loc.get("column") },
          "end": { "line": end_loc.get("row"), "col": end_loc.get("column") },
          "extra": { "message": f.get("message", ""), "severity": "WARNING" }
        })
except Exception as e:
  sys.stderr.write(f"Ruff JSON parse warning: {e}\n")
payload = {
  "engine": "fallback-ruff-bandit",
  "fallback": True,
  "version": "ruff-bandit",
  "results": findings
}
with open(sys.argv[2], "w") as f:
  json.dump(payload, f, indent=2)
' "$RUFF_RAW" "$OUT"
    else
      echo "$RUFF_RAW" > "$OUT"
    fi
    echo "wrote $OUT (engine: fallback-ruff-bandit)"
  else
    echo "❌ 既无 opengrep 也无 ruff，无法完成扫描。"
    exit 1
  fi
fi
