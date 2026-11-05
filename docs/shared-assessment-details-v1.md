# Shared assessment details v1

The user authorized making recorded paper-assessment content readable by everyone.
Each `/research-verification/assessment/<id>` page includes its **Experiment Queue**
section at `#experiment-queue`. The overview and queue share one serial status
refresh every ten seconds. Saved `/experiment-queue` and module queue links with
`assessment=<id>` or `study=<id>` permanently redirect to that page. `job=<id>`
links preserve the focused job and its anchor; repeated unrelated query values
are retained. Conflicting, repeated or malformed identities return 404 without
reading assessment data. The standalone queue page and sidebar entry are retired;
queue links without an assessment open `/research-verification/assessments?mine=1`.
Legacy `view=private` links use the same shared view. This amendment replaces the
earlier owner-only prompt/history view. Research ideas are unaffected.

Gap experiment links use `/research-verification/assessment/<id>?gap=<gapId>`
and retain `run=<requestId>` for a sign-in return. They still require Google
authentication and backend owner checks. A pasted or prefetched URL cannot
authorize a launch; the existing one-time same-tab intent is required to resume
an action after sign-in.

After an authorized deployment, run
`npm run verify:research:assessments:production -- <merge-revision>` to check the
exact production version, Table/Card views, inline queue, saved-link redirects,
sign-in return paths and desktop/mobile themes using public reads only.

The inventory at `/research-verification/assessments` defaults to Table view,
showing assessment/authors, status, initiator and submission date. `view=card`
shows the same records as cards. Both cards and table rows open the singular
`/research-verification/assessment/<id>` overview. `name` filters recorded titles,
authors and initiator display names, ignoring case, accents and repeated spaces.
It searches successive catalogue pages rather than only the displayed page.
`mine=1` retains the existing authenticated owner membership checks. View/name
choices survive pagination and scope changes; changing the name or scope resets
the cursor. These query parameters are shareable and survive reload/back.

Filtered pages retain ten matches and use the last displayed match as their
keyset boundary; lookahead cannot skip matches on the same underlying page.
Missing bibliography uses the existing bounded metadata endpoint with two
concurrent reads. Filtering is bounded to 100 catalogue pages and 30 seconds;
failed or incomplete reads show an error, never an incomplete "no matches" result.
This adds no database grants, model calls, assessment changes or write endpoints.

The assessment overview shows **Choose central claims and testable findings**
when the saved paper preparation status is `ready`. It opens the existing
`/research-verification/new-assessment/<id>` review for that assessment. Preparing,
failed, confirmed and unknown preparation states do not show this action; polling
removes it once scope is confirmed. The destination retains Google sign-in and
owner checks, and sign-in preserves the exact review URL. The link does not
select claims, confirm scope or start experiments automatically.

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
