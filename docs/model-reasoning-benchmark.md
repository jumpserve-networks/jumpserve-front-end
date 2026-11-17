# Browser-free model and reasoning comparison

Run the fixed development comparison against the PDFs in `pdfs/synthetic_papers`:

```bash
npm run eval:models -- --run synthetic-models-YYYYMMDD --prepare
npm run eval:models -- --run synthetic-models-YYYYMMDD --live
npm run eval:models -- --run synthetic-models-YYYYMMDD --replay
```

`--prepare` freezes the exact extracted PDFs, source hashes, reviewed breakdowns,
reviewed command-context plans, prompts, schemas, model IDs, reasoning settings,
rubric and request identities. It makes no API calls. Do not reuse a run name for
changed inputs. `--replay` grades retained responses without inference.

The live matrix has 48 calls: two papers, two pinned models, three reasoning
efforts, and four tasks. Models are `gpt-5.4-2026-03-05` and
`gpt-5.4-mini-2026-03-17`; efforts are low, medium and high. Tasks are paper
breakdown, hierarchical experiment planning, one measurement-collection action,
and one statistics-analysis action. Later stages use the same hand-reviewed
input for every candidate, rather than inheriting differences from an earlier
candidate. This isolates stage-specific effects. It is not an end-to-end
assessment qualification.

Output-token allowances are held constant within each task: 32,768 for breakdown
and planning, 49,152 for individual commands. These exceed current application
allowances to avoid confusing a small shared reasoning/output cap with model
quality. They are evaluation settings only. Actual provider usage is retained,
including any output-token usage above the requested cap. The two models use the
same application prompt and schema in each task.

The fixed policy admits at most 48 requests, three concurrently, within a $40
estimated usage ceiling and a frozen one-hour run deadline. A response gets at
most 20 minutes within that deadline. Admission conservatively reserves input
bytes as tokens and twice the requested output allowance, because previous
provider responses have reported usage above the requested cap. Completed calls
use returned token usage and the recorded standard pricing to release unused
reservation. The estimate is not a provider billing guarantee; actual invoice
charges are unavailable. Cached input tokens are priced separately when reported.

Reopening a live run reads original response IDs; it never resubmits uncertain
calls. Requests are saved before submission with a client request ID. Provider
failures and incomplete outputs remain in the comparison. `Ctrl-C` stops new
admissions and requests cancellation of acknowledged in-flight responses. If a
status read fails, the saved identity remains available for reconciliation.
`--stage breakdown`, `--stage plan`, and `--stage commands` select a subset of
the frozen matrix without creating a new budget or deadline.

Live runs read the server-only `OPENAI_API_KEY` from the existing project
environment, including `.env.local`. Do not include credentials in prompts or
evaluation artifacts. The completed first comparison is summarized in
[the November 16 results](model-reasoning-benchmark-results-2026-11-16.md).

Private files are under `.test-artifacts/synthetic-model-benchmarks/<run>/`:

- `manifest.json`: complete frozen inputs, prompts, policy and hashes.
- `<case>--<task>--<model>--<effort>.json`: original response and timing.
- Corresponding `.output.json`: parsed output, produced by replay/reporting.
- `report.json`: completion, application validation, rubric coverage, static code
  checks, observed latency, token usage and estimated price for every admitted call.

The rubrics are written from the manuscripts before seeing outputs. The TCP case
requires three distinct claims, including unresolved agreement tolerances for
H1 and H3. The UDP case requires the fixed FIFO/shaper topology, complete-block
design, delivered-probe handling and three explicit claim criteria. No private
grading key is read or sent to the model. Rubrics are never sent in requests;
planning and command tasks do receive their reviewed scientific input.

Interpret automated scores as coverage signals. Lexical checks can reject a
valid paraphrase or miss a contradiction. Review finalists for source entailment,
scope, actual statistics, timing, prerequisites, missing data and code behavior.
The model evaluator and reviewer are part of the same development process;
there is no independent human reviewer. No generated program is executed, no
Linux experiment is qualified, and no experimental measurements are produced.

Two exposed papers and one sample per setting/task cannot establish a universal
best model or a reliable error rate. Report findings as provisional choices among
the tested settings, retain failures, and use new named runs for repetitions or
additional held-out papers. This workflow does not change production model
settings, write assessment records, deploy software or start experiment workers.
