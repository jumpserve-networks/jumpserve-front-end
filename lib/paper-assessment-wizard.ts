export const PAPER_ASSESSMENT_STEPS = [
  { id: "upload", title: "Paper Upload" },
  { id: "breakdown", title: "Paper Breakdown" },
  { id: "implementation", title: "Experiment Steps" },
  { id: "execution", title: "Setup" },
  { id: "results", title: "Experiment Results" },
] as const;
export type PaperAssessmentStep = typeof PAPER_ASSESSMENT_STEPS[number]["id"];
export function parsePaperAssessmentStep(value: unknown): PaperAssessmentStep | undefined {
  if (value === "queue") return "execution";
  return PAPER_ASSESSMENT_STEPS.find(step => step.id === value)?.id;
}
