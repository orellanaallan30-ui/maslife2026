// Reglas de los centros de AgendaMas (recepción, boxes, reporte de horas).
// Funciones puras, sin Supabase ni red: las usa api/_lib/center.ts y se prueban
// en maslife2026/__tests__/centerRules.test.ts.

import { toMinutes, rangesOverlap } from './overlap';
import { horarioDelDia, type DiaHorario } from './horario';

// ── Roles y permisos ─────────────────────────────────────────────────────
export type Rol = 'admin' | 'recepcion' | 'profesional';

export type Accion =
  | 'centro.editar'      // nombre, dirección, logo
  | 'equipo.ver'
  | 'equipo.editar'      // agregar/quitar personas
  | 'boxes.ver'
  | 'boxes.editar'       // crear boxes y asignar horarios
  | 'agenda.ver'         // agenda de todos los profesionales del centro
  | 'agenda.editar'      // agendar, reagendar, liberar, marcar llegada/pago
  | 'pacientes.buscar'   // SOLO datos de contacto
  | 'reporte.ver';

const PERMISOS: Record<Rol, Accion[]> = {
  admin: ['centro.editar', 'equipo.ver', 'equipo.editar', 'boxes.ver', 'boxes.editar',
          'agenda.ver', 'agenda.editar', 'pacientes.buscar', 'reporte.ver'],
  recepcion: ['equipo.ver', 'boxes.ver', 'boxes.editar', 'agenda.ver', 'agenda.editar',
              'pacientes.buscar', 'reporte.ver'],
  // El profesional usa su propia agenda (/pro/agenda); en el centro solo ve su box.
  profesional: ['boxes.ver'],
};

export function puede(rol: string | null | undefined, accion: Accion): boolean {
  return !!rol && (PERMISOS as Record<string, Accion[]>)[rol]?.includes(accion) === true;
}

// ── Columnas que recepción puede recibir ─────────────────────────────────
// La fila de `patients` trae la ficha clínica completa (anamnesis, SOAP,
// diagnósticos…). Recepción solo recibe contacto: la ficha es reservada
// (Ley 20.584) y solo la ve quien atiende.
export const PACIENTE_CONTACTO = 'id, name, rut, phone, email, prevision, professional_id';

// Sin `notes`: las notas de una cita pueden contener información clínica.
export const CITA_RECEPCION =
  'id, professional_id, patient_id, patient_name, patient_phone, patient_email, patient_rut, ' +
  'service_name, date, time, duration, type, status, price, payment_status, paid_at, payment_amount, ' +
  'booking_source, category, center_id, box_id, recurrence_id';

// ── Tipos mínimos ────────────────────────────────────────────────────────
export interface CitaOcupa {
  id: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM
  duration?: number;  // minutos
  status?: string;
}

export interface Asignacion {
  id?: string;
  boxId: string;
  professionalId: string;
  date: string;   // YYYY-MM-DD
  start: string;  // HH:MM
  end: string;    // HH:MM
}

