import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { checkIpRateLimit } from './_lib/auth';
import { validateBooking, insertBooking, confirmBookingPaid, releaseStaleHolds, BookingInput, UUID_RE } from './_lib/booking';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

/**
 * Endpoint de reservas para pacientes anónimos. El cliente NO escribe en
 * appointments (RLS lo bloquea, y con razón): todo pasa por aquí con service_role.
 *
 *   GET  ?availability=<proId>  → cupos ocupados (date/time/duration, sin PII)
 *   POST { action: 'book', ... }    → reserva sin pago (rechaza si el pro cobra)
 *   POST { action: 'confirm', appointmentId, paymentId } → verifica el pago
 *        contra la API de MercadoPago y confirma la cita (el retorno por URL
 *        de Checkout Pro es falsificable; esto no).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Disponibilidad pública (sin datos personales) ──
  if (req.method === 'GET') {
    const proId = String(req.query.availability || '');
    if (!UUID_RE.test(proId)) return res.status(400).json({ error: 'professional_id inválido' });

    // Aprovechar la carga de la página de reservas para liberar holds vencidos
    await releaseStaleHolds(proId);

    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('appointments')
      .select('date, time, duration, status')
      .eq('professional_id', proId)
      .neq('status', 'Cancelado')
      .gte('date', today);

    if (error) return res.status(500).json({ error: 'No se pudo cargar disponibilidad' });
    return res.status(200).json({
      slots: (data || []).map(a => ({
        date: a.date,
        time: String(a.time).slice(0, 5),
        duration: a.duration || 60,
      })),
    });
  }

  if (req.method !== 'POST') return res.status(405).end();

  if (!checkIpRateLimit(req.headers, 12, 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en un minuto.' });
  }

  const body = req.body || {};

  // ── Confirmar pago verificándolo contra MercadoPago ──
  if (body.action === 'confirm') {
    const { appointmentId, paymentId } = body;
    if (!UUID_RE.test(String(appointmentId)) || !paymentId || !/^\d+$/.test(String(paymentId))) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }

    const { data: app } = await supabase
      .from('appointments')
      .select('id, professional_id, payment_status')
      .eq('id', appointmentId)
      .single();
    if (!app) return res.status(404).json({ error: 'Cita no encontrada' });
    if (app.payment_status === 'Pagado') return res.status(200).json({ confirmed: true });

    // El pago puede vivir en la cuenta del profesional (marketplace) o en la
    // de la plataforma: probar primero con el token del vendedor.
    const tokens: string[] = [];
    const { data: secret } = await supabase
      .from('professional_secrets')
      .select('mp_access_token')
      .eq('professional_id', app.professional_id)
      .maybeSingle();
    if (secret?.mp_access_token) tokens.push(secret.mp_access_token.trim());
    const platform = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
    if (platform) tokens.push(platform);

    for (const token of tokens) {
      try {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!mpRes.ok) continue;
        const payment = await mpRes.json();
        if (
          (payment.status === 'approved' || payment.status === 'authorized') &&
          String(payment.external_reference) === String(appointmentId)
        ) {
          const ok = await confirmBookingPaid(appointmentId, Math.round(Number(payment.transaction_amount) || 0));
          return res.status(200).json({ confirmed: ok });
        }
        return res.status(200).json({ confirmed: false, paymentStatus: payment.status });
      } catch { /* probar siguiente token */ }
    }
    return res.status(200).json({ confirmed: false, error: 'No se pudo verificar el pago' });
  }

  // ── Reserva sin pago ──
  const input = body as Partial<BookingInput>;
  const validation = await validateBooking(input);
  const prepared = validation.prepared;
  if (!validation.ok || !prepared) {
    return res.status(validation.code || 400).json({ error: validation.error || 'Solicitud inválida' });
  }

  // Si el profesional cobra por reservar, esta vía no es válida: evita
  // que alguien se salte la pasarela llamando este endpoint directamente.
  if (prepared.amountDue > 0) {
    return res.status(402).json({ error: 'PAYMENT_REQUIRED', amountDue: prepared.amountDue });
  }

  await releaseStaleHolds(prepared.pro.id);

  const result = await insertBooking(input as BookingInput, prepared, {
    status: 'Confirmado',
    paymentStatus: 'Pendiente',
  });

  if (!result.ok || !result.id) {
    if (result.error === 'SLOT_TAKEN') {
      return res.status(409).json({ error: 'SLOT_TAKEN', message: 'Ese horario acaba de ser tomado. Elige otro.' });
    }
    return res.status(result.code || 500).json({ error: result.error || 'No se pudo registrar la cita' });
  }

  return res.status(200).json({ saved: true, appointmentId: result.id });
}
