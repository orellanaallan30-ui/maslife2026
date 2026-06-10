// Vercel Serverless Function — Proxy a Claude API para el agente IA
// Configura ANTHROPIC_API_KEY en Vercel Environment Variables
// Requiere sesión Supabase activa (profesional logueado)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSupabaseAuth, checkIpRateLimit } from './_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting por IP: 30 llamadas por minuto (previene abuso de costos)
  if (!checkIpRateLimit(req.headers as Record<string, string | string[] | undefined>, 30, 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en un momento.' });
  }

  // Requerir sesión de Supabase (profesional autenticado)
  // Si SUPABASE_SERVICE_ROLE_KEY no está configurada, permite el acceso (modo desarrollo)
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const auth = await requireSupabaseAuth(req.headers as Record<string, string | string[] | undefined>);
    if (!auth) {
      return res.status(401).json({ error: 'No autorizado. Inicia sesión para usar el asistente IA.' });
    }
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel' });
  }

  const { messages, system, tools, max_tokens } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages requerido' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: Math.min(Number(max_tokens) || 1024, 4096),
        system: system || '',
        messages,
        tools: tools || [],
        temperature: 0
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: errorData });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
