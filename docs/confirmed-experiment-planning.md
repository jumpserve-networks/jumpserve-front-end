## Reviewed duplicate validation links

Measurement and calibration actions may cite a claim in `source_refs`; only the
one final evaluation uses its `validation_ref`. The prompt and schema distinguish
these roles. A duplicate assignment is rejected with the claim identity, without
repeating inference or changing the original response.

An operator can review a completed, failed V3 response whose only invalid fields
are duplicate validation assignments. Explicitly retain the dedicated evaluator
using one-based experiment.stage.step positions:

```sh
npm run review:experiment-plan-links -- --assessment UUID \
  --keep validate-3=1.5.3 --reason 'Retain the final H3 evaluation; the earlier RTT action only collects measurements.'
```

The default is a dry run. Repeat the identical command with `--apply` after the
matching migration and frontend deployment. Supabase MCP appends an immutable
private review and audit record. Only other occurrences of the selected duplicate
assignment become null. The actions, wording, source references, original failed
row and event history, raw response, confirmed sections, prompt, provider identity,
counts and limits remain unchanged. Both TypeScript and Postgres must accept the
complete reviewed plan under every existing source, claim, layout and size check.
No model or experiment call occurs.

The owner API overlays the reviewed plan as ready and includes `link_review`
metadata. Progress reflects that exact original revision. This cannot repair
missing actions, invented references, incomplete/refused responses, or altered
scientific instructions. Ready, cancelled, deleted, stale and differently owned
calls cannot be reviewed. Repeated apply uses the frozen review identity.
Private traces remain in `.test-artifacts/experiment-plan-link-reviews/`.

Release order: qualify `test/check_experiment_plan_link_reviews_database.py`,
apply `202611150001_experiment_plan_link_reviews.sql`, deploy the frontend, then
apply the reviewed selection. Original terminal records and their immutability
guards are never relaxed. This is an operator annotation review, not scientific
validation or an automatic choice of which action should decide a claim.

## Confirmation and planning

Phase one extracts Access, Experiment, Data and Validate. Only the Google-linked
assessment owner can confirm those sections. Before confirmation, descriptions
can be corrected and details excluded. Source quotes, PDF pages and the original
phase-one extraction remain unchanged. The confirmation button saves the current
reviewed version; there is no separate review checkbox.

Each detail initially displays text with its inclusion checkbox on the left.
Edit opens one description editor at a time. Save applies the edited description
to the current review; Cancel discards that draft. Excluding and reincluding a
detail retains its saved description. Continuing to step three persists the
reviewed sections in the existing confirmation record and creates the plan;
per-detail Save does not start planning. Confirmation and wizard navigation are
disabled until the active editor is saved or cancelled. Original quotes,
citations, criteria and confirmed sections remain read-only.

The owner flow shows four wizard steps starting at
`/research-verification/new-assessment`: Paper Upload, Initial Assessment,
Experiment Steps, and Run Experiments. Upload remains batch-capable. Each
screen places the wizard navigation before its heading and paper metadata.
Public readers retain the paper metadata without private wizard controls. Each
retained paper links to its own Initial Assessment screen at
`/research-verification/assessment/<id>?step=breakdown`. The upload route
cannot open later stages without a selected assessment. A preparing paper stays
on step two. Confirmation advances to step three; a verified ready plan enables
step four. Run Experiments is currently a placeholder with a disabled execution
button and no launch actions. Back navigation keeps the saved confirmation.
The `step` query parameter preserves the selected screen through refresh,
browser history and Google sign-in. Direct links cannot bypass confirmation or
plan readiness. Historical `step=queue` wizard URLs open the execution placeholder.
The Paper Upload step links back to the upload route without changing the
original paper, confirmation or implementation plan.
Step two shows the four section descriptions and source evidence.
Implementation choices are retained for planning and omitted from this screen.
The experiment summary and its Setup, Procedure, Conditions and Comparisons
remain in the retained planning input. Step three displays the generated
implementation stages and actions without repeating that standalone specification,
including while planning is pending. Generated actions keep their supporting
evidence, validation criteria and unresolved decisions.
The step-two breakdown is a numbered outline: Access, Experiment, Data and
Validate are the top-level sections (1–4), with their recorded details nested as
1.1, 1.2, 2.1 and so on. Sections start expanded and can be collapsed; source
quotes and validation criteria remain beneath their own detail. This is a view
of the retained extraction, without generating extra content or changing saved
identities. Inclusion checkboxes and description editing work within the outline.
New v6 extractions retain section-local `depends_on` identities. The first
prerequisite determines the parent; additional prerequisites appear as numbered
references. Nested numbering follows the tree, while evidence and edit identities
stay unchanged. Selecting a dependent also selects all prerequisites; excluding
any prerequisite excludes all direct and indirect dependents. A prerequisite
cannot be excluded while a descendant is being edited. Confirmation rejects
orphaned dependencies, and step-three input remaps them to its current source refs.
Legacy records without dependency metadata remain flat within their sections;
viewing them does not infer relationships or invoke a model.

