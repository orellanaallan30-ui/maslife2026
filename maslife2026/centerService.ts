// Centros de AgendaMas: llamadas del navegador a las acciones `center-*`
// (api/_lib/center.ts, despachadas desde /api/book-appointment).
//
// Recepción NUNCA lee tablas directo: todo pasa por estas llamadas, que exigen
// sesión y rol, y devuelven solo datos de agenda y contacto.

import { supabase } from './supabaseClient';

export type CenterRole = 'admin' | 'recepcion' | 'profesional';

export interface CenterInfo { id: string; name: string; city: string; address: string; phone: string; logoUrl?: string; esDueno?: boolean }
export interface Membership { memberId: string; role: CenterRole; status: 'invited' | 'active'; name: string; professionalId: string | null; center: CenterInfo }

export type { DiaHorario } from '../api/_lib/horario';
import type { DiaHorario } from '../api/_lib/horario';
export interface CenterService { name: string; price: number; duration: number }
export interface CenterPro {
  id: string; name: string; specialty: string;
  schedule: Record<number, DiaHorario> | null;
  workingHours: { start: string; end: string } | null;
  services: CenterService[];
}
export interface Box { id: string; name: string; color: string; active: boolean; sort: number }
export interface Assignment { id: string; boxId: string; professionalId: string; date: string; start: string; end: string; recurrenceId?: string | null }
export interface CenterAppointment {
  id: string; professionalId: string; date: string; time: string; duration: number; status: string;
  boxId: string | null; centerId: string | null; esBloqueo: boolean; ajena: boolean;
  patientId?: string | null; patientName: string; patientPhone?: string; patientEmail?: string; patientRut?: string;
  serviceName: string; type?: string; price?: number; paymentStatus?: string; paidAt?: string | null;
  paymentAmount?: number | null; bookingSource?: string | null;
}
export interface CenterRange {
  center: CenterInfo; rol: CenterRole; ahora: { fecha: string; minutos: number };
  professionals: CenterPro[]; boxes: Box[]; assignments: Assignment[]; appointments: CenterAppointment[];
}
export interface PatientContact { id: string; name: string; rut: string; phone: string; email: string; prevision: string; professionalId: string }
export interface Member { id: string; role: CenterRole; status: string; email: string; name: string; specialty: string; professionalId: string | null; esDueno: boolean; soyYo: boolean }
export interface ReportRow {
  professionalId: string; name: string; specialty: string; totalMin: number;
  porDia: Record<string, number>; porSemana: Record<string, number>; porMes: Record<string, number>;
}

/** Error de una acción del centro, con el motivo que envía el servidor (p. ej. SLOT_TAKEN). */
export class CenterError extends Error {
  constructor(message: string, public status: number, public reason?: string, public extra?: Record<string, unknown>) { super(message); }
}

