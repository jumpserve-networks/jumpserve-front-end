# Real-world test results

The real-world module links to `/module/congestion-control-real-world/real-world-reports`. Anyone can browse reports,
inspect measurements, download evidence, and build comparisons without signing
in. Launching tests requires a verified Google session; cancellation additionally
checks ownership. Status pages are public, with management controls for owners.

The library loads newest-first pages of 50 tests. Search, CCA, status, any-machine
Region, and inclusive UTC date filters apply to **loaded history**, with an explicit
older-history button and coverage message. Failed and incomplete tests remain
visible. Individual reports have stable URLs. Comparison selections (up to 60
tests), filters, contrast, and outcome are encoded in the URL; copying a link lets
another visitor reconstruct the analysis. It does not create a frozen
snapshot or a persistent named report. JSON exports preserve the evidence used.

## Measurements and units

Both test modules persist data in Supabase. The real-world backend reads expected
per-machine JSON objects from private Supabase Storage. Finished evidence is
archived by SHA-256, and normalized reports, including receiver/TCP/queue traces,
are saved in the `real_world_reports` Postgres table. Reports retain source
SHA-256 digests, legacy S3 version IDs where applicable, configuration, placement,
AMIs, runtime revision, kernel and iperf
versions, sample counts, exclusions, and warnings. Malformed or unavailable
artifacts produce partial reports. They never become successful zero measurements.
Interactive analysis is bounded to 32 MiB per artifact and 64 MiB in total;
oversized sources remain available through raw downloads.

- Receiver throughput: received bytes × 8 / actual transfer seconds / 1,000,000.
  Zero-byte **intervals** remain zero. Missing intervals remain gaps.
- Combined average throughput sums receiver transfer averages. Each transfer has
  its own clock, so this is not a wall-clock synchronized aggregate rate.
- Jain fairness: `(sum flow averages)^2 / (N * sum squared flow averages)`.
  It describes balance of flow averages, not instantaneous fairness; it is
  unavailable for a single receiver or an incomplete set of transfers.
- Sender RTT: Linux `ss` smoothed RTT, already in **milliseconds**. Match the
  full reversed connection tuple recorded in receiver iperf JSON, excluding the
  control socket even when it uses the same server port. Zero RTT placeholders
  are unavailable. Congestion window bytes are `cwnd * MSS`.
- Shared queue: use only the bottleneck's BFIFO with handle `10:`. Queue drain
  time in ms is `backlog_bytes * 8 / (rate_mbit * 1000)`. This is an estimate
  from queue occupancy, not measured packet waiting time. Preflight ping is
  diagnostic and is never subtracted from RTT to invent queue delay.
- RTT and queue medians/p95 use valid samples from scheduled start through the
  configured duration. Traces preserve the recorded post-test tail. Cumulative
  drop counters include this tail; their observed difference is unavailable
  after a reset. Process-start skew does not prove TCP synchronization.

Interactive SVG figures support series toggles and keyboard time inspection.
Exports include receiver CSV, trace CSV with explicit clock/units, full report
JSON, comparison CSV/JSON, and browser printing to PDF. User-entered strings are
quoted and formula-neutralized in CSV. Raw download URLs expire after five minutes;
anyone holding a URL can use it until expiry. The bucket itself remains private.

## Valid comparisons

Each complete test is one independent replication. Receiver flows and time
samples are never additional repetitions. Duplicate test IDs count once.
Operator deployment smoke tests are expressly excluded from research inference.

Comparison eligibility requires completed status, positive complete receiver
totals, durations consistent with the requested workload, a verified single-stream
reverse TCP workload, consistent sender CCA, artifact identity/configuration,
placement, common start barrier, successful machine reports, and software
provenance. Missing optional TCP/queue traces are surfaced with sample counts and
warnings; they do not invalidate an otherwise complete throughput observation.

Matching blocks include all configuration fields except CCA and notes: duration,
rate, buffer, ordered server/bottleneck/receiver Regions, zone IDs, instance types,
receiver count, measurement runtime revision, and each machine's AMI, kernel and
iperf version. Analysis versions are also separated. A difference is shown only
when both selected CCAs occur in the same block. Blocks are never pooled. Notes
describe hypotheses; they cannot establish matching or override provenance.

The outcome is either combined average throughput (Mbit/s) or Jain fairness
(unitless). Each cohort estimate is the median of whole-test outcomes. Differences
always mean **comparison minus baseline**, in the same units as the outcome.
Charts show one dot per test, counts, medians, and intervals rather than hiding
sampling density inside a box plot. Unbalanced and one-sided blocks stay visible.

Exploratory pointwise 95% percentile-bootstrap intervals use 2,000 deterministic
resamples within each CCA independently, resampling whole tests. Median intervals
require at least five tests; difference intervals require at least five per CCA.
Five is a display threshold, not a guarantee of reliable inference. Sparse or
constant samples, temporal dependence, selection of successful tests, and multiple
comparisons can invalidate naive interpretation. No randomized assignment or
paired-trial identifier exists, so the platform does not fabricate paired tests or
claim causal effects. Matching AWS placement cannot fix route changes, host
contention, or time-of-day effects.

Primary references: [Linux ss](https://www.man7.org/linux/man-pages/man8/ss.8.html),
[byte FIFO](https://www.man7.org/linux/man-pages/man8/tc-bfifo.8.html),
[NIST bootstrap guidance](https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/bootplot.htm).
