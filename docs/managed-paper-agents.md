# Managed repairs for paper Steps 2–4

Implemented locally on 2026-11-18. Release requires the matching database,
frontend and background schedule; this document is not a deployment record.

## Behavior

The existing generators still produce the initial paper breakdown, experiment
plan and shared setup/run scripts using the pinned GPT-5.4 snapshot at medium
reasoning. Independent high-reasoning reviews still gate every stage. When a
review requests corrections, new repair admissions use the OpenAI Agents API
with `gpt-5.4`, medium reasoning and the default service tier. The beta rejects
the dated snapshot for managed sessions; existing Responses calls retain their
original model, request and provider identity.

Each managed repair can inspect retained paper text, the current draft, confirmed
sections, the saved plan, cumulative findings and generation/storage contracts.
It can make atomic JSON-pointer edits, run the unchanged source validators, and
record a platform defect with counterevidence. Invalid edits leave the saved
candidate unchanged and return diagnostics. Shared field-limit diagnostics identify
the exact JSON-pointer field, permitted length and attempted length across all
three stages, plus quote/page mismatches, reference/coverage failures and unfinished
heredocs. The original validators remain the acceptance authority. `field_limits`
is available upfront; `read_evidence` accepts a targeted JSON-pointer `path` or,
for `paper`, a single PDF `page`. Reads cannot change evidence or access arbitrary
properties. The prompts explicitly
preserve quantifiers and all decision branches during compression.

The agent has no shell, filesystem, SQL, deployment, experiment-execution, browser
or remote-MCP tool. Its environment is `none` and subagents are disabled. Stage
tools edit only that stage's draft. Original evidence and confirmed scientific
inputs remain immutable. Recording a platform defect does not claim a code fix
or installation; no bridge to the named platform supervisor is installed here.

There are at most three repair sessions, each with at most 24 function actions,
and each followed by a new independent high-reasoning review. The controller
also validates the final saved draft. A repair session cannot approve its own
output. Step 4 continues to require the existing source-bound, network-disabled
Code Interpreter syntax and behavioral checks before display. Generated commands
never run on the Next.js host. Higher reasoning and model review do not guarantee
scientific correctness.

New recovery-policy admissions reserve the final two of the 24 actions for the
controller's stop/validation handoff: editing ends at action 22. Every patch result
reports exact diagnostics and remaining editing actions. Two identical rejected
patches advise a strategy change. Three identical failures at the same saved
candidate version stop further actions/acknowledgments. Immutable actions determine
the count and failure signature, so reads, duplicate deliveries and server restarts
cannot reset the streak. Different diagnostics or a saved improvement break it.

After confirmed stopping of the original provider turn, an improved, source-valid
saved candidate can become a checkpoint for a new independent high-reasoning review.
Its native session records the actual cancelled/completed/failed provider outcome;
the quality call records a checkpoint, not a fabricated successful provider turn.
The current repair round is consumed normally. Approval still requires the review
and Step 4 sandbox; no extra sessions, actions, rounds, deadline or budget are added.
Owner cancellation always wins. An unchanged/invalid draft or ineligible remaining
limits leaves the workflow needing attention with the real stop reason. Historical
failed/cancelled assessments are never reopened. Checkpoint handoffs appear in the
existing modal history.

Step 2 reviews now explicitly understand the normalized stored representation:
dependency positions become opaque same-section IDs, and experiment fields are
flattened strings with combined citations. Reviewers still check factual support
against the attached passages. Raw generation contracts are not misapplied as
the stored-output schema.

## Limits, identity and persistence

All original assessment deadlines remain in force; a session copies that deadline.
The live beta rejects the SDK's `spend_control` field and offers no verified
inference-count ceiling. Managed admission therefore fails closed if the current
assessment category has a finite spending/model-call cap or the assessment has
an original finite spending cap. No policy is changed to enable the runtime.
The current database was checked read-only through project-scoped Supabase MCP:
category limits were unlimited and there were no finite per-assessment caps.

