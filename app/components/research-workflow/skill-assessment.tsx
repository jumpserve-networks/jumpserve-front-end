import type { AssessmentBundle } from "@/lib/jumpserve-assessment-bundle";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";

const outcomeLabel = {
  untested: "Untested",
  inconclusive: "Inconclusive",
  reproduced: "Reproduced",
  discrepant: "Discrepant",
};

export function SkillAssessment({ bundle }: { bundle: AssessmentBundle }) {
  const { paper, claims, methods, runs, limitations } = bundle;
  const claimsById = new Map(claims.map(claim => [claim.id, claim]));
  return <article className="min-w-0 space-y-7 break-words">
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Local assessment shared by a JumpServe user</p>
      <h1 className="text-2xl font-semibold">{paper.title}</h1>
      {paper.authors.length > 0 && <p>{paper.authors.join(", ")}</p>}
      <p className="text-sm">{paper.domain}</p>
      {paper.url && <a className="text-primary underline" href={paper.url} rel="noreferrer">Source paper</a>}
      <p className="text-sm text-muted-foreground">Source SHA-256 <code className="break-all">{paper.sha256}</code> · {paper.byte_count.toLocaleString("en-US")} bytes</p>
      <p className="whitespace-pre-wrap">{bundle.summary}</p>
    </div>
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Claims and findings</h2>
      {claims.map(claim => <div key={claim.id} className="space-y-1 border-t py-3">
        <p className="text-sm font-medium">{outcomeLabel[claim.outcome]} · {claim.id} · PDF page {claim.page}</p>
        <p className="whitespace-pre-wrap">{claim.claim}</p>
        <p className="text-sm"><strong>Criterion</strong> {claim.criterion}</p>
        <p className="text-sm whitespace-pre-wrap"><strong>Finding</strong> {claim.finding}</p>
      </div>)}
    </section>
    {methods.length > 0 && <section className="space-y-3">
      <h2 className="text-xl font-semibold">Experiment methods</h2>
      {methods.map((method, index) => <div key={index} className="space-y-2 border-t py-3">
        <h3 className="font-medium">{method.title}</h3>
        <p className="whitespace-pre-wrap">{method.procedure}</p>
        {method.commands && <details>
          <summary className="cursor-pointer text-sm font-medium">Shared commands</summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded bg-muted p-3 text-xs"><code>{method.commands}</code></pre>
        </details>}
      </div>)}
    </section>}
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Local measurements</h2>
      {runs.length === 0 && <p>No measurements were included in this assessment.</p>}
      {runs.map(run => <div key={run.id} className="space-y-2 border-t py-3">
        <h3 className="font-medium">Run {run.id} · {run.started_at}</h3>
        <p className="whitespace-pre-wrap text-sm">{run.configuration}</p>
        <p className="text-sm text-muted-foreground">Evidence SHA-256 <code className="break-all">{run.artifact_sha256}</code></p>
        <Table className="text-left">
          <TableCaption className="sr-only">Measurements for run {run.id}</TableCaption>
          <TableHeader><TableRow>
            <TableHead scope="col">Claim</TableHead>
            <TableHead scope="col">Metric</TableHead>
            <TableHead scope="col">Units</TableHead>
            <TableHead scope="col">Paper reported</TableHead>
            <TableHead scope="col">Locally measured</TableHead>
          </TableRow></TableHeader>
          <TableBody>{run.measurements.map((entry, index) => <TableRow key={index}>
            <TableCell title={claimsById.get(entry.claim_id)?.claim}>{entry.claim_id}</TableCell>
            <TableCell>{entry.metric}</TableCell><TableCell>{entry.units}</TableCell>
            <TableCell>{entry.paper_value ?? "Unavailable"}</TableCell><TableCell>{entry.observed_value}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div>)}
    </section>
    <section className="space-y-2">
      <h2 className="text-xl font-semibold">Limitations</h2>
      <ul className="list-disc space-y-1 pl-5">{limitations.map((item, i) => <li key={i}>{item}</li>)}</ul>
      <p className="text-sm text-muted-foreground">JumpServe checks the submission format. Findings and measurements come from the submitter.</p>
    </section>
  </article>;
}
