# TCP88 extraction and missing review groups

Assessment: `d9161d19-7733-4b8b-92cf-74804d63da7b`.
Investigation date: 2026-10-25. Production inspection was read-only.

## Demonstrated cause

The assessment's private review is `ready`, with the title **Congestion Avoidance
and Control**, domain **Computer networking: transport protocols and congestion
control**, and **175 candidate statements / 175 seeds**. Intake finished after
27 recorded model turns covering 25 extracted-text chunks. No experiments started.
All 175 quotes occur in the exact page/chunk text supplied to the model. Original
stored request and response hashes were verified. These checks establish recorded
grounding, not that every statement is an original contribution or experimentally
testable, or that the paper has been completely reviewed.

The connected API advertises `research-paper-review-v1` but not
`paper-review-selection-v1`. Its saved review has no `metadata.selection`.
The grouping backend, private RPC migration and policy are local changes that
have not been deployed. The local frontend accepted the older response, derived
no roles from its missing organization field, and displayed both sections with
zero suggestions. It also called all retained statements “Other” and said they
were not shortlisted, although no shortlist had run.

The fix distinguishes unavailable/not-run grouping from a completed empty
shortlist, displays the extracted candidate count, retains access to source
statements, and explains the service update requirement. It prevents editing
category assignments the older service cannot save. A supported, unorganized
review still offers the explicit organization action. A completed empty shortlist
is also described as a potentially incomplete AI suggestion, not evidence that
the paper contains no claims.

## Exact source and provenance

Princeton's [`TCP88.pdf`](https://www.cs.princeton.edu/courses/archive/fall17/cos561/papers/TCP88.pdf)
is Jacobson and Karels' **November 1988 revision**, 25 PDF pages, 219,959 bytes.
Its SHA256 is
`9ca88dfa60f98d5cf736c3917df45420eb91861dd1de453a3dedf3d91c1836eb`,
matching the original uploaded artifact recorded for the assessment. This is
not interchangeable with the 17-page proceedings copy found during retrieval.
The web reader returned HTTP 403 for Princeton; direct HTTPS retrieval succeeded.
The supplied private ChatGPT conversation could not be read through the web
reader and was not used as evidence of paper content or extraction quality.

Fresh local extraction with pinned pypdf 6.19.0 produced nonempty text on all
25 pages. Four original candidate quotes differ from the newly rendered text
at mathematical/legacy-font symbols; all 175 match their originally recorded
prompt chunks. A fresh parse must not silently replace that original grounding
reference. The cause of those rendering differences was not isolated. Neither
text extraction nor this investigation fully examines figures, equations,
tables, appendices and references. Historical network measurements have not
been reproduced.

A separate title fallback defect was reproduced on the fresh first-page text:
the heading/byline uses `∗`, `†` and `‡`, and PDF metadata says `congsum.dvi`.
The display fallback now recognizes these conventional footnote markers without
rewriting retained text (`paper-display-title-v2`). The saved review already had
the correct model-extracted title; this fallback defect did not cause the absent
claim groups. Older text packets with malformed control characters can still
require their retained source-grounded metadata or explicit title confirmation.

## Retained evidence and checks

Private snapshot and read-only diagnosis:
`jumpserve-infra/.test-artifacts/tcp88-extraction/20261025T134548Z/`.
Original snapshot SHA256:
`0bd7a61dbe93a520ac6d37cadc9ca935622e6b33604dd0ae4291d915b0604ba4`.
The snapshot includes private prompts and artifact records; do not publish it.

The original PDF and new derived packet are in
`jumpserve-front-end/.test-artifacts/tcp88-extraction/`.
Browser verification report:
`.test-artifacts/paper-uploads/2026-10-25T13-45-30.849Z/report.json`.
Eight scenarios passed, including missing organization versus completed-empty
groups and desktop/mobile screenshots. Authentication/storage/model responses
in that browser campaign are fixtures, not a real authenticated production run.
Frontend: 242 tests passed, TypeScript and changed-file ESLint passed.
Backend: 253 tests passed, including the new actual-layout title regression.

The actual-model grouping replay uses
`jumpserve-infra/bin/evaluate-paper-selection.py freeze-tcp88` followed by `run`.
It freezes the exact 175-item inventory, original system prompt, current policy,
implementation hashes, all subsequent requests/responses, pass criteria and
limits before the run: at most 22 calls, 1,200 elapsed seconds, no paid API
fallback. Production records and original budget/deadline remain untouched.
The initial sandbox attempt failed before its loopback bridge could bind; it is
retained separately from the elevated replay, rather than overwritten.

The main replay processed 136 candidates in 17 successful calls, then stopped on
the provider's `server_is_overloaded` response. A separately frozen five-call
follow-up continued the remaining 39 candidates with unchanged prompt/policy,
retaining the failed call and original evaluator bytes. All 175 candidates reached
one completed batch. The final output suggests **3 central claims and 15 testable
findings**, with original statement IDs and source locations preserved. In total,
22 provider calls completed and one failed; usage for the failed call is missing.
Available successful-call usage totals 169,921 input tokens and 26,958 output
tokens (196,879 total). These are known sums, excluding the failed call's unknown
usage; charges and subscription cost allocation remain unknown.
These are dependent development runs, not independent replications.

The AI implementer inspected the final 18 selected statements and labels. The
categories are useful as a candidate shortlist, but some labels compress source
qualifiers: the exponential-backoff necessity argument explicitly lacks a proof
in this paper; the 1% Arpanet statement combines a target and inferred consequence
with observed window sizes. Such labels must not become measured results or
established necessity. The UI uses original passages rather than substituting
labels for claims. Every intermediate raw answer was not substantively reviewed.
This check does **not** approve policy publication or establish general taxonomy
accuracy. The source-grounded shortlist can still omit important contributions.

Final AI judgment, usage and private raw-artifact manifests are retained in
`jumpserve-infra/.test-artifacts/tcp88-selection/20261025T142010645980Z/`;
the original main run is
`jumpserve-infra/.test-artifacts/tcp88-selection/20261025T134858201414Z/`.
The versioned operational continuation is prepared with
`python3 -B bin/evaluate-paper-selection.py freeze-follow-up` and executed with
`python3 -B bin/evaluate-paper-selection.py run`. Existing results cannot be
overwritten by the evaluator. No prompt tuning was performed in the follow-up.

All these are exposed development checks. The evaluator/reviewer is the primary
Codex AI implementer, not an independent or human reviewer. Subscription usage
and available token counts are retained; measured charges and the portion of
subscription cost allocated to this replay are unknown, not zero. Nothing in
this diagnosis establishes general extraction accuracy across research domains.

## Release boundary

No deployment, schema change, study reorganization or experiment launch was
performed. The existing review-grouping release order and remaining semantic
evaluation requirements are in `docs/paper-review-groups-v1.md` and
`jumpserve-infra/docs/paper-review-selection-protocol-v1.md`. The service update
must be released before an owner can organize this live saved inventory through
the application. Re-uploading the paper is not necessary to retain its data.
