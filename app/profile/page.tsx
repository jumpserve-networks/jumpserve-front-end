import { requireGoogleUser } from "@/lib/auth";
import { ProfileEditor } from "@/app/components/profile-editor";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  await requireGoogleUser("/profile");
  return <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6"><h1 className="text-2xl font-semibold">Your profile</h1><ProfileEditor /></main>;
}
