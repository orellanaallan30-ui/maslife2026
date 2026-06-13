import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

function validateSignature(req: VercelRequest, secret: string): boolean {
  try {
    const xSignature = req.headers['x-signature'] as string;
    const xRequestId = req.headers['x-request-id'] as string;
    const dataId = (req.query['data.id'] || req.query.id) as string;
    if (!xSignature || !xRequestId || !dataId) return false;

    const parts = Object.fromEntries(
      xSignature.split(',').map(p => p.split('=').map(s => s.trim()) as [string, string])
    );
    const ts = parts['ts'];
    const hash = parts['v1'];
    // Protección contra replay attacks: rechazar webhooks con más de 5 minutos de diferencia
    const tsDiff = Math.abs(Date.now() - parseInt(ts) * 1000);
    if (!ts || tsDiff > 5 * 60 * 1000) return false;
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    return expected === hash;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET;

  // La validación de firma es OBLIGATORIA: sin el secreto configurado, el webhook
  // rechaza todo, ya que un atacante podría falsificar eventos (p.ej. activar
  // suscripciones sin pagar). Configura MERCADOPAGO_WEBHOOK_SECRET en Vercel.
  if (!WEBHOOK_SECRET) {
    console.error('[mp-webhook] MERCADOPAGO_WEBHOOK_SECRET no configurado — rechazando');
    return res.status(503).json({ error: 'Webhook secret not configured' });
  }
  if (!validateSignature(req, WEBHOOK_SECRET)) {
    console.warn('[mp-webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { type, data, action } = req.body || {};
  console.log('[mp-webhook]', type, action, data?.id);

  const ACCESS_TOKEN = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();

  if (type === 'payment' || type === 'order') {
    const paymentId = data?.id;
    if (paymentId && ACCESS_TOKEN) {
      try {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        });
        const payment = await mpRes.json();
        console.log('[mp-webhook] payment status:', payment.status, payment.status_detail, payment.external_reference);

        // Conciliación: external_reference = id (UUID) de la cita. La tabla NO
        // tiene columna external_reference — el match correcto es por id.
        // Respaldo para cuando el paciente paga pero nunca vuelve del checkout.
        const ref = payment.external_reference as string | undefined;
        const REF_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (payment.status === 'approved' && ref && REF_UUID.test(ref)) {
          const amount = Math.round(Number(payment.transaction_amount) || 0);
          const { data: updated, error } = await supabase
            .from('appointments')
            .update({
              status: 'Confirmado',
              payment_status: 'Pagado',
              payment_amount: amount,
              paid_at: payment.date_approved || new Date().toISOString(),
            })
            .eq('id', ref)
            .eq('payment_status', 'Pendiente')
            .select('id, professional_id, patient_name, service_name');

          if (error) {
            console.error('[mp-webhook] reconcile error:', error.message);
          } else if (updated?.length) {
            console.log('[mp-webhook] cita conciliada:', ref);
            // Registrar ingreso en transactions para el panel de finanzas
            const apt = updated[0];
            const { error: txErr } = await supabase.from('transactions').insert({
              id: crypto.randomUUID(),
              professional_id: apt.professional_id,
              amount,
              description: `Cita: ${apt.patient_name} - ${apt.service_name}`,
              date: new Date().toISOString().split('T')[0],
              type: 'Ingreso',
            });
            if (txErr) console.error('[mp-webhook] transaction insert error:', txErr.message);
          }
        }
      } catch (e) {
        console.error('[mp-webhook] Error consultando pago:', e);
      }
    }
  }

  if (type === 'preapproval') {
    const preapprovalId = data?.id;
    if (preapprovalId && ACCESS_TOKEN) {
      try {
        const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        });
        const sub = await mpRes.json();

        const email = sub.payer_email as string | undefined;
        // Enmascara el email en logs para no exponer PII
        const masked = email ? email.replace(/^(.).*(@.*)$/, '$1***$2') : '(sin email)';
        console.log('[mp-webhook] preapproval status:', sub.status, masked);

        if (email) {
          const newStatus = sub.status === 'authorized' ? 'active'
            : (sub.status === 'cancelled' || sub.status === 'paused') ? 'paused'
            : null;

          if (newStatus) {
            const updateFields: Record<string, unknown> = {
              subscription_status: newStatus,
              is_subscribed: newStatus === 'active',
            };
            if (newStatus === 'active') {
              // Reactivated — clear grace period and restore visibility
              updateFields.is_public = true;
              updateFields.paused_at = null;
            } else {
              // Paused/cancelled — record timestamp, keep visible during 5-day grace
              updateFields.paused_at = new Date().toISOString();
            }
            const { error } = await supabase
              .from('professionals')
              .update(updateFields)
              .ilike('email', email);

            if (error) console.error('[mp-webhook] supabase update error:', error.message);
            else console.log('[mp-webhook] subscription updated for', masked, '->', newStatus);
          }
        }
      } catch (e) {
        console.error('[mp-webhook] Error consultando preapproval:', e);
      }
    }
  }

  return res.status(200).json({ received: true });
}
