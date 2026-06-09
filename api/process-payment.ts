import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { checkIpRateLimit } from './_lib/auth';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Rate limit: 10 pagos por minuto por IP para prevenir abuso
  if (!checkIpRateLimit(req.headers, 10, 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en un minuto.' });
  }

  const PLATFORM_TOKEN = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!PLATFORM_TOKEN) return res.status(503).json({ error: 'MP_NOT_CONFIGURED' });

  // === Checkout Pro: crear una preferencia y devolver el init_point ===
  // A diferencia del checkout transparente (brick de tarjeta), Checkout Pro
  // funciona con CUALQUIER cuenta MP conectada: el paciente paga en la página
  // segura de MercadoPago y vuelve por back_urls. No depende de que el vendedor
  // tenga habilitada la captura directa de tarjeta.
  if (req.body?.createPreference) {
    return handleCreatePreference(req, res, PLATFORM_TOKEN);
  }

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

  // Validar formato UUID del professional_id para prevenir sondeo arbitrario
  if (professional_id && !UUID_RE.test(String(professional_id))) {
    return res.status(400).json({ error: 'professional_id inválido' });
  }

  // Look up professional's own MP token if professional_id is provided
  let ACCESS_TOKEN = PLATFORM_TOKEN;
  let marketplaceFee: number | undefined;

  if (professional_id && process.env.VITE_SUPABASE_URL) {
    // Verificar que el profesional existe antes de buscar su token
    const { data: proExists } = await supabase
      .from('professionals')
      .select('id')
      .eq('id', professional_id)
      .single();
    if (!proExists) {
      return res.status(400).json({ error: 'Profesional no encontrado' });
    }
    const { data: secret } = await supabase
      .from('professional_secrets')
      .select('mp_access_token')
      .eq('professional_id', professional_id)
      .single();

    if (secret?.mp_access_token) {
      ACCESS_TOKEN = secret.mp_access_token;
      const pct = Number(process.env.MP_MARKETPLACE_FEE_PCT ?? 10);
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

const ALLOWED_ORIGIN = 'https://clinicamaslife.cl';

async function handleCreatePreference(
  req: VercelRequest,
  res: VercelResponse,
  PLATFORM_TOKEN: string,
) {
  const {
    amount, external_reference, description, professional_id, payer, returnUrl,
  } = req.body || {};

  // Validar monto: entero positivo en rango razonable.
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || !Number.isInteger(amountNum) || amountNum < 500 || amountNum > 10000000) {
    return res.status(400).json({ error: 'Monto inválido' });
  }
  if (professional_id && !UUID_RE.test(String(professional_id))) {
    return res.status(400).json({ error: 'professional_id inválido' });
  }

  // Resolver el token del vendedor + comisión de marketplace.
  let ACCESS_TOKEN = PLATFORM_TOKEN;
  let marketplaceFee: number | undefined;
  if (professional_id && process.env.VITE_SUPABASE_URL) {
    const { data: proExists } = await supabase
      .from('professionals')
      .select('id')
      .eq('id', professional_id)
      .single();
    if (!proExists) {
      return res.status(400).json({ error: 'Profesional no encontrado' });
    }
    const { data: secret } = await supabase
      .from('professional_secrets')
      .select('mp_access_token')
      .eq('professional_id', professional_id)
      .single();
    if (secret?.mp_access_token) {
      ACCESS_TOKEN = secret.mp_access_token;
      const pct = Number(process.env.MP_MARKETPLACE_FEE_PCT ?? 10);
      const fee = Math.round(amountNum * pct / 100);
      if (fee > 0 && fee < amountNum) marketplaceFee = fee;
    }
  }

  // back_urls: solo se acepta una URL de retorno de nuestro propio dominio.
  let backUrl = `${ALLOWED_ORIGIN}/`;
  try {
    const u = new URL(String(returnUrl || ''));
    if (u.origin === ALLOWED_ORIGIN) backUrl = u.origin + u.pathname;
  } catch { /* usar default */ }
  const sep = backUrl.includes('?') ? '&' : '?';
  const backWithFlag = `${backUrl}${sep}mp_return=1`;

  const prefBody: Record<string, unknown> = {
    items: [{
      id: 'reserva',
      title: String(description || 'Reserva de cita').slice(0, 250),
      quantity: 1,
      unit_price: amountNum,
      currency_id: 'CLP',
    }],
    external_reference: String(external_reference || `mp-${Date.now()}`),
    back_urls: { success: backWithFlag, failure: backWithFlag, pending: backWithFlag },
    auto_return: 'approved',
    statement_descriptor: 'CLINICAMASLIFE',
    ...(payer?.email && { payer: { email: String(payer.email), name: payer.name ? String(payer.name) : undefined } }),
    ...(marketplaceFee !== undefined && { marketplace_fee: marketplaceFee }),
  };

  try {
    const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `pref-${external_reference || 'booking'}-${Date.now()}`,
      },
      body: JSON.stringify(prefBody),
    });
    const prefData = await prefRes.json();
    if (!prefRes.ok || !prefData.init_point) {
      console.error('[process-payment/preference] MP error:', JSON.stringify(prefData));
      return res.status(prefRes.status >= 400 ? prefRes.status : 502).json({
        error: prefData.message || 'No se pudo crear la preferencia de pago',
        cause: prefData.cause,
      });
    }
    return res.json({ init_point: prefData.init_point, preference_id: prefData.id });
  } catch (err) {
    console.error('[process-payment/preference]', err);
    return res.status(500).json({ error: 'Network error' });
  }
}
