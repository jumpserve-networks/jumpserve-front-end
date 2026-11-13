Phase one extracts Access, Experiment, Data and Validate. Only the Google-linked
assessment owner can confirm those sections. Before confirmation, descriptions
can be corrected and details excluded. Source quotes, PDF pages and the original
phase-one extraction remain unchanged. The confirmation button saves the current
reviewed version; there is no separate review checkbox.

The owner flow shows four wizard steps starting at
`/research-verification/new-assessment`: Paper Upload, Initial Assessment,
Experiment Steps, and Run Experiments. Upload remains batch-capable; each
retained paper links to its own Initial Assessment screen at
`/research-verification/new-assessment/<id>?step=breakdown`. The upload route
cannot open later stages without a selected assessment. A preparing paper stays
on step two. Confirmation advances to step three; a verified ready plan enables
step four. Run Experiments is currently a placeholder with a disabled execution
button, without queue polling or launch actions. Back navigation keeps the saved confirmation.
The `step` query parameter preserves the selected screen through refresh,
browser history and Google sign-in. Direct links cannot bypass confirmation or
plan readiness. Historical `step=queue` wizard URLs open the execution placeholder.
The Paper Upload step links back to the upload route without changing the
original paper, confirmation or implementation plan.
The shared `/research-verification/assessment/<id>` page retains its combined
view and existing public queue access.

The explicit “Confirm phase one and create experiment steps” action atomically
records the phase-one revision, reviewed snapshot, owner, timestamp, exact request,
prompt version and model reservation. Phase two groups related Experiment details
into experiments and returns ordered stages with actionable substeps, supporting
references, proposed choices and missing information. Each confirmed Experiment detail must
be covered exactly once. An empty confirmed Experiment section saves an empty
plan without a model call.

Step three uses the pinned `gpt-5.4-mini-2026-03-17` model with low reasoning
effort and medium output detail. Its prompt requires
sufficient scope for the confirmed claims, prerequisites, concrete configuration
proposals, calibration, measurement collection and Supabase persistence, analysis,
and a distinct validation action for each structured claim. It addresses every
recorded implementation choice, keeps author requirements separate from proposed
settings, and leaves missing scientific acceptance rules as decisions to resolve
before execution. Minimum comparisons cannot imply coverage of a full-grid claim.
Paper-reported and fabricated benchmarks stay separate from independent results;
planned work cannot be described as completed.
New requests use `paper_experiment_steps_v3`: experiments contain `stages`, and
each stage contains its actionable `steps`. Each action keeps its own instructions,
paper/proposed basis, source references and nullable claim-validation reference.
Stage labels organize the work; they do not claim paper support. The provider
schema constrains references to confirmed details. Client/server and SQL guards
allow up to eight stages, eight actions per stage and twenty-four actions total
per experiment. Stage/action titles are bounded to 160 characters and action
instructions to 800. Exactly one action checks each structured claim across the
whole hierarchy. Flat v1/v2 plans retain their original twelve-step/1200-character
bounds and remain readable.

The view numbers experiments, stages and actions as `1`, `1.2` and `1.2.1`.
Stages start expanded and can be collapsed with native keyboard-accessible
controls. Evidence, PDF pages and claim criteria stay with their action. This
changes local presentation without sending requests or editing the saved plan.
Older flat plans display their original actions with experiment/step numbering;
the interface does not invent stages or regenerate their original response.

New hierarchical generation requires infrastructure migration
`202611120001_hierarchical_experiment_plans.sql` before the matching frontend is
deployed. An older database rejects the new request before saving confirmation
or admitting a model call, and the interface explains the required update.
Existing confirmations, responses and plans are unchanged. Test new generation
with an unconfirmed assessment after that migration, or an isolated CLI input
snapshot; the CLI does not confirm or modify the source assessment.

The earlier flat-plan prompt candidate was exercised against an exposed synthetic
manuscript without modifying its assessment. That run produced a structurally valid
12-step plan and passed 23 of 25 frozen content checks; two exact-reference
coverage checks failed. Manual review also found technical choices that still
need more precise operational settings. These are prompt-review limitations,
not evidence that the experiment is execution-ready. Failed candidates remain
in the private evaluation history. Medium reasoning exhausted the output budget
in one candidate, so the current configuration retains low reasoning. This is
an implementation for review and testing; Step 4 remains a stub.

The hierarchical candidate was also exercised with one browser-free live call
against an exposed synthetic fixture. It returned six stages and fifteen actions,
retaining all three distinct claim references and passing the frozen structure
and source-coverage checks. This checks the new provider contract, not scientific
validity across arbitrary papers. The earlier failed evaluations remain retained.

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

Add `--expectations FILE` for bounded, exposed content regression checks. They are
frozen alongside the input, excluded from the model request, and checked on live
completion and replay. A failed check produces a failing exit status. Offline mode
validates the expectation format without evaluating generated content. For example:

```json
{
  "experiment_count": 1,
  "minimum_stages": 3,
  "minimum_steps": 6,
  "required_source_refs": ["experiment-1", "data-1", "validate-1"],
  "details": [
    {
      "name": "measurement persistence",
      "basis": "proposed",
      "mentions": [["receiver"], ["raw JSON"], ["Supabase"]]
    },
    {
      "name": "unresolved acceptance",
      "scope": "open_questions",
      "mentions": [["tolerance", "agreement rule"], ["before observing", "before inspecting"]]
    }
  ]
}
```

Each `mentions` group offers alternatives; all groups must match within the same
action or question. `scope: "plan"` checks the whole narrative, including stage
headings. Optional `basis` and `source_refs` apply to one leaf action, never just
a matching parent heading. `minimum_steps` counts leaf actions in either format;
`minimum_stages` counts explicit stages. `forbidden` checks for absent literal phrases.
These are lexical checks, not scientific judges; review the retained output to
assess coverage, attribution, validity and feasibility.

Use `--prompt FILE` to compare candidate instructions under a new run name. Reuse
the original command/name to retrieve an existing background response. Named
runs freeze inputs, requests and original provider identities in ignored,
private `.test-artifacts/experiment-plan-evaluations` files. Replay uses no model
calls. Passing checks establish structure and source coverage, not scientific or
semantic correctness.

The existing schema depends on infrastructure migrations
`202611110004_confirmed_experiment_plans.sql` and
`202611110005_reviewed_paper_evidence.sql`, followed by
`202611120001_hierarchical_experiment_plans.sql` for hierarchical generation.
Ordinary feature work does not apply production schema changes. No existing
assessment is automatically confirmed.
The isolated database regression is
`python3 -B test/check_hierarchical_experiment_plans_database.py` in
`jumpserve-infra`. It exercises the earlier review regression and then verifies
idempotent migration without rewriting records, legacy/hierarchical JS/SQL parity,
bounded nesting, source/claim coverage, original responses, owner/RLS checks,
budgets, concurrent admission, prompt privacy, history, deletion and no worker
dispatch. The earlier `check_experiment_plan_database.py` remains a fixed legacy
schema regression.
