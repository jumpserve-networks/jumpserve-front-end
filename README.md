# Jumpserve Front End

Starter app using:

- Next.js `16.1.6`
- TailwindCSS `4`
- shadcn/ui (Base UI components styled with Tailwind)
- Supabase client libraries (`@supabase/supabase-js` + `@supabase/ssr`)

## Quick Start

1. Install dependencies:

```bash
npm install
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

Open `http://localhost:3000`.

## Test modules

When logged out, `/` is a public landing page explaining JumpServe, the experiment
workflow, and available and planned test environments. Sign-in controls open
`/login`, where Google authentication begins. Signing out returns to the public
landing page. Module overviews, test results, comparisons, status pages, and
measurement downloads are public. Google sign-in is required to run or cancel
tests and to chat with the AI; APIs verify the session independently.

After Google sign-in, `/` presents the module chooser. The current module is
**Congestion Control Emulated Tests** (`congestion-control-emulated`), with a home
at `/modules/congestion-control-emulated`. Its tools retain their existing URLs:
`/test-lookup`, `/parent-run/[id]`, `/aggregate-graphs`, `/benchmarks`, and `/chat`.
A persistent left sidebar shows the current module, its overview and sections,
and an **All modules** link. On smaller screens, the header menu button opens the
same navigation in an accessible drawer. Detail pages highlight their parent
section. The sidebar appears for module tools even when signed out, and is omitted
from the landing page, module chooser, and print. Module selection is navigation.

**Congestion Control Real World Tests** (`congestion-control-real-world`) opens
`/real-world` for EC2 placement, server CCA, shared bottleneck settings, test
launching, and history. `/real-world/[jobId]` shows lifecycle, cancellation,
machine placement, receiver throughput, and signed raw-report downloads.
It uses `/real-world/*` endpoints on `NEXT_PUBLIC_BENCHMARK_API_URL`. Result reads
are public; launching requires a verified Google session, and cancellation also
checks ownership. Raw files stay in private Supabase Storage, with temporary
links to measurement files.
Deploy the matching infrastructure/runtime before publishing this UI.

Each run creates one server, one bottleneck, and 1–16 receivers. AWS Regions,
Availability Zones, and compatible instance offerings come from the account's
live catalog. Each machine can use **t3.small**, **t3.medium**, or **t3.large**,
with t3.medium as the default. The zone selector checks availability for that
machine’s selected type. The API, provisioner, and EC2 launch permissions enforce
the same three-type allowlist. Region choices explain account opt-in restrictions;
unavailable or incompatible Availability Zones are hidden from the zone dropdown.
The server, bottleneck, and every receiver each have an interactive world map for
selecting their Region. Each map stays synchronized with its own dropdown;
changing Regions clears that machine's previous zone
and retains the selected instance type. Changing type clears a selected zone
unless the catalog confirms the new type is offered there. Nearby markers expand with zoom, and the map supports mouse,
touch, and keyboard navigation. Map coordinates are approximate Region locations,
not individual data centers. Live catalog availability remains authoritative;
Regions without map coordinates remain selectable in the dropdown. See
[map data and provenance](lib/maps/README.md).

Each test detail page includes an interactive traffic topology map: server →
bottleneck → receivers, with machine inspection, zoom, pan, and fit controls.
Machines in one Region share a marker and their local links appear as loops.
Animations follow the controller's recorded `start_epoch` and configured duration,
including transfers performed during the `starting` phase. They stop on cancellation,
cleanup, completion, polling errors, or 15 seconds without a successful status update.
Jobs without recorded timing remain static. Animation can be paused manually and
does not change with the system motion preference. Paths and animation speeds are schematic;
they do not represent measured packet rates or physical Internet routes. Collected
receiver throughput is shown in the inspector once measurements are available.

The workload is simultaneous TCP bulk transfer for a selected duration; CCAs are
CUBIC, stock Linux BBR, and Reno. Per-machine results remain separate from the
emulated comparison tools. EC2/network resources are removed after each run;
both modules store their data in Supabase. Real-world configuration, lifecycle,
normalized reports, and measurement traces live in Postgres; original per-machine
JSON lives in the private `real-world-results` Storage bucket.

`lib/test-modules.ts` is the module catalog: stable IDs, names, availability,
home routes, and tool navigation. A new module needs its own pages, data queries,
and backend integration before marking it available. Unknown or unavailable
module home routes return 404. Existing run IDs, database tables, benchmark APIs,
and agent endpoints remain scoped to emulated congestion-control tests.

OAuth completion and the authenticated `/login` redirect resume the safe `next`
path directly, including query parameters. Without a destination, sign-in opens
`/`. Logged-out visitors can open either module from the landing page. The launch
pages show a sign-in prompt while signed out; emulated run history stays readable.
`/chat` redirects to login. Launch/cancel/chat clients attach Supabase bearer tokens;
requester identity is verified by the API rather than accepted from the body.

Supabase RLS remains enabled. Infrastructure migration
`202609200003_public_test_results.sql` grants anonymous measurement reads and a
limited benchmark-job column projection (excluding requester emails). Saved
configurations, chat records, AI context, and anonymous writes remain private.
Migration `202609200004_real_world_supabase.sql` adds public read-only
`real_world_runs` and `real_world_reports`, private `real_world_jobs` and
`real_world_artifacts`, and a private measurement bucket. Only backend Lambdas
can write these records or sign uploads; EC2 machines receive object-scoped URLs.

`npm test` covers redirect safety, deep-link continuity, module availability, and
route ownership alongside the existing API tests.

## Research comparisons

Compare Cohorts now requires matching complete recorded configurations and gives
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
and oversized shadows. The theme control lives in the shared header.

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

To launch or cancel benchmarks and view their logs, set
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
A missing value previously caused chat to post to the frontend page and attempt
to parse its HTML as JSON. The client now rejects missing or invalid configuration
before sending a request and reports non-JSON API responses clearly.

Run the API regression tests with `npm test` (Node.js 22.18+ or 24+).
These tests mock API requests and do not launch EC2 instances or invoke AI models.

## Real-world test results

Choose the Congestion Control Real World Tests module, then **Test Results**.
The workspace at `/real-world-reports` shares saved EC2 measurements among all
visitors, with individual throughput/RTT/queue reports, configuration
matching, independent replication counts, exploratory confidence intervals,
bookmarkable selections, CSV/JSON exports, and print-to-PDF. Test management
remains owner-scoped. It uses the existing `NEXT_PUBLIC_BENCHMARK_API_URL`.

See [reporting methods and limitations](docs/real-world-reports.md) for units,
eligibility, matching, bootstrap assumptions, provenance, and access semantics.
Apply `202609200004_real_world_supabase.sql` and deploy the reporting API from
`jumpserve-infra` before
deploying this frontend. `npm test` covers comparisons, exports, and navigation;
backend tests cover normalization, artifact quality, and authentication boundaries.
