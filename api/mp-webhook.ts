import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

const escapeHtml = (s: string): string =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// Alerta al admin cuando MercadoPago reporta un pago de suscripción pero ningún
// profesional coincide con el payer_email. Best-effort: nunca rompe el webhook.
async function notifyAdminOrphanPreapproval(payerEmail: string, mpStatus: string, preapprovalId: string): Promise<void> {
  try {
    const RESEND_KEY  = process.env.RESEND_API_KEY;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    const FROM        = (process.env.EMAIL_FROM || 'Clínica Maslife <notificaciones@clinicamaslife.cl>').trim();
    if (!RESEND_KEY || !ADMIN_EMAIL) {
      console.error('[mp-webhook] no se pudo alertar al admin: falta RESEND_API_KEY o ADMIN_EMAIL');
      return;
    }
    const html = `
      <div style="font-family:sans-serif;line-height:1.5;color:#0f172a">
        <h2 style="color:#b45309">⚠️ Pago de suscripción sin profesional vinculado</h2>
        <p>MercadoPago reportó un evento de suscripción pero <b>ningún profesional tiene ese email registrado</b>. La suscripción NO se reactivó automáticamente.</p>
        <table style="border-collapse:collapse;margin:12px 0">
          <tr><td style="padding:4px 8px"><b>Email del pago (MP):</b></td><td style="padding:4px 8px">${escapeHtml(payerEmail)}</td></tr>
          <tr><td style="padding:4px 8px"><b>Estado en MP:</b></td><td style="padding:4px 8px">${escapeHtml(mpStatus)}</td></tr>
          <tr><td style="padding:4px 8px"><b>Preapproval ID:</b></td><td style="padding:4px 8px">${escapeHtml(preapprovalId)}</td></tr>
        </table>
        <p><b>Acción:</b> entra al panel admin, busca al profesional y usa "Activar suscripción", o corrige el email registrado para que coincida con el de MercadoPago.</p>
      </div>`;
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [ADMIN_EMAIL], subject: '⚠️ Pago de suscripción sin profesional vinculado', html }),
    });
    if (!resp.ok) console.error('[mp-webhook] fallo al enviar alerta admin:', resp.status);
    else console.log('[mp-webhook] alerta de conciliación enviada al admin');
  } catch (e) {
    console.error('[mp-webhook] error enviando alerta admin:', e);
  }
}

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
            const { data: updatedPros, error } = await supabase
              .from('professionals')
              .update(updateFields)
              .ilike('email', email)
              .select('id');

            if (error) {
              console.error('[mp-webhook] supabase update error:', error.message);
            } else if (!updatedPros || updatedPros.length === 0) {
              // Pago recibido pero ningún profesional coincide con el payer_email.
              // Antes esto fallaba en silencio; ahora se registra y se alerta al admin.
              console.error('[mp-webhook] ❌ SIN COINCIDENCIA para', masked, '- status MP:', sub.status);
              await notifyAdminOrphanPreapproval(email, String(sub.status), String(preapprovalId));
            } else {
              console.log('[mp-webhook] subscription updated for', masked, '->', newStatus);
            }
          }
        }
      } catch (e) {
        console.error('[mp-webhook] Error consultando preapproval:', e);
      }
    }
  }

  return res.status(200).json({ received: true });
}
