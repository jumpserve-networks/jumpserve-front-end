# Research preparation implementation v1

This replaces the implementation gap recorded in
[research-intake-diagnosis-v1.md](research-intake-diagnosis-v1.md); that earlier
diagnosis and its limited UI-only verification remain unchanged as history.

The actual flow is now study intake -> owner preparation -> retained original
plan/compiled artifact -> frozen protocols and campaigns -> each immutable queue
job -> existing bounded workers -> separately reviewed scientific findings.
Existing drafts can start or resume this flow in their workspace. Successful
HTTP responses must confirm exact job/study/campaign/mode identity before the
client counts a job as saved. Interrupted requests retain prior progress and do
not restart failed/cancelled/expired jobs.

IPv6 has an exact registered source-grounded plan: six archived numerical checks
and 14 operator follow-up preparation tasks, covering all 15 recorded claims.
Other papers need a reviewed uploaded domain plan; AI extraction and arbitrary
experimental execution are not enabled. Numerical agreement of retained means
adds no independent evidence and automatically changes no assessment label.

Verified: 126 frontend tests, lint and production build; actual component/helper
browser cases for interrupted/resumed queueing, explicit missing-plan states,
oversized/schema-refused uploads and mobile/desktop light/dark layouts. The
component used a labeled, fixed synthetic transport. Public preparation guidance
and real sign-in return paths passed in the actual Next.js app. No legitimate
Google session or authenticated production request was exercised.

Backend verification: 60 tests. Infrastructure: 79 passed tests, five existing
benchmark CLI tests skipped without their optional external executable; ten
research route/resource tests additionally passed with the final staged runtime.
Infrastructure build passed. An actual isolated PostgreSQL 17 campaign passed
12 groups including RLS/owner isolation, atomic rollback, concurrent preparation,
resumption and six real worker executions with 1,152 matched cells. Artifact
Storage used a local byte transport; source access/review declarations remained
imported declarations, with no claim of renewed complete literature review.

The full protocol, migrations, source manifest, operator commands, privacy
checks and release order are documented in
`jumpserve-infra/docs/research-preparation.md`. Versioned reports and local raw
artifact hashes are in `jumpserve-infra/docs/research-preparation-validation`.
The initial local fixture bind failed under sandbox permissions and is preserved
there; its approved elevated rerun passed. Reviews are AI implementer inspections,
not independent human or held-out validation. Charges are unallocated/missing,
not measured zero. No new model evaluation or cloud experiments were run.

Release status: local implementation and declared local checks complete.
Production remains unchanged, including workspace
`76c70fd9-0217-464e-8c26-0a47832409a3`. The production migration, API/frontend
deployment, remote Storage round-trip, deployed scheduler and legitimate owner
request remain pending. The repository AGENTS.md requires a new explicit
deployment instruction for current changes. Pin the exact backend commit before
release; the current runtime manifest pins working-tree bytes and explicitly
labels its source revision as the pre-change baseline.

The unrelated staged PDFs were left untouched.
