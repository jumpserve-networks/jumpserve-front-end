# Central claims and testable findings

`/research-verification/new-assessment/<id>` now separates **Central Claims**
from **Testable Findings**. Neither group is checked by default. Users select
individual statements or a whole group, move items between sections, and add
retained statements from the searchable **Other extracted statements** list.
Original text, units, claim IDs, sources and locations remain unchanged. A
confirmed assessment retains the owner's category assignment and exact selected
IDs. Unselected statements remain recorded; they are not silently counted as
assessed or incorrect.

The AI prepares a small review shortlist, normally 1–3 central claims and 5–15
testable findings. These are guidance and suggestion bounds, not a completeness
claim or minimum quota. Empty groups stay empty when unsupported. Manual owner
classification can exceed those targets. Organization uses batches of up to eight
complete statements and 12 KB; prior shortlist labels are explicitly derived
summaries. No original statement is truncated. Oversized statements degrade to
explicit manual classification. This is organization for review, not substantive
paper review, reproduction, or a scientific verdict.

Earlier unconfirmed reviews expose **Organize extracted statements**. This
resumes the original intake task over its saved inventory, preserving all
numbered prompts/answers, original spending commitments, seven-day deadline,
title and research domain. Confirmed assessments cannot be reorganized. The
original public assessment `e315d471-319f-4cf3-8e1f-af87be1623cc` was inspected
read-only: its paper title is *Demystifying the Mobile Control Plane
Characteristics for Ubiquitous Connectivity*, intake had finished after 18 turns,
and no experiment jobs were queued. Its private inventory was not retrieved or
modified by this implementation.

The backend uses the existing private `research_paper_reviews` metadata and
immutable review-event snapshots. The versioned migration
`jumpserve-infra/database/202610240001_paper_review_selection.sql` adds guarded
organization and grouped confirmation. Only a valid worker lease can save AI
suggestions; the backend checks IDs and full candidate accounting. Only owners
can request reorganization or confirm. Group IDs must be unique, disjoint and
match the selected claim IDs exactly. Confirmation is atomic and idempotent;
the original confirmation implementation still admits only the selected seeds.
No anonymous relation access or browser writes are added.

Every organization turn uses the existing prompt/model persistence architecture.
Its request records `paper-review-selection-v1`, the exact controller policy and
hash, complete current-batch statements, derived prior shortlist labels, feedback,
candidate inventory hash, model identity and configured limits. Existing usage,
failed-answer retention and budget controls apply. The published base prompt is
unchanged; the new controller policy is an additive, versioned request policy.

## Local verification

```sh
# jumpserve-front-end
npm test
npm run verify:paper-uploads
./node_modules/.bin/tsc --noEmit --incremental false

# jumpserve-back-end
python3 -B -m unittest discover -s research_workflow/tests

# jumpserve-infra; isolated local PostgreSQL at 127.0.0.1:54477
python3 -B test/check_paper_selection_database.py
python3 -B test/check_paper_upload_database.py
```

The new SQL campaign processes 184 synthetic statements in 23 bounded model
fixture turns, tests reorganization, source identity preservation, private history,
duplicate confirmations and exact two-item admission from both groups. Browser
checks cover a separate 184-statement fixture with three central suggestions,
12 finding suggestions, 169 other statements, manual reassignment, three-item
confirmation, empty/legacy states and mobile/desktop light/dark layouts. These
two sets of numbers describe different explicit software fixtures. They are not
measurements or classifications of the live paper.

Successful and failed reports remain under each repository's `.test-artifacts`.
All newly added cases are exposed development regressions, authored and inspected
by the implementing AI. They are not held-out, human, or independent review.
No live model taxonomy quality or semantic prompt-injection resistance is claimed.
Those checks are a remaining release condition in
`jumpserve-infra/docs/paper-review-selection-protocol-v1.md`.

The subsequent [TCP88 diagnosis](tcp88-extraction-diagnosis-v1.md) distinguishes
an older service with no grouping result from a completed empty shortlist. Its
saved review contains 175 source-grounded candidates; absent categories were
caused by the grouping update still being local. The page now exposes the
extraction count and this distinction explicitly.

## Release order and limits

Keep this work local until an explicit release request. Before deployment, finish
the bounded actual-model review-policy evaluation, pin the final committed runtime
manifest, apply the private RPC migration, deploy the backend/worker including the
new module/policy, then the frontend. New frontend confirmations stay disabled
against a service lacking the grouping capability, avoiding unsaved categories.
No live assessment was reorganized, no production database was changed, and no
deployment was performed in this editing turn.
