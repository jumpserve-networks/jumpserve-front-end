import type { AssessmentBundle } from "@/lib/jumpserve-assessment-bundle";
import { PAPER_ASSESSMENT_STEPS, parsePaperAssessmentStep } from "@/lib/paper-assessment-wizard";
import { PAPER_BREAKDOWN_SECTIONS } from "@/lib/research-paper-breakdown";
import { researchSearchSuffix } from "@/lib/research-pathways";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { ExperimentScript } from "./experiment-script";
import { PaperAssessmentSteps } from "./paper-assessment-steps";

const outcomeLabel = {
  untested: "Untested",
  inconclusive: "Inconclusive",
  reproduced: "Reproduced",
  discrepant: "Discrepant",
};

function PaperBreakdown({ claims, wizard }: Pick<AssessmentBundle, "claims" | "wizard">) {
  return <section className="space-y-6" aria-labelledby="skill-breakdown">
    <h2 id="skill-breakdown" className="text-lg font-semibold">Paper Breakdown</h2>
    {wizard ? PAPER_BREAKDOWN_SECTIONS.map(section => {
      const items = wizard.breakdown.filter(item => item.section === section.id);
      return items.length ? <section key={section.id} className="space-y-3">
        <h3 className="font-semibold">{section.title}</h3>
        <ul className="space-y-3 pl-4 text-sm">{items.map((item, index) => <li key={index}>
          <p className="whitespace-pre-wrap">{item.description}</p>
          <p className="text-xs text-muted-foreground">PDF {item.pages.length === 1 ? "page" : "pages"} {item.pages.join(", ")}</p>
        </li>)}</ul>
      </section> : null;
    }) : null}
    <section className="space-y-3">
      <h3 className="font-semibold">Claims and decision rules</h3>
      {claims.map(claim => <div key={claim.id} className="space-y-1 border-t py-3">
        <p className="text-sm font-medium">{claim.id} · PDF page {claim.page}</p>
        <p className="whitespace-pre-wrap">{claim.claim}</p>
        <p className="text-sm whitespace-pre-wrap"><strong>Criterion</strong> {claim.criterion}</p>
      </div>)}
    </section>
  </section>;
}

function ExperimentSteps({ methods, wizard }: Pick<AssessmentBundle, "methods" | "wizard">) {
  return <section className="space-y-5" aria-labelledby="skill-plan">
    <h2 id="skill-plan" className="text-lg font-semibold">Experiment Steps</h2>
    {wizard?.experiments.map((experiment, index) => <section key={index} className="space-y-2 border-t py-3">
      <h3 className="font-semibold">{experiment.title}</h3>
      <p className="text-sm text-muted-foreground">Claims {experiment.claim_ids.join(", ")}</p>
      <ol className="list-decimal space-y-3 pl-5 text-sm">{experiment.steps.map((step, stepIndex) => <li key={stepIndex}>
        <h4 className="font-medium">{step.title}</h4>
        <p className="whitespace-pre-wrap">{step.instructions}</p>
      </li>)}</ol>
    </section>)}
    {methods.length ? <section className="space-y-3">
      <h3 className="font-semibold">{wizard ? "Recorded methods" : "Experiment methods"}</h3>
      {methods.map((method, index) => <div key={index} className="space-y-2 border-t py-3">
        <h4 className="font-medium">{method.title}</h4>
        <p className="whitespace-pre-wrap">{method.procedure}</p>
      </div>)}
    </section> : null}
    {!wizard && methods.length === 0 ? <p>Experiment steps are unavailable for this assessment.</p> : null}
  </section>;
}

function SharedCommands({ label, commands }: { label: string; commands: string }) {
  return <details className="space-y-2">
    <summary className="cursor-pointer text-sm font-medium">{label}</summary>
    <pre tabIndex={0} aria-label={label} className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs"><code>{commands}</code></pre>
  </details>;
}

