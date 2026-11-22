# Deliver an assessment on JumpServe

Use the MCP connector registered for the user's chosen JumpServe instance.
Stage the completed JumpServe assessment without a separate sharing request.
Skip this step for local-only work. If the connector is unavailable or requires
sign-in, give the user the local bundle link and the connection issue. Resume
delivery with the saved bundle when the connector is available.

Supply only the fields in [the bundle schema](assessment.schema.json).
Use page references and paraphrases. Include command excerpts only when the
user wants to share them and they are safe to display. Omit original PDFs,
full paper text, raw logs, credentials, account details and private paths.

Call `preview_assessment` with the saved bundle JSON. If the result is
`already_shared`, return the `assessment_url`. For `review_required`, return
the `review_url` as **View results on JumpServe**. Tell the user it opens a
private preview in their JumpServe account, where they can approve public
sharing and open the public assessment. Keep the bundle locally and use the
link in place of a terminal report unless the user asks for one.

On instances that ask the owner to return to the client after approving, use
`submit_assessment` with the same `preview_id` after the owner confirms they
approved the preview. Return the confirmed `assessment_url`. After a timeout
or uncertain response, retry once with the identical bundle for staging or
the same preview ID for submission. If the preview expires, stage the saved
bundle again and give the owner the new review link for fresh approval.
