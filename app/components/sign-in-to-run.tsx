import Link from "next/link";
import { Button } from "@/app/components/ui/button";

export function SignInToRun({ nextPath }: { nextPath: string }) {
  return <div className="space-y-4 py-4">
    <p className="text-sm text-muted-foreground">Test results are public. Sign in to configure and run a test.</p>
    <Button nativeButton={false} render={<Link href={`/login?${new URLSearchParams({ next: nextPath })}`} />}>Sign in to run tests</Button>
  </div>;
}
