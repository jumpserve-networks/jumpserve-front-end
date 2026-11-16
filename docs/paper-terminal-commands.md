# Step 3 terminal commands

Step 3 shows the saved numbered experiment outline immediately. Each action has
its own **Generate Terminal Commands** button. Only clicking that button admits
an asynchronous server-side OpenAI request for that action; opening, refreshing,
expanding stages or navigating the wizard never generates commands. Other actions
remain usable while one is processing. The step displays its own progress,
cancellation, result, inputs and copy controls. Saved results load on demand.

One bounded status read per experiment restores summaries without downloading
command bodies or prompts. Pending actions poll their original saved response;
failed or uncertain submissions can be checked without replaying inference.
Duplicate clicks and concurrent callers reuse the same action admission. Each
request retains its exact confirmed sections, complete experiment context,
selected action, prompt, provider response, commands and immutable event history.
The output contains exactly one numbered action, plus non-executable setup
metadata, action-specific cleanup and required environment-input descriptions.
Whole-experiment context never authorizes generating the other steps.

Commands are optional aids within Step 3. They do not delay showing the outline
or gate navigation to the Step 4 execution placeholder. Public outlines have no
generation controls. No generated command is executed by this feature.

Commands target a **Ubuntu/Debian Linux research host with Bash**. Each numbered
action supplies its own complete commands/scripts, dependency checks and local
functions. There is no shared setup script or helper program. A block can use
configuration, resource ownership or measurements produced by an earlier action;
these data dependencies are listed and checked without running earlier scripts.
Each action has copy controls, a sudo indication and completion check, or an
explicit manual/blocking explanation. Cleanup includes its own code too.
The copied blocks use one private workspace for consistent data paths. Environment inputs
are entered in that host's terminal; their values never pass through the browser,
model or database. Commands are generated text, not an execution or validation
result. Step 4 remains a stub and this feature does not start workers or hosts.

The command profile uses pinned `gpt-5.4-2026-03-05`, medium reasoning and a
16,000-token reasoning/output bound for each selected action. Each action has a 200-cent reservation that must fit within the
original assessment limits, including earlier whole-experiment and individual calls; generation never enlarges those limits. All code
required by an action must be included in that action's block; shared helper
launchers and setup dependencies are rejected. Network changes must be namespace-scoped; obvious bare
host `tc` mutations are rejected. Names and files derive from the assessment and
experiment identity. The copied Bash wrapper checks Linux and preserves quoted
heredocs. This is not a sandbox or a proof that generated code is correct: host
capabilities and the generated instructions still require review before use.

Unspecified scientific acceptance criteria stay unresolved. Their dedicated
claim actions are forced to blocked/null commands by the provider schema and by
both TypeScript and Postgres validation; a user cannot define a post-hoc rule
through the generated final evaluation. The manual flow has
no selected owner measurement-upload contract, so upload/ingestion actions are
explicitly blocked while raw and normalized local files are retained. No API,
database relation, uploaded result or credential is invented to conceal that
integration gap. Installing ordinary packages and writing instrumentation are
generation work, not questions for the user. Reported/fabricated paper values
remain separate from independently collected data.

## Persistence and authorization

Apply the existing terminal-command migrations, then
`jumpserve-infra/database/202611160003_individual_step_commands.sql`, before
deploying this frontend. It adds private `research_step_commands`,
`research_step_command_events` and `research_step_command_prompt_uses` records.
Their identity includes assessment, experiment and exact action reference.
Earlier whole-experiment requests and command packages remain unchanged.
New whole-experiment admissions are disabled; their existing calls can still be
reconciled, completed or cancelled with the original identity. An earlier pending
or uncertain experiment-wide call blocks overlapping individual admissions.

The current individual layout is `action-v1`, in a separate workspace and
namespace prefix from older `per-step-v1` and `shared-setup-v1` recipes. It does
not overwrite their artifacts. Every generated action supplies its own complete
program and checks actual prerequisite data/resources at runtime. The shared
`step-manifest-v1` data contract describes output paths, roles, media types,
column types/units and owned resources. Consumers inspect and validate actual
manifests; they never import another step's code or assume prior execution.
Cleanup covers only resources created by the selected step and preserves data.

