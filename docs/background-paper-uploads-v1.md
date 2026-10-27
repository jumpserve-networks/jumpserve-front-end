# Background paper uploads and review notices v1

After selecting PDFs at `/research-verification/new-assessment`, **Upload**
adds independent uploads to the shared root-layout provider. It resets the picker
and leaves the current route in place. Users can select another batch or navigate
through the site while transfers and paper preparation proceed. Up to three file
transfers run concurrently; each selection supports 20 PDFs, up to 10 MB each.
The browser manager bounds its session history to 100 uploads.

Each file receives an independent immutable request ID. A retry uses the same ID
and original `File`, preserving the existing upload reservation, byte hashing and
server verification. The backend already saves originals, preparation state and
extracted claims in Supabase and runs preparation independently of the browser.
This feature reuses that implementation and adds no database migration, anonymous
access grant or new experimental execution path. Experiments still require the
owner's explicit confirmation of title, domain and selected claims.

The provider queries the authenticated `/research/studies?mine=1&status=1` listing every
10 seconds. A recorded `ready` review creates a lower-right **Paper ready for
review** card with a link to the matching review route. Cards are not timed out or
dismissed by unrelated navigation. Clicking **Review
paper** opens that paper and dismisses its card; the close button also dismisses
it. Confirming that paper also closes its review card and starts its assessment
status card. Other papers' cards stay open. Preparation/upload failures have an attention card;
status outages stay distinct from readiness.

Notifications are scoped to the current authenticated user. Backend requests keep
the existing token verification and ownership checks. A browser account check
also prevents old upload work from obtaining a new owner's token. Account changes
abort pending requests, stop queued transfers, and remove old-owner notices from
the rendered view. Already transmitted bytes cannot be recalled.

The backend listing restores pending/ready papers after reload, including papers
prepared while the browser was closed. Browser `localStorage` retains only notice
IDs, kinds and dismissal preferences, separately per user; it stores no PDF bytes,
titles, tokens or signed URLs. Dismissals synchronize across tabs. They are a
browser preference, not a database notification record, and do not synchronize
across devices. Storage failures produce an explicit persistence warning.

Keep the tab open until file transfers finish: client navigation preserves the
provider, while a full tab close/reload can interrupt a transfer. A `beforeunload`
guard requests the browser's standard warning during queued/active transfers.
After server admission, preparation continues without the page. No operating
system push notification is sent while the site is closed. The existing owner
listing's limit of 100 assessments remains; an exceeded or unavailable listing
reports an error instead of inventing an empty queue.

## Verification

```sh
npm test
npm run verify:paper-uploads
./node_modules/.bin/tsc --noEmit --incremental false
```

Unit checks cover concurrency, immutable retries, preparation versus readiness,
retained notices through confirmation, reload restoration, cross-tab dismissals,
account isolation, Strict Mode restarts, malformed responses and invalid PDFs.

The fixed Playwright campaign uses the actual shared provider, preferences,
upload/review components and browser request adapter with loopback HTTP auth,
storage and extraction fixtures. It verifies exact transferred bytes, navigation
during uploads, two independent papers, persistent review notifications, matching
metadata and source references, explicit confirmation, reload/dismissal behavior,
status outage/recovery, and desktop/mobile light/dark layouts. It blocks external
requests and retains successful and failed reports and screenshots under
`.test-artifacts/paper-uploads/`. The Next navigation layer is stubbed; this is a
development regression check by the implementing AI, not independent scientific
validation or a legitimate Google/production end-to-end test. Real model calls
and remote writes are zero in this campaign; local resource charges are not
measured. The existing PostgreSQL-backed autonomy browser campaign is updated to
use the new provider and review notification before confirmation.

## Assessment status cards

The same root-layout provider now shows progress during preparation and after
confirmation, following Funnybone's caption progress/completion pattern. Cards
show the paper title, recorded claim counts, queued/running states and a direct
link to that assessment's Experiment Queue. They remain across navigation and
reloads. Closing a card or opening its queue hides only that card; it sends no
cancellation request. A later completion creates a separate notification even
when progress was dismissed. Completed assessments with gaps, spending/time
limits and cancellation have distinct headings; none imply every claim was
reproduced. An indeterminate activity indicator does not estimate elapsed time,
percentage completion, or scientific confidence.

The opt-in backend listing adds `research-assessment-status-v1`, an owner-only
projection of existing Supabase workflow/task records. It excludes research
ideas, owner details, scopes, PDF paths, prompts and responses. Counts exclude
the intake task and are grouped by assessment identity. Reads paginate by task
UUID through at most 20,000 tasks and 41 pages; exceeded or invalid coverage is
an error, not a partial successful count. The ordinary owner-list API remains
unchanged. No new database table, migration, experiment or model call is needed.

