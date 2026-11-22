# Access, Experiment, Data, and Validate

This workflow implements the module boundaries in *JumpServe as a Set of
Inter-Agent Modules: Access, Experiment, Data and Validate*, pages 2–7. The local
client coordinates the composition. A reviewed script, tool, or person can
implement a role. Select the smallest combination that can answer the claim.

## Plan and freeze the composition

1. Choose existing, versioned modules by their published contracts. Check their
   actual availability, permissions, and fit to the paper's parameters, metrics,
   and replication unit. Pin executable code and inputs by version or digest.
   If nothing fits, record the replacement as `improvised`, retain its code and
   tests, and give its evidence additional scrutiny. Treat an infeasible design
   as plan-only.
2. Record the composition in private `composition.json` using the contract below.
   Save a separate specification with the exact parameters, comparison,
   conditions, repetitions and order, duration, stopping rules, and resource
   roles. Propose validators and their reference sources before the run. Record
   the user's confirmed scope and accepted validator set, including a choice to
   omit optional validation. An existing authorization covering that scope is
   sufficient. Before acquiring any resource, run the checker from the installed
   skill and record the composition digest it prints alongside the specification
   and reference digests.

   ```sh
   python3 "$SKILL_DIR/scripts/check_composition.py" composition.json
   ```

   The checker uses Python 3.9+ with its standard library. After approval, pass
   `--expected-sha256` with the recorded digest to check the exact composition
   again before use. Keep prior versions and use a new composition and approval
   when the scope or accepted design changes. Routine repairs within the approved
   scope should preserve the frozen design and retained evidence.

## Request local permission

Use the [approval workflow](permissions.md) during setup, acquisition,
validation, and cleanup. Record the grant or the concrete blocker in the
private run record.

## Hand off evidence between roles

| Role | Input and output |
| --- | --- |
| **Access** | Receive the resource needs. Obtain least-privilege access in the approved scope. Hand Experiment a lease for each resource set with its ID, actual capabilities, version, permitted use, and expiry. Record the actual environment, hardware or image, and cleanup or release outcome. Record unavailable or unreconciled resources explicitly. |
| **Experiment** | Check that actual leases satisfy the frozen requirements. Run the specified parameters, roles, schedule, repetitions, and stopping conditions. Hand Data observations plus run IDs, lease IDs, timestamps, implementation version, configuration digest, and run status. Keep original logs, including failures and uncertain attempts. |
| **Data** | Define instruments, sample schema, units, collection rate, storage, and retention before execution. Keep raw observations locally, hash them, and record each derived measurement's source and transformation. Preserve zero, missing values, invalid trials, and exclusions with reasons. Store the approved projection through the existing JumpServe connector. |
| **Validate** | Read the frozen specification, recorded leases, run receipts, and stored observations. Use a reference supplied directly, such as the original paper, prior data, a preregistered hypothesis, an independently acquired rerun, or an instrument invariant. Check that runs occurred and numbers trace to stored records, then apply the stated comparison. Return a read-only report with the reference, checked runs, method, verdict, and limitations. A requested rerun goes back through Experiment under the existing scope. |

Use an independent implementation or reviewer for Validate when available. A
deterministic checker can read the original evidence and predeclared criteria
directly. A check of the experiment's own summary is an internal review. Keep
validator reports and their reference versions. Identify declined, unavailable,
and post hoc checks explicitly. Display disagreements separately from the
experiment's interpretation. Record late checks as post hoc and keep the
original criteria and verdict.

## Composition contract

Use arrays named `access`, `experiment`, `data`, and `validate`. Supply at least
one Access, Experiment, and Data selection for a runnable test. Use `[]` for
`validate` when omitted. Each selection declares a unique `id` within its role,
a `version`, and an `implementation` of `reviewed` or `improvised`. Capability
and format names are exact. Copy them from the selected contracts. Each
Experiment entry names the Access selections and the capabilities it requires
from each, plus the Data formats it emits. Each Validate entry declares the
formats it will check, the `context_kinds` it accepts, and the `context_kind`
selected for the directly supplied reference. The supported names are `paper`,
`prior-result`, `rerun`, `hypothesis`, `preregistration`, and `invariant`. The
checker verifies the declared interfaces. Access checks the actual lease
capabilities, and Validate checks the evidence.

This example reuses the `netem-iperf-v1` runner from `research_workflow/netem_iperf.py`
when an approved JumpServe backend checkout and an isolated Linux environment
are available. Use it only for matching duration-based TCP loss sweeps. The
runner's own parameter and observation contracts govern use. Pin the checkout
and use its local entry point with the necessary capabilities already present.

```json
{
  "access": [{
    "id": "isolated-linux", "version": "1", "implementation": "reviewed",
    "provides": ["linux", "netns", "netem", "iperf3"]
  }],
  "experiment": [{
    "id": "netem-iperf", "version": "netem-iperf-v1", "implementation": "reviewed",
    "requires": {"isolated-linux": ["linux", "netns", "netem", "iperf3"]},
    "emits": ["network-observations-v1"]
  }],
  "data": [{
    "id": "network-observations", "version": "1", "implementation": "reviewed",
    "formats": ["network-observations-v1"]
  }],
  "validate": [{
    "id": "receiver-rate-consistency", "version": "1", "implementation": "improvised",
    "formats": ["network-observations-v1"],
    "context_kinds": ["invariant"], "context_kind": "invariant"
  }]
}
```

For this invariant, give Validate the receiver bytes over elapsed seconds rule
with its exact units and tolerance, and retain the original iperf output so it
can recompute the rate. Only claim checks that actually ran.

## Project to the existing assessment bundle

Summarize Access, Experiment, Data, and any Validate reports in `methods` with
their shareable versions and status. Put the actual shareable configuration and
provenance in `runs[].configuration`, the evidence digest in
`runs[].artifact_sha256`, and the approved decision rule and evidence-backed
verdict in the matching claim. Use `limitations` for unverified assumptions,
uncovered claims, improvised implementations, and missing or post hoc checks.
Keep full leases, specifications, raw records, and evidence reports local. The
[delivery workflow](sharing.md) handles the approved projection and URL reply.
