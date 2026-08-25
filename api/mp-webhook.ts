import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { confirmPaidAppointment } from './_lib/mpReconcile';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

const escapeHtml = (s: string): string =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// Registro permanente de cada webhook en Supabase para diagnóstico. Best-effort:
// nunca rompe el procesamiento del webhook si el insert falla.
//
// OJO: el cliente de Supabase NO lanza excepción cuando el insert falla, devuelve
// { error }. Un try/catch por sí solo deja el fallo invisible y `webhook_events`
// aparece vacía aunque MercadoPago sí esté llamando — por ejemplo si falta
// SUPABASE_SERVICE_ROLE_KEY y se cae a la clave anónima, que RLS rechaza. Por eso
// aquí se inspecciona `error` explícitamente y se escribe en los logs de Vercel.
async function logWebhookEvent(fields: {
  event_type?: string;
  action?: string;
  mp_data_id?: string;
  signature_valid?: boolean;
  mp_status?: string;
  payer_email?: string;
  matched_professional_id?: string | null;
  outcome: string;
  detail?: string;
}): Promise<void> {
  try {
    const { error } = await supabase.from('webhook_events').insert(fields);
    if (error) {
      console.error(
        '[mp-webhook] insert en webhook_events RECHAZADO:', error.message,
        '| code:', error.code,
        '| usando service_role:', Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        '| evento:', JSON.stringify(fields),
      );
    }
  } catch (e) {
    console.error('[mp-webhook] no se pudo registrar webhook_event:', e);
  }
}

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
  // Antes esto era `if (req.method !== 'POST') return res.status(405).end()`, que
  // cortaba ANTES de registrar nada. Una notificación IPN disparada por el
  // notification_url de la preferencia puede llegar como GET
  // (?topic=payment&id=…), y desaparecía sin dejar rastro: la tabla quedaba vacía
  // y parecía que MercadoPago nunca había llamado. Ahora queda constancia.
  if (req.method !== 'POST') {
    const topic = (req.query.topic || req.query.type) as string | undefined;
    const ipnId = (req.query['data.id'] || req.query.id) as string | undefined;
    console.log('[mp-webhook] llegada no-POST:', req.method, 'topic:', topic, 'id:', ipnId);
    await logWebhookEvent({
      event_type: topic, mp_data_id: ipnId ? String(ipnId) : undefined,
      signature_valid: false, outcome: 'ignored_method',
      detail: `MercadoPago llamó con ${req.method} (formato IPN). Query: ${JSON.stringify(req.query).slice(0, 300)}`,
    });
    return res.status(200).json({ received: true });
  }

  const WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET;

  // La validación de firma es OBLIGATORIA: sin el secreto configurado, el webhook
  // rechaza todo, ya que un atacante podría falsificar eventos (p.ej. activar
  // suscripciones sin pagar). Configura MERCADOPAGO_WEBHOOK_SECRET en Vercel.
  if (!WEBHOOK_SECRET) {
    console.error('[mp-webhook] MERCADOPAGO_WEBHOOK_SECRET no configurado — rechazando');
    await logWebhookEvent({
      event_type: req.body?.type, action: req.body?.action, mp_data_id: req.body?.data?.id,
      signature_valid: false, outcome: 'no_secret',
    });
    return res.status(503).json({ error: 'Webhook secret not configured' });
  }
  if (!validateSignature(req, WEBHOOK_SECRET)) {
    console.warn('[mp-webhook] Invalid signature');
    await logWebhookEvent({
      event_type: req.body?.type, action: req.body?.action, mp_data_id: req.body?.data?.id,
      signature_valid: false, outcome: 'signature_rejected',
    });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { type, data, action } = req.body || {};
  console.log('[mp-webhook]', type, action, data?.id);

  // Deja constancia de la llegada ANTES de intentar nada. Los registros
  // específicos de más abajo (matched_updated, ignored_status, error) solo se
  // escriben si el pago prospera, así que sin esta fila un webhook que no
  // concilia no deja rastro alguno — y la tabla vacía se interpreta como "MP
  // nunca llamó", que fue justamente lo que nos despistó.
  await logWebhookEvent({
    event_type: type, action, mp_data_id: data?.id ? String(data.id) : undefined,
    signature_valid: true, outcome: 'received',
  });

  const ACCESS_TOKEN = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();

  if (type === 'payment' || type === 'order') {
    const paymentId = data?.id;
    if (!paymentId || !ACCESS_TOKEN) {
      await logWebhookEvent({
        event_type: type, action, mp_data_id: paymentId ? String(paymentId) : undefined,
        signature_valid: true, outcome: 'error',
        detail: !paymentId ? 'el aviso no trae data.id' : 'falta MERCADOPAGO_ACCESS_TOKEN',
      });
    }
    if (paymentId && ACCESS_TOKEN) {
      try {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        });
        const payment = await mpRes.json();

        // Un error de la API y un pago no aprobado no son lo mismo. Sin mirar
        // mpRes.ok, la respuesta de error de MercadoPago trae `status: 404`, que
        // simplemente no coincide con 'approved' y el fallo pasa por pago
        // rechazado. Es lo que devuelve el simulador del panel, cuyo id es falso.
        if (!mpRes.ok) {
          console.error('[mp-webhook] la consulta del pago falló:', mpRes.status, JSON.stringify(payment).slice(0, 200));
          await logWebhookEvent({
            event_type: 'payment', mp_data_id: String(paymentId), signature_valid: true,
            outcome: 'error',
            detail: `consulta a MercadoPago devolvió HTTP ${mpRes.status}: ${JSON.stringify(payment).slice(0, 300)}`,
          });
          return res.status(200).json({ received: true });
        }

        console.log('[mp-webhook] payment status:', payment.status, payment.status_detail, payment.external_reference);

        // Conciliación: external_reference = id (UUID) de la cita. La tabla NO
        // tiene columna external_reference — el match correcto es por id.
        // Respaldo para cuando el paciente paga pero nunca vuelve del checkout.
        const ref = payment.external_reference as string | undefined;
        const REF_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (payment.status === 'approved' && ref && REF_UUID.test(ref)) {
          const amount = Math.round(Number(payment.transaction_amount) || 0);
          // Misma rutina que usa la conciliación activa (_lib/mpReconcile): marca
          // la cita, registra el ingreso y envía los correos. Compartirla evita
          // que las dos vías se desincronicen.
          const confirmada = await confirmPaidAppointment(
            ref, amount, payment.date_approved || new Date().toISOString(),
          );
          if (confirmada) {
            console.log('[mp-webhook] cita conciliada:', ref);
            await logWebhookEvent({ event_type: 'payment', mp_data_id: String(paymentId), signature_valid: true, mp_status: payment.status, outcome: 'matched_updated', detail: `cita ${ref}` });
          } else {
            await logWebhookEvent({ event_type: 'payment', mp_data_id: String(paymentId), signature_valid: true, mp_status: payment.status, outcome: 'ignored_status', detail: 'la cita ya estaba confirmada o no existe' });
          }
        } else {
          // El pago llegó pero no se concilia: puede estar pendiente o rechazado,
          // o venir sin external_reference. Sin esta fila el aviso desaparecía
          // sin dejar constancia y no había forma de saber por qué.
          await logWebhookEvent({
            event_type: 'payment', mp_data_id: String(paymentId), signature_valid: true,
            mp_status: payment.status ? String(payment.status) : undefined,
            outcome: 'ignored_status',
            detail: !ref ? 'el pago no trae external_reference'
              : !REF_UUID.test(ref) ? `external_reference no es un UUID de cita: ${ref}`
              : `pago no aprobado (${payment.status})`,
          });
        }
      } catch (e) {
        console.error('[mp-webhook] Error consultando pago:', e);
        await logWebhookEvent({ event_type: 'payment', mp_data_id: String(paymentId), signature_valid: true, outcome: 'error', detail: String(e) });
      }
    }
  }

  if (type === 'preapproval') {
    const preapprovalId = data?.id;
    if (!preapprovalId || !ACCESS_TOKEN) {
      await logWebhookEvent({
        event_type: type, action, mp_data_id: preapprovalId ? String(preapprovalId) : undefined,
        signature_valid: true, outcome: 'error',
        detail: !preapprovalId ? 'el aviso no trae data.id' : 'falta MERCADOPAGO_ACCESS_TOKEN',
      });
    }
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
              await logWebhookEvent({ event_type: 'preapproval', mp_data_id: String(preapprovalId), signature_valid: true, mp_status: String(sub.status), payer_email: email, outcome: 'error', detail: error.message });
            } else if (!updatedPros || updatedPros.length === 0) {
              // Pago recibido pero ningún profesional coincide con el payer_email.
              // Antes esto fallaba en silencio; ahora se registra y se alerta al admin.
              console.error('[mp-webhook] ❌ SIN COINCIDENCIA para', masked, '- status MP:', sub.status);
              await logWebhookEvent({ event_type: 'preapproval', mp_data_id: String(preapprovalId), signature_valid: true, mp_status: String(sub.status), payer_email: email, outcome: 'unmatched' });
              await notifyAdminOrphanPreapproval(email, String(sub.status), String(preapprovalId));
            } else {
              console.log('[mp-webhook] subscription updated for', masked, '->', newStatus);
              await logWebhookEvent({ event_type: 'preapproval', mp_data_id: String(preapprovalId), signature_valid: true, mp_status: String(sub.status), payer_email: email, matched_professional_id: updatedPros[0].id, outcome: 'matched_updated' });
            }
          } else {
            // Estado de MP que no mapeamos (p.ej. 'pending') — lo registramos para no perderlo.
            await logWebhookEvent({ event_type: 'preapproval', mp_data_id: String(preapprovalId), signature_valid: true, mp_status: String(sub.status), payer_email: email, outcome: 'ignored_status' });
          }
        } else {
          await logWebhookEvent({ event_type: 'preapproval', mp_data_id: String(preapprovalId), signature_valid: true, mp_status: String(sub.status), outcome: 'ignored_status', detail: 'sin payer_email' });
        }
      } catch (e) {
        console.error('[mp-webhook] Error consultando preapproval:', e);
        await logWebhookEvent({ event_type: 'preapproval', mp_data_id: String(preapprovalId), signature_valid: true, outcome: 'error', detail: String(e) });
      }
    }
  }

  // Tipos que ninguna rama atiende (plan, invoice, point_integration_wh…). No es
  // un error, pero conviene que quede anotado: si algún día MercadoPago empieza a
  // avisar de algo que sí nos importa, se verá aquí en vez de perderse.
  if (type !== 'payment' && type !== 'order' && type !== 'preapproval') {
    await logWebhookEvent({
      event_type: type, action, mp_data_id: data?.id ? String(data.id) : undefined,
      signature_valid: true, outcome: 'ignored_type',
      detail: `tipo de evento sin rama que lo atienda: ${type}`,
    });
  }

  return res.status(200).json({ received: true });
}
