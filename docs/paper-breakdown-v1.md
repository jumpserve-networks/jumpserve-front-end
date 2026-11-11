# Paper breakdown, phase one

Uploading a PDF at `/research-verification/new-assessment` prepares Access,
Experiment, Data and Validate in the Next.js Node server. It does not create an
experiment workflow, autonomy task or worker dispatch. Both the review URL and
`/research-verification/assessment/<id>` show the saved breakdown to its owner.
Historical experiment assessments retain their existing detail and queue views.

Access describes resources and permissions reported in the paper. Experiment
covers procedures, configurations, comparisons and repetitions. Data covers
measurements, units, instruments, sampling, storage and provenance. Validate
covers the authors’ reported checks, baselines, uncertainty and limitations.
These are reading aids, not independently verified scientific findings.

## Request and evidence flow

1. A verified Google owner reserves an immutable upload identity. The browser
   uploads directly to private Supabase Storage using a scoped signed token.
2. Next.js downloads and hashes the original bytes, extracts numbered PDF pages
   with `unpdf`, and retains the PDF and text artifacts privately. It accepts
   PDFs up to 10 MB, 200 pages and 200,000 UTF-8 bytes of serialized model input.
   Oversized or unreadable inputs fail explicitly; pages are never truncated.
3. A serialized database admission checks the existing assessment category
   budget and deadline, records the frozen prompt/input and a $1 estimated
   reservation, and admits at most one model call for this intake. This estimate
   is not an actual charge. There is no new spending authorization or budget reset.
4. Next.js submits one structured Responses API request to the pinned OpenAI
   model `gpt-5.4-mini-2026-03-17`, with background execution and SDK inference
   retries disabled. The response identity is retained. Owner status polling
   retrieves that same response and saves the completed breakdown. OpenAI can
   finish processing while the browser is closed; saving the final result resumes
   on the owner's next status check. No JumpServe worker is needed.
5. Each metadata field and section detail cites a quote and PDF page. The server
   checks the quotes against the retained page text with whitespace normalization.
   Up to eight details per section are retained. Empty sections and missing text
   pages remain explicit. Matching quotes do not establish that AI descriptions
   or interpretations are correct. Figures, equations, scans and supplements may
   remain uncovered.

The new private `research_paper_intakes` and immutable event table preserve
request/response content, usage reported by OpenAI, source identities, model and
policy versions, original counters and status history. No anonymous or browser
SQL grants are added. Never put service credentials or an OpenAI key in client
code. Public detail reads expose minimal status and the recorded Experiment Queue
count; private quotes, prompts, original files and storage paths remain private.

Cancellation uses the saved provider identity. A lost model submission response
becomes `uncertain` and is never automatically replayed. Definite provider errors,
refusals, incomplete output and ungrounded quotations retain their original
response and fail explicitly. Transient retrieval/persistence failures can retry
reads without submitting another inference call.

An owner may explicitly move an existing unconfirmed upload to this path using
**Prepare paper in Next.js** on its review page. The database rejects adoption
while an original dispatch is active or uncertain, cancels the old intake
workflow, and preserves its original evidence, spent commitments and deadline.
Confirmed historical assessments cannot be adopted.

## Local setup and release

Add server-only values to `.env.local` (see `.env.example`):

- `OPENAI_API_KEY`
- `SUPABASE_SECRET_KEY`, or the legacy `SUPABASE_SERVICE_ROLE_KEY`

The usual public Supabase URL and anon key are still required. The private
buckets already exist in JumpServe. Apply
`jumpserve-infra/database/202611110001_next_paper_intake.sql` through the Supabase
MCP as part of an explicitly requested release, before enabling the frontend.
The migration depends on the existing research and assessment category-budget
migrations. Configure the same server secrets in the deployment's runtime secret
mechanism; build-time public variables are insufficient for private credentials.
Production uses the dedicated `JumpServeFrontendPaperIntakeStack` in the infrastructure
repository: a retained Secrets Manager secret and a production-branch compute role
that can read only that secret. `bin/deploy-frontend-paper-intake.mjs` provisions
those resources and preserves the existing Amplify configuration. The build hook
persists only `PAPER_INTAKE_SECRET_ID`, never either credential. Next.js reads the
secret at runtime and caches it for five minutes; local `.env.local` keys still work.
Do not place secrets in CDK context or expose them as `NEXT_PUBLIC_*` values.
No worker release or new worker capability is needed.

```sh
# jumpserve-front-end
npm test
npm run lint
npm run build
npm run verify:paper-uploads

# jumpserve-infra, isolated local PostgreSQL on 127.0.0.1:54477
env PYTHONPATH=/Users/Shared/allstar/jumpserve-infra/.runtime-autonomy-python/python python3 -B test/check_next_paper_intake_database.py
```

Development checks exercise actual PDF extraction, server request construction,
quote validation, provider retrieval, ambiguous submissions, concurrent admission,
private ownership, immutable history, budget denial and zero experiment jobs.
The browser campaign exercises both detail URLs, all four sections, source quotes,
mobile/desktop layout, account changes and existing assessment notifications.
Provider/auth/Storage transports are controlled fixtures; these checks do not
establish real-model reading quality or a Google-authenticated production roundtrip.

Keep changes local until an explicit release request. A live OpenAI assessment
requires configured server secrets and the migration. Historical prompts and
scientific records remain unchanged.
