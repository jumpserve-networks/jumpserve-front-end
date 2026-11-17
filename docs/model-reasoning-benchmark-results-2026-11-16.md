# Model and reasoning comparison: November 16, 2026

Use **GPT-5.4 with medium reasoning** as the provisional choice for Step 2 paper
breakdown and Step 3 experiment planning. This comparison does not establish a
reliable terminal-command profile: the current command contract needs repair
before selecting one. Application model settings have not been changed.

## Recommended profiles

| Task | Proposed model / effort | Observed time per paper | Estimated cost per paper |
|---|---|---:|---:|
| Step 2: Access, Experiment, Data, Validate | GPT-5.4 / medium | 95–115 seconds | $0.216–$0.289 |
| Step 3: Hierarchical experiment planning | GPT-5.4 / medium | 208–298 seconds | $0.361–$0.518 |
| Step 3: Individual terminal commands | No tested profile qualified | See detailed results | See detailed results |

These are evaluation settings with **32,768 requested output tokens** for breakdown
and planning. Current production allowances are 12,000 and 16,000, respectively.
The results do not show that changing effort while keeping those smaller
allowances will behave the same way.

Full/medium preserved the source claim rules, measurement definitions, provenance
and unresolved choices more consistently in developer review. Full/low was faster
but needed more corrections. Full/high did not provide a clear requirement-coverage
advantage worth its additional time and token use on these cases.

## Comparison design

The corpus contains the two supplied PDFs:

- [SNC-NEG-001: TCP loss](../pdfs/synthetic_papers/SNC-NEG-001_recreated_paper.pdf).
- [SNC-MIX-002: UDP router buffers](../pdfs/synthetic_papers/SNC-MIX-002_router_buffers.pdf).

The 48 original generations cover two papers, two models, low/medium/high effort,
and four tasks: breakdown, planning, measurement commands and analysis commands.
Pinned models are `gpt-5.4-2026-03-05` and `gpt-5.4-mini-2026-03-17`.

Inputs, application prompts, schemas and requested output allowances are identical
across candidates within each task. Planning uses a fixed hand-reviewed breakdown;
commands use a fixed hand-reviewed plan. This isolates each stage from earlier
generation errors. Command requests receive 49,152 requested output tokens, with
the application's existing 16,000-character script field limit preserved.

All 48 calls reached a terminal provider status: **38 completed and 10 incomplete**.
Every incomplete response reports `max_output_tokens`. Estimated total API cost is
**$15.73**, including incomplete calls, using recorded usage and the published
[GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4) and
[mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini) rates. Actual
invoice charges are unavailable. Seventeen responses report output-token usage
above the requested allowance; that discrepancy is retained without assuming its
cause.

## Material findings

- Mini/low failed application validation on both breakdowns. It treated undefined
  approximate agreement rules as paper-defined on the TCP paper and exceeded
  citation bounds on the UDP paper.
- Mini/medium retained the headline TCP claims but omitted the complete unresolved
  implementation-choice inventory. Its planning drafts also needed corrections
  to measurement authority, sampling details and analysis timing.
- Full/low's UDP breakdown passed local application validation but returned a
  cut-off tolerance containing an actual NUL character. PostgreSQL rejects NUL in
  parsed `jsonb` strings, so that breakdown cannot be saved unchanged. No database
  write was attempted. See [PostgreSQL's representation constraints](https://www.postgresql.org/docs/current/datatype-json.html).
- Full/high took about 249–252 seconds for breakdown and 356–462 seconds for
  planning. Its added effort did not consistently remove the remaining content
  issues. Mini/high exhausted the requested allowance on both planning cases.
- Of 24 command generations, 7 ended incomplete and 17 completed. Fifteen completed
  drafts reach exactly 16,000 characters and end inside unfinished scripts. Only
  two pass static syntax checks; one deletes its saved analysis artifacts during
  cleanup, and the other implements a scaffold without the requested measurement
  loop. **None qualifies as an implementation of the selected step.**

The original Bash check could report success for an unterminated heredoc warning,
and the Python check skipped those bodies. The offline checker now rejects them
and inspects staged `.py.new` / `.py.tmp` files. All original responses were
regraded without new inference. The earlier parsing scores remain in
`report.initial-grading.json` for audit.

## Reproduction and next changes

[The workflow](model-reasoning-benchmark.md) is available through `npm run eval:models`.
Replay this completed run without an API call:

```bash
npm run eval:models -- --run synthetic-models-20261116 --replay
```

Complete requests, outputs, rubric hashes, developer review, token usage, pricing,
latency and verification are in
`.test-artifacts/synthetic-model-benchmarks/synthetic-models-20261116/`.
Start with `report.md`, `report.json`, `integrity-audit.json` and `verification.json`.
All 48 provider identities, requested model/effort settings, frozen inputs and
original response fingerprints were verified; source PDFs and responses remain
unchanged. The corpus rubric is unchanged. The corrected grading code is hashed
in the replay report. All 1,261 tests pass, and changed JavaScript files pass lint.

Before enabling a new command profile, resolve the script field-size contract,
reject incomplete programs, and require the selected operation to be implemented
while preserving measurements and provenance. Reject NUL-containing parsed
breakdowns before persistence. Then repeat command evaluation with the corrected
contract and qualify actual execution on a suitable Linux host.

This is one sample per setting/task on two exposed synthetic papers. Developer
review was unblinded and performed by the same agent that built the evaluation;
it is not independent human review or a universal model ranking. No generated
command was executed, no experiment measurements were produced, and no assessment
record or production configuration was changed.
