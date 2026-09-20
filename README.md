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

After Google sign-in, `/` presents the module chooser. The current module is
**Congestion Control Emulated Tests** (`congestion-control-emulated`), with a home
at `/modules/congestion-control-emulated`. Its tools retain their existing URLs:
`/test-lookup`, `/parent-run/[id]`, `/aggregate-graphs`, `/benchmarks`, and `/chat`.
The header shows the current module, its tools, and an **All modules** link.
Module selection is navigation, not an authorization boundary; every protected
page still requires the existing Google authentication.

**Congestion Control Real World Tests** (`congestion-control-real-world`) is the
next planned module. Its chooser card is disabled and marked **Coming soon**.
There is no real-world launcher or results view yet. CDN and other networking
modules can follow without reusing the emulated tools or data implicitly.

`lib/test-modules.ts` is the module catalog: stable IDs, names, availability,
home routes, and tool navigation. A new module needs its own pages, data queries,
and backend integration before marking it available. Unknown or unavailable
module home routes return 404. Existing run IDs, database tables, benchmark APIs,
and agent endpoints remain scoped to emulated congestion-control tests.

OAuth completion and the authenticated `/login` redirect both open the chooser.
A requested tool URL is carried in its `next` parameter and resumed when the user
chooses that module. External and unrecognized destinations cannot become module
links. Choosing a module does not persist a default that bypasses the chooser on
the next sign-in. Theme preferences remain available through the shared toggle.

`npm test` covers redirect safety, deep-link continuity, module availability, and
route ownership alongside the existing API tests.

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
