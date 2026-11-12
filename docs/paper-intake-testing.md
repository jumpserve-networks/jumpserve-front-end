# Browser-free paper prompt testing

Use Node 24+, `npm ci`, and the existing server-only `.env.local` configuration.
No browser session or Google token is needed for these developer commands. The
website's Google and owner checks remain in place; these commands do not create
a user session or expose another HTTP authentication path.

Preparation starts only after the database admits the exact retained request.
An `uploaded` intake has not started a model call. Owner status responses include
`paper_intake_stage` and `paper_intake_reason`; polling preserves a local failure
and its retry action when a reserved upload or an older coarse status says only
`preparing`. A recorded running or ready result can reconcile a lost response
without submitting another call. After a model compatibility update, use
**Prepare breakdown** on the retained paper or retry the original upload identity;
there is no need to create a replacement assessment. Apply the model admission
migration before running a frontend that selects the newer phase-one model.

## Fast checks and CI

```sh
npm run eval:paper
npm test
```

The default evaluation checks four hand-authored, source-grounded references:
complete methods, sparse/missing information, and embedded instructions plus a
missing-text page, plus a synthetic case that separates three hypotheses from a
derived table percentage, retains collection/setup/uncertainty requirements and
checks implementation choices against their actual supporting passages. It makes zero model/database calls. CI runs this command
without API credentials. These are exposed software fixtures, not independent
scientific evaluations or proof of general model accuracy.

## Live prompt comparisons

Configure `OPENAI_API_KEY` locally, then name each intentional trial:

```sh
npm run eval:paper -- --live --run baseline-v1
npm run eval:paper -- --live --run candidate-title-v2 \
  --prompt evals/paper-intake/prompts/title-without-byline.txt \
  --baseline baseline-v1
npm run eval:paper -- --replay candidate-title-v2
```

The CLI uses the application's pinned model, complete-input limits, structured
schema, response parser, source-quote validator and breakdown builder. A candidate
file replaces only the request instructions. Candidate files in `evals/` are
experiments; they are not automatically promoted to the application's prompt.
New runs use source-reference citations: the model selects passage IDs and the
server copies original quote text and PDF page numbers. Historical runs retain
their original schemas and raw responses. See
[`paper-source-citations-v2.md`](paper-source-citations-v2.md) for the protocol and
the rejected prompt-only comparison.

Step one is pinned to `gpt-5.4-2026-03-05` with low reasoning; phase-two planning
keeps its independent mini profile. To compare the previous pinned mini model
without changing the app, use `--model gpt-5.4-mini-2026-03-17` in a new live run.
Only these two pinned profiles are accepted, and the selected model is part of
the frozen request identity. A comparison never activates a model automatically.

The report includes per-case checks, original requests and responses, token usage,
model identity, request/input hashes, source revision, first observed terminal
time and comparisons with a baseline. Exact quotes and PDF pages are checked
separately from expected facts, source title/authors and instruction resistance.
Quotation diagnostics identify the field, cited page and any exact match on a
different page. A failing case returns exit code 1, retaining the original output.
Source-file/package-lock hashes and the Node version identify uncommitted local
validator changes as well as the Git revision. Invocation reports are versioned;
`report.json` points to the latest result, while the original request and response
identities remain unchanged.

Artifacts are under `.test-artifacts/paper-intake-evaluations/<run>/`; directories
are owner-only and files use mode `0600`. They can contain private paper text.
They are ignored by Git and contain no API credentials. A replay uses frozen
inputs and raw output and makes zero model calls; it tests the current validator,
not a newly executed model. Source changes require a new live run to qualify a
new prompt.

Reusing a run name resumes its existing response IDs or reads completed results.
Different inputs or instructions cannot reuse that name. Choose a new run name
for an intentional independent trial. An uncertain submission is never repeated
automatically. Concurrent processes cannot admit calls for the same run. A
three-minute polling limit retains a pending response for later retrieval.
`--max-calls` defaults to the current corpus size (4) and caps new requests; estimates are recorded as
reservations, while actual charges remain unknown. There are no automatic model
fallbacks or inference retries. Ctrl-C stops the CLI; persisted request identities
must be inspected/resumed rather than replaced blindly.

## Evaluate a PDF without changing an assessment

