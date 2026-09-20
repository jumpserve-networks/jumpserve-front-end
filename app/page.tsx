import type { Metadata } from "next";
import { ModuleChooser } from "@/app/components/module-chooser";
import { requireGoogleUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Test Modules",
  description: "Choose a JumpServe module for network testing and analysis.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  await requireGoogleUser(nextPath ? `/?${new URLSearchParams({ next: nextPath })}` : "/");
  return <ModuleChooser nextPath={nextPath} />;
}
