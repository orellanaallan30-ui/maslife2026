import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export interface BookingInput {
  professionalId: string;
  patientName: string;
  patientPhone?: string;
  patientEmail?: string;
  serviceName: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM
  notes?: string;
  modality?: 'Presencial' | 'Online' | 'Domicilio';
}

export interface PreparedBooking {
  pro: {
    id: string; name: string; specialty: string; email: string;
    paymentEnabled: boolean;
  };
  service: { name: string; price: number; duration: number };
  /** Monto que el paciente DEBE pagar según la config del profesional (0 = reserva gratis) */
  amountDue: number;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  code?: number;
  prepared?: PreparedBooking;
}

export interface InsertResult {
  ok: boolean;
  id?: string;
  error?: string;
  code?: number;
}

/**
 * Valida los datos de la reserva contra la base de datos y calcula el monto
 * real a cobrar en el SERVIDOR (nunca confiar en el monto del cliente).
 */
export async function validateBooking(input: Partial<BookingInput>): Promise<ValidationResult> {
  const { professionalId, patientName, serviceName, date, time } = input || {};

  if (!professionalId || !UUID_RE.test(String(professionalId))) {
    return { ok: false, error: 'professional_id inválido', code: 400 };
  }
  if (!patientName || String(patientName).trim().length < 2 || String(patientName).length > 120) {
    return { ok: false, error: 'Nombre de paciente inválido', code: 400 };
  }
  if (!serviceName || !date || !time || !DATE_RE.test(String(date)) || !TIME_RE.test(String(time))) {
    return { ok: false, error: 'Fecha, hora o servicio inválidos', code: 400 };
  }
  const today = new Date().toISOString().split('T')[0];
  if (String(date) < today) {
    return { ok: false, error: 'No se puede reservar en el pasado', code: 400 };
  }

  const { data: pro } = await supabase
    .from('professionals')
    .select('id, name, specialty, email, services, is_public, is_approved, payment_enabled, booking_fee, charge_full_service, subscription_exempt, paused_at, subscription_status, trial_end_date')
    .eq('id', professionalId)
    .single();

  if (!pro || !pro.is_approved) {
    return { ok: false, error: 'Profesional no encontrado o no disponible', code: 404 };
  }

  // Subscription enforcement with 5-day grace period (skipped if exempt)
  if (!pro.subscription_exempt) {
    const GRACE_DAYS = 5;
    const now = Date.now();

    // Check paused subscription grace period
    if (pro.paused_at) {
      const graceCutoff = new Date(pro.paused_at).getTime() + GRACE_DAYS * 86400000;
      if (now > graceCutoff) {
        // Grace expired — lazily hide profile and block booking
        await supabase.from('professionals').update({ is_public: false }).eq('id', pro.id);
        return { ok: false, error: 'El profesional no está disponible en este momento', code: 403 };
      }
    }

    // Check trial expiry grace period
    if (pro.subscription_status === 'trial' && pro.trial_end_date) {
      const trialEnd = new Date(pro.trial_end_date).getTime();
      if (now > trialEnd + GRACE_DAYS * 86400000) {
        await supabase.from('professionals').update({ is_public: false }).eq('id', pro.id);
        return { ok: false, error: 'El profesional no está disponible en este momento', code: 403 };
      }
    }
  }

  const services = (pro.services as Array<{ name: string; price: number; duration: number }>) || [];
  const service = services.find(s => s.name === serviceName);
  if (!service) {
    return { ok: false, error: 'Servicio no encontrado para este profesional', code: 400 };
  }

  const amountDue = !pro.payment_enabled
    ? 0
    : pro.charge_full_service
      ? Number(service.price) || 0
      : Number(pro.booking_fee) || 5000;

  return {
    ok: true,
    prepared: {
      pro: {
        id: pro.id, name: pro.name, specialty: pro.specialty || '',
        email: pro.email || '', paymentEnabled: !!pro.payment_enabled,
      },
      service: {
        name: service.name,
        price: Number(service.price) || 0,
        duration: Number(service.duration) || 60,
      },
      amountDue,
    },
  };
}

/**
 * Inserta la cita con service_role. El índice UNIQUE (professional_id, date, time)
 * convierte cualquier carrera de doble reserva en error 23505.
 */
export async function insertBooking(
  input: BookingInput,
  prepared: PreparedBooking,
  opts: { status: 'Confirmado' | 'Pendiente'; paymentStatus: 'Pagado' | 'Pendiente'; paymentAmount?: number }
): Promise<InsertResult> {
  const id = randomUUID();
  const { error } = await supabase.from('appointments').insert({
    id,
    professional_id: prepared.pro.id,
    patient_name: String(input.patientName).trim().slice(0, 120),
    patient_phone: input.patientPhone ? String(input.patientPhone).slice(0, 30) : null,
    patient_email: input.patientEmail ? String(input.patientEmail).slice(0, 200) : null,
    doctor_name: prepared.pro.name,
    specialty: prepared.pro.specialty,
    service_name: prepared.service.name,
    date: input.date,
    time: input.time,
    duration: prepared.service.duration,
    type: input.modality || 'Presencial',
    status: opts.status,
    price: prepared.service.price,
    payment_status: opts.paymentStatus,
    payment_amount: opts.paymentAmount ?? null,
    paid_at: opts.paymentStatus === 'Pagado' ? new Date().toISOString() : null,
    notes: input.notes ? String(input.notes).slice(0, 2000) : null,
    category: 'Medical',
    booking_source: 'web',
  });

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'SLOT_TAKEN', code: 409 };
    }
    console.error('[booking] insert error:', error.message);
    return { ok: false, error: 'No se pudo registrar la cita', code: 500 };
  }
  return { ok: true, id };
}

/** Marca una cita pendiente como pagada y confirmada tras la aprobación de MP. */
export async function confirmBookingPaid(id: string, paymentAmount: number): Promise<boolean> {
  const { error } = await supabase
    .from('appointments')
    .update({
      status: 'Confirmado',
      payment_status: 'Pagado',
      payment_amount: paymentAmount,
      paid_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) { console.error('[booking] confirm error:', error.message); return false; }

  // Registrar ingreso en tabla transactions para que aparezca en el panel de finanzas
  const { data: apt } = await supabase
    .from('appointments')
    .select('professional_id, patient_name, service_name')
    .eq('id', id)
    .single();
  if (apt) {
    const { error: txErr } = await supabase.from('transactions').insert({
      id: randomUUID(),
      professional_id: apt.professional_id,
      amount: paymentAmount,
      description: `Cita: ${apt.patient_name} - ${apt.service_name}`,
      date: new Date().toISOString().split('T')[0],
      type: 'Ingreso',
    });
    if (txErr) console.error('[booking] transaction insert error:', txErr.message);
  }
  return true;
}

/** Libera el cupo si el pago fue rechazado o falló. */
export async function releaseBooking(id: string): Promise<void> {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  if (error) console.error('[booking] release error:', error.message);
}

/**
 * Elimina "holds" de pago vencidos: citas Pendiente/Pendiente de origen web con
 * más de 5 minutos. Libera cupos de pacientes que abandonaron el checkout.
 */
export async function releaseStaleHolds(professionalId: string): Promise<void> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('professional_id', professionalId)
    .eq('status', 'Pendiente')
    .eq('payment_status', 'Pendiente')
    .eq('booking_source', 'web')
    .lt('created_at', cutoff);
  if (error) console.error('[booking] stale-hold cleanup error:', error.message);
}
