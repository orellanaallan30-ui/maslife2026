// Lógica pura de solapamiento de horarios (sin dependencias) — separada de
// booking.ts para poder testearla desde el frontend sin arrastrar el cliente
// Supabase del servidor.

/** Convierte "HH:MM" a minutos desde medianoche (NaN-safe → 0). */
export function toMinutes(time: string): number {
  const [h, m] = String(time).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * true si el rango [startA, startA+durA) se solapa con [startB, startB+durB).
 * Fin exclusivo: 10:00-11:00 y 11:00-12:00 NO chocan.
 */
export function rangesOverlap(startA: number, durA: number, startB: number, durB: number): boolean {
  return startA < startB + durB && startB < startA + durA;
}
