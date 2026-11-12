import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

// In-memory rate limiting — resets on cold start (acceptable for serverless)
const ipCounts = new Map<string, { count: number; windowStart: number }>();

export function checkIpRateLimit(
  headers: VercelRequest['headers'],
  max: number,
  windowMs: number,
  // Contador aparte por uso: sin esto, el refresco de recepción (center) gastaría
  // el cupo de la reserva pública de pacientes que comparten la misma IP.
  bucket = ''
): boolean {
  const forwarded = headers['x-forwarded-for'];
  const ip = bucket + (Array.isArray(forwarded) ? forwarded[0] : (forwarded || 'unknown'))
    .split(',')[0]
    .trim();
  const now = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    ipCounts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

export async function requireSupabaseAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado' });
    return null;
  }
  const accessToken = authHeader.slice(7);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
    return null;
  }
  return { id: data.user.id, email: data.user.email };
}

// ── Llamadas internas entre funciones (servidor → servidor) ─────────────────
// Recepción agenda muchas citas desde una misma IP; sus correos salen desde el
// servidor (api/_lib/center.ts → /api/notify) con esta cabecera, que solo puede
// calcular quien tiene la service role key. Así no chocan con el límite por IP
// que protege a /api/notify de ser usado como relay de correo.
export const INTERNAL_HEADER = 'x-agendamas-internal';

export function internalKey(): string {
  return createHash('sha256').update(`${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}:agendamas-internal`).digest('hex');
}

export function isInternalCall(headers: VercelRequest['headers']): boolean {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const got = headers[INTERNAL_HEADER];
  if (typeof got !== 'string') return false;
  const a = Buffer.from(got), b = Buffer.from(internalKey());
  return a.length === b.length && timingSafeEqual(a, b);
}
