// Informe postural/biomecánico: parseo de la respuesta de la IA y texto limpio.
//
// La IA entrega SOLO JSON (ver runAdvancedAnalysis en ClinicalRecord). Aquí se
// valida, se recorta a lo que la pantalla y el PDF pueden mostrar y se genera un
// texto sin markdown para guardar/compartir. Los informes antiguos (texto con
// "**", "#", "--" y un bloque ```json) se limpian para mostrarse ordenados.

import type { BiomechReportData, BiomechMetric, BiomechSimetria } from '../components/BiomechReport';

type Sev = 'normal' | 'atencion' | 'riesgo';
const SEVS: Sev[] = ['normal', 'atencion', 'riesgo'];

export const ETIQUETA_SEVERIDAD: Record<Sev, string> = { normal: 'Normal', atencion: 'Atención', riesgo: 'Revisar' };

const txt = (v: unknown, max = 400): string =>
  typeof v === 'string' ? limpiarLinea(v).slice(0, max) : '';

const lista = (v: unknown, maxItems: number, maxLen = 200): string[] =>
  Array.isArray(v) ? v.map(x => txt(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];

const sev = (v: unknown): Sev => (SEVS.includes(v as Sev) ? (v as Sev) : 'atencion');

/** Quita marcas de markdown de una línea suelta. */
export function limpiarLinea(s: string): string {
  return s
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s{0,3}#{1,6}\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrae el objeto JSON de la respuesta: puede venir puro, con cerco ```json o
 * con texto alrededor. Devuelve null si no hay un objeto válido.
 */
export function extraerJSON(respuesta: string): Record<string, unknown> | null {
  if (!respuesta) return null;
  const candidatos: string[] = [];
  const cerco = respuesta.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cerco) candidatos.push(cerco[1]);
  const ini = respuesta.indexOf('{'), fin = respuesta.lastIndexOf('}');
  if (ini >= 0 && fin > ini) candidatos.push(respuesta.slice(ini, fin + 1));
  for (const c of candidatos) {
    try {
      const o = JSON.parse(c);
      if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, unknown>;
    } catch { /* probar el siguiente */ }
  }
  return null;
}

/** Valida y recorta el informe. null si no trae ni resumen ni hallazgos. */
export function normalizarInforme(o: Record<string, unknown> | null, tipo?: string): BiomechReportData | null {
  if (!o) return null;
  // Se acepta "hallazgos" (esquema nuevo) o "metricas" (esquema anterior).
  const crudos = Array.isArray(o.hallazgos) ? o.hallazgos : Array.isArray(o.metricas) ? o.metricas : [];
  const metricas: BiomechMetric[] = crudos
    .filter((m: any) => m && (typeof m.titulo === 'string' || typeof m.nombre === 'string'))
    .slice(0, 8)
    .map((m: any) => ({
      nombre: txt(m.titulo ?? m.nombre, 80),
      hallazgo: txt(m.detalle ?? m.hallazgo, 220),
      zona: txt(m.zona, 40) || undefined,
      severidad: sev(m.severidad),
      comentario: txt(m.confirmar ?? m.comentario, 220) || undefined,
    }));
  const simetrias: BiomechSimetria[] = (Array.isArray(o.simetrias) ? o.simetrias : [])
    .filter((s: any) => s && typeof s.zona === 'string')
    .slice(0, 5)
    .map((s: any) => ({
      zona: txt(s.zona, 40), izquierda: txt(s.izquierda, 120), derecha: txt(s.derecha, 120),
      diferencia: txt(s.diferencia, 160), severidad: sev(s.severidad),
    }));
  const resumen = txt(o.resumen ?? o.impresion_global, 700);
  if (!resumen && metricas.length === 0) return null;
  return {
    metricas,
    simetrias,
    resumen,
    impresion_global: resumen,
    recomendaciones: lista(o.recomendaciones, 5),
    derivacion: txt(o.derivacion, 240) || undefined,
    limitaciones: txt(o.limitaciones, 240) || undefined,
    relacion_clinica: txt(o.relacion_clinica, 600) || undefined,
    precauciones: lista(o.precauciones, 3, 160),
    diagnostico: txt(o.diagnostico, 240) || undefined,
    cie10: txt(o.cie10, 20) || undefined,
    objetivos: lista(o.objetivos, 5),
    plan: lista(o.plan, 6),
    generado: new Date().toISOString(),
    tipo,
  };
}

/** Texto plano ordenado (sin markdown) para guardar en la ficha y compartir. */
export function informeATexto(r: BiomechReportData): string {
  const b: string[] = [];
  const titulo = r.tipo === 'Marcha' ? 'INFORME DE MARCHA' : r.tipo === 'Musculoesquelético' ? 'INFORME MUSCULOESQUELÉTICO' : 'INFORME POSTURAL';
  b.push(titulo);
  if (r.resumen) b.push('', 'RESUMEN', r.resumen);
  if (r.metricas.length) {
    b.push('', 'HALLAZGOS');
    for (const m of r.metricas) {
      b.push(`- ${m.zona ? m.zona + ': ' : ''}${m.nombre} (${ETIQUETA_SEVERIDAD[m.severidad]})${m.hallazgo ? '. ' + m.hallazgo : ''}`);
    }
  }
  if (r.relacion_clinica) b.push('', 'RELACIÓN CON LA FICHA', r.relacion_clinica);
  if (r.precauciones?.length) {
    b.push('', 'PRECAUCIONES');
    for (const x of r.precauciones) b.push(`- ${x}`);
  }
  if (r.recomendaciones?.length) {
    b.push('', 'RECOMENDACIONES');
    for (const x of r.recomendaciones) b.push(`- ${x}`);
  }
  if (r.diagnostico) b.push('', 'HIPÓTESIS A CONFIRMAR', `${r.diagnostico}${r.cie10 ? ` (CIE-10 orientativo: ${r.cie10})` : ''}`);
  if (r.derivacion) b.push('', 'DERIVACIÓN', r.derivacion);
  if (r.limitaciones) b.push('', 'LIMITACIONES DEL ANÁLISIS', r.limitaciones);
  return b.join('\n');
}

export type BloqueTexto = { tipo: 'titulo' | 'parrafo'; texto: string } | { tipo: 'lista'; items: string[] };

/**
 * Informes antiguos: texto con markdown. Se quita el bloque json, las marcas y
 * los separadores, y se agrupa en títulos, párrafos y listas.
 */
export function limpiarInformeAntiguo(texto: string): BloqueTexto[] {
  const sinJson = (texto || '').replace(/```json[\s\S]*?(```|$)/gi, '').replace(/```/g, '');
  const bloques: BloqueTexto[] = [];
  let listaActual: string[] | null = null;
  const cerrarLista = () => { if (listaActual?.length) bloques.push({ tipo: 'lista', items: listaActual }); listaActual = null; };
  for (const cruda of sinJson.split('\n')) {
    const linea = cruda.trim();
    if (!linea || /^[-–—_*=]{2,}$/.test(linea)) { cerrarLista(); continue; }
    const esTitulo = /^#{1,6}\s/.test(linea) || /^\d+\.\s+[A-ZÁÉÍÓÚÑ ]{4,}$/.test(linea.replace(/\*\*/g, '')) || /^[A-ZÁÉÍÓÚÑ0-9 ,.—–-]{6,}$/.test(linea.replace(/\*\*/g, ''));
    const vineta = linea.match(/^([-•*]|\d+[.)])\s+(.*)$/);
    if (esTitulo && !vineta) { cerrarLista(); bloques.push({ tipo: 'titulo', texto: limpiarLinea(linea).replace(/:$/, '') }); continue; }
    if (vineta) { (listaActual ||= []).push(limpiarLinea(vineta[2])); continue; }
    cerrarLista();
    bloques.push({ tipo: 'parrafo', texto: limpiarLinea(linea) });
  }
  cerrarLista();
  return bloques.filter(b => b.tipo === 'lista' || b.texto);
}
