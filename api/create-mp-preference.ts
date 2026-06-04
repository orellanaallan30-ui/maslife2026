import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkIpRateLimit } from './_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Rate limit: 20 preferencias por 5 minutos para prevenir spam de links de pago
  if (!checkIpRateLimit(req.headers, 20, 5 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en unos minutos.' });
  }

  const ACCESS_TOKEN = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!ACCESS_TOKEN) {
    return res.status(503).json({ error: 'MP_NOT_CONFIGURED' });
  }

  const { title, price, professionalSlug, ref, patientName } = req.body || {};
  if (!title || !price || !professionalSlug || !ref) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const BASE = `https://clinicamaslife.cl/patient/profile/${encodeURIComponent(professionalSlug)}`;

  const preference = {
    items: [{
      title: String(title).slice(0, 256),
      quantity: 1,
      unit_price: Number(price),
      currency_id: 'CLP',
    }],
    payer: { name: String(patientName || 'Paciente').slice(0, 100) },
    back_urls: {
      success: `${BASE}?mp_ok=1&mp_ref=${encodeURIComponent(ref)}`,
      failure: `${BASE}?mp_fail=1`,
      pending: `${BASE}?mp_pending=1`,
    },
    auto_return: 'approved',
    external_reference: String(ref),
    statement_descriptor: 'CLINICAMASLIFE',
    expires: false,
  };

  try {
    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preference),
    });

    const data = await mpRes.json();
    if (!mpRes.ok) {
      console.error('[MP] Preference error:', data);
      return res.status(500).json({ error: data.message || 'MercadoPago error' });
    }

    return res.json({ init_point: data.init_point, id: data.id });
  } catch (err) {
    console.error('[MP] Network error:', err);
    return res.status(500).json({ error: 'Network error calling MercadoPago' });
  }
}