const DUR_DEFECTO = 60;
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
export const esHora = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Día de la semana (0=Domingo) de una fecha YYYY-MM-DD, sin depender de la zona horaria. */
export function diaSemana(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Suma días a una fecha YYYY-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Lunes de la semana a la que pertenece la fecha. */
export function lunesDe(fecha: string): string {
  const dow = diaSemana(fecha);
  return sumarDias(fecha, dow === 0 ? -6 : 1 - dow);
}

/** Citas que ocupan el horario: igual que el índice `uq_slot_active` (ni canceladas ni finalizadas). */
export function ocupan<T extends CitaOcupa>(citas: T[], fecha: string): T[] {
  return citas.filter(c => c.date === fecha && c.status !== 'Cancelado' && c.status !== 'Finalizado');
}

/** Cita que choca con el rango pedido, o `undefined` si está libre. `ignorarId`: la que se reagenda. */
export function choque<T extends CitaOcupa>(citas: T[], fecha: string, hora: string, duracion: number, ignorarId?: string): T | undefined {
  const ini = toMinutes(hora);
  return ocupan(citas, fecha).find(c =>
    c.id !== ignorarId && rangesOverlap(ini, duracion, toMinutes(c.time), c.duration || DUR_DEFECTO));
}

/**
 * ¿El rango cae dentro del horario de atención del profesional ese día?
 * Devuelve un mensaje para mostrar, o `null` si es válido.
 */
export function fueraDeHorario(
  schedule: Record<number, DiaHorario> | null | undefined,
  fecha: string, hora: string, duracion: number
): string | null {
  const h = horarioDelDia(schedule, diaSemana(fecha));
  if (!h.active) return 'El profesional no atiende ese día.';
  const ini = toMinutes(hora);
  if (ini < toMinutes(h.start) || ini + duracion > toMinutes(h.end)) {
    return `Esa hora queda fuera del horario del profesional (${h.start} a ${h.end}).`;
  }
  return null;
}

/**
 * Horas libres de un profesional en una fecha.
 *
 * @param paso        cada cuántos minutos se ofrece una hora (por defecto 30).
 * @param ahora       fecha y minutos actuales en Chile: no se ofrecen horas pasadas.
 * @param soloEnBox   si es true, solo se ofrecen horas dentro de un box asignado.
 */
export function slotsLibres(p: {
  schedule: Record<number, DiaHorario> | null | undefined;
  citas: CitaOcupa[];
  fecha: string;
  duracion: number;
  paso?: number;
  ahora?: { fecha: string; minutos: number };
  asignaciones?: Asignacion[];
  professionalId?: string;
  soloEnBox?: boolean;
}): string[] {
  if (!esFecha(p.fecha) || !(p.duracion > 0)) return [];
  const h = horarioDelDia(p.schedule, diaSemana(p.fecha));
  if (!h.active) return [];
  if (p.ahora && p.fecha < p.ahora.fecha) return [];
  const paso = p.paso && p.paso > 0 ? p.paso : 30;
  const fin = toMinutes(h.end);
  const dia = ocupan(p.citas, p.fecha);
  const libres: string[] = [];
  for (let t = toMinutes(h.start); t + p.duracion <= fin; t += paso) {
    if (p.ahora && p.fecha === p.ahora.fecha && t <= p.ahora.minutos) continue;
    if (dia.some(c => rangesOverlap(t, p.duracion, toMinutes(c.time), c.duration || DUR_DEFECTO))) continue;
    if (p.soloEnBox && !boxParaCita(p.asignaciones || [], p.professionalId || '', p.fecha, hhmm(t), p.duracion)) continue;
    libres.push(hhmm(t));
  }
  return libres;
}

/**
 * Box que le corresponde a una cita: el asignado al profesional que cubre la
 * cita completa. `null` si el profesional no tiene box a esa hora.
 */
export function boxParaCita(asignaciones: Asignacion[], professionalId: string, fecha: string, hora: string, duracion: number): string | null {
  const ini = toMinutes(hora);
  const a = asignaciones.find(x =>
    x.professionalId === professionalId && x.date === fecha &&
    toMinutes(x.start) <= ini && ini + duracion <= toMinutes(x.end));
  return a ? a.boxId : null;
}

/**
 * Antes de guardar una asignación de box: ¿choca con otra?
 * (La base de datos también lo impide; esto es para dar un mensaje claro.)
 */
export function choqueAsignacion(existentes: Asignacion[], nueva: Asignacion, ignorarId?: string):
  { tipo: 'box' | 'profesional'; con: Asignacion } | null {
  const ini = toMinutes(nueva.start), dur = toMinutes(nueva.end) - ini;
  for (const a of existentes) {
    if (a.id && a.id === ignorarId) continue;
    if (a.date !== nueva.date) continue;
    const aIni = toMinutes(a.start), aDur = toMinutes(a.end) - aIni;
    if (!rangesOverlap(ini, dur, aIni, aDur)) continue;
    if (a.boxId === nueva.boxId) return { tipo: 'box', con: a };
    if (a.professionalId === nueva.professionalId) return { tipo: 'profesional', con: a };
  }
  return null;
}

/** Fechas de una repetición semanal: la fecha inicial y las `semanas - 1` siguientes. */
export function fechasSemanales(fecha: string, semanas: number): string[] {
  const n = Math.max(1, Math.min(52, Math.floor(semanas) || 1));
  return Array.from({ length: n }, (_, i) => sumarDias(fecha, i * 7));
}

export interface HorasProfesional {
  professionalId: string;
  totalMin: number;
  porDia: Record<string, number>;      // YYYY-MM-DD → minutos
  porSemana: Record<string, number>;   // lunes de la semana → minutos
  porMes: Record<string, number>;      // YYYY-MM → minutos
}

/** Horas de box asignadas por profesional entre dos fechas (ambas inclusive). */
export function horasDeBox(asignaciones: Asignacion[], desde: string, hasta: string): HorasProfesional[] {
  const mapa = new Map<string, HorasProfesional>();
  for (const a of asignaciones) {
    if (a.date < desde || a.date > hasta) continue;
    const min = toMinutes(a.end) - toMinutes(a.start);
    if (!(min > 0)) continue;
    let r = mapa.get(a.professionalId);
    if (!r) { r = { professionalId: a.professionalId, totalMin: 0, porDia: {}, porSemana: {}, porMes: {} }; mapa.set(a.professionalId, r); }
    r.totalMin += min;
    r.porDia[a.date] = (r.porDia[a.date] || 0) + min;
    const sem = lunesDe(a.date);
    r.porSemana[sem] = (r.porSemana[sem] || 0) + min;
    const mes = a.date.slice(0, 7);
    r.porMes[mes] = (r.porMes[mes] || 0) + min;
  }
  return [...mapa.values()].sort((x, y) => y.totalMin - x.totalMin);
}

/** Precio y duración de un servicio, leídos del profesional (el cliente nunca envía el precio). */
export function servicioDelPro(services: unknown, nombre: string): { price: number; duration: number } | null {
  if (!Array.isArray(services)) return null;
  const s = services.find((x: any) => x && typeof x.name === 'string' && x.name.trim().toLowerCase() === String(nombre || '').trim().toLowerCase());
  if (!s) return null;
  return { price: Math.max(0, Math.round(Number((s as any).price) || 0)), duration: Math.max(5, Math.round(Number((s as any).duration) || DUR_DEFECTO)) };
}
