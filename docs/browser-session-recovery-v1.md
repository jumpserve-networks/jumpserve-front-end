# Browser session recovery v1

Opening the app checks a stored Supabase session, which can require a network
refresh. A failed session read means the sign-in state is unavailable; it does
not establish that the visitor signed out.

`readBrowserSession` checks both returned SDK errors and rejected promises. It
shares in-flight reads per SDK auth instance and limits each caller's wait to
15 seconds. That limit does not cancel the SDK refresh, bypass its cross-tab
lock, delete stored credentials, or start another refresh on retry. Subsequent
callers join the pending read until it settles. Server/API authorization still
verifies the token independently.

The header offers **Retry connection** on failure; it does not initiate OAuth
from that state. The profile provider records an unavailable state without
presenting another user's profile. Both retry when the browser emits `online`.
Auth subscriptions register after a successful shared read, avoiding SDK
initial-event lock timeouts queued behind failed startup refreshes. A null
`INITIAL_SESSION` event is not accepted as proof of logout; successful session
reads and explicit `SIGNED_OUT` events establish absence.

## Local verification

```sh
npm test
npm run verify:auth
./node_modules/.bin/tsc --noEmit --incremental false
```

The fixed browser campaign uses the actual React components, Strict Mode and
installed Supabase SDK with a loopback HTTP auth/profile fixture. Only Next
navigation/link are stubbed. Expired synthetic sessions never leave loopback;
external browser requests are blocked. It checks a dropped connection, retained
session cookie, explicit retry, profile recovery, automatic `online` recovery
and genuine session absence. Reports retain console diagnostics, unhandled page
errors and screenshots under `.test-artifacts/browser-auth/`. Failed reports
remain beside later runs. This is a development regression campaign, authored
and reviewed by the implementing AI; it is not an independent evaluation or a
legitimate Google OAuth/production authentication test.

The original localhost report did not identify a request. Local logs contained
browser fetch failures and Google Fonts transport failures; later endpoint and
browser connectivity checks succeeded. These observations do not establish
which request caused the user's earlier error. SDK network diagnostics remain
visible and can appear in the Next development overlay during a real outage.
The handling changes do not repair unavailable remote services or the network.

## SDK logging amendment

The repeated console report on the assessment queue prompted a check of the
installed SDK. Supabase JS/auth 2.97.0 calls `console.error` for handled transport
failures, including the exact `TypeError: Failed to fetch` / `new Promise`
signature preserved in the original development report at
`.test-artifacts/browser-auth/2026-10-24T21-27-02.993Z/report.json`.

Supabase JS is now pinned to 2.118.0 in the package manifest and lockfile, including
auth 2.118.0. The existing SSR 0.8.0 helper is retained and its declared SDK peer
range is satisfied. The updated auth transport returns retryable errors without
logging raw fetch exceptions; initial-session transient failures use warnings
and refresh recovery uses the SDK debug channel. No global console interception,
fabricated HTTP responses, custom token refresh, cookie deletion or authorization
bypass is added. Existing UI error handling, session retention and retries remain.
This SDK requires Node.js 22 or newer; local verification uses Node.js 24.4.1.

Before running the v2 development campaign, its publication criteria add zero
script-origin console errors while preserving the original offline, explicit
retry, online-event recovery and genuine missing-session cases. Native browser
transport errors remain in the report. These reused development cases are not
independent or held-out validation. The actual SDK is used with synthetic expired
sessions and a loopback auth service; no real refresh token leaves the lab browser.

The reported queue URL and its public API both returned HTTP 200 during diagnosis;
the API returned an allow-origin header admitting the local page. That later
success does not identify the original failed request. The SDK behavior is a
demonstrated mechanism matching the reported signature, not proof that all
network outages are repaired. Changes remain local until an explicit release.
