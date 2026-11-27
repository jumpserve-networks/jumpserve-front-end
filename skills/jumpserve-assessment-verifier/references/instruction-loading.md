# Load published guidance

Start each new run with JumpServe's `get_skill_instructions` tool. Pass the skill's `role` and, when the owner requests a particular published revision, its `version_id`. The lookup sends only this metadata. Local-only work still fetches guidance and keeps its inputs and results in the workspace.

Save the returned Markdown and its identity in the run directory. Verify the SHA-256 over the exact UTF-8 text. Use that revision for the entire run. Record `skill_instructions` with `source: "supabase"`, `version_id`, and `sha256` in the output. On resume, verify and use the saved copy, or retrieve the same version by ID and verify its checksum. If the required version cannot be loaded and verified, report the blocker before starting or resuming.

A hosted batch worker receives the coordinator's verified, pinned Markdown and its provenance with the job. Use those inputs for the assigned run. The installed permission, evidence, and validation rules govern every revision.
