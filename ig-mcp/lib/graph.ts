// Cliente mínimo de la Graph API de Meta. El token nunca se registra en logs
// ni se devuelve en respuestas.

const VERSION = process.env.GRAPH_API_VERSION || "v23.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

export class GraphError extends Error {
  constructor(
    message: string,
    public code?: number,
    public subcode?: number,
  ) {
    super(message);
  }
}

function token(): string {
  const t = process.env.IG_ACCESS_TOKEN?.trim();
  if (!t) throw new Error("Falta la variable de entorno IG_ACCESS_TOKEN");
  return t;
}

export function igUserId(): string {
  const id = process.env.IG_USER_ID?.trim();
  if (!id) throw new Error("Falta IG_USER_ID (usa la herramienta descubrir_ids)");
  return id;
}

export function pageId(): string {
  const id = process.env.FB_PAGE_ID?.trim();
  if (!id) throw new Error("Falta FB_PAGE_ID");
  return id;
}

type Params = Record<string, string | number | boolean | object | undefined>;

function encode(v: string | number | boolean | object): string {
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/**
 * Quita el token de todo lo que se devuelve. Meta incluye en las listas
 * paginadas enlaces paging.next / paging.previous con ?access_token=..., y
 * esos enlaces terminaban en el chat. Se eliminan esos enlaces (los cursores
 * se mantienen), las claves "access_token" y cualquier access_token=... que
 * quede dentro de un texto.
 */
function sanitize(v: unknown): unknown {
  if (typeof v === "string") return v.replace(/access_token=[^&"\s]+/g, "access_token=OCULTO");
  if (Array.isArray(v)) return v.map(sanitize);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === "access_token") continue;
      if (k === "paging" && val && typeof val === "object") {
        const { next: _n, previous: _p, ...rest } = val as Record<string, unknown>;
        out[k] = sanitize(rest);
        continue;
      }
      out[k] = sanitize(val);
    }
    return out;
  }
  return v;
}

async function handle(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const e = data?.error ?? {};
    throw new GraphError(
      e.error_user_msg || e.message || `Error HTTP ${res.status}`,
      e.code,
      e.error_subcode,
    );
  }
  return sanitize(data) as any;
}

export async function gget(path: string, params: Params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, encode(v));
  }
  url.searchParams.set("access_token", token());
  return handle(await fetch(url, { cache: "no-store" }));
}

export async function gpost(path: string, params: Params = {}) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) body.set(k, encode(v));
  }
  body.set("access_token", token());
  return handle(
    await fetch(BASE + path, { method: "POST", body, cache: "no-store" }),
  );
}
