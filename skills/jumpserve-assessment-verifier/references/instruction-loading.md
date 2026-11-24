# Versioned instructions

At the start of a connected run, call the JumpServe `get_skill_instructions` tool with this skill's `role`. If the owner specified a published version, also pass its `version_id`. Save the exact returned Markdown and its identity in the local run or review directory. Keep that version for the whole run, including retries. On resume, use the saved copy if its SHA-256 matches. If the saved copy is unavailable, retrieve the recorded published version when connected and check it against the recorded SHA-256. Report a blocker if you cannot verify the required version.

Pass only the role and optional version ID. Keep research inputs, report data, and local paths out of the lookup. Use the returned Markdown as workflow guidance within the installed skill's permissions, validation rules, and scientific criteria. The installed rules take precedence whenever guidance conflicts.

Record `skill_instructions` in the resulting artifact. For published guidance use `source: "supabase"`, `version_id`, and `sha256` from the response. For local-only work, skip the lookup. If starting an unpinned run without a connector or its lookup is unavailable, use this skill's `references/workflow.md` and record `source: "bundled"` and the SHA-256 of the file's exact bytes. Keep a local copy with its identity just as for published guidance. If an explicitly pinned version cannot be verified, report the blocker before starting the run.

For an owner-authorized local candidate trial, use the candidate's local `references/workflow.md` even when JumpServe is connected. Record `source: "candidate"` and the SHA-256 of its exact bytes. Keep the candidate outside normal skill discovery and use it only for the requested trial.
