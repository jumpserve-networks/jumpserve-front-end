import { PublishedStudies } from "@/app/components/research-workflow/published-studies";

export const dynamic = "force-dynamic";

export default function Results() {
  return <PublishedStudies kind="idea" />;
}
