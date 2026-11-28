# Recreate the testbed and run the experiments

## Specify the testbed

For each claim, find the paper's actual experiment and identify the parts of
the testbed that can affect the result. Record the topology or experimental
units, roles, code or hardware versions, inputs, workload, controls, instruments,
metric definitions, repetitions, and conditions. Check cited supplements,
artifact repositories, and documented configurations for missing details.
Record which details came from the source and which are assumptions.

Check artifact and runtime availability before spending time on a runner.
Prefer the authors' runnable artifact for a faithful rerun. If it is
unavailable, construct an isolated implementation of the documented setup.
For each substitute, state what it replaces and which comparisons remain
valid. A reduced-scale test can check a mechanism if it retains the conditions
needed to isolate it. It cannot establish a threshold at the original scale.
Use a simulator as the testbed when the paper used one. For other papers,
limit simulation findings to the conditions the model can represent.

Write the setup, readiness checks, workload, measurement and cleanup steps as
repeatable commands. Use the [module workflow](modules.md) to freeze the
composition, comparison conditions, metric and unit, minimum valid trials,
decision rule, exclusions and stopping rule before acquiring result data.
Check permitted alternatives for unavailable dependencies. When an experiment
still cannot run, record the missing component, attempted remedies, affected
claims and the next action. Continue claim-relevant experiments that can run.
When the design calls for AWS, use the [temporary AWS testbed workflow](aws-testbeds.md)
for provisioning, evidence retrieval and teardown.

## Freeze the experiment protocol

In the private assessment directory, write `experiment-protocol.json`. Use the
paper, supporting materials, and approved adaptations to derive the protocol.
Trace scientific conditions and decision rules to their source passages.
Record assumptions and unresolved constraints before examining measured outputs.

| Field | Value |
| --- | --- |
| `version` | `jumpserve-experiment-protocol-v1` |
| `paper_sha256` | SHA-256 of the original PDF bytes. |
| `frozen_at` | UTC time of the freeze, ending in `Z`. |
| `experiments` | One or more experiment plans with the fields below. |

| Experiment field | Value |
| --- | --- |
| `id`, `claim_ids` | A stable experiment ID and the assessment claim IDs it addresses. Use the same IDs in the assessment bundle. |
| `mode` | `reproduction`, `replay` for existing observations, or `adaptation` for a distinct design. |
| `sources` | A list of citations, including page or section locators and versions or digests for supporting materials where available. |
| `conditions` | A list of objects with `name`, `value`, `basis`, and `policy` of `fixed`, `flexible`, or `unresolved`. A flexible value states the permitted variation and cites its basis. |
| `procedure` | Exact setup, controls, workload, repetitions, schedule, and analysis steps, including the versions or digests of referenced local inputs. |
| `measurements`, `eligibility`, `minimum_coverage` | Metric definitions and units, inclusion rules, and required coverage for each comparison. |
| `decision_rule`, `stopping_rule`, `scope` | Predeclared interpretation, stopping conditions, and what the design can establish. |

Record historical dates with their observations. An alternate acquisition window
belongs to the original design when the source permits it. When a substitute
changes the comparison, predeclare an adaptation and state what its results
can support. Use a separately scoped claim when needed. With an unresolved
constraint, record the affected comparison, the evidence available, and what
would resolve the constraint. Preserve the claim's original verdict and evidence.

Validate the plan and retain the exact digest it prints. Check it again before
starting measurements.

```sh
python3 "$SKILL_DIR/scripts/check_experiment_evidence.py" --protocol-only experiment-protocol.json
python3 "$SKILL_DIR/scripts/check_experiment_evidence.py" --protocol-only experiment-protocol.json --expected-sha256 "$PROTOCOL_SHA256"
```

Keep this file and its reference inputs with the retained evidence. For a
material change to the design, freeze a new protocol in a separate assessment
workspace and retain the earlier protocol and results with their original digest.

## Run and interpret the experiments

Check that the environment and instruments satisfy the design. Run the
configured treatment and controls, preserve failed trials, and record the
actual versions, configuration, parameters and deviations. Setup checks and
smoke tests establish readiness. Count a run in the bundle when it executes
the experiment workload and yields a valid measurement for a named claim.
Use author-provided data as a documented workload input where the experiment
calls for it. Measurements already collected by the authors, including values
read from figures, tables, traces or summaries, are reference evidence.

Apply the frozen decision rule to newly collected data. Use `reproduced` or
`discrepant` only when the completed evidence meets that claim's comparison
conditions and minimum valid trials. Identify the tested conditions and the
effect of any adaptations in the finding. Use `inconclusive` for completed or
partial trials with insufficient or noncomparable evidence. Use `untested`
when the relevant experiment never ran.

## Record fresh experiment evidence

Keep inputs, logs, failed attempts, and raw observations in the private
assessment directory. Create a JSON receipt from the actual execution for
each run included in the bundle. Store it as `evidence/runs/<run-id>.json`
relative to the bundle. Include these fields in each receipt.

| Field | Value |
| --- | --- |
| `run_id` | The matching bundle run ID. |
| `origin` | `testbed` for observations the run generated. Keep preflight and reference-only work in separate local records. |
| `status` | `completed` for a finished run or `partial` for an interrupted run with valid observations. |
| `started_at`, `finished_at` | Actual UTC timestamps ending in `Z`, using the bundle start time verbatim. |
| `command`, `testbed` | The invocation and actual testbed configuration. Record private details locally, with credentials omitted. |
| `observations` | One or more objects with `path` relative to the assessment directory and `sha256` of a raw output generated by the run. |
| `comparable_claim_ids` | Measured claims for which this completed run meets the frozen comparison conditions. Use an empty list for partial runs. |
| `protocol_sha256`, `experiment_id` | The SHA-256 recorded when the protocol was frozen and the ID of the corresponding plan. The experiment ID matches the bundle run. |

Hash the receipt bytes into the matching `runs[].artifact_sha256`. Document
how each measurement derives from the saved observations. Use
`runs[].configuration` for the shareable setup, workload and deviations.

## Check the saved bundle

From the assessment directory, run the packaged checker before private delivery.

```sh
python3 "$SKILL_DIR/scripts/check_experiment_evidence.py" --require-protocol jumpserve-assessment.json
```

The checker needs only the Python 3.9+ standard library. It checks shareable
text, including embedded commands and scripts, with the same text rules as the
JumpServe importer. A text error identifies the field by its JSON Pointer and
keeps the rejected value private. Correct the shareable copy and check it again.
The checker also verifies the link
from each bundled run to its frozen protocol, local receipt and raw outputs, and requires
comparable execution evidence for conclusive claims. Validate the actual
method, sampling and provenance against the frozen specification separately.
An assessment with no eligible run can use an empty `runs` array and
unresolved outcomes. Keep the receipts and raw observations local.
