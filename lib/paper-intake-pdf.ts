import { extractText, getDocumentProxy } from "unpdf";
import { PAPER_INTAKE_MAX_PAGES, paperModelRequest, sha256, type PaperText } from "./paper-intake-model";

export async function extractPaperPDF(bytes: Uint8Array, identity?: { sha256: string; byte_count: number }): Promise<PaperText> {
  if (!bytes.length || bytes.length > 10_000_000 || identity && (bytes.length !== identity.byte_count || sha256(bytes) !== identity.sha256) || !new TextDecoder().decode(bytes.slice(0, 1024)).trimStart().startsWith("%PDF-")) throw new Error("The stored PDF does not match the original upload identity.");
  const pdf = await getDocumentProxy(bytes.slice(), { enableXfa: false, disableFontFace: true, stopAtErrors: true, maxImageSize: 1_000_000 });
  let paper: PaperText;
  try {
    if (pdf.numPages > PAPER_INTAKE_MAX_PAGES) throw new Error("Phase one accepts up to 200 PDF pages.");
    const extracted = await extractText(pdf, { mergePages: false });
    paper = { totalPages: extracted.totalPages, pages: extracted.text.map((text, index) => ({ page: index + 1, text })) };
  } finally { await pdf.loadingTask.destroy(); }
  paperModelRequest(paper); // The app and CLI apply the same complete-input bounds.
  return paper;
}
