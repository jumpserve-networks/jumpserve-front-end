# Draft a Generator candidate

Use the owner-supplied Generator skill directory when available. Otherwise use the source for the reviewed version if it can be identified, or the sibling `jumpserve-paper-assessment` skill from the Coach's bundle or checkout. Record which source you used. If the reviewed version cannot be verified, describe the candidate as a draft against the available baseline.

When the owner supplies the reviewed Generator artifact, match its file SHA-256 to the development feedback before using its `skill_instructions` record. For a published baseline, use the exact retained Markdown or retrieve it with `get_skill_instructions` and the artifact's Generator `version_id`. Check its SHA-256 against the artifact. For a historical local baseline, verify the supplied Markdown against the recorded SHA-256. If the reviewed baseline cannot be resolved, fetch current published Generator guidance and identify it as the baseline of the new draft.

Create the snapshot in a writable review directory outside the active skill tree and the client's skill discovery directories.

```sh
python3 -B "$COACH_DIR/scripts/prepare_candidate.py" "$GENERATOR_DIR" "$REVIEW_DIR"
```

Use the returned `candidate_dir` as the sole edit target. Keep the source path and `baseline_sha256` in the local review notes. The helper creates a fresh directory for every candidate and preserves the Generator's skill name and relative resource paths.

For a workflow guidance change, write the proposed Markdown to the candidate's `references/workflow.md` for owner review and publication. Keep an untouched copy of the baseline guidance in the review directory and record its version ID when present and its SHA-256. Diff the candidate guidance against those bytes. The snapshot hash identifies the installed skill files, while the guidance hash identifies the text used by the run.

Make one focused change supported by the development feedback. Keep prior drafts as separate directories. Keep scorecards, answer keys, and paper-specific evidence in the review workspace. Compare the final candidate with its source to verify the scope of the change. Run focused local checks when feasible, using a new development fixture with values independent of the reviewed case. Report checks as proposed when they still need to run.

For an authorized comparison, test the published baseline and the draft under the same conditions in separate development workspaces. Evaluate draft guidance in an isolated development trial. For an installed skill change, use the same pinned Generator guidance with both copies of the skill. Use an independent Verifier with the same pinned guidance and rubric for both trials. Normal Generator runs load published guidance. Installation, activation, and release require a separate owner decision.
