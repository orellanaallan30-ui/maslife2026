// Demo de AgendaMas (clinicamaslife.cl/demo): un "servidor" simulado que vive en la
// memoria del navegador. No toca la base de datos, no pide sesión y no envía correos.
// Al recargar la página vuelve al estado inicial.
//
// Usa las MISMAS reglas que el servidor real (api/_lib/centerRules.ts), así agendar,
// reagendar, liberar y asignar boxes se comportan igual, incluidos los choques.

import {
  choque, fueraDeHorario, boxParaCita, choqueAsignacion, fechasSemanales, horasDeBox,
  servicioDelPro, esHora, sumarDias, lunesDe, diaSemana,
  esMedioPago, montoCobro, resumenCaja, diferenciaCierre, ESTADOS_COBRABLES, MEDIOS_PAGO,
} from '../api/_lib/centerRules';
import { toMinutes } from '../api/_lib/overlap';
import {
  CenterError,
  type Assignment, type Box, type CenterAppointment, type CenterInfo, type CenterPro,
  type Member, type PatientContact, type Cobro, type MedioPago, type CierreCaja,
} from './centerService';

const CENTER_ID = 'demo-centro';
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

interface Estado {
  center: CenterInfo;
  pros: CenterPro[];
  boxes: Box[];
  assignments: Assignment[];
  appointments: CenterAppointment[];
  patients: PatientContact[];
  members: Member[];
  cobros: Cobro[];
  cierres: Record<string, CierreCaja>;
  seq: number;
}

let estado: Estado | null = null;

/** Fecha y minutos actuales del navegador. */
function ahora(): { fecha: string; minutos: number } {
  const d = new Date();
  return { fecha: d.toLocaleDateString('en-CA'), minutos: d.getHours() * 60 + d.getMinutes() };
}

