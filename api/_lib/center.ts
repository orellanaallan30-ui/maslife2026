// Centros de AgendaMas: recepción, boxes y reporte de horas.
//
// TODO lo que hace recepción pasa por aquí (service role + verificación de
// membresía y rol). El navegador nunca lee `patients` ni `appointments` de otros
// profesionales: las políticas RLS existentes no cambian, y recepción solo recibe
// las columnas de contacto (ver centerRules.ts). Se despacha desde
// api/book-appointment.ts para no sumar una función (límite de 12 en Vercel).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'crypto';
import { requireSupabaseAuth, checkIpRateLimit, internalKey, INTERNAL_HEADER } from './auth';
import {
  puede, PACIENTE_CONTACTO, CITA_RECEPCION, choque, fueraDeHorario, boxParaCita, choqueAsignacion,
  fechasSemanales, horasDeBox, servicioDelPro, esHora, sumarDias,
  esMedioPago, montoCobro, resumenCaja, diferenciaCierre, NOMBRE_MEDIO, ESTADOS_COBRABLES,
  type Accion, type Asignacion, type Rol, type MedioPago,
} from './centerRules';
import { toMinutes } from './overlap';
import { getValidToken, appointmentToGCalEvent, updateGCalEvent, deleteGCalEvent, syncAppointmentToGoogle } from './googleCalendar';
import { notificarCitaEnPanel } from './mpReconcile';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const txt = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const hm = (t: unknown) => String(t ?? '').slice(0, 5);

class Fallo extends Error {
  constructor(public code: number, message: string, public extra?: Record<string, unknown>) { super(message); }
}
const exigir = (cond: unknown, code: number, msg: string): void => { if (!cond) throw new Fallo(code, msg); };

/** Fecha y minutos actuales en Chile (el servidor corre en UTC). */
function ahoraChile(): { fecha: string; minutos: number } {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
  const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { fecha, minutos: d.getHours() * 60 + d.getMinutes() };
}

