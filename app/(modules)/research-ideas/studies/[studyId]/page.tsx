import { PublishedStudy, type PublishedStudyProps } from "@/app/components/research-workflow/published-studies";

export const dynamic = "force-dynamic";

export default function Study(props: PublishedStudyProps) {
  return <PublishedStudy {...props} kind="idea" />;
}
