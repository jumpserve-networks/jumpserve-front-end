# Source-bound experiment design

Implemented and corrected locally on 2026-10-17–18. The reviewed v6 candidate is
eligible for publication under the exact archived-answer replay gate. See
`jumpserve-infra/docs/claim-experiment-design-followup-v3.md` for the current
validation and `docs/claim-design-release-protocol-v1.md` there for release order.
Deployment receipts record the production state separately from local evidence.

Every recorded paper claim has a **Design an experiment for this claim** link.
For a current gap with no retained plan, **Run experiment now** opens the same
designer instead of ending at the unsupported-plan message. Existing retained
plan execution is preserved.

The designer creates or resumes an owner-private paper workspace, retaining the
exact claim/source/gap context. A recent explicit click can start its first AI
proposal; navigation, prefetch and reload alone cannot invoke AI. It asks tailored
questions, offers a complete proposed plan, and saves owner adoption as a new
version. Original scientific assessments are unchanged.

The steps are proposal, saved plan, fresh comprehension/critic reviews, accepted
readiness, frozen protocol, and queued experiment. Current-packet and protocol
gates are enforced in the backend and SQL. Supported networking specifications
use the existing automatic runners. Other domain work remains an explicit
operator task; a plan is not a measurement or claim finding. Known source bytes
must be identified before automatic execution. Source retrieval, full-text review
and claim extraction are separate work; the planner reads recorded metadata.

Routes:

- `/research-verification/design-claim/<studyId>/<claimId>` selects any claim.
- `/research-verification/experiment-design/<privateStudyId>` resumes planning.
- My Workspace links designs to their planner and preserves the paper pathway.
- Experiment Queue shows prepared jobs; original evidence remains available in
  the evidence workspace. Planning downloads include source context, versions,
  model attempts, failures, prompts, usage and hashes.

Reproduce local software verification:

```sh
# jumpserve-front-end
npm run lint
npm test
npm run build

# In another terminal, jumpserve-infra, with the isolated PostgreSQL fixture running
python3 -B test/serve_research_ideas_fixture.py --claim-design

# jumpserve-front-end; fixed loopback fixture, synthetic auth/AI/cloud dispatch
node scripts/verify-claim-design.mjs
```

The browser fixture checks the real components, API adapters, backend, agent and
SQL. It verifies queue persistence, rather than launching cloud experiments.
Actual Next.js routes are separately checked for unauthenticated sign-in returns.
A legitimate authenticated production flow and cloud execution are not verified.

The thirteen migrations live in `jumpserve-infra/database/2026101700*`. Six prompt
candidates and all failed evaluations remain archived. Only v6's exact reviewed
corrected replay passes the publication gate: 20/20 recorded-answer checks, with
the original live pipeline still recorded as 19/20. These are AI-reviewed exposed
development checks, not independent validation or scientific claim findings.
