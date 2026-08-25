// Reglas de disponibilidad de agenda, en funciones puras y testeables.
//
// Existen para que el agente IA aplique EXACTAMENTE el mismo criterio que la
// reserva online (api/_lib/booking.ts) y que el índice único de la BD
// (uq_slot_active). Antes el agente comparaba solo la hora exacta, así que
// dejaba pasar citas solapadas (09:00 de 60 min vs 09:30) y, al revés,
// bloqueaba horarios liberados por una cancelación.

import { toMinutes, rangesOverlap } from '../../api/_lib/overlap';

/** Forma mínima que necesitan estas reglas (evita acoplarse a Appointment). */
export interface FranjaOcupada {
  id: string;
  date: string;
  time: string;
  duration?: number;
  status?: string;
  patientName?: string;
}

export interface Jornada {
  start?: string;
  end?: string;
}

/** Duración por defecto cuando una cita no la trae. */
const DUR_DEFECTO = 60;

/**
 * Citas que realmente ocupan el día. Se excluyen las canceladas y las ya
 * finalizadas, igual que el índice `uq_slot_active`
 * (WHERE status NOT IN ('Cancelado','Finalizado'), migración 0016).
 *
 * Una sesión terminada no ocupa: atendido el paciente, el profesional puede
 * reutilizar esa casilla. Esta lista y el índice deben decir lo mismo, o la
 * agenda ofrecería una hora que la base de datos rechaza.
 */
export function citasQueOcupan<T extends FranjaOcupada>(citas: T[], fecha: string): T[] {
  return citas.filter(a => a.date === fecha && a.status !== 'Cancelado' && a.status !== 'Finalizado');
}

/**
 * Devuelve la cita que se solapa con el rango pedido, o `undefined` si el
 * horario está libre.
 *
 * @param ignorarId  id de la cita que se está reagendando: no debe chocar
 *                   consigo misma.
 */
export function buscarSolape<T extends FranjaOcupada>(
  citas: T[],
  fecha: string,
  hora: string,
  duracion: number,
  ignorarId?: string
): T | undefined {
  const inicio = toMinutes(hora);
  return citasQueOcupan(citas, fecha).find(a =>
    a.id !== ignorarId &&
    rangesOverlap(inicio, duracion, toMinutes(a.time), a.duration || DUR_DEFECTO)
  );
}

/**
 * Comprueba que el rango caiga dentro de la jornada del profesional.
 * Devuelve un mensaje de error, o `null` si es válido.
 * Si no hay jornada configurada no se bloquea nada (comportamiento permisivo).
 */
export function validarJornada(hora: string, duracion: number, jornada?: Jornada): string | null {
  const ini = jornada?.start;
  const fin = jornada?.end;
  if (!ini || !fin) return null;

  const inicio = toMinutes(hora);
  if (inicio < toMinutes(ini) || inicio + duracion > toMinutes(fin)) {
    return `ERROR: ${hora} queda fuera de tu jornada (${ini}–${fin}). Elige un horario dentro de ese rango o cambia tu jornada en Ajustes.`;
  }
  return null;
}