/** Fecha (YYYY-MM-DD) de un instante, en hora de Chile. */
function fechaChile(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

interface Ctx {
  userId: string;
  userEmail?: string;
  centerId: string;
  rol: Rol;
  center: Record<string, any>;
}

/** Membresía activa del usuario en el centro + permiso para la acción. */
async function contexto(userId: string, userEmail: string | undefined, centerId: unknown, accion: Accion): Promise<Ctx> {
  exigir(typeof centerId === 'string' && UUID.test(centerId), 400, 'Centro inválido');
  const { data: m, error } = await supabase.from('center_members')
    .select('role, status, centers(*)').eq('center_id', centerId as string).eq('user_id', userId).maybeSingle();
  if (error) throw new Fallo(500, 'No se pudo verificar tu acceso al centro');
  exigir(m && m.status === 'active', 403, 'No tienes acceso a este centro');
  exigir(puede(m!.role, accion), 403, 'Tu rol no permite esta acción');
  return { userId, userEmail, centerId: centerId as string, rol: m!.role as Rol, center: (m as any).centers };
}

async function auditar(c: Ctx, action: string, entity: string, entityId: string | null, detail?: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('center_audit').insert({
    center_id: c.centerId, actor_id: c.userId, actor_role: c.rol, action, entity, entity_id: entityId, detail: detail || null,
  });
  if (error) console.error('[center] no se pudo registrar la auditoría:', action, error.message);
}

/** Profesionales activos del centro (ids). */
async function prosDelCentro(centerId: string): Promise<string[]> {
  const { data, error } = await supabase.from('center_members')
    .select('professional_id').eq('center_id', centerId).eq('status', 'active').not('professional_id', 'is', null);
  if (error) throw new Fallo(500, 'No se pudo leer el equipo del centro');
  return [...new Set((data || []).map(r => r.professional_id as string))];
}

async function exigirProDelCentro(centerId: string, professionalId: unknown): Promise<string> {
  exigir(typeof professionalId === 'string' && UUID.test(professionalId), 400, 'Profesional inválido');
  const ids = await prosDelCentro(centerId);
  exigir(ids.includes(professionalId as string), 403, 'Ese profesional no pertenece al centro o aún no acepta la invitación');
  return professionalId as string;
}

const aAsignacion = (r: Record<string, any>): Asignacion & { recurrenceId?: string | null } => ({
  id: r.id, boxId: r.box_id, professionalId: r.professional_id, date: r.date, start: hm(r.start_time), end: hm(r.end_time),
  recurrenceId: r.recurrence_id || null,
});

/** Cita para recepción. Las de OTRO centro se devuelven como "ocupado", sin datos del paciente. */
function aCita(r: Record<string, any>, centerId: string) {
  const ajena = r.center_id && r.center_id !== centerId;
  const base = {
    id: r.id, professionalId: r.professional_id, date: r.date, time: hm(r.time), duration: r.duration || 60,
    status: r.status, boxId: r.box_id || null, centerId: r.center_id || null,
    esBloqueo: r.status === 'Bloqueado', ajena: !!ajena,
  };
  if (ajena) return { ...base, patientName: 'Ocupado', serviceName: '' };
  return {
    ...base,
    patientId: r.patient_id || null, patientName: r.patient_name || '', patientPhone: r.patient_phone || '',
    patientEmail: r.patient_email || '', patientRut: r.patient_rut || '', serviceName: r.service_name || '',
    type: r.type || 'Presencial', price: r.price || 0, paymentStatus: r.payment_status || 'Pendiente',
    paidAt: r.paid_at || null, paymentAmount: r.payment_amount ?? null, bookingSource: r.booking_source || null,
  };
}

/** Correo de cita creada / reagendada / cancelada, vía /api/notify (llamada interna). Nunca lanza. */
async function avisarPorCorreo(apt: Record<string, any>, pro: { email?: string; name?: string }, extra: Record<string, unknown> = {}): Promise<void> {
  try {
    if (!pro.email) return;
    const base = (process.env.PUBLIC_BASE_URL || 'https://clinicamaslife.cl').replace(/\/$/, '');
    const r = await fetch(`${base}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [INTERNAL_HEADER]: internalKey() },
      body: JSON.stringify({
        to: pro.email, professionalId: apt.professional_id, appointmentId: apt.id,
        professionalName: apt.doctor_name || pro.name, patientName: apt.patient_name,
        patientEmail: apt.patient_email || undefined, serviceName: apt.service_name,
        date: apt.date, time: hm(apt.time), type: apt.type, duration: apt.duration, ...extra,
      }),
    });
    if (!r.ok) console.error('[center] notify respondió', r.status, await r.text().catch(() => ''));
  } catch (e) {
    console.error('[center] no se pudo enviar el correo de la cita:', (e as Error)?.message);
  }
}

/** Refleja un cambio de hora o una cancelación en el Google Calendar del profesional. Nunca lanza. */
async function sincronizarGoogle(apt: Record<string, any>, cancelada: boolean): Promise<void> {
  try {
    if (!apt.google_event_id) { if (!cancelada) await syncAppointmentToGoogle(apt.professional_id, apt.id); return; }
    const gc = await getValidToken(apt.professional_id);
    if (!gc) return;
    if (cancelada) {
      await deleteGCalEvent(gc.token, gc.calendarId, apt.google_event_id);
      await supabase.from('appointments').update({ google_event_id: null }).eq('id', apt.id);
    } else {
      await updateGCalEvent(gc.token, gc.calendarId, apt.google_event_id, appointmentToGCalEvent({ ...apt, time: hm(apt.time) } as any));
    }
  } catch (e) {
    console.error('[center] Google Calendar no se pudo actualizar:', (e as Error)?.message);
  }
}

/** Cita del centro que recepción puede modificar (de un profesional del centro y no de otro centro). */
async function citaEditable(c: Ctx, appointmentId: unknown): Promise<Record<string, any>> {
  exigir(typeof appointmentId === 'string' && UUID.test(appointmentId), 400, 'Cita inválida');
  const { data: apt, error } = await supabase.from('appointments').select('*').eq('id', appointmentId as string).maybeSingle();
  if (error) throw new Fallo(500, 'No se pudo leer la cita');
  exigir(apt, 404, 'La cita ya no existe');
  const ids = await prosDelCentro(c.centerId);
  exigir(ids.includes(apt!.professional_id), 403, 'Esa cita no es de un profesional del centro');
  exigir(!apt!.center_id || apt!.center_id === c.centerId, 403, 'Esa cita pertenece a otro centro');
  return apt!;
}

/** Valida fecha/hora/duración contra horario, pasado y otras citas del profesional. */
async function validarHora(pro: Record<string, any>, fecha: string, hora: string, duracion: number, opts: { ignorarId?: string; fueraHorario?: boolean }): Promise<void> {
  exigir(FECHA.test(fecha) && esHora(hora), 400, 'Fecha u hora inválida');
  const ahora = ahoraChile();
  exigir(fecha > ahora.fecha || (fecha === ahora.fecha && toMinutes(hora) + duracion > ahora.minutos), 400, 'Esa hora ya pasó');
  if (!opts.fueraHorario) {
    const fuera = fueraDeHorario(pro.schedule, fecha, hora, duracion);
    if (fuera) throw new Fallo(409, fuera, { reason: 'FUERA_DE_HORARIO' });
  }
  const { data: delDia, error } = await supabase.from('appointments')
    .select('id, date, time, duration, status').eq('professional_id', pro.id).eq('date', fecha);
  if (error) throw new Fallo(500, 'No se pudo comprobar la disponibilidad');
  const citas = (delDia || []).map(a => ({ id: a.id, date: a.date, time: hm(a.time), duration: a.duration || 60, status: a.status }));
  if (choque(citas, fecha, hora, duracion, opts.ignorarId)) throw new Fallo(409, 'Esa hora ya está tomada. Elige otra.', { reason: 'SLOT_TAKEN' });
}

async function asignacionesDe(centerId: string, desde: string, hasta: string): Promise<Array<ReturnType<typeof aAsignacion>>> {
  const { data, error } = await supabase.from('box_assignments')
    .select('id, box_id, professional_id, date, start_time, end_time, recurrence_id')
    .eq('center_id', centerId).gte('date', desde).lte('date', hasta).order('date').order('start_time');
  if (error) throw new Fallo(500, 'No se pudieron leer los horarios de box');
  return (data || []).map(aAsignacion);
}

// ─────────────────────────────────────────────────────────────────────────
// Acciones
// ─────────────────────────────────────────────────────────────────────────
type Body = Record<string, any>;
type Usuario = { id: string; email?: string };

const acciones: Record<string, (u: Usuario, b: Body) => Promise<unknown>> = {

  // ── Mis centros (también lo usa el login de recepción) ──
  'center-me': async (u) => {
    const { data, error } = await supabase.from('center_members')
      .select('id, role, status, name, professional_id, centers(id, name, city, address, phone, logo_url, owner_id)')
      .eq('user_id', u.id).neq('status', 'disabled');
    if (error) throw new Fallo(500, 'No se pudieron leer tus centros');
    return {
      memberships: (data || []).map((m: any) => ({
        memberId: m.id, role: m.role, status: m.status, name: m.name || '', professionalId: m.professional_id || null,
        center: m.centers ? { id: m.centers.id, name: m.centers.name, city: m.centers.city || '', address: m.centers.address || '',
          phone: m.centers.phone || '', logoUrl: m.centers.logo_url || '', esDueno: m.centers.owner_id === u.id } : null,
      })).filter((m: any) => m.center),
    };
  },

  // ── Crear centro: lo hace un profesional y queda como administrador ──
  'center-create': async (u, b) => {
    const name = txt(b.name, 80);
    exigir(name.length >= 3, 400, 'Escribe el nombre del centro');
    const { data: pro } = await supabase.from('professionals').select('id, name, email').eq('id', u.id).maybeSingle();
    exigir(pro, 403, 'Solo un profesional con cuenta puede crear un centro');
    const { count } = await supabase.from('centers').select('id', { count: 'exact', head: true }).eq('owner_id', u.id);
    exigir((count || 0) < 3, 400, 'Ya administras el máximo de centros (3)');
    const slug = `${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${randomBytes(3).toString('hex')}`;
    const { data: center, error } = await supabase.from('centers')
      .insert({ name, slug, address: txt(b.address), city: txt(b.city, 80), phone: txt(b.phone, 30), owner_id: u.id })
      .select('*').single();
    if (error || !center) throw new Fallo(500, 'No se pudo crear el centro');
    const { error: mErr } = await supabase.from('center_members').insert({
      center_id: center.id, user_id: u.id, role: 'admin', professional_id: pro!.id, status: 'active', name: pro!.name, email: pro!.email,
    });
    if (mErr) { await supabase.from('centers').delete().eq('id', center.id); throw new Fallo(500, 'No se pudo crear el centro'); }
    return { centerId: center.id };
  },

  'center-update': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'centro.editar');
    const name = txt(b.name, 80);
    exigir(name.length >= 3, 400, 'Escribe el nombre del centro');
    const { error } = await supabase.from('centers')
      .update({ name, address: txt(b.address), city: txt(b.city, 80), phone: txt(b.phone, 30) }).eq('id', c.centerId);
    if (error) throw new Fallo(500, 'No se pudo guardar el centro');
    await auditar(c, 'centro.editar', 'center', c.centerId);
    return { ok: true };
  },

  // ── Equipo ──
  'center-members': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'equipo.ver');
    const { data, error } = await supabase.from('center_members')
      .select('id, user_id, role, status, name, email, professional_id, created_at').eq('center_id', c.centerId).order('created_at');
    if (error) throw new Fallo(500, 'No se pudo leer el equipo');
    const proIds = (data || []).map(m => m.professional_id).filter(Boolean) as string[];
    const { data: pros } = proIds.length
      ? await supabase.from('professionals').select('id, name, specialty').in('id', proIds) : { data: [] as any[] };
    const porId = new Map((pros || []).map((p: any) => [p.id, p]));
    return {
      members: (data || []).map(m => ({
        id: m.id, role: m.role, status: m.status, email: m.email || '',
        name: (m.professional_id && porId.get(m.professional_id)?.name) || m.name || '',
        specialty: (m.professional_id && porId.get(m.professional_id)?.specialty) || '',
        professionalId: m.professional_id || null, esDueno: m.user_id === c.center.owner_id, soyYo: m.user_id === u.id,
      })),
    };
  },

  'center-member-add': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'equipo.editar');
    const email = txt(b.email, 120).toLowerCase();
    exigir(EMAIL.test(email), 400, 'El correo no es válido');
    const role = b.role === 'recepcion' ? 'recepcion' : b.role === 'profesional' ? 'profesional' : null;
    exigir(role, 400, 'Rol inválido');

    const { data: pro } = await supabase.from('professionals').select('id, name, email').ilike('email', email).maybeSingle();

    if (role === 'profesional') {
      exigir(pro, 404, 'No hay un profesional registrado con ese correo. Pídele que cree su cuenta y vuelve a invitarlo.');
      const { data: ya } = await supabase.from('center_members').select('id').eq('center_id', c.centerId).eq('user_id', pro!.id).maybeSingle();
      exigir(!ya, 409, 'Esa persona ya está en el equipo');
      const { data: m, error } = await supabase.from('center_members').insert({
        center_id: c.centerId, user_id: pro!.id, role: 'profesional', professional_id: pro!.id, status: 'invited', name: pro!.name, email: pro!.email,
      }).select('id').single();
      if (error) throw new Fallo(500, 'No se pudo enviar la invitación');
      const { error: nErr } = await supabase.from('pro_notifications').insert({
        professional_id: pro!.id, kind: 'center-invite',
        body: `${c.center.name} te invitó a su equipo. Acepta en Ajustes para que su recepción gestione tu agenda.`,
      });
      if (nErr) console.error('[center] aviso de invitación no se guardó:', nErr.message);
      await auditar(c, 'equipo.invitar', 'member', m!.id, { email, role });
      return { ok: true, status: 'invited' };
    }

    // Recepción: cuenta propia, sin perfil profesional ni acceso a fichas.
    exigir(!pro, 409, 'Ese correo ya es de un profesional. Invítalo como profesional o usa otro correo para recepción.');
    const name = txt(b.name, 80);
    exigir(name.length >= 2, 400, 'Escribe el nombre de la persona');
    let userId: string | null = null;
    let claveTemporal: string | null = null;
    const { data: existente } = await supabase.from('center_members').select('user_id').ilike('email', email).eq('role', 'recepcion').limit(1).maybeSingle();
    if (existente) {
      userId = existente.user_id;
    } else {
      claveTemporal = `${randomBytes(4).toString('hex')}-${randomBytes(3).toString('hex')}A1`;
      const { data: creado, error: cErr } = await supabase.auth.admin.createUser({
        email, password: claveTemporal, email_confirm: true, user_metadata: { name, role: 'recepcion' },
      });
      if (cErr || !creado?.user) {
        console.error('[center] createUser recepción:', cErr?.message);
        throw new Fallo(409, 'No se pudo crear la cuenta: ese correo ya está en uso. Prueba con otro correo.');
      }
      userId = creado.user.id;
    }
    const { data: ya } = await supabase.from('center_members').select('id').eq('center_id', c.centerId).eq('user_id', userId!).maybeSingle();
    exigir(!ya, 409, 'Esa persona ya está en el equipo');
    const { data: m, error } = await supabase.from('center_members')
      .insert({ center_id: c.centerId, user_id: userId, role: 'recepcion', status: 'active', name, email }).select('id').single();
    if (error) throw new Fallo(500, 'No se pudo agregar a la persona');
    await auditar(c, 'equipo.agregar', 'member', m!.id, { email, role });
    // La clave se muestra UNA vez a quien administra; no se guarda en ningún lado.
    return { ok: true, status: 'active', claveTemporal };
  },

  // El profesional acepta o rechaza la invitación (sin aceptar, recepción no ve nada suyo).
  'center-member-respond': async (u, b) => {
    exigir(typeof b.centerId === 'string' && UUID.test(b.centerId), 400, 'Centro inválido');
    const { data: m } = await supabase.from('center_members').select('id, status').eq('center_id', b.centerId).eq('user_id', u.id).maybeSingle();
    exigir(m && m.status === 'invited', 404, 'No tienes una invitación pendiente de ese centro');
    const { error } = b.accept
      ? await supabase.from('center_members').update({ status: 'active' }).eq('id', m!.id)
      : await supabase.from('center_members').delete().eq('id', m!.id);
    if (error) throw new Fallo(500, 'No se pudo guardar tu respuesta');
    await supabase.from('center_audit').insert({ center_id: b.centerId, actor_id: u.id, actor_role: 'profesional', action: b.accept ? 'equipo.aceptar' : 'equipo.rechazar', entity: 'member', entity_id: m!.id });
    return { ok: true };
  },

  // Quitar a alguien (admin) o salir del centro (uno mismo). El dueño no se puede quitar.
  'center-member-remove': async (u, b) => {
    exigir(typeof b.centerId === 'string' && UUID.test(b.centerId) && typeof b.memberId === 'string' && UUID.test(b.memberId), 400, 'Datos inválidos');
    const { data: m } = await supabase.from('center_members').select('id, user_id, center_id, centers(owner_id)').eq('id', b.memberId).eq('center_id', b.centerId).maybeSingle();
    exigir(m, 404, 'Esa persona ya no está en el equipo');
    exigir(m!.user_id !== (m as any).centers?.owner_id, 400, 'El dueño del centro no se puede quitar');
    let c: Ctx | null = null;
    if (m!.user_id !== u.id) c = await contexto(u.id, u.email, b.centerId, 'equipo.editar');
    const { error } = await supabase.from('center_members').delete().eq('id', m!.id);
    if (error) throw new Fallo(500, 'No se pudo quitar a la persona');
    if (c) await auditar(c, 'equipo.quitar', 'member', m!.id);
    return { ok: true };
  },

  // ── Boxes ──
  'center-box-save': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'boxes.editar');
    const name = txt(b.name, 40);
    exigir(name.length >= 1, 400, 'Escribe el nombre del box');
    const fila = { name, color: txt(b.color, 20) || null, active: b.active !== false, sort: Number.isFinite(+b.sort) ? Math.round(+b.sort) : 0 };
    if (b.id) {
      exigir(UUID.test(String(b.id)), 400, 'Box inválido');
      const { error } = await supabase.from('boxes').update(fila).eq('id', b.id).eq('center_id', c.centerId);
      if (error) throw new Fallo(500, 'No se pudo guardar el box');
      await auditar(c, 'box.editar', 'box', b.id, fila);
      return { id: b.id };
    }
    const { count } = await supabase.from('boxes').select('id', { count: 'exact', head: true }).eq('center_id', c.centerId);
    exigir((count || 0) < 50, 400, 'Llegaste al máximo de boxes (50)');
    const { data, error } = await supabase.from('boxes').insert({ ...fila, center_id: c.centerId }).select('id').single();
    if (error || !data) throw new Fallo(500, 'No se pudo crear el box');
    await auditar(c, 'box.crear', 'box', data.id, fila);
    return { id: data.id };
  },

  'center-box-delete': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'boxes.editar');
    exigir(UUID.test(String(b.id)), 400, 'Box inválido');
    const hoy = ahoraChile().fecha;
    const { count } = await supabase.from('box_assignments').select('id', { count: 'exact', head: true }).eq('box_id', b.id).gte('date', hoy);
    exigir(!count, 409, 'Ese box tiene horarios asignados desde hoy. Quítalos primero o desactiva el box.');
    const { error } = await supabase.from('boxes').delete().eq('id', b.id).eq('center_id', c.centerId);
    if (error) throw new Fallo(500, 'No se pudo eliminar el box');
    await auditar(c, 'box.eliminar', 'box', b.id);
    return { ok: true };
  },

  // Asignar horario de box a un profesional (con repetición semanal opcional). Todo o nada.
  'center-assign-save': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'boxes.editar');
    const professionalId = await exigirProDelCentro(c.centerId, b.professionalId);
    exigir(UUID.test(String(b.boxId)), 400, 'Box inválido');
    const { data: box } = await supabase.from('boxes').select('id, active').eq('id', b.boxId).eq('center_id', c.centerId).maybeSingle();
    exigir(box, 404, 'Ese box no existe');
    exigir(box!.active, 409, 'Ese box está desactivado');
    const date = String(b.date || ''), start = String(b.start || ''), end = String(b.end || '');
    exigir(FECHA.test(date) && esHora(start) && esHora(end) && toMinutes(end) > toMinutes(start), 400, 'Revisa la fecha y el horario');
    const fechas = fechasSemanales(date, Number(b.weeks) || 1);
    const existentes = await asignacionesDe(c.centerId, fechas[0], fechas[fechas.length - 1]);
    const conflictos: Array<{ date: string; tipo: string }> = [];
    for (const f of fechas) {
      const ch = choqueAsignacion(existentes, { boxId: b.boxId, professionalId, date: f, start, end });
      if (ch) conflictos.push({ date: f, tipo: ch.tipo });
    }
    if (conflictos.length) {
      const x = conflictos[0];
      throw new Fallo(409, x.tipo === 'box'
        ? `El box ya está ocupado a esa hora el ${x.date}${conflictos.length > 1 ? ` y en ${conflictos.length - 1} fecha(s) más` : ''}.`
        : `El profesional ya tiene otro box a esa hora el ${x.date}${conflictos.length > 1 ? ` y en ${conflictos.length - 1} fecha(s) más` : ''}.`,
        { reason: 'BOX_TAKEN', conflictos });
    }
    const recurrenceId = fechas.length > 1 ? randomUUID() : null;
    const filas = fechas.map(f => ({
      center_id: c.centerId, box_id: b.boxId, professional_id: professionalId, date: f, start_time: start, end_time: end,
      recurrence_id: recurrenceId, created_by: u.id,
    }));
    const { error } = await supabase.from('box_assignments').insert(filas);
    if (error) {
      // 23P01: la restricción de la BD detectó un choque que entró entre la revisión y el guardado.
      if (error.code === '23P01') throw new Fallo(409, 'Ese horario se acaba de ocupar. Actualiza y prueba de nuevo.', { reason: 'BOX_TAKEN' });
      throw new Fallo(500, 'No se pudo guardar el horario del box');
    }
    await auditar(c, 'box.asignar', 'box', b.boxId, { professionalId, date, start, end, semanas: fechas.length });
    return { ok: true, creadas: filas.length };
  },

  'center-assign-delete': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'boxes.editar');
    exigir(UUID.test(String(b.id)), 400, 'Horario inválido');
    const { data: a } = await supabase.from('box_assignments').select('id, date, recurrence_id').eq('id', b.id).eq('center_id', c.centerId).maybeSingle();
    exigir(a, 404, 'Ese horario ya no existe');
    const q = supabase.from('box_assignments').delete().eq('center_id', c.centerId);
    const { error } = b.scope === 'future' && a!.recurrence_id
      ? await q.eq('recurrence_id', a!.recurrence_id).gte('date', a!.date)
      : await q.eq('id', a!.id);
    if (error) throw new Fallo(500, 'No se pudo quitar el horario');
    await auditar(c, 'box.quitar', 'assignment', a!.id, { scope: b.scope === 'future' ? 'future' : 'one', date: a!.date });
    return { ok: true };
  },

  // ── Agenda del centro: profesionales, boxes, asignaciones y citas de un rango ──
  'center-range': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'agenda.ver');
    const from = String(b.from || ''), to = String(b.to || '');
    exigir(FECHA.test(from) && FECHA.test(to) && to >= from && to <= sumarDias(from, 45), 400, 'Rango de fechas inválido');
    const ids = await prosDelCentro(c.centerId);
    const [pros, boxes, asignaciones, citas] = await Promise.all([
      ids.length ? supabase.from('professionals').select('id, name, specialty, schedule, working_hours, services').in('id', ids) : Promise.resolve({ data: [], error: null } as any),
      supabase.from('boxes').select('id, name, color, active, sort').eq('center_id', c.centerId).order('sort').order('name'),
      asignacionesDe(c.centerId, from, to),
      ids.length ? supabase.from('appointments').select(CITA_RECEPCION).in('professional_id', ids).gte('date', from).lte('date', to).neq('status', 'Cancelado') : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (pros.error || boxes.error || citas.error) throw new Fallo(500, 'No se pudo cargar la agenda del centro');
    return {
      center: { id: c.centerId, name: c.center.name, address: c.center.address || '', city: c.center.city || '', phone: c.center.phone || '' },
      rol: c.rol,
      ahora: ahoraChile(),
      professionals: ((pros.data || []) as any[]).map(p => ({
        id: p.id, name: p.name || '', specialty: p.specialty || '', schedule: p.schedule || null, workingHours: p.working_hours || null,
        services: Array.isArray(p.services) ? p.services.map((s: any) => ({ name: String(s?.name || ''), price: Number(s?.price) || 0, duration: Number(s?.duration) || 60 })).filter((s: any) => s.name) : [],
      })).sort((a, z) => a.name.localeCompare(z.name, 'es')),
      boxes: ((boxes.data || []) as any[]).map(x => ({ id: x.id, name: x.name, color: x.color || '', active: x.active, sort: x.sort })),
      assignments: asignaciones,
      appointments: ((citas.data || []) as any[]).map(r => aCita(r, c.centerId)),
    };
  },

  // Búsqueda de pacientes: SOLO contacto, entre los pacientes de los profesionales del centro.
  'center-patient-search': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'pacientes.buscar');
    const q = txt(b.q, 60).replace(/[,()%*\\]/g, ' ').trim();
    exigir(q.length >= 2, 400, 'Escribe al menos 2 letras');
    const ids = await prosDelCentro(c.centerId);
    if (!ids.length) return { patients: [] };
    const { data, error } = await supabase.from('patients').select(PACIENTE_CONTACTO)
      .in('professional_id', ids).is('deleted_at', null)
      .or(`name.ilike.%${q}%,rut.ilike.%${q}%,phone.ilike.%${q}%`).order('name').limit(20);
    if (error) throw new Fallo(500, 'No se pudo buscar');
    return { patients: ((data || []) as any[]).map(p => ({ id: p.id, name: p.name || '', rut: p.rut || '', phone: p.phone || '', email: p.email || '', prevision: p.prevision || '', professionalId: p.professional_id })) };
  },

  // ── Agendar desde recepción ──
  'center-book': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'agenda.editar');
    const professionalId = await exigirProDelCentro(c.centerId, b.professionalId);
    const { data: pro } = await supabase.from('professionals').select('id, name, email, specialty, schedule, services').eq('id', professionalId).maybeSingle();
    exigir(pro, 404, 'Profesional no encontrado');

    // Precio y duración salen del servicio del profesional; nunca del navegador (regla 3).
    const serviceName = txt(b.serviceName, 120) || 'Consulta';
    const servicio = servicioDelPro(pro!.services, serviceName);
    const duration = servicio ? servicio.duration : Math.min(240, Math.max(15, Math.round(Number(b.duration) || 60)));
    const price = servicio ? servicio.price : 0;
    const date = String(b.date || ''), time = String(b.time || '');
    await validarHora(pro!, date, time, duration, { fueraHorario: b.fueraHorario === true });

    // Paciente: existente (del mismo profesional), o se crea solo con datos de contacto.
    const p = b.patient || {};
    let pac: Record<string, any> | null = null;
    if (p.id) {
      exigir(UUID.test(String(p.id)), 400, 'Paciente inválido');
      const ids = await prosDelCentro(c.centerId);
      const { data: origen } = await supabase.from('patients').select(PACIENTE_CONTACTO).eq('id', p.id).is('deleted_at', null).maybeSingle();
      exigir(origen && ids.includes((origen as any).professional_id), 404, 'Paciente no encontrado en el centro');
      pac = origen as any;
    } else {
      const name = txt(p.name, 120);
      exigir(name.length >= 3, 400, 'Escribe el nombre del paciente');
      const email = txt(p.email, 120).toLowerCase();
      exigir(!email || EMAIL.test(email), 400, 'El correo del paciente no es válido');
      pac = { id: null, name, rut: txt(p.rut, 20), phone: txt(p.phone, 30), email, prevision: txt(p.prevision, 40), professional_id: null };
    }
    // La ficha es por profesional: si el paciente aún no existe para ESTE profesional, se crea con contacto.
    let patientId: string | null = pac!.professional_id === professionalId ? pac!.id : null;
    if (!patientId && pac!.rut) {
      const { data: mismoRut } = await supabase.from('patients').select('id').eq('professional_id', professionalId).eq('rut', pac!.rut).is('deleted_at', null).maybeSingle();
      if (mismoRut) patientId = mismoRut.id;
    }
    if (!patientId) {
      const { data: nuevo, error: pErr } = await supabase.from('patients').insert({
        professional_id: professionalId, name: pac!.name, rut: pac!.rut || null, phone: pac!.phone || null, email: pac!.email || null,
        prevision: pac!.prevision || null, status: 'Nuevo', risk: 'Bajo', archived: false,
      }).select('id').single();
      if (pErr || !nuevo) { console.error('[center] crear paciente:', pErr?.message); throw new Fallo(500, 'No se pudo crear al paciente'); }
      patientId = nuevo.id;
    }

    const asignaciones = await asignacionesDe(c.centerId, date, date);
    const fila = {
      id: randomUUID(), professional_id: professionalId, patient_id: patientId,
      patient_name: pac!.name, patient_phone: pac!.phone || null, patient_email: pac!.email || null, patient_rut: pac!.rut || null,
      doctor_name: pro!.name || '', specialty: pro!.specialty || '', service_name: serviceName,
      date, time, duration, type: 'Presencial', status: 'Confirmado', price, payment_status: 'Pendiente',
      color: 'bg-primary', category: 'Medical',
      booking_source: 'presencial',   // nunca 'web': releaseStaleHolds borraría la cita (regla 5)
      center_id: c.centerId, box_id: boxParaCita(asignaciones, professionalId, date, time, duration), created_by: u.id,
    };
    const { error } = await supabase.from('appointments').insert(fila);
    if (error) {
      if (error.code === '23505') throw new Fallo(409, 'Esa hora se acaba de tomar. Elige otra.', { reason: 'SLOT_TAKEN' });
      console.error('[center] insertar cita:', error.message);
      throw new Fallo(500, 'No se pudo guardar la cita');
    }
    await auditar(c, 'cita.crear', 'appointment', fila.id, { professionalId, date, time, serviceName });
    await Promise.all([
      notificarCitaEnPanel(fila, false),
      syncAppointmentToGoogle(professionalId, fila.id),
      avisarPorCorreo(fila, pro!),
    ]);
    return { appointment: aCita(fila, c.centerId) };
  },

  'center-reschedule': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'agenda.editar');
    const apt = await citaEditable(c, b.appointmentId);
    exigir(apt.status !== 'Bloqueado' && apt.status !== 'Cancelado' && apt.status !== 'Finalizado', 409, 'Esa cita no se puede reagendar');
    const { data: pro } = await supabase.from('professionals').select('id, name, email, schedule').eq('id', apt.professional_id).maybeSingle();
    exigir(pro, 404, 'Profesional no encontrado');
    const date = String(b.date || ''), time = String(b.time || ''), duration = apt.duration || 60;
    await validarHora(pro!, date, time, duration, { ignorarId: apt.id, fueraHorario: b.fueraHorario === true });
    const asignaciones = await asignacionesDe(c.centerId, date, date);
    const cambios = { date, time, box_id: boxParaCita(asignaciones, apt.professional_id, date, time, duration), center_id: c.centerId };
    const { error } = await supabase.from('appointments').update(cambios).eq('id', apt.id);
    if (error) {
      if (error.code === '23505') throw new Fallo(409, 'Esa hora se acaba de tomar. Elige otra.', { reason: 'SLOT_TAKEN' });
      throw new Fallo(500, 'No se pudo reagendar la cita');
    }
    const nueva = { ...apt, ...cambios };
    await auditar(c, 'cita.reagendar', 'appointment', apt.id, { de: `${apt.date} ${hm(apt.time)}`, a: `${date} ${time}` });
    await Promise.all([
      sincronizarGoogle(nueva, false),
      avisarPorCorreo(nueva, pro!, { kind: 'reagendada', previousDate: apt.date, previousTime: hm(apt.time) }),
    ]);
    return { appointment: aCita(nueva, c.centerId) };
  },

  // Liberar la hora: la cita queda como Cancelada (no se borra) y el horario vuelve a estar disponible.
  'center-cancel': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'agenda.editar');
    const apt = await citaEditable(c, b.appointmentId);
    exigir(apt.status !== 'Bloqueado', 409, 'Los bloqueos de horario los administra el profesional');
    exigir(apt.status !== 'Cancelado', 409, 'Esa cita ya estaba cancelada');
    const { error } = await supabase.from('appointments').update({ status: 'Cancelado', center_id: c.centerId }).eq('id', apt.id);
    if (error) throw new Fallo(500, 'No se pudo cancelar la cita');
    const { data: pro } = await supabase.from('professionals').select('id, name, email').eq('id', apt.professional_id).maybeSingle();
    await auditar(c, 'cita.cancelar', 'appointment', apt.id, { date: apt.date, time: hm(apt.time), motivo: txt(b.reason, 200) || null });
    await Promise.all([
      sincronizarGoogle(apt, true),
      b.notify === false ? Promise.resolve() : avisarPorCorreo(apt, pro || {}, { kind: 'cancelada' }),
    ]);
    return { ok: true };
  },

  // Recepcionar al paciente: llegó / volver a confirmado.
  'center-status': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'agenda.editar');
    const apt = await citaEditable(c, b.appointmentId);
    const status = b.status === 'Llegado' ? 'Llegado' : b.status === 'Confirmado' ? 'Confirmado' : null;
    exigir(status, 400, 'Estado inválido');
    exigir(['Confirmado', 'Pendiente', 'Llegado'].includes(apt.status), 409, 'El estado de esa cita ya no se puede cambiar desde recepción');
    const { error } = await supabase.from('appointments').update({ status, center_id: c.centerId }).eq('id', apt.id);
    if (error) throw new Fallo(500, 'No se pudo cambiar el estado');
    await auditar(c, 'cita.estado', 'appointment', apt.id, { de: apt.status, a: status });
    return { ok: true };
  },

  // ── Caja: cobrar una cita en recepción ──
  // El monto por defecto es el precio guardado en la cita; uno distinto exige nota.
  'center-payment': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'caja.cobrar');
    const apt = await citaEditable(c, b.appointmentId);
    exigir(apt.status !== 'Bloqueado' && apt.status !== 'Cancelado', 409, 'Esa cita no admite pagos');
    // Compatibilidad: { paid: false } = anular el cobro vigente.
    if (b.paid === false) return acciones['center-payment-void'](u, { ...b, reason: txt(b.reason, 200) || 'Pago desmarcado' });
    exigir(apt.payment_status !== 'Pagado', 409, 'Esa cita ya está pagada');
    const method = esMedioPago(b.method) ? b.method : 'efectivo';
    const note = txt(b.note, 300);
    const r = montoCobro(apt.price || 0, b.amount, note);
    if ('error' in r) throw new Fallo(400, r.error);
    const fecha = fechaChile(new Date());
    const { data: cierre } = await supabase.from('center_cash_closings').select('id').eq('center_id', c.centerId).eq('date', fecha).maybeSingle();
    const { data: pago, error } = await supabase.from('center_payments').insert({
      center_id: c.centerId, appointment_id: apt.id, professional_id: apt.professional_id, patient_id: apt.patient_id || null,
      amount: r.monto, method, reference: txt(b.reference, 80) || null, note: note || null, received_by: u.id, after_close: !!cierre,
    }).select('id, created_at').single();
    if (error || !pago) {
      if (error?.code === '23505') throw new Fallo(409, 'Esa cita ya tiene un cobro registrado. Actualiza la caja.');
      console.error('[center] cobro:', error?.message);
      throw new Fallo(500, 'No se pudo registrar el cobro');
    }
    const { error: aErr } = await supabase.from('appointments')
      .update({ payment_status: 'Pagado', paid_at: pago.created_at, payment_amount: r.monto, center_id: c.centerId }).eq('id', apt.id);
    if (aErr) {
      // Sin la cita marcada, el cobro quedaría huérfano: se anula y se avisa.
      await supabase.from('center_payments').update({ voided_at: new Date().toISOString(), voided_by: u.id, void_reason: 'Error al marcar la cita' }).eq('id', pago.id);
      throw new Fallo(500, 'No se pudo registrar el cobro');
    }
    await auditar(c, 'caja.cobrar', 'payment', pago.id, { cita: apt.id, monto: r.monto, medio: method, despuesDelCierre: !!cierre });
    if (b.sendReceipt === true && apt.patient_email) {
      const { data: pro } = await supabase.from('professionals').select('email, name').eq('id', apt.professional_id).maybeSingle();
      await avisarPorCorreo(apt, pro || {}, { isReceipt: true, price: r.monto, transactionRef: `${NOMBRE_MEDIO[method as MedioPago]} · ${c.center.name}` });
    }
    return { ok: true, paymentId: pago.id, amount: r.monto, afterClose: !!cierre };
  },

  // Anular un cobro: no se borra, queda con motivo. La cita vuelve a "por cobrar".
  'center-payment-void': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'caja.anular');
    const reason = txt(b.reason, 200);
    exigir(reason.length >= 3, 400, 'Escribe el motivo de la anulación');
    let q = supabase.from('center_payments').select('*').eq('center_id', c.centerId).is('voided_at', null);
    q = b.paymentId ? q.eq('id', String(b.paymentId)) : q.eq('appointment_id', String(b.appointmentId || ''));
    const { data: pago } = await q.maybeSingle();
    if (!pago) {
      // Pago marcado sin cobro de caja (en línea o anterior a la caja).
      const apt = await citaEditable(c, b.appointmentId);
      exigir(!(apt.mp_preference_id && apt.payment_status === 'Pagado'), 409, 'Ese pago se hizo en línea y no se puede anular aquí');
      exigir(apt.payment_status === 'Pagado', 404, 'Esa cita no tiene un cobro vigente');
      const { error } = await supabase.from('appointments').update({ payment_status: 'Pendiente', paid_at: null, payment_amount: null }).eq('id', apt.id);
      if (error) throw new Fallo(500, 'No se pudo anular el pago');
      await auditar(c, 'caja.anular', 'appointment', apt.id, { motivo: reason, sinCobro: true });
      return { ok: true };
    }
    const fechaCobro = fechaChile(new Date(pago.created_at));
    if (c.rol !== 'admin') {
      const { data: cierre } = await supabase.from('center_cash_closings').select('id').eq('center_id', c.centerId).eq('date', fechaCobro).maybeSingle();
      exigir(!cierre, 403, 'La caja de ese día ya se cerró. Solo administración puede anular este cobro.');
    }
    const { error } = await supabase.from('center_payments')
      .update({ voided_at: new Date().toISOString(), voided_by: u.id, void_reason: reason }).eq('id', pago.id).is('voided_at', null);
    if (error) throw new Fallo(500, 'No se pudo anular el cobro');
    const { error: aErr } = await supabase.from('appointments').update({ payment_status: 'Pendiente', paid_at: null, payment_amount: null }).eq('id', pago.appointment_id);
    if (aErr) console.error('[center] anular: la cita no volvió a pendiente:', aErr.message);
    await auditar(c, 'caja.anular', 'payment', pago.id, { motivo: reason, monto: pago.amount, fecha: fechaCobro });
    return { ok: true };
  },

  // Caja de un día: cobros, citas por cobrar, pagos en línea, resumen y cierre.
  'center-cashbox': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'caja.ver');
    const fecha = String(b.date || '');
    exigir(/^\d{4}-\d{2}-\d{2}$/.test(fecha), 400, 'Fecha inválida');
    const ids = await prosDelCentro(c.centerId);
    // Margen de ±1 día en UTC y filtro exacto por fecha de Chile (cubre el cambio de horario).
    const [pagos, citas, cierre, pros] = await Promise.all([
      supabase.from('center_payments').select('*').eq('center_id', c.centerId)
        .gte('created_at', `${sumarDias(fecha, -1)}T00:00:00Z`).lt('created_at', `${sumarDias(fecha, 2)}T00:00:00Z`).order('created_at'),
      ids.length ? supabase.from('appointments').select(CITA_RECEPCION + ', mp_preference_id').in('professional_id', ids).eq('date', fecha)
        .neq('status', 'Cancelado').neq('status', 'Bloqueado') : Promise.resolve({ data: [], error: null } as any),
      supabase.from('center_cash_closings').select('*').eq('center_id', c.centerId).eq('date', fecha).maybeSingle(),
      ids.length ? supabase.from('professionals').select('id, name').in('id', ids) : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (pagos.error || citas.error) throw new Fallo(500, 'No se pudo cargar la caja');
    const delDia = (pagos.data || []).filter((p: any) => fechaChile(new Date(p.created_at)) === fecha);
    const citasPorId = new Map(((citas.data || []) as any[]).map(a => [a.id, a]));
    // Citas de cobros de otros días (abonos de citas futuras): se buscan aparte.
    const faltan = delDia.map((p: any) => p.appointment_id).filter((id: string) => !citasPorId.has(id));
    if (faltan.length) {
      const { data: extra } = await supabase.from('appointments').select(CITA_RECEPCION).in('id', faltan);
      for (const a of (extra || []) as any[]) citasPorId.set(a.id, a);
    }
    const quien = [...new Set(delDia.flatMap((p: any) => [p.received_by, p.voided_by]).filter(Boolean))] as string[];
    const { data: personas } = quien.length
      ? await supabase.from('center_members').select('user_id, name, email').eq('center_id', c.centerId).in('user_id', quien) : { data: [] as any[] };
    const nombreDe = new Map((personas || []).map((m: any) => [m.user_id, m.name || m.email || '']));
    const nombrePro = new Map(((pros.data || []) as any[]).map(p => [p.id, p.name || '']));
    const cobros = delDia.map((p: any) => {
      const a = citasPorId.get(p.appointment_id) || {};
      return {
        id: p.id, appointmentId: p.appointment_id, professionalId: p.professional_id, professionalName: nombrePro.get(p.professional_id) || '',
        patientName: a.patient_name || '', serviceName: a.service_name || '', citaFecha: a.date || null, citaHora: hm(a.time),
        amount: p.amount, method: p.method, reference: p.reference || '', note: p.note || '', createdAt: p.created_at,
        receivedBy: nombreDe.get(p.received_by) || '', afterClose: p.after_close,
        voidedAt: p.voided_at, voidReason: p.void_reason || '', voidedBy: p.voided_by ? nombreDe.get(p.voided_by) || '' : '',
      };
    });
    const conCobroVigente = new Set(cobros.filter(x => !x.voidedAt).map(x => x.appointmentId));
    const delDiaCitas = ((citas.data || []) as any[]);
    const porCobrar = delDiaCitas
      .filter(a => a.payment_status !== 'Pagado' && ESTADOS_COBRABLES.includes(a.status) && !conCobroVigente.has(a.id))
      .map(a => ({ ...aCita(a, c.centerId), professionalName: nombrePro.get(a.professional_id) || '' }))
      .sort((x, y) => x.time.localeCompare(y.time));
    const enLinea = delDiaCitas
      .filter(a => a.payment_status === 'Pagado' && a.mp_preference_id)
      .map(a => ({ ...aCita(a, c.centerId), professionalName: nombrePro.get(a.professional_id) || '' }));
    return {
      date: fecha, rol: c.rol, center: { id: c.centerId, name: c.center.name, address: c.center.address || '', city: c.center.city || '', phone: c.center.phone || '' },
      cobros, porCobrar, enLinea,
      resumen: resumenCaja(cobros.map(x => ({ id: x.id, amount: x.amount, method: x.method, professionalId: x.professionalId, voidedAt: x.voidedAt }))),
      profesionales: Object.fromEntries(nombrePro),
      cierre: cierre.data ? {
        expected: cierre.data.expected, countedCash: cierre.data.counted_cash, difference: cierre.data.difference,
        note: cierre.data.note || '', closedAt: cierre.data.closed_at, closedBy: nombreDe.get(cierre.data.closed_by) || '',
      } : null,
    };
  },

  // Cierre de caja: efectivo contado vs. esperado. Se puede volver a cerrar (queda auditado).
  'center-cash-close': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'caja.cerrar');
    const fecha = String(b.date || '');
    exigir(/^\d{4}-\d{2}-\d{2}$/.test(fecha), 400, 'Fecha inválida');
    exigir(fecha <= fechaChile(new Date()), 400, 'No se puede cerrar una caja de un día futuro');
    const contado = Math.round(Number(b.countedCash));
    exigir(Number.isFinite(contado) && contado >= 0, 400, 'Escribe el efectivo contado');
    const { data: pagos, error } = await supabase.from('center_payments').select('id, amount, method, professional_id, voided_at, created_at')
      .eq('center_id', c.centerId).gte('created_at', `${sumarDias(fecha, -1)}T00:00:00Z`).lt('created_at', `${sumarDias(fecha, 2)}T00:00:00Z`);
    if (error) throw new Fallo(500, 'No se pudo calcular la caja');
    const r = resumenCaja((pagos || []).filter((p: any) => fechaChile(new Date(p.created_at)) === fecha)
      .map((p: any) => ({ id: p.id, amount: p.amount, method: p.method, professionalId: p.professional_id, voidedAt: p.voided_at })));
    const fila = {
      center_id: c.centerId, date: fecha, expected: { ...r.porMedio, total: r.total, cobros: r.cobros },
      counted_cash: contado, difference: diferenciaCierre(r.porMedio.efectivo, contado), note: txt(b.note, 300) || null,
      closed_by: u.id, closed_at: new Date().toISOString(),
    };
    const { error: cErr } = await supabase.from('center_cash_closings').upsert(fila, { onConflict: 'center_id,date' });
    if (cErr) throw new Fallo(500, 'No se pudo guardar el cierre');
    await auditar(c, 'caja.cerrar', 'cash', null, { fecha, esperado: r.porMedio.efectivo, contado, diferencia: fila.difference });
    return { ok: true, difference: fila.difference };
  },

  // ── Reporte: horas de box asignadas por profesional ──
  'center-report': async (u, b) => {
    const c = await contexto(u.id, u.email, b.centerId, 'reporte.ver');
    const from = String(b.from || ''), to = String(b.to || '');
    exigir(FECHA.test(from) && FECHA.test(to) && to >= from && to <= sumarDias(from, 400), 400, 'Rango de fechas inválido');
    const asignaciones = await asignacionesDe(c.centerId, from, to);
    const horas = horasDeBox(asignaciones, from, to);
    const ids = horas.map(h => h.professionalId);
    const { data: pros } = ids.length ? await supabase.from('professionals').select('id, name, specialty').in('id', ids) : { data: [] as any[] };
    const porId = new Map((pros || []).map((p: any) => [p.id, p]));
    return {
      from, to,
      rows: horas.map(h => ({ ...h, name: porId.get(h.professionalId)?.name || 'Profesional', specialty: porId.get(h.professionalId)?.specialty || '' })),
    };
  },
};

export function esAccionDeCentro(action: unknown): boolean {
  return typeof action === 'string' && Object.prototype.hasOwnProperty.call(acciones, action);
}

export async function handleCenter(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Recepción refresca la agenda y trabaja desde una misma IP: límite propio y amplio.
  if (!checkIpRateLimit(req.headers, 300, 60 * 1000, 'center:')) { res.status(429).json({ error: 'Demasiadas solicitudes. Espera un momento.' }); return; }
  const user = await requireSupabaseAuth(req, res);
  if (!user) return;
  const body = (req.body || {}) as Body;
  try {
    const data = await acciones[body.action](user, body);
    res.status(200).json(data);
  } catch (e) {
    if (e instanceof Fallo) { res.status(e.code).json({ error: e.message, ...(e.extra || {}) }); return; }
    console.error('[center]', body.action, (e as Error)?.message);
    res.status(500).json({ error: 'Ocurrió un error. Intenta de nuevo.' });
  }
}
