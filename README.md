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
The login page uses the shared Card and Button components.

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
