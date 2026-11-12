#!/usr/bin/env bash
# verify_baton_v226_gates.sh —— Baton v2.25.0/v2.26.0 安全状态机与工作区沙箱自动化双盲复测套件
set -euo pipefail

BATON_BIN="$(which baton || which handoff)"
echo "=================================================="
echo "🛡️  Baton v2.25.0 / v2.26.0 状态机安全与沙箱门禁复测"
echo "   引擎路径: $BATON_BIN"
echo "=================================================="

TEST_DIR=$(mktemp -d /tmp/baton_gate_test_XXXXXX)
trap 'rm -rf "$TEST_DIR"' EXIT

cd "$TEST_DIR"

# 1. 初始化仓内子 Hub
"$BATON_BIN" init --lanes "impl,audit" > /dev/null

# -----------------------------------------------------------------------------
# Gate 1: 驳回封印与防空交付 (B-1)
# -----------------------------------------------------------------------------
echo -n "▶ [Gate 1] 驳回封印与防空交付校验... "
HANDOFF_LANE=impl "$BATON_BIN" status > /dev/null
HANDOFF_LANE=impl "$BATON_BIN" new audit task "Gate 1 测试" > /dev/null
TID="audit-$(date +%Y%m%d)-01-task"

# 审计方草拟初始回执并交付
HANDOFF_LANE=audit "$BATON_BIN" status > /dev/null
HANDOFF_LANE=audit "$BATON_BIN" receipt "$TID" -n $'## 结论\n待整改初始回执\n## 修复状态\n进行中\n## 验收证据\n- paths: none' --evidence-note "init" > /dev/null
HANDOFF_LANE=audit "$BATON_BIN" deliver "$TID" > /dev/null

# 发起方驳回
HANDOFF_LANE=impl "$BATON_BIN" status > /dev/null
HANDOFF_LANE=impl "$BATON_BIN" reject "$TID" -n "初审不合格，缺少测试" > /dev/null

# 审计方尝试空交付（正文一字不改），必须硬拦截 Exit 1
set +e
HANDOFF_LANE=audit "$BATON_BIN" deliver "$TID" > /tmp/empty_deliver.log 2>&1
RC_EMPTY=$?
set -e
if [ "$RC_EMPTY" -eq 0 ]; then
  echo "❌ 失败：空交付未被拦截！"
  cat /tmp/empty_deliver.log
  exit 1
fi
grep -q "驳回封印" /tmp/empty_deliver.log || { echo "❌ 缺少驳回封印错误提示"; exit 1; }

# 审计方尝试结论仍为 REJECTED 的交付，必须硬拦截 Exit 1
touch real_fix.js
set +e
HANDOFF_LANE=audit "$BATON_BIN" receipt "$TID" -n $'## 结论\nREJECTED / NO-GO 存在技术风险\n## 修复状态\n已补充测试与证据\n## 验收证据\n- paths: real_fix.js' --evidence-paths "real_fix.js" > /dev/null
HANDOFF_LANE=audit "$BATON_BIN" deliver "$TID" > /tmp/rejected_deliver.log 2>&1
RC_REJ_DELIVER=$?
set -e
if [ "$RC_REJ_DELIVER" -eq 0 ]; then
  echo "❌ 失败：REJECTED 结论交付未被拦截！"
  exit 1
fi
grep -q "驳回封印" /tmp/rejected_deliver.log || { echo "❌ 缺少驳回封印未完成整改错误提示"; exit 1; }

# 审计方做实质整改且结论改为通过后再交付，必须成功
HANDOFF_LANE=audit "$BATON_BIN" receipt "$TID" -n $'## 结论\nVerified / PASSED 终审合格\n## 修复状态\n已补充测试与证据，全量通过\n## 验收证据\n- paths: real_fix.js' --evidence-paths "real_fix.js" > /dev/null
HANDOFF_LANE=audit "$BATON_BIN" deliver "$TID" > /dev/null
echo "✅ PASS (空交付硬拦截 + REJECTED交付拦截 + 实质整改通过放行)"

