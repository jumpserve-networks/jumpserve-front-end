# Research Verification module

Each `/research-verification/assessment/<id>` page includes its **Experiment Queue**
with claim history, repair progress and recorded experiment jobs. Published gap cards hand off to a
private, resumable follow-up with retained checks. See
[the queue workflow and verification protocol](experiment-queue.md) for supported
plans, status semantics, limits and conditional release checks.

Assessment pages are public read-only, including recorded prompts and responses.
Saved queue URLs redirect to the matching assessment; the standalone queue and
sidebar entry are retired. Follow-up experiment actions retain Google sign-in
and backend authorization. Credentials and original private files remain protected.
See [shared assessment details](shared-assessment-details-v1.md).

After an authorized release, run
`npm run verify:research:assessments:production -- <merge-revision>` for a public
read check of the released revision, assessment navigation and the inline queue.

The owner workspace now includes a dependency-aware claim queue. Claims retain
separate scientific assessments; campaigns execute bounded checks. Prerequisites
require complete recorded runs or accepted claim evidence. Slots, declared shared
resources, failed/expired attempts and original event history stay visible.
Automatic numerical jobs never upgrade claim labels. Source review and external
experiments remain manual, with existing domain runs attachable for review.
See `jumpserve-infra/docs/research-queue.md` for exact limits, commands and release
order. The public methods page includes a labelled synthetic queue example; its
display checks do not establish an authenticated owner request.

Paper verification routes and navigation live under `/research-verification`.
Unpublished ideas belong to the separate `/research-ideas` module. Both are
defined in `lib/test-modules.ts`; see [Research pathways](research-pathways.md).
Public results read reviewed backend snapshots; Google
authentication protects intake and owner workspaces. The backend owns identity,
authorization, freeze times/hashes, adapters and publication controls.

Set `NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL` to the benchmark HTTP API **origin**,
without `/research`, before building. The existing benchmark-origin variable is
the fallback. Missing services and invalid snapshots show unavailable states;
they never become zero-valued results. Original artifacts and owner/audit identities
are excluded from public JSON and CSV exports.

Results distinguish published values, reproduced measurements and claim assessments.
Plots use categorical observation identities, separate units and descriptive points;
they do not imply time order, independent samples or confidence intervals. Non-recorded
values have no measured point. Configuration/metric filters and page limits are
explicit; exports contain the full bounded snapshot or fail without truncation.

The workspace creates sources/claims/configurations/campaigns/check mappings,
protocol versions, assessments, gaps and reviews. Execution records come from the
bounded runner or trusted external importer. New evidence requires new scope/software
reviews before publication. Reviewer identities and human/AI independence are declared
provenance. Generic AI chat is not enabled; imported studies link to their own existing
evaluated chat and source measurements.

Use `npm test`, `npm run lint` and `npm run build` for local checks.
`npm run verify:research:public-queue` checks the current assessment and queue
pages in a browser using synthetic backend records. The isolated database test
in `jumpserve-infra/docs/research-workflow.md` checks publication and access rules.

Production release requires an explicit deployment request for these changes and
the migration/API/frontend order in that infrastructure guide. See the versioned
implementation protocols and validation report for exact coverage and open checks.
