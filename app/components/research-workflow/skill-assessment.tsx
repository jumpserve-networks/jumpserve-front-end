import { assessmentBreakdownSteps, type AssessmentBundle } from "@/lib/jumpserve-assessment-bundle";
import { EXPERIMENT_SETUP_TITLE, PAPER_ASSESSMENT_STEPS, parsePaperAssessmentStep } from "@/lib/paper-assessment-wizard";
import { paperDetailTree } from "@/lib/paper-detail-dependencies";
import { PAPER_BREAKDOWN_SECTIONS } from "@/lib/research-paper-breakdown";
import { researchSearchSuffix } from "@/lib/research-pathways";
import { PaperAssessmentSteps } from "./paper-assessment-steps";
import { PaperDetailOutline } from "./paper-detail-outline";
import { ClaimFindings, groupExperimentRuns, RunMeasurements, SharedCommands, SkillExperimentOutline, type ExperimentEvidence } from "./skill-assessment-experiments";

type Wizard = NonNullable<AssessmentBundle["wizard"]>;
type Stage = "breakdown" | "implementation" | "execution" | "results";

function AssessmentOutline({ wizard, stage, evidence }: {
  wizard: Wizard;
  stage: Stage;
  evidence?: ExperimentEvidence;
}) {
  return <div className="space-y-5">{PAPER_BREAKDOWN_SECTIONS.map((section, index) => {
    const prefix = String(index + 1);
    const title = `${prefix}. ${section.title}`;
    const id = `skill-breakdown-${section.id}`;
    const nodes = paperDetailTree(assessmentBreakdownSteps(wizard.breakdown, section.id), prefix);
    const sourceSteps = nodes.length ? <PaperDetailOutline nodes={nodes} renderDetail={item => <>
      {item.title ? <h4 className="font-medium">{item.title}</h4> : null}
      <p className="whitespace-pre-wrap">{item.description}</p>
      <p className="text-xs text-muted-foreground">PDF {item.pages.length === 1 ? "page" : "pages"} {item.pages.join(", ")}</p>
    </>} /> : <p className="text-sm text-muted-foreground">No paper breakdown steps were recorded for this section.</p>;
    if (stage !== "breakdown" && section.id !== "experiment") return <details key={section.id}>
      <summary className="cursor-pointer font-semibold">{title}</summary>
      <div className="pt-3">{sourceSteps}</div>
    </details>;
    return <section key={section.id} aria-labelledby={id} className="space-y-3">
      <h3 id={id} className="font-semibold">{title}</h3>
      {sourceSteps}
      {section.id === "experiment" ? <SkillExperimentOutline
        experiments={wizard.experiments} prefix={prefix} sourceCount={nodes.length} stage={stage} evidence={evidence}
      /> : null}
    </section>;
  })}</div>;
}

