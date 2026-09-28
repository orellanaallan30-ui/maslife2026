// Utilidades puras del correo de cita (sin Resend ni Supabase): teléfono y
// WhatsApp, fecha en español, estado de pago y detección de reagendamiento.
// Las usa api/notify.ts y se prueban en maslife2026/__tests__/correoCita.test.ts.

/** Normaliza un teléfono chileno a formato internacional sin "+" (569XXXXXXXX). */
export function normalizarTelefonoCL(tel: unknown): string | null {
  const d = String(tel ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 11 && d.startsWith('56')) return d;
  if (d.length === 9 && d.startsWith('9')) return `56${d}`;
  if (d.length === 8) return `569${d}`; // número antiguo sin el 9 inicial
  if (d.length >= 10 && d.length <= 15) return d; // otro país, ya con código
  return null;
}

export function linkWhatsApp(telNormalizado: string, texto: string): string {
  return `https://wa.me/${telNormalizado}?text=${encodeURIComponent(texto)}`;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-09-25" → "viernes 25 de septiembre". Si no es una fecha válida, la devuelve tal cual. */
export function fechaLarga(fecha: unknown): string {
  const m = String(fecha ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(fecha ?? '');
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(d.getTime())) return String(fecha);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

/** "2026-09-25" → "25/09". */
export function fechaCorta(fecha: unknown): string {
  const m = String(fecha ?? '').match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[1]}` : String(fecha ?? '');
}

export type EstadoPago =
  | { tipo: 'pagado'; monto: number; via?: string }
  | { tipo: 'pendiente' }
  | { tipo: 'en-consulta' }
  | { tipo: 'desconocido' };

/** Estado de pago a partir de la cita en la BD (nunca del cuerpo de la petición). */
export function estadoPago(cita: { payment_status?: string | null; payment_amount?: number | null; price?: number | null; booking_source?: string | null } | null,
  cobraOnline: boolean): EstadoPago {
  if (!cita) return { tipo: 'desconocido' };
  if (cita.payment_status === 'Pagado') {
    return { tipo: 'pagado', monto: Number(cita.payment_amount || cita.price || 0), via: cita.booking_source === 'web' ? 'MercadoPago' : undefined };
  }
  return cobraOnline ? { tipo: 'pendiente' } : { tipo: 'en-consulta' };
}

export interface CitaHistorial {
  id: string;
  date: string;
  time: string;
  status?: string | null;
  created_at?: string | null;
}

export type Historial =
  | { tipo: 'primera' }
  | { tipo: 'recurrente'; previas: number }
  | { tipo: 'reagendamiento'; anterior: { date: string; time: string; estado: 'cancelada' | 'activa' }; previas: number };

/**
 * Clasifica la cita según las demás del mismo paciente con el mismo profesional.
 * Reagendamiento: una cita cancelada en los últimos 30 días, u otra cita futura
 * aún activa (el paciente probablemente quiere cambiar la hora).
 */
export function detectarReagendamiento(otras: CitaHistorial[], hoyISO: string, ahoraMs = Date.now()): Historial {
  const DIAS30 = 30 * 86400000;
  const cancelada = otras
    .filter(c => c.status === 'Cancelado' && c.created_at && ahoraMs - new Date(c.created_at).getTime() <= DIAS30)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  const futuraActiva = otras
    .filter(c => c.status !== 'Cancelado' && c.date >= hoyISO)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0];
  const previas = otras.filter(c => c.status !== 'Cancelado' && c.date < hoyISO).length;
  if (cancelada) return { tipo: 'reagendamiento', anterior: { date: cancelada.date, time: cancelada.time, estado: 'cancelada' }, previas };
  if (futuraActiva) return { tipo: 'reagendamiento', anterior: { date: futuraActiva.date, time: futuraActiva.time, estado: 'activa' }, previas };
  return previas > 0 ? { tipo: 'recurrente', previas } : { tipo: 'primera' };
}

/** "56987925188" → "+56 9 8792 5188" (otros formatos: "+" + dígitos). */
export function telefonoLegible(norm: string): string {
  const m = norm.match(/^56(9)(\d{4})(\d{4})$/);
  return m ? `+56 ${m[1]} ${m[2]} ${m[3]}` : `+${norm}`;
}

/** "123456789" → "12.345.678-9". Si no parece RUT, lo devuelve tal cual. */
export function rutLegible(rut: unknown): string {
  const c = String(rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (c.length < 7) return String(rut ?? '');
  const cuerpo = c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${c.slice(-1)}`;
}
