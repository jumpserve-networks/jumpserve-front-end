import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingPageShell } from "@/app/components/landing-page-shell";
import { getTestModule } from "@/lib/test-modules";

type ModulePageProps = { params: Promise<{ moduleId: string }> };

export async function generateMetadata({ params }: ModulePageProps): Promise<Metadata> {
  const testModule = getTestModule((await params).moduleId);
  return { title: testModule?.name ?? "Module not found", description: testModule?.description };
}

export default async function ModulePage({ params }: ModulePageProps) {
  const testModule = getTestModule((await params).moduleId);
  if (!testModule || testModule.status !== "available") notFound();
  return <LandingPageShell module={testModule} />;
}
