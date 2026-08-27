import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// App de estudio para estudiantes, servida desde el mismo dominio de la clínica.
//
// Vive en _lib y la invoca api/ai-agent.ts porque el plan Vercel Hobby admite 12
// funciones serverless y ya están las 12 (regla 4 del proyecto): un archivo nuevo
// en api/ rompería el despliegue sin avisar. Los módulos de _lib no cuentan.
//
// Identificación: token de enlace secreto, sin contraseña. No hay datos clínicos
// de terceros aquí, solo el material de estudio de quien usa la app.

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!,
);

// Formato del token tal como lo genera la migración 0017: 36 caracteres hex.
// Filtrar aquí evita ir a la base con cualquier cosa que llegue por la URL.
const TOKEN_RE = /^[0-9a-f]{20,64}$/;

interface Usuario {
  token: string;
  nombre: string;
  ai_calls_today: number;
  ai_day: string;
  ai_daily_limit: number;
}

/**
 * Comprueba el token y devuelve el usuario, o null si no existe.
 * De paso registra la última visita, útil para saber si la app se usa.
 */
async function validarToken(token: unknown): Promise<Usuario | null> {
  const t = String(token || '').trim().toLowerCase();
  if (!TOKEN_RE.test(t)) return null;

  const { data, error } = await supabase
    .from('study_users')
    .select('token, nombre, ai_calls_today, ai_day, ai_daily_limit')
    .eq('token', t)
    .maybeSingle();

  if (error) {
    console.error('[studyApp] no se pudo validar el token:', error.message);
    return null;
  }
  if (!data) return null;

  await supabase.from('study_users')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('token', t);

  return data as Usuario;
}

/**
 * Cuenta una llamada a la IA contra el tope diario. El contador se reinicia solo
 * al cambiar el día, comparando ai_day, así no hace falta una tarea programada.
 *
 * @returns cuántas llamadas quedan, o null si ya se agotó el cupo de hoy.
 */
async function consumirCupoIA(u: Usuario): Promise<number | null> {
  const hoy = new Date().toISOString().split('T')[0];
  const esMismoDia = u.ai_day === hoy;
  const usadas = esMismoDia ? u.ai_calls_today : 0;

  if (usadas >= u.ai_daily_limit) return null;

  const { error } = await supabase.from('study_users')
    .update({ ai_calls_today: usadas + 1, ai_day: hoy })
    .eq('token', u.token);
  if (error) console.error('[studyApp] no se pudo actualizar el cupo:', error.message);

  return u.ai_daily_limit - (usadas + 1);
}

