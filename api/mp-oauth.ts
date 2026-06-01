import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    const { error: dbError } = await supabase
      .from('professionals')
      .update({
        mp_access_token: access_token,
        mp_public_key: public_key || null,
        mp_refresh_token: refresh_token || null,
        mp_user_id: String(user_id),
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
