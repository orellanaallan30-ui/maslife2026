// Temas que la gente propone para próximas guías (recuadro en las páginas de programas).
// Se guarda en guide_suggestions solo desde el servidor; el panel admin los lee.
import { createClient } from '@supabase/supabase-js';

// Cliente creado al usarlo (no al importar), para que validar no dependa de las variables.
const db = () => createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

export interface Sugerencia { tema: string; email: string | null; product_slug: string | null; origen: string | null }

/** Limpia y valida lo que llega del navegador. Devuelve null si no sirve. */
export function cleanSuggestion(body: any): Sugerencia | null {
  const tema = String(body?.tema ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (tema.length < 3 || tema.length > 400) return null;
  const emailRaw = String(body?.email ?? '').trim().toLowerCase();
  const email = emailRaw && EMAIL_RE.test(emailRaw) && emailRaw.length <= 200 ? emailRaw : null;
  const slug = String(body?.slug ?? '');
  const origen = String(body?.origen ?? '');
  return {
    tema,
    email,
    product_slug: SLUG_RE.test(slug) ? slug : null,
    origen: ['pagina', 'gracias'].includes(origen) ? origen : null,
  };
}

export async function saveSuggestion(body: any): Promise<{ ok: true } | { ok: false; code: number; error: string }> {
  const s = cleanSuggestion(body);
  if (!s) return { ok: false, code: 400, error: 'Escribe un tema de entre 3 y 400 caracteres' };
  const { error } = await db().from('guide_suggestions').insert(s);
  if (error) {
    console.error('[sugerencias] no se guardó:', error.message);
    return { ok: false, code: 500, error: 'No se pudo guardar tu sugerencia' };
  }
  return { ok: true };
}
