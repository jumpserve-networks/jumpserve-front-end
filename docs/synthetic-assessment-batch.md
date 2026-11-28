# Synthetic training batches

The configured owner starts a batch from **Training Batches** at
`/research-verification/training-batches`. The site assigns the next positive
integer ID, records the request and dispatches a fixed AWS Systems Manager
command. The browser opens `/research-verification/training-batch/<id>` after
the request is recorded. Concurrent launches reserve distinct IDs using a
conditional update of the batch sequence in the private S3 bucket. A failed
request can leave a gap in the sequence.
[S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)

The AWS coordinator reports its first progress update once it starts handling
the request. If the response from AWS is uncertain, the same progress page can
pick up a later report. The service lock allows one batch at a time and
redelivery of a request leaves that batch's outcome in place.

Signed-in Google users can browse the full batch history, view progress and see
the assessment ID for each saved result. The account that started a batch also
sees links to its saved private assessments. Select any batch row to see its
details. The outcome squares show each paper's status.
The configured owner can use **Stop Batch** on a batch they started once the
coordinator reports preparation or execution. The request stops the numbered
service gracefully and the page shows the outcome from the normal progress feed.
The batch page refreshes automatically while a run is active. Click the
Generator or Verifier under a paper to open that step's details and recent
worker activity. With the live terminal enabled, any signed-in viewer can also
read the running worker's stdout, stderr and PTY output. The browser has no input
channel to the worker. The coordinator keeps a short in-memory replay for
viewers who join during the stage. Terminal output expires with the stage.

The separate activity history records worker milestones, allowlisted command
names and exit codes. Prompts, command arguments and raw Codex logs remain
with the private evidence. The WebSocket registry stores only expiring
connection metadata. The live relay sends terminal output directly to viewers.

## What a batch runs

The coordinator reads `pdfs/synthetic_papers` in filename order and binds each
PDF to exactly one answer key by SHA-256. It uses the same Generator and Verifier
skills as the JumpServe plugin. The coordinator fetches both published
workflows before starting workers, verifies their checksums, and pins their
versions for the batch. If a workflow is unavailable, the batch reports the
blocker during startup.

The parallel coordinator can run one paper per enrolled session, up to 20.
Each paper starts on a fresh Generator EC2 instance and moves to a
fresh Verifier EC2 instance after its private Generator bundle has been
validated and saved in Supabase. When a paper's Verifier result is saved and
both workers have been cleaned up, the same session takes the next queued
paper. A coordinator with one signed-in volume runs papers in sequence. The
Verifier receives that paper's matching answer key and read-only Generator
evidence. The coordinator saves each validated scorecard and continues
processing the other papers regardless of the points earned. Invalid or missing
output, a pinned evidence or rubric mismatch, a blocked Verifier, or a failed
EC2 stage with verified cleanup marks only that paper with a generation or
verification error. The coordinator retains available raw artifacts and valid
saved results, then reuses the session for the next paper. An explicit stop,
failure to save results or record batch progress, a shared runtime failure,
or unverified EC2 cleanup stops the batch. The coordinator waits for the
remaining workers to exit before publishing the final batch status.
The paper list updates the elapsed time of each running Generator or Verifier
step once a second from its recorded start time. Finished steps show their
recorded duration. Step timing includes worker setup, execution, validation
and result saving. Historical batches without time records show time as
unavailable.

Each session uses its own encrypted Codex sign-in volume for both stages. The
worker attaches it in the same Availability Zone and mounts the sign-in
directory only in its authenticated Codex container. The execution container
and evidence transfer are separate from those credentials. The workers share
a training-only subnet with no inbound security group rules. The coordinator
retains `batch.json`, logs, and artifacts under `/home/ec2-user/jumpserve-runs/<id>`.
The site reads the allowlisted progress summary in its private bucket.

Generator workers provide `jumpserve-linux-testbed` for experiments that need
kernel capabilities such as network namespaces and traffic control. The helper
boots a disposable Debian guest with no network adapter. It mounts staged inputs
read-only and writes the workload exit code and raw logs to a new evidence
directory. The guest itself can create internal network links. Credentials stay
in the separate Codex client container.

## Coordinator setup

