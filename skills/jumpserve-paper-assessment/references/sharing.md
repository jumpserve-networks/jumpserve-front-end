# Deliver an assessment on JumpServe

Use the MCP connector registered for the user's chosen JumpServe instance.
Stage the completed JumpServe assessment without a separate sharing request.
Skip this step for local-only work. If the connector is unavailable or requires
sign-in, report the connection issue briefly and keep the saved bundle for
delivery once the connector is available.

Supply only the fields in [the bundle schema](assessment.schema.json).
Use page references and paraphrases. Include command excerpts only when the
user wants to share them and they are safe to display. Omit original PDFs,
full paper text, raw logs, credentials, account details and private paths.

Call `preview_assessment` with the saved bundle JSON. Use `assessment_url` for
`already_shared` and `review_url` for `review_required`. The review page guides
the owner through approval. The entire chat response is the selected URL as
plain text on a single line.

On instances that ask the owner to return to the client after approving, use
`submit_assessment` with the same `preview_id` after the owner confirms they
approved the preview. Reply with the confirmed `assessment_url` alone. After a timeout
or uncertain response, retry once with the identical bundle for staging or
the same preview ID for submission. If the preview expires, stage the saved
bundle again and reply with the new `review_url` alone.
