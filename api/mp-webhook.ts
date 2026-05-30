import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

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

  // Validar firma si el secreto está configurado
  if (WEBHOOK_SECRET && !validateSignature(req, WEBHOOK_SECRET)) {
    console.warn('[mp-webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { type, data, action } = req.body || {};
  console.log('[mp-webhook]', type, action, data?.id);

  if (type === 'payment' || type === 'order') {
    const paymentId = data?.id;
    if (paymentId) {
      const ACCESS_TOKEN = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
      if (ACCESS_TOKEN) {
        try {
          const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
          });
          const payment = await mpRes.json();
          console.log('[mp-webhook] payment status:', payment.status, payment.status_detail, payment.external_reference);
          // TODO: actualizar estado de la cita en Supabase si es necesario
          // El flujo sync ya maneja el caso de approved, este webhook cubre pending → approved
        } catch (e) {
          console.error('[mp-webhook] Error consultando pago:', e);
        }
      }
    }
  }

  return res.status(200).json({ received: true });
}
