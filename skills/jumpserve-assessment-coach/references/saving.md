# Save a Coach report

Use `save_coach_report` at the end of each Coach review through the JumpServe connector signed in as the owner of the development scorecards. Proceed with the private save as part of the Coach request. When using an authorized JumpServe checkout from the terminal, run `npm run assessment -- save-coach <report.json>`. For explicitly local-only reviews, keep the result in the workspace. Keep a local copy of every report at the owner-specified destination or in a new `jumpserve-coach-report.json` in the review directory.

Pass a `report` object with these fields.

| Field | Value |
| --- | --- |
| `version` | `jumpserve-coach-report-v1` |
| `sources` | One entry per development scorecard used, up to 20. Each entry has the `verification_id` from the original Verifier save and the `assessment_sha256` from that scorecard's prepared feedback. |
| `skill_instructions` | The [version identity](instruction-loading.md) for this Coach review. |
| `summary` | A short account of what the review supports. |
| `recommendations` | In priority order, up to 20 entries, each with `title`, `finding`, `proposed_change`, and `regression_check`. Link each finding to the applicable rubric item or claim and use the source verification ID when several reviews informed the report. Use an empty array when the evidence supports no recommendations and explain the result in `summary`. |
| `limitations` | Concise qualifications or an empty array. |

Use verification IDs from the original Verifier save receipt or the IDs supplied by the owner. If a source ID is missing or a source scorecard is unavailable in the connected account, preserve the report locally and tell the owner which source needs reconciliation. Keep raw evidence, answer keys, private paths, and held-out findings out of the report. Save only the recommendations and their development-source references.

Treat `status: saved_private` with a returned `coach_report_id` as confirmation and report the ID. On an uncertain outcome, retry once with the identical report. If the connector does not offer the tool or storage remains unavailable, report the save as pending or blocked and give the location of the retained local copy.
