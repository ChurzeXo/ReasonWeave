# Handoff Receipt Specification (RESPONSE-TEMPLATE.md)

> This document is the **Single Source of Truth** for writing execution receipts in the Agent Baton protocol.
> Any agent receiving a baton handoff MUST follow this template strictly.

---

## 1. Golden Rules of Receipt Writing

1. **No Code = No Pass (Evidence-First)**:
   Receipts MUST include verifiable proofs in frontmatter:
   - `evidence_paths`: Comma-separated list of modified files (must exist on disk).
   - `evidence_commits`: The Git commit SHA containing the changes (must be verified via `git cat-file -e`).
   - If no code changes were required (e.g. documentation or audit pass), you MUST provide `evidence_note: "<Detailed explanation>"`.
2. **Anti-Self-Closing Guarantee**:
   The receipt MUST be written by the receiving party (`to_lane`), NOT the author (`from_lane`).
   If the task targets `to_lane: audit`, the receipt command MUST include the cryptographic challenge token:
   `baton receipt <id> --audit-nonce "<nonce>"`.
3. **Anti-Orphan & Wiring Proof**:
   Any new primitives, tools, schemas, routes, or UI components MUST be wired into their respective caller trees or registries. Unit tests alone are insufficient for closure without wiring verification evidence.
4. **Red-Team Three-State Verdict Standard**:
   For security audit, penetration, and adversarial tasks (`to_lane: audit`), test probes MUST strictly use the three-state verdict taxonomy (never lump all adversarial cases into generic BLOCK):
   - `NO_DISPATCH` (Pre-dispatch Hard Intercept): Parameter out-of-bounds, missing lock, unauthorized call. Physical execution count is strictly 0 (`calls == 0`, `status.startsWith("BLOCKED")`).
   - `NO_COMPLETE` (Post-execution Truth Veto): Physical probe/dispatch is allowed, but the verification engine MUST veto settlement and reject issuing completion tokens (MUST NOT output `COMPLETED`; expected `status=FAILED / REJECTED`).
   - `COMPLETE` (Positive Control Baseline): Compliant baseline input MUST achieve 100% `COMPLETED` (serves as positive control against over-defensive false positives).
5. **Hard Verdict Anchor (Mandatory)**:
   The `## 结论 (Verdict)` section is a strict hard anchor. The receipt MUST contain a clearly stated verdict line (`- **结论**：...` or `<Accepted / Rejected / Verified / NO-GO>`), otherwise `baton receipt` and `baton deliver` will fail closed (Exit 1). Omitting the verdict section to bypass checks is strictly forbidden.
6. **Copy the Skeleton Verbatim**:
   Do not invent custom markdown structures. Missing required anchors or sections will cause `baton check` and `baton receipt` to fail closed.
7. **Concise Receiver Verdict Standard (v2.35.2)**:
   When submitting a receipt or verdict back to the initiator, receivers (especially auditors) MUST NOT format their response as a multi-line outbound dispatch card (`请 [xxx] 接单...`). The receiver's final prompt MUST be a concise one-line verdict:
   - Rejection (NO-GO): `审计完成，裁决 NO-GO（工单已退回实现方进入 Round <N>）`
   - Pass (GO): `审计完成，裁决 GO` (or `交付完成，回执已就绪`)
   The initiator is solely responsible for calculating and carrying the next `Round` in subsequent outbound handoff cards.

---

## 2. Receipt Template (Copy Directly)

```markdown
---
handoff_id: <ID>
mode: intra-repo
from_lane: <receiving-lane>
to_lane: <author-lane>
needs_change: false
evidence_paths: "path/to/file1.ts,path/to/file2.ts"
evidence_commits: "<git-commit-sha>"
date: YYYY-MM-DD
---

# Receipt: <ID>

## 结论 (Verdict)
<Accepted / Rejected / Verified> — One concise sentence summarizing the outcome.

## 修复状态 (Status & Implementation)
- What was done: <1-3 bullet points outlining actual modifications>
- Impact boundary: <list of touched modules or components>

## 验收证据 (Evidence & Verification)
- Commits: `<git-commit-sha>`
- Modified Paths: `path/to/file1.ts`, `path/to/file2.ts`
- Verification Commands Executed:
  \`\`\`bash
  <exact command used to verify, e.g. npm test or pnpm check>
  \`\`\`
- Result Output: <All tests passed, 0 failures, 0 regressions>
- 审计三态对照矩阵（红队 / 渗透 / 安全审计必填）：
  | 用例 ID | 目标行为 | 预期判据 (Taxonomy) | 实测状态 | 物理调用数 | 结论 |
  |---|---|---|---|---|---|
  | TC-01 | 未授权调用 / 缺锁 | NO_DISPATCH | BLOCKED (事前拦截) | 0 | PASS |
  | TC-02 | 回执伪造 / 地标篡改 | NO_COMPLETE | FAILED (事后否决) | 1 | PASS |
  | TC-03 | 合规基线输入 | COMPLETE | COMPLETED (阳性对照) | 1 | PASS |

## 遗留与建议 (Notes & Follow-ups)
<Optional notes for downstream maintainers or next steps>

## 转递提示词 (Baton Pass Prompt)
> 复制下方提示词转告发起方（同对话多工单精准路由对齐）：
```text
请【<author-lane-role>】查收【<receiving-lane-role>】回执 [<ID>]：receipts/<ID>-resp.md（<Verdict> · 需发起方改动：<是/否>）
```
```

---

## 3. How to Submit the Receipt

Use the official CLI command to submit and advance the state machine from `forwarded` to `received`:

```bash
baton receipt <ID> \
  --evidence-paths "src/index.ts,tests/index.test.ts" \
  --evidence-commits "<sha>" \
  --audit-nonce "<nonce-if-audit-lane>" \
  -n "## 结论\nVerified and all invariant tests pass."
```

---

## 4. Rejection, Rework & Resubmission Lifecycle (v2.25)

When verification fails, the author/auditor (`from_lane`) issues a rejection:

1. **Rejection by Author**:
   `baton reject <ID> -n "<Specific failure reasons and missing criteria>"`
   - State flips back: `received/delivered → forwarded`.
   - Rejection record is appended to the receipt under `## 驳回记录`.
   - Content fingerprint is recorded to seal against empty resubmissions.
2. **Executor Rework**:
   - The executor MUST address the feedback and update code and tests.
   - Resubmit receipt: `baton receipt <ID> -n "<Updated body with revised Verdict>" --evidence-paths "..." --evidence-commits "..."`.
   - The engine automatically backs up previous receipts (`.bak.md`) and preserves `## 驳回记录`.
3. **Resubmission (baton deliver)**:
   - Run `baton deliver <ID>`.
   - The engine checks for content delta (`rejected_receipt_hash`) and ensures Verdict is NOT `REJECTED`. Empty resubmissions are rejected.
4. **Final Acceptance (baton accept)**:
   - Initiator verifies independently and runs `baton accept <ID> -n "<Acceptance evidence>"`.
   - The engine verifies Verdict, resolved rejections, and authority before moving to `closed`.
5. **Reopening Accidental Closures (baton reopen)**:
   - If an item was closed erroneously, the author can recover it:
     `baton reopen <ID> -n "<Reason for reopening>"`
   - State flips back: `closed → forwarded`, clearing stale acceptance timestamps.