function PaperBreakdown({ claims, wizard }: Pick<AssessmentBundle, "claims" | "wizard">) {
  return <section className="space-y-6" aria-labelledby="skill-breakdown">
    <h2 id="skill-breakdown" className="text-lg font-semibold">Paper Breakdown</h2>
    {wizard ? <AssessmentOutline wizard={wizard} stage="breakdown" /> : null}
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

function ExperimentPlan({ methods, wizard, stage }: Pick<AssessmentBundle, "methods" | "wizard"> & {
  stage: "implementation" | "execution";
}) {
  const setup = stage === "execution";
  const savedMethods = setup ? methods.filter(method => method.commands) : methods;
  return <section className="space-y-5" aria-labelledby="skill-plan">
    <h2 id="skill-plan" className="text-lg font-semibold">{setup ? EXPERIMENT_SETUP_TITLE : "Experiment Steps"}</h2>
    {wizard ? <AssessmentOutline wizard={wizard} stage={stage} /> : null}
    {savedMethods.length ? <section className="space-y-3">
      <h3 className="font-semibold">{wizard ? "Recorded methods" : "Experiment methods"}</h3>
      {savedMethods.map((method, index) => <div key={index} className="space-y-2 border-t py-3">
        <h4 className="font-medium">{method.title}</h4>
        <p className="whitespace-pre-wrap">{method.procedure}</p>
        {setup && method.commands ? <SharedCommands label="Commands" commands={method.commands} /> : null}
      </div>)}
    </section> : null}
    {!wizard && savedMethods.length === 0 ? <p>{setup
      ? "Shared commands are unavailable for this assessment."
      : "Experiment steps are unavailable for this assessment."}</p> : null}
  </section>;
}

function ExperimentResults({ summary, claims, runs, limitations, wizard }: Pick<AssessmentBundle, "summary" | "claims" | "runs" | "limitations" | "wizard">) {
  const claimsById = new Map(claims.map(claim => [claim.id, claim]));
  const { byExperiment, unassigned } = groupExperimentRuns(wizard?.experiments ?? [], runs);
  const experimentClaims = new Set(wizard?.experiments.flatMap(experiment => experiment.claim_ids));
  const otherClaims = claims.filter(claim => !experimentClaims.has(claim.id));
  return <section className="space-y-6" aria-labelledby="skill-results">
    <h2 id="skill-results" className="text-lg font-semibold">Experiment Results</h2>
    <p className="whitespace-pre-wrap">{summary}</p>
    {wizard ? <AssessmentOutline wizard={wizard} stage="results" evidence={{ claims: claimsById, byExperiment }} /> : null}
    {otherClaims.length ? <section className="space-y-3">
      <h3 className="font-semibold">Claim findings</h3>
      <ClaimFindings claims={otherClaims} />
    </section> : null}
    {unassigned.length || !wizard ? <section className="space-y-4">
      <h3 className="font-semibold">{wizard ? "Assessment-level measurements" : "Local measurements"}</h3>
      {wizard ? <p className="text-sm text-muted-foreground">These runs stay at assessment level because their saved claim references are insufficient to identify one experiment.</p> : null}
      {runs.length === 0 ? <p>No measurements were included in this assessment.</p> : null}
      {unassigned.map(run => <RunMeasurements key={run.id} run={run} claims={claimsById} />)}
    </section> : null}
    {limitations.length ? <section className="space-y-2">
      <h3 className="font-semibold">Limitations</h3>
      <ul className="list-disc space-y-1 pl-5">{limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </section> : null}
  </section>;
}

export function SkillAssessment({ bundle, path, query, pdfReady = true }: {
  bundle: AssessmentBundle; path: string; query: Record<string, string | string[] | undefined>; pdfReady?: boolean;
}) {
  const { paper, claims, methods, wizard, summary, runs, limitations } = bundle;
  const requested = parsePaperAssessmentStep(query.step);
  const current = requested && requested !== "upload" ? requested : "breakdown";
  const hrefs = Object.fromEntries(PAPER_ASSESSMENT_STEPS.map(step => [step.id, `${path}${researchSearchSuffix({ ...query, step: step.id })}`]));
  return <article className="min-w-0 space-y-7 break-words">
    <PaperAssessmentSteps current={current} assessment implementation execution results hrefs={hrefs} />
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">{paper.title}</h1>
      {paper.authors.length ? <p>{paper.authors.join(", ")}</p> : null}
      <p className="text-sm">{paper.domain}</p>
      {paper.url ? <a className="text-primary underline" href={paper.url} rel="noreferrer">Source paper</a> : null}
      {paper.pdf_copy && pdfReady ? <p><a className="text-sm text-primary underline" href={`${path}/paper`}>Download source PDF</a></p> : null}
    </header>
    {current === "breakdown" ? <PaperBreakdown claims={claims} wizard={wizard} /> : null}
    {current === "implementation" || current === "execution" ? <ExperimentPlan methods={methods} wizard={wizard} stage={current} /> : null}
    {current === "results" ? <ExperimentResults summary={summary} claims={claims} runs={runs} limitations={limitations} wizard={wizard} /> : null}
  </article>;
}
