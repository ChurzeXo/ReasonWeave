#!/usr/bin/env bash
# 通用 repo 不变量探针（source: ~/Documents/lab/preflight/）
#
# 单一命令报出「当前不变量态」，退出码 0（全绿）/ 1（有失败）。
# 类比 review-gate 的 scan.sh：review-gate 管「代码新发现」，本探针管「仓库不变量」。
#
# 用法:
#   bash preflight.sh                                  # 跑全部检查
#   PREFLIGHT_CONF=./preflight.conf bash preflight.sh  # 指定配置
#   DOC_BUDGETS="AGENTS.md:100" bash preflight.sh      # env 临时覆盖（优先于 conf）
#
# 每仓校准：复制本文件到项目 scripts/（或根），改顶部默认值，或提供 preflight.conf 覆盖
# （默认读仓根 preflight.conf；用 PREFLIGHT_CONF 指定其它路径）。
# 覆盖层级：env > preflight.conf > 内置默认（env 显式设置即压过 conf，并留痕不静默）。
# 可覆盖变量：RUNTIME_PATHS / DOC_BUDGETS / BACKLOG_DIR / BACKLOG_HEAD / BACKLOG_TYPE / RECONCILE_PAIRS / RECONCILE_CMD
set -uo pipefail

# 先归位仓库根：conf 解析与相对路径检查都以仓根为准（从子目录调用也能命中仓根 conf）
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
cd "$REPO_ROOT" || exit 1

fail=0
note(){ printf '  · %s\n' "$*"; }
ok(){   printf '  ✓ %s\n' "$*"; }
bad(){  printf '  ✗ %s\n' "$*"; fail=1; }

# ---- 配置层级：env > preflight.conf > 内置默认 ----
# 顺序：快照 env → 内置默认 → source conf（覆盖默认）→ env 回压（覆盖 conf 并留痕）。
# 旧版把 conf 排在默认值之后 source，env 必被无条件吞掉且无告警（假绿陷阱：
# DOC_BUDGETS="AGENTS.md:100" bash preflight.sh 会照常 PASS）。本顺序保证 env 显式
# 设置永远生效，且与 conf 冲突时可见。
env_RUNTIME_PATHS="${RUNTIME_PATHS:-}"
env_DOC_BUDGETS="${DOC_BUDGETS:-}"
env_BACKLOG_DIR="${BACKLOG_DIR:-}"
env_BACKLOG_HEAD="${BACKLOG_HEAD:-}"
env_BACKLOG_TYPE="${BACKLOG_TYPE:-}"
env_RECONCILE_PAIRS="${RECONCILE_PAIRS:-}"
env_RECONCILE_CMD="${RECONCILE_CMD:-}"

RUNTIME_PATHS="${RUNTIME_PATHS:-.codegraph/}"   # 空格分隔：应被 .gitignore 覆盖、且不得被跟踪的运行产物
DOC_BUDGETS="${DOC_BUDGETS:-AGENTS.md:150}"     # 空格分隔：file:maxLines
BACKLOG_DIR="${BACKLOG_DIR:-docs/backlogs}"     # backlog 目录
BACKLOG_HEAD="${BACKLOG_HEAD:-^## B-}"          # backlog 条目标题格式（grep -E）
BACKLOG_TYPE="${BACKLOG_TYPE:-类型}"             # backlog 条目必须含的类型标记（grep -F）
RECONCILE_PAIRS="${RECONCILE_PAIRS:-}"           # 空格分隔：source:target 镜像对（断言派生副本与单一事实源无漂移）
RECONCILE_CMD="${RECONCILE_CMD:-}"               # 自定义对账命令（如 makemigrations --check 或 node check-seeds.js）

CONF="${PREFLIGHT_CONF:-$REPO_ROOT/preflight.conf}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"

# env 回压：显式设置过的变量压过 conf 值；与 conf/默认不同则留痕（不静默 no-op）
for _v in RUNTIME_PATHS DOC_BUDGETS BACKLOG_DIR BACKLOG_HEAD BACKLOG_TYPE RECONCILE_PAIRS RECONCILE_CMD; do
  _env="env_${_v}"
  [ -n "${!_env}" ] || continue
  [ "${!_env}" != "${!_v}" ] && note "$_v: env 显式设置，压过 conf/默认（值: ${!_env}）"
  printf -v "$_v" '%s' "${!_env}"
done
unset _v _env

echo "preflight @ $REPO_ROOT"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "⚠️  不在 git 工作树内：A1/A4 依赖 git，结果可能不准。"
fi

