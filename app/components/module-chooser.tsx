import { PublicLandingPage } from "@/app/components/public-landing-page";

export function ModuleChooser({ nextPath }: { nextPath?: string }) {
  return <PublicLandingPage nextPath={nextPath} />;
}
