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
            const { error } = await supabase
              .from('professionals')
              .update({
                subscription_status: newStatus,
                is_subscribed: newStatus === 'active',
                is_public: newStatus === 'active',
              })
              .eq('email', email);

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
