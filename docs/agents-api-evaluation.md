# OpenAI Agents API evaluation

Evaluated 2026-11-18 against the installed OpenAI SDK 7.55.0 and the live API.

## Decision

Proceed with a controlled Step 2 pilot. One live trial reproduced the useful
investigation-and-repair behavior we want: the agent inspected source evidence
and application code, corrected two draft defects, identified an incorrect review
contract, and re-ran the existing application validator. This supports evaluating
the harness further; it does not establish a general quality or latency advantage.

Production adoption still needs verified spending enforcement, a decision about
model alias reproducibility, durable server-side function handling, and an
independent scientific review gate. No application runtime, assessment record,
database schema, deployed service, or existing production model setting was changed.

## What was tested

The fixed case is the retained SNC-003 synthetic paper, *One-Sided Delay and Ping
Round-Trip Time*. The trial started with the last failed Step 2 candidate and its
prior review, not a fresh upload. It received tools to read the paper, raw draft,
stored draft, generation contract and actual normalization implementation; patch
bounded descriptive text; run the unchanged source validator; and record a
platform diagnosis. It had no SQL, shell, deployment, credential or experiment tools.

| Check | Observed result |
| --- | --- |
| Existing project credentials | Session listing and session creation worked. |
| Existing SDK | Already contains `beta.agents`; no dependency upgrade needed. |
| Current pinned model | `gpt-5.4-2026-03-05` rejected as unsupported by Managed Agents. |
| Model alias | `gpt-5.4` accepted with medium reasoning and completed the trial. |
| SDK spending control | Live endpoint rejected `spend_control` as an unknown parameter. |
| Separate-process continuation | Created the session, exited, then resumed that same session in another CLI invocation. |
| Completed repair | Two draft changes, one platform diagnosis, 14 application function calls. |
| Validation | Source/shape/citation checks passed after edits. |
| Elapsed time | 124.56 seconds from local creation intent to retained completion. |
| Usage | Initially null; available on a later read after completion. |
| Cleanup | Terminal evaluation session deleted after retaining its complete bounded item history locally. |

There was one successful inference session. Earlier compatibility submissions
were rejected before a session was returned. A function-call count is not a count
of underlying model requests.

### Assessment of the changes

The agent changed the topology description from two "temporary" namespaces to two
"isolated" namespaces. The general method specifies isolation; temporary namespaces
belong to the companion runner. The replacement matches the attached method evidence.

It replaced the truncated C1 tolerance with a complete 194-character rule. The
inclusive support interval `[35,45]` ms, strict contradiction branches below 35 or
above 45, and otherwise-inconclusive branch agree with the paper. The existing
validity requirements remain elsewhere in Validate. Metric, target, comparison,
acceptance classification, citations, dependencies, provenance and reported values
were preserved. The replacement retains the non-significance-test qualifier but
does not repeat the paper's explicit non-confidence-interval qualifier; the source
citation still includes it. A broader completeness gate should inspect such details.

The platform diagnosis was also correct: raw generation uses numeric dependency
positions and `{text, source_refs}` experiment fields. The application converts
dependencies to stored IDs and flattens experiment fields while retaining their
combined citations. Reviewing the saved representation against the raw generation
schema produced false blocking findings. The pilot recorded this defect; it did
not repair application code or bypass the production quality gate.

The agent made four extra draft reads while working out the serialized tool-result
shape. Tool descriptions and return contracts need refinement before a broader
benchmark. This was not an independent high-reasoning review of every paper item,
and the structural validator does not establish scientific correctness.

### Usage and estimated cost

The later provider read reported 220,576 input tokens, including 186,368 cached
tokens, and 4,531 output tokens, including 3,026 reasoning tokens. At published
standard GPT-5.4 short-context rates, the model-token estimate is approximately
**$0.20**:

```text
(34,208 × $2.50 + 186,368 × $0.25 + 4,531 × $15.00) / 1,000,000
= $0.200077
```

