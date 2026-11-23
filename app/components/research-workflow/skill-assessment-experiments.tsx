import type { AssessmentBundle } from "@/lib/jumpserve-assessment-bundle";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { ExperimentScript } from "./experiment-script";

type Experiment = NonNullable<AssessmentBundle["wizard"]>["experiments"][number];
type Claim = AssessmentBundle["claims"][number];
type Run = AssessmentBundle["runs"][number];

export function groupExperimentRuns(experiments: Experiment[], runs: Run[]) {
  const byId = new Map(experiments.map(experiment => [experiment.id, experiment]));
  const byExperiment = new Map<Experiment, Run[]>();
  const unassigned: Run[] = [];
  for (const run of runs) {
    let experiment: Experiment | undefined;
    if (run.experiment_id) {
      experiment = byId.get(run.experiment_id);
    } else {
      const claims = [...new Set(run.measurements.map(measurement => measurement.claim_id))];
      const matches = experiments.filter(candidate => claims.every(id => candidate.claim_ids.includes(id)));
      if (claims.length && matches.length === 1) experiment = matches[0];
    }
    if (!experiment) {
      unassigned.push(run);
      continue;
    }
    const group = byExperiment.get(experiment);
    if (group) group.push(run);
    else byExperiment.set(experiment, [run]);
  }
  return { byExperiment, unassigned };
}

const outcomeLabel = {
  untested: "Untested",
  inconclusive: "Inconclusive",
  reproduced: "Reproduced",
  discrepant: "Discrepant",
};

export function ClaimFindings({ claims }: { claims: Claim[] }) {
  return <ul className="space-y-2">{claims.map(claim => <li key={claim.id} className="space-y-1">
    <p className="text-sm font-medium">{claim.id} · {outcomeLabel[claim.outcome]}</p>
    <p className="whitespace-pre-wrap text-sm">{claim.finding}</p>
  </li>)}</ul>;
}

export function RunMeasurements({ run, claims, linkedByClaim = false }: {
  run: Run;
  claims: ReadonlyMap<string, Claim>;
  linkedByClaim?: boolean;
}) {
  return <div className="space-y-2 border-t py-3">
    <p className="font-medium">Run {run.id} · {run.started_at}</p>
    {linkedByClaim ? <p className="text-xs text-muted-foreground">Matched to this experiment by recorded claim references.</p> : null}
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
        <TableCell title={claims.get(entry.claim_id)?.claim}>{entry.claim_id}</TableCell>
        <TableCell>{entry.metric}</TableCell><TableCell>{entry.units}</TableCell>
        <TableCell>{entry.paper_value ?? "Unavailable"}</TableCell><TableCell>{entry.observed_value}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </div>;
}

export function SharedCommands({ label, commands }: { label: string; commands: string }) {
  return <details className="space-y-2">
    <summary className="cursor-pointer text-sm font-medium">{label}</summary>
    <pre tabIndex={0} aria-label={label} className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs"><code>{commands}</code></pre>
  </details>;
}

function ExperimentResources({ experiment }: { experiment: Experiment }) {
  return <>
    {experiment.prerequisites.length ? <div className="space-y-1 text-sm">
      <p className="font-medium">Prerequisites</p>
      <ul className="list-disc space-y-1 pl-5">{experiment.prerequisites.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </div> : null}
    {experiment.command_notes ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{experiment.command_notes}</p> : null}
    {experiment.scripts?.length ? <div className="space-y-2">
      <p className="text-sm font-medium">Experiment scripts</p>
      <p className="text-sm text-muted-foreground">Save each file at the path shown, relative to the experiment directory.</p>
      <ul className="space-y-2">{experiment.scripts.map(script => <li key={script.path}><ExperimentScript {...script} /></li>)}</ul>
    </div> : null}
    {experiment.setup ? <SharedCommands label="Setup commands" commands={experiment.setup} /> : null}
  </>;
}

export type ExperimentEvidence = {
  claims: ReadonlyMap<string, Claim>;
  byExperiment: ReadonlyMap<Experiment, Run[]>;
};

export function SkillExperimentOutline({ experiments, prefix, sourceCount, stage, evidence }: {
  experiments: Experiment[];
  prefix: string;
  sourceCount: number;
  stage: "breakdown" | "implementation" | "execution" | "results";
  evidence?: ExperimentEvidence;
}) {
  const showCommands = stage === "execution" || stage === "results";
  return <ol role="list" aria-label="Planned experiments" className="space-y-4">
    {experiments.map((experiment, index) => {
      const number = `${prefix}.${sourceCount + index + 1}`;
      const headingId = `skill-experiment-${index}`;
      const runs = evidence?.byExperiment.get(experiment) ?? [];
      const findings = evidence ? experiment.claim_ids.flatMap(id => {
        const claim = evidence.claims.get(id);
        return claim ? [claim] : [];
      }) : [];
      return <li key={experiment.id ? `id:${experiment.id}` : number}>
        <section aria-labelledby={headingId} className="min-w-0 space-y-3 border-t py-3">
          <h4 id={headingId} className="font-semibold"><span className="mr-2 tabular-nums text-muted-foreground">{number}</span> {experiment.title}</h4>
          <p className="text-sm text-muted-foreground">Claims {experiment.claim_ids.join(", ")}</p>
          {showCommands ? <ExperimentResources experiment={experiment} /> : null}
          {stage !== "breakdown" ? <ol role="list" className="space-y-4 border-l pl-3 text-sm sm:pl-5">
            {experiment.steps.map((step, stepIndex) => {
              const stepNumber = `${number}.${stepIndex + 1}`;
              return <li key={stepNumber} className="space-y-2">
                <h5 className="font-medium"><span className="mr-2 tabular-nums text-muted-foreground">{stepNumber}</span> {step.title}</h5>
                <p className="whitespace-pre-wrap">{step.instructions}</p>
                {showCommands ? step.commands
                  ? <SharedCommands label={`Commands for step ${stepNumber}`} commands={step.commands} />
                  : <p className="text-xs text-muted-foreground">No commands were recorded for this step.</p> : null}
              </li>;
            })}
          </ol> : null}
          {showCommands && experiment.cleanup ? <SharedCommands label="Cleanup commands" commands={experiment.cleanup} /> : null}
          {evidence ? <div className="space-y-3 border-l pl-3 sm:pl-5">
            <h5 className="font-semibold">Results</h5>
            {findings.length ? <div className="space-y-2">
              <p className="text-sm font-medium">Assessment-level claim findings</p>
              <ClaimFindings claims={findings} />
            </div> : null}
            {runs.length ? runs.map(run => <RunMeasurements key={run.id} run={run} claims={evidence.claims} linkedByClaim={!run.experiment_id} />)
              : <p className="text-sm text-muted-foreground">No measurement runs are linked to this experiment.</p>}
          </div> : null}
        </section>
      </li>;
    })}
  </ol>;
}
