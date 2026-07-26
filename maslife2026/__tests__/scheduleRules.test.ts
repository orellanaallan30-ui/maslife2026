import { describe, it, expect } from 'vitest';
import {
  indiceDia,
  horarioDelDia,
  rangoValido,
  citasAfectadasPorHorario,
} from '../lib/scheduleRules';

// Reglas de la herramienta `update_schedule` del agente IA. Cambiar la jornada
// afecta la disponibilidad pública, por eso importa que el cálculo de citas
// afectadas (base de la 2ª confirmación) sea exacto.

describe('indiceDia', () => {
  it('reconoce el nombre completo', () => {
    expect(indiceDia('Lunes')).toBe(1);
    expect(indiceDia('domingo')).toBe(0);
    expect(indiceDia('Sábado')).toBe(6);
  });

  it('tolera tildes ausentes y abreviaturas', () => {
    expect(indiceDia('miercoles')).toBe(3);
    expect(indiceDia('mié')).toBe(3);
    expect(indiceDia('SAB')).toBe(6);
  });

  it('acepta índices numéricos', () => {
    expect(indiceDia(0)).toBe(0);
    expect(indiceDia('5')).toBe(5);
  });

  it('devuelve null si no lo reconoce', () => {
    expect(indiceDia('lunez')).toBeNull();
    expect(indiceDia(9)).toBeNull();
  });
});

describe('horarioDelDia', () => {
  it('usa el mismo valor por defecto que Ajustes (L-V activos, finde no)', () => {
    expect(horarioDelDia(undefined, 1)).toEqual({ active: true, start: '09:00', end: '18:00' });
    expect(horarioDelDia(undefined, 0).active).toBe(false); // domingo
    expect(horarioDelDia(undefined, 6).active).toBe(false); // sábado
  });

  it('respeta el horario configurado', () => {
    const sched = { 1: { active: true, start: '08:00', end: '14:00' } };
    expect(horarioDelDia(sched, 1).end).toBe('14:00');
  });
});

describe('rangoValido', () => {
  it('exige que el inicio sea anterior al término', () => {
    expect(rangoValido('09:00', '18:00')).toBe(true);
    expect(rangoValido('18:00', '09:00')).toBe(false);
    expect(rangoValido('09:00', '09:00')).toBe(false);
  });
});

describe('citasAfectadasPorHorario', () => {
  // 2026-08-10 es lunes (idx 1)
  const lunes = (over: Partial<any> = {}) => ({
    id: 'c1', date: '2026-08-10', time: '08:00', duration: 60,
    status: 'Confirmado', patientName: 'Ana', ...over,
  });
  const HOY = '2026-08-01';

  it('detecta la cita que empieza antes del nuevo inicio', () => {
    const r = citasAfectadasPorHorario([lunes()], 1, { active: true, start: '09:00', end: '18:00' }, HOY);
    expect(r).toHaveLength(1);
  });

  it('detecta la cita que termina después del nuevo cierre', () => {
    const tarde = [lunes({ time: '17:30', duration: 60 })];
    const r = citasAfectadasPorHorario(tarde, 1, { active: true, start: '09:00', end: '18:00' }, HOY);
    expect(r).toHaveLength(1);
  });

  it('no marca la cita que cabe dentro del nuevo horario', () => {
    const dentro = [lunes({ time: '10:00' })];
    expect(citasAfectadasPorHorario(dentro, 1, { active: true, start: '09:00', end: '18:00' }, HOY)).toHaveLength(0);
  });

  it('si el día pasa a NO laboral, toda cita de ese día queda fuera', () => {
    const dentro = [lunes({ time: '10:00' })];
    const r = citasAfectadasPorHorario(dentro, 1, { active: false, start: '09:00', end: '18:00' }, HOY);
    expect(r).toHaveLength(1);
  });

  it('ignora otros días de la semana', () => {
    // 2026-08-11 es martes
    const martes = [lunes({ date: '2026-08-11', time: '08:00' })];
    expect(citasAfectadasPorHorario(martes, 1, { active: false, start: '09:00', end: '18:00' }, HOY)).toHaveLength(0);
  });

  it('ignora citas pasadas (no alarma por lo ya ocurrido)', () => {
    const vieja = [lunes({ date: '2026-07-06' })]; // lunes anterior a HOY
    expect(citasAfectadasPorHorario(vieja, 1, { active: false, start: '09:00', end: '18:00' }, HOY)).toHaveLength(0);
  });

  it('ignora citas canceladas', () => {
    const cancelada = [lunes({ status: 'Cancelado' })];
    expect(citasAfectadasPorHorario(cancelada, 1, { active: false, start: '09:00', end: '18:00' }, HOY)).toHaveLength(0);
  });

  it('asume 60 min cuando la cita no trae duración', () => {
    const sinDur = [lunes({ time: '17:30', duration: undefined })];
    const r = citasAfectadasPorHorario(sinDur, 1, { active: true, start: '09:00', end: '18:00' }, HOY);
    expect(r).toHaveLength(1);
  });
});
