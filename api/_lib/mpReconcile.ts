import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { syncAppointmentToGoogle } from './googleCalendar';

// Conciliación de pagos con MercadoPago.
//
// Por qué existe: durante mucho tiempo una cita pagada solo se confirmaba si
// (a) el paciente volvía del checkout con la pestaña abierta, o (b) MercadoPago
// llamaba al webhook. En la prueba real del 25/08 ninguno de los dos ocurrió: el
// paciente cerró la pestaña y MercadoPago nunca notificó, así que un pago
// acreditado quedó como cita "Pendiente" y a punto de ser eliminada.
//
// La solución es dejar de depender de que nos avisen: preguntamos nosotros.
//
// El detalle que hace que esto funcione: la preferencia se crea con el token
// OAuth de CADA profesional (process-payment.ts), así que el pago pertenece a su
// cuenta. Consultarlo con el token de la plataforma devuelve "Payment not found".
// Aquí se usa siempre professional_secrets.mp_access_token.

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!,
);

// Campos que necesitan tanto la conciliación como el envío de correos.
const APPOINTMENT_FIELDS =
  'id, professional_id, patient_id, patient_name, patient_email, doctor_name, service_name, date, time, type, duration, payment_amount, notified_at';

/**
 * Envía los correos de la reserva reclamando el envío de forma atómica, para que
 * el cliente y el servidor no dupliquen la notificación.
 */
