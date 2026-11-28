# Jumpserve Front End

## Project purpose

The purpose of this repository is to create a generalizable Generator skill that
can thoroughly and accurately reproduce experiments from academic research
papers in computer networks. The Generator uses each paper and its supporting
materials to design and run feasible reproductions, then records the evidence
and limitations so researchers can check the results.

## Stack

- Next.js `16.3.8`
- TailwindCSS `4`
- shadcn/ui (Base UI components styled with Tailwind)
- Supabase client libraries (`@supabase/supabase-js` + `@supabase/ssr`)

## Local paper assessments and JumpServe MCP

The [public JumpServe marketplace](https://github.com/jumpserve-networks/jumpserve-plugins)
installs the Generator, Verifier, and Coach skills with the connector in Claude Code or Codex.
The marketplace README has the GitHub install commands for both clients.
Start a new client session after installing. Connect JumpServe to receive a
website link when your assessment finishes.

In **Assess a Paper**, sign in and upload the PDF in Step 1. Paste the
provided prompt into Claude Code or Codex with the JumpServe plugin connected.
The plugin downloads the verified PDF by assessment ID. Connect with the same
Google account and authorize PDF downloads if your connection only supports sharing.
JumpServe attaches the Step 1 PDF when the plugin saves the results privately.

For a local-only reproduction, give the Generator the PDF path and request local
output. It fetches published guidance from JumpServe and freezes an
`experiment-protocol.json` derived from the paper and supporting materials
before collecting measurements.

An assessment request authorizes the plugin to recreate the paper's testbed
and run in-scope local experiments. The plugin records fresh measurements,
documents substitutions and blocked claims, and respects any limits or
plan-only instructions you give it.

Claude Code and Codex run paper assessments locally with the standalone
[Generator skill](skills/jumpserve-paper-assessment/SKILL.md). Its skill ID is
`jumpserve-paper-assessment`.
[Download the skill archive](https://jumpserve.quaint-lab.org/downloads/jumpserve-paper-assessment-v1.8.2.zip)
from JumpServe. Place the extracted skill
directory under `~/.claude/skills/` for Claude Code or `~/.agents/skills/` for
Codex. The skill uses the [Access, Experiment, Data, and Validate workflow](skills/jumpserve-paper-assessment/references/modules.md)
to compose local tests and record their evidence. The skill checks the local
run receipts and raw output hashes before saving the bundle. It uses values
read from the paper only as references for comparison.
For experiments that need AWS, the
[temporary testbed workflow](skills/jumpserve-paper-assessment/references/aws-testbeds.md)
uses account `395567831870` and verifies teardown after collecting evidence.
Model inference follows the user's Claude Code or Codex configuration. A
local workspace can still use a hosted model provider.

When a required dependency, file, device, runtime, or service is blocked, the
skill uses the client's [native approval or consent workflow](skills/jumpserve-paper-assessment/references/permissions.md)
and continues once access is granted. Permission requests stay pending for your
decision when automatic review blocks an attempt. Use [human approval mode](skills/jumpserve-paper-assessment/references/permissions.md#select-human-approval)
to receive the prompts directly. If client policy blocks human review, the skill saves
the assessment for an [interactive session that can resume it](skills/jumpserve-paper-assessment/references/permissions.md#resume-after-an-approval-blocker).
If the PDF download is blocked, you can download it from the signed-in Step 1
page and give the client its path for
[local PDF recovery](skills/jumpserve-paper-assessment/references/sharing.md#recover-from-a-blocked-pdf-download).

To grade a completed assessment, open a separate session and use the
[Verifier skill](skills/jumpserve-assessment-verifier/SKILL.md) with the saved
`jumpserve-assessment.json` and the matching private answer key for the benchmark.
With the plugin installed, invoke `$jumpserve-assessment-verifier` in Codex.
The Verifier reads local evidence and saves a separate claim-level scorecard.
The connector can store an owner-authorized scorecard privately against the exact
saved Generator result. For another version of a completed assessment, save it
with `save_generator_result` before saving the corresponding review.

To draft a Generator improvement after a review, use the
[Coach skill](skills/jumpserve-assessment-coach/SKILL.md) in a separate session.
Point Claude Code or Codex to that skill file and one or more local Verifier
scorecards from the development split. The Coach drafts one focused change in a
separate local Generator candidate and reports its regression checks for owner
review. The Coach's preparation script skips
held-out scorecards before their findings reach the session. Each completed Coach
report is saved privately through `save_coach_report` and linked to the exact
saved development scorecards unless the owner explicitly requests local-only
work.

The Next.js app serves a Streamable HTTP MCP connector at `/mcp`. When a
JumpServe assessment finishes, the connected skill calls `preview_assessment`
to save it privately and returns the assessment link. The assessment stays
private with no expiration until its owner chooses to share it publicly.
Private and public assessments use `/research-verification/assessment/<id>` and show the
paper breakdown, experiment steps, experiment setup, and experiment results in Steps 2–5.
The same numbered outline carries forward. Step 3 adds steps beneath each experiment,
Step 4 adds commands beneath those steps, and Step 5 adds the experiment’s results.
Saved run references identify the experiment directly. Older runs can be matched by
their recorded claims when exactly one experiment fits. Other runs appear under
assessment-level measurements.
Saved sharing links redirect to this address.
The breakdown uses numbered sections, steps, and substeps with PDF page citations.
Experiment Setup includes local commands and any script files supplied with the assessment.
Public sharing requires owner approval of the exact saved copy. The MCP
`submit_assessment` tool accepts assessments the owner approved for sharing. JumpServe
stores the approved copy and its measurements in Supabase. Public sharing
makes the attached Step 1 PDF downloadable with the assessment. The original PDF, raw logs, and other local
evidence stay with the user. The connector does not need a model-provider key.

### Enable and connect

1. After applying the base JumpServe schema, apply the connector migrations from
   `202611210001_jumpserve_mcp_assessments.sql` through
   `202611260001_jumpserve_skill_version_numbers.sql` in order. These cover
   private PDFs and assessments, evaluation results, Coach reports and tracked
   recommendations, and published skill versions.
   [JumpServe infrastructure migrations](https://github.com/jumpserve-networks/jumpserve-infra/tree/main/database)
2. Set `NEXT_PUBLIC_SITE_URL` to the app's actual origin and
   `JUMPSERVE_MCP_ENABLED=true` in the server runtime. Use the existing
   `PAPER_INTAKE_SECRET_ID` on Amplify or set a server-only
   `SUPABASE_SECRET_KEY` for an isolated local project. On Amplify, the
   `scripts/configure-paper-intake-runtime.mjs` build hook forwards the
   connector flag and origin into the SSR runtime.
3. Add the connector in your local client. JumpServe registers each client
   automatically. Substitute the local URL when connecting to an isolated
   local instance.

```bash
codex mcp add jumpserve --url https://jumpserve.quaint-lab.org/mcp

claude mcp add -t http -s user jumpserve https://jumpserve.quaint-lab.org/mcp
```

Codex opens the consent flow when adding the connector. To reconnect, run
`codex mcp login jumpserve`. In Claude Code,
use `/mcp` to sign in. The account owner can revoke connector sessions at
`/oauth/jumpserve/connections`. For a local end-to-end run, use an isolated
Supabase instance with Google sign-in configured for your loopback app origin.
Run `npm run verify:research:mcp` for the browser and MCP integration check
with an isolated Next.js build and synthetic Supabase accounts.

### Start an assessment from a terminal

From this checkout with Node.js 24 and dependencies installed, authorize the
JumpServe CLI once with your Google account. Start assessments from local PDFs
after that sign-in.

```sh
npm run assessment -- login
npm run assessment -- start ./paper.pdf
npm run assessment -- start ./another-paper.pdf --run
```

`start` verifies the private upload and returns the assessment ID and Generator
prompt. Add `--run` to launch Codex in a fresh local workspace, or run
`npm run assessment -- run <assessment-id>` later. Codex uses your existing
ChatGPT sign-in and needs the installed JumpServe plugin and its MCP connection
for the same JumpServe account. `--yolo` explicitly runs Codex with approval
prompts and sandboxing disabled. The completed assessment is saved privately
through the existing connector.

Use `npm run --silent assessment -- start ./paper.pdf --json` for JSON output.
If an upload is interrupted, retry the same PDF with `--assessment-id <id>`
using the ID printed before upload. To target an isolated local instance, pass
`--url http://localhost:6001` or its configured origin. `logout` clears the cached
credential for that origin. The account's JumpServe connections page can revoke
the connection on the server.

### Synthetic training batches

The configured owner starts a synthetic batch from
`/research-verification/training-batches`. Signed-in users can browse all
batches and follow individual paper progress at
`/research-verification/training-batch/<id>`. The AWS coordinator runs the
Generator followed by the Verifier for each paper and saves private assessments
and scorecards. The detail page shows stage timing and any available read-only
worker output. [Synthetic training batches](docs/synthetic-assessment-batch.md)

### Plugin and guidance releases

The released Generator, Verifier, and Coach fetch versioned guidance through
`get_skill_instructions` and record the selected version in their outputs.
Local-only runs still connect to JumpServe for guidance and keep paper inputs
and results in the workspace.
[JumpServe skill instruction publishing](https://github.com/jumpserve-networks/jumpserve-infra/blob/main/docs/jumpserve-skill-instructions.md)

Run `python3 scripts/package-jumpserve-plugin.py` to build the standalone
Generator archive, the combined plugin archive, and the Claude marketplace
catalog. The catalog pins the plugin archive's SHA-256. Run the script with
`--check` to verify the release files. For a new release, update the package
version and the standalone download link in this README. Publish the extracted
plugin files to the public marketplace repository with its installation README.

## Quick Start

Use Node.js 24 to match CI.

1. Install dependencies:

```bash
npm ci
```

2. Create your local environment file:

```bash
cp .env.example .env.local
```

3. Fill in your Supabase values in `.env.local`.

4. Start the app:

```bash
npm run dev
```

Open `http://localhost:6001`. Both `npm run dev` and `npm start` default to port
6001. Set `PORT` or pass `--port` to use a different port.
When using another local port, match `NEXT_PUBLIC_SITE_URL` to that origin.

For local Google sign-in, include `http://localhost:6001/auth/callback*` in the
Supabase Authentication Redirect URLs. The wildcard preserves the requested page
through the callback's `next` query parameter.

The development command allows up to 64 KiB of request headers. Browsers share
localhost cookies across ports, and accumulated cookies can exceed Node's default
16 KiB limit and cause HTTP 431 before Next.js handles the request. If 431 persists,
remove the saved cookies for localhost in your browser and sign in again as needed.

## Unit-test coverage

Run `npm test` for the local unit suite and `npm run test:coverage:report` for
coverage reports. `npm run test:coverage` enforces 100% lines, branches,
functions and statements in every measured file. Test failures exit 1; a valid
report below the coverage target exits 2.

The owner-selected target is application/runtime code. The denominator includes
unloaded TypeScript/TSX files in `app/` and `lib/`, `proxy.ts`, and root executable
configuration files. Browser verification scripts in `scripts/` are outside this
unit target. Generated declarations, dependencies, build
output, test fixtures and test harnesses are excluded. A separate filesystem
inventory must match the report exactly, and raw counters must agree; a rounded
100% or a missing source file cannot pass the gate.

Reports are generated in `coverage/unit/` (`index.html`, `lcov.info`,
`coverage-final.json`, and `gate.json`) and are not committed. The JSX-only test
loader retains native Node TypeScript and the existing module mocks. Component
tests use jsdom and React Testing Library, with external network and navigation
boundaries replaced by synthetic fixtures. For the broader diagnostic inventory,
run `npm run test:coverage:report -- --all-sources`; that includes verification
scripts and writes a separate report under `coverage/all-sources/`. Unit tests
do not execute those scripts against production.

## Maintained tools

The supported commands are documented in `package.json`, CI workflows and
`maintained-tools.json`. Automated tests use synthetic fixtures. Historical
archives, completed experiment corpora and release-evidence bundles are no
longer checked into the working tree. Current schema/bootstrap migrations,
runtime pins and operational policies remain active platform inputs.

## Test modules

The public home page describes JumpServe and its test modules. Google sign-in at
`/login` opens the module chooser or resumes a safe requested URL and query
parameters. Measurement results and comparisons are public. Private research
workspaces, batch controls, and chat require a verified session.

- **Verify Existing Claims** provides paper assessments and synthetic training
  batches under `/research-verification`.
- **Develop a New Idea** provides the private planning workspace at
  `/research-ideas`.
- **Congestion Control Emulated Tests** shows recorded benchmarks, measurements,
  and comparisons under `/congestion-control-emulated`.
- **Congestion Control Real World Tests** shows recorded EC2 runs and reports
  under `/congestion-control-real-world`. The former launch page directs users
  to local execution. Run details retain recorded lifecycle history, topology,
  throughput, and time-limited links to available raw measurements.

Cloud benchmark launch and cancellation are retired. The benchmark API and
Supabase continue serving historical data. Public reads use limited projections.
Requester identities and raw storage access remain restricted. Keep real-world
duration-based throughput separate from emulated file completion times.
[Cloud benchmark retirement](https://github.com/jumpserve-networks/jumpserve-infra/blob/main/docs/cloud-benchmark-retirement-v1.md)

`lib/test-modules.ts` defines module IDs, availability, routes, and navigation.
Legacy root tool URLs, `/module/{moduleId}`, and `/modules/{moduleId}` redirect to
the canonical module routes and preserve path suffixes and query parameters.
Module tools use a desktop sidebar and a mobile navigation drawer. Detail pages
highlight their parent section.

## Research comparisons

The **LEO Emergency Failover Study** lives at `/leo-emergency-failover`.
Public results compare published capacity with the initial simulation and a
separately identified saturation follow-up, with country controls, placement,
orbital-state, constellation and link-rate charts, raw tables and JSON export.
Methods and literature pages expose provenance, missing claim coverage and
source review/access status. Chat reuses `ChatPanel` with the explicit LEO
module, Google authentication and editable country questions. The backend
capability check prevents older agents from using another module's tools.
Apply the LEO migrations and publish its evaluated prompt before deploying the
matching agent and frontend. [LEO study chat](https://github.com/jumpserve-networks/jumpserve-infra/blob/main/docs/leo-study-chat.md)

Compare Cohorts requires matching complete recorded configurations and gives
each configuration equal weight. It reports independent parent-run repetition
counts, exclusions, and exploratory confidence intervals when replication is
sufficient. The Box Plot view isolates a delay sweep and shows coverage per level.
See [the analysis contract](docs/research-comparisons.md) for estimands, matching
rules, missing-data behavior, bootstrap assumptions, and limitations.

## UI components

Use shadcn/ui components from `app/components/ui`, Base UI for interactive
primitives, and Tailwind utility classes for styling. The CLI configuration in
`components.json` uses the `base-vega` style so added components use Base UI:

```bash
npm run ui:add -- input dialog
```

Import shared components through the existing `@/` alias:

```tsx
import { Button } from "@/app/components/ui/button";

<Button variant="outline">Continue</Button>
```

Use Base UI's `render` prop for composition. When a Button renders a link, set
`nativeButton={false}`:

```tsx
<Button render={<a href="/login" />} nativeButton={false}>
  Sign in
</Button>
```

Use `cn` from `@/lib/utils` to merge conditional Tailwind classes. Shared theme
tokens live in `app/globals.css` and follow the existing `.dark` theme toggle.
Use neutral surfaces, subtle borders, compact typography, and the shared blue
accent for application controls. Reserve additional colors for chart series and
meaningful status indicators. Avoid decorative gradients, page-entry animations,
and oversized shadows. The site header contains the theme selector and a link
back to the home page.

SVG charts inside buttons must retain `role="img"`: the shared Button excludes
these content graphics from its default icon sizing. Keep run charts in a
maximum of two columns so axes and measurements remain readable.

Buttons, inputs, textareas, checkboxes, tables, tabs, selection controls, and
modal dialogs use the shared components across benchmarks, chat, and explorers.
`npm run lint` rejects native buttons, selects, textareas, tables, and ordinary
inputs outside `app/components/ui`; the visually hidden native file picker is
allowed. Keep custom charts as SVG and use Tailwind for their surrounding layout.

When adding components, verify their state selectors against the installed Base
UI version (for example, `data-[orientation=horizontal]` for tabs). Check keyboard
navigation, dialog focus restoration, and both themes after changing primitives.

## Supabase Helpers

- Browser client: `lib/supabase/client.ts`
- Server client: `lib/supabase/server.ts`

## Benchmark API

To load historical emulated and real-world benchmark data, set
`NEXT_PUBLIC_BENCHMARK_API_URL` in `.env.local` to the deployed benchmark API base
URL. Use the `BenchmarkApiUrl` stack output or `benchmarkApiUrl` context value from
`jumpserve-networks/jumpserve-infra`. Omit the `/benchmarks` suffix.

Restart the development server after changing environment variables. For a
production deployment, set this variable in the build environment and rebuild:
Next.js embeds `NEXT_PUBLIC_*` values in the browser bundle at build time.

## AI chat

Set `NEXT_PUBLIC_AGENT_URL` in `.env.local` to the full `AgentFunctionUrl` output
from `JumpServeAgentStack` in `jumpserve-infra`. Use the Lambda Function URL as
provided, including its trailing slash; do not append `/chat` or `/benchmarks`.

Restart the development server after changing this value. For production, set it
in the build environment and rebuild so the browser bundle includes the endpoint.

Run the API regression tests with `npm test`. These tests mock API requests.

## Real-world test results

Choose the Congestion Control Real World Tests module, then **Test Results**.
The workspace at `/congestion-control-real-world/test-results` shares saved EC2 measurements among all
visitors, with individual throughput/RTT/queue reports, configuration
matching, independent replication counts, exploratory confidence intervals,
bookmarkable selections, CSV/JSON exports, and print-to-PDF. It uses
`NEXT_PUBLIC_BENCHMARK_API_URL`.

See [reporting methods and limitations](docs/real-world-reports.md) for units,
eligibility, matching, bootstrap assumptions, provenance, and access semantics.
`npm test` covers comparisons, exports, and navigation. Backend tests cover
normalization, artifact quality, and authentication boundaries.

## Develop an unpublished research idea

**Develop a New Idea** → **Develop an Idea** opens
`/research-ideas/new-idea`. Google sign-in resumes this route.
Start with a title, domain, and question. The private
workspace starts with a **Guided conversation**: it reuses existing answers, asks
one missing question at a time, and saves each answer as an immutable plan version.
Methods questions build the protocol without requiring JSON. **Help me answer**
uses the existing authenticated AI discussion; suggestions never silently edit the
plan. The checklist questions are deterministic UI guidance, not model answers.

After the methods are recorded, specify the runner, configuration, metrics,
repetitions, and limits. Custom packages need a versioned implementation and
inputs. Invalid parameters block compilation. Compile and save changed settings
before review.
Fresh comprehension and critic reviews check the exact saved plan. Failed reviews
and unresolved questions block approval; substantive corrections create new versions.
Owner approval precedes freezing the plan. Automatic queueing requires an enabled
runner and worker. Keep execution status, empirical measurements, and claim
assessments separate.

**Detailed editor and history** retains the original bulk fields, protocol JSON,
review history and manual domain workflow. Unsaved answers or campaign details
block interface switches until saved or explicitly discarded. Unknown information
stays missing. The workspace persists data by user and study.

Use the existing research API origin and `NEXT_PUBLIC_AGENT_URL`; the browser
checks capabilities before creating an idea or requesting a model call. Deploy
the additive idea/prompt migrations and evaluated prompt before enabling the
module-aware APIs and frontend.

`npm run verify:research:public-queue` checks the current public Experiment Queue
through the local Next.js app and actual backend handlers with synthetic data.
Reports and screenshots are retained under `.test-artifacts/public-experiment-queue/`.
The retired private queue dashboard is no longer part of browser verification.

`npm run verify:research:autonomy` uses the current assessment detail and public
queue UI with the isolated PostgreSQL fixture on loopback 4104. Use
`npm run verify:research:autonomy -- --bundle-only` to compile its browser bundle
without that fixture; this mode does not run browser, API, database or controller
checks and records that limitation in its report.

`npm run verify:research:ideas` checks actual components and browser API adapters
against `jumpserve-infra/test/serve_research_ideas_fixture.py` on loopback 4103.
That fixture uses the actual API, agent and isolated PostgreSQL, with clearly
synthetic authentication/model responses; it cannot verify a legitimate Google
owner or remote Supabase Storage. It also checks local Next.js navigation and
sign-in return paths on port 6001. Reports and screenshots are retained under
`.test-artifacts/research-ideas/browser/`, including failed checks.