/** Número pseudoaleatorio estable (0..1) a partir de un texto: la demo se ve igual en cada visita del día. */
function azar(clave: string): number {
  let h = 2166136261;
  for (let i = 0; i < clave.length; i++) { h ^= clave.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

const horario = (ini: string, fin: string, sabado?: [string, string]) => {
  const s: Record<number, { active: boolean; start: string; end: string }> = {};
  for (let d = 0; d <= 6; d++) s[d] = { active: d >= 1 && d <= 5, start: ini, end: fin };
  if (sabado) s[6] = { active: true, start: sabado[0], end: sabado[1] };
  return s;
};

const NOMBRES = [
  'María Pérez Soto', 'Juan Carlos Muñoz', 'Rosa Díaz Contreras', 'Antonia Vega Rojas', 'Paula Henríquez', 'Luis Tapia Araya',
  'Camila Fuentes', 'Pedro Castillo', 'Valentina Morales', 'Jorge Espinoza', 'Daniela Carrasco', 'Tomás Herrera',
  'Francisca Núñez', 'Ignacio Sepúlveda',
];

// Horas tipo de cada profesional: [hora, índice del servicio]
const PLANTILLA: Record<string, Array<[string, number]>> = {
  'demo-pro-1': [['09:00', 0], ['10:00', 1], ['11:00', 1], ['12:00', 1], ['14:30', 1], ['15:30', 1], ['17:00', 0]],
  'demo-pro-2': [['09:00', 0], ['09:30', 1], ['10:30', 0], ['11:30', 1], ['12:30', 0], ['15:00', 0]],
  'demo-pro-3': [['10:00', 0], ['10:30', 0], ['11:30', 0], ['12:00', 0], ['14:00', 0], ['15:00', 0], ['16:30', 0]],
};

function crearEstado(): Estado {
  const hoy = ahora();
  const pros: CenterPro[] = [
    { id: 'demo-pro-1', name: 'Klgo. Martín Soto', specialty: 'Kinesiología', workingHours: null, schedule: horario('09:00', '18:00', ['09:00', '13:00']),
      services: [{ name: 'Evaluación kinésica', price: 25000, duration: 60 }, { name: 'Sesión de kinesiología', price: 17000, duration: 45 }] },
    { id: 'demo-pro-2', name: 'Mat. Carolina Vidal', specialty: 'Matrona', workingHours: null, schedule: horario('09:00', '17:00'),
      services: [{ name: 'Control ginecológico', price: 28000, duration: 30 }, { name: 'Control prenatal', price: 30000, duration: 45 }] },
    { id: 'demo-pro-3', name: 'Dra. Paula Reyes', specialty: 'Medicina general', workingHours: null, schedule: horario('10:00', '18:00'),
      services: [{ name: 'Consulta médica', price: 30000, duration: 30 }] },
  ];
  const boxes: Box[] = [
    { id: 'demo-box-1', name: 'Box 1', color: '#0ea5e9', active: true, sort: 0 },
    { id: 'demo-box-2', name: 'Box 2', color: '#f59e0b', active: true, sort: 1 },
    { id: 'demo-box-3', name: 'Box 3', color: '#8b5cf6', active: true, sort: 2 },
  ];
  const patients: PatientContact[] = NOMBRES.map((name, i) => ({
    id: `demo-pac-${i + 1}`, name, rut: `${10 + i}.${String(100 + i * 37).slice(0, 3)}.${String(200 + i * 53).slice(0, 3)}-${i % 10}`,
    phone: `+56 9 5550 ${String(1000 + i * 111).slice(0, 4)}`, email: `paciente${i + 1}@ejemplo.cl`,
    prevision: ['Fonasa', 'Isapre', 'Particular'][i % 3], professionalId: pros[i % 3].id,
  }));

  // Horarios de box: semana pasada, esta y las 3 siguientes.
  const assignments: Assignment[] = [];
  const desde = sumarDias(lunesDe(hoy.fecha), -7), hasta = sumarDias(lunesDe(hoy.fecha), 27);
  let n = 0;
  const asigna = (boxId: string, professionalId: string, date: string, start: string, end: string, rec: string) =>
    assignments.push({ id: `demo-asig-${++n}`, boxId, professionalId, date, start, end, recurrenceId: rec });
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const d = diaSemana(f);
    if (d >= 1 && d <= 5) {
      asigna('demo-box-1', 'demo-pro-1', f, '09:00', '13:00', 'demo-rec-1');
      asigna('demo-box-2', 'demo-pro-2', f, '09:00', '14:00', 'demo-rec-2');
      asigna('demo-box-3', 'demo-pro-3', f, '10:00', '14:00', 'demo-rec-3');
      if (d === 1 || d === 3 || d === 5) asigna('demo-box-2', 'demo-pro-1', f, '14:00', '18:00', 'demo-rec-4');
      if (d === 2 || d === 4) asigna('demo-box-1', 'demo-pro-3', f, '14:00', '18:00', 'demo-rec-5');
    } else if (d === 6) {
      asigna('demo-box-1', 'demo-pro-1', f, '09:00', '13:00', 'demo-rec-6');
    }
  }

  // Citas de ejemplo.
  const appointments: CenterAppointment[] = [];
  let c = 0;
  const cita = (pro: CenterPro, date: string, time: string, svIdx: number, extra: Partial<CenterAppointment> = {}) => {
    const sv = pro.services[svIdx] || pro.services[0];
    const pac = patients[Math.floor(azar(`${pro.id}${date}${time}p`) * patients.length)];
    appointments.push({
      id: `demo-cita-${++c}`, professionalId: pro.id, date, time, duration: sv.duration, status: 'Confirmado',
      boxId: boxParaCita(assignments, pro.id, date, time, sv.duration), centerId: CENTER_ID, esBloqueo: false, ajena: false,
      patientId: pac.id, patientName: pac.name, patientPhone: pac.phone, patientEmail: pac.email, patientRut: pac.rut,
      serviceName: sv.name, type: 'Presencial', price: sv.price, paymentStatus: 'Pendiente', paidAt: null, paymentAmount: null,
      bookingSource: 'presencial', ...extra,
    });
  };
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const d = diaSemana(f);
    if (d === 0) continue;
    for (const pro of pros) {
      if (d === 6 && pro.id !== 'demo-pro-1') continue;
      for (const [time, svIdx] of PLANTILLA[pro.id]) {
        if (d === 6 && toMinutes(time) >= 13 * 60) continue;
        if (pro.id === 'demo-pro-2' && d === 3 && toMinutes(time) >= 15 * 60) continue;   // miércoles: bloqueo en la tarde
        if (azar(`${pro.id}${f}${time}`) < 0.32) continue;                                // deja horas libres
        const dur = (pro.services[svIdx] || pro.services[0]).duration;
        const fin = toMinutes(time) + dur;
        const r = azar(`${pro.id}${f}${time}e`);
        let extra: Partial<CenterAppointment> = {};
        const pagada = { paymentStatus: 'Pagado', paidAt: `${f}T12:00:00Z` };
        if (f < hoy.fecha || (f === hoy.fecha && fin <= hoy.minutos - 20)) extra = { status: 'Finalizado', ...pagada };
        else if (f === hoy.fecha && toMinutes(time) <= hoy.minutos + 25) extra = { status: 'Llegado', ...(r < 0.6 ? pagada : {}) };
        else if (r < 0.12) extra = { status: 'Pendiente', bookingSource: 'web' };
        else if (r < 0.3) extra = { ...pagada, bookingSource: 'web' };
        cita(pro, f, time, svIdx, extra);
      }
    }
    if (d === 3) {
      appointments.push({ id: `demo-cita-${++c}`, professionalId: 'demo-pro-2', date: f, time: '15:00', duration: 120, status: 'Bloqueado',
        boxId: null, centerId: null, esBloqueo: true, ajena: false, patientName: '', serviceName: 'Bloqueo' });
    }
    if (d === 4 && !appointments.some(a => a.professionalId === 'demo-pro-3' && a.date === f && a.time === '16:30')) {
      appointments.push({ id: `demo-cita-${++c}`, professionalId: 'demo-pro-3', date: f, time: '16:30', duration: 60, status: 'Confirmado',
        boxId: null, centerId: 'otro-centro', esBloqueo: false, ajena: true, patientName: 'Ocupado', serviceName: '' });
    }
  }

  const members: Member[] = [
    { id: 'demo-m-1', role: 'admin', status: 'active', email: 'martin@ejemplo.cl', name: 'Klgo. Martín Soto', specialty: 'Kinesiología', professionalId: 'demo-pro-1', esDueno: true, soyYo: true },
    { id: 'demo-m-2', role: 'recepcion', status: 'active', email: 'recepcion@ejemplo.cl', name: 'Daniela Fuentes', specialty: '', professionalId: null, esDueno: false, soyYo: false },
    { id: 'demo-m-3', role: 'profesional', status: 'active', email: 'carolina@ejemplo.cl', name: 'Mat. Carolina Vidal', specialty: 'Matrona', professionalId: 'demo-pro-2', esDueno: false, soyYo: false },
    { id: 'demo-m-4', role: 'profesional', status: 'active', email: 'paula@ejemplo.cl', name: 'Dra. Paula Reyes', specialty: 'Medicina general', professionalId: 'demo-pro-3', esDueno: false, soyYo: false },
    { id: 'demo-m-5', role: 'profesional', status: 'invited', email: 'nutricion@ejemplo.cl', name: 'Nut. Andrea Lagos', specialty: 'Nutrición', professionalId: 'demo-pro-4', esDueno: false, soyYo: false },
  ];

  // Cobros de ejemplo: las citas pagadas en recepción (no las pagadas en línea).
  const cobros: Cobro[] = [];
  const nombrePro = (id: string) => pros.find(p => p.id === id)?.name || '';
  for (const a of appointments) {
    if (a.paymentStatus !== 'Pagado' || a.bookingSource === 'web' || a.ajena || a.esBloqueo) continue;
    if (a.date < sumarDias(hoy.fecha, -14) || a.date > hoy.fecha) continue;
    const r = azar(`${a.id}m`);
    const method: MedioPago = r < 0.38 ? 'efectivo' : r < 0.7 ? 'transferencia' : r < 0.9 ? 'debito' : 'credito';
    const fin = toMinutes(a.time) + a.duration;
    const t = `${a.date}T${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}:00`;
    cobros.push({
      id: `demo-cobro-${cobros.length + 1}`, appointmentId: a.id, professionalId: a.professionalId, professionalName: nombrePro(a.professionalId),
      patientName: a.patientName, serviceName: a.serviceName, citaFecha: a.date, citaHora: a.time,
      amount: a.price || 0, method, reference: method === 'transferencia' ? `TRF-${String(4100 + cobros.length * 7)}` : '', note: '',
      createdAt: new Date(t).toISOString(), receivedBy: 'Daniela Fuentes', afterClose: false, voidedAt: null, voidReason: '', voidedBy: '',
    });
    Object.assign(a, { paidAt: new Date(t).toISOString(), paymentAmount: a.price || 0 });
  }

  return {
    cobros, cierres: {},
    center: { id: CENTER_ID, name: 'Centro Demo AgendaMas', city: 'Ovalle', address: 'Av. Ejemplo 123', phone: '+56 53 2 555 000', esDueno: true },
    pros, boxes, assignments, appointments, patients, members, seq: 1000,
  };
}

