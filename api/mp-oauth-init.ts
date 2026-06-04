import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';
import { requireSupabaseAuth } from './_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const user = await requireSupabaseAuth(req, res);
  if (!user) return;

  const secret = process.env.MP_OAUTH_STATE_SECRET || process.env.MP_APP_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'MP_OAUTH_STATE_SECRET no configurado en Vercel' });
  }

  const ts = Date.now().toString();
  const payload = Buffer.from(`${user.id}:${ts}`).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');

  return res.status(200).json({ state: `${payload}.${sig}` });
}