Before releasing dependency-enabled extraction, apply infrastructure migration
`202611140001_paper_detail_dependencies.sql`. It guards intake, reviewed and
confirmed graphs, allows dependency fields in versioned reviews, and updates the
exact SQL planning projection to match JavaScript. It changes no historical
records, credentials, owner rules or public grants. The matching local regression
is `test/check_paper_dependencies_database.py` in `jumpserve-infra`.
The canonical `/research-verification/assessment/<id>` page shows the
owner wizard and public paper metadata. Status, records and queue sections have
been removed from that page. The retired
`/research-verification/new-assessment/<id>` URL permanently redirects there.

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
allow up to eight stages and eight actions per stage: sixty-four actions total
per experiment. This matches the provider schema without forcing independently
implementable work into combined actions. Stage/action titles are bounded to 160 characters and action
instructions to 800 for historical v3 compatibility. Current provider requests
cap instructions at 400 characters and ask for one independently implementable
operation plus its completion artifact/check, usually in one or two sentences.
A complete network reproduction can need more than twenty-four focused actions;
sparse scopes can use fewer. Configuration, connectivity checks, rate/RTT
calibration, trial scheduling, collection, raw uploads and normalized ingestion
should be separate actions when they have separate completion checks. This
refinement changes future generation without rewriting confirmed saved plans.
Exactly one action checks each structured claim across the
whole hierarchy. Flat v1/v2 plans retain their original twelve-step/1200-character
bounds and remain readable.

Apply `202611160002_granular_experiment_plan_capacity.sql` before deploying this
capacity change. It updates the SQL validators without rewriting saved plans,
calls, responses, prompt uses or confirmation records. Spending, call-count,
output-token and original deadline limits stay unchanged. Qualify it with
`test/check_granular_experiment_plan_capacity_database.py` in `jumpserve-infra`;
the regression includes a 30-action failed response, immutable duplicate-link
review, and command admission against the exact reviewed plan revision.
Existing failed calls remain failed until their retained output is explicitly
reviewed through the operator workflow above. Merely raising the layout limit
does not accept duplicated final claim assignments or retry inference.

The view numbers experiments, stages and actions as `1`, `1.2` and `1.2.1`.
Instructions, claim criteria, source details, PDF quotes and unresolved decisions
remain with the item they support. More granular generated work receives its own
action number, rather than being packed into a single long instruction.
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

The finer-action prompt was exercised through the browser-free evaluator on an
exposed synthetic case. The final low-reasoning run produced one experiment,
five stages and 23 actions, passing the hierarchy, action-count, instruction-length
and source-reference checks. Its broader frozen content rubric still flagged
full-grid wording, uncertainty wording, provenance separation and burst units;
these results remain recorded for further review. This is evidence of a more
granular plan, not a complete scientific-quality pass. The retained run is
`granular-actions-20261114-v3` under `.test-artifacts/experiment-plan-evaluations`.

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
  "minimum_stages": 5,
  "minimum_steps": 16,
  "max_instruction_characters": 400,
  "required_source_refs": ["experiment-1", "data-1", "validate-1"],
  "details": [
    {
      "name": "receiver measurement collection",
      "mentions": [["receiver"], ["raw JSON", "raw logs"]]
    },
    {
      "name": "measurement persistence",
      "basis": "proposed",
      "mentions": [["Supabase"], ["trial"], ["configuration"]]
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
Automatic Ubuntu/Debian command generation in Step 3 is documented
in [Step 3 terminal commands](paper-terminal-commands.md), including its separate
database migration and browser-free evaluation workflow.
The isolated database regression is
`python3 -B test/check_hierarchical_experiment_plans_database.py` in
`jumpserve-infra`. It exercises the earlier review regression and then verifies
idempotent migration without rewriting records, legacy/hierarchical JS/SQL parity,
bounded nesting, source/claim coverage, original responses, owner/RLS checks,
budgets, concurrent admission, prompt privacy, history, deletion and no worker
dispatch. The earlier `check_experiment_plan_database.py` remains a fixed legacy
schema regression.
