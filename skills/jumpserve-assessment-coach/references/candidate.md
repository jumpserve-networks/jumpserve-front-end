# Draft a Generator candidate

Use the owner-supplied Generator skill directory when available. Otherwise use the source for the reviewed version if it can be identified, or the sibling `jumpserve-paper-assessment` skill from the Coach's bundle or checkout. Record which source you used. If the reviewed version cannot be verified, describe the candidate as a draft against the available baseline.

Create the snapshot in a writable review directory outside the active skill tree and the client's skill discovery directories.

```sh
python3 -B "$COACH_DIR/scripts/prepare_candidate.py" "$GENERATOR_DIR" "$REVIEW_DIR"
```

Use the returned `candidate_dir` as the sole edit target. Keep the source path and `baseline_sha256` in the local review notes. The helper creates a fresh directory for every candidate and preserves the Generator's skill name and relative resource paths.

Make one focused change supported by the development feedback. Keep prior drafts as separate directories. Keep scorecards, answer keys, and paper-specific evidence in the review workspace. Compare the final candidate with its source to verify the scope of the change. Run focused local checks when feasible, using a new development fixture with values independent of the reviewed case. Report checks as proposed when they still need to run.

For an authorized comparison, test the baseline and candidate under the same conditions in separate workspaces. Preserve the original evaluation criteria and use an independent Verifier. The candidate is a local draft for the owner's review. Installation, activation, and release require a separate owner decision.
