import { notFound } from "next/navigation";
import { requireGoogleUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readPlatform } from "@/lib/platform-updates-store";
import { PLATFORM_UPDATES_PATH, platformId } from "@/lib/platform-updates";
import { PlatformUpdates } from "@/app/components/platform-updates";

export const metadata = { title: "Platform Update" };
export default async function PlatformUpdatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!platformId(id)) notFound();
  await requireGoogleUser(`${PLATFORM_UPDATES_PATH}/${id}`);
  const initial = await readPlatform(await createClient(), id);
  if (initial.status === "available" && !initial.data.tasks.length) notFound();
  return <PlatformUpdates key={initial.status === "available" ? `${initial.data.operator_id}:${initial.data.operator_role}` : initial.status} initial={initial} taskId={id} />;
}
