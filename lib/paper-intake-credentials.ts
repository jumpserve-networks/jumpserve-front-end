import "server-only";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

type Credentials = { openaiApiKey: string; supabaseSecret: string };
// These are application credentials, shared across requests and never user data.
let cached: { id: string; expires: number; value: Promise<Credentials> } | undefined;
export async function paperIntakeCredentials(): Promise<Credentials | null> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (openaiApiKey && supabaseSecret) return { openaiApiKey, supabaseSecret };
  const id = process.env.PAPER_INTAKE_SECRET_ID;
  if (!id) return null;
  if (!cached || cached.id !== id || cached.expires <= Date.now()) {
    const value = (async () => {
      const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1", maxAttempts: 2 });
      try {
        const result = await client.send(new GetSecretValueCommand({ SecretId: id }), { abortSignal: AbortSignal.timeout(8000) });
        const secret = JSON.parse(result.SecretString ?? "null");
        if (!secret || typeof secret.OPENAI_API_KEY !== "string" || !secret.OPENAI_API_KEY.trim() || typeof secret.SUPABASE_SECRET_KEY !== "string" || !secret.SUPABASE_SECRET_KEY.trim()) throw new Error("Incomplete server credentials");
        return { openaiApiKey: secret.OPENAI_API_KEY, supabaseSecret: secret.SUPABASE_SECRET_KEY };
      } catch { throw new Error("Paper preparation server credentials are temporarily unavailable."); }
      finally { client.destroy(); }
    })();
    cached = { id, expires: Date.now() + 300_000, value };
    void value.catch(() => { if (cached?.value === value) cached = undefined; });
  }
  return cached.value;
}
