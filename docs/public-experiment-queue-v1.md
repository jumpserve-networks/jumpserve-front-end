# Shared paper queue status v1

Opening `/research-verification/experiment-queue?study=<id>` is public and
read-only, including before an assessment is published. The exact paper link can
be shared with signed-out visitors and other users. It shows the paper title,
source-grounded candidate claim text, recorded task stages/findings, attempt
counts, timestamps, check coverage, budget commitments and experiment statuses.
Candidate inventory is not a complete paper review; job execution is not a
scientific verdict. Commitments are not measured charges.

The base queue without a study remains the signed-in owner's overview. Add
`&view=private` to a study link to access the existing owner queue and prompt
history. Sign-in preserves that full return path. Launch links with `sourceStudy`,
`gap` or `run` still require authentication and existing owner checks.

The public browser sends only `GET /research/studies/{id}/queue?public=1`, without
cookies or an access token. This uses an explicit backend projection rather than
anonymous SQL access to private tables. It does not list other studies, expose
unpublished research ideas, or return owner information, prompts, responses,
uploaded PDFs, raw inputs, artifact paths, resource identifiers, private event
history or free-form failure/requirement text. Public status explanations are
general summaries; owners retain the full recorded reasons. No RLS/grant or
database schema changes are required. No new infrastructure routes are required.

Reads exhaust bounded pages, fail on coverage/identity errors and reject more
than 1,000 jobs/tasks or 4 MB, rather than silently truncate. Counts are separate
reads, not an atomic snapshot. Polling is serial every ten seconds. Missing run
status remains missing. Failed polling marks retained data stale; an initial
failure never becomes zero counts. Public viewing never launches or retries work.

## Verification protocol, declared before the browser campaign

Release-blocking development checks:

1. Backend tests admit anonymous per-paper status, preserve failed/partial and
   unresolved findings, exhaust capped pages, and reject unknown/idea studies,
   missing claim identities and coverage overflow.
2. Private-field canaries are absent from the serialized public response. Owner
   listings, raw history and writes still reject anonymous/foreign access. Public
   SQL reads of private relations remain prohibited.
3. Frontend tests reject private payloads, altered study IDs, incomplete coverage
   and invented conclusive findings; the transport sends no credentials or writes.
4. TypeScript production build, frontend tests and lint pass (existing unrelated
   lint warnings are recorded).
5. The actual local Next page in a fresh anonymous browser reads the actual
   Python API handler backed by explicitly synthetic store records. It shows
   preparation, mixed claim findings, failed/partial/missing-run jobs, polling,
   filtering, stale, empty, invalid and unavailable states. Check 1365x900 and
   390x844 light/dark layouts, no page errors or horizontal overflow, and no
   browser calls to owner-private endpoints. Verify private/action links retain
   their sign-in return paths. Fixture data is not a scientific experiment or a
   legitimate authenticated session.

Commands:

```sh
# jumpserve-back-end
python3 -B -m unittest discover -s research_workflow/tests -v
# jumpserve-front-end
npm test
npm run lint
npm run build
npm run verify:research:public-queue
```

Reports and original failures stay in `.test-artifacts/public-experiment-queue/`.
Review is by the AI implementer, not independent or human review. No model calls
or experiment launches are part of this check; hosting charges are unknown.

Production is conditional on an explicit deployment request for this change.
Release the pinned backend runtime before the frontend, then verify an anonymous
shared link against production data, private API denials and a legitimate owner's
private view when a session is available. Until that release, production access
rules remain unchanged. Existing scientific records and budgets are not changed.
