# Paper experiment queue

Current behavior is amended by [the direct-run workflow v2](experiment-queue-run-now-amendment-v2.md)
and [backend compatibility v3](experiment-queue-compatibility-amendment-v3.md).
The original selection workflow and protocol below remain as version history.

From a published assessment's **Evidence gaps & next experiments** view, choose
**Choose experiment to queue**. Sign-in preserves the exact study/gap link. The
Experiment Queue page previews retained checks before any write, then creates an
owner-private follow-up, preserves the registered plan and queues only the chosen
check and its transitive prerequisites. The original assessment is unchanged.

The current source-grounded plan registry covers the IPv6 paper. Other papers,
changed source versions and unmatched claims explicitly require preparation of a
domain campaign. This handoff does not invent an executable experiment when a
plan or required inputs are unavailable. Manual checks are operator tasks, not
automatically executed network measurements. Existing owner-workspace campaign
jobs, including networking jobs, also appear in the overview.

**Experiment Queue** in the paper sidebar lists the authenticated user's jobs
across paper studies. It refreshes serially every ten seconds, supports study and
status filters, links to recorded evidence/event history and exports private JSON.
Queued, blocked, running, operator work, awaiting review, reviewed, failed,
cancelled and expired states remain distinct. Execution never upgrades a claim.
On read failures the last retrieved status is labelled stale. Missing or invalid
coverage is an error, not an empty queue. Overview bounds are 100 owned studies,
1,000 jobs and 4 MB; exceeding a bound returns an error without truncation.

The read-only overview is `GET /research/queue`. Gap selection uses authenticated
`GET/POST /research/studies/{id}/gap-experiments`. The backend authorizes access to
the source assessment and derives follow-up ownership from the verified actor.
Source/claim/gap hashes and the registered plan hash bind the preview to enqueue.
The same owner, gap version and plan resume the same study/jobs even after a lost
response. Changed selections require a fresh preview. Study creation, preparation
and enqueueing use separate bounded requests, preserving progress on failure.
Private raw provenance and plan/input bytes use existing hash-verified storage.
No database migration or browser service credential is needed.

## Development verification protocol v1

These are exposed software regressions, reviewed by the AI implementer, without
independent or human review. They do not validate scientific claims.

Release-blocking checks for this feature:

1. TypeScript production build, lint and frontend unit tests pass.
2. Backend tests reject unauthenticated access, private foreign studies, stale or
   superseded gaps, mismatched source versions and incomplete coverage.
3. Local PostgreSQL RPC integration retains one selected job/event under repeated
   submissions, original evidence remains unchanged, and private artifacts pass
   retrieval/hash verification. Other owners' queue entries are absent.
4. CDK tests declare GET overview and GET/POST selection routes and retain existing
   resource limits and permissions. Runtime manifest verifies exact backend bytes.
5. Actual React components with a bounded synthetic transport verify preview,
   interrupted/resumed writes, status polling, filters, stale/error/empty states,
   downloads and 1365/390 px light/dark layouts. No fixture acts as a real login.
6. Actual local Next routes expose sidebar/gap links and preserve the full queue
   return path through sign-in. Browser console errors and horizontal overflow fail.

Commands:

```bash
# Frontend
npm test
npm run lint
npm run build
npm run verify:research:queue
# Backend
python3 -B -m unittest discover -s research_workflow/tests -p 'test_*.py'
# Infrastructure, with the isolated local PostgreSQL cluster on 54477
python3 -B bin/prepare-research-runtime.py
npm test -- --runInBand test/research-workflow.test.ts
npm run test:research:queue
```

Reports, including failures, remain under `.test-artifacts/experiment-queue` in
the frontend and `.test-artifacts/research-queue` in infrastructure. An actual
Google-authenticated browser request, remote Supabase Storage and scheduled AWS
execution are conditional release checks requiring the deployed backend and a
legitimate session. They must not be claimed from fixture results. No production
deployment is authorized by an ordinary editing request. Model calls and experiment
instances are not requested by these checks; measured hosting charges are unknown.
