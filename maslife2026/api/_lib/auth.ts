// Utilidades compartidas de autenticación y rate-limiting para endpoints serverless
// No es un endpoint público — archivos con prefijo _ en Vercel no se exponen como rutas

import { createClient } from '@supabase/supabase-js';

// ── Supabase client con service role (server-side únicamente) ──
let _supabase: ReturnType<typeof createClient> | null = null;

function getServiceSupabase() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    _supabase = createClient(url, key, { auth: { persistSession: false } });
  }
  return _supabase;
}

// ── Rate limiting in-memory por IP ────────────────────────────
// Se reinicia por instancia serverless — suficiente para prevenir abuso en free tier
const _ipCounts = new Map<string, { count: number; windowStart: number }>();

export function checkIpRateLimit(
  headers: Record<string, string | string[] | undefined>,
  max: number,
  windowMs: number
): boolean {
  const forwarded = headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || 'unknown')
    .split(',')[0].trim();

  const now = Date.now();
  const entry = _ipCounts.get(ip);

  if (!entry || now - entry.windowStart > windowMs) {
    _ipCounts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

// ── Verificar JWT de Supabase Auth ────────────────────────────
export async function requireSupabaseAuth(
  headers: Record<string, string | string[] | undefined>
): Promise<{ userId: string } | null> {
  const supabase = getServiceSupabase();
  if (!supabase) return null;

  const authHeader = headers['authorization'] as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return { userId: user.id };
  } catch {
    return null;
  }
}
