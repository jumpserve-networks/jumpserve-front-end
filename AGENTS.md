# AGENTS.md

## Project purpose

The purpose of this repository is to create a generalizable Generator skill that
can thoroughly and accurately reproduce experiments from academic research
papers in computer networks. The Generator derives protocols from each paper and
its supporting materials, runs feasible experiments, and records the evidence and
limitations. Keep the workflow usable on papers without benchmark answer keys.

JumpServe supports this work by storing networking measurements with their test
configurations and run metadata in **Supabase Postgres**. Researchers can query
the data, compare experiments, and reuse results through the test modules,
visualizations, reports, and AI tools. Treat persistence in Supabase as a core
requirement when adding or changing tests and measurements in Congestion Control
Emulated Tests, Congestion Control Real World Tests, and future modules.

## Local assessment architecture

Claude Code or Codex uses the Generator in
`skills/jumpserve-paper-assessment` to load published guidance, derive a claim-level
protocol from the paper, freeze it before measuring, and record the evidence.
Keep the source PDF, protocol, drafts, scripts, and raw observations local.
For a requested JumpServe assessment, save the validated bundle privately through
the MCP connector. Public sharing requires the account owner's approval of the
exact saved assessment and its attached PDF. Preserve scoped credentials and
idempotent submission.

Next.js serves the website and validates bundles through MCP. Supabase records
saved assessments and shared measurements. Keep the former hosted paper
generation and OpenClaw supervisor services retired. The separate AWS training
coordinator runs synthetic evaluations from the website. See
[the training batch workflow](docs/synthetic-assessment-batch.md) and
[the hosted assessment retirement record](https://github.com/jumpserve-networks/jumpserve-infra/blob/main/docs/local-assessment-retirement-v1.md).

## Deployment workflow

- Keep routine changes and verification local. Do not push or merge to `main`,
  trigger Amplify builds, or deploy application or infrastructure changes unless
  the user explicitly requests deployment of the current changes.
- An earlier deployment request is not standing authorization to deploy on later
  turns. Wait for a new explicit deployment instruction.
- Do not check or poll deployment status after ordinary editing turns. Check
  deployment status only as part of an explicitly requested deployment or when
  the user specifically asks for a deployment status check.

## Local research assessment autonomy

The goal of research assessments is **100% unattended autonomy** after the user
requests an assessment. That request authorizes feasible local verification
experiments within its scope. Honor explicit plan-only requests, confirmation
requirements, and client access controls. The local skill should plan, implement,
validate and execute experiments, analyze measurements, and diagnose, repair and
resume recoverable failures without routine user input.
Installing dependencies, writing instrumentation and repairing experiment
packages are local workflow responsibilities. Run claims in parallel where
appropriate and share compatible acquisitions. Save prompts, responses,
actions, failures, repairs and provenance locally. Save requested JumpServe
assessments privately and publish selected results and measurement provenance
only after owner approval.

Continue useful work within the approved spending, elapsed-time and authorization
limits, honoring cancellation. Unattended operation does not guarantee conclusive
findings: preserve honest inconclusive or untested outcomes when evidence or
external prerequisites remain insufficient. Never fabricate data, weaken frozen
scientific criteria, reset limits or blindly replay uncertain calls to force
completion. Record the exact remaining blocker and retained evidence. This goal
does not change the separate requirement for an explicit merge/deployment request.

## Module and benchmark boundaries

The public home page shows JumpServe's overview. A signed-in Google user sees
the module chooser and can resume a safe requested destination through login.
Public measurement results and comparisons remain readable without sign-in.

Congestion Control Emulated Tests and Congestion Control Real World Tests expose
recorded cloud benchmark results. Keep cloud benchmark execution retired.
The emulated Benchmarks page shows history, and the real-world
`/congestion-control-real-world/run-a-test` route explains local execution.
Historical run detail pages display the recorded state and timestamps. Preserve
the distinction between a recorded status and current activity. Use an explicit
public read projection and keep requester identities, raw artifacts, and storage
access private. Keep real-world duration-based throughput separate from emulated
file completion times. See [the cloud benchmark retirement record](https://github.com/jumpserve-networks/jumpserve-infra/blob/main/docs/cloud-benchmark-retirement-v1.md)
and [the real-world reporting contract](docs/real-world-reports.md).

Real-world chat lives at `/congestion-control-real-world/chat` and uses the
explicit `congestion-control-real-world` module identifier. A result link can
prefill an editable question via `jobId`. The user sends it after Google sign-in.
Scope saved conversations by user and module. The backend selects that module's
published prompt and read-only measurement tools and verifies capabilities before
using them.

Define module names, availability, home routes, and tool ownership in
`lib/test-modules.ts`. All module pages and module-owned Next.js API routes belong
under the URL-transparent `app/(modules)` route group at `/{moduleId}`. Use the
exported module path constants for links, redirects, query updates, and sign-in
return paths. Legacy root tool URLs, `/module/{moduleId}`, and
`/modules/{moduleId}` redirect permanently through `next.config.ts`, preserving
path suffixes and query parameters. New modules need their own tools and data
integration before becoming available. Enforce authorization at the API boundary.

The **Propagation Delay Study** module (`propagation-delay-study`) reads the
`delay_study_*` Supabase relations for the NINeS 2026 reproduction campaign.
Keep the paper's published values separate from our measurements. Delay parameters
are round-trip increments; sensitivity is per-flow log2(max/min) across matched
delay assignments, not a within-trial fairness ratio. Preserve whole-trial paired
resampling, coverage counts, invalid trials, source versions, and limitations.
Results, methods, and literature pages are public read-only. The default new-table
security trigger creates an anonymous-read restriction; dedicated public result
tables require the explicit policy migration used by this module, with RLS and
browser write denial retained. Never use a service credential in client code.
Render interpolated SVG `<title>` content as one string; multiple JSX text
children cause server/client hydration mismatches. Check completed-study data
in the browser as well as incomplete states.

The **LEO Emergency Failover Study** (`leo-emergency-failover`) reads the six
`leo_study_*` relations. Preserve the initial campaign and exploratory saturation
follow-up separately, along with full configurations, requested/deployed terminal
counts, source hashes, claim coverage and bibliography access/review status.
Capacity is idealized simulated downlink in decimal Gbps. Adjacent orbital states
are not independent replications; min/max ranges are not confidence intervals.
The predeclared ±5% rule measures numerical agreement, not operational accuracy.
Keep the paper's published capacities and the Lithuania percentage inconsistency
explicit. The 2.5-Gbps sensitivity also doubles ISL rates while leaving Ka and
the baseline constellation unchanged; it is not full Config C. Routing,
sovereignty, incumbent traffic and physical validation remain uncovered claims.
Results, methods, literature and JSON exports are public read-only. Chat reuses
`ChatPanel` with this explicit module, Google authentication, user/module-scoped
history and a backend capability check. Country links prepare an editable question
without sending it. Its evaluated prompt lives in the existing prompt tables;
deploy the migrations and publish that prompt before the module-aware agent and
frontend. See `jumpserve-infra/docs/leo-study-chat.md` for the release order.

## Stack

- Next.js `16.3.8` (App Router)
- React `19.2.3`
- TypeScript `5`
- Node.js `24` in CI and local development
- Tailwind CSS `4`
- shadcn/ui (Base UI, with shared components in `app/components/ui`)
- Supabase client libraries:
  - `@supabase/supabase-js` `2.118.0`
  - `@supabase/ssr`

## Useful commands

```bash
npm ci
npm run dev
npm run lint
npm test
npm run build
npm run ui:add -- <component>
```

## Environment

Required in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

For historical benchmark and real-world result reads, set
`NEXT_PUBLIC_BENCHMARK_API_URL` to the benchmark API base URL from
`jumpserve-infra`. Use the base URL without the `/benchmarks` suffix. Set
`NEXT_PUBLIC_*` values before building for production because Next.js embeds
them in the browser bundle.

For AI chat, also set `NEXT_PUBLIC_AGENT_URL` to the full `AgentFunctionUrl` output
from `JumpServeAgentStack` in `jumpserve-infra`. Do not append `/chat`. Restart the
development server after changing it, and set it before building for production.

Do not commit real keys or tokens.

## Production and authentication

Keep public results on their explicit read projections. Verify Google sessions
at API boundaries for private data, synthetic batch controls, and AI chat.
Require the configured owner for batch controls, and use `requireAccessToken`
when a browser calls a bearer-token API. Derive requester identity from the
verified session. Keep Supabase RLS enabled. Use `PUBLIC_BENCHMARK_COLUMNS` for
public benchmark job reads and retain restricted access to private records,
saved configurations, and chat sessions.

Each `/research-verification/assessment/<id>` page shows the paper header and owner
wizard. The user removed the Assessment status, Claim progress, assessment-record
controls and Experiment Queue sections; do not restore them or poll queue data
from that page. Public record APIs remain available. Retired queue links with
`?assessment=<id>` or `?study=<id>` redirect there, retaining job identities;
`&view=private` uses the same shared view. Prompts, responses,
requirements, evidence records, configurations and event history are available
through bounded, on-demand public projections. Use the explicit public queue and
task-history APIs; never grant anonymous SQL access to private relations or expose
unpublished research ideas. Protect credentials, account/contact data, private
storage locations and original file downloads. Shared copies label redactions
and size limits, preserve missing values and zero, and identify hashes as belonging
to unchanged originals. Retired queue links without an assessment open the
My Assessments filter. Enforce Google session and ownership checks on writes,
including batch starts and stops. See `docs/shared-assessment-details-v1.md` for
assessment access rules and verification.

Completed local skill assessments stay private without expiration. Public sharing
requires owner approval of the exact saved assessment. Use the wizard step as
progress and the canonical assessment route for private and public papers.
Old report URLs redirect there. Ignore legacy publication flags at the client
boundary while preserving historical records and wire compatibility.
Source-paper reported values and bibliographic provenance remain distinct from
our measurements. Owner-only editing, private PDFs and private ideas retain
their existing authorization checks.

- Canonical production URL: `https://jumpserve.quaint-lab.org`
- Production `NEXT_PUBLIC_SITE_URL`: `https://jumpserve.quaint-lab.org`
- Supabase Authentication Site URL: `https://jumpserve.quaint-lab.org`
- Supabase allowed OAuth redirect pattern: `https://jumpserve.quaint-lab.org/auth/callback*`
- Local OAuth redirect pattern: `http://localhost:6001/auth/callback*`

The trailing wildcard is required because the app adds a `next` query parameter to
the callback URL. An exact callback URL does not match the resulting query string,
so Supabase silently falls back to the configured Site URL.

Keep the production callback URL in Supabase Authentication's Redirect URLs list. If
it is missing, Supabase silently falls back to the configured Site URL after Google
authentication, and the callback route cannot exchange the OAuth code for a session.
The production callback must not rely solely on `request.url` for its redirect origin:
behind CloudFront, Next.js can see the internal origin as `localhost:3000`. Prefer
`NEXT_PUBLIC_SITE_URL` and retain the canonical production fallback.

## Key files

- `app/page.tsx`
  - Server component rendering the public overview when logged out and the module
    chooser for authenticated Google users.
  - Retains a safe requested tool URL until its module is selected.
- `app/(modules)/[moduleId]/page.tsx`
  - Public module home; unavailable and unknown modules return 404.
- `app/(modules)/congestion-control-emulated` and `app/(modules)/congestion-control-real-world`
  - Module pages, detail routes, and the emulated parent-run query endpoint.
- `app/components/site-header.tsx`
  - Shared identity, authentication, and mobile module-menu trigger.
- `app/components/app-shell.tsx` and `app/components/module-navigation.tsx`
  - Viewport-fixed desktop sidebar below the sticky header, with independent
    overflow scrolling, and Base UI Sheet navigation on smaller screens.
  - Reserve sidebar width in desktop content; remove the offset when printing.
    Keep body horizontal overflow clipped so it does not trap header stickiness.
  - Derive sections and detail-page highlights from `lib/test-modules.ts`.
  - Place the Dark Mode / Light Mode / System Default icons in the header before
    authentication controls. Keep theme synchronization active on
    global pages without a sidebar; the header logo links back to the home page.
- `lib/auth-redirect.ts`
  - Resumes safe action/result deep links directly after login, preserving queries.
- `app/components/emulated-runs-dashboard.tsx`
  - Client component.
  - Run selector + metadata cards.
  - Renders SVG line charts for selected run.
- `skills/jumpserve-paper-assessment/`
  - Generator skill, experiment protocol format, and local evidence checks.
- `app/mcp/route.ts` and `lib/jumpserve-mcp-server.ts`
  - JumpServe connector and tool definitions.
- `app/(modules)/research-verification/training-batches` and
  `app/(modules)/research-verification/training-batch`
  - Shared synthetic batch history and per-paper progress.
- `lib/supabase/server.ts`
  - SSR Supabase client with cookie integration.
- `lib/supabase/client.ts`
  - Browser Supabase client helper.
- `app/globals.css`
  - Global styles and font family defaults.

## Measurement data

Use the current queries in `lib/emulated-runs-data.ts` and the reporting contract
in `docs/real-world-reports.md` as references for recorded measurements. The
`METRICS` definitions in `app/components/emulated-runs-dashboard.tsx` own the
dashboard's metric names, units, and series.

## Implementation notes

- Use shadcn/ui components from `app/components/ui` for new shared UI controls and
  Tailwind utilities for layout and styling. Add components with `npm run ui:add`.
- Use Base UI primitives (`@base-ui/react`); keep `components.json` on the
  `base-vega` style. Compose components with `render` and set `nativeButton={false}`
  when a Button renders a non-button element such as a link.
- Use `cn` from `@/lib/utils` to merge Tailwind classes. Keep shared color tokens in
  `app/globals.css` and support the existing `.dark` theme toggle.
- Keep the interface restrained: neutral surfaces, subtle borders, and compact
  typography. Dark mode takes its color cues from a neon aquarium: deep navy
  surfaces, cyan controls, electric-blue navigation, lime completion indicators,
  amber warnings, and selective magenta highlights. Use shared color tokens in
  `app/globals.css`; keep chart series distinct and pair status colors with text
  and icons. Preserve the light palette. Avoid decorative gradients and
  page-entry animations.
- Mark bordered content containers with `content-panel` (the shared `Card` already
  includes it). Keep one outer frame; nested panels render as plain sections.
  Use headings, spacing and dividers inside panels. Preserve borders and focus
  indicators on buttons, inputs, selections and other interactive controls.
- Animations and transitions must behave consistently regardless of the browser
  or operating system motion preference. Do not add `prefers-reduced-motion`
  checks, `motion-safe:`/`motion-reduce:` variants, or preference-based animation
  suppression. Traffic topology paths animate across all test lifecycle states,
  including completed tests; only the explicit Pause/Resume control stops or starts
  them. Keep actual transfer activity and completion status in the status badge.
- Preserve `role="img"` on SVG charts inside buttons so shared icon sizing does
  not shrink them. Use at most two columns for run charts on desktop.
- Supabase `numeric` / `bigint` values can arrive as strings; convert before chart math.
- Keep server-side querying in server components where possible.
- Preserve non-sensitive error messages for easier debugging.
- Research comparisons must use complete recorded configuration matches and
  parent runs as the replication unit. Keep units consistent, expose exclusions
  and sample counts, and never infer paired trials from run order. Follow
  `docs/research-comparisons.md` when changing estimates or confidence intervals.
- Prefer adding new metrics in `METRICS` within `app/components/emulated-runs-dashboard.tsx`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
