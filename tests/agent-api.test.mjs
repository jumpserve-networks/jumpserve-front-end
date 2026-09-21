import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { sendMessage } from "../lib/agent-api.ts";

const originalUrl = process.env.NEXT_PUBLIC_AGENT_URL;
const response = {
  response: "Run #42 used Cubic and BBR.",
  tool_events: [{ name: "get_run_results", input: { parent_run_id: 42 } }],
  session_id: "session-123",
};
const send = () => sendMessage("Explain parent run #42", "session-123", "verified-session");

beforeEach(() => { process.env.NEXT_PUBLIC_AGENT_URL = "https://agent.example.test/"; });
afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_AGENT_URL;
  else process.env.NEXT_PUBLIC_AGENT_URL = originalUrl;
});

test("missing chat configuration never posts to the current frontend page", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected request"); });
  for (const value of [undefined, "", "   "]) {
    if (value === undefined) delete process.env.NEXT_PUBLIC_AGENT_URL;
    else process.env.NEXT_PUBLIC_AGENT_URL = value;
    await assert.rejects(send, /AI chat is not configured/);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("invalid, relative, or credential-bearing chat URLs are rejected before sending", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected request"); });
  for (const value of ["/chat", "/", "not-a-url", "ftp://example.test", "javascript:alert(1)", "https://example.test?key=secret", "https://example.test#fragment", "https://user:password@example.test"]) {
    process.env.NEXT_PUBLIC_AGENT_URL = value;
    await assert.rejects(send, /AI chat service URL is invalid/);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("HTML responses report their HTTP status without exposing markup", async (t) => {
  let status;
  t.mock.method(globalThis, "fetch", async () => new Response("<!DOCTYPE html><html>Frontend or gateway</html>", {
    status, headers: { "Content-Type": "text/html" },
  }));
  for (status of [200, 404, 502]) {
    await assert.rejects(send, (error) => {
      assert.match(error.message, /AI chat service returned a non-JSON response/);
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.doesNotMatch(error.message, /<!DOCTYPE|<html>|Unexpected token/);
      return true;
    });
  }
});

test("chat uses the exact configured endpoint and preserves message and session context", async (t) => {
  process.env.NEXT_PUBLIC_AGENT_URL = " https://agent.example.test/invoke/ ";
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(response), {
    headers: { "Content-Type": "text/plain" },
  }));
  assert.deepEqual(await send(), response);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "https://agent.example.test/invoke/");
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, "Bearer verified-session");
  assert.equal(options.headers.Accept, "application/json");
  assert.equal(options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(options.body), {
    message: "Explain parent run #42", session_id: "session-123",
  });
});

test("chat requires a session and never sends anonymous requests", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json(response));
  await assert.rejects(() => sendMessage("Hello", "session-123", ""), /Sign in/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("malformed chat responses are rejected before rendering", async (t) => {
  let body;
  t.mock.method(globalThis, "fetch", async () => Response.json(body));
  for (body of [null, [], {}, { ...response, response: {} }, { ...response, session_id: " " },
    { ...response, tool_events: null }, { ...response, tool_events: [null] },
    { ...response, tool_events: [{ name: 123 }] }, { ...response, tool_events: [{ name: " " }] }]) {
    await assert.rejects(send, /AI chat service returned an invalid response/);
  }
});

test("structured API errors remain useful and unknown failures show a status", async (t) => {
  let body;
  t.mock.method(globalThis, "fetch", async () => Response.json(body, { status: 429 }));
  for (body of [{ error: "message is required" }, { message: "Too many requests" }]) {
    await assert.rejects(send, { message: body.error ?? body.message });
  }
  body = {};
  await assert.rejects(send, /AI chat request failed \(HTTP 429\)/);
});
