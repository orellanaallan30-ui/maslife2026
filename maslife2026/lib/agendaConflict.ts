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

/**
 * Qué mostrar en una fila de la agenda por horas (vista día o semana).
 *
 * La grilla tiene una fila por hora, pero las citas pueden empezar a cualquier
 * minuto (10:30, 13:15) y durar más de una hora. Antes la fila comparaba la
 * hora exacta: una cita de 10:30 no aparecía en ninguna fila y su espacio se
 * ofrecía como "Disponible".
 *
 * - `inician`: citas que empiezan dentro de la fila [hora, hora + paso).
 * - `continuan`: citas que empezaron antes y siguen ocupando esta fila.
 *
 * Usa el mismo criterio de ocupación que `citasQueOcupan` (sin canceladas ni
 * finalizadas), así la agenda no ofrece una hora que la base rechaza.
 */
export function filaDeAgenda<T extends FranjaOcupada>(
  citas: T[],
  fecha: string,
  hora: string,
  paso = 60
): { inician: T[]; continuan: T[] } {
  const ini = toMinutes(hora);
  const fin = ini + paso;
  const delDia = citasQueOcupan(citas, fecha);
  const inician = delDia
    .filter(a => { const m = toMinutes(a.time); return m >= ini && m < fin; })
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  const continuan = delDia.filter(a => {
    const m = toMinutes(a.time);
    return m < ini && m + (a.duration || DUR_DEFECTO) > ini;
  });
  return { inician, continuan };
}

/**
 * Horas ("HH:00") que debe mostrar la grilla: la jornada del profesional, más
 * cualquier hora donde haya una cita fuera de ella, para que ninguna quede
 * escondida por estar antes del inicio o después del término.
 */
export function horasDeGrilla(
  jornada: { start: string; end: string },
  citas: FranjaOcupada[],
  fechas: string[]
): string[] {
  let desde = Math.floor(toMinutes(jornada.start) / 60);
  let hasta = Math.floor(toMinutes(jornada.end) / 60);
  for (const f of fechas) {
    for (const a of citasQueOcupan(citas, f)) {
      const m = toMinutes(a.time);
      desde = Math.min(desde, Math.floor(m / 60));
      hasta = Math.max(hasta, Math.floor((m + (a.duration || DUR_DEFECTO) - 1) / 60));
    }
  }
  desde = Math.max(0, desde);
  hasta = Math.min(23, hasta);
  return Array.from({ length: hasta - desde + 1 }, (_, i) => `${String(desde + i).padStart(2, '0')}:00`);
}
