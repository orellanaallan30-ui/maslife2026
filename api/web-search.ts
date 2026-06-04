// Vercel Serverless — Búsqueda web para el AgenteMasLife
// Prioridad: Tavily → Brave Search → DuckDuckGo (sin clave)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSupabaseAuth, checkIpRateLimit } from './_lib/auth';

async function searchTavily(query: string): Promise<string | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, query, max_results: 4, include_answer: true, search_depth: 'advanced' }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const lines: string[] = [];
    if (d.answer) lines.push(`**Resumen:** ${d.answer}`);
    (d.results || []).slice(0, 3).forEach((res: any) =>
      lines.push(`**${res.title}**\n${res.content?.substring(0, 350) ?? ''}\nFuente: ${res.url}`)
    );
    return lines.join('\n\n') || null;
  } catch { return null; }
}

async function searchBrave(query: string): Promise<string | null> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return null;
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=4&search_lang=es`;
    const r = await fetch(url, {
      headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': key },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.web?.results || [])
      .slice(0, 4)
      .map((res: any) => `**${res.title}**\n${res.description ?? ''}\nFuente: ${res.url}`)
      .join('\n\n') || null;
  } catch { return null; }
}

async function searchDDG(query: string): Promise<string> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const r = await fetch(url, { headers: { 'User-Agent': 'MasLife-Clinical-AI/1.0' } });
    const d = await r.json();
    const parts: string[] = [];
    if (d.AbstractText) parts.push(d.AbstractText);
    if (d.Answer)       parts.push(`Dato directo: ${d.Answer}`);
    const related = (d.RelatedTopics || []).slice(0, 4).filter((t: any) => t.Text).map((t: any) => t.Text);
    if (related.length) parts.push(`Temas relacionados:\n• ${related.join('\n• ')}`);
    return parts.join('\n\n') || 'Sin resultados para esta búsqueda. Intenta con otros términos.';
  } catch {
    return 'Error al conectar con el motor de búsqueda.';
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireSupabaseAuth(req, res);
  if (!user) return;

  if (!checkIpRateLimit(req.headers, 30, 60 * 1000)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const { query } = req.body || {};
  if (!query?.trim()) return res.status(400).json({ error: 'query requerido' });

  const result =
    (await searchTavily(query)) ??
    (await searchBrave(query))  ??
    (await searchDDG(query));

  return res.status(200).json({ result });
}
