import { AssessmentResult, type AssessmentResultProps } from "@/app/components/research-workflow/assessment-results";

export const dynamic = "force-dynamic";

export default function Study(props: AssessmentResultProps) {
  return <AssessmentResult {...props} kind="idea" />;
}
