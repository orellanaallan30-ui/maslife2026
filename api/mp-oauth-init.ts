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

  const STATE_SECRET = process.env.MP_OAUTH_STATE_SECRET || process.env.MP_APP_SECRET || 'dev-secret';
  const ts      = Date.now();
  const payload = Buffer.from(`${user.id}:${ts}`).toString('base64url');
  const sig     = createHmac('sha256', STATE_SECRET).update(payload).digest('base64url');

  return res.status(200).json({ state: `${payload}.${sig}` });
}
