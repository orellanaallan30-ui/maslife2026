import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { data } = req.body || {};
  if (!data?.id) return res.status(200).end();

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return res.status(200).json({ skipped: 'no token' });

  const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${data.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const sub = await mpRes.json();
  if (sub.status !== 'authorized') return res.status(200).end();

  const email: string | undefined = sub.payer_email;
  if (!email) return res.status(200).end();

  await supabase
    .from('professionals')
    .update({ subscription_status: 'active', is_subscribed: true })
    .eq('email', email.toLowerCase());

  return res.status(200).json({ ok: true });
}
