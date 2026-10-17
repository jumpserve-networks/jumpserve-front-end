# Queue API compatibility, amendment v3

The local frontend was configured to use the deployed AWS benchmark API. The new
overview and gap-launch endpoints had been implemented locally but not deployed.
On 2026-10-17, the actual `/research/queue` GET returned HTTP 404 without an
`Access-Control-Allow-Origin` header, although preflight succeeded. Chrome hid
the response behind a CORS failure. The UI consequently displayed “Failed to
fetch Queue counts and current status are unknown.” The existing capabilities
endpoint returned 200 with CORS; owner study listing returned a proper 401 with
CORS when unauthenticated. These read-only probes did not use a Google session.

The UI now reads capabilities before selecting endpoints. If the backend
advertises `queue.overview_version=research-queue-overview-v1`, it uses the overview.
Otherwise a supported `research-queue-v1` backend is read through authenticated
`/studies?mine=1` and each owned paper study's existing `/queue`. Idea studies are
excluded. Only studies with jobs request campaign-title metadata. If that metadata
is unavailable, original job statuses remain visible with explicit missing titles.
Raw input references, request objects and event details are not copied into the
combined overview. The backend continues to enforce Google identity and ownership.

Legacy reads are bounded by three concurrent study workers, 100 owned studies,
1,000 combined paper jobs, 16 MB of parsed responses and 30 seconds per refresh.
Failures abort the refresh and retain the labelled previous status. Incomplete
queue coverage never becomes zero. Different study queues are read at different
times, so the combined result is explicitly not an atomic global snapshot.

The new backend also advertises
`preparation.gap_queue_version=research-gap-queue-v1`. Until that update is deployed,
gap launch actions explain that the backend release is required and perform no
writes. Capability support is not inferred from the frontend version. Existing
campaign execution/owner workspace APIs remain available as previously released.

Development checks cover legacy and advertised overview paths, owner/module
isolation, missing metadata, failed/empty/invalid/stale states, cancellation,
settings drift and preventing calls to undeployed routes. The actual React browser
regression includes a legacy API fixture that rejects any `/queue` overview probe.
It displays the recorded study jobs and blocks unsupported launches before writes.
The fixture is not a real Google-authenticated request. Earlier protocols and
validation reports remain preserved; no production changes or new scientific
campaigns were made for this compatibility fix.