```sh
npm run eval:paper -- --live --run my-paper-01 --pdf /absolute/path/paper.pdf
npm run eval:paper -- --live --run saved-paper-01 \
  --from-assessment ASSESSMENT_UUID \
  --prompt evals/paper-intake/prompts/title-without-byline.txt
```

`--from-assessment` reads the original identity and Google-linked owner through
Supabase MCP and downloads its private PDF through Storage. It changes no
assessment records. This supports repeated prompt experiments on the same paper,
including one whose original preparation failed. PDF evaluations check structure
and source grounding; they have no expected-answer oracle for scientific quality.
`--pdf` without `--live` checks extraction and input bounds without a model call.

For a substantive review regression on one paper, add a private expectation file:

```sh
npm run eval:paper -- --live --run paper-quality-01 \
  --from-assessment ASSESSMENT_UUID --expectations private-expectations.json \
  --max-calls 1
npm run eval:paper -- --replay paper-quality-01
```

Expectations are bounded JSON data, not executable graders. They can specify
provenance, coherent experiment count, distinct claim labels/acceptance rules,
explicit attribution of reported results, and details whose narrative must match
specified alternatives and whose citations must contain selected source phrases
or PDF pages. `scripts/lib/paper-intake-quality-case.mjs` is a public synthetic
example. Store actual papers and their expectation files under ignored private
`.test-artifacts`, never in the public corpus. Expectations join the named run's
frozen input identity; changing them requires a new run. Replays cannot replace
the original expectations. Select checks for scientific substance, not one exact
wording or an arbitrary grouping of otherwise valid implementation choices.

These checks expose specified regressions; neither a passing schema nor these
lexical checks establish complete entailment, independent scientific validity or
exhaustive coverage. A paper without custom expectations retains only its
structural/source-grounding evaluation.

## Verify the persisted assessment pipeline

Configure `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) and the public
project URL. Database access uses the official, pinned Supabase MCP server, with
`SUPABASE_ACCESS_TOKEN` or the existing `codex mcp get supabase` authorization.
The MCP is explicitly scoped to the configured project and verifies its URL;
it does not inherit the wrong project from another connected MCP. Only private
Storage byte operations use the Supabase SDK, since MCP has no equivalent object
download/upload tools.

```sh
npm run verify:paper -- --assessment ASSESSMENT_UUID
npm run verify:paper -- --assessment ASSESSMENT_UUID --cancel
```

This privileged operator command advances the specified existing assessment using
the same preparation service as Next.js: verify the original bytes, extract PDF
pages, retain artifacts, admit one model call, retrieve its saved response, check
quotes, and persist its breakdown/history through the existing RPC. An eligible
legacy upload is adopted with the same owner, source identity, commitments and
deadline. Active or uncertain original calls block adoption; confirmed historical
assessments cannot be moved to this path.

Rerunning resumes the saved response or inspects a terminal record. It does not
reset a failed/uncertain assessment or discard its original model response.
Cancellation uses the original provider identity. Terminal failed/incomplete
records return a failing verification result rather than being relabeled ready.

The report checks owner/source identity, artifact hashes across JSONB roundtrips,
immutable history, retained requests/responses, preserved limits and unchanged
worker-task/dispatch/experiment-job counts. HTTP probes check production readiness
and anonymous-write denial. Google SSO and browser rendering are separate boundaries
and are not claimed as covered by this service-level check.

Private reports and MCP traces are under
`.test-artifacts/paper-intake-verification/<assessment>/`. Every actual assessment
prompt, response and state change also remains in its existing private Supabase
intake/event/artifact records. Synthetic prompt-suite results stay out of research
measurement tables.

## Findings from the first runs

The baseline passed two of three synthetic cases; it omitted a title when the
byline was absent. The title-specific candidate passed all three unchanged cases.
A more restrictive short-quote candidate regressed and failed the real paper's
case-sensitive quotes/page references; these failures are preserved in their run
reports. The real persisted assessment was correctly marked failed on unsupported
quotes, with one recorded model call and no new experiment jobs. Its outcome was
not overwritten to make the tests pass.

The workflow also exposed JSONB field-order sensitivity in the text-artifact hash.
The shared serialization now fixes property order before hashing; a regression
test and the live persisted-artifact check cover that identity. Workflow/code
changes and candidate prompts require a separate explicit production release.
