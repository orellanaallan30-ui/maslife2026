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
  const t = process.env.IG_ACCESS_TOKEN;
  if (!t) throw new Error("Falta la variable de entorno IG_ACCESS_TOKEN");
  return t;
}

export function igUserId(): string {
  const id = process.env.IG_USER_ID;
  if (!id) throw new Error("Falta IG_USER_ID (usa la herramienta descubrir_ids)");
  return id;
}

export function pageId(): string {
  const id = process.env.FB_PAGE_ID;
  if (!id) throw new Error("Falta FB_PAGE_ID");
  return id;
}

type Params = Record<string, string | number | boolean | object | undefined>;

function encode(v: string | number | boolean | object): string {
  return typeof v === "object" ? JSON.stringify(v) : String(v);
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
  return data;
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
