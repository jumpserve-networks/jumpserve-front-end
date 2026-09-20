import { createClient } from "@/lib/supabase/client";

export async function realWorldRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = process.env.NEXT_PUBLIC_BENCHMARK_API_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new Error("The real-world test service is not configured. Contact the site administrator.");
  const { data: { session } } = await createClient().auth.getSession();
  if (!session) throw new Error("Your session has expired. Sign in again.");
  const response = await fetch(`${base}/real-world${path}`, {
    ...options, cache: "no-store",
    headers: { ...options.headers, Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
  });
  let result;
  try { result = await response.json(); } catch { throw new Error(`Test service returned an unreadable response (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(result.error || `Test request failed (HTTP ${response.status}).`);
  return result as T;
}
