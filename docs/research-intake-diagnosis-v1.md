# Research intake diagnosis, 2026-10-07

The reported workspace is `76c70fd9-0217-464e-8c26-0a47832409a3`.
Read-only inspection through the target-guarded Supabase Management API confirmed
project `regphejnlvfpyokpniny`, the existing IPv6 paper draft and its requested
scope, “All claims in paper.” Its recorded creation time is
`2026-10-07 21:06:54.352042+00`.

All inspected record counts were zero: sources, claims, protocols, configurations,
campaigns, claim checks, runs, queue jobs and queue events. These are database
counts from the inspection, not assumed empty states. Owner identities and
credentials were neither printed nor retained. No database, AWS or production
application changes were made during this investigation.

## Cause and remaining implementation gap

`PaperIntake` posts only paper metadata to `/research/studies`. The backend calls
`research_create_study`, preserving the draft and its owner. This path does not
retrieve the paper, extract claims, construct protocols/campaigns or enqueue jobs.
The queue endpoint requires an existing prepared campaign linked to applicable
claims. Consequently this study has no job definitions for a worker to execute.
This diagnosis does not certify worker health or rule out unrelated production
issues; worker behavior was not the failing boundary examined here.

The existing IPv6 bridge imports the prior source/claim register and nine gap
records. Its stated scope excludes new measurements and experiments, and it does
not create queue jobs. Reusing that register alone would not start a reassessment.

Automatic paper preparation remains unimplemented. A full remedy must connect
resource retrieval, substantive claim review, domain-appropriate plans, frozen
protocols, exact input availability and explicit campaign enqueueing. It must
retain missing dependencies and distinguish manual work from executable checks.
The local interface correction below does not implement this orchestration and
does not resolve the user's expectation of automatic assessment.

## Local interface correction

- Name intake and navigation “Create Study Draft” and explain before submission
  that no jobs start from paper metadata alone.
- Show source, claim, configuration, protocol and campaign preparation counts in
  the workspace, including applicable campaign links and the next missing step.
- Open the relevant workspace editor from the next-step button.
- Preserve the distinction between recorded setup, available inputs, queued
  execution and scientific findings. Orphaned or inapplicable campaign links do
  not satisfy the displayed preparation counts.
- Include a labeled synthetic empty-study example in the public methods page.

The user's live draft remains unchanged. No previous assessments were imported,
no experiments were started, and no scientific labels were changed.

## Verification

Commands from the frontend repository:

```sh
npm test
npm run lint
npm run build
npm start -- --port 3004
npm run verify:research -- --intake
```

All 122 tests, lint, the corrected production build and the two scoped browser
check groups passed. The first build found a TypeScript `never[]` inference in
the new empty-study example; explicitly typing its arrays corrected it, and the
next build passed. Existing module-type warnings during tests remain unchanged.

Browser evidence is in
`.test-artifacts/research-workflow/2026-10-07T21-27-57.534Z-browser-report.json`
and its four preparation screenshots. Checks covered 1365-pixel desktop and
390-pixel mobile views, light/dark themes, zero preparation counts, no implied
queue jobs, horizontal layout bounds, console errors and actual sign-in return
paths. The preparation display used a labeled synthetic example, not a forged
Google session or the user's authenticated workspace. All inspection was by the
Codex AI implementer; no independent or human review is asserted.

Conditional gaps: authenticated owner controls and the full Google provider
round trip were not exercised. The Chrome connector could not attach because its
profile was already in use; an isolated headless browser performed the public
display checks. There was no deployment or deployed-interface verification.
Compute/model/storage charges were not reconciled; missing usage is not zero.

The local correction has not been pushed or deployed. The repository's current
deployment rule requires a new explicit deployment instruction for these changes.
