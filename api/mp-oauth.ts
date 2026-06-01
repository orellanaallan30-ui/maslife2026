import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    const { action } = req.body || {};
    if (action === 'disconnect') return handleDisconnect(req, res);
    return res.status(400).json({ error: 'Acción no soportada' });
  }

  const { code, state: professionalId } = req.query;

  if (!code || !professionalId) {
    return res.redirect('/pro/settings?mp_error=missing_params');
  }

  const APP_ID = process.env.MP_APP_ID;
  const APP_SECRET = process.env.MP_APP_SECRET;
  const REDIRECT_URI = 'https://clinicamaslife.cl/api/mp-oauth';

  if (!APP_ID || !APP_SECRET) {
    return res.redirect('/pro/settings?mp_error=app_not_configured');
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

    const { access_token, public_key, refresh_token, user_id } = tokenData;

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
