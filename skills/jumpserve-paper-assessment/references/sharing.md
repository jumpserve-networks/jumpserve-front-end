# Deliver an assessment on JumpServe

Use the MCP connector registered for the user's chosen JumpServe instance.
Stage the completed JumpServe assessment without a separate sharing request.
Skip this step for local-only work. If the connector is unavailable or requires
sign-in, report the connection issue briefly and keep the saved bundle for
delivery once the connector is available.

## Assessment wizard fields

Supply only the fields in [the bundle schema](assessment.schema.json). Include
`wizard` in each new bundle so the preview and approved assessment show the
same three steps.

- **Step 2 · Paper Breakdown** uses `wizard.breakdown` for page-cited paraphrases.
  Assign each entry to `access`, `experiment`, `data` or `validate` and cite
  one-based PDF page numbers in `pages`. Put claims and their decision rules
  in `claims`. Identify paper-reported or fabricated values as such.
- **Step 3 · Experiment Steps** uses `wizard.experiments` for the ordered design.
  Link each experiment to its `claim_ids`. Write each step's `title` and
  `instructions` from the frozen procedure. Record any unresolved inputs or
  proposed design choices in the instructions. Use `methods` for module
  versions, acquisition procedures and validation reports.
- **Step 4 · Setup & Run Commands** uses the experiment's `prerequisites`,
  optional `setup` and `cleanup`, and `commands` on the step they implement.
  Include safe, shareable excerpts from the actual local experiment package.
  Use `command_notes` to identify drafted or unverified commands or explain
  why commands are unavailable. Record outcomes in `claims` and measured
  observations in `runs`, including exact units and evidence digests.

Keep original PDFs, full paper text, raw logs, credentials, account details,
private paths and any commands unsuitable for sharing in the local evidence
directory. The account owner reviews the exact material before public sharing.

## Stage and return the assessment

Call `preview_assessment` with the saved bundle JSON. Use `assessment_url` for
`already_shared` and `review_url` for `review_required`. The review page guides
the owner through approval. Use the following exact chat reply, replacing
`{assessmentUrlHere}` with the selected URL as plain text.

```text
Your research paper assessment is finished!

View the assessment online using the JumpServe app at the following URL:

{assessmentUrlHere}
```

On instances that ask the owner to return to the client after approving, use
`submit_assessment` with the same `preview_id` after the owner confirms they
approved the preview. Use the same completion message with the confirmed
`assessment_url`. After a timeout or uncertain response, retry once with the
identical bundle for staging or the same preview ID for submission. If the
preview expires, stage the saved bundle again and use the same completion
message with the new `review_url`.