const falla = (status: number, msg: string, reason?: string): never => { throw new CenterError(msg, status, reason); };
const exigir = (cond: unknown, status: number, msg: string): void => { if (!cond) falla(status, msg); };
const txt = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);

function validarHora(s: Estado, pro: CenterPro, fecha: string, hora: string, duracion: number, opts: { ignorarId?: string; fueraHorario?: boolean }) {
  exigir(FECHA.test(fecha) && esHora(hora), 400, 'Fecha u hora inválida');
  const a = ahora();
  exigir(fecha > a.fecha || (fecha === a.fecha && toMinutes(hora) + duracion > a.minutos), 400, 'Esa hora ya pasó');
  if (!opts.fueraHorario) {
    const fuera = fueraDeHorario(pro.schedule, fecha, hora, duracion);
    if (fuera) falla(409, fuera, 'FUERA_DE_HORARIO');
  }
  const delPro = s.appointments.filter(x => x.professionalId === pro.id);
  if (choque(delPro, fecha, hora, duracion, opts.ignorarId)) falla(409, 'Esa hora ya está tomada. Elige otra.', 'SLOT_TAKEN');
}

function citaEditable(s: Estado, id: unknown): CenterAppointment {
  const apt = s.appointments.find(x => x.id === id);
  exigir(apt, 404, 'La cita ya no existe');
  exigir(!apt!.ajena, 403, 'Esa cita pertenece a otro centro');
  return apt!;
}

