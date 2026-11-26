# Run the synthetic assessment batch

The local runner reads `pdfs/synthetic_papers` in filename order. It binds each
PDF to exactly one answer key by SHA-256. It uses the same Generator and Verifier
skills as the JumpServe plugin and copies their files unchanged for the batch.
When the JumpServe results endpoint supports published workflows, the runner
verifies the active guidance by checksum and gives each skill the pinned text as
a separate input. Older endpoints use the workflows bundled with the checkout.
The batch keeps the same guidance across all papers and displays its versions
alongside the timings. It runs fresh assessments
and saves each validated Generator bundle and Verifier scorecard privately in
Supabase through JumpServe. Local evidence and answer keys stay in the batch
directory.

## Native macOS with ChatGPT sign-in

Use Python 3, Node.js 24 or newer, and the project's installed dependencies. The
Python script uses the existing batch runner and reuses your local Codex CLI
ChatGPT sign-in.

```sh
npm run assessment -- login --results
python3 scripts/run-jumpserve-synthetic-batch.py --inventory
python3 scripts/run-jumpserve-synthetic-batch.py --check-runtime
python3 scripts/run-jumpserve-synthetic-batch.py
```

Authorize the results connection once for both native and Docker-backed runs.
It uses the signed-in JumpServe account to save results and attach a private PDF
copy. Set `JUMPSERVE_URL` when using an isolated instance. The batch requires the
app release with the private results endpoint before it starts model sessions.

The named Codex permissions profile allows loopback experiment traffic and
gives the Generator write access to its assessment directory. It gives the
Verifier read-only access to the staged paper, assessment, evidence, and key.
Both sessions use approval policy `never`. The script returns exit code 0 when
every paper passes and exits nonzero if the run stops early.

## Docker with a scoped API key

Build the isolated Codex testbed with your local UID and GID so it can write
its assigned output directory as your account.

```sh
docker build --build-arg "BATCH_UID=$(id -u)" --build-arg "BATCH_GID=$(id -g)" \
  -t jumpserve-synthetic-batch:local - < scripts/jumpserve-synthetic-batch.Dockerfile
```

Provide `JUMPSERVE_BATCH_CODEX_API_KEY` through the environment from a scoped
project credential. Use `npm run eval:synthetic-batch -- --check-runtime` to check
the image and credential presence before starting model sessions. Start the
batch with `npm run eval:synthetic-batch`. The image receives
that credential for model calls. The Docker containers have model network access,
and the Generator's test traffic is scoped to its isolated testbed. Prepare any
external measurement inputs permitted by a paper before attempting its claims.
The local testbed may leave claims untested when a required capability is absent.

The Generator runs `codex exec --yolo` inside its own container, with only its
paper, skill, and writable assessment directory mounted. A separate container
runs the evidence preflight, and another runs the Verifier with read-only
mounts for the paper, key, and Generator evidence. The Verifier returns a
scorecard, and Codex writes its final response to the review directory.

The runner saves the Generator bundle before starting the Verifier. It validates
and saves the Verifier scorecard before checking for full credit, so a lower
score remains in Supabase. Every criterion must earn full credit and every claim
must have a verified grade. The runner halts on a lower score, a blocker, a
failed save, invalid or missing output, or a timeout. `batch.json` records
assessment, Generator, and Verifier IDs as saves are confirmed. It also records
the stop and papers still pending. A new batch uses a fresh directory.

If a save stops the batch, retry it with the ID from `database.assessment_id`
and the original files. The verifier version is in `runtime.verifier_skill_version`.
Use `scorecard.validated.json` when the runner produced it, or `scorecard.json`
otherwise.

```sh
npm run assessment -- save-generator <paper.pdf> --assessment-id <id> --bundle <jumpserve-assessment.json>
npm run assessment -- save-verifier <scorecard.json> --assessment-id <id> --bundle <jumpserve-assessment.json> --verifier-version <version>
```

When the Coach runs, save its completed private report with the development
verification IDs. The Coach saves through its connector in connected sessions.
To retry a retained report from the terminal, use the same report contents.

```sh
python3 scripts/run-jumpserve-synthetic-batch.py --coach-report <report.json>
```

For a native batch stopped solely because its scorecard included redundant
successful preflight metadata, the underlying runner supports
`npm run eval:synthetic-batch -- --native --recover-format --output <dir>`.
It independently checks the same inputs, preserves the original stop and
scorecard, and resumes only when the saved grade validates as perfect.

Use `--output <new-dir>` to choose a result path, `--model <model>` to pin a
model explicitly, or `--timeout-minutes <minutes>` to change the 30-minute limit
per model session. By default, results land under
`.test-artifacts/jumpserve-synthetic-batch`.
