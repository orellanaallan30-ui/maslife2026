import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { registerPushChannel } from './_lib/googleCalendar';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state: rawState, error: oauthError } = req.query;

  if (oauthError) {
    console.warn('[google-oauth-callback] User denied consent or error:', oauthError);
    return res.redirect('/pro/settings?google_error=denied');
  }

  if (!code || !rawState) {
    return res.redirect('/pro/settings?google_error=missing_params');
  }

  const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI || 'https://clinicamaslife.cl/api/google-oauth-callback';
  const STATE_SECRET  = process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.MP_OAUTH_STATE_SECRET || 'dev-secret';

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.redirect('/pro/settings?google_error=not_configured');
  }

  // Verify HMAC-signed state (anti-CSRF, 15-min window)
  let professionalId: string;
  try {
    const parts = (rawState as string).split('.');
    if (parts.length !== 2) throw new Error('bad_format');
    const [payload, sig] = parts;
    const expectedSig = createHmac('sha256', STATE_SECRET).update(payload).digest('base64url');
    if (sig !== expectedSig) throw new Error('bad_sig');
    const decoded  = Buffer.from(payload, 'base64url').toString('utf-8');
    const colonIdx = decoded.lastIndexOf(':');
    if (colonIdx === -1) throw new Error('bad_payload');
    professionalId = decoded.slice(0, colonIdx);
    const ts    = parseInt(decoded.slice(colonIdx + 1));
    const ageSec = (Date.now() - ts) / 1000;
    if (!professionalId || ageSec < 0 || ageSec > 900) throw new Error('expired');
  } catch {
    console.warn('[google-oauth-callback] Estado inválido — posible CSRF');
    return res.redirect('/pro/settings?google_error=invalid_state');
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code:          code as string,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[google-oauth-callback] Token exchange failed:', JSON.stringify(tokenData));
      return res.redirect(`/pro/settings?google_error=token_failed`);
    }

    const { access_token, refresh_token } = tokenData;

    // Store tokens in professional_secrets
    const { error: secretErr } = await supabase
      .from('professional_secrets')
      .upsert({
        professional_id:      professionalId,
        google_access_token:  access_token,
        google_refresh_token: refresh_token || null,
        google_calendar_id:   'primary',
        updated_at:           new Date().toISOString(),
      }, { onConflict: 'professional_id' });

    if (secretErr) {
      console.error('[google-oauth-callback] Secrets upsert failed:', secretErr);
      return res.redirect('/pro/settings?google_error=db_error');
    }

    // Mark professional as connected
    const { error: updErr } = await supabase
      .from('professionals')
      .update({ google_calendar_connected: true })
      .eq('id', professionalId);

    if (updErr) {
      console.error('[google-oauth-callback] Professional update failed:', updErr);
      return res.redirect('/pro/settings?google_error=db_error');
    }

    // Register push channel (best-effort — don't fail the flow if this fails)
    await registerPushChannel(access_token, 'primary', professionalId).catch(err => {
      console.error('[google-oauth-callback] Push channel registration failed:', err);
    });

    return res.redirect('/pro/settings?google_connected=1');
  } catch (err) {
    console.error('[google-oauth-callback] Unexpected error:', err);
    return res.redirect('/pro/settings?google_error=server_error');
  }
}
