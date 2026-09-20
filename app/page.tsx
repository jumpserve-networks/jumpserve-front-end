import type { Metadata } from "next";
import { ModuleChooser } from "@/app/components/module-chooser";
import { PublicLandingPage } from "@/app/components/public-landing-page";
import { isGoogleAuthenticatedUser } from "@/lib/auth-provider";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Network Experimentation",
  description: "JumpServe is a platform for networking research. Configure experiments, inspect network measurements, and compare congestion control behavior.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return isGoogleAuthenticatedUser(user)
    ? <ModuleChooser nextPath={nextPath} />
    : <PublicLandingPage nextPath={nextPath} />;
}