async function llamarClaude(body: {
  system?: string;
  messages: unknown[];
  maxTokens: number;
  tools?: unknown[];
}): Promise<any> {
  const clave = process.env.ANTHROPIC_API_KEY;
  if (!clave) {
    const e: any = new Error('ANTHROPIC_API_KEY no configurada en Vercel');
    e.status = 500;
    throw e;
  }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': clave,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: body.maxTokens,
      system: body.system || '',
      messages: body.messages,
      ...(body.tools?.length ? { tools: body.tools } : {}),
    }),
  });
  if (!r.ok) {
    const detalle = await r.json().catch(() => ({}));
    const e: any = new Error(detalle?.error?.message || `Anthropic respondió ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Los bloques de texto se unen SIN salto de línea: cuando Claude cita fuentes
// parte la respuesta en varios bloques contiguos, y un '\n' entre ellos rompería
// el JSON del módulo.
const textoDe = (data: any): string =>
  (data?.content || [])
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim();

// Bloques de uso de herramienta: es como el asistente pide crear una pestaña.
const herramientasUsadas = (data: any): Array<{ name: string; input: unknown }> =>
  (data?.content || [])
    .filter((b: any) => b?.type === 'tool_use')
    .map((b: any) => ({ name: b.name, input: b.input }));

/**
 * Igual que la consulta normal, pero devolviendo la respuesta como flujo de
 * eventos según llega de Anthropic. La app va hablando cada frase completa sin
 * esperar el final, que es lo que hace que la conversación se sienta viva.
 *
 * Formato de salida (una línea JSON por evento, separadas por \n):
 *   {"t":"texto","v":"..."}       fragmento de texto
 *   {"t":"fin","herramientas":[]} cierre, con las pestañas que pidió crear
 *   {"t":"error","v":"..."}       fallo a mitad del flujo
 */
async function responderEnFlujo(
  res: VercelResponse,
  cuerpo: { system?: string; messages: unknown[]; maxTokens: number; tools?: unknown[] },
  restantes: number,
): Promise<void> {
  const clave = process.env.ANTHROPIC_API_KEY!;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': clave,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: cuerpo.maxTokens,
      system: cuerpo.system || '',
      messages: cuerpo.messages,
      stream: true,
      ...(cuerpo.tools?.length ? { tools: cuerpo.tools } : {}),
    }),
  });

  if (!r.ok || !r.body) {
    const detalle = await r.json().catch(() => ({}));
    const e: any = new Error(detalle?.error?.message || `Anthropic respondió ${r.status}`);
    e.status = r.status;
    throw e;
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  const enviar = (o: unknown) => res.write(JSON.stringify(o) + '\n');

  // Las herramientas llegan troceadas como input_json_delta: se acumula el JSON
  // de cada bloque y se interpreta al cerrarlo.
  const herramientas: Array<{ name: string; input: unknown }> = [];
  const enCurso = new Map<number, { name: string; json: string }>();

  const lector = r.body.getReader();
  const dec = new TextDecoder();
  let resto = '';

  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      resto += dec.decode(value, { stream: true });
      const lineas = resto.split('\n');
      resto = lineas.pop() || '';

      for (const linea of lineas) {
        if (!linea.startsWith('data:')) continue;
        const crudo = linea.slice(5).trim();
        if (!crudo || crudo === '[DONE]') continue;

        let ev: any;
        try { ev = JSON.parse(crudo); } catch { continue; }

        if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
          enCurso.set(ev.index, { name: ev.content_block.name, json: '' });
        } else if (ev.type === 'content_block_delta') {
          if (ev.delta?.type === 'text_delta' && ev.delta.text) {
            enviar({ t: 'texto', v: ev.delta.text });
          } else if (ev.delta?.type === 'input_json_delta') {
            const b = enCurso.get(ev.index);
            if (b) b.json += ev.delta.partial_json || '';
          }
        } else if (ev.type === 'content_block_stop') {
          const b = enCurso.get(ev.index);
          if (b) {
            try { herramientas.push({ name: b.name, input: JSON.parse(b.json || '{}') }); }
            catch { /* herramienta mal formada: la conversación sigue igual */ }
            enCurso.delete(ev.index);
          }
        }
      }
    }
    enviar({ t: 'fin', herramientas, restantes });
  } catch (e: any) {
    enviar({ t: 'error', v: e?.message || 'Se cortó la respuesta' });
  } finally {
    res.end();
  }
}

export async function atenderModoEstudio(req: VercelRequest, res: VercelResponse) {
  const { token, accion, app } = req.body || {};

  const usuario = await validarToken(token);
  if (!usuario) {
    return res.status(401).json({ error: 'Enlace no válido. Pide uno nuevo.' });
  }

  const nombreApp = String(app || 'general').slice(0, 60);

  try {
    // ── Cargar el material guardado ──
    if (accion === 'cargar') {
      const { data, error } = await supabase
        .from('study_progress')
        .select('data, updated_at')
        .eq('token', usuario.token)
        .eq('app', nombreApp)
        .maybeSingle();
      if (error) {
        console.error('[studyApp] no se pudo cargar el progreso:', error.message);
        return res.status(500).json({ error: 'No se pudo cargar tu material guardado.' });
      }
      return res.status(200).json({
        nombre: usuario.nombre,
        data: data?.data || {},
        updated_at: data?.updated_at || null,
      });
    }

    // ── Guardar ──
    if (accion === 'guardar') {
      const contenido = req.body?.data;
      if (typeof contenido !== 'object' || contenido === null) {
        return res.status(400).json({ error: 'data debe ser un objeto' });
      }
      // Tope de tamaño: evita que un material enorme llene la fila sin querer.
      if (JSON.stringify(contenido).length > 2_000_000) {
        return res.status(413).json({ error: 'El material guardado es demasiado grande.' });
      }
      const { error } = await supabase.from('study_progress').upsert({
        token: usuario.token,
        app: nombreApp,
        data: contenido,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'token,app' });
      if (error) {
        console.error('[studyApp] no se pudo guardar el progreso:', error.message);
        return res.status(500).json({ error: 'No se pudo guardar. Revisa tu conexión.' });
      }
      return res.status(200).json({ ok: true });
    }

    // ── Consultar a la IA ──
    if (accion === 'ia') {
      const restantes = await consumirCupoIA(usuario);
      if (restantes === null) {
        return res.status(429).json({
          error: `Llegaste al tope de ${usuario.ai_daily_limit} consultas de hoy. Vuelve mañana.`,
        });
      }

      const { messages, system, max_tokens, tools, stream } = req.body;
      if (!Array.isArray(messages) || !messages.length) {
        return res.status(400).json({ error: 'messages requerido' });
      }
      const maxTokens = typeof max_tokens === 'number' && max_tokens > 0
        ? Math.min(max_tokens, 8000)
        : 4000;

      // La voz pide el flujo para empezar a hablar antes; el texto no lo necesita.
      if (stream === true) {
        return responderEnFlujo(res, {
          system, messages, maxTokens,
          tools: Array.isArray(tools) ? tools : undefined,
        }, restantes);
      }

      const data = await llamarClaude({
        system, messages, maxTokens,
        tools: Array.isArray(tools) ? tools : undefined,
      });
      return res.status(200).json({
        texto: textoDe(data),
        herramientas: herramientasUsadas(data),
        restantes,
      });
    }

    return res.status(400).json({ error: 'Acción no reconocida' });
  } catch (e: any) {
    console.error('[studyApp] error:', e?.message);
    return res.status(e?.status || 500).json({ error: e?.message || 'Error interno' });
  }
}
