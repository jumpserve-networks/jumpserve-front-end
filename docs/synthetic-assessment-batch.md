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
sees links to its saved private assessments.
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
skills as the JumpServe plugin. A run pins the active published instructions by
checksum, or uses the bundled instructions when the results endpoint lacks
published workflow support.

With a configured pool of signed-in worker volumes, the coordinator starts a
fresh Generator EC2 instance for every paper concurrently. A coordinator with
one signed-in volume runs papers in sequence. Each paper moves to its own
Verifier EC2 instance as soon as its
private Generator bundle has been validated and saved in Supabase. The
Verifier receives that paper's matching answer key and read-only Generator
evidence. The coordinator saves each validated scorecard and continues
processing the other papers regardless of the points earned. A blocker,
failed save, invalid or missing output, timeout, or cleanup failure stops the
batch and interrupts other unfinished workers. The coordinator retains
completed results and waits for remaining workers to exit before publishing
the final batch status.
The paper list shows the status and recorded elapsed time of each Generator
and Verifier step. Step timing includes worker setup, execution, validation
and result saving. Historical batches without time records show time as
unavailable.

Each paper uses its own encrypted Codex sign-in volume for both stages. The
worker attaches it in the same Availability Zone and mounts the sign-in
directory only in its authenticated Codex container. The execution container
and evidence transfer are separate from those credentials. The workers share
a training-only subnet with no inbound security group rules. The coordinator
retains `batch.json`, logs, and artifacts under `/home/ec2-user/jumpserve-runs/<id>`.
The site reads the allowlisted progress summary in its private bucket.

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
prefix alongside the matching coordinator package and website.

Enable live terminal output by setting `EnableTrainingBatchTerminal=true` and
using the site's Supabase project URL and public key for `TerminalSupabaseUrl`
and `TerminalSupabaseAnonKey`. In the coordinator's
`/etc/jumpserve-synthetic-batch.env`, set `JUMPSERVE_TRAINING_TERMINAL_ENDPOINT`
to `TrainingTerminalPublisherUrl` and `JUMPSERVE_TRAINING_TERMINAL_TABLE`
to `TrainingTerminalConnectionsTable`. Set
`NEXT_PUBLIC_JUMPSERVE_TRAINING_TERMINAL_URL` to `TrainingTerminalViewerUrl`
before building the site. The same setting in `.env.local` enables viewing on
`http://localhost:6001`.

Deploy the coordinator stack with `EnableParallelTraining=true`. Provision one
encrypted gp3 sign-in volume in the worker Availability Zone for each paper,
including the existing `CodexVolumeId`. Set `AdditionalWorkerAuthVolumeArns`
to the additional volumes' exact ARNs. In
`/etc/jumpserve-synthetic-batch.env`, set `JUMPSERVE_WORKER_AUTH_VOLUMES`
to the comma-separated list of all enrolled volume IDs,
`JUMPSERVE_WORKER_SUBNET_ID` to `TrainingWorkerSubnetId`, and
`JUMPSERVE_WORKER_SECURITY_GROUP_ID` to `TrainingWorkerSecurityGroupId`.
The current 15-paper corpus needs capacity for 15 concurrent t3.medium workers
in addition to the coordinator and other workloads.

The coordinator uses its instance role and the scoped experiment-client role
for leases. Prepare or renew the JumpServe results session on the coordinator
with `npm run assessment -- login --results --callback-port 54457` using a
loopback-only SSH forward. Enroll each ChatGPT session independently on its
volume. Temporarily attach and mount each credential volume at
`/mnt/jumpserve-codex`, then run `codex login` with
`CODEX_HOME=/mnt/jumpserve-codex/session` and file-backed credential storage.
Unmount and detach each volume before starting a batch.
[Codex headless sign-in](https://learn.chatgpt.com/docs/auth#login-on-headless-devices)

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
