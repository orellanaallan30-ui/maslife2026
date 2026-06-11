import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { checkIpRateLimit } from './_lib/auth';
import { validateBooking, insertBooking, releaseBooking, releaseStaleHolds, BookingInput } from './_lib/booking';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

const ALLOWED_ORIGIN = 'https://clinicamaslife.cl';

/**
 * Checkout Pro seguro:
 *   1. Valida la reserva y calcula el monto REAL en el servidor desde la config
 *      del profesional (charge_full_service ? precio servicio : booking_fee).
 *      El monto del cliente se ignora — no se puede pagar menos de lo debido.
 *   2. Inserta la cita como Pendiente ANTES de redirigir a MP: el índice UNIQUE
 *      bloquea el cupo y convierte cualquier carrera en SLOT_TAKEN sin cobro.
 *   3. Crea la preferencia con external_reference = id de la cita. La
 *      confirmación NUNCA depende de los parámetros de la URL de retorno
 *      (falsificables): la hace /api/book-appointment {action:'confirm'}
 *      verificando el pago contra la API de MP, más el webhook como respaldo.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!checkIpRateLimit(req.headers, 10, 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en un minuto.' });
  }

  const PLATFORM_TOKEN = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!PLATFORM_TOKEN) return res.status(503).json({ error: 'MP_NOT_CONFIGURED' });

  const { payer, returnUrl, booking } = req.body || {};

  if (!booking || typeof booking !== 'object') {
    return res.status(400).json({ error: 'Faltan los datos de la reserva' });
  }

  // ── 1. Validar reserva y monto en el servidor ──
  const input = booking as Partial<BookingInput>;
  const validation = await validateBooking(input);
  const prepared = validation.prepared;
  if (!validation.ok || !prepared) {
    return res.status(validation.code || 400).json({ error: validation.error || 'Solicitud inválida' });
  }

  const amountDue = prepared.amountDue;
  if (amountDue < 500) {
    // Reserva gratuita o monto bajo el mínimo de MP — no corresponde pagar aquí
    return res.status(400).json({ error: 'Esta reserva no requiere pago online', amountDue });
  }
  if (amountDue > 10000000) {
    return res.status(400).json({ error: 'Monto fuera de rango' });
  }

  // ── 2. Bloquear el cupo ANTES de redirigir a MP ──
  await releaseStaleHolds(prepared.pro.id);
  const reservation = await insertBooking(input as BookingInput, prepared, {
    status: 'Pendiente',
    paymentStatus: 'Pendiente',
  });
  if (!reservation.ok || !reservation.id) {
    if (reservation.error === 'SLOT_TAKEN') {
      return res.status(409).json({ error: 'SLOT_TAKEN', message: 'Ese horario acaba de ser tomado. Elige otro — no se cobró nada.' });
    }
    return res.status(reservation.code || 500).json({ error: reservation.error || 'No se pudo reservar el cupo' });
  }
  const appointmentId = reservation.id;

  // ── Token del vendedor (marketplace) si tiene MP conectado ──
  let ACCESS_TOKEN = PLATFORM_TOKEN;
  let marketplaceFee: number | undefined;
  const { data: secret } = await supabase
    .from('professional_secrets')
    .select('mp_access_token')
    .eq('professional_id', prepared.pro.id)
    .maybeSingle();
  if (secret?.mp_access_token) {
    ACCESS_TOKEN = secret.mp_access_token.trim();
    const pct = Number(process.env.MP_MARKETPLACE_FEE_PCT ?? 5);
    const fee = Math.round(amountDue * pct / 100);
    if (fee > 0 && fee < amountDue) marketplaceFee = fee;
  }

  // back_urls: solo URLs de retorno de nuestro propio dominio
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
      title: `Reserva — ${prepared.service.name} con ${prepared.pro.name}`.slice(0, 250),
      quantity: 1,
      unit_price: amountDue,
      currency_id: 'CLP',
    }],
    external_reference: appointmentId,
    back_urls: { success: backWithFlag, failure: backWithFlag, pending: backWithFlag },
    auto_return: 'approved',
    statement_descriptor: 'CLINICAMASLIFE',
    ...(payer?.email && { payer: { email: String(payer.email), name: payer.name ? String(payer.name) : undefined } }),
    ...(marketplaceFee !== undefined && { marketplace_fee: marketplaceFee }),
  };

  // ── 3. Crear preferencia ──
  try {
    const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        // Estable por cita: reintentos de red no crean preferencias duplicadas
        'X-Idempotency-Key': `pref-${appointmentId}`,
      },
      body: JSON.stringify(prefBody),
    });
    const prefData = await prefRes.json();
    if (!prefRes.ok || !prefData.init_point) {
      console.error('[process-payment/preference] MP error:', JSON.stringify(prefData));
      await releaseBooking(appointmentId);
      return res.status(prefRes.status >= 400 ? prefRes.status : 502).json({
        error: prefData.message || 'No se pudo crear la preferencia de pago',
        cause: prefData.cause,
      });
    }
    return res.json({
      init_point: prefData.init_point,
      preference_id: prefData.id,
      appointmentId,
      amountDue,
    });
  } catch (err) {
    console.error('[process-payment/preference]', err);
    await releaseBooking(appointmentId);
    return res.status(500).json({ error: 'Network error' });
  }
}
