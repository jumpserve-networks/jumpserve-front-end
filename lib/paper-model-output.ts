/** JSON-valid NUL strings cannot be stored as Postgres jsonb/text. */
export function parsePaperModelOutput(text: string): unknown {
  const value: unknown = JSON.parse(text);
  function inspect(item: unknown): void {
    if (typeof item === "string" && item.includes("\u0000")) throw new Error("The model output contains a NUL character that cannot be saved. The original response is retained.");
    if (item && typeof item === "object") for (const [key, child] of Object.entries(item)) { inspect(key); inspect(child); }
  }
  inspect(value);
  return value;
}
