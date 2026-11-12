import { describe, it, expect } from 'vitest';
import {
  puede, slotsLibres, boxParaCita, choqueAsignacion, horasDeBox, fechasSemanales,
  lunesDe, diaSemana, choque, fueraDeHorario, servicioDelPro, PACIENTE_CONTACTO, CITA_RECEPCION,
  type Asignacion,
} from '../../api/_lib/centerRules';

const LUN = '2026-11-16';   // lunes
const DOM = '2026-11-15';   // domingo

describe('centros: permisos por rol', () => {
  it('admin puede todo; recepción no edita el centro ni el equipo', () => {
    expect(puede('admin', 'equipo.editar')).toBe(true);
    expect(puede('admin', 'centro.editar')).toBe(true);
    expect(puede('recepcion', 'agenda.editar')).toBe(true);
    expect(puede('recepcion', 'boxes.editar')).toBe(true);
    expect(puede('recepcion', 'reporte.ver')).toBe(true);
    expect(puede('recepcion', 'equipo.editar')).toBe(false);
    expect(puede('recepcion', 'centro.editar')).toBe(false);
  });
  it('el profesional no ve la agenda de otros; rol desconocido o vacío no puede nada', () => {
    expect(puede('profesional', 'agenda.ver')).toBe(false);
    expect(puede('profesional', 'pacientes.buscar')).toBe(false);
    expect(puede('otro', 'agenda.ver')).toBe(false);
    expect(puede(null, 'agenda.ver')).toBe(false);
  });
  it('recepción nunca recibe columnas clínicas', () => {
    for (const col of ['medical_history', 'soap', 'diagnoses', 'vitals', 'session_logs', 'specialty_data', 'attachments', 'allergies', 'goals', 'custom_fields']) {
      expect(PACIENTE_CONTACTO).not.toContain(col);
    }
    expect(CITA_RECEPCION.split(',').map(s => s.trim())).not.toContain('notes');
  });
});

describe('centros: fechas', () => {
  it('día de la semana y lunes de la semana', () => {
    expect(diaSemana(LUN)).toBe(1);
    expect(diaSemana(DOM)).toBe(0);
    expect(lunesDe('2026-11-18')).toBe(LUN);
    expect(lunesDe(DOM)).toBe('2026-11-09');   // el domingo pertenece a la semana anterior
    expect(lunesDe(LUN)).toBe(LUN);
  });
  it('repetición semanal', () => {
    expect(fechasSemanales(LUN, 3)).toEqual(['2026-11-16', '2026-11-23', '2026-11-30']);
    expect(fechasSemanales(LUN, 0)).toEqual([LUN]);
    expect(fechasSemanales(LUN, 999)).toHaveLength(52);
  });
});

describe('centros: horas libres', () => {
  const schedule = { 1: { active: true, start: '09:00', end: '12:00' } };

  it('ofrece cada 30 min dentro del horario y respeta la duración', () => {
    expect(slotsLibres({ schedule, citas: [], fecha: LUN, duracion: 60 }))
      .toEqual(['09:00', '09:30', '10:00', '10:30', '11:00']);
    expect(slotsLibres({ schedule, citas: [], fecha: LUN, duracion: 90, paso: 60 })).toEqual(['09:00', '10:00']);
  });
  it('descuenta citas que solapan, aunque no empiecen a la hora en punto', () => {
    const citas = [{ id: 'a', date: LUN, time: '09:30', duration: 60, status: 'Confirmado' }];
    expect(slotsLibres({ schedule, citas, fecha: LUN, duracion: 60 })).toEqual(['10:30', '11:00']);
  });
  it('canceladas y finalizadas liberan la hora; los bloqueos la ocupan', () => {
    const base = { id: 'a', date: LUN, time: '09:00', duration: 180 };
    expect(slotsLibres({ schedule, citas: [{ ...base, status: 'Cancelado' }], fecha: LUN, duracion: 60 })).toHaveLength(5);
    expect(slotsLibres({ schedule, citas: [{ ...base, status: 'Finalizado' }], fecha: LUN, duracion: 60 })).toHaveLength(5);
    expect(slotsLibres({ schedule, citas: [{ ...base, status: 'Bloqueado' }], fecha: LUN, duracion: 60 })).toEqual([]);
  });
  it('día no laboral (por defecto, domingo) y horas pasadas', () => {
    expect(slotsLibres({ schedule: null, citas: [], fecha: DOM, duracion: 60 })).toEqual([]);
    expect(slotsLibres({ schedule, citas: [], fecha: LUN, duracion: 60, ahora: { fecha: LUN, minutos: 10 * 60 } }))
      .toEqual(['10:30', '11:00']);
    expect(slotsLibres({ schedule, citas: [], fecha: LUN, duracion: 60, ahora: { fecha: '2026-11-17', minutos: 0 } })).toEqual([]);
  });
  it('solo dentro del box asignado, si se pide', () => {
    const asignaciones: Asignacion[] = [{ boxId: 'b1', professionalId: 'p1', date: LUN, start: '10:00', end: '12:00' }];
    expect(slotsLibres({ schedule, citas: [], fecha: LUN, duracion: 60, asignaciones, professionalId: 'p1', soloEnBox: true }))
      .toEqual(['10:00', '10:30', '11:00']);
  });
});

