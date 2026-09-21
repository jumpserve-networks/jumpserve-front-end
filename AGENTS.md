# AGENTS.md

Last updated: 2026-09-20

## Project purpose

JumpServe's central purpose is to collect networking test measurements and store
them in a relational database: **Supabase Postgres**. Measurements belong with
their test configurations and run metadata so researchers can query the data,
compare experiments, and reuse results for further analysis. Test execution,
visualizations, reports, and AI tools all support this measurement repository.

This purpose applies to Congestion Control Emulated Tests, Congestion Control
Real World Tests, and future test modules. Treat persistence in Supabase as a
core requirement when adding or changing tests and measurements.

`jumpserve-front-end` is a Next.js app for networking test modules. Logged-out
visitors see a public overview and module links at `/`. Results and comparisons
are public; only test execution, cancellation, and AI chat require Google sign-in
at `/login`. Sign-in resumes the requested action. Emulated tools belong to
**Congestion Control Emulated Tests** (`congestion-control-emulated`).
**Congestion Control Real World Tests** (`congestion-control-real-world`) provides
the separate EC2 launcher/history at `/real-world` and results at
`/real-world/[jobId]`. Its `/real-world/*` API shares the benchmark
API origin, with records and normalized reports in Supabase Postgres and raw
measurements in private Supabase Storage. `real_world_runs` and
`real_world_reports` are public read-only; `real_world_jobs` and
`real_world_artifacts` are backend-only. Each test
creates a server, bottleneck, and 1–16 receivers. Each machine supports t3.small,
t3.medium (default), or t3.large, subject to live zone offerings; preserve each
selected type when changing Regions. Show an independently controlled Region map
for the server, bottleneck, and every receiver, including newly added receivers.
Keep each map synchronized with its placement dropdown. Availability Zone
dropdowns must show only available zones that offer the selected instance type.
Both placement and traffic maps must pan continuously on both axes by repeating
the world, markers, and paths. Keep zoom bounded and render only visible copies.
The real-world status timeline uses Supabase `real_world_status_history` records
returned by the detail API. Show completed, current, pending, and interrupted
steps with recorded completion times. Never derive historical times from browser
polls or invent timestamps for tests that predate status tracking.
Do not mix its duration-based
throughput results with emulated file completion times.

Define module names, availability, home routes, and tool ownership in
`lib/test-modules.ts`. Existing emulated tool URLs remain valid. New modules need
their own tools and data integration before becoming available; module selection
is navigation, not an authentication or authorization boundary.

## Stack

- Next.js `16.1.6` (App Router)
- React `19.2.3`
- TypeScript `5`
- Tailwind CSS `4`
- shadcn/ui (Base UI, with shared components in `app/components/ui`)
- Supabase client libraries:
  - `@supabase/supabase-js`
  - `@supabase/ssr`

## Useful commands

```bash
npm install
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

For benchmark launching, cancellation, and logs, also set
`NEXT_PUBLIC_BENCHMARK_API_URL` to the deployed API base URL from
`jumpserve-networks/jumpserve-infra` (without the `/benchmarks` suffix).
Set it before building; Next.js embeds public environment variables in client code.

For AI chat, also set `NEXT_PUBLIC_AGENT_URL` to the full `AgentFunctionUrl` output
from `JumpServeAgentStack` in `jumpserve-infra`. Do not append `/chat`. Restart the
development server after changing it, and set it before building for production.

Do not commit real keys or tokens.

## Production and authentication

Keep result routes public. Verify Google sessions at APIs before launching or
cancelling tests or invoking the AI. Use `requireAccessToken` for browser actions;
never trust caller-supplied requester identity. Supabase RLS stays enabled, with
anonymous SELECT grants only for experiment tables and the explicit
`PUBLIC_BENCHMARK_COLUMNS` projection. Do not use `select("*")` on benchmark jobs
in public pages: requester emails are not public. Saved configurations and chat
sessions remain authenticated. Real-world cancellation is owner-only.

- Canonical production URL: `https://jumpserve.quaint-lab.org`
- Production `NEXT_PUBLIC_SITE_URL`: `https://jumpserve.quaint-lab.org`
- Supabase Authentication Site URL: `https://jumpserve.quaint-lab.org`
- Supabase allowed OAuth redirect pattern: `https://jumpserve.quaint-lab.org/auth/callback*`
- Local OAuth redirect pattern: `http://localhost:3000/auth/callback*`

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
- `app/modules/[moduleId]/page.tsx`
  - Public module home; unavailable and unknown modules return 404.
- `app/components/site-header.tsx`
  - Shared identity, theme, authentication, and mobile module-menu trigger.
- `app/components/app-shell.tsx` and `app/components/module-navigation.tsx`
  - Persistent desktop sidebar and Base UI Sheet navigation on smaller screens.
  - Derive sections and detail-page highlights from `lib/test-modules.ts`.
- `lib/auth-redirect.ts`
  - Resumes safe action/result deep links directly after login, preserving queries.
- `app/components/emulated-runs-dashboard.tsx`
  - Client component.
  - Run selector + metadata cards.
  - Renders SVG line charts for selected run.
- `lib/supabase/server.ts`
  - SSR Supabase client with cookie integration.
- `lib/supabase/client.ts`
  - Browser Supabase client helper.
- `app/globals.css`
  - Global styles and font family defaults.

## Current data model assumptions

### `public.emulated_runs`

Important columns currently used:

- `id` (int, PK)
- `created_at` (timestamptz)
- `client_number` (smallint)
- `delay_added` (smallint)
- `congestion_control_algorithm_id` (smallint)

Joined relation currently used:

- `congestion_control_algorithms(name)`

### `public.emulated_per_second_stats`

Important columns currently used:

- `id` (int, PK)
- `emulated_run_id` (int, FK -> `emulated_runs.id`)
- `snapshot_index` (smallint)
- `elapsed_seconds` (numeric)
- `megabits_per_second` (numeric)
- `round_trip_time_ms` (numeric)
- `bottleneck_queuing_delay_ms` (numeric)
- `in_flight_packets` (int)
- `congestion_window_bytes` (bigint)

## Graph behavior (current)

- Loads up to 50 newest runs by `created_at desc`.
- Loads per-second stats for those run IDs.
- Run dropdown defaults to the first (newest) run.
- Displays three charts:
  - Throughput (`megabits_per_second`)
  - Round-trip Time (`round_trip_time_ms`)
  - Queueing Delay (`bottleneck_queuing_delay_ms`)
- X-axis uses `elapsed_seconds`, then falls back to `snapshot_index`.

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
- Animations and transitions must behave consistently regardless of the browser
  or operating system motion preference. Do not add `prefers-reduced-motion`
  checks, `motion-safe:`/`motion-reduce:` variants, or preference-based animation
  suppression. Explicit pause controls and test lifecycle conditions still apply.
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

## Suggested next improvements

- Add URL query params for selected run and filters.
- Add multi-run comparison charts.
- Add additional metric toggles (`cwnd`, in-flight packets, backlog/rate fields).
- Add a small table of raw points under each chart for debugging/validation.
