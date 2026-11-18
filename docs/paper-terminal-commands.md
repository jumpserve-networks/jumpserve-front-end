# Step 4 shared setup and run commands

Step 3 shows the saved hierarchical experiment plan without generating terminal
commands. **Continue to Step 4** opens **Setup & Run Commands**. Each experiment
gets one asynchronous package containing a complete shared setup/helper script,
commands under its original numbered actions, cleanup, and required environment
inputs. Opening Step 4 first reads saved status and explicitly POSTs generation
only when no package exists. GET requests never admit inference. No generated
command is executed by the application.

Step 3 planning and Step 4 script generation use the app-wide paper notification
provider. Leaving the assessment for another app page keeps the initial admission
and saved-call reconciliation active. One notification per assessment/step shows
progress, completion or a failure requiring attention and links to that wizard
step. Step 4 completes only when every expected experiment package is ready.
Dismissed progress does not suppress the later completion notification.

The owner-authenticated `GET /research-verification/api/paper-workflow` discovers
bounded metadata and reconciles at most two existing original calls per poll,
using a rotating cursor. It cannot start replacement model calls. Status failures
retain the last recorded progress; cancellation, original call identities, source
revision checks, budgets and deadlines still apply. Pending legacy command calls
are reconciled before an already-requested shared package can be admitted.

Reload restores saved work from the database. Browser storage contains only
owner-scoped watched/dismissed identifiers, with no paper or command contents.
Sign-out stops the old owner's transport and clears its visible state. Closing
the browser leaves already-admitted model calls running; in-app notifications
resume on return. These are not operating-system push or email notifications.
Step 4 still starts when the owner opens it; completing Step 3 does not start it.

Run the shared setup first on an Ubuntu/Debian Linux research host using Bash,
then follow the numbered commands. The setup supplies the reusable program;
actions call its subcommands and check their prerequisite data and resources.
Each executable action and cleanup declares the setup prerequisite. Manual or
blocked operations retain their explanation and have no executable command.
Copy controls include a private workspace and an experiment-specific namespace
prefix. Environment values are entered in the host terminal and never sent to
the browser, database or model.

All assessment generation now uses pinned `gpt-5.4-2026-03-05` with **medium**
reasoning. Step 2 breakdown and Step 3 planning each allow 32,768 reasoning/output
tokens. Step 4 allows 64,000 tokens for the entire package. The setup body permits
200,000 characters, action/cleanup bodies 16,000 each, and the whole saved package
250,000 UTF-8 bytes. These character bounds are structured-output/storage limits,
separate from the token allowance. The shared setup targets compact reusable code without repeating a large
program inside each action. A live 41-action draft hit an exact 64,000-character
setup cut; that failed original response is retained. The new 200,000-character
setup bound is separate from historical 64,000-character recipes. Incomplete heredocs and the observed unsafe
unprivileged process-identity reads are rejected before a package becomes ready.
Static checks do not establish runtime correctness or scientific validity.

Frozen scientific acceptance criteria, exact confirmed evidence, trial scope,
measurement endpoints and uncertainty rules remain unchanged. Dedicated claim
actions with undefined acceptance criteria stay blocked. No authenticated manual
measurement-ingestion contract has been selected for this flow, so raw upload
and normalized Supabase ingestion actions remain blocked with a precise reason.
Local acquisition and analysis can still be implemented. Generated code must
retain measurements, provenance, failures and invalid/missing reasons; cleanup
removes only verified owned runtime resources.

## Persistence and release order

After the existing terminal-command and individual-command migrations, apply:

1. `jumpserve-infra/database/202611170001_paper_assessment_model_profile.sql`
2. `jumpserve-infra/database/202611170002_shared_experiment_scripts.sql`
3. Deploy the matching frontend.

The model migration adds full GPT-5.4 planning admission while preserving older
pinned requests during rollout/rollback. It does not rewrite historical calls.
The shared migration adds private `research_experiment_scripts`,
`research_experiment_script_events` and `research_experiment_script_prompt_uses`.
Each assessment/experiment/target admits one package. Source plan revision,
confirmed sections, exact prompt/request, original provider identity, response,
commands, reservations and event history are retained. Generic templates and
model configuration appear in the existing `/prompts` catalogue; private paper
content stays in the owner-only request history.

All new tables have RLS, no anonymous/authenticated SQL access and no direct
service-role writes. The owner-only API accepts assessment, experiment and
operation; it never accepts caller-supplied prompts, scripts or owner identity.
Admission locks and independently selects the saved original/reviewed source,
checks exact request/schema bounds, and enforces the original assessment deadline
and aggregate budget. A 200-cent package reservation includes earlier intake,
planning, whole-experiment and individual-command calls; it is not a measured
provider charge. Concurrent requests reuse one admission. Failed, cancelled or
uncertain requests are not automatically replaced.

Earlier shared, standalone and individual requests remain unchanged and can
finish or be cancelled with their original provider identity. New individual
admissions are retired. Pending or uncertain earlier calls fence overlapping
shared generation. Unknown submissions require reconciliation rather than replay.
Step 4 exposes cancellation for known pending calls. New shared workspaces use
`shared-setup-v2` and an `s` namespace prefix, separate from earlier layouts.
Pending shared calls block assessment deletion; completed private history is
retained after deletion.

## Browser-free prompt evaluation

```sh
npm run eval:experiment-scripts
npm run eval:experiment-scripts -- --live --run shared-candidate-01 --assessment UUID
npm run eval:experiment-scripts -- --live --run shared-candidate-02 --from-plan FILE --experiment 1
npm run eval:experiment-scripts -- --replay shared-candidate-01
```

`FILE` contains `study_id`, `plan` and `confirmed_breakdown`. An optional
`--prompt FILE` freezes candidate instructions. Named runs make at most one model
call. Shared packages poll for up to 15 minutes. Rerunning the same live command
retrieves the original response when it is still pending after that window. Different inputs require
a new name. Assessment reads use project-scoped Supabase MCP; evaluations make no
database writes and execute no generated code. Private inputs, original responses
and reports stay under `.test-artifacts/terminal-command-evaluations`.

The evaluator checks saved source coverage, ordered prerequisites, structured
bounds, heredoc completeness, Bash parsing with `bash -n`, and recognized Python
heredocs with `ast.parse`. It checks known local-helper keyword and formatting
errors without importing generated Python. Keep failed responses and content
reviews; syntactic success does not qualify an experiment for execution. Earlier
individual/standalone evaluations remain replayable through
`npm run eval:terminal-commands -- --replay NAME`; `--step` is retained only for
explicit historical individual-profile comparisons.

Run `test/check_shared_experiment_scripts_database.py` in the infrastructure
repository for isolated Postgres checks covering the entire preceding migration
chain, new full/medium planning, JS/SQL validator parity, old pending-call
reconciliation, concurrent admission, aggregate budgets, private grants, prompt
history, original-response binding, immutability and assessment deletion.
Earlier evaluations and the 2026-11-16 model benchmark remain historical evidence
for their frozen prompts and limits, rather than qualifications of this package.
