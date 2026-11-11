Phase one extracts Access, Experiment, Data and Validate. Only the Google-linked
assessment owner can confirm those sections. Before confirmation, descriptions
can be corrected and details excluded. Source quotes, PDF pages and the original
phase-one extraction remain unchanged. Editing clears the review checkbox.

The explicit “Confirm phase one and create experiment steps” action atomically
records the phase-one revision, reviewed snapshot, owner, timestamp, exact request,
prompt version and model reservation. Phase two groups related Experiment details
into experiments and returns ordered implementation steps, supporting references,
proposed choices and missing information. Each confirmed Experiment detail must
be covered exactly once. An empty confirmed Experiment section saves an empty
plan without a model call.

Both phases use server-side Next.js calls to OpenAI. Confirmation does not create
autonomy tasks, Experiment Queue jobs or worker dispatches. Experiment execution
belongs to a later phase. The original assessment deadline and cumulative budget
apply. Concurrent confirmations admit one call. Status checks retrieve the same
provider response; uncertain submissions are never automatically repeated.

The private `research_experiment_plans` record and immutable events retain the
confirmation, prompt, response, output, usage and provider identity. Generic
planning templates are recorded in the existing prompt catalogue and appear at
`/prompts` under Paper assessment. The catalogue does not copy confirmed paper
text, quotes, private locations or account identities. Active and uncertain
planning calls block deletion until cancelled or reconciled.

Local verification:

```sh
npm test
npm run lint
npm run build
npm run eval:experiment-plan
```

The browser-free prompt evaluation command accepts a reviewed `PaperBreakdown`
JSON file with `--confirmed FILE`. The default is an explicitly synthetic fixture.
An optional live run makes at most one model call and does not write to Supabase:

```sh
npm run eval:experiment-plan -- --live --run planning-baseline --confirmed confirmed.json
npm run eval:experiment-plan -- --replay planning-baseline
```

Use `--prompt FILE` to compare candidate instructions under a new run name. Reuse
the original command/name to retrieve an existing background response. Named
runs freeze inputs, requests and original provider identities in ignored,
private `.test-artifacts/experiment-plan-evaluations` files. Replay uses no model
calls. Passing checks establish structure and source coverage, not scientific or
semantic correctness.

Release requires applying infrastructure migration
`202611110004_confirmed_experiment_plans.sql` before deploying the frontend. The
migration is prepared locally; ordinary feature work does not apply production
schema changes. Before that migration, the interface reports the missing update
and cannot confirm a paper. No existing assessment is automatically confirmed.
The isolated database regression is
`python3 test/check_experiment_plan_database.py` in `jumpserve-infra`; it covers
ownership, RLS, source preservation, budgets, concurrent admission, prompt
privacy, history, cancellation, deletion and the absence of worker dispatches.
