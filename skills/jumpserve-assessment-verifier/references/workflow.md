# Verifier workflow

Match claims to the key by paper citation and meaning. Independently check the method, eligible coverage, units, calculations, and decision rule. Document actual evidence with local relative file and row references. Record the assessment's verdict and the verdict the evidence supports for each claim.

Record blockers and critical failures before awarding credit. Identify the evidence that supports each awarded or withheld point. Preserve unscored criteria and their applicable denominator.

In the scorecard, copy the preflight status and run count when present. Use the optional string field `evidence_integrity.detail` for an integrity note. This example shows the scorecard section after preflight verified two runs.

```json
{
  "evidence_integrity": {
    "status": "verified",
    "verified_runs": 2,
    "detail": "Both run receipts passed the integrity checks."
  }
}
```
