# Recorded paper-assessment prompts

The original model request already remains private in
`research_paper_intakes.request` and its immutable event history. It includes the
instructions, extracted paper input, model, reasoning setting, token bound and
complete structured-output schema.

`research_paper_prompt_versions` stores one immutable version per distinct
combination of instructions, parameterized input template and model/output
configuration. Its content hash covers that JSONB object. The original uploaded
paper text is never copied into this catalog.

`research_paper_prompt_uses` privately links each assessment to its exact prompt
version and canonical original-request hash. Database triggers commit this link
with intake admission before any provider request. A capture failure rolls back
admission; Next.js and the operator CLI cannot proceed to inference. Retrying the
same admission retains its original version and request identity.

The migration backfills retained requests, including failed/cancelled terminal
assessments, from their original request events. It does not update old intake
rows, provider identities, events, spending limits, model-call counts or outcomes.

The authenticated `/prompts` catalog includes these versions under **Paper
assessment**, with **Recorded** status. Detail pages show exact instructions,
the input template, model parameters and output schema. Recorded usage is distinct
from agent prompt publication or evaluation approval. Existing agent prompt
drafts, publications and active pointers continue to use their existing tables.

The index reads only template metadata; content is loaded one version at a time.
No catalog route reads private intake requests, usage links, account fields,
source files, responses or paper text. RLS/browser write denial remains enabled.
Local standalone prompt-evaluation trials remain in their private evaluation
artifacts; they do not publish or activate an application prompt automatically.

## Verification

From `jumpserve-infra`, using the existing isolated localhost Postgres instance
on port 54477:

```sh
python3 test/check_paper_prompt_catalog_database.py
```

This runs original migrations and checks real backfill, concurrent deduplication,
version changes, transaction rollback, immutability, privileges and the actual
catalog projection. It uses synthetic source text and makes no model calls.
Frontend tests cover filtering, authenticated pages and recorded-status handling;
backend tests cover bounded catalog reads and anonymous denial.

## Release

These changes are local until an explicit release is requested. Apply
`jumpserve-infra/database/202611110003_paper_prompt_catalog.sql` after the original
Next.js intake migration, then deploy the backend catalog and frontend. The
trigger covers both web and operator admissions without an application-side
registration race. Do not remove recorded versions or usage links during a
rollback.