type Body = Record<string, any>;

const acciones: Record<string, (s: Estado, b: Body) => unknown> = {
  'center-me': s => ({ memberships: [{ memberId: 'demo-m-1', role: 'admin', status: 'active', name: 'Demo', professionalId: 'demo-pro-1', center: s.center }] }),

  'center-update': (s, b) => {
    const name = txt(b.name, 80);
    exigir(name.length >= 3, 400, 'Escribe el nombre del centro');
    s.center = { ...s.center, name, address: txt(b.address), city: txt(b.city, 80), phone: txt(b.phone, 30) };
    return { ok: true };
  },

  'center-members': s => ({ members: s.members }),

  'center-member-add': (s, b) => {
    const email = txt(b.email, 120).toLowerCase();
    exigir(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email), 400, 'El correo no es válido');
    exigir(!s.members.some(m => m.email === email), 409, 'Esa persona ya está en el equipo');
    if (b.role === 'profesional') {
      s.members.push({ id: `demo-m-${++s.seq}`, role: 'profesional', status: 'invited', email, name: email.split('@')[0], specialty: '', professionalId: `demo-pro-${s.seq}`, esDueno: false, soyYo: false });
      return { ok: true, status: 'invited' };
    }
    const name = txt(b.name, 80);
    exigir(name.length >= 2, 400, 'Escribe el nombre de la persona');
    s.members.push({ id: `demo-m-${++s.seq}`, role: 'recepcion', status: 'active', email, name, specialty: '', professionalId: null, esDueno: false, soyYo: false });
    return { ok: true, status: 'active', claveTemporal: 'demo-4f2a-91c7A1' };
  },

  'center-member-remove': (s, b) => {
    const m = s.members.find(x => x.id === b.memberId);
    exigir(m, 404, 'Esa persona ya no está en el equipo');
    exigir(!m!.esDueno, 400, 'El dueño del centro no se puede quitar');
    s.members = s.members.filter(x => x.id !== b.memberId);
    return { ok: true };
  },

  'center-box-save': (s, b) => {
    const name = txt(b.name, 40);
    exigir(name.length >= 1, 400, 'Escribe el nombre del box');
    if (b.id) {
      const box = s.boxes.find(x => x.id === b.id);
      exigir(box, 404, 'Ese box no existe');
      Object.assign(box!, { name, color: txt(b.color, 20), active: b.active !== false });
      return { id: b.id };
    }
    const id = `demo-box-${++s.seq}`;
    s.boxes.push({ id, name, color: txt(b.color, 20), active: true, sort: s.boxes.length });
    return { id };
  },

  'center-box-delete': (s, b) => {
    const hoy = ahora().fecha;
    exigir(!s.assignments.some(a => a.boxId === b.id && a.date >= hoy), 409, 'Ese box tiene horarios asignados desde hoy. Quítalos primero o desactiva el box.');
    s.boxes = s.boxes.filter(x => x.id !== b.id);
    return { ok: true };
  },

  'center-assign-save': (s, b) => {
    exigir(s.pros.some(p => p.id === b.professionalId), 403, 'Ese profesional no pertenece al centro');
    const box = s.boxes.find(x => x.id === b.boxId);
    exigir(box, 404, 'Ese box no existe');
    exigir(box!.active, 409, 'Ese box está desactivado');
    const date = String(b.date || ''), start = String(b.start || ''), end = String(b.end || '');
    exigir(FECHA.test(date) && esHora(start) && esHora(end) && toMinutes(end) > toMinutes(start), 400, 'Revisa la fecha y el horario');
    const fechas = fechasSemanales(date, Number(b.weeks) || 1);
    const conflictos = fechas
      .map(f => ({ f, ch: choqueAsignacion(s.assignments, { boxId: b.boxId, professionalId: b.professionalId, date: f, start, end }) }))
      .filter(x => x.ch);
    if (conflictos.length) {
      const x = conflictos[0];
      const mas = conflictos.length > 1 ? ` y en ${conflictos.length - 1} fecha(s) más` : '';
      falla(409, x.ch!.tipo === 'box' ? `El box ya está ocupado a esa hora el ${x.f}${mas}.` : `El profesional ya tiene otro box a esa hora el ${x.f}${mas}.`, 'BOX_TAKEN');
    }
    const rec = fechas.length > 1 ? `demo-rec-${++s.seq}` : null;
    for (const f of fechas) s.assignments.push({ id: `demo-asig-${++s.seq}`, boxId: b.boxId, professionalId: b.professionalId, date: f, start, end, recurrenceId: rec });
    return { ok: true, creadas: fechas.length };
  },

  'center-assign-delete': (s, b) => {
    const a = s.assignments.find(x => x.id === b.id);
    exigir(a, 404, 'Ese horario ya no existe');
    s.assignments = s.assignments.filter(x => b.scope === 'future' && a!.recurrenceId
      ? !(x.recurrenceId === a!.recurrenceId && x.date >= a!.date)
      : x.id !== a!.id);
    return { ok: true };
  },

  'center-range': (s, b) => {
    const from = String(b.from || ''), to = String(b.to || '');
    exigir(FECHA.test(from) && FECHA.test(to) && to >= from, 400, 'Rango de fechas inválido');
    const dentro = (d: string) => d >= from && d <= to;
    return {
      center: s.center, rol: 'admin', ahora: ahora(), professionals: s.pros,
      boxes: [...s.boxes].sort((a, z) => a.sort - z.sort),
      assignments: s.assignments.filter(a => dentro(a.date)).sort((a, z) => (a.date + a.start).localeCompare(z.date + z.start)),
      appointments: s.appointments.filter(a => dentro(a.date) && a.status !== 'Cancelado'),
    };
  },

  'center-patient-search': (s, b) => {
    const q = txt(b.q, 60).toLowerCase();
    exigir(q.length >= 2, 400, 'Escribe al menos 2 letras');
    return { patients: s.patients.filter(p => [p.name, p.rut, p.phone].some(v => v.toLowerCase().includes(q))).slice(0, 20) };
  },

  'center-book': (s, b) => {
    const pro = s.pros.find(p => p.id === b.professionalId);
    exigir(pro, 403, 'Ese profesional no pertenece al centro');
    const serviceName = txt(b.serviceName, 120) || 'Consulta';
    const sv = servicioDelPro(pro!.services, serviceName);
    const duration = sv ? sv.duration : Math.min(240, Math.max(15, Math.round(Number(b.duration) || 60)));
    const date = String(b.date || ''), time = String(b.time || '');
    validarHora(s, pro!, date, time, duration, { fueraHorario: b.fueraHorario === true });
    const p = b.patient || {};
    let pac = p.id ? s.patients.find(x => x.id === p.id) : undefined;
    if (p.id) exigir(pac, 404, 'Paciente no encontrado en el centro');
    if (!pac) {
      const name = txt(p.name, 120);
      exigir(name.length >= 3, 400, 'Escribe el nombre del paciente');
      pac = { id: `demo-pac-${++s.seq}`, name, rut: txt(p.rut, 20), phone: txt(p.phone, 30), email: txt(p.email, 120).toLowerCase(), prevision: txt(p.prevision, 40), professionalId: pro!.id };
      s.patients.push(pac);
    }
    const apt: CenterAppointment = {
      id: `demo-cita-${++s.seq}`, professionalId: pro!.id, date, time, duration, status: 'Confirmado',
      boxId: boxParaCita(s.assignments, pro!.id, date, time, duration), centerId: CENTER_ID, esBloqueo: false, ajena: false,
      patientId: pac.id, patientName: pac.name, patientPhone: pac.phone, patientEmail: pac.email, patientRut: pac.rut,
      serviceName, type: 'Presencial', price: sv ? sv.price : 0, paymentStatus: 'Pendiente', paidAt: null, paymentAmount: null, bookingSource: 'presencial',
    };
    s.appointments.push(apt);
    return { appointment: apt };
  },

  'center-reschedule': (s, b) => {
    const apt = citaEditable(s, b.appointmentId);
    exigir(!['Bloqueado', 'Cancelado', 'Finalizado'].includes(apt.status), 409, 'Esa cita no se puede reagendar');
    const pro = s.pros.find(p => p.id === apt.professionalId)!;
    const date = String(b.date || ''), time = String(b.time || '');
    validarHora(s, pro, date, time, apt.duration, { ignorarId: apt.id, fueraHorario: b.fueraHorario === true });
    Object.assign(apt, { date, time, boxId: boxParaCita(s.assignments, pro.id, date, time, apt.duration) });
    return { appointment: apt };
  },

  'center-cancel': (s, b) => {
    const apt = citaEditable(s, b.appointmentId);
    exigir(apt.status !== 'Bloqueado', 409, 'Los bloqueos de horario los administra el profesional');
    exigir(apt.status !== 'Cancelado', 409, 'Esa cita ya estaba cancelada');
    apt.status = 'Cancelado';
    return { ok: true };
  },

  'center-status': (s, b) => {
    const apt = citaEditable(s, b.appointmentId);
    exigir(b.status === 'Llegado' || b.status === 'Confirmado', 400, 'Estado inválido');
    exigir(['Confirmado', 'Pendiente', 'Llegado'].includes(apt.status), 409, 'El estado de esa cita ya no se puede cambiar desde recepción');
    apt.status = b.status;
    return { ok: true };
  },

  'center-payment': (s, b) => {
    const apt = citaEditable(s, b.appointmentId);
    exigir(apt.status !== 'Bloqueado' && apt.status !== 'Cancelado', 409, 'Esa cita no admite pagos');
    if (b.paid === false) return acciones['center-payment-void'](s, { ...b, reason: 'Pago desmarcado' });
    exigir(apt.paymentStatus !== 'Pagado', 409, 'Esa cita ya está pagada');
    const method: MedioPago = esMedioPago(b.method) ? b.method : 'efectivo';
    const note = txt(b.note, 300);
    const r = montoCobro(apt.price || 0, b.amount, note);
    if ('error' in r) falla(400, r.error);
    const monto = (r as { monto: number }).monto;
    const fecha = ahora().fecha;
    const cobro: Cobro = {
      id: `demo-cobro-${++s.seq}`, appointmentId: apt.id, professionalId: apt.professionalId,
      professionalName: s.pros.find(p => p.id === apt.professionalId)?.name || '', patientName: apt.patientName, serviceName: apt.serviceName,
      citaFecha: apt.date, citaHora: apt.time, amount: monto, method, reference: txt(b.reference, 80), note,
      createdAt: new Date().toISOString(), receivedBy: 'Tú (demo)', afterClose: !!s.cierres[fecha], voidedAt: null, voidReason: '', voidedBy: '',
    };
    s.cobros.push(cobro);
    Object.assign(apt, { paymentStatus: 'Pagado', paidAt: cobro.createdAt, paymentAmount: monto });
    return { ok: true, paymentId: cobro.id, amount: monto, afterClose: cobro.afterClose };
  },

  'center-payment-void': (s, b) => {
    const reason = txt(b.reason, 200);
    exigir(reason.length >= 3, 400, 'Escribe el motivo de la anulación');
    const cobro = s.cobros.find(x => !x.voidedAt && (b.paymentId ? x.id === b.paymentId : x.appointmentId === b.appointmentId));
    if (!cobro) {
      const apt = citaEditable(s, b.appointmentId);
      exigir(!(apt.bookingSource === 'web' && apt.paymentStatus === 'Pagado'), 409, 'Ese pago se hizo en línea y no se puede anular aquí');
      exigir(apt.paymentStatus === 'Pagado', 404, 'Esa cita no tiene un cobro vigente');
      Object.assign(apt, { paymentStatus: 'Pendiente', paidAt: null, paymentAmount: null });
      return { ok: true };
    }
    Object.assign(cobro, { voidedAt: new Date().toISOString(), voidReason: reason, voidedBy: 'Tú (demo)' });
    const apt = s.appointments.find(a => a.id === cobro.appointmentId);
    if (apt) Object.assign(apt, { paymentStatus: 'Pendiente', paidAt: null, paymentAmount: null });
    return { ok: true };
  },

  'center-cashbox': (s, b) => {
    const fecha = String(b.date || '');
    exigir(FECHA.test(fecha), 400, 'Fecha inválida');
    const fechaLocal = (iso: string) => new Date(iso).toLocaleDateString('en-CA');
    const cobros = s.cobros.filter(x => fechaLocal(x.createdAt) === fecha);
    const vigentes = new Set(cobros.filter(x => !x.voidedAt).map(x => x.appointmentId));
    const nombre = (id: string) => s.pros.find(p => p.id === id)?.name || '';
    const delDia = s.appointments.filter(a => a.date === fecha && !a.ajena && !a.esBloqueo && a.status !== 'Cancelado');
    return {
      date: fecha, rol: 'admin', center: s.center, cobros,
      porCobrar: delDia.filter(a => a.paymentStatus !== 'Pagado' && ESTADOS_COBRABLES.includes(a.status) && !vigentes.has(a.id))
        .map(a => ({ ...a, professionalName: nombre(a.professionalId) })).sort((x, y) => x.time.localeCompare(y.time)),
      enLinea: delDia.filter(a => a.paymentStatus === 'Pagado' && a.bookingSource === 'web').map(a => ({ ...a, professionalName: nombre(a.professionalId) })),
      resumen: resumenCaja(cobros),
      profesionales: Object.fromEntries(s.pros.map(p => [p.id, p.name])),
      cierre: s.cierres[fecha] || null,
    };
  },

  'center-cash-close': (s, b) => {
    const fecha = String(b.date || '');
    exigir(FECHA.test(fecha), 400, 'Fecha inválida');
    exigir(fecha <= ahora().fecha, 400, 'No se puede cerrar una caja de un día futuro');
    const contado = Math.round(Number(b.countedCash));
    exigir(Number.isFinite(contado) && contado >= 0, 400, 'Escribe el efectivo contado');
    const r = resumenCaja(s.cobros.filter(x => new Date(x.createdAt).toLocaleDateString('en-CA') === fecha));
    const expected: Record<string, number> = { total: r.total, cobros: r.cobros };
    for (const m of MEDIOS_PAGO) expected[m] = r.porMedio[m];
    const difference = diferenciaCierre(r.porMedio.efectivo, contado);
    s.cierres[fecha] = { expected, countedCash: contado, difference, note: txt(b.note, 300), closedAt: new Date().toISOString(), closedBy: 'Tú (demo)' };
    return { ok: true, difference };
  },

  'center-report': (s, b) => {
    const from = String(b.from || ''), to = String(b.to || '');
    exigir(FECHA.test(from) && FECHA.test(to) && to >= from, 400, 'Rango de fechas inválido');
    return {
      from, to,
      rows: horasDeBox(s.assignments, from, to).map(h => {
        const p = s.pros.find(x => x.id === h.professionalId);
        return { ...h, name: p?.name || 'Profesional', specialty: p?.specialty || '' };
      }),
    };
  },
};

/** Ejecuta una acción `center-*` sobre el centro de ejemplo. Devuelve copias: la pantalla no puede alterar el estado. */
export async function demoCall<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!estado) estado = crearEstado();
  const fn = acciones[action];
  if (!fn) throw new CenterError('Esta acción no está disponible en la demo.', 400);
  await new Promise(r => setTimeout(r, 120));   // pequeña espera, como una red real
  return JSON.parse(JSON.stringify(fn(estado, body))) as T;
}

/** Vuelve la demo a su estado inicial (lo usan los tests). */
export function resetDemo(): void { estado = null; }
