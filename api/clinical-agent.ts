// Vercel Serverless — AgenteMasLife Clínico con búsqueda web
// La búsqueda corre server-side en Anthropic, restringida a fuentes confiables.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSupabaseAuth, checkIpRateLimit } from './_lib/auth';
import { WEB_SEARCH_TOOL, INSTRUCCIONES_BUSQUEDA, resolverPauseTurn } from './_lib/webSearch';

// ── Herramienta de búsqueda: nativa de Claude, restringida a fuentes confiables ──
// Antes se usaba una cadena propia Tavily → Brave → DuckDuckGo. Requería claves
// externas y, sin ellas, DuckDuckGo (API de "respuestas instantáneas") no hace
// búsqueda web real y nunca encontraba literatura clínica. La búsqueda nativa
// corre en los servidores de Anthropic con la misma ANTHROPIC_API_KEY.
const TOOLS = [WEB_SEARCH_TOOL];

// ── Handler principal ─────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Solo profesionales autenticados pueden usar el agente clínico
  const user = await requireSupabaseAuth(req, res);
  if (!user) return;

  // Rate limit: 20 consultas por 5 minutos por usuario/IP
  if (!checkIpRateLimit(req.headers, 20, 5 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas consultas. Intenta en 5 minutos.' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel' });

  const { messages, system } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages requerido' });

  const callClaude = async (msgs: any[]) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        system: (system || '') + INSTRUCCIONES_BUSQUEDA,
        messages: msgs,
        tools: TOOLS,
      }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e?.error?.message || `Anthropic error ${r.status}`);
    }
    return r.json();
  };

  try {
    const currentMessages = [...messages];
    // La búsqueda la ejecuta Anthropic server-side y vuelve resuelta en la misma
    // respuesta. Solo hay que continuar si el loop interno pide `pause_turn`.
    const first = await callClaude(currentMessages);
    const response = await resolverPauseTurn(first, currentMessages, callClaude);

    return res.status(200).json(response);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
