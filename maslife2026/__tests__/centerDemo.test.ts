import { describe, it, expect, beforeEach, vi } from 'vitest';

// La demo no usa Supabase; se simula el cliente porque exige variables de entorno al cargarse.
vi.mock('../supabaseClient', () => ({ supabase: {} }));

import { demoCall, resetDemo } from '../centerDemo';
import { slotsLibres, sumarDias, diaSemana } from '../../api/_lib/centerRules';
import type { CenterRange, CenterAppointment, ReportRow } from '../centerService';

const hoy = new Date().toLocaleDateString('en-CA');
/** Próximo día hábil (lunes a viernes) después de hoy: siempre es futuro y todos atienden. */
const diaHabil = (() => { let f = sumarDias(hoy, 1); while (diaSemana(f) === 0 || diaSemana(f) === 6) f = sumarDias(f, 1); return f; })();
const rango = (from: string, to = from) => demoCall<CenterRange>('center-range', { from, to });

async function horaLibre(proId: string, fecha: string, duracion: number): Promise<string> {
  const r = await rango(fecha);
  const pro = r.professionals.find(p => p.id === proId)!;
  const libres = slotsLibres({ schedule: pro.schedule, fecha, duracion, citas: r.appointments.filter(c => c.professionalId === proId) });
  expect(libres.length).toBeGreaterThan(0);
  return libres[0];
}

describe('demo de AgendaMas: centro de ejemplo en memoria', () => {
  beforeEach(() => resetDemo());

  it('trae un centro armado: profesionales, boxes, horarios y citas', async () => {
    const r = await rango(diaHabil);
    expect(r.professionals).toHaveLength(3);
    expect(r.boxes.length).toBeGreaterThanOrEqual(3);
    expect(r.assignments.length).toBeGreaterThan(0);
    expect(r.appointments.length).toBeGreaterThan(3);
    // Datos evidentemente ficticios
    for (const c of r.appointments.filter(a => a.patientEmail)) expect(c.patientEmail).toMatch(/@ejemplo\.cl$/);
  });

  it('agendar en una hora libre aparece en la agenda, con el box del profesional', async () => {
    const hora = await horaLibre('demo-pro-2', diaHabil, 30);
    const { appointment } = await demoCall<{ appointment: CenterAppointment }>('center-book', {
      professionalId: 'demo-pro-2', date: diaHabil, time: hora, serviceName: 'Control ginecológico', patient: { name: 'Paciente de Prueba', phone: '+56 9 5550 0000' },
    });
    expect(appointment.price).toBe(28000);          // el precio sale del servicio, no del formulario
    const r = await rango(diaHabil);
    const creada = r.appointments.find(c => c.id === appointment.id)!;
    expect(creada.patientName).toBe('Paciente de Prueba');
    if (hora < '14:00') expect(creada.boxId).toBe('demo-box-2');
  });

  it('agendar sobre una cita existente falla con SLOT_TAKEN', async () => {
    const r = await rango(diaHabil);
    const ocupada = r.appointments.find(c => c.professionalId === 'demo-pro-1' && !c.esBloqueo)!;
    await expect(demoCall('center-book', {
      professionalId: 'demo-pro-1', date: diaHabil, time: ocupada.time, serviceName: 'Sesión de kinesiología', patient: { name: 'Otra Persona' },
    })).rejects.toMatchObject({ reason: 'SLOT_TAKEN', status: 409 });
  });

  it('liberar una hora la deja disponible de nuevo', async () => {
    const r = await rango(diaHabil);
    const cita = r.appointments.find(c => c.professionalId === 'demo-pro-3' && !c.esBloqueo && !c.ajena)!;
    await demoCall('center-cancel', { appointmentId: cita.id });
    expect((await rango(diaHabil)).appointments.some(c => c.id === cita.id)).toBe(false);
    await expect(demoCall('center-book', {
      professionalId: 'demo-pro-3', date: diaHabil, time: cita.time, serviceName: 'Consulta médica', patient: { name: 'Nuevo Paciente' },
    })).resolves.toBeTruthy();
  });

  it('reagendar mueve la cita y respeta los choques', async () => {
    const r = await rango(diaHabil);
    const [a, b] = r.appointments.filter(c => c.professionalId === 'demo-pro-1' && !c.esBloqueo);
    await expect(demoCall('center-reschedule', { appointmentId: a.id, date: diaHabil, time: b.time })).rejects.toMatchObject({ reason: 'SLOT_TAKEN' });
    const libre = await horaLibre('demo-pro-1', diaHabil, a.duration);
    await demoCall('center-reschedule', { appointmentId: a.id, date: diaHabil, time: libre });
    expect((await rango(diaHabil)).appointments.find(c => c.id === a.id)!.time).toBe(libre);
  });

  it('un box ocupado no se puede asignar a otro profesional', async () => {
    await expect(demoCall('center-assign-save', {
      boxId: 'demo-box-1', professionalId: 'demo-pro-2', date: diaHabil, start: '10:00', end: '12:00',
    })).rejects.toMatchObject({ reason: 'BOX_TAKEN' });
  });

  it('el reporte suma las horas de box asignadas', async () => {
    const antes = await demoCall<{ rows: ReportRow[] }>('center-report', { from: diaHabil, to: diaHabil });
    const total = (rows: ReportRow[]) => rows.reduce((s, x) => s + x.totalMin, 0);
    await demoCall('center-box-save', { name: 'Box nuevo' });
    const box = (await rango(diaHabil)).boxes.find(x => x.name === 'Box nuevo')!;
    await demoCall('center-assign-save', { boxId: box.id, professionalId: 'demo-pro-2', date: diaHabil, start: '15:00', end: '17:00' });
    const despues = await demoCall<{ rows: ReportRow[] }>('center-report', { from: diaHabil, to: diaHabil });
    expect(total(despues.rows) - total(antes.rows)).toBe(120);
  });

  it('las respuestas son copias: la pantalla no puede alterar el estado', async () => {
    const r = await rango(diaHabil);
    r.appointments.length = 0;
    expect((await rango(diaHabil)).appointments.length).toBeGreaterThan(0);
  });
});
