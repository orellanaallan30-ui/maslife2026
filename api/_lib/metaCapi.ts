// Meta Conversions API: informa a Meta la venta (Purchase) de un paciente que llegó
// por un anuncio, para que el Administrador de anuncios vea compras y valor.
//
// Privacidad (Ley 19.628 / 21.719 y políticas de Meta para salud):
//  - Solo se envía con consentimiento explícito del paciente (lo verifica el endpoint).
//  - Los datos personales van cifrados con SHA-256, como exige Meta.
//  - NUNCA se envía diagnóstico, servicio, descripción ni ningún dato clínico:
//    solo el monto en CLP y la fecha.
// Funciones puras (salvo sendMetaEvent), probadas en maslife2026/__tests__/metaCapi.test.ts.
import { createHash } from 'crypto';
import { normalizarTelefonoCL } from './correoCita';

export const META_GRAPH_VERSION = 'v21.0';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Normaliza y cifra un campo según las reglas de Meta (minúsculas, sin espacios). */
function hashed(value: string | null | undefined): string | undefined {
  const v = (value ?? '').trim().toLowerCase();
  return v ? sha256(v) : undefined;
}

/** Quita tildes y signos para nombres (Meta pide minúsculas sin puntuación, UTF-8). */
function normName(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-zñ]/g, '');
}

export interface SaleInput {
  transactionId: string;
  patientId: string;
  amount: number;          // CLP, entero
  date: string;            // YYYY-MM-DD de la transacción
  phone?: string | null;
  email?: string | null;
  fullName?: string | null;
  nowSec?: number;         // inyectable para tests
}

export interface MetaEvent {
  event_name: 'Purchase';
  event_time: number;
  event_id: string;
  action_source: 'physical_store';
  user_data: Record<string, string[]>;
  custom_data: { currency: 'CLP'; value: number };
}

/** event_id estable: si se reintenta, Meta descarta el duplicado. */
export function eventIdFor(transactionId: string): string {
  return `tx_${transactionId}`;
}

/**
 * Hora del evento: el mediodía de Chile del día de la transacción, sin pasar de
 * "ahora" ni quedar fuera de los 7 días que Meta acepta para eventos de tienda física
 * enviados por esta vía.
 */
export function eventTimeFor(date: string, nowSec: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  let t = m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], 15, 0, 0) / 1000) : nowSec;
  if (t > nowSec) t = nowSec;
  const min = nowSec - 7 * 86400 + 60;
  if (t < min) t = min;
  return t;
}

export function buildPurchaseEvent(input: SaleInput): MetaEvent {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  const user_data: Record<string, string[]> = {};
  const tel = normalizarTelefonoCL(input.phone);
  if (tel) user_data.ph = [sha256(tel)];
  const em = hashed(input.email);
  if (em) user_data.em = [em];
  const parts = (input.fullName || '').trim().split(/\s+/).filter(Boolean).map(normName).filter(Boolean);
  if (parts.length) user_data.fn = [sha256(parts[0])];
  if (parts.length > 1) user_data.ln = [sha256(parts[parts.length - 1])];
  user_data.country = [sha256('cl')];
  user_data.external_id = [sha256(input.patientId)];
  return {
    event_name: 'Purchase',
    event_time: eventTimeFor(input.date, now),
    event_id: eventIdFor(input.transactionId),
    action_source: 'physical_store',
    user_data,
    custom_data: { currency: 'CLP', value: Math.max(0, Math.round(input.amount)) },
  };
}

/** Hay datos suficientes para que Meta pueda reconocer a la persona. */
export function hasMatchKeys(ev: MetaEvent): boolean {
  return !!(ev.user_data.ph || ev.user_data.em);
}

export async function sendMetaEvent(
  ev: MetaEvent,
  cfg: { datasetId: string; token: string; testCode?: string },
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const payload: Record<string, unknown> = { data: [ev] };
  if (cfg.testCode) payload.test_event_code = cfg.testCode;
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(cfg.datasetId)}/events?access_token=${encodeURIComponent(cfg.token)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}
