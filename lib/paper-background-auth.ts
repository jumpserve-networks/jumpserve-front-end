import { createHmac, timingSafeEqual } from "node:crypto";
export const PAPER_BACKGROUND_PATH = "/research-verification/api/paper-background";
export function paperBackgroundSignature(key: string, timestamp: string, body: string) {
  const derived = createHmac("sha256", key).update("jumpserve-paper-background-v1").digest();
  return createHmac("sha256", derived).update(PAPER_BACKGROUND_PATH + "\n" + timestamp + "\n" + body).digest("hex");
}
export function verifyPaperBackgroundSignature(headers: Headers, key: string, body: string, now = Date.now()) {
  const timestamp = headers.get("x-jumpserve-paper-timestamp") ?? "", signature = headers.get("x-jumpserve-paper-signature") ?? "";
  if (!/^[0-9]{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature) || Math.abs(now / 1000 - Number(timestamp)) > 120) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(paperBackgroundSignature(key, timestamp, body), "hex"));
}