export async function sendBookingEmailsIfUnclaimed(apt: Record<string, any>): Promise<void> {
  try {
    // Claim atómico: solo un proceso (cliente, webhook o conciliación) envía.
    const { data: claimed } = await supabase
      .from('appointments')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', apt.id)
      .is('notified_at', null)
      .select('id')
      .maybeSingle();
    if (!claimed) return; // ya se notificó

    const { data: pro } = await supabase
      .from('professionals')
      .select('email, name')
      .eq('id', apt.professional_id)
      .maybeSingle();
    if (!pro?.email) return;

    const base = (process.env.PUBLIC_BASE_URL || 'https://clinicamaslife.cl').replace(/\/$/, '');
    await fetch(`${base}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: pro.email,
        professionalName: apt.doctor_name || pro.name,
        patientName: apt.patient_name,
        patientEmail: apt.patient_email || undefined,
        serviceName: apt.service_name,
        date: apt.date,
        time: apt.time,
        type: apt.type,
        duration: apt.duration,
        price: apt.payment_amount,
        isReceipt: true,
      }),
    }).catch(e => console.error('[mpReconcile] notify falló:', e));
  } catch (e) {
    console.error('[mpReconcile] sendBookingEmailsIfUnclaimed error:', e);
  }
}

/**
 * Marca una cita como pagada, registra el ingreso y envía los correos.
 * Idempotente: el filtro por payment_status='Pendiente' hace que una segunda
 * llamada no actualice nada ni duplique el ingreso.
 *
 * Devuelve true solo si esta llamada fue la que efectivamente la confirmó.
 */
export async function confirmPaidAppointment(
  appointmentId: string,
  amount: number,
  paidAt: string,
): Promise<boolean> {
  const { data: updated, error } = await supabase
    .from('appointments')
    .update({
      status: 'Confirmado',
      payment_status: 'Pagado',
      payment_amount: amount,
      paid_at: paidAt,
    })
    .eq('id', appointmentId)
    .eq('payment_status', 'Pendiente')
    // Solo las reservas vigentes se auto-confirman. Una que ya expiró está en
    // 'Cancelado' y su horario puede haberlo tomado otro paciente: re-confirmarla
    // en silencio provocaría una doble reserva. Ese caso se atiende aparte.
    .eq('status', 'Pendiente')
    .select(APPOINTMENT_FIELDS);

  if (error) {
    console.error('[mpReconcile] no se pudo confirmar la cita:', appointmentId, error.message);
    return false;
  }
  if (!updated?.length) {
    // No se actualizó: o ya estaba confirmada, o la reserva expiró y se canceló
    // mientras el pago seguía en camino. El segundo caso hay que avisarlo: hay
    // dinero cobrado sin cita vigente.
    await registrarPagoDeReservaExpirada(appointmentId, amount, paidAt);
    return false;
  }

  const apt = updated[0];

  const { error: txErr } = await supabase.from('transactions').insert({
    id: randomUUID(),
    professional_id: apt.professional_id,
    amount,
    description: `Cita: ${apt.patient_name} - ${apt.service_name}`,
    date: new Date().toISOString().split('T')[0],
    type: 'Ingreso',
  });
  if (txErr) console.error('[mpReconcile] no se pudo registrar el ingreso:', txErr.message);

  await notificarCitaEnPanel(apt, true);

  // El calendario del profesional. Vivía solo dentro de book-appointment, así que
  // una cita confirmada por el webhook o por la conciliación —es decir, cuando el
  // paciente cerró la pestaña— se cobraba pero nunca aparecía en su calendario.
  //
  // Va envuelto aunque la propia función ya capture: en este punto la cita YA está
  // marcada como pagada, y un fallo aquí impediría el envío de los correos que
  // vienen después. Un problema con Google no puede dejar sin avisar de una cita
  // que ya se cobró.
  try {
    await syncAppointmentToGoogle(apt.professional_id, apt.id);
  } catch (e) {
    console.error('[mpReconcile] sync con Google falló, la cita sigue confirmada:', e);
  }

  await sendBookingEmailsIfUnclaimed(apt);
  return true;
}

/**
 * El pago llegó cuando la reserva ya había expirado y se canceló. No se puede
 * re-tomar el horario —puede estar ocupado por otro paciente— pero tampoco se
 * puede dejar dinero cobrado sin que nadie se entere: se registra el pago y se
 * avisa al profesional para que contacte al paciente y reagende.
 *
 * Silencioso si la reserva simplemente ya estaba confirmada (el caso normal
 * cuando el webhook y la conciliación llegan casi a la vez).
 */
async function registrarPagoDeReservaExpirada(
  appointmentId: string,
  amount: number,
  paidAt: string,
): Promise<void> {
  try {
    const { data: filas } = await supabase
      .from('appointments')
      .update({ payment_status: 'Pagado', payment_amount: amount, paid_at: paidAt })
      .eq('id', appointmentId)
      .eq('status', 'Cancelado')
      .eq('payment_status', 'Pendiente')
      .select(APPOINTMENT_FIELDS);

    if (!filas?.length) return; // ya estaba confirmada: nada que avisar

    const apt = filas[0];
    console.warn('[mpReconcile] pago de una reserva ya expirada:', appointmentId);
    const cuando = `${apt.date} ${String(apt.time).slice(0, 5)}`;
    const { error } = await supabase.from('pro_notifications').insert({
      professional_id: apt.professional_id,
      patient_id: apt.patient_id || null,
      kind: 'booking',
      body: `Pago recibido de una reserva que ya había expirado: ${apt.patient_name} — ${apt.service_name}, ${cuando}. Contacta al paciente para reagendar.`,
    });
    if (error) console.error('[mpReconcile] no se pudo avisar del pago tardío:', error.message);
  } catch (e) {
    console.error('[mpReconcile] registrarPagoDeReservaExpirada error:', e);
  }
}

/**
 * Deja el aviso en la campana del panel. La tabla pro_notifications se creó para
 * eventos de rutinas ('evidence' | 'session' | 'message') y ninguna reserva había
 * escrito nunca en ella: el profesional solo se enteraba por correo.
 *
 * No necesita migración — patient_id y routine_id son nulables y kind es texto
 * libre. Escribe con service_role, que pasa por encima de RLS.
 */
export async function notificarCitaEnPanel(
  apt: Record<string, any>,
  pagada: boolean,
): Promise<void> {
  try {
    const cuando = `${apt.date} ${String(apt.time).slice(0, 5)}`;
    const { error } = await supabase.from('pro_notifications').insert({
      professional_id: apt.professional_id,
      patient_id: apt.patient_id || null,
      kind: 'booking',
      body: `${pagada ? 'Nueva cita pagada' : 'Nueva cita'}: ${apt.patient_name} — ${apt.service_name}, ${cuando}`,
    });
    if (error) console.error('[mpReconcile] no se pudo dejar el aviso en la campana:', error.message);
  } catch (e) {
    console.error('[mpReconcile] notificarCitaEnPanel error:', e);
  }
}

/**
 * Pregunta a MercadoPago por las reservas del profesional que siguen pendientes
 * de pago y confirma las que ya están acreditadas.
 *
 * Nunca lanza: es un respaldo, no debe tumbar el flujo que la invoca.
 *
 * @returns cuántas citas se confirmaron en esta pasada.
 */
export async function reconcilePendingWithMP(professionalId: string): Promise<number> {
  try {
    // Solo las que llegaron al checkout y siguen sin pagarse. La ventana de 24h
    // evita recorrer históricos: pasado ese plazo el cupo ya se liberó.
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: pendientes, error } = await supabase
      .from('appointments')
      .select('id')
      .eq('professional_id', professionalId)
      .eq('payment_status', 'Pendiente')
      .not('mp_preference_id', 'is', null)
      .gte('created_at', desde);

    if (error) {
      console.error('[mpReconcile] no se pudieron leer las citas pendientes:', error.message);
      return 0;
    }
    if (!pendientes?.length) return 0;

    // El token del profesional, no el de la plataforma: el pago vive en SU cuenta.
    const { data: secret } = await supabase
      .from('professional_secrets')
      .select('mp_access_token')
      .eq('professional_id', professionalId)
      .maybeSingle();

    const token = secret?.mp_access_token?.trim();
    if (!token) return 0; // no conectó MercadoPago: no hay nada que conciliar

    let confirmadas = 0;
    for (const { id } of pendientes) {
      try {
        const res = await fetch(
          `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(id)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          console.error('[mpReconcile] búsqueda de pago falló:', id, res.status);
          continue;
        }
        const body = await res.json();
        const aprobado = (body?.results || []).find((p: any) => p?.status === 'approved');
        if (!aprobado) continue;

        const monto = Math.round(Number(aprobado.transaction_amount) || 0);
        const paidAt = aprobado.date_approved || new Date().toISOString();
        if (await confirmPaidAppointment(id, monto, paidAt)) {
          confirmadas++;
          console.log('[mpReconcile] cita conciliada desde MercadoPago:', id);
        }
      } catch (e) {
        console.error('[mpReconcile] error conciliando la cita', id, e);
      }
    }
    return confirmadas;
  } catch (e) {
    console.error('[mpReconcile] reconcilePendingWithMP error:', e);
    return 0;
  }
}
