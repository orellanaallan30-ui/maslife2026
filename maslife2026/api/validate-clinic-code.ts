// Vercel Serverless — Validación de código de clínica server-side
// El código secreto vive en CLINIC_AUTH_CODE (var de entorno Vercel, sin prefijo VITE_)
// Nunca se expone al cliente

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkIpRateLimit } from './_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // Rate limiting: máximo 5 intentos por IP por hora
  if (!checkIpRateLimit(req.headers as Record<string, string | string[] | undefined>, 5, 60 * 60 * 1000)) {
    return res.status(429).json({ valid: false, error: 'Demasiados intentos. Intenta en 1 hora.' });
  }

  const CLINIC_CODE = process.env.CLINIC_AUTH_CODE;
  if (!CLINIC_CODE) {
    return res.status(500).json({ valid: false, error: 'Código no configurado en servidor' });
  }

  const { code } = req.body || {};
  if (!code) return res.status(400).json({ valid: false });

  // Delay constante (previene timing attacks + brute force)
  await new Promise(r => setTimeout(r, 400));

  const valid = (code as string).toUpperCase().trim() === CLINIC_CODE.toUpperCase().trim();
  return res.status(200).json({ valid });
}
