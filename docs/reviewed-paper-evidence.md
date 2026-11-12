Phase-one source format `paper_breakdown_sources_v5` records document provenance,
multiple retained source passages per detail, coherent experiment specifications,
paper-reported results, claim-specific criteria and unresolved implementation
choices. Existing legacy/v2/v3/v4 responses continue to resolve using their original saved
instructions and unchanged source-block identities. Every citation is checked
against its recorded PDF page; matching text alone does not establish entailment
or exhaustive coverage, so semantic review remains necessary.

The v5 model schema asks for source references separately on every experiment
field. The server copies the union into the existing citation list and preserves
the string specification shape consumed by review/planning. This prevents a
field's selected evidence from being dropped just because the experiment summary
points to a different passage. Each field selects at most six passages; the
combined experiment evidence is bounded at twelve distinct passages. No selected
passage is silently discarded to fit the bound. Historical source readers keep
their original six-reference input bound.

The revised prompt separates collection requirements, attributed paper results
and scientific hypotheses. Table arithmetic belongs under Data, not in a duplicate
claim. It retains paper-supported setup-validity/uncertainty checks and unresolved
queue hierarchy/bursts, environment, random seeds and trial-state choices. Claims
need unique labels and distinct metric/comparison identities. Results explicitly
start with "The paper reports "; synthetic descriptions cannot begin with an
unqualified assertion of empirical collection. Unresolved agreement rules keep a
null tolerance, and an approximate target without a rule cannot be paper-defined.
These narrow deterministic checks do not detect arbitrary semantic duplicates or
prove the cited passages entail a description.

An application-generated keyword navigation line points to relevant source
blocks within each annotated page. The original retained PDF/text artifacts and
source-block identities are unchanged. A narrow configuration-term check catches
MTU, offloads, pacing and socket-buffer choices that cite a neighboring paragraph
while omitting the actual passage naming that parameter. Navigation and term
matching are aids, not general semantic entailment checks. The input remains the
same private source/pages envelope used by the prompt-catalog transaction.

Step one uses `gpt-5.4-2026-03-05` with low reasoning within the same one-call Next.js flow,
with the existing output-token bound, reservation, deadline and prompt capture.
It can spend more time reasoning than the prior no-reasoning extraction. There
is no second reviewer call, worker dispatch, automatic inference retry or rewrite
of an existing assessment. Failed quality checks retain the original response
and a specific failure reason. New admissions record the exact new instructions
and schema through the existing Supabase prompt-catalog transaction. Phase-two
planning keeps its separate `gpt-5.4-mini-2026-03-17` setting. The stronger step-one
model can have higher latency and cost than the previous mini configuration;
the existing one-call reservation, input/output bounds and original limits apply.

Experiment specifications separate setup, conditions, procedure and comparisons.
A minimum comparison subset and the full sweep of the same design belong in one
specification. Paper-reported values never become independently observed results.
An approximate target without a stated numerical tolerance stays unresolved.
Phase-two inputs preserve these fields; each included claim needs a distinct,
source-linked validation step. The interface displays its frozen criterion.

Terminal intakes remain immutable. An operator document correction is a separate
private `research_paper_breakdown_reviews` version, recording reviewer type,
reason, generic review instructions, original intake hash and predecessor revision.
It records zero model API calls because the operator supplies an already reviewed
correction; separate prompt-evaluation runs are not assessment calls. Review
instructions join the existing `/prompts` catalogue without private paper text.
The original extraction, prompt/response, budget, elapsed-time deadline and source
artifacts are retained. No review confirms scope or starts experiments.

The owner sees the latest verified overlay. A changed review remounts the review
form, clearing stale edits and consent. Confirmation binds the overlay revision;
stale confirmation fails. Any existing phase-two confirmation freezes that scope
and prevents a new correction. Review writes require the service-only RPC,
verified Google-linked ownership and an active assessment. Browser roles have no
direct read or write grants on review records. Repeated saves of the same review
identity return the original version and reject conflicting content.

Release order: apply `jumpserve-infra/database/202611110005_reviewed_paper_evidence.sql`
after migrations 001–004, followed by `202611110006_phase_one_review_model.sql`,
then deploy the frontend. Migration 006 expands only the phase-one model
admission allowlist, preserving older mini admissions and original tokens,
artifacts, deadlines, budgets and prompt capture. There is no automatic model
fallback or replay of old failed calls. Check and apply an authorized private
assessment correction through Supabase MCP:

```sh
npm run review:paper -- --assessment UUID --correction PRIVATE_JSON
npm run review:paper -- --assessment UUID --correction PRIVATE_JSON --apply
```

The command verifies original ownership/source evidence and retained text, takes
a private local lock, checks the current revision, and saves through the bounded
review RPC. It never creates a user session or bypasses website authentication.
Do not commit private correction files or original papers. Keep them under ignored
`.test-artifacts`. A lost acknowledgement can reuse the same review identity;
never generate a new identity simply to replay an uncertain write.

Local checks are `npm test`, `npm run lint`, `npm run build`,
`npm run eval:paper` and `npm run eval:experiment-plan`. The isolated SQL suite is
`python3 test/check_paper_evidence_reviews_database.py` in `jumpserve-infra`.
Live prompt qualification remains browser-free and uses private named runs with
at most one original model call each; none of those runs updates an assessment.
Migrations 005 and 006 were applied through the authorized JumpServe Supabase MCP
connection and verified before this frontend release. The saved upload then
completed the browser-free assessment check with one model call, original source
hashes and deadline preserved, and no experiment jobs created. Private migration
and verification records remain under ignored `.test-artifacts`. Assessment
corrections remain separate, explicitly authorized versioned writes.

The selected v5/GPT-5.4/low profile passed the four exposed live corpus cases
(`step-one-v5-qualified-suite-20261111`) and a private reviewed-paper evaluation
with frozen, paper-specific expectations. Earlier failed prompt/model trials,
incomplete responses and revised expectation versions remain in private named
runs. This is development qualification, not a held-out scientific evaluation.
The schema, source-term guards and lexical expectations cover specified failure
modes; they do not prove arbitrary descriptions are fully supported or exhaustive.
