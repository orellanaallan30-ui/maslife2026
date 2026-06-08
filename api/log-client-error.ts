import type { VercelRequest, VercelResponse } from '@vercel/node';

// Endpoint liviano de diagnóstico: registra errores del cliente (p. ej. fallos
// de inicialización del Brick de MercadoPago) en los logs de Vercel para poder
// depurar problemas que sólo ocurren en el navegador del usuario.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { context, error, detail } = req.body || {};
    console.error(
      '[client-error]',
      JSON.stringify({ context, error, detail }).slice(0, 2000)
    );
  } catch {
    console.error('[client-error] cuerpo no parseable');
  }
  return res.status(200).json({ logged: true });
}
