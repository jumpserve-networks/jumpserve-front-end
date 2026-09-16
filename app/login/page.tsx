import type { Metadata } from "next";
import { AuthButton } from "@/app/components/auth-button";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to access Jumpserve.",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const errorParam = (await searchParams).error;
  const errorMessage = Array.isArray(errorParam) ? errorParam[0] : errorParam;

  return (
    <main className="space-atmosphere relative flex min-h-[var(--page-height)] items-center justify-center overflow-hidden p-6">
      <Card className="relative z-10 w-full max-w-md rounded-3xl border-rose-200/70 bg-card/90 p-8 text-center shadow-2xl backdrop-blur-md dark:border-slate-600/70 dark:bg-card/88">
        <CardHeader className="gap-0 p-0">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-700 dark:text-teal-300">
            Jumpserve
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">
            Sign in to continue
          </h1>
        </CardHeader>
        <CardContent className="p-0">
          <AuthButton placement="inline" />

          {errorMessage ? (
            <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
              {errorMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
