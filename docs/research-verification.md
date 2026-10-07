# Research Verification module

The public production release check is `npm run verify:research:production`. It
uses only the canonical JumpServe origin, never signs in or submits owner writes,
and preserves timestamped desktop/mobile evidence. Teaching queue downloads remain
synthetic. A successful public check does not establish Google owner execution.

The owner workspace now includes a dependency-aware claim queue. Claims retain
separate scientific assessments; campaigns execute bounded checks. Prerequisites
require complete recorded runs or accepted claim evidence. Slots, declared shared
resources, failed/expired attempts and original event history stay visible.
Automatic numerical jobs never upgrade claim labels. Source review and external
experiments remain manual, with existing domain runs attachable for review.
See `jumpserve-infra/docs/research-queue.md` for exact limits, commands and release
order. The public methods page includes a labelled synthetic queue example; its
display checks do not establish an authenticated owner request.

Shared routes and navigation live under `/module/research-verification`, defined
in `lib/test-modules.ts`. Public results read reviewed backend snapshots; Google
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

Use `npm test`, `npm run lint`, `npm run build` and `npm run verify:research` with the
isolated backend/database fixture described in
`jumpserve-infra/docs/research-workflow.md`. The verifier records desktop/mobile,
light/dark, charts, exports, navigation and missing/invalid states. It does not create
a legitimate Google session or establish a production storage round trip.

Production release requires an explicit deployment request for these changes and
the migration/API/frontend order in that infrastructure guide. See the versioned
implementation protocols and validation report for exact coverage and open checks.
