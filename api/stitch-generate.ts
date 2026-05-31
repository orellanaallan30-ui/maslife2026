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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!checkRateLimit(req.headers, 10, 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en un momento.' });
  }

  const STITCH_API_KEY = process.env.STITCH_API_KEY;
  if (!STITCH_API_KEY) {
    return res.status(500).json({ error: 'STITCH_API_KEY no configurada en el servidor.' });
  }

  const { prompt, projectId, screenId, action = 'generate' } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'El campo prompt es requerido.' });
  }

  try {
    // Lazy import to avoid bundling issues when SDK is not installed
    const { stitch } = await import('@google/stitch-sdk');

    let activeProjectId: string = projectId;

    // Create a new project if none provided
    if (!activeProjectId) {
      const createResult = await (stitch as any).callTool('create_project', {
        title: 'MasLife Diseño Clínica'
      });
      activeProjectId = createResult?.projectId ?? createResult?.id ?? createResult;
    }

    const project = stitch.project(activeProjectId);

    let screen: any;
    if (action === 'edit' && screenId) {
      const existing = await project.getScreen(screenId);
      screen = await existing.edit(prompt.trim());
    } else if (action === 'variant' && screenId) {
      const existing = await project.getScreen(screenId);
      const variants = await existing.variants(prompt.trim(), { variantCount: 1, creativeRange: 'EXPLORE' });
      screen = Array.isArray(variants) ? variants[0] : variants;
    } else {
      screen = await project.generate(prompt.trim());
    }

    const htmlUrl: string = await screen.getHtml();
    const imageUrl: string = await screen.getImage();

    // Fetch HTML content server-side so the client can render a sandbox preview
    let htmlContent = '';
    try {
      const htmlRes = await fetch(htmlUrl);
      if (htmlRes.ok) htmlContent = await htmlRes.text();
    } catch {
      // HTML content optional — imageUrl is sufficient for preview
    }

    return res.status(200).json({
      htmlUrl,
      htmlContent,
      imageUrl,
      screenId: screen.id ?? screen.screenId,
      projectId: activeProjectId,
    });
  } catch (error: any) {
    const code: string = error?.code ?? '';
    if (code === 'AUTH_FAILED') {
      return res.status(401).json({ error: 'API key de Stitch inválida o expirada.' });
    }
    if (code === 'RATE_LIMITED') {
      return res.status(429).json({ error: 'Límite de Stitch alcanzado. Intenta en unos segundos.' });
    }
    return res.status(500).json({ error: error?.message ?? 'Error al generar el diseño.' });
  }
}
