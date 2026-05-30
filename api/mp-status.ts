import type { VercelRequest, VercelResponse } from '@vercel/node';

// Endpoint de diagnóstico TEMPORAL — verifica configuración de MercadoPago
// sin exponer valores secretos. ELIMINAR después de verificar.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  const pub = process.env.VITE_MP_PUBLIC_KEY || '';
  const tok = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
  const hook = process.env.MERCADOPAGO_WEBHOOK_SECRET || '';

  res.json({
    publicKey: {
      present: !!pub,
      // Solo prefijo para saber si es TEST o APP_USR (no es secreto)
      prefix: pub ? pub.slice(0, 8) : null,
      length: pub.length,
    },
    accessToken: {
      present: !!tok,
      prefix: tok ? tok.slice(0, 8) : null, // "TEST-..." o "APP_USR-"
      length: tok.length,
    },
    webhookSecret: { present: !!hook },
  });
}
