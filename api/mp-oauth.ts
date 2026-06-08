import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { requireSupabaseAuth } from './_lib/auth';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

// POST { action: 'disconnect' } con Authorization: Bearer <supabase access token>
// Desconecta la cuenta MP del profesional autenticado: borra sus secretos y
// marca mp_connected = false. Verifica la identidad con el JWT de Supabase.
async function handleDisconnect(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const accessToken = authHeader.slice(7);

  // Verifica el token contra Supabase Auth para obtener el id del profesional
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData.user) {
    return res.status(401).json({ error: 'Sesión inválida' });
  }
  const proId = userData.user.id;

  await supabase.from('professional_secrets').delete().eq('professional_id', proId);
  const { error: updErr } = await supabase
    .from('professionals')
    .update({ mp_connected: false, mp_public_key: null })
    .eq('id', proId);

  if (updErr) {
    console.error('[mp-oauth] disconnect update failed:', updErr.message);
    return res.status(500).json({ error: 'No se pudo desconectar' });
  }
  return res.status(200).json({ disconnected: true });
}

async function handleGenerateState(req: VercelRequest, res: VercelResponse) {
  const user = await requireSupabaseAuth(req, res);
  if (!user) return;
  const secret = process.env.MP_OAUTH_STATE_SECRET || process.env.MP_APP_SECRET;
  if (!secret) return res.status(503).json({ error: 'MP_OAUTH_STATE_SECRET no configurado' });
  const ts = Date.now().toString();
  const payload = Buffer.from(`${user.id}:${ts}`).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return res.status(200).json({ state: `${payload}.${sig}` });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    const { action } = req.body || {};
    if (action === 'disconnect') return handleDisconnect(req, res);
    if (action === 'generate-state') return handleGenerateState(req, res);
    return res.status(400).json({ error: 'Acción no soportada' });
  }

  const { code, state: rawState } = req.query;

  if (!code || !rawState) {
    return res.redirect('/pro/settings?mp_error=missing_params');
  }

  const APP_ID = process.env.MP_APP_ID;
  const APP_SECRET = process.env.MP_APP_SECRET;
  const REDIRECT_URI = 'https://clinicamaslife.cl/api/mp-oauth';

  if (!APP_ID || !APP_SECRET) {
    return res.redirect('/pro/settings?mp_error=app_not_configured');
  }

  // Verificar estado OAuth firmado (anti-CSRF).
  // El estado tiene formato: base64url(professionalId:timestamp).signature
  const STATE_SECRET = process.env.MP_OAUTH_STATE_SECRET || APP_SECRET;
  let professionalId: string;
  try {
    const stateParts = (rawState as string).split('.');
    if (stateParts.length !== 2) throw new Error('bad_format');
    const [payload, sig] = stateParts;
    const expectedSig = createHmac('sha256', STATE_SECRET).update(payload).digest('base64url');
    if (sig !== expectedSig) throw new Error('bad_sig');
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    const colonIdx = decoded.lastIndexOf(':');
    if (colonIdx === -1) throw new Error('bad_payload');
    professionalId = decoded.slice(0, colonIdx);
    const ts = parseInt(decoded.slice(colonIdx + 1));
    const ageSec = (Date.now() - ts) / 1000;
    if (!professionalId || ageSec < 0 || ageSec > 900) throw new Error('expired');
  } catch {
    console.warn('[mp-oauth] Estado inválido — posible CSRF');
    return res.redirect('/pro/settings?mp_error=invalid_state');
  }

  try {
    const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: APP_ID,
        client_secret: APP_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      const mpErr = tokenData.error || tokenData.message || 'unknown';
      const mpDesc = tokenData.error_description || tokenData.cause?.[0]?.description || '';
      console.error('[mp-oauth] Token exchange failed:', JSON.stringify(tokenData));
      return res.redirect(`/pro/settings?mp_error=token_exchange_failed&mp_detail=${encodeURIComponent(mpErr)}&mp_desc=${encodeURIComponent(mpDesc)}`);
    }

    const { access_token, refresh_token, user_id } = tokenData;
    // public_key puede venir como 'public_key' o no venir en el token response
    let public_key: string | null = tokenData.public_key || tokenData.publicKey || null;
    console.info('[mp-oauth] token fields:', Object.keys(tokenData).join(','), '| public_key found:', !!public_key);

    // Fallback: si MP no devolvió la public_key en el token, intentar obtenerla
    // vía la API de credenciales del usuario usando su access_token
    if (!public_key && user_id) {
      try {
        const credRes = await fetch(`https://api.mercadopago.com/users/${user_id}`, {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        if (credRes.ok) {
          const credData = await credRes.json();
          public_key = credData.credentials?.public_key || credData.public_key || null;
          console.info('[mp-oauth] public_key from /users/:id:', !!public_key);
        }
      } catch (fetchErr) {
        console.warn('[mp-oauth] Could not fetch public_key from /users:', fetchErr);
      }
    }

    // Guarda los tokens sensibles en la tabla aislada (solo service_role la lee)
    const { error: secretErr } = await supabase
      .from('professional_secrets')
      .upsert({
        professional_id: professionalId,
        mp_access_token: access_token,
        mp_refresh_token: refresh_token || null,
        mp_user_id: String(user_id),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'professional_id' });

    if (secretErr) {
      console.error('[mp-oauth] secrets upsert failed:', secretErr);
      return res.redirect('/pro/settings?mp_error=db_error');
    }

    // La public_key NO es secreta (se usa en el frontend para Bricks).
    // mp_connected es el indicador no-secreto para el badge.
    const { error: dbError } = await supabase
      .from('professionals')
      .update({
        mp_connected: true,
        mp_public_key: public_key || null,
      })
      .eq('id', professionalId);

    if (dbError) {
      console.error('[mp-oauth] Supabase update failed:', dbError);
      return res.redirect('/pro/settings?mp_error=db_error');
    }

    return res.redirect('/pro/settings?mp_connected=1');
  } catch (err) {
    console.error('[mp-oauth] Unexpected error:', err);
    return res.redirect('/pro/settings?mp_error=server_error');
  }
}
