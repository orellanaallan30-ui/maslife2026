import type { Appointment } from '../types';

/**
 * ¿Esta fila es un cupo retenido esperando el pago, y no una cita de verdad?
 *
 * Cuando un paciente reserva desde la web y va a pagar, se crea la cita como
 * Pendiente para que nadie le quite el horario mientras está en MercadoPago. Si
 * no paga, se libera sola.
 *
 * Esa retención es necesaria —sin ella, dos pacientes pueden pagar la misma hora
 * y habría que devolverle la plata a uno— pero **no debe verse como una cita**:
 * ensucia "Próximas Citas" y los contadores del día con reservas que quizá nunca
 * se concreten.
 *
 * Ojo: esto es solo para presentación. El cupo sigue ocupado a efectos de
 * disponibilidad (ver `citasQueOcupan` en agendaConflict.ts); si esto se usara
 * también para calcular disponibilidad, se abriría la puerta al doble cobro.
 */
export function esCupoEnEspera(a: Pick<Appointment, 'status' | 'paymentStatus' | 'bookingSource'>): boolean {
  return a.status === 'Pendiente'
    && a.paymentStatus === 'Pendiente'
    && a.bookingSource === 'web';
}