function ExperimentSetup({ methods, wizard }: Pick<AssessmentBundle, "methods" | "wizard">) {
  const hasMethodCommands = methods.some(method => method.commands);
  return <section className="space-y-6" aria-labelledby="skill-execution">
    <h2 id="skill-execution" className="text-lg font-semibold">Setup</h2>
    {wizard?.experiments.map((experiment, index) => <section key={index} className="space-y-3 border-t py-3">
      <h3 className="font-semibold">{experiment.title}</h3>
      {experiment.prerequisites.length ? <div className="space-y-1 text-sm">
        <p className="font-medium">Prerequisites</p>
        <ul className="list-disc space-y-1 pl-5">{experiment.prerequisites.map((item, i) => <li key={i}>{item}</li>)}</ul>
      </div> : null}
      {experiment.command_notes ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{experiment.command_notes}</p> : null}
      {experiment.scripts?.length ? <div className="space-y-2">
        <h4 className="text-sm font-medium">Experiment scripts</h4>
        <p className="text-sm text-muted-foreground">Save each file at the path shown, relative to the experiment directory.</p>
        <ul className="space-y-2">{experiment.scripts.map(script => <li key={script.path}><ExperimentScript {...script} /></li>)}</ul>
      </div> : null}
      {experiment.setup ? <SharedCommands label="Setup commands" commands={experiment.setup} /> : null}
      {experiment.steps.map((step, i) => step.commands ? <SharedCommands key={i} label={`Step ${i + 1} · ${step.title}`} commands={step.commands} /> : null)}
      {experiment.cleanup ? <SharedCommands label="Cleanup commands" commands={experiment.cleanup} /> : null}
      {!experiment.setup && !experiment.cleanup && !experiment.steps.some(step => step.commands) && !experiment.command_notes ? <p className="text-sm">Shared commands are unavailable for this experiment.</p> : null}
    </section>)}
    {methods.map((method, i) => method.commands ? <SharedCommands key={i} label={method.title} commands={method.commands} /> : null)}
    {!wizard && !hasMethodCommands ? <p className="text-sm">Shared commands are unavailable for this assessment.</p> : null}
  </section>;
}

function ExperimentResults({ summary, claims, runs, limitations }: Pick<AssessmentBundle, "summary" | "claims" | "runs" | "limitations">) {
  const claimsById = new Map(claims.map(claim => [claim.id, claim]));
  return <section className="space-y-6" aria-labelledby="skill-results">
    <h2 id="skill-results" className="text-lg font-semibold">Experiment Results</h2>
    <p className="whitespace-pre-wrap">{summary}</p>
    <section className="space-y-3">
      <h3 className="font-semibold">Claim findings</h3>
      {claims.map(claim => <div key={claim.id} className="space-y-1 border-t py-3">
        <p className="text-sm font-medium">{claim.id} · {outcomeLabel[claim.outcome]}</p>
        <p className="text-sm whitespace-pre-wrap">{claim.finding}</p>
      </div>)}
    </section>
    <section className="space-y-4">
      <h3 className="font-semibold">Local measurements</h3>
      {runs.length === 0 ? <p>No measurements were included in this assessment.</p> : null}
      {runs.map(run => <div key={run.id} className="space-y-2 border-t py-3">
        <h4 className="font-medium">Run {run.id} · {run.started_at}</h4>
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
    {limitations.length ? <section className="space-y-2">
      <h3 className="font-semibold">Limitations</h3>
      <ul className="list-disc space-y-1 pl-5">{limitations.map((item, i) => <li key={i}>{item}</li>)}</ul>
    </section> : null}
  </section>;
}

export function SkillAssessment({ bundle, path, query }: { bundle: AssessmentBundle; path: string; query: Record<string, string | string[] | undefined> }) {
  const { paper } = bundle;
  const requested = parsePaperAssessmentStep(query.step);
  const current = requested && requested !== "upload" ? requested : "breakdown";
  const hrefs = Object.fromEntries(PAPER_ASSESSMENT_STEPS.map(step => [step.id, `${path}${researchSearchSuffix({ ...query, step: step.id })}`]));
  return <article className="min-w-0 space-y-7 break-words">
    <PaperAssessmentSteps current={current} assessment implementation execution results hrefs={hrefs} />
    <header className="space-y-2">
      <p className="text-sm text-muted-foreground">Local JumpServe assessment</p>
      <h1 className="text-2xl font-semibold">{paper.title}</h1>
      {paper.authors.length ? <p>{paper.authors.join(", ")}</p> : null}
      <p className="text-sm">{paper.domain}</p>
      {paper.url ? <a className="text-primary underline" href={paper.url} rel="noreferrer">Source paper</a> : null}
      <p className="text-sm text-muted-foreground">Source SHA-256 <code className="break-all">{paper.sha256}</code> · {paper.byte_count.toLocaleString("en-US")} bytes</p>
    </header>
    {current === "breakdown" ? <PaperBreakdown claims={bundle.claims} wizard={bundle.wizard} /> : null}
    {current === "implementation" ? <ExperimentSteps methods={bundle.methods} wizard={bundle.wizard} /> : null}
    {current === "execution" ? <ExperimentSetup methods={bundle.methods} wizard={bundle.wizard} /> : null}
    {current === "results" ? <ExperimentResults summary={bundle.summary} claims={bundle.claims} runs={bundle.runs} limitations={bundle.limitations} /> : null}
  </article>;
}
