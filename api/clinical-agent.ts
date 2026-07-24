// Vercel Serverless — AgenteMasLife Clínico con búsqueda web
// Ejecuta un loop agentico completo: Claude → tool_use → búsqueda → respuesta final

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSupabaseAuth, checkIpRateLimit } from './_lib/auth';

// ── Función de búsqueda web (Tavily → Brave → DuckDuckGo) ────────────────────
async function searchWeb(query: string): Promise<string> {
  // Tavily (mejor para agentes IA)
  if (process.env.TAVILY_API_KEY) {
    try {
      const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query,
          max_results: 4,
          include_answer: true,
          search_depth: 'advanced',
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const lines: string[] = [];
        if (d.answer) lines.push(`**Resumen IA:** ${d.answer}`);
        (d.results || []).slice(0, 3).forEach((res: any) =>
          lines.push(`📄 **${res.title}**\n${res.content?.substring(0, 400) ?? ''}\n🔗 ${res.url}`)
        );
        if (lines.length) return lines.join('\n\n');
      }
    } catch { /* fall through */ }
  }

  // Brave Search
  if (process.env.BRAVE_SEARCH_API_KEY) {
    try {
      const r = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=4&search_lang=es`,
        { headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY } }
      );
      if (r.ok) {
        const d = await r.json();
        const results = (d.web?.results || []).slice(0, 4)
          .map((res: any) => `📄 **${res.title}**\n${res.description ?? ''}\n🔗 ${res.url}`)
          .join('\n\n');
        if (results) return results;
      }
    } catch { /* fall through */ }
  }

  // DuckDuckGo (sin API key)
  try {
    const r = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { 'User-Agent': 'MasLife-Clinical-AI/1.0' } }
    );
    const d = await r.json();
    const parts: string[] = [];
    if (d.AbstractText) parts.push(d.AbstractText);
    if (d.Answer)       parts.push(`Dato directo: ${d.Answer}`);
    const related = (d.RelatedTopics || []).slice(0, 5).filter((t: any) => t.Text).map((t: any) => `• ${t.Text}`);
    if (related.length) parts.push(`Temas relacionados:\n${related.join('\n')}`);
    return parts.join('\n\n') || 'Sin resultados. Intenta con términos más específicos.';
  } catch {
    return 'Error de conexión al motor de búsqueda.';
  }
}

// ── Definición de tools disponibles para el agente ───────────────────────────
const TOOLS = [
  {
    name: 'web_search',
    description: `Busca información actualizada en internet. Úsala para:
- Protocolos y guías clínicas (MINSAL, NICE, GPC)
- Información sobre fármacos, dosis, efectos adversos, interacciones
- Estudios recientes, revisiones sistemáticas
- Criterios diagnósticos DSM-5 / CIE-11 / ICD-10
- Escalas de evaluación clínica (EVA, Barthel, MMSE, etc.)
- Cualquier información médica que requiera datos actualizados
Puedes buscar en español o inglés.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Consulta de búsqueda. Sé específico. Ej: "guía MINSAL lumbalgia crónica 2023" o "escala de ansiedad de Hamilton criterios"',
        },
      },
      required: ['query'],
    },
  },
];

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
        system: system || '',
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
    let currentMessages = [...messages];
    let response = await callClaude(currentMessages);
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    // Loop agentico: Claude puede buscar múltiples veces antes de responder
    while (response.stop_reason === 'tool_use' && iterations < MAX_ITERATIONS) {
      iterations++;
      const toolUseBlocks = (response.content as any[]).filter(b => b.type === 'tool_use');
      const toolResults: any[] = [];

      for (const block of toolUseBlocks) {
        let result = '';
        if (block.name === 'web_search') {
          result = await searchWeb(block.input.query);
        } else {
          result = `Herramienta "${block.name}" no disponible en este agente.`;
        }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ];

      response = await callClaude(currentMessages);
    }

    return res.status(200).json(response);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
