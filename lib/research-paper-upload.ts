import type { AutonomousWorkflow } from "./research-autonomy.ts";

export const PAPER_UPLOAD_MAX_BYTES = 10_000_000;
export const PAPER_UPLOAD_VERSION = "research-paper-upload-v1";
export type PaperUploadTicket = { version: typeof PAPER_UPLOAD_VERSION; id: string; status: "pending"; bucket: "research-paper-uploads"; path: string; token: string; sha256: string; byte_count: number; maximum_bytes: number };
type Request = <T = unknown>(path: string, options?: RequestInit) => Promise<T>;
type Intake = { id: string; autonomy?: AutonomousWorkflow };

export async function paperUploadMetadata(file: File) {
  if (!file || typeof file.arrayBuffer !== "function" || !file.name.toLowerCase().endsWith(".pdf") || file.name.length > 200 || /[\/\\\x00-\x1f\x7f]/.test(file.name)) throw new Error("Choose a PDF file with a filename of at most 200 characters.");
  if (file.size < 1 || file.size > PAPER_UPLOAD_MAX_BYTES) throw new Error("Choose a PDF no larger than 10 MB.");
  const raw = await file.arrayBuffer();
  if (!new TextDecoder().decode(raw.slice(0, 1024)).trimStart().startsWith("%PDF-")) throw new Error("The selected file has no PDF signature. Choose a PDF document.");
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))].map(value => value.toString(16).padStart(2, "0")).join("");
  return { filename: file.name, byte_count: file.size, sha256 };
}

function confirmed(result: Intake, id: string) {
  if (result.id !== id || result.autonomy?.study_id !== id || result.autonomy.max_spend_cents !== 10000 || result.autonomy.max_attempts !== null) throw new Error("Assessment start was not confirmed. Retry with this original request ID; inspect the queue before submitting a replacement.");
  return result;
}

export async function startUploadedPaper(request: Request, id: string, file: File, fields: { domain: string; scope: string }, upload: (ticket: PaperUploadTicket, file: File) => Promise<void>, progress: (phase: string) => void = () => {}) {
  progress("Checking PDF…");
  const metadata = await paperUploadMetadata(file);
  const capabilities = await request<{ autonomy?: { version: string; enabled: boolean }; paper_uploads?: { version: string; maximum_bytes: number } }>("/capabilities");
  if (capabilities.autonomy?.version !== "research-autonomy-v3" || capabilities.paper_uploads?.version !== PAPER_UPLOAD_VERSION || capabilities.paper_uploads.maximum_bytes !== PAPER_UPLOAD_MAX_BYTES) throw new Error("The connected service needs the PDF upload update. No paper was uploaded.");
  if (!capabilities.autonomy?.enabled) throw new Error("Autonomous assessment is temporarily unavailable. No paper was uploaded.");
  const ticket = await request<PaperUploadTicket | { version: string; id: string; status: "started"; result: Intake }>("/paper-uploads", { method: "POST", body: JSON.stringify({ action: "reserve", request_id: id, ...metadata, ...fields }) });
  if (ticket.version !== PAPER_UPLOAD_VERSION || ticket.id !== id) throw new Error("Private upload identity was not confirmed. Retry with the original request ID.");
  if (ticket.status === "started") return confirmed(ticket.result, id);
  if (ticket.status !== "pending" || ticket.bucket !== "research-paper-uploads" || ticket.path !== `${id}/${metadata.sha256}` || ticket.sha256 !== metadata.sha256 || ticket.byte_count !== file.size || ticket.maximum_bytes !== PAPER_UPLOAD_MAX_BYTES || typeof ticket.token !== "string" || ticket.token.length < 16 || ticket.token.length > 8192) throw new Error("Private upload permission does not match the selected PDF.");
  progress("Uploading PDF…");
  let uploadFailure: unknown;
  try { await upload(ticket, file); } catch (error) { uploadFailure = error; }
  // An upload response can be lost or an immutable object may already exist.
  // The server verifies the complete stored bytes before any work is admitted.
  progress("Verifying PDF and starting assessment…");
  try {
    return confirmed(await request<Intake>("/paper-uploads", { method: "POST", body: JSON.stringify({ action: "start", request_id: id }) }), id);
  } catch (error) {
    if (uploadFailure) throw new Error(`PDF upload could not be confirmed. Retry with the same file and request. ${error instanceof Error ? error.message : "Storage is unavailable."}`);
    throw error;
  }
}
