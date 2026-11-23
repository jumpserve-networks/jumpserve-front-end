import Link from "next/link";
import { Badge } from "@/app/components/ui/badge";
import { LocalDateTime } from "@/app/components/user-preferences";
import type { AssessmentVerifierResult } from "@/lib/jumpserve-mcp-store";
import { CopyBlock, McpSetupDialogs } from "./mcp-setup-command";

const linkStyle = "text-sm text-primary underline underline-offset-4";

export function RunVerifier({ assessmentId, connectionsUrl, resultsHref }: {
  assessmentId: string; connectionsUrl: string; resultsHref: string;
}) {
  const prompt = `Use the JumpServe Verifier skill (jumpserve-assessment-verifier) to independently review the Generator result for assessment ${assessmentId}. Use the original local jumpserve-assessment.json, its supporting evidence, and the private answer key that matches the paper SHA-256. If an input is missing or ambiguous, identify it before grading. Save a local scorecard and use the JumpServe connector to save it privately for this assessment. Keep the answer key, raw evidence, and PDF in the local workspace.`;
  return <section aria-labelledby="run-verifier" className="content-panel space-y-5 rounded-xl border p-4 sm:p-6">
    <h2 id="run-verifier" className="text-lg font-semibold">Run the Verifier</h2>
    <ol className="list-decimal space-y-3 pl-5">
      <li>Install or update the JumpServe plugin to v1.6.0 or later. Connect the client to JumpServe with the Google account that owns this assessment.</li>
      <li>Start a new Claude Code or Codex session in the workspace with the original Generator JSON, its evidence, and the matching answer key. Keep the answer key out of the Generator session.</li>
      <li>Paste the prompt below into that session. If the Verifier asks for input locations, provide the local paths there.</li>
    </ol>
    <CopyBlock title="Claude Code or Codex prompt" label="Verifier prompt" value={prompt} wrap />
    <p className="text-sm">When the connector returns a verification ID, open <Link href={resultsHref} prefetch={false} className={linkStyle}>Step 7 · Verifier Results</Link>.</p>
    <McpSetupDialogs connectionsUrl={connectionsUrl} />
  </section>;
}

const statusLabels = { scored: "Scored", blocked: "Blocked", failed: "Failed" };
const integrityLabels = {
  verified: "Verified", legacy_archive_matched: "Legacy archive matched", fixture_only: "Synthetic fixture only", failed: "Failed",
};
const gradeLabels = { correct: "Correct", incorrect: "Incorrect", unscored: "Unscored" };
const outcomeLabels = { untested: "Untested", inconclusive: "Inconclusive", reproduced: "Reproduced", discrepant: "Discrepant" };

