import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Acepta la clave como cabecera "Authorization: Bearer <MCP_SECRET>"
 * (Claude Code) o como ?key=<MCP_SECRET> en la URL (conector de claude.ai).
 */
export function isAuthorized(req: Request): boolean {
  const secret = process.env.MCP_SECRET;
  if (!secret || secret.length < 32) return false;
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ") && safeEqual(header.slice(7), secret)) return true;
  const key = new URL(req.url).searchParams.get("key");
  return key !== null && safeEqual(key, secret);
}

export function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

/** Valida la firma X-Hub-Signature-256 que Meta envía en los webhooks. */
export function validMetaSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}