The parent quality ledger retains its session-admission reservation. For managed
repairs, its `model_calls=1` field denotes one admitted session, not one underlying
inference. That distinction is recorded in the immutable policy snapshot; actual
provider inference counts remain unknown. Finite model-call policies are blocked
instead of treating a session as one inference. Usage is best-effort and can
arrive after completion; an estimate or delayed usage is not a hard dollar cap.

An immutable submit token and frozen request precede each provider submission.
Uncertain creation is reconciled only by an exact metadata match; it never
creates a replacement session. Two matches require reconciliation. Existing
Responses calls continue through their original adapter.

Supabase stores private managed session records, leased actions, immutable results,
candidate revisions, events, provider items and prompt-use links. A patch and its
tool result commit in the same transaction before acknowledgment. Duplicate
delivery returns the saved result. Leases and candidate versions reject stale
writes. A separate acknowledgment check prevents knowingly resuming inference
after a recorded stop, deadline or finite-policy change. Cancellation acceptance
is not a terminal outcome; the original provider turn must stop before the
workflow is marked cancelled.

Provider history is stored one complete immutable JSON item at a time. The parent
quality record contains a manifest pointing to those originals, avoiding an
aggregate transcript-size limit. Item hashes identify canonical JSON values,
not PDF bytes. Original PDF/text hashes retain their existing meaning. Tables
have RLS, no anonymous/authenticated grants, and RPC-only server writes. Generic
instructions and tool schemas are captured in the existing `/prompts` catalogue;
papers, findings, provider IDs, submit tokens and bound requests remain private.

The owner sees bounded factual review, repair and action history. Unapproved
breakdowns, plans and scripts remain hidden. No retired assessment-status or
Experiment Queue panels are restored.

## Background operation

`/research-verification/api/paper-webhooks` verifies the raw OpenAI signature,
retains a wake-up for a known provider identity, then schedules a bounded
continuation. Webhook payloads cannot supply an owner, prompt, model, scope or
approval. Duplicate wake-ups coalesce; current provider/database state decides
what can run.

An EventBridge schedule invokes a small Lambda once per minute. It reads only
the existing frontend credential secret and sends a signed, fixed request to
`/research-verification/api/paper-background`. It performs no model, database or
experiment work. Next.js claims at most two saved intents and processes them
independently. Durable leases preserve progress across browser closure, lost
webhooks and server restarts. Failed intents do not starve other work.

The signature is derived from the server OpenAI key, scoped to the fixed route,
timestamp and exact body, with a two-minute acceptance window. Redirects are
refused by the scheduled caller. Credentials and signed headers are never
logged. Browser credentials alone cannot invoke the internal continuation route.
No user JWT is fabricated: server work follows previously saved owner intent and
the same database Google-owner/scope checks.

`OPENAI_WEBHOOK_SECRET` is optional in local environment configuration or in the
existing `jumpserve/frontend/paper-intake` secret. Without it, the webhook route
rejects events and the periodic continuation still works. Configure OpenAI
webhooks for `response.completed`, `response.failed`, `response.incomplete`,
`response.cancelled` and the documented `agent.session` lifecycle/action events
to reduce wake-up latency. A production webhook endpoint/signing secret was not
created by this local implementation.

Terminal managed sessions are cleaned up after their evidence is retained.
Cleanup verifies the original metadata and terminal root turn, allows time for
delayed usage, then retains the real deletion receipt. An observed 404 is recorded
as a 404 rather than a fabricated deletion response. Original Supabase audit
evidence remains. Cleanup can finish after assessment deletion; it cannot start
new inference. A recent session with unknown usage is retried for up to five
minutes before deletion with explicitly unavailable usage.

## Qualification and browser-free tests

```sh
npm test
npm run lint
npm run build

# Existing access probe and actual managed-runner smoke tests.
npm run eval:agents-api -- --probe --run NAME
npm run eval:agents-api -- --live --runtime --step 2 --time-limited --run NAME
npm run eval:agents-api -- --live --runtime --step 3 --time-limited --run NAME
npm run eval:agents-api -- --live --runtime --step 4 --time-limited --run NAME

# Test a retained private workflow export without reopening the assessment.
npm run eval:agents-api -- --live --runtime --step 3 --time-limited --run NAME --from-workflow PRIVATE_JSON
```

