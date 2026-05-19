import type { VercelRequest, VercelResponse } from '@vercel/node';

const ipCounts = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(headers: VercelRequest['headers'], max: number, windowMs: number): boolean {
  const forwarded = headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : (forwarded || 'unknown')).split(',')[0].trim();
  const now = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    ipCounts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  if (!checkRateLimit(req.headers, 5, 60 * 60 * 1000)) {
    return res.status(429).json({ valid: false, error: 'Demasiados intentos. Intenta en 1 hora.' });
  }

  const CLINIC_CODE = process.env.CLINIC_AUTH_CODE;
  if (!CLINIC_CODE) {
    return res.status(500).json({ valid: false, error: 'Código no configurado en servidor' });
  }

  const { code } = req.body || {};
  if (!code) return res.status(400).json({ valid: false });

  await new Promise(r => setTimeout(r, 400));

  const valid = (code as string).toUpperCase().trim() === CLINIC_CODE.toUpperCase().trim();
  return res.status(200).json({ valid });
}