# A1 运行产物：既被忽略、又未被跟踪（防止产物泄进版本库 / 规则腐化）
echo "[A1] 运行产物忽略状态"
for p in $RUNTIME_PATHS; do
  ignored=no; tracked=no; src_inner=no
  d="${p%/}"
  # 忽略断言两级：
  # 1) --no-index：check-ignore 默认考虑索引，已跟踪路径恒返回「未忽略」（git 语义：跟踪
  #    优先于忽略）——「被跟踪」真违规会连带假报「未被 .gitignore 覆盖」，把修法引向补规则
  #    （错，正确修法是 git rm --cached）。--no-index 让忽略断言只看规则，与跟踪态解耦。
  # 2) -v 来源核对：匹配规则不得来自产物目录自带的 .gitignore。实测：仓根规则被注掉后，
  #    产物目录内的 * 会悄悄顶上（-v 源变为 .codegraph/.gitignore、exit 0），A1 仍假绿；
  #    根规则在时 -v 报仓根——两态可精确区分，且不影响「根规则 + 产物自带 .gitignore」
  #    双保险的合法形态（那种形态 -v 仍报仓根）。
  src=$(git check-ignore -v --no-index -- "$p" 2>/dev/null | sed -n '1s/:.*//p')
  case "$src" in
    '') : ;;
    "$d"/*) src_inner=yes ;;
    *) ignored=yes ;;
  esac
  git ls-files -- "$p" 2>/dev/null | grep -q . && tracked=yes
  if [ "$ignored" = yes ]; then
    ok "$p 已忽略"
  elif [ "$src_inner" = yes ]; then
    bad "$p 的忽略规则来自产物目录内部（${src}）——仓根规则可能已缺失，请补到仓根 .gitignore"
  else
    bad "$p 未被 .gitignore 覆盖"
  fi
  if [ "$tracked" = no ];  then ok "$p 未被跟踪"; else bad "$p 或其下有文件被跟踪"; fi
done

# A2 文档行数预算（常驻 AGENTS.md 等不得膨胀）
echo "[A2] 文档行数预算"
for spec in $DOC_BUDGETS; do
  case "$spec" in
    *:*) ;;
    *) bad "DOC_BUDGETS 格式应为 file:maxLines，得到: '$spec'"; continue;;
  esac
  f="${spec%%:*}"; max="${spec##*:}"
  case "$max" in
    ''|*[!0-9]*) bad "DOC_BUDGETS 预算非数字: '$spec'"; continue;;
  esac
  if [ ! -f "$f" ]; then note "$f 不存在，跳过"; continue; fi
  n=$(wc -l < "$f" | tr -d ' ')
  if [ "$n" -le "$max" ]; then ok "$f = $n 行 (≤ $max)"; else bad "$f = $n 行 (> $max)"; fi
done

# A3 backlog 条目格式
echo "[A3] backlog 条目格式"
if [ -d "$BACKLOG_DIR" ]; then
  found=no
  for f in "$BACKLOG_DIR"/[0-9]*.md; do
    [ -f "$f" ] || continue
    found=yes
    if grep -qE "$BACKLOG_HEAD" "$f" && grep -qF "$BACKLOG_TYPE" "$f"; then
      ok "$(basename "$f")"
    else
      bad "格式缺（${BACKLOG_HEAD} / ${BACKLOG_TYPE}）: $f"
    fi
  done
  [ "$found" = yes ] || note "$BACKLOG_DIR 无 [0-9]*.md，跳过"
else
  note "$BACKLOG_DIR 不存在，跳过"
fi

# A4 工作树状态（非阻断，供人工分类与路由）
echo "[A4] 工作树状态（非阻断）"
if git status --porcelain 2>/dev/null | grep -q .; then
  git status --porcelain 2>/dev/null | sed 's/^/  · /'
else
  note "clean"
fi

# A5 事实源对账与派生状态防漂移
echo "[A5] 单一事实源对账与派生状态防漂移"
a5_checked=no

# 1) 文件/目录镜像对账 (RECONCILE_PAIRS: 空格分隔 source:target)
if [ -n "$RECONCILE_PAIRS" ]; then
  for pair in $RECONCILE_PAIRS; do
    a5_checked=yes
    case "$pair" in
      *:*) ;;
      *) bad "RECONCILE_PAIRS 格式应为 source:target，得到: '$pair'"; continue;;
    esac
    src="${pair%%:*}"
    dest="${pair##*:}"
    if [ ! -e "${src}" ]; then
      bad "单一事实源不存在: ${src}"
    elif [ ! -e "${dest}" ]; then
      bad "物化副本目标不存在: ${dest}"
    elif [ -d "${src}" ] && [ -d "${dest}" ]; then
      if diff -r -q "${src}" "${dest}" >/dev/null 2>&1; then
        ok "${src} ↔ ${dest} (目录一致)"
      else
        bad "单一事实源与物化副本漂移: ${src} != ${dest} (目录内容不一致)"
      fi
    else
      if cmp -s "${src}" "${dest}" 2>/dev/null; then
        ok "${src} ↔ ${dest} (内容一致)"
      else
        bad "单一事实源与物化副本漂移: ${src} != ${dest}，请从源重新派生物化"
      fi
    fi
  done
fi

# 2) 自定义对账命令 (RECONCILE_CMD: 退出码 0 为通过)
if [ -n "$RECONCILE_CMD" ]; then
  a5_checked=yes
  if cmd_out=$(eval "$RECONCILE_CMD" 2>&1); then
    ok "对账命令通过: $RECONCILE_CMD"
  else
    bad "对账命令失败: $RECONCILE_CMD
$cmd_out"
  fi
fi

if [ "$a5_checked" = no ]; then
  note "RECONCILE_PAIRS / RECONCILE_CMD 未配置，跳过（可选对账项）"
fi

echo
if [ "$fail" -eq 0 ]; then echo "preflight ✅ PASS"; else echo "preflight ❌ FAIL"; fi
exit "$fail"