All three tables have RLS and no anonymous/authenticated SQL access or direct
service-role writes. The owner-only API accepts a numbered step and operation,
never caller prompts, scripts or requester identity. The SQL RPC independently
selects the saved original/reviewed plan, validates the exact input and single-key
output schema, locks admission, applies original budgets/deadlines, and admits
one call per action. Atomic reservations include intake, planning, previous
whole-experiment packages and every individual call. Frozen scientific acceptance
criteria and source evidence remain unchanged. Viewing statuses never starts work.

Duplicate generations reuse the same call. Unknown submissions are never replayed.
Polling retrieves the saved response; cancellation reconciles that identity.
Completed outputs are immutable and bound to the original response JSON. Pending
or uncertain generations block assessment deletion until cancelled/reconciled;
deleting a completed assessment preserves its private command history.
Generic templates/configuration are versioned in the existing prompt catalogue,
without including private paper content. Prompt uses and original provider
responses remain linked to the command record.

## Browser-free checks

```sh
npm run eval:terminal-commands -- --step 1.2.3
npm run eval:terminal-commands -- --live --run candidate-01 --assessment UUID --step 1.2.3
npm run eval:terminal-commands -- --live --run candidate-02 --from-plan FILE --experiment 1 --step 1.2.3
npm run eval:terminal-commands -- --replay candidate-01
```

An optional `--prompt FILE` freezes a candidate prompt with a new live run.
Each named run makes at most one model call; rerunning retrieves its response.
Assessment reads use the project-scoped Supabase MCP. Evaluations write no
database records and execute no generated commands. Private requests, original
responses and reports stay under `.test-artifacts/terminal-command-evaluations`.
The CLI checks full step coverage, ordered prerequisite identities, structured
output bounds, Bash syntax using `bash -n`, and recognized Python heredocs using
`ast.parse`, including embedded Python helper strings. It also checks known
local helper calls for unsupported keyword arguments and known invalid
conditional numeric formatting. It never imports or runs
the generated Python. These checks do not
establish runtime correctness or scientific validity. Keep failed evaluations and manual
reviews rather than treating syntactic success as successful reproduction.

The initial mini-model trial for the current retained paper passed syntax checks
but was rejected on review for inconsistent variables, unscoped traffic-control
commands, trial conditions recorded without actual application, and cleanup that
deleted metadata. A primary-model medium-reasoning trial exhausted its original
20,000-token bound and was retained as incomplete. The strengthened low-reasoning
profile and namespace guard addressed some observed failures. Further review
rejected obsolete package requirements, post-hoc acceptance inputs, missing sudo
handling, unsafe repeat behavior and a one-shot receiver consumed by its own
readiness probe. The current instructions require a persistent receiver, passive
listener checks, PID/starttime/namespace identity verification, a Python bootstrap,
owned namespace probes and an exclusive acquisition marker. Rejected drafts and
their content reviews remain private evaluation artifacts; syntax success alone
never qualifies a draft as a working experiment. The current medium-reasoning
profile has a larger reasoning/output allowance because low-reasoning drafts
still contained cross-helper call errors. The larger live draft covered all 23
actions (19 terminal, four blocked) and passed its initial parsing checks; content
review then found missing-value formatting and interrupted-cleanup limitations.
The instructions now address those cases, and the missing-value branch fails
the strengthened static replay. Those earlier evaluations used the shared-program
layout. The per-step prompt embeds code separately in each action and cleanup,
while retaining real data dependencies, and is evaluated under new frozen run
names. Linux execution remains unqualified until explicitly tested on a suitable
host. No experimental measurement was produced by the evaluation workflow.

The first retained per-step draft covers 23 actions: 19 terminal and four blocked.
All 19 terminal actions and cleanup include their own inline Python programs and
passed initial Bash/Python parsing, without an executable setup block or shared
code imports. Content review then caught unprivileged root-process identity
reads in acquisition/cleanup. The prompt now explicitly requires sudo for these
reads, and TypeScript/Postgres guards reject the observed pattern. Static replay
retains that failure; it is not a qualified experiment recipe.

Run `test/check_step_commands_database.py` in the infrastructure repository
for the isolated Postgres flow, role/owner restrictions, exact source and action
parity, concurrent admission, aggregate budget checks, original call identity,
response-bound single-action storage, legacy reconciliation, aggregate budgets, immutable history and deletion behavior. The earlier whole-experiment regression remains available as `test/check_terminal_commands_database.py`.