function VerifierScorecard({ result }: { result: AssessmentVerifierResult }) {
  const { evidence_integrity: integrity, score, claims, rubric, blockers, critical_failures: failures } = result;
  return <article className="space-y-4 border-t pt-4" aria-labelledby={`verification-${result.id}`}>
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h3 id={`verification-${result.id}`} className="font-semibold"><LocalDateTime value={result.created_at} /></h3>
      <Badge variant={result.status === "failed" ? "destructive" : "secondary"}>{statusLabels[result.status]}</Badge>
      <span className="text-sm text-muted-foreground">Verifier {result.verifier_version}</span>
    </header>
    <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
      <div><dt className="font-medium">Score</dt><dd>{score ? `${score.earned} / ${score.applicable_maximum} applicable points` : "No score recorded"}</dd>
        {score && score.applicable_maximum !== score.rubric_maximum ? <dd className="text-muted-foreground">{score.rubric_maximum} points in the full rubric</dd> : null}</div>
      <div><dt className="font-medium">Evidence integrity</dt><dd>{integrityLabels[integrity.status]}</dd></div>
      <div><dt className="font-medium">Evaluation</dt><dd>{result.mode === "fresh" ? "Fresh measurements" : "Replay"} · {result.split === "held_out" ? "Held-out" : "Development"}{result.scenario ? ` · ${result.scenario}` : ""}</dd></div>
      <div><dt className="font-medium">Generator revision</dt><dd>{result.generator.result_kind === "replay_analysis" ? "Replay analysis" : "Assessment"} · <code title={result.generator.bundle_sha256}>{result.generator.bundle_sha256.slice(0, 12)}</code></dd></div>
      <div className="sm:col-span-2"><dt className="font-medium">Verification ID</dt><dd><code>{result.id}</code></dd></div>
    </dl>
    {integrity.detail ? <p className="whitespace-pre-wrap text-sm">{integrity.detail}</p> : null}
    {integrity.archive_detail ? <p className="whitespace-pre-wrap text-sm">{integrity.archive_detail}</p> : null}
    {failures.length ? <div className="text-sm"><h4 className="font-medium text-destructive">Critical failures</h4><ul className="list-disc space-y-1 pl-5">{failures.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null}
    {blockers.length ? <div className="text-sm"><h4 className="font-medium">Blockers</h4><ul className="list-disc space-y-1 pl-5">{blockers.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null}
    {claims.length ? <details className="border-t pt-3">
      <summary className="cursor-pointer font-medium">Claim findings ({claims.length})</summary>
      <ul className="space-y-4 pt-3 text-sm">
        {claims.map(claim => <li key={claim.key_claim_id} className="space-y-1 border-l pl-3">
          <h4 className="font-medium">Key claim {claim.key_claim_id}{claim.assessment_claim_id ? ` · Generator claim ${claim.assessment_claim_id}` : ""} · {gradeLabels[claim.assessment]}</h4>
          <p>Generator verdict {claim.reported_outcome ? outcomeLabels[claim.reported_outcome] : "Unavailable"} · Verifier verdict {claim.supported_outcome ? outcomeLabels[claim.supported_outcome] : "Unavailable"}</p>
          <p className="whitespace-pre-wrap">{claim.finding}</p>
          {claim.evidence.length ? <div className="text-muted-foreground"><p>Evidence references</p><ul className="list-disc pl-5">{claim.evidence.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null}
        </li>)}
      </ul>
    </details> : null}
    {rubric.length ? <details className="border-t pt-3">
      <summary className="cursor-pointer font-medium">Scoring rubric ({rubric.length})</summary>
      <dl className="space-y-3 pt-3 text-sm">
        {rubric.map(item => <div key={item.criterion}>
          <dt className="font-medium">{item.criterion} · {item.earned === null ? `Unscored (maximum ${item.maximum})` : `${item.earned} / ${item.maximum}`}</dt>
          <dd className="whitespace-pre-wrap">{item.reason}</dd>
        </div>)}
      </dl>
    </details> : null}
  </article>;
}

export function VerifierResults({ data, runHref, newestHref, olderHref, previousPage }: {
  data: { results: AssessmentVerifierResult[] } | "unavailable";
  runHref: string; newestHref: string; olderHref?: string; previousPage: boolean;
}) {
  return <section aria-labelledby="verifier-results" className="content-panel space-y-4 rounded-xl border p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="verifier-results" className="text-lg font-semibold">Verifier Results</h2>
      <a href={newestHref} className={linkStyle}>{previousPage ? "Newest results" : "Refresh results"}</a>
    </div>
    {data === "unavailable" ? <p role="alert" className="text-sm text-destructive">JumpServe could not load Verifier results. Try refreshing the results.</p>
      : data.results.length ? data.results.map(result => <VerifierScorecard key={result.id} result={result} />)
      : <p className="text-sm">{previousPage ? "No older Verifier scorecards are available." : "No Verifier scorecards have been saved for this assessment."} <Link href={runHref} className={linkStyle}>Go to Step 6</Link>.</p>}
    {olderHref ? <Link href={olderHref} prefetch={false} className={linkStyle}>Older results</Link> : null}
  </section>;
}
