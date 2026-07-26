// Reglas para modificar la jornada semanal del profesional (`schedule`).
//
// `schedule` es lo que realmente define la disponibilidad pública: lo leen la
// página de reserva del paciente (PatientProfile) y la agenda del profesional.
// Cambiarlo afecta a pacientes que aún no han reservado, por eso el agente IA
// exige doble confirmación antes de tocarlo.
//
// Funciones puras, sin React ni Supabase, para poder testearlas.

import { toMinutes } from '../../api/_lib/overlap';

export const DIAS_SEMANA = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
];

/** Horario de un día concreto de la semana. */
export interface DiaHorario {
  active: boolean;
  start: string;
  end: string;
}

/** Cita mínima necesaria para evaluar el impacto de un cambio de jornada. */
export interface CitaAgendada {
  id: string;
  date: string;          // YYYY-MM-DD
  time: string;          // HH:MM
  duration?: number;
  status?: string;
  patientName?: string;
}

/**
 * Resuelve el índice de día (0=Domingo … 6=Sábado) desde un nombre en español
 * o un número. Tolera mayúsculas, tildes y abreviaturas ("mie", "miércoles").
 * Devuelve `null` si no se reconoce.
 */
export function indiceDia(entrada: string | number): number | null {
  if (typeof entrada === 'number') {
    return entrada >= 0 && entrada <= 6 ? entrada : null;
  }
  const txt = String(entrada).trim().toLowerCase();

  const num = Number(txt);
  if (!Number.isNaN(num)) return num >= 0 && num <= 6 ? num : null;

  // Quita tildes: "miércoles" -> "miercoles"
  const normaliza = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const objetivo = normaliza(txt);
  const idx = DIAS_SEMANA.findIndex(d => {
    const dia = normaliza(d);
    // Coincidencia exacta, o abreviatura de 3+ letras ("mie" -> miércoles)
    return dia === objetivo || (objetivo.length >= 3 && dia.startsWith(objetivo));
  });
  return idx === -1 ? null : idx;
}

/**
 * Horario vigente de un día, aplicando el mismo valor por defecto que usa la
 * pantalla de Ajustes: lunes a viernes activos de 09:00 a 18:00, fin de semana
 * inactivo.
 */
export function horarioDelDia(
  schedule: Record<number, DiaHorario> | undefined | null,
  idx: number
): DiaHorario {
  return schedule?.[idx] || {
    active: idx !== 0 && idx !== 6,
    start: '09:00',
    end: '18:00',
  };
}

/** `true` si el rango horario es coherente (inicio antes que fin). */
export function rangoValido(start: string, end: string): boolean {
  return toMinutes(start) < toMinutes(end);
}

/**
 * Citas ya agendadas que quedarían FUERA del nuevo horario de ese día de la
 * semana — el dato clave para la segunda confirmación.
 *
 * Solo mira citas a partir de `desdeISO` (por defecto, hoy): cambiar la jornada
 * no debe alarmar por citas del pasado. Ignora las canceladas.
 */
export function citasAfectadasPorHorario(
  citas: CitaAgendada[],
  diaIdx: number,
  nuevo: DiaHorario,
  desdeISO: string
): CitaAgendada[] {
  return citas.filter(c => {
    if (c.status === 'Cancelado') return false;
    if (c.date < desdeISO) return false;

    // 'T00:00:00' sin zona → se interpreta en hora local, así getDay() no se
    // corre un día por UTC.
    const dia = new Date(`${c.date}T00:00:00`).getDay();
    if (dia !== diaIdx) return false;

    // Si el día pasa a no laboral, toda cita de ese día queda fuera.
    if (!nuevo.active) return true;

    const ini = toMinutes(c.time);
    const fin = ini + (c.duration || 60);
    return ini < toMinutes(nuevo.start) || fin > toMinutes(nuevo.end);
  });
}
