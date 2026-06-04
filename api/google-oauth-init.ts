import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';
import { requireSupabaseAuth } from './_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const user = await requireSupabaseAuth(req, res);
  if (!user) return;

  const CLIENT_ID    = process.env.GOOGLE_CLIENT_ID;
  const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://clinicamaslife.cl/api/google-oauth-callback';

  if (!CLIENT_ID) return res.status(500).json({ error: 'Google OAuth no configurado' });

  const STATE_SECRET = process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.MP_OAUTH_STATE_SECRET || 'dev-secret';
  const ts      = Date.now();
  const payload = Buffer.from(`${user.id}:${ts}`).toString('base64url');
  const sig     = createHmac('sha256', STATE_SECRET).update(payload).digest('base64url');
  const state   = `${payload}.${sig}`;

  const scopes = [
    'https://www.googleapis.com/auth/calendar',
  ].join(' ');

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         scopes,
    access_type:   'offline',
    prompt:        'consent',
    state,
  });

  return res.status(200).json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
}
