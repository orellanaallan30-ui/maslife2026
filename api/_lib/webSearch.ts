// Búsqueda web clínica compartida por los dos agentes (ai-agent y clinical-agent).
//
// Usa la herramienta de búsqueda NATIVA de Claude (server-side): corre en la
// infraestructura de Anthropic con la misma ANTHROPIC_API_KEY, sin necesitar
// claves de Tavily/Brave, y permite restringir los resultados por dominio.
//
// Requiere un modelo compatible (Sonnet 5 / Opus 4.6+). Ambos agentes usan
// claude-sonnet-5.

/**
 * Fuentes clínicas confiables. Solo se buscan resultados dentro de estos
 * dominios: bases de evidencia, guías clínicas, revistas indexadas y fuentes
 * de LatAm/Chile. Anthropic incluye también los subdominios (p. ej. `nih.gov`
 * cubre `pubmed.ncbi.nlm.nih.gov`).
 *
 * Para agregar o quitar una fuente, edita esta lista — es el único lugar.
 */
export const FUENTES_CLINICAS_CONFIABLES = [
  // Bases de evidencia y revisiones sistemáticas
  'nih.gov',                // PubMed / NCBI / PMC
  'cochranelibrary.com',    // Revisiones Cochrane
  'pedro.org.au',           // Physiotherapy Evidence Database (kinesiología)

  // Guías clínicas y organismos de salud
  'minsal.cl',              // Ministerio de Salud de Chile (GES/GPC)
  'who.int',                // OMS
  'paho.org',               // OPS
  'nice.org.uk',            // NICE (Reino Unido)
  'guiasalud.es',           // GuíaSalud (España)
  'cdc.gov',                // CDC

  // Revistas médicas indexadas
  'bmj.com',
  'thelancet.com',
  'nejm.org',
  'jamanetwork.com',
  'jospt.org',              // Ortopedia y fisioterapia deportiva
  'sciencedirect.com',
  'springer.com',
  'nature.com',
  'frontiersin.org',

  // Literatura de Latinoamérica
  'scielo.org',
  'scielo.cl',
  'bvsalud.org',            // BVS / LILACS

  // Referencia clínica y especialidades
  'medlineplus.gov',
  'mayoclinic.org',
  'physio-pedia.com',       // Kinesiología
  'apa.org',                // Psicología
];

/**
 * Definición de la herramienta de búsqueda web server-side, restringida a
 * fuentes confiables. Se pasa dentro del arreglo `tools` de la petición a
 * /v1/messages; Anthropic la ejecuta sola y devuelve los resultados con citas
 * en la misma respuesta (el cliente no ejecuta nada).
 */
export const WEB_SEARCH_TOOL = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: 5,
  allowed_domains: FUENTES_CLINICAS_CONFIABLES,
};

/**
 * Instrucciones para el system prompt: cómo y cuándo buscar, y cómo citar.
 * Se agrega al prompt de cada agente para que el comportamiento sea uniforme.
 */
export const INSTRUCCIONES_BUSQUEDA = `
BÚSQUEDA DE EVIDENCIA:
- Tienes búsqueda web restringida a fuentes clínicas confiables (PubMed, Cochrane,
  MINSAL, OMS, NICE, SciELO, PEDro, revistas indexadas).
- Búscala cuando la respuesta dependa de información actualizada o verificable:
  guías clínicas, dosis y fármacos, criterios diagnósticos, escalas validadas,
  eficacia de intervenciones o estudios recientes. Ante la duda, busca.
- **Cita siempre la fuente** (nombre y enlace) de cada afirmación que provenga de
  una búsqueda, e indica el año cuando esté disponible.
- Si la búsqueda no arroja resultados útiles, dilo explícitamente y responde con
  tu conocimiento general, aclarando que no está respaldado por una fuente citada.
- No inventes referencias, DOIs ni cifras: si no lo encontraste, no lo afirmes.`;

/**
 * Reenvía la conversación cuando la API devuelve `pause_turn` — ocurre cuando el
 * loop server-side de herramientas alcanza su límite interno y debe continuar.
 * Devuelve la respuesta final ya completa.
 */
export async function resolverPauseTurn(
  respuestaInicial: any,
  mensajes: any[],
  llamarClaude: (msgs: any[]) => Promise<any>,
  maxContinuaciones = 3
): Promise<any> {
  let respuesta = respuestaInicial;
  let historial = mensajes;

  for (let i = 0; i < maxContinuaciones && respuesta?.stop_reason === 'pause_turn'; i++) {
    // Se reenvía la respuesta parcial tal cual; el servidor retoma donde quedó.
    historial = [...historial, { role: 'assistant', content: respuesta.content }];
    respuesta = await llamarClaude(historial);
  }

  return respuesta;
}
