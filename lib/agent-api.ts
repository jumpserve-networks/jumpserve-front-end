function getAgentUrl(): string {
  const value = process.env.NEXT_PUBLIC_AGENT_URL?.trim();
  if (!value) {
    throw new Error('AI chat is not configured. Please contact the site administrator.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The AI chat service URL is invalid. Please contact the site administrator.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash || url.username || url.password) {
    throw new Error('The AI chat service URL is invalid. Please contact the site administrator.');
  }

  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface AgentResponse {
  response: string;
  tool_events: Array<{ name: string; input: unknown }>;
  session_id: string;
}

export type ChatModule = "congestion-control-emulated" | "congestion-control-real-world";

export async function sendMessage(
  message: string,
  sessionId: string,
  accessToken: string,
  moduleId: ChatModule = "congestion-control-emulated",
): Promise<AgentResponse> {
  if (!accessToken) throw new Error("Sign in to chat with the AI.");
  const url = getAgentUrl();
  if (moduleId === "congestion-control-real-world") {
    // Older agents ignore module_id. Never send them a real-world question or action.
    const capability = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'capabilities', module_id: moduleId }),
    });
    const data: unknown = await capability.json().catch(() => null);
    if (!capability.ok || !isRecord(data) || !Array.isArray(data.modules) || !data.modules.includes(moduleId)) {
      throw new Error('The AI service has not enabled real-world chat yet. Please contact the site administrator.');
    }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      message,
      session_id: sessionId,
      module_id: moduleId,
    }),
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`The AI chat service returned a non-JSON response (HTTP ${res.status}). Please try again or contact the site administrator.`);
  }

  if (!res.ok) {
    const message = isRecord(data) ? data.error || data.message : null;
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message
        : `AI chat request failed (HTTP ${res.status}). Please try again.`,
    );
  }

  if (
    !isRecord(data) || typeof data.response !== 'string' ||
    typeof data.session_id !== 'string' || !data.session_id.trim() ||
    !Array.isArray(data.tool_events) ||
    !data.tool_events.every((event) => isRecord(event) && typeof event.name === 'string' && event.name.trim())
  ) {
    throw new Error('The AI chat service returned an invalid response. Please try again or contact the site administrator.');
  }

  if (moduleId === "congestion-control-real-world" && data.module_id !== moduleId) {
    throw new Error('The AI service has not enabled real-world chat yet. Please contact the site administrator.');
  }

  return {
    response: data.response,
    session_id: data.session_id,
    tool_events: data.tool_events.map((event) => ({ name: event.name, input: event.input })),
  };
}
