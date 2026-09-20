# Configuration-matched congestion-control analysis

The aggregate explorer retains descriptive raw plots. Compare Cohorts and the
Box Plot sweep view apply stricter eligibility rules. They do not establish a
causal algorithm effect or manufacture trial pairs from run order.

## Population and matching

The data loader uses ID-based pagination through all result and associated launch
configuration rows, including when the database caps pages below the requested
size. It fails rather than silently comparing a truncated dataset. Only one
unambiguous launch configuration may be associated with a parent run. Missing or
inaccessible launch provenance excludes a run from matched analysis; it does not
make two unknown configurations equal.

Supported comparisons are homogeneous BBR versus homogeneous CUBIC experiments
using the three known single-bottleneck runners. Match all recorded settings:
runner, topology/configuration, link rate, queue size, snapshot interval, number
of clients, ordered client roles, workloads, delays, start delays, and remaining
launch settings (including loss and metric source). Notes, experiment names and
tags are metadata, not matching keys. CCA is the treatment being compared.
Omitted packet loss means the supported runner's zero-loss default; other
unspecified launch options are not invented. Conflicting launch/result settings,
incomplete or duplicate client configurations, unavailable selected-client FCT,
and one-sided configurations are excluded with counts.

Historical runner/kernel/BBR revisions may be unrecorded even in otherwise
eligible runs. Matching recorded settings cannot remove those uncertainties.
Current eligibility is deliberately narrower than the descriptive explorer;
mixed-CCA and multi-bottleneck comparisons require their own treatment definition.

## Outcome, weights and uncertainty

One observation is one parent run. Its outcome is the median FCT of its selected
clients, in milliseconds internally. Client flows and trace samples never count
as independent repetitions. Within each matching configuration, calculate each
algorithm's median or p90 of those parent-run outcomes. The displayed algorithm
values average those configuration-specific quantiles with equal configuration
weights. The contrast is their difference, always **CUBIC minus BBR**, in seconds.
These are not quantiles of a pooled flow population.

The 95% exploratory interval is a percentile bootstrap (2,000 resamples,
deterministic seed). Resample parent runs independently within each algorithm and
configuration, recompute the contrast, then average with the same fixed equal
configuration weights. Take the 2.5th and 97.5th percentiles. The selected
configuration grid remains fixed, so the interval describes replication
uncertainty for that grid, not generalization to unseen configurations.

Application eligibility thresholds are at least five repetitions per algorithm
in **every** configuration for a median interval, and ten for a p90 interval.
These thresholds do not guarantee coverage. Sparse or constant samples can make
bootstrap intervals unreliable. Below a threshold, retain descriptive estimates
and explicitly withhold the interval. Intervals assume independent parent runs,
are pointwise (no multiple-comparison correction), and do not establish causality.
Missing/failed transfers are excluded rather than imputed as zero; results are
therefore conditional on observed completed transfers, not a failure-rate study.

No trial-pair identifier or randomized assignment is recorded. Independent
within-configuration resampling is intentional: pairing runs by ID, date or rank
would invent experimental dependence. True paired-trial inference needs explicit
pair IDs and the corresponding collection protocol.

## Delay sweeps

Choose one client role and full recorded configuration; only that client's added
delay varies. Keep other clients' delays, CCAs, workloads and all remaining
settings fixed. Show parent-run counts beside equal-width boxes and in a coverage
table. Median CIs use the same parent-run percentile bootstrap with at least five
repetitions per delay. Display unequal counts explicitly. Do not downsample,
duplicate observations or imply that visualization has repaired an unbalanced
collection. Only observed levels are listed: absent planned levels cannot be
identified without a recorded sweep grid.

## Implementation and verification

- `lib/research-comparison.ts`: eligibility, keys, estimands and bootstrap.
- `lib/aggregate-research-data.ts`: complete retrieval and configuration provenance.
- `tests/research-comparison.test.mjs`: confounding, weighting, replication,
  missingness, deterministic intervals, sweeps, and server-capped pagination.
- The infrastructure agent's `compare_runs` returns equivalent configuration
  checks and descriptive FCT differences. With two runs it reports only one
  observation per algorithm and never fabricates a replication confidence interval.

Method references: [NIST percentile bootstrap documentation](https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/bootplot.htm)
and [SciPy bootstrap documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.bootstrap.html),
including the distinction between paired and independent resampling.
