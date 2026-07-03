import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { checkIpRateLimit } from './_lib/auth';

const ADMIN_COLUMNS = [
  'id', 'slug', 'name', 'email', 'specialty', 'city', 'bio', 'avatar',
  'is_public', 'is_verified', 'is_approved', 'is_subscribed',
  'subscription_status', 'trial_end_date', 'created_at', 'payment_enabled',
  'booking_fee', 'charge_full_service', 'booking_payment_link',
  'subscription_link', 'rut', 'modalities', 'services',
  'working_hours', 'schedule', 'needs_password_reset', 'instagram',
  'subscription_exempt', 'paused_at',
].join(', ');

function createAdminToken(secret: string): string {
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

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

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function getAdminSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const ipCounts = new Map<string, { count: number; windowStart: number }>();
function checkRateLimit(headers: VercelRequest['headers'], max: number, windowMs: number): boolean {
  const forwarded = headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : (forwarded || 'unknown')).split(',')[0].trim();
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // El token admin se firma con la SERVICE_ROLE_KEY (siempre configurada: las
  // operaciones admin ya la usan), para no depender de ADMIN_JWT_SECRET.
  const TOKEN_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ADMIN_JWT_SECRET || '';

  // ── SSO: sesión Supabase del profesional (flag is_admin) → token admin ──
  if (req.method === 'POST' && req.query.action === 'sso') {
    if (!checkIpRateLimit(req.headers, 10, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Demasiados intentos.' });
    }
    if (!TOKEN_SECRET) return res.status(500).json({ error: 'No configurado' });
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
    const supabaseJwt = authHeader.slice(7);
    try {
      const adminSupabase = getAdminSupabase();
      const { data: { user }, error } = await adminSupabase.auth.getUser(supabaseJwt);
      if (error || !user?.email) return res.status(401).json({ error: 'Sesión inválida', detail: error?.message });
      // El acceso admin se controla con el flag is_admin del profesional.
      // Retrocompat: también se acepta si el email coincide con ADMIN_EMAIL.
      const { data: proRow } = await adminSupabase
        .from('professionals').select('is_admin').eq('id', user.id).maybeSingle();
      const envAdmin = process.env.ADMIN_EMAIL;
      const isAdmin = proRow?.is_admin === true ||
        (!!envAdmin && user.email.toLowerCase().trim() === envAdmin.toLowerCase().trim());
      if (!isAdmin) {
        return res.status(403).json({ error: 'Sin permisos de administrador', email: user.email });
      }
      return res.status(200).json({ token: createAdminToken(TOKEN_SECRET) });
    } catch (e: any) {
      console.error('[SSO]', e?.message, e?.stack?.slice(0, 300));
      return res.status(500).json({ error: 'Error SSO', detail: e?.message });
    }
  }

  // POST without auth header = login or validate-clinic-code
  if (req.method === 'POST' && !req.headers.authorization) {
    const { action, code, username, password } = req.body || {};

    // Validate clinic registration code
    if (action === 'validate-code') {
      if (!checkRateLimit(req.headers, 5, 60 * 60 * 1000)) {
        return res.status(429).json({ valid: false, error: 'Demasiados intentos. Intenta en 1 hora.' });
      }
      const CLINIC_CODE = process.env.CLINIC_AUTH_CODE;
      if (!CLINIC_CODE) return res.status(500).json({ valid: false, error: 'Código no configurado en servidor' });
      if (!code) return res.status(400).json({ valid: false });
      await new Promise(r => setTimeout(r, 400));
      const valid = timingSafeEqualStr(
        (code as string).toUpperCase().trim(),
        CLINIC_CODE.toUpperCase().trim()
      );
      if (valid) return res.status(200).json({ valid: true });

      // Fallback: check if it's a professional referral code
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(200).json({ valid: false });
      }
      const supabaseAdmin = getAdminSupabase();
      const { data: referrer } = await supabaseAdmin
        .from('professionals')
        .select('id, name')
        .ilike('referral_code', (code as string).trim())
        .maybeSingle();

      if (referrer) {
        return res.status(200).json({ valid: true, referrerId: referrer.id, referrerName: referrer.name });
      }
      return res.status(200).json({ valid: false, error: 'Código incorrecto. Solicítalo a la administración o a un colega de la plataforma.' });
    }

    // Admin login
    if (!checkIpRateLimit(req.headers, 5, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Demasiados intentos de acceso. Espera 15 minutos.' });
    }
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    // Ruta legacy por contraseña: opcional. El acceso principal es por sesión (SSO).
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      return res.status(500).json({ error: 'Login por contraseña no disponible. Usa tu sesión de profesional.' });
    }
    if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales' });
    await new Promise(r => setTimeout(r, 300));
    // Comparación tolerante a espacios/saltos accidentales (típico al pegar la
    // clave en Vercel) y timing-safe. El usuario debe ser el email admin.
    const inputPass = String(password).trim();
    const envPass = String(ADMIN_PASSWORD).trim();
    const passOk = inputPass.length === envPass.length &&
      timingSafeEqual(Buffer.from(inputPass), Buffer.from(envPass));
    if (username.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase().trim() || !passOk) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    return res.status(200).json({ token: createAdminToken(TOKEN_SECRET) });
  }

  // All other methods require a valid admin token
  if (!TOKEN_SECRET) return res.status(500).json({ valid: false });
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ valid: false });
  const token = authHeader.slice(7);
  if (!verifyAdminToken(token, TOKEN_SECRET)) return res.status(401).json({ valid: false });

  if (req.method === 'GET' && !req.query.action) {
    return res.status(200).json({ valid: true });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada' });
  }
  const supabase = getAdminSupabase();

  if (req.method === 'GET' && req.query.action === 'list') {
    const { data, error } = await supabase
      .from('professionals')
      .select(ADMIN_COLUMNS)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ data });
  }

  if (req.method === 'PATCH') {
    const { id, ...fields } = req.body || {};
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing id' });
    const { error } = await supabase.from('professionals').update(fields).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing id' });
    const { error } = await supabase.from('professionals').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).end();
}
