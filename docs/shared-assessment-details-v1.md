# Shared assessment details v1

The user authorized making recorded paper-assessment content readable by everyone.
There is one assessment queue at `/research-verification/experiment-queue?assessment=<id>`.
Legacy `view=private` links permanently redirect to it, preserving other query
values. This amendment replaces the earlier owner-only prompt/history view.
The queue index remains the authenticated user's personal listing; previous
assessments provide the public paper inventory. Research ideas are unaffected.

Signed-out readers can inspect task prompts, responses, evidence, usage and failed
calls through **View prompts and responses**. **View assessment records** exposes
the initial paper request, task context, sources, protocols, configurations,
campaigns, checks, jobs, events, runs, published values, measurements, summaries,
scientific assessments, gaps, reviews, publication history and artifact metadata.
Original private file downloads, account data, access credentials and private
storage locations remain protected. All mutations retain Google/owner checks.

Read-only APIs:

- `/research/studies/{id}/queue?public=1&records={kind}&after={uuid}&limit=25`
- `/research/studies/{id}/autonomy?public=1&task={task_id}&before={turn_number}`

Only explicit record kinds and paper/task identities are accepted. No anonymous
SQL grants, RLS changes, new tables, mutation RPCs or artifact-byte reads are
introduced. Profiles, owner/audit identity tables and arbitrary table selection
are unavailable. Model turns are loaded only after a reader opens them; ordinary
status polling does not repeatedly fetch full prompts or responses.

Record pages default to 25 rows, maximum 100. Turn pages return up to 10 rows and
report the recorded attempt counter separately. Readers exhaust small server
page caps, use monotone identity/attempt cursors and reject mismatched coverage.
Each transformed document is bounded to 4 MB, 100,000 nodes, depth 40 and 100,000
characters per text value. Oversized structures fail explicitly; text omissions
and redactions are counted and labeled. Missing responses and costs remain null;
recorded zero stays zero. Empty history with a nonzero counter is explicitly unknown.

Structured credential/account/storage keys and recognized secret/contact/path/URL
formats are redacted recursively. Plain bibliographic URLs without query credentials
remain visible. This is format-based protection, not complete privacy review of
arbitrary text. Original records remain unchanged; displayed hashes refer to
those originals, not transformed JSON or text. UI strings are escaped JSX and
plain JSON, never interpreted as HTML, instructions or executable experiments.

## Development verification protocol

Before the v9 browser campaign, require:

1. Backend identity/pagination tests: anonymous paper records and task histories,
   failed calls, original hashes, zero versus missing values, source URLs, small
   server caps, unknown kinds, idea denial and unchanged source bytes/objects.
2. Backend redaction/limits tests: nested credentials, account identities, private
   file paths, untrusted prompt text, missing/invalid records and structural bounds.
   Public reads must not call ownership checks, authentication, mutation RPCs or
   artifact-byte retrieval. Existing write denials remain tested.
3. Frontend tests: fixed anonymous GETs, no cookies/tokens, strict identity and
   cursor checks, unsupported selections, explicit transformation metadata,
   missing fields and legacy private-link normalization.
4. Production build/TypeScript and lint, recording existing unrelated warnings.
5. Actual Next page -> actual Python API -> synthetic store in a signed-out local
   browser: inspect all 12 fixture turns across pages, initial request, configuration
   units/zero/null, events, redacted credentials, missing turns despite a nonzero
   counter, legacy redirects, retained write sign-in paths and desktop/mobile
   light/dark views without overflow or page errors.

Commands: `npm test`, `npm run lint`, `npm run verify:research:public-queue`, and
`python3 -B -m unittest discover -s research_workflow/tests -v` in the backend.
Reports and failed attempts remain in `.test-artifacts/`. The implementer is an
AI reviewer, not an independent or human reviewer. No new scientific experiment
or model call is part of these checks; measured local charges are unavailable.
These are development regressions, not held-out scientific or live-auth validation.

No deployment is authorized by a routine editing turn. A later explicit release
must deploy the backend before the frontend, then verify production anonymous
detail reads and authenticated owner write controls when a legitimate session
is available. Original PDFs and private artifact storage are not made public.
