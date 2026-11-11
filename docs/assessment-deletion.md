# Owner assessment deletion

My Assessments provides a Delete action in both table and card views. Its
confirmation explains that deletion removes listings and shared links, is
irreversible in the application, and retains scientific evidence and audit
history privately. It is logical deletion, not a file or evidence purge.

The Next.js DELETE endpoint verifies the Google bearer token and recorded owner;
the service-only `research_delete_assessment` RPC repeats ownership and Google
identity checks. Non-owners get 404. Active tasks, experiments and unresolved
provider calls return 409 without changing the assessment. An unused upload can
be deleted immediately, cancelling its unused intake slot. Identical concurrent
or interrupted retries produce one deletion and one audit event.

The database records `research_studies.deleted_at` and fences subsequent writes
under the existing autonomy admission lock. Public RLS restrictions hide its
study-scoped data, including previously published evidence. Existing immutable
records, measurements, original storage objects, provider identities, budgets and
deadlines remain intact. Deletion cannot silently restart a failed call or erase
uncertain charges. Operator reconciliation remains a separate privileged process.

The backend's central study query and owner-membership filters exclude deleted
studies before paging and before shared/private detail, evidence and export reads.
The Next.js intake and notification reads apply the same exclusion. Server
credentials stay on the server; the browser never supplies the requester identity.

Before this migration is installed, Next.js availability and notification reads
retry without the deletion filter only when PostgreSQL explicitly reports the
`deleted_at` column as undefined (`42703`). Other errors, including schema-cache
and permission failures, still fail closed. The app rechecks on every read so
applying the migration immediately enables filtering without a restart. A missing
delete RPC reports that deletion is not enabled; ordinary assessment reads remain
available without deploying database changes.

## Local verification

```sh
node --import ./tests/support/tsx-loader.mjs --test \
  tests/assessment-delete-api.test.mjs tests/assessments-component.test.mjs
npm test
npm run lint
npm run build
```

From `jumpserve-infra`, with the existing isolated local Postgres test instance on
port 54477:

```sh
python3 test/check_assessment_deletion_database.py
```

This creates a fresh synthetic database and checks real owner/RLS transactions,
concurrent idempotence, evidence retention, inactive upload cancellation,
irreversible deletion and refusal of active/uncertain work. It never changes
production assessments or calls a model. Backend store/API tests cover the
application filters and shared-link denial without a browser.

## Release order

This change is prepared locally. A separately authorized release must apply
`jumpserve-infra/database/202611110002_assessment_deletion.sql`, deploy the backend
visibility filters, then deploy the frontend delete control and intake filters.
Deploy the backend before exposing deletion so its service credentials cannot
continue listing or sharing deleted records. Rollbacks must retain visibility
filters for existing deletions; never clear deletion timestamps to roll back UI.
