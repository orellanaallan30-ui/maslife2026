import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const PLATFORM_TOKEN = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!PLATFORM_TOKEN) return res.status(503).json({ error: 'MP_NOT_CONFIGURED' });

  const {
    token, payment_method_id, installments, issuer_id, payer,
    amount, external_reference, description, professional_id,
  } = req.body || {};

  // Validar el monto: entero positivo dentro de un rango razonable.
  // Bloquea montos negativos, cero, NaN o cifras absurdas inyectadas en el body.
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || !Number.isInteger(amountNum) || amountNum < 500 || amountNum > 10000000) {
    return res.status(400).json({ error: 'Monto inválido' });
  }

  // Look up professional's own MP token if professional_id is provided
  let ACCESS_TOKEN = PLATFORM_TOKEN;
  let marketplaceFee: number | undefined;

  if (professional_id && process.env.VITE_SUPABASE_URL) {
    const { data: pro } = await supabase
      .from('professionals')
      .select('mp_access_token')
      .eq('id', professional_id)
      .single();

    if (pro?.mp_access_token) {
      ACCESS_TOKEN = pro.mp_access_token;
      const pct = Number(process.env.MP_MARKETPLACE_FEE_PCT ?? 15);
      const fee = Math.round(amountNum * pct / 100);
      // application_fee debe ser > 0 y < monto, si no MP devuelve 400
      if (fee > 0 && fee < amountNum) marketplaceFee = fee;
    }
  }

  if (!token || !payment_method_id || !payer?.email) {
    return res.status(400).json({ error: 'Missing required payment fields' });
  }

  try {
    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${external_reference || 'booking'}-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: amountNum,
        token,
        installments: Number(installments) || 1,
        payment_method_id,
        issuer_id,
        payer,
        external_reference,
        description: description || 'Bono Reserva Clínica Maslife',
        statement_descriptor: 'CLINICAMASLIFE',
        ...(marketplaceFee !== undefined && { application_fee: marketplaceFee }),
      }),
    });

    const data = await mpRes.json();
    if (!mpRes.ok) {
      console.error('[process-payment] MP error:', JSON.stringify(data));
      return res.status(mpRes.status).json({
        error: data.message || 'MP error',
        cause: data.cause,
        status: data.status,
      });
    }

    return res.json({
      status: data.status,
      statusDetail: data.status_detail,
      id: data.id,
    });
  } catch (err) {
    console.error('[process-payment]', err);
    return res.status(500).json({ error: 'Network error' });
  }
}