describe('centros: validaciones al agendar', () => {
  const schedule = { 1: { active: true, start: '09:00', end: '12:00' } };
  it('choque de horario, ignorando la cita que se reagenda', () => {
    const citas = [{ id: 'a', date: LUN, time: '10:00', duration: 60, status: 'Confirmado' }];
    expect(choque(citas, LUN, '10:30', 60)?.id).toBe('a');
    expect(choque(citas, LUN, '11:00', 60)).toBeUndefined();
    expect(choque(citas, LUN, '10:30', 60, 'a')).toBeUndefined();
  });
  it('fuera del horario del profesional', () => {
    expect(fueraDeHorario(schedule, LUN, '09:00', 60)).toBeNull();
    expect(fueraDeHorario(schedule, LUN, '11:30', 60)).toMatch(/fuera del horario/);
    expect(fueraDeHorario(schedule, DOM, '10:00', 60)).toMatch(/no atiende/);
  });
  it('precio y duración salen del servicio del profesional', () => {
    const services = [{ id: '1', name: 'Evaluación', price: 25000, duration: 45 }];
    expect(servicioDelPro(services, ' evaluación ')).toEqual({ price: 25000, duration: 45 });
    expect(servicioDelPro(services, 'Otro')).toBeNull();
    expect(servicioDelPro(null, 'Evaluación')).toBeNull();
  });
});

describe('centros: boxes', () => {
  const asig: Asignacion[] = [
    { id: '1', boxId: 'b1', professionalId: 'p1', date: LUN, start: '09:00', end: '13:00' },
    { id: '2', boxId: 'b2', professionalId: 'p2', date: LUN, start: '09:00', end: '11:00' },
  ];
  it('box de una cita: el que cubre la cita completa', () => {
    expect(boxParaCita(asig, 'p1', LUN, '12:00', 60)).toBe('b1');
    expect(boxParaCita(asig, 'p1', LUN, '12:30', 60)).toBeNull();
    expect(boxParaCita(asig, 'p2', LUN, '11:00', 30)).toBeNull();
    expect(boxParaCita(asig, 'p3', LUN, '09:00', 30)).toBeNull();
  });
  it('un box no admite dos profesionales a la vez, ni un profesional dos boxes', () => {
    expect(choqueAsignacion(asig, { boxId: 'b1', professionalId: 'p3', date: LUN, start: '12:00', end: '14:00' })?.tipo).toBe('box');
    expect(choqueAsignacion(asig, { boxId: 'b3', professionalId: 'p2', date: LUN, start: '10:00', end: '12:00' })?.tipo).toBe('profesional');
    expect(choqueAsignacion(asig, { boxId: 'b1', professionalId: 'p3', date: LUN, start: '13:00', end: '15:00' })).toBeNull();
    expect(choqueAsignacion(asig, { boxId: 'b1', professionalId: 'p1', date: LUN, start: '09:00', end: '14:00' }, '1')).toBeNull();
  });
});

describe('centros: reporte de horas de box', () => {
  const asig: Asignacion[] = [
    { boxId: 'b1', professionalId: 'p1', date: '2026-11-16', start: '09:00', end: '13:00' },   // lun, 4 h
    { boxId: 'b1', professionalId: 'p1', date: '2026-11-18', start: '15:00', end: '19:00' },   // mié, 4 h
    { boxId: 'b1', professionalId: 'p1', date: '2026-11-23', start: '09:00', end: '11:30' },   // lun sig., 2,5 h
    { boxId: 'b2', professionalId: 'p2', date: '2026-11-16', start: '09:00', end: '10:00' },   // 1 h
    { boxId: 'b2', professionalId: 'p2', date: '2026-12-01', start: '09:00', end: '18:00' },   // fuera del rango
  ];
  it('suma por día, semana y mes dentro del rango', () => {
    const r = horasDeBox(asig, '2026-11-01', '2026-11-30');
    expect(r.map(x => x.professionalId)).toEqual(['p1', 'p2']);
    expect(r[0].totalMin).toBe(630);
    expect(r[0].porDia['2026-11-16']).toBe(240);
    expect(r[0].porSemana['2026-11-16']).toBe(480);
    expect(r[0].porSemana['2026-11-23']).toBe(150);
    expect(r[0].porMes['2026-11']).toBe(630);
    expect(r[1].totalMin).toBe(60);
  });
});
