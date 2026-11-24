# Grading and scorecards

## Evidence and scope

Use the answer key's source pages, experimental conditions, eligibility rules, metrics, and source of each decision threshold. Match each key claim to the assessment's extraction and citation even when its ID differs. Record missing, ambiguous, extra, and duplicated claims. Cite the paper page, assessment claim or run ID, and relevant evidence file and rows for each finding. Review raw data and configuration alongside summaries. Keep sample counts, invalid units, and decision boundaries explicit.

- **Fresh.** Recompute the metric and verdict from the assessment's own evidence using the frozen procedure. Expected directions, paper values, and recorded replay outcomes supply context. Grade a justified `discrepant`, `inconclusive`, or `untested` verdict on the same basis as `reproduced`. If the paper leaves an agreement tolerance open, look for a choice recorded before acquisition. Preserve the distinction between that choice, a private evaluator convention, and a paper-specified rule.
- **Recorded replay.** Confirm the candidate analyzed the scenario's supplied observations, calibration, and variant operations. Compare the recomputed values and verdict with the selected key entry. Use the key's replay tolerance for numeric comparison and the experiment's declared boundaries for its scientific decision. Leave the replay unscored if the evidence belongs to an unidentifiable or different scenario.
- **Synthetic replay.** Grade only arithmetic and decision handling. Accept a separate JSON analysis with `version` set to `jumpserve-replay-analysis-v1`, `paper.sha256`, the chosen `scenario`, and `claims`. Each claim supplies `id`, `claim`, `criterion`, `outcome`, `finding`, and the calculated values or derivation. Omit `runs`. Require the analysis to distinguish its synthetic observations from local measurements. Mark experimental execution and empirical provenance criteria as out of scope and show the applicable denominator. The Generator's ordinary live assessment bundle remains the input for fresh grading.

Check provenance actively. A paper's table supplies reference numbers, and a fixture exercises the decision on supplied inputs. An attempted run with insufficient comparable evidence is `inconclusive`. Use `untested` when the experiment needed for that claim never ran, applying any more specific decision rule in the key. Review configuration validity and claim coverage before comparing numeric values.

## Preflight results

The helper emits a compact JSON report and uses exit code 0 for a reviewable input, 1 for failed evidence integrity, and 2 for invalid or mismatched inputs. Record the original status in the scorecard. `verified` means the shared receipt checker passed. `legacy_archive_matched` means a single pre-receipt run references the intact archive supplied by the user. Inspect the archive's relative members using read-only operations and verify its coverage against the claim. `fixture_only` applies to synthetic arithmetic checks. A hash mismatch, invalid receipt, or unresolved evidence gap blocks grading where the relevant evidence cannot be verified. Preserve a specific reason and distinguish a missing input from a demonstrated critical failure.

## Scoring

Apply the key's `rubric.assertions` for JSB and `rubric.original_rules` for SNC. The SNC category weights vary by key. Record each rubric item once at the assessment level, supported by claim-level findings and evidence. For each scored category give its maximum, earned points, and rationale. Give partial credit only when the rubric item contains independently supported components and explain the allocation. Follow the key's critical-failure policy. A critical failure takes precedence over points. Keep the native rubric denominator and show any scope adjustments explicitly.

## Scorecard format

Write a new JSON file with the following fields. Keep raw logs, private paths, credentials, and full answer-key contents in their original inputs. Use relative evidence references inside the scorecard.

| Field | Contents |
| --- | --- |
| `version` | `jumpserve-verifier-scorecard-v1` |
| `skill_instructions` | The [version identity](instruction-loading.md) for this Verifier run. |
| `paper_id`, `paper_sha256`, `assessment_sha256`, `answer_key_sha256` | Copy the verified input identities from preflight when available |
| `split`, `mode`, `scenario` | Key split, `fresh` or `replay`, and replay scenario ID or `null` |
| `evidence_integrity` | Preflight status and concise details |
| `status` | `scored`, `blocked`, or `failed`. Use `failed` for an identified critical failure, even if rubric points were calculated |
| `claims` | One entry per key claim with `key_claim_id`, `assessment_claim_id` or `null`, `reported_outcome` or `null`, `supported_outcome` or `null`, `assessment` (`correct`, `incorrect`, or `unscored`), `evidence` (relative references), and `finding` |
| `rubric` | Entries with `criterion`, `earned`, `maximum`, and `reason`. Use `null` for `earned` when unscored or out of scope |
| `score` | `earned`, `applicable_maximum`, and `rubric_maximum`, or `null` when grading is blocked |
| `critical_failures`, `blockers` | Arrays of concise evidence-backed findings |

Verify the JSON parses and the recorded totals agree with the rubric entries. Repeat preflight if any input may have changed during review. When proof is incomplete, use `null` for the unsupported result instead of assigning a scientific verdict. Share development findings with the Coach only when requested. Keep held-out case details restricted to the Verifier and the user.

## Save the scorecard privately

For a JumpServe-connected review with an owner-authorized private save, call `save_verifier_result` with the Step 1 `assessment_id`, the original reviewed file's UTF-8 text as `assessment_json`, the parsed `scorecard`, and the `verifier_version` from `SKILL.md`. Read the original file bytes and decode them without reformatting or normalizing line endings. The connector checks that raw SHA-256 and matches the parsed artifact to an already saved Generator result. Include bounded relative evidence citations and keep answer keys, observations with answer labels, raw logs, and PDF bytes local.

Keep the returned `verification_id` with the local scorecard. On an uncertain response, retry once with the same assessment ID, original JSON text, scorecard, and version. If the exact Generator artifact has not been saved, retain the scorecard locally and report the missing saved result. Honor local-only requests and report when the connector cannot accept a private save.
