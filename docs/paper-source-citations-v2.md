# Source references for phase-one paper intake

The original one-pass response format asked the model to type every quote and PDF
page. An otherwise usable response could fail because a quotation was paraphrased,
capitalized, or inflected. Assessment `47f2019f-1018-4e8a-8eed-d46fca43156b` retained
four such mismatches among 30 details. Its original failed result, response, usage
and history are preserved.

`paper_breakdown_sources_v2` retains the same single-call Next.js flow. The server
labels deterministic slices of the original extracted text with IDs such as
`p1s1`. Each slice is at most 600 UTF-16 units and belongs to one PDF page. IDs and
labels are generated separately from paper text; the original text artifact is
unchanged. Complete page order, all original characters and whitespace-only gaps
remain in the annotated model input. The existing page and complete-input byte
limits still reject oversized inputs before inference; nothing is truncated.

The response schema constrains `source_ref` to the supplied IDs, using one shared
enum in `$defs`. The model generates descriptions and metadata, but no quote text
or PDF page numbers. The server resolves each ID to its original passage and page,
then applies the existing exact-quote validator. Title and author quotations are
shortened only to an exact, case-sensitive occurrence of the returned metadata in
the selected passage, with whitespace differences allowed. Unknown IDs, extra
fields, invented metadata and attempted quote/page overrides fail closed.

Descriptions and passage selection still require substantive review; exact
quotation is not proof that a description is correct or exhaustive. Missing-text
pages remain uncovered, and no experiments are started.

The full annotated request and raw response remain private in the existing intake
and event records. Prompt registration still commits before the model call. Its
shared configuration contains reference IDs, never the paper passages; the actual
source input remains private. Prompt hashes come from the original saved request,
including when a response finishes after application instructions change.

The existing `paper_breakdown` response format keeps its strict legacy reader.
Original malformed or paraphrased quotes are not fuzzy-matched, silently replaced,
or relabeled successful. A new format ID is required if the reference-to-text
mapping changes; retain the versioned reader for already admitted responses.

## Verification

`tests/paper-source-references.test.mjs` covers original text/page resolution,
Unicode boundaries, whitespace gaps, malformed references, metadata grounding,
private template configuration, legacy misquotes, saved prompt hashes and the
single-call refresh boundary.

Browser-free live runs are retained under `.test-artifacts/paper-intake-evaluations/`:

- `evidence-first-v2-47f2019f-01`: the prompt-only candidate passed this paper.
- `evidence-first-v2-suite-01`: the same candidate failed two of three regression
  cases, so it was not selected as the application fix.
- `source-refs-v2-47f2019f-01`: the source-reference flow passed this paper, producing
  all four sections with 16 source-bound details.
- `source-refs-v2-suite-01`: all three exposed regression cases passed, including
  missing information, a missing-text page and embedded source instructions.

These are development regressions, not independent scientific evaluations or a
guarantee of general model accuracy. Replay the named runs with `npm run eval:paper
-- --replay RUN`; replays make no model calls or assessment mutations. The real
Postgres prompt-catalog check also verifies the new request's capture, immutable
backfill and private shared projection without production writes.
