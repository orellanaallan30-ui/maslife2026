import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// El servidor NO usa la clave service_role. Usa la clave publicable de Supabase
// (es pública: ya va en la web de la clínica) y solo puede llamar las funciones
// ig_* de la migración 0026, que exigen el CRON_SECRET y solo tocan las tablas
// de Instagram. Ver supabase/migrations/0026_instagram_mcp_rpc.sql.

const DEFAULT_URL = "https://qhtfjbbdxtmqhstzkyrw.supabase.co";
const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_kuMOl6RPPHZVzmM6AaoPHw_aLndgDYt";

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL?.trim() || DEFAULT_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/** Llama una función ig_* con la clave del servidor. Lanza el error si falla. */
export async function rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const p_key = process.env.CRON_SECRET?.trim();
  if (!p_key) throw new Error("Falta CRON_SECRET");
  const { data, error } = await db().rpc(fn, { p_key, ...args });
  if (error) throw new Error(error.message);
  return data as T;
}