This is a rate-based estimate, not an invoice. The configured service tier was
`auto`. No hosted sandbox or paid built-in tool was used. See
[OpenAI pricing](https://developers.openai.com/api/docs/pricing).

The successful trial explicitly omitted the rejected spending field. It used a
three-minute application deadline and a 16-function-call guard, not a hard dollar
cap. Those guards require the CLI to be running; they are not provider-enforced
limits. They must not replace JumpServe's original assessment budget in production.

## Fit with JumpServe

The [managed harness](https://developers.openai.com/api/docs/guides/agents-api/overview)
handles the model/tool loop and session context. Step 2 can initially use
`environment.type = none`: paper reads, draft patches and validators can be
application functions. A sandbox becomes useful for bounded code-based checks or
qualified platform investigation. Hosted sandbox execution, package installation
and experiment execution were not tested here.

The harness still needs our
[function handler](https://developers.openai.com/api/docs/guides/agents-api/tools/functions).
For browser-independent continuation, add a signed
[webhook endpoint](https://developers.openai.com/api/docs/guides/agents-api/sessions/webhooks)
and durable server processing. Read current `required_actions`, claim each action
transactionally, save its result, and return it using the original session/turn/call
identity. Duplicate delivery must return the retained result. An uncertain side
effect requires reconciliation, not replay. This can retain Next.js as the API/UI
without putting paper analysis on an experiment-execution worker.

Supabase should remain the authoritative repository for immutable paper evidence,
owner/scope binding, workflow limits, prompt/configuration versions, tool requests
and results, candidate patches, review findings and final approval. Provider state
is an additional execution record, not a replacement for those records. New
versioned session/action records will be needed; the current fixed seven-call
quality workflow should continue reconciling historical Responses API calls.

Tools must enforce the owner and frozen scope from server records, independently
of model-supplied identifiers. They must not expose a service key or accept
arbitrary SQL. Keep original paper evidence and scientific criteria immutable;
send platform defects to a qualified maintenance workflow. No installed bridge
to the named platform supervisor was established by this evaluation.

Use a separate high-reasoning review after the agent repairs a draft, plus the
deterministic validators. Provider action review is not the scientific approval
gate. Stream factual tool/check/repair events into the existing private history
and notify the owner after approval. Do not expose partial drafts or restore the
removed assessment/queue panels.

The [data-controls table](https://developers.openai.com/api/docs/guides/your-data)
lists Agents API application state as retained until deletion and not eligible
for Zero Data Retention. Define a provider-session deletion policy alongside
assessment deletion, while preserving the required private Supabase audit record.

## Qualification before production

1. Resolve enforceable spending controls. The installed SDK contract disagrees
   with the live endpoint; elapsed time and delayed usage are insufficient for
   an exact dollar cap.
2. Verify supported snapshot pinning or explicitly accept an alias with recorded
   configuration and regression evaluations. The current model page maps the
   alias to the existing snapshot, but that does not pin future requests.
3. Exercise signed/duplicate/out-of-order webhook delivery, handler restart,
   cancellation completion, deletion, uncertain submission and stale approvals.
4. Compare fresh breakdowns and seeded repair cases across the synthetic corpus,
   with an independent semantic review and whole-run cost/latency reporting.
   Include citation coverage, provenance, incomplete rules, dependency contracts,
   corrupted evidence and instructions embedded in papers.
5. Pilot new Step 2 workflows only. Keep existing workflows on their saved
   provider identities, then evaluate Steps 3 and 4 separately.

The model alias is documented on the
[GPT-5.4 model page](https://developers.openai.com/api/docs/models/gpt-5.4).
Continuation and outcome handling are described in
[sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions) and
[events/items](https://developers.openai.com/api/docs/guides/agents-api/sessions/events).
The snapshot and spending-field rejections above are live observations, not
claims that the documentation guarantees those restrictions permanently.

## Browser-free evaluation workflow

```sh
# Read-only access check; does not invoke a model.
npm run eval:agents-api -- --probe --run access-NAME

# Fixed SNC-003 case, using the explicitly time-limited compatibility mode.
npm run eval:agents-api -- --live --run NAME --time-limited --model gpt-5.4 --start-only
npm run eval:agents-api -- --live --run NAME --time-limited --model gpt-5.4

# Re-grade retained evidence without network, credentials or model calls.
npm run eval:agents-api -- --replay --run NAME

# Delete only this verified terminal evaluation session after evidence retention.
npm run eval:agents-api -- --cleanup --run NAME

node --import ./tests/support/tsx-loader.mjs --test tests/agents-api-evaluation.test.mjs
```

Live evaluation currently requires the existing private SNC-003 forensic export
at the fixed path in `scripts/lib/agents-api-paper-pilot.mjs`; it is not a general
PDF uploader or production runner. A broader corpus adapter is future work.
Private inputs, requests, provider identities, tool results and response items
stay under ignored `.test-artifacts/agents-api-evaluations/` with private file
permissions. The completed trial is `snc003-medium-alias-20261118`. Its provider
session is deleted; offline replay still works.

The CLI freezes each run's inputs and model, saves mutations and function results
before acknowledgment, and refuses to recreate uncertain/rejected submissions.
The five offline tests cover bounded text edits, preserved evidence, rejected
unknown execution/frozen-field edits, atomic rejection of invalid changes,
platform-issue recording and safe CLI modes. They do not simulate durable
production orchestration or measure the agent's scientific review quality.