/** true en la demo pública (/demo): las llamadas van al centro de ejemplo en memoria, sin red ni sesión. */
export const enDemo = (): boolean => typeof window !== 'undefined' && window.location.pathname.startsWith('/demo');

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  if (enDemo()) {
    const { demoCall } = await import('./centerDemo');
    return demoCall<T>(action, body);
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new CenterError('Tu sesión terminó. Vuelve a entrar.', 401);
  let res: Response;
  try {
    res = await fetch('/api/book-appointment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, ...body }),
    });
  } catch {
    throw new CenterError('Sin conexión. Revisa tu internet e intenta de nuevo.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new CenterError(data?.error || 'Ocurrió un error. Intenta de nuevo.', res.status, data?.reason, data);
  return data as T;
}

export const centerApi = {
  me: () => call<{ memberships: Membership[] }>('center-me'),
  create: (d: { name: string; address?: string; city?: string; phone?: string }) => call<{ centerId: string }>('center-create', d),
  update: (centerId: string, d: { name: string; address?: string; city?: string; phone?: string }) => call<{ ok: true }>('center-update', { centerId, ...d }),

  members: (centerId: string) => call<{ members: Member[] }>('center-members', { centerId }),
  addMember: (centerId: string, d: { role: 'recepcion' | 'profesional'; email: string; name?: string }) =>
    call<{ ok: true; status: string; claveTemporal?: string | null }>('center-member-add', { centerId, ...d }),
  respondInvite: (centerId: string, accept: boolean) => call<{ ok: true }>('center-member-respond', { centerId, accept }),
  removeMember: (centerId: string, memberId: string) => call<{ ok: true }>('center-member-remove', { centerId, memberId }),

  saveBox: (centerId: string, d: { id?: string; name: string; color?: string; active?: boolean; sort?: number }) => call<{ id: string }>('center-box-save', { centerId, ...d }),
  deleteBox: (centerId: string, id: string) => call<{ ok: true }>('center-box-delete', { centerId, id }),
  saveAssignment: (centerId: string, d: { boxId: string; professionalId: string; date: string; start: string; end: string; weeks?: number }) =>
    call<{ ok: true; creadas: number }>('center-assign-save', { centerId, ...d }),
  deleteAssignment: (centerId: string, id: string, scope: 'one' | 'future') => call<{ ok: true }>('center-assign-delete', { centerId, id, scope }),

  range: (centerId: string, from: string, to: string) => call<CenterRange>('center-range', { centerId, from, to }),
  searchPatients: (centerId: string, q: string) => call<{ patients: PatientContact[] }>('center-patient-search', { centerId, q }),
  book: (centerId: string, d: {
    professionalId: string; date: string; time: string; serviceName: string; duration?: number; fueraHorario?: boolean;
    patient: { id: string } | { name: string; rut?: string; phone?: string; email?: string; prevision?: string };
  }) => call<{ appointment: CenterAppointment }>('center-book', { centerId, ...d }),
  reschedule: (centerId: string, appointmentId: string, date: string, time: string, fueraHorario = false) =>
    call<{ appointment: CenterAppointment }>('center-reschedule', { centerId, appointmentId, date, time, fueraHorario }),
  cancel: (centerId: string, appointmentId: string, notify = true) => call<{ ok: true }>('center-cancel', { centerId, appointmentId, notify }),
  setStatus: (centerId: string, appointmentId: string, status: 'Llegado' | 'Confirmado') => call<{ ok: true }>('center-status', { centerId, appointmentId, status }),
  setPaid: (centerId: string, appointmentId: string, paid: boolean) => call<{ ok: true }>('center-payment', { centerId, appointmentId, paid }),

  report: (centerId: string, from: string, to: string) => call<{ from: string; to: string; rows: ReportRow[] }>('center-report', { centerId, from, to }),
};

// ── Utilidades de fecha y formato (fechas YYYY-MM-DD, sin zona horaria) ──
// Las reglas (horas libres, box de una cita, horario del día) son las MISMAS del
// servidor: se importan de api/_lib para que recepción vea lo que el servidor acepta.
export { sumarDias, diaSemana, lunesDe, slotsLibres, boxParaCita } from '../api/_lib/centerRules';
export { horarioDelDia } from '../api/_lib/horario';
import { diaSemana } from '../api/_lib/centerRules';

export const hoyLocal = (): string => new Date().toLocaleDateString('en-CA');
export const aMin = (hhmm: string): number => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const aHora = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const fechaLarga = (fecha: string): string => { const [, m, d] = fecha.split('-').map(Number); return `${DIAS[diaSemana(fecha)]} ${d} de ${MESES[m - 1]}`; };
export const fechaCorta = (fecha: string): string => { const [, m, d] = fecha.split('-').map(Number); return `${DIAS[diaSemana(fecha)].slice(0, 3)} ${d}/${String(m).padStart(2, '0')}`; };
export const horasTexto = (min: number): string => { const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${m} min` : `${h} h`; };
export const pesos = (n: number): string => `$${(n || 0).toLocaleString('es-CL')}`;
/** Teléfono chileno a formato wa.me (569XXXXXXXX), o '' si no es válido. */
export const telWhatsApp = (tel: string): string => {
  const d = String(tel || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('56')) return d;
  if (d.length === 9 && d.startsWith('9')) return `56${d}`;
  if (d.length === 8) return `569${d}`;
  return d.length >= 10 ? d : '';
};
