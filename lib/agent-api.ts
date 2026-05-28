const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || '';

export interface AgentResponse {
  response: string;
  tool_events: Array<{ name: string; input: any }>;
  session_id: string;
}

export async function sendMessage(
  message: string,
  sessionId: string,
  userId?: string,
): Promise<AgentResponse> {
  const res = await fetch(AGENT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      session_id: sessionId,
      user_id: userId || 'anonymous',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Agent request failed: ${res.status} ${text}`);
  }

  return res.json();
}
