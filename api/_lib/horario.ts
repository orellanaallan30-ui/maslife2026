// Horario semanal del profesional (`schedule`): una sola definición para el
// navegador (maslife2026/lib/scheduleRules.ts la reexporta) y para el servidor
// (api/_lib/centerRules.ts). Función pura, sin dependencias.

/** Horario de un día concreto de la semana. */
export interface DiaHorario {
  active: boolean;
  start: string;
  end: string;
}

/**
 * Horario vigente de un día (0=Domingo … 6=Sábado), aplicando el mismo valor por
 * defecto que usa la pantalla de Ajustes: lunes a viernes activos de 09:00 a
 * 18:00, fin de semana inactivo.
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
