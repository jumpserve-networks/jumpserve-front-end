import type { Metadata } from "next";

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
    <main className="space-atmosphere relative flex min-h-dvh items-center justify-center overflow-hidden p-6">
      <section className="relative z-10 w-full max-w-md rounded-3xl border border-rose-200/70 bg-white/90 p-8 text-center shadow-2xl backdrop-blur-md dark:border-slate-600/70 dark:bg-slate-900/88">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-700 dark:text-teal-300">
          Jumpserve
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">
          Sign in to continue
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Use the Google sign-in button in the top-right corner to access the
          run explorer, aggregate graphs, benchmarks, and AI tools.
        </p>

        {errorMessage ? (
          <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {errorMessage}
          </p>
        ) : null}
      </section>
    </main>
  );
}
