import { describe, it, expect } from 'vitest';
import { filaDeAgenda, horasDeGrilla } from '../lib/agendaConflict';

// La grilla del profesional tiene una fila por hora. Antes comparaba la hora
// exacta: una cita de 10:30 no aparecía y su espacio se ofrecía como libre.

const F = '2026-11-13';
const cita = (id: string, time: string, duration = 60, status = 'Confirmado') =>
  ({ id, date: F, time, duration, status, patientName: id });

describe('filaDeAgenda', () => {
  it('muestra en la fila de las 10 una cita que empieza a las 10:30', () => {
    const { inician } = filaDeAgenda([cita('a', '10:30')], F, '10:00');
    expect(inician.map(c => c.id)).toEqual(['a']);
  });

  it('la fila siguiente queda ocupada por la parte que continúa', () => {
    const { inician, continuan } = filaDeAgenda([cita('a', '10:30')], F, '11:00');
    expect(inician).toEqual([]);
    expect(continuan.map(c => c.id)).toEqual(['a']);
  });

  it('una sesión de 90 minutos ocupa también la segunda hora', () => {
    expect(filaDeAgenda([cita('a', '09:00', 90)], F, '10:00').continuan).toHaveLength(1);
    expect(filaDeAgenda([cita('a', '09:00', 90)], F, '11:00').continuan).toHaveLength(0);
  });

  it('una cita de 60 minutos en punto no invade la hora siguiente', () => {
    expect(filaDeAgenda([cita('a', '09:00')], F, '10:00').continuan).toHaveLength(0);
  });

  it('ordena por hora las citas de una misma fila', () => {
    const { inician } = filaDeAgenda([cita('b', '10:45', 15), cita('a', '10:00', 30)], F, '10:00');
    expect(inician.map(c => c.id)).toEqual(['a', 'b']);
  });

  it('no muestra canceladas ni finalizadas, ni citas de otro día', () => {
    const citas = [cita('c', '10:00', 60, 'Cancelado'), cita('f', '10:30', 60, 'Finalizado'),
      { ...cita('o', '10:00'), date: '2026-11-14' }];
    const r = filaDeAgenda(citas, F, '10:00');
    expect(r.inician).toEqual([]);
    expect(r.continuan).toEqual([]);
  });
});

describe('horasDeGrilla', () => {
  it('usa la jornada del profesional', () => {
    expect(horasDeGrilla({ start: '09:00', end: '12:00' }, [], [F])).toEqual(['09:00', '10:00', '11:00', '12:00']);
  });

  it('agrega las horas de citas fuera de la jornada para que no se escondan', () => {
    const h = horasDeGrilla({ start: '09:00', end: '11:00' }, [cita('a', '07:30'), cita('b', '11:30', 90)], [F]);
    expect(h[0]).toBe('07:00');
    expect(h[h.length - 1]).toBe('12:00');
  });
});
