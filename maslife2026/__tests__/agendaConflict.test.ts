import { describe, it, expect } from 'vitest';
import { buscarSolape, citasQueOcupan, validarJornada } from '../lib/agendaConflict';

// Reglas que aplica el agente IA al agendar/reagendar. Cubren los fallos
// concretos que tenía antes: comparaba solo la hora exacta y no excluía las
// citas canceladas.

const cita = (over: Partial<any> = {}) => ({
  id: 'a1', date: '2026-08-10', time: '09:00', duration: 60,
  status: 'Confirmado', patientName: 'Ana', ...over,
});

describe('buscarSolape (agente de agenda)', () => {
  it('detecta el solape parcial que antes se colaba (09:00/60min vs 09:30)', () => {
    const encontrado = buscarSolape([cita()], '2026-08-10', '09:30', 60);
    expect(encontrado?.patientName).toBe('Ana');
  });

  it('detecta la misma hora exacta', () => {
    expect(buscarSolape([cita()], '2026-08-10', '09:00', 60)).toBeDefined();
  });

  it('permite un horario contiguo (10:00 tras 09:00-10:00)', () => {
    expect(buscarSolape([cita()], '2026-08-10', '10:00', 60)).toBeUndefined();
  });

  it('NO bloquea si la cita está cancelada (el horario quedó libre)', () => {
    const cancelada = [cita({ status: 'Cancelado' })];
    expect(buscarSolape(cancelada, '2026-08-10', '09:00', 60)).toBeUndefined();
  });

  it('ignora la propia cita al reagendarla (no choca consigo misma)', () => {
    expect(buscarSolape([cita()], '2026-08-10', '09:00', 60, 'a1')).toBeUndefined();
  });

  it('no mira otros días', () => {
    expect(buscarSolape([cita()], '2026-08-11', '09:00', 60)).toBeUndefined();
  });

  it('respeta una duración larga existente (120 min desde las 09:00 tapa las 10:30)', () => {
    const larga = [cita({ duration: 120 })];
    expect(buscarSolape(larga, '2026-08-10', '10:30', 60)).toBeDefined();
  });

  it('asume 60 min cuando la cita no trae duración', () => {
    const sinDur = [cita({ duration: undefined })];
    expect(buscarSolape(sinDur, '2026-08-10', '09:30', 30)).toBeDefined();
  });
});

describe('citasQueOcupan', () => {
  it('excluye canceladas y filtra por fecha', () => {
    const lista = [
      cita({ id: 'ok' }),
      cita({ id: 'cancelada', status: 'Cancelado' }),
      cita({ id: 'otroDia', date: '2026-08-11' }),
    ];
    expect(citasQueOcupan(lista, '2026-08-10').map(c => c.id)).toEqual(['ok']);
  });
});

describe('validarJornada', () => {
  const jornada = { start: '09:00', end: '18:00' };

  it('acepta un horario dentro de la jornada', () => {
    expect(validarJornada('10:00', 60, jornada)).toBeNull();
  });

  it('rechaza antes de abrir', () => {
    expect(validarJornada('03:00', 60, jornada)).toContain('fuera de tu jornada');
  });

  it('rechaza si la cita termina después del cierre', () => {
    expect(validarJornada('17:30', 60, jornada)).toContain('fuera de tu jornada');
  });

  it('acepta una cita que termina justo al cierre', () => {
    expect(validarJornada('17:00', 60, jornada)).toBeNull();
  });

  it('no bloquea si el profesional no tiene jornada configurada', () => {
    expect(validarJornada('03:00', 60, undefined)).toBeNull();
  });
});
