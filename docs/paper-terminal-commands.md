# Step 3 terminal commands

Step 3 automatically prepares terminal commands for each experiment as soon as
its saved plan is ready. No separate generation button or disclosure is required.
Opening or refreshing Step 3 first checks saved status, reuses existing commands
and resumes polling an existing request. Only an experiment with no command
request for the current format starts generation. Generation makes one bounded server-side OpenAI call
for that experiment and format
and saves its exact source plan, confirmed sections, prompt, response, commands
and event history in private Supabase records. Existing flat plans and reviewed
hierarchical plans are supported without rewriting their originals.

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
64,000-token reasoning/output bound. A 200-cent reservation must fit within the
original assessment limits; generation never enlarges those limits. All code
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

Apply `jumpserve-infra/database/202611150002_paper_terminal_commands.sql`, followed
by `202611160001_standalone_terminal_commands.sql`, before deploying the frontend.
The current layout is `per-step-v1`; earlier packages remain stored as
`shared-setup-v1`. Each layout has its own request, response, token and immutable
history. The new layout uses a separate workspace and namespace prefix so it
does not overwrite an older recipe's artifacts. The top-level `setup` field
remains as non-executable metadata for wire compatibility and is hidden in the
new layout. All code lives under the numbered actions and cleanup.

Step 3 prepares the new layout automatically within the original limits, keeping
older packages unchanged. An earlier pending call is reconciled first; uncertain
submissions block a replacement rather than being replayed. All command tables are private with RLS and no anonymous
or authenticated SQL access. Every API read/write verifies Google authentication
and assessment ownership, requires a ready saved plan, and accepts only an
experiment index and operation; callers cannot supply model prompts or scripts.
The SQL RPC independently derives the original or reviewed plan and requires
the exact request input. It admits one call per assessment/experiment/layout,
accounts for intake, planning and prior reservations across all layouts, and retains the
original assessment deadline and spending limits.

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
npm run eval:terminal-commands
npm run eval:terminal-commands -- --live --run candidate-01 --assessment UUID
npm run eval:terminal-commands -- --live --run candidate-02 --from-plan FILE --experiment 1
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

Run `test/check_terminal_commands_database.py` in the infrastructure repository
for the isolated Postgres flow, role/owner restrictions, exact source and action
parity, concurrent admission, aggregate budget checks, original call identity,
response-bound command storage, immutable history and deletion behavior.
