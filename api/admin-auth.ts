// Vercel Serverless — Autenticación de administrador server-side
// Credenciales verificadas contra ADMIN_EMAIL y ADMIN_PASSWORD en variables de entorno de Vercel
// NUNCA hardcodear credenciales en el código fuente

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';
import { checkIpRateLimit } from './_lib/auth';

function createAdminToken(secret: string): string {
  const exp = Date.now() + 8 * 60 * 60 * 1000; // 8 horas
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Rate limit: 5 intentos por 15 minutos para prevenir fuerza bruta
  if (!checkIpRateLimit(req.headers, 5, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiados intentos de acceso. Espera 15 minutos.' });
  }

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_JWT_SECRET) {
    return res.status(500).json({ error: 'Panel de administración no configurado. Configura ADMIN_EMAIL, ADMIN_PASSWORD y ADMIN_JWT_SECRET en Vercel.' });
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Faltan credenciales' });
  }

  // Delay constante para prevenir timing attacks (siempre 300ms independiente del resultado)
  await new Promise(r => setTimeout(r, 300));

  if (username.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase().trim() || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const token = createAdminToken(ADMIN_JWT_SECRET);
  return res.status(200).json({ token });
}