Active assessments restore from the server. Completions restore for papers that
this browser previously tracked, including work finished while the tab was
closed; historical completions do not flood a new browser with popups. Local
preferences add only tracked IDs and dismissed phase keys to the existing
per-user schema. Closing progress does not suppress the later completion card.
Unavailable or invalid status retains the last record with an explicit stale
warning. A missing summary is unknown, whereas a recorded zero claim count
remains zero.

When an older backend omits the status-summary version, confirmed papers without
a summary use the existing `/research/studies/{id}/queue?public=1&diagnostics=1` projection.
Only identities from the authenticated owner listing are queried. These fixed
public GETs omit cookies and authorization and expose no private prompts or raw
inputs. At most two reads run concurrently, within the 100-paper owner-list bound.
Complete validated task coverage is required before deriving counts, using the
same grouping as the backend summary and excluding the intake task. An intake
task can be resolved with no scientific label; a resolved scientific claim still
requires `reproduced` or `discrepant`. Missing workflows remain unknown; invalid
or over-limit snapshots never become partial successful counts.

Fallback failures retain and mark that paper's last progress while other papers
continue to update. Unknown summary versions fail closed. New backends use the
batched summary directly, including explicit nulls for missing workflows. Terminal
fallback summaries are cached in memory for at most 60 seconds to avoid repeatedly
reading historical queues; active assessments refresh each poll. Starting an
assessment invalidates its cache; account changes clear it. No status, title or
credential is added to browser persistent storage. This is a frontend compatibility
fix; it does not require a backend deployment.

The browser regression additionally covers in-progress cards for multiple
papers, claim counts after confirmation, navigation/reload, exact queue links,
status outage/recovery, dismissal without cancellation, independent completion
with gaps, account isolation, and assessment-card layouts at 1365/390 pixels in
light/dark modes. Backend checks independently exercise the real API projection
with mocked relation reads, pagination under small page caps, privacy, duplicate
and invalid records, and absent versus zero inventories. These are software
regressions, not live scientific experiments or a production release.

## Paper authors

My Assessments and Previous Assessments show authors beneath the paper title,
preserving source order. Authors are bibliographic metadata, never inferred from
the uploader's Google account. Preparation stores a `paper-authors-v1` record
with names, first-page location and derivation method inside the existing private
review metadata. Original PDF bytes and prior text packets remain unchanged.
New text extraction additionally retains the optional PDF `/Author` information
in its private packet. No prompt/output schema, scientific finding, database
table or permission is changed.

Names come from recognizable first-page bylines next to affiliation text, or PDF
author metadata corroborated by that first-page block. Affiliations, email
addresses and uncorroborated document-creator names are excluded. This is a
conservative display derivation, not independent authorship verification or a
complete review. Unrecognized, scanned, complex or extended author layouts can
remain unavailable; this feature performs no OCR, XMP parsing or external author
lookup. Lists are bounded to 100 names of at most 200 characters each.

Saved bylines are returned with the list; older uploads use a bounded metadata
lookup with two requests in flight per page. Retained text reads verify the
assessment identity, original-PDF hash, packet size and packet hash, sharing the
existing title cache. Missing/failed bibliographic reads leave the assessment
visible and show **Authors unavailable**. The owner list selects only
`metadata->authors` from review metadata for this field. Public list/title reads
opt in with `bibliography=1`, project only names, and keep the old default public
response shapes compatible with existing clients. Raw packets, PDF paths,
private reviewer details, owner identifiers and contact details stay private.

The browser campaigns verify both lists in desktop/mobile light/dark views,
matching author order, missing-author states, saved bylines without PDF reads,
and authors derived from a retained packet through the actual public API
handler. Synthetic auth/storage fixtures remain development evidence; the new
frontend/backend pair has not been deployed or validated on a live assessment.

## Assessment initiators

Previous Assessments adds **Initiated by** from the immutable `intake` audit
record's actor and that account's current first/last name in `profiles`. This
identifies the assessment initiator separately from paper authors and the
current viewer. It is a current display name, not a reconstructed historical
name snapshot. Missing intake records, conflicting actors, absent profiles,
blank names or invalid name values show **Name unavailable**.

The public catalogue opts in with `initiator=1`. Its response adds only a nullable
`initiated_by` string; it never returns actor/profile IDs, emails, timezones,
audit details or other profile fields. Existing default response shapes remain
compatible. Intake reads are scoped to the current page and bounded to 100
records; profile reads are limited to the corresponding unambiguous actors and
select only identity plus name columns on the server. Profiles and audit tables
stay private, retain RLS and receive no new browser grants. No database migration,
model call or experiment execution is required.
