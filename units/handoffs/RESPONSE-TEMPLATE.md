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
7. **Concise Receiver Verdict Standard (Anti-Role-Drift · v2.39.0)**:
   When submitting a receipt or verdict back to the initiator, receivers (especially auditors) MUST strictly maintain their assigned execution/audit role without role drift, and MUST NOT format their response as a multi-line outbound dispatch card (`请 [xxx] 接单...`), NOR wrap the verdict with redundant markdown headers (`可复制的...`) or code blocks. The receiver's final prompt MUST be a concise one-line plain text:
   - Rejection (NO-GO): `审计完成，裁决 NO-GO（工单已退回<发起方角色>进入 Round <N>）`
   - Pass (GO): `审计完成，裁决 GO` (or `交付完成，回执已就绪`)
   The initiator is solely responsible for calculating and carrying the next `Round` in subsequent outbound handoff cards.
8. **Tiered SDD & Exploit-First Security Proof (ADR-0012)**:
   - **Tier 1 (Lightweight · Low Blast Radius)**: Single parameter passthrough, documentation fix, localized single-branch fix. Normal unit test and fast gate pass suffices; no need for heavy proposal comparison or negative exploit tests.
   - **Tier 2 (Critical · High Blast Radius / Security / Cross-Unit)**:
     - **Vertical Slice Proof**: Must prove end-to-end integration (impl + registration + caller entrypoint + test; `lab-orphan check-diff` must show 0 orphan exports).
     - **Exploit-First Proof (先红后绿)**: For bug/vulnerability remediation, the executor MUST prove the negative test failed before the fix (`exit != 0` on unpatched codebase) and passes after the fix (`exit == 0`). "Self-reported fix" without initial exploit proof is rejected.
     - **Tool Profile Governance**: When the handoff specifies `tool_profile: readonly`, the executor is strictly forbidden from mutating production code (`evidence_paths` must only contain readonly logs/reports/reviews or sandbox files; production code changes will be hard blocked by `baton receipt`).
9. **Two-Stage Review Contract (ADR-0015)**:
   For code review and auditing tasks, evaluation MUST be decoupled into two independent dimensions:
   - **Stage 1: Spec Compliance (规格与契约符合度)**: Does the implementation strictly fulfill all explicit requirements, boundary conditions, and interfaces without unapproved deviations or reductions?
   - **Stage 2: Code Quality & Architecture (代码与架构质量)**: Is the code clean, robust, anti-orphan, properly tested, type-safe, and free from regression or dead code?
   Both stages must pass for a final `GO` verdict. Any critical finding in either stage triggers `NO-GO` / `REJECTED`.
10. **Autonomous Double-Blind Multi-Dimensional Matrix (v2.40.0)**:
   When receiving a double-blind audit ticket generated under the Autonomous Triage Protocol (`to_lane=audit`, marked `blind: true`), the auditor MUST:
   - Independently verify each active dimension (D1..D4) listed in `## 验收判据` using terminal command executions;
   - Strictly ignore author self-justifications or excuses, relying solely on verifiable facts and terminal test exits;
   - If any single dimension fails (e.g. Red-Team vulnerability found or orphan export detected), immediately reject via `baton reject <id> -n "<failure reason>" --as audit`;
   - Only issue `baton receipt <id> -n "..." --deliver --as audit --evidence-paths "..."` when all active dimensions are 100% verified.

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
- Tier 2 规约与负向验收证据（关键变更 / 架构调整 / 缺陷修复必填）：
  - 垂直切片对账：`lab-orphan check-diff --staged` 结果（0 孤儿断链）
  - 负向测试先红后绿证据（Bug/漏洞修复必填）：修复前 Exploit 测试 Exit != 0，修复后 Exit 0
- 审计三态对照矩阵（红队 / 渗透 / 安全审计必填）：
  | 用例 ID | 目标行为 | 预期判据 (Taxonomy) | 实测状态 | 物理调用数 | 结论 |
  |---|---|---|---|---|---|
  | TC-01 | 未授权调用 / 缺锁 | NO_DISPATCH | BLOCKED (事前拦截) | 0 | PASS |
  | TC-02 | 回执伪造 / 地标篡改 | NO_COMPLETE | FAILED (事后否决) | 1 | PASS |
  | TC-03 | 合规基线输入 | COMPLETE | COMPLETED (阳性对照) | 1 | PASS |

## 遗留与建议 (Notes & Follow-ups)
<Optional notes for downstream maintainers or next steps>

> 注：仓内同工作区协作在终态交付 (`baton deliver`) 或退回 (`baton reject`) 后，状态机已通过事件总线自动唤醒发起方。回执内无需包含「## 转递提示词」节，由接收方在回复人类的末尾直接输出单行纯文本裁决即可。
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
