import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSupabaseAuth, checkIpRateLimit } from './_lib/auth';
import { WEB_SEARCH_TOOL, INSTRUCCIONES_BUSQUEDA, resolverPauseTurn } from './_lib/webSearch';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireSupabaseAuth(req, res);
  if (!user) return;

  if (!checkIpRateLimit(req.headers, 30, 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en un momento.' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel' });
  }

  const { messages, system, tools, max_tokens } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages requerido' });
  }
  // El cliente puede pedir más tokens (informes largos); tope duro de 4096
  const maxTokens = typeof max_tokens === 'number' && max_tokens > 0 ? Math.min(max_tokens, 4096) : 2048;

  // El cliente aporta sus herramientas de agenda (las ejecuta él). La búsqueda
  // web se sirve server-side desde Anthropic y restringida a fuentes confiables,
  // así que se descarta cualquier `web_search` que mande el cliente — evita
  // nombres duplicados si quedó JS antiguo en caché.
  const herramientasCliente = Array.isArray(tools)
    ? tools.filter((t: any) => t?.name !== 'web_search')
    : [];
  const herramientas = [...herramientasCliente, WEB_SEARCH_TOOL];

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
        max_tokens: maxTokens,
        system: (system || '') + INSTRUCCIONES_BUSQUEDA,
        messages: msgs,
        tools: herramientas,
      }),
    });
    if (!r.ok) {
      const errorData = await r.json().catch(() => ({}));
      const err: any = new Error(errorData?.error?.message || `Anthropic error ${r.status}`);
      err.status = r.status;
      err.payload = errorData;
      throw err;
    }
    return r.json();
  };

  try {
    const primera = await callClaude(messages);
    // La búsqueda se resuelve sola en el servidor; solo continuamos si el loop
    // interno de Anthropic pide `pause_turn`.
    const data = await resolverPauseTurn(primera, messages, callClaude);


    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(error?.status || 500).json({ error: error?.payload?.error || error.message });
  }
}