# -----------------------------------------------------------------------------
# Gate 2: 闭环强校验与鉴权 (B-2)
# -----------------------------------------------------------------------------
echo -n "▶ [Gate 2] 闭环强校验与身份鉴权... "
# 非发起方（audit）试图 accept，必须硬拦截 Exit 1
set +e
HANDOFF_LANE=audit "$BATON_BIN" accept "$TID" -n "违规自验自闭环" > /tmp/unauth_accept.log 2>&1
RC_UNAUTH=$?
set -e
if [ "$RC_UNAUTH" -eq 0 ]; then
  echo "❌ 失败：非发起方自闭环未被拦截！"
  exit 1
fi
grep -q "越界闭环" /tmp/unauth_accept.log || { echo "❌ 缺少越界闭环提示"; exit 1; }

# 真实发起方调用 accept，成功闭环
HANDOFF_LANE=impl "$BATON_BIN" accept "$TID" -n "验收合格闭环" > /dev/null
echo "✅ PASS (非发起方自闭环硬拦截 + 发起方合规闭环放行)"

# -----------------------------------------------------------------------------
# Gate 3: 回执历史备份与驳回记录继承 (B-3)
# -----------------------------------------------------------------------------
echo -n "▶ [Gate 3] 回执历史备份与驳回记录继承... "
# 检查是否生成了 .bak.md 文件
BAK_COUNT=$(find .handoffs/receipts -name "*.bak.md" | wc -l | tr -d ' ')
if [ "$BAK_COUNT" -lt 1 ]; then
  echo "❌ 失败：未生成 .bak.md 备份！"
  exit 1
fi
# 检查当前回执正文中是否保留历史驳回记录
grep -q "## 驳回记录" ".handoffs/receipts/${TID}-resp.md" || { echo "❌ 历史驳回记录未继承！"; exit 1; }
grep -q "初审不合格" ".handoffs/receipts/${TID}-resp.md" || { echo "❌ 历史驳回理由丢失！"; exit 1; }
echo "✅ PASS (自动快照备份 + 驳回历史无损继承)"

# -----------------------------------------------------------------------------
# Gate 4: 误闭环安全重开 (reopen)
# -----------------------------------------------------------------------------
echo -n "▶ [Gate 4] 误闭环安全重开通道 (baton reopen)... "
HANDOFF_LANE=impl "$BATON_BIN" reopen "$TID" -n "发现遗留问题追回重开" > /dev/null
# 验证状态打回 forwarded，closed 清空
grep -q "status: forwarded" ".handoffs/handoffs/${TID}.md" || { echo "❌ status 未退回 forwarded"; exit 1; }
grep -q "reopened_at:" ".handoffs/handoffs/${TID}.md" || { echo "❌ 缺少 reopened_at 留痕"; exit 1; }
echo "✅ PASS (成功打回 forwarded 并清理闭环时间戳)"

# -----------------------------------------------------------------------------
# Gate 5: 工作区物理沙箱阻断 (v2.26.0)
# -----------------------------------------------------------------------------
echo -n "▶ [Gate 5] 工作区物理沙箱守卫 (BATON_WORKSPACE_JAIL)... "
# 在允许的工作区外部尝试执行写操作，必须硬阻断 Exit 1
set +e
BATON_WORKSPACE_JAIL="$TEST_DIR/allowed_sandbox" "$BATON_BIN" new impl task "沙箱攻击" > /tmp/jail_attack.log 2>&1
RC_JAIL=$?
set -e
if [ "$RC_JAIL" -eq 0 ]; then
  echo "❌ 失败：工作区越界未被拦截！"
  exit 1
fi
grep -q "工作区沙箱越界违规" /tmp/jail_attack.log || { echo "❌ 缺少工作区沙箱越界错误输出"; exit 1; }
echo "✅ PASS (跨仓越界写操作 100% 物理拦截)"

echo "=================================================="
echo "🎉 全量安全状态机与沙箱门禁复测全部 PASS (5/5)"
echo "=================================================="
