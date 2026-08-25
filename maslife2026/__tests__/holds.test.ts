import { describe, it, expect } from 'vitest';
import { esCupoEnEspera } from '../lib/holds';

// Distingue un cupo retenido durante el pago de una cita de verdad.
// Importa acertar en los dos sentidos: si marca de menos, la agenda se llena de
// reservas fantasma; si marca de más, esconde citas reales del profesional.

const cita = (over: Partial<Parameters<typeof esCupoEnEspera>[0]> = {}) =>
  ({ status: 'Pendiente', paymentStatus: 'Pendiente', bookingSource: 'web', ...over }) as any;

describe('esCupoEnEspera', () => {
  it('reconoce una reserva web sin pagar', () => {
    expect(esCupoEnEspera(cita())).toBe(true);
  });

  it('una reserva web ya pagada es una cita real', () => {
    expect(esCupoEnEspera(cita({ paymentStatus: 'Pagado' }))).toBe(false);
  });

  it('una reserva web confirmada es una cita real', () => {
    expect(esCupoEnEspera(cita({ status: 'Confirmado' }))).toBe(false);
  });

  it('una cita presencial pendiente de pago NO es un cupo en espera', () => {
    // La agenda el profesional a mano y cobra en consulta: debe verse siempre.
    expect(esCupoEnEspera(cita({ bookingSource: 'presencial' }))).toBe(false);
  });

  it('un bloqueo administrativo no es un cupo en espera', () => {
    expect(esCupoEnEspera(cita({ status: 'Bloqueado', bookingSource: 'presencial' }))).toBe(false);
  });

  it('no explota si faltan campos', () => {
    expect(esCupoEnEspera({} as any)).toBe(false);
  });
});