Runtime evaluations use private file-backed state and the actual production
agent runner. They make no database writes, execute no experiments, and never
grant independent approval. They use a separate four-minute development deadline
and 24-action bound without a provider dollar cap. Reusing a name resumes its
original identity; changed workflow exports require a new name. Completed
evaluation sessions are deleted after local evidence capture. Step 2's default
fixture requires the retained private SNC-003 forensic export; Steps 3/4 use
seeded contract fixtures. Exported workflows must contain the original generation
request, source, candidate, failed review and valid review context.

Live smoke results retained under ignored
`.test-artifacts/managed-paper-runtime-evaluations/`:

| Case | Result |
| --- | --- |
| Retained SNC-003 Step 2 | Recorded the normalization defect and made source-valid draft corrections. |
| Refined Step 2 instructions/diagnostics | 125.1 seconds; explicit support/contradiction/inconclusive quantifiers within the existing limit. |
| Seeded Step 3 fabricated-data misuse | 40.7 seconds; restored independent-measurement instructions. |
| Seeded Step 4 Bash syntax error | 34.9 seconds; repaired the missing `fi`. No command execution. |
| Recovery-contract Step 3 (2026-11-19) | 70.9 seconds; 15 actions, targeted item/page reads and one source-valid repair; returned to independent review. |

These sessions completed and returned to `review_pending`, not to approval.
These are integration checks, not a corpus benchmark. Manual inspection of the
first Step 2 trial found ambiguous compressed wording despite a passing separate
high-reasoning review; the revised contract and field diagnostics produced an
explicit rule in the next trial. This is evidence that review remains fallible,
not that every future semantic error will be caught.

In `jumpserve-infra`, the local native-Postgres qualifier extends the existing
review-gate fixtures and tests all three managed stages, source preservation,
concurrent admission/actions, durable result replay, stale versions, finite
policies, native identity/adapter isolation, immutable provider items, cancellation,
cleanup receipts, RLS and background leases:

```sh
python3 -B test/check_managed_paper_agents_database.py --reuse-base --with-context --with-recovery
npm test -- --runInBand test/frontend-paper-intake-stack.test.ts
python3 -B -m unittest discover -s test -p frontend_paper_continuation_test.py -v
npm run build
```

The PostgreSQL fixture is isolated on port 54477 and uses no Docker, remote writes
or model calls. Local endpoint tests use the real SDK's signature verifier and
synthetic secrets. Production webhook delivery, EventBridge invocation and the
complete authenticated production round trip still require release verification.
The recovery qualification additionally replays the 405-character description and
879-character quote failure without private paper text in committed tests, and
checks source-bound checkpoints across all three stages, original round/deadline
preservation, owner-cancel precedence, duplicate final-action delivery, refusal of
action 23, policy changes during stopping and migration-first compatibility. A
private offline replay of assessment `5335bd98…` confirmed that the new diagnostics
identify its actual rejected fields; it made no model calls or database changes.

## Release order

1. Apply `202611180004_managed_paper_agents.sql`, then
   `202611180005_paper_background_continuation.sql`, followed by
   `202611190001_paper_agent_recovery.sql`, after the existing review migrations.
   These are additive and qualified for repeat application. Recovery policy is
   frozen only for new admissions explicitly requesting version 1; old frontend
   admissions and existing provider requests keep their original policy.
2. Deploy the matching Next.js frontend. A capability check prevents admission
   against an older database; existing provider calls retain their original adapter.
3. Deploy the updated `JumpServeFrontendPaperIntakeStack` schedule and verify the
   signed continuation path with a new assessment. Enable signed OpenAI webhooks
   when their endpoint secret is configured.
4. Verify owner isolation, complete review/action history, browser-closed
   continuation, cancellation, final approval, `/prompts` capture and cleanup.

No migrations, AWS resources, webhooks, merges or frontend releases were applied
to production during implementation. Existing terminal assessments were not reopened.
