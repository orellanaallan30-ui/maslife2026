import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';

function verifyAdminToken(token: string, secret: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [payload, sig] = parts;
    const expectedSig = createHmac('sha256', secret).update(payload).digest('base64url');
    const sigBuf = Buffer.from(sig, 'base64url');
    const expectedBuf = Buffer.from(expectedSig, 'base64url');
    if (sigBuf.length !== expectedBuf.length) return false;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return false;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (parsed.role !== 'admin') return false;
    if (parsed.exp < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

// Columnas seguras para exponer al panel admin — excluye mp_access_token y mp_refresh_token
const ADMIN_COLUMNS = [
  'id', 'slug', 'name', 'email', 'specialty', 'city', 'bio', 'avatar',
  'is_public', 'is_verified', 'is_approved', 'is_subscribed',
  'subscription_status', 'trial_end_date', 'created_at', 'payment_enabled',
  'booking_fee', 'charge_full_service', 'booking_payment_link',
  'subscription_link', 'rut', 'modalities', 'services',
  'working_hours', 'schedule', 'needs_password_reset',
].join(', ');

function getAdminSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
  if (!ADMIN_JWT_SECRET) return res.status(500).json({ valid: false });

  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ valid: false });

  const token = authHeader.slice(7);
  if (!verifyAdminToken(token, ADMIN_JWT_SECRET)) {
    return res.status(401).json({ valid: false });
  }

  // GET sin ?action → solo verificar token (usado por App.tsx al cargar)
  if (req.method === 'GET' && !req.query.action) {
    return res.status(200).json({ valid: true });
  }

  // Las operaciones de gestión requieren SUPABASE_SERVICE_ROLE_KEY
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada en Vercel' });
  }

  const supabase = getAdminSupabase();

  // GET ?action=list → todos los profesionales
  if (req.method === 'GET' && req.query.action === 'list') {
    const { data, error } = await supabase
      .from('professionals')
      .select(ADMIN_COLUMNS)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ data });
  }

  // PATCH → actualizar campos de un profesional
  if (req.method === 'PATCH') {
    const { id, ...fields } = req.body || {};
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing id' });
    const { error } = await supabase.from('professionals').update(fields).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  // DELETE → eliminar profesional
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing id' });
    const { error } = await supabase.from('professionals').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).end();
}
