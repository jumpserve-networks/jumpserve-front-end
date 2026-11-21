# Share an assessment

Use the JumpServe MCP connector registered for the user's chosen JumpServe
instance. If it is unavailable, keep the assessment file locally and tell the
user that sharing requires connecting JumpServe. Use the connection settings
provided by that instance.

Supply only the fields in [the bundle schema](assessment.schema.json).
Use page references and paraphrases. Include command excerpts only when the
user wants to share them and they are safe to display. Omit original PDFs,
full paper text, raw logs, credentials, account details and private paths.

Call `preview_assessment` with `bundle` equal to the JSON object.
If it returns an existing assessment URL, report it. Otherwise present its
`review_url` so the user can review the actual page and approve sharing while
signed in to the same JumpServe account. After they approve, call
`submit_assessment` with the returned `preview_id`. Report the
`assessment_url` when the tool returns it. If the submission's outcome was
uncertain, retry that same preview ID before creating another preview. If the
preview expired, send a fresh preview and have the user review it again.
