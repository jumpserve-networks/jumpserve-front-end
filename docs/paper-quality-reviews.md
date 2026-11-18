# Paper quality gates

New paper work is private until it passes a separate quality gate at Steps 2–4.
Generation remains pinned to `gpt-5.4-2026-03-05`, medium reasoning. Each stage
then receives an independent high-reasoning review against the retained original
paper, exact confirmed sections, saved plan where applicable, and generated draft.
Step 1 retains deterministic PDF upload and extraction validation.

A stage can use one medium-reasoning repair followed by one new high-reasoning
review. There are at most three additional model calls per stage (per experiment
package at Step 4). Remaining blockers, refused/incomplete responses or missing
verification evidence leave the stage needing attention. They do not expose the
draft, silently retry inference, or change confirmed scientific criteria. Review
and repair reservations count toward the original assessment limits and deadline.
High reasoning and sandbox checks add latency and cost; they reduce errors but
do not establish scientific truth or guarantee runtime correctness.

The Step 4 reviewer uses a network-disabled Linux Code Interpreter container.
The exact source-bound checker parses every Bash block and embedded Python
heredoc. Independent reviewer-authored unittest fixtures must exercise normal,
boundary, missing-data, prerequisite, failure and cleanup behavior, plus zero
delay when netem is used. External commands, privileged operations and ingestion
must be mocked. The checker bounds execution, verifies candidate files were not
changed, and records syntax and behavior results. No generated program runs on
the Next.js host and no real networking experiment is launched by this review.
These are reviewer-authored checks, not a comprehensive or formally independent
test oracle. Unsupported packages remain blocked rather than claiming a pass.

Approval requires a completed provider tool call containing the exact checker
and a matching source-bound result. Provider tool logs are requested on status
retrieval. If logs are omitted, the server downloads the checker's result file
from that same original container and retains its path, ID, content and hash.
Missing or conflicting proof fails closed. Source files expire after one day;
check evidence is retained in Postgres before anything is made ready.

## Persistence and background continuation

`202611180001_paper_quality_reviews.sql` adds private workflow, call, event and
prompt-use relations. Original extraction, plan and command rows remain unchanged.
Approved repairs are effective overlays, not rewrites. Requests, provider IDs,
raw responses, findings, checks and repaired candidates are versioned. Shared
`/prompts` entries contain generic templates; source text, findings, assessment
identities, source hashes and provider file IDs stay in private call history.

New source admissions receive a required-review marker. Historical work is not
retroactively rerun or charged. SQL confirmation and command-generation paths
enforce the same approval gate as the owner APIs. Pending/uncertain quality calls
also prevent deletion from losing reconciliation evidence. Cancellation requires
the original provider identity and a confirmed cancellation response.

The existing root notification provider discovers saved review intent. A separate
owner-authenticated `POST /research-verification/api/paper-reviews` advances at
most two saved workflows per request. GET status reads only reconcile known calls.
Database admission coalesces concurrent tabs. Uncertain submission identities are
retained without replay. Returning to the app resumes saved work; leaving an
assessment for another app page keeps continuation active. Already-admitted
provider calls run with the browser closed, while later repair/review admissions
resume when the authenticated app is open. Notifications announce completion
only after approval; no email or operating-system push is added.

## Browser-free verification

```sh
npm test
npm run lint
npm run build
npm run eval:paper-quality
```

The default evaluator uses deterministic contract fixtures and makes no provider
or database calls. A deliberate live evaluation uses a private source JSON in the
`QualitySource` shape and a frozen run name:

```sh
npm run eval:paper-quality -- --live --run NAME --from-source PRIVATE_JSON
npm run eval:paper-quality -- --replay NAME
```

Evidence remains under ignored `.test-artifacts/paper-quality-evaluations/NAME`.
Reusing an uncertain name never submits another call. The identical live command
can retrieve a saved provider ID; replay uses only retained local evidence.
Never commit these private source/response artifacts.

The infrastructure test `test/check_paper_quality_database.py` runs the additive
migration and actual RPC flows against the existing isolated native Postgres
fixture, without Docker, remote writes or provider calls. It checks all three
stages, one-repair bounds, concurrency, uncertain-call reconciliation, original
budgets, cancellation, deletion, immutable evidence and private catalogue capture.
Its `--reuse-base` option clones a fingerprinted pristine fixture for faster reruns.

Release order: qualify locally, apply the new migration after the existing shared
script/model migrations, then deploy the matching frontend. Neither production
migration application nor deployment is implied by a local implementation request.
