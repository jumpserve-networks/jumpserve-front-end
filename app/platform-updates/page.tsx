import { requireGoogleUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readPlatform } from "@/lib/platform-updates-store";
import { PLATFORM_UPDATES_PATH } from "@/lib/platform-updates";
import { PlatformUpdates } from "@/app/components/platform-updates";

export const metadata = { title: "Platform Updates" };
export default async function PlatformUpdatesPage() {
  await requireGoogleUser(PLATFORM_UPDATES_PATH);
  const initial = await readPlatform(await createClient());
  return <PlatformUpdates key={initial.status === "available" ? `${initial.data.operator_id}:${initial.data.operator_role}` : initial.status} initial={initial} />;
}