Deploy the coordinator stack with `EnableWebBatchStart=true` and install the
matching coordinator package. Install `jumpserve-training-batch@.service`
under `/etc/systemd/system/`, then run `sudo systemctl daemon-reload`. The
coordinator's SSM Agent must support command-document environment variable
interpolation (version 3.3.2746.0 or later).
[AWS Systems Manager document parameters](https://docs.aws.amazon.com/systems-manager/latest/userguide/documents-syntax-data-elements-parameters.html)

Set these production Amplify branch values before releasing the website:

- `JUMPSERVE_SYNTHETIC_BATCH_OWNER_ID` uses the Supabase Auth UUID for the
  Google account that authorized the coordinator's private results connection.
- `JUMPSERVE_SYNTHETIC_BATCH_INSTANCE_ID` uses the stack's `CoordinatorInstance` output.
- `JUMPSERVE_TRAINING_BATCH_BUCKET` uses the `TrainingBatchBucketName` output.
  Put the same bucket name in `/etc/jumpserve-synthetic-batch.env`.

The app build hook carries these settings into its server runtime. After
cutover, retire the previous unnumbered coordinator unit after any run it holds
finishes. Keep its evidence directories.

Release the coordinator and web access policies for the private `activity/`
prefix alongside the matching coordinator package and website. Deploy the
`JumpServeTrainingBatchStopAccess` stack with the coordinator stack's
`CoordinatorInstance` output before releasing the Stop Batch control.
[Stop-access template](https://github.com/jumpserve-networks/jumpserve-infra/blob/main/assessment-batch-stop-access.json)

Enable live terminal output by setting `EnableTrainingBatchTerminal=true` and
using the site's Supabase project URL and public key for `TerminalSupabaseUrl`
and `TerminalSupabaseAnonKey`. In the coordinator's
`/etc/jumpserve-synthetic-batch.env`, set `JUMPSERVE_TRAINING_TERMINAL_ENDPOINT`
to `TrainingTerminalPublisherUrl` and `JUMPSERVE_TRAINING_TERMINAL_TABLE`
to `TrainingTerminalConnectionsTable`. Set
`NEXT_PUBLIC_JUMPSERVE_TRAINING_TERMINAL_URL` to `TrainingTerminalViewerUrl`
before building the site. The same setting in `.env.local` enables viewing on
`http://localhost:6001`.

### Parallel session pool

Deploy the coordinator stack with `EnableParallelTraining=true` and an empty
`AdditionalWorkerAuthVolumeArns` when using only stack-managed volumes.
The `TrainingWorkerSessionVolumeIds` output lists the 20 encrypted gp3 session
volumes in the worker Availability Zone. Twenty concurrent `t3.medium` workers
and the `t3.medium` coordinator need at least 42 vCPUs under the regional EC2
Standard On-Demand quota, plus capacity for any other workloads using it.

The coordinator uses its instance role and the scoped experiment-client role
for leases. Prepare or renew the JumpServe results session on the coordinator
with `npm run assessment -- login --results --callback-port 54457` using a
loopback-only SSH forward.

Enroll each new ChatGPT session once. Reuse the existing signed-in sessions.
Use the idle coordinator or an enrollment instance in the
worker zone and attach one detached volume at a time. Verify the device's EBS
volume ID and initialize ext4 only on a confirmed new, blank volume. Mount it at
`/mnt/jumpserve-codex` and create the `session` directory with mode `0700` and
ownership matching `ec2-user` on the workers. Enable device code login in
ChatGPT security settings or workspace permissions. Run the following as
`ec2-user` with the volume mounted and complete the device sign-in in your
browser. [Codex headless sign-in](https://learn.chatgpt.com/docs/auth#login-on-headless-devices)

```sh
CODEX_HOME=/mnt/jumpserve-codex/session codex \
  -c 'cli_auth_credentials_store="file"' -c 'forced_login_method="chatgpt"' login --device-auth
CODEX_HOME=/mnt/jumpserve-codex/session codex \
  -c 'cli_auth_credentials_store="file"' login status
```

Confirm status reports a ChatGPT login, then unmount and detach the volume.
Repeat for each new volume. After the intended sessions are enrolled and the
coordinator has no active batch, set these in its
`/etc/jumpserve-synthetic-batch.env` for the next batch:

- `JUMPSERVE_WORKER_AUTH_VOLUMES` uses `TrainingWorkerSessionVolumeIds`.
- `JUMPSERVE_WORKER_SUBNET_ID` uses `TrainingWorkerSubnetId`.
- `JUMPSERVE_WORKER_SECURITY_GROUP_ID` uses `TrainingWorkerSecurityGroupId`.

### Operations

Inspect a numbered unit with `sudo journalctl -u jumpserve-training-batch@<id>.service`.
Cancel it with `sudo systemctl stop jumpserve-training-batch@<id>.service`.
Reconcile uncertain worker cleanup using the stage's recorded AWS lease and
the existing `aws_testbed.py cleanup --lease` command. Scheduled deletion backs
up normal worker teardown.

To retry a private result save, use the original evidence and
`database.assessment_id` from `batch.json`. For a Verifier save, use the recorded
`runtime.verifier_skill_version` and `scorecard.validated.json` when available.
A retained Coach report can be saved through `npm run assessment -- save-coach <report.json>`.

## Local history

To show the same history on localhost as in production, set
`JUMPSERVE_TRAINING_BATCH_BUCKET` in `.env.local` to the production
`TrainingBatchBucketName`. Set `JUMPSERVE_TRAINING_BATCH_AWS_PROFILE` to a
local AWS profile that can list the bucket and read its request and progress
objects. This profile applies to the development training-batch S3 client.

With no S3 bucket configured, Next.js development can display archived CLI
journals. Set `JUMPSERVE_LOCAL_TRAINING_BATCH_DIRECTORY` to the journal parent
directory. Its `training-batch-index.json` is a JSON array of directory names
in ID order, starting with ID 1. Keep that order stable. Each entry reads its
original `batch.json` and only exposes the batch progress fields.
