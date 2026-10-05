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
    message: "Explain parent run #42", session_id: "session-123", module_id: "congestion-control-emulated",
  });
});

test("real-world chat sends its module and rejects an emulated or legacy service response", async (t) => {
  let body = response;
  let supported = false;
  const fetchMock = t.mock.method(globalThis, "fetch", async (_url, options) => {
    if (JSON.parse(options.body).action === "capabilities" && supported) return Response.json({ modules: ["congestion-control-real-world"] });
    return Response.json(body);
  });
  const sendRealWorld = () => sendMessage("Explain this EC2 test", "session-123", "verified-session", "congestion-control-real-world");
  await assert.rejects(sendRealWorld, /has not enabled real-world chat/);
  assert.equal(fetchMock.mock.callCount(), 1, "An old agent never receives the question");
  assert.equal(JSON.parse(fetchMock.mock.calls[0].arguments[1].body).message, undefined);
  supported = true;
  body = { ...response, module_id: "congestion-control-emulated" };
  await assert.rejects(sendRealWorld, /has not enabled real-world chat/);
  body = { ...response, module_id: "congestion-control-real-world" };
  assert.deepEqual(await sendRealWorld(), response);
  assert.equal(JSON.parse(fetchMock.mock.calls.at(-1).arguments[1].body).module_id, "congestion-control-real-world");
});

test("chat requires a session and never sends anonymous requests", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json(response));
  await assert.rejects(() => sendMessage("Hello", "session-123", ""), /Sign in/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("LEO chat probes capability before the question and rejects cross-module answers", async (t) => {
  let supported=false, moduleId="congestion-control-emulated";
  const fetchMock=t.mock.method(globalThis,"fetch",async (_url,options)=> {
    const body=JSON.parse(options.body);
    return Response.json(body.action==="capabilities" ? {modules:supported?["leo-emergency-failover"]:[]} : {...response,module_id:moduleId});
  });
  const sendLeo=()=>sendMessage("Explain Haiti","leo-session","verified-session","leo-emergency-failover");
  await assert.rejects(sendLeo,/has not enabled LEO study chat/);
  assert.equal(fetchMock.mock.callCount(),1);
  assert.equal(JSON.parse(fetchMock.mock.calls[0].arguments[1].body).message,undefined);
  supported=true;
  await assert.rejects(sendLeo,/has not enabled LEO study chat/);
  moduleId="leo-emergency-failover";
  assert.deepEqual(await sendLeo(),response);
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

test("HTTP/2 chat requires module capability and returns prompt and analysis provenance", async (t) => {
  const provenance = { prompt_version: 'http2-evidence-v1', prompt_version_id: 'saved-prompt', prompt_content_sha256: 'hash', analysis_version: 'http2-assessment-v3' };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    return Response.json(body.action === 'capabilities' ? { modules: ['http2-compliance-study'] } : { ...response, ...provenance, module_id: 'http2-compliance-study' });
  });
  const result = await sendMessage('Explain Figure8', 'session-123', 'verified-session', 'http2-compliance-study');
  assert.deepEqual(result.provenance, provenance);
  assert.equal(calls[0].message, undefined);
  assert.equal(calls[1].module_id, 'http2-compliance-study');
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

test('ReliableSketch capability and answer evidence provenance survive the browser API adapter',async(t)=>{
 const provenance={prompt_version:'reliable-evidence-v2',prompt_version_id:'saved-prompt',prompt_content_sha256:'prompt-hash',analysis_version:'reliable-assessment-v1'};
 const answer_provenance={renderer_version:'reliable-renderer-v2',evidence_sha256:'evidence-hash',read_events:[{name:'get_reliable_configuration',input:{configuration_id:'main-zipf0.3-131072-RS'}}]};
 const calls=[];
 t.mock.method(globalThis,'fetch',async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);return Response.json(body.action==='capabilities'?{modules:['reliable-sketch-study']}:{...response,...provenance,answer_provenance,module_id:'reliable-sketch-study'});});
 const result=await sendMessage('Explain memory','session-123','verified-session','reliable-sketch-study');
 assert.equal(calls[0].message,undefined);assert.equal(calls[1].module_id,'reliable-sketch-study');assert.equal(result.provenance.evidence_sha256,'evidence-hash');assert.deepEqual(result.provenance.read_events,answer_provenance.read_events);
});
