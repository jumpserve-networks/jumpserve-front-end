# Deliver an assessment on JumpServe

Use the MCP connector registered for the user's chosen JumpServe instance.
Save the completed assessment privately without a separate sharing request.
The saved assessment remains private until the account owner shares it publicly.
Skip this step for local-only work. If the connector requires sign-in or consent,
ask for the specific connection or scope and continue delivery once granted.
Use the [approval workflow](permissions.md) if the local download helper
hits a sandbox restriction. Keep the saved bundle and exact assessment ID if
delivery has to pause.

## Assessment wizard fields

Supply only the fields in [the bundle schema](assessment.schema.json). Include
`wizard` in each new bundle so the private and public assessment pages show the
same assessment steps.

- **Step 2 · Paper Breakdown** uses `wizard.breakdown` for numbered steps and
  substeps in Access, Experiment, Data, and Validate. For each step, supply a
  short `title`, a source-grounded `description`, one-based PDF page numbers
  in `pages`, and an `id` unique within its `section`. Reference the enclosing
  step's `id` in `parent_id` for a substep. Omit `parent_id` for top-level
  steps and put siblings in reading order. For example, a Data step titled
  “Record measurements” can have separate substeps for time and throughput.
  JumpServe assigns numbers such as 3.1 and 3.1.1. Cite each substep's own
  evidence and tie the hierarchy to the testbed described by the paper. Put
  claims and their decision rules in `claims`. Label reported values and
  identify any synthetic reference data.
- **Step 3 · Experiment Steps** uses `wizard.experiments` for the ordered design.
  Give each experiment a stable `id` and link it to its `claim_ids`. Write each step's `title` and
  `instructions` from the frozen procedure. Record any unresolved inputs or
  proposed design choices in the instructions. Use `methods` for module
  versions, acquisition procedures and validation reports.
- **Step 4 · Experiment Setup** uses the experiment's `prerequisites`,
  optional `setup` and `cleanup`, and `commands` on the step they implement.
  Include complete shareable script files from the local experiment package
  in the experiment's `scripts` array. Use a relative `path` matching the
  commands and put the full UTF-8 source in `content`. Include helper scripts
  required by those commands. Use `command_notes` to identify any scripts
  or commands that are drafted, unverified, or unavailable in the shared copy.
- **Step 5 · Experiment Results** uses `summary`, claim outcomes and findings
  in `claims`, fresh testbed measurements in `runs`, and `limitations`. Include
  the experiment's `id` as `experiment_id` on each run, along with exact units
  and evidence digests. Keep values extracted from the paper as
  reference values in `paper_value`. Leave `runs` empty if no trial produced
  eligible measurements and use the claim findings to explain coverage.
  Run the [local evidence check](testbed.md#check-the-saved-bundle) before saving.

Keep the original PDF and local evidence directory. Raw logs, credentials,
account details, private paths and unsuitable commands or scripts stay local.
The account owner reviews the exact assessment and attached PDF before public sharing.

## Download a Step 1 PDF

Call JumpServe's `download_assessment_pdf` with the `assessment_id` from the
prompt, using the same Google account that uploaded the PDF. If the connector
requests additional permission, reconnect JumpServe and approve PDF downloads,
then retry with the same ID. Existing sharing-only sessions retain their access
to saving and submitting assessments.

Pass the JSON result to the local download helper over standard input. Save the
PDF under the returned filename in the paper's private local directory. The
helper verifies the assessment ID, SHA-256, byte count, and PDF signature before
placing the file at the destination.

```sh
python3 "$SKILL_DIR/scripts/download_paper.py" --assessment-id "$ASSESSMENT_ID" --out "$PDF" < "$PRIVATE_TICKET"
```

Supply the ticket through private standard input and keep it out of logs,
the bundle, and the reply. Request a fresh ticket if the signed URL expires.
Use the verified PDF and retain the assessment ID when saving the result.

### Recover from a blocked PDF download

If DNS or sandbox access blocks the download, request native approval for the
exact helper invocation once it is clear that access is needed. Describe the
storage destination and local output while keeping the signed URL off the
command line. If the request is rejected before reaching the user, follow the
[approval recovery instructions](permissions.md#when-a-request-never-reaches-the-user).

The user can also open **Step 1** for the same assessment in JumpServe, sign in
with the original Google account, and click **Download PDF**. Ask for the path
to the resulting file in the local workspace. Use the connector's metadata for
the same assessment ID to verify and save it offline. The verification input
needs only `assessment_id`, `filename`, `sha256`, and `byte_count` from the
connector result. The signed URL and its expiry are irrelevant for this step.

```sh
python3 "$SKILL_DIR/scripts/download_paper.py" --assessment-id "$ASSESSMENT_ID" \
  --from-file "$USER_PDF" --out "$PDF" < "$PRIVATE_METADATA"
```

Continue after local verification succeeds. If permission and file access both
remain unavailable, save the handoff with the assessment ID and next action.

## Attach the existing Step 1 PDF

Set `paper.pdf_copy` to `true` in the saved bundle. Use the SHA-256 and byte
count of the verified Step 1 PDF. Pass its `assessment_id` alongside `bundle`
in `preview_assessment` and repeat the same ID on every retry. JumpServe checks
the identity against the connected owner's upload and attaches the existing PDF.
The private and public pages use the same ID. Keep PDF bytes and credentials
outside the bundle. If the user wants to keep the results or attachment out of
the saved assessment, retain the assessment bundle locally.

## Save and return the assessment

Once saving finishes, use `assessment_url` for
`already_shared` and `review_url` for `review_required`. The latter opens the
saved private assessment. Send only the exact completion message below as
plain text. Replace `{assessmentUrlHere}` with the selected URL. End the reply
immediately after the URL.

```text
Your research paper assessment is finished!

View the assessment online using the JumpServe app at the following URL:

{assessmentUrlHere}
```

On instances that ask the owner to return to the client after approving, use
`submit_assessment` with the same `preview_id` after the owner confirms they
approved public sharing. Use the same completion message with the confirmed
`assessment_url`. After a timeout or uncertain response, retry once with the
identical bundle for saving or the same `preview_id` for submission. A completed
private assessment and its recorded sharing approval have no time limit.
