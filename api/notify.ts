import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

function verifyAdminJwt(token: string, secret: string): boolean {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return false;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() > decoded.exp) return false;
    const expected = createHmac('sha256', secret).update(payload).digest('base64url');
    const a = Buffer.from(sig); const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch { return false; }
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

const ipCounts = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(headers: VercelRequest['headers'], max: number, windowMs: number): boolean {
  const forwarded = headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : (forwarded || 'unknown')).split(',')[0].trim();
  const now = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    ipCounts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

// Email del remitente/organizador se toma del campo `to` (email del profesional)
// para que los RSVP del paciente lleguen directamente al profesional, no a un buzón sin configurar.
const FALLBACK_ORGANIZER = 'notificaciones@clinicamaslife.cl';

// Genera una invitación iCalendar (.ics) tiempo flotante (sin TZ) con ORGANIZER + ATTENDEE,
// para que Gmail/Outlook la muestren como invitación interactiva y la agenden automáticamente.
function generateIcs(p: {
  date: string; time: string; duration: number;
  summary: string; description: string; uid: string;
  organizerName: string; organizerEmail?: string;
  attendeeName: string; attendeeEmail: string;
}): string {
  const { date, time, duration, summary, description, uid, organizerName, attendeeName, attendeeEmail } = p;
  const [yyyy, mm, dd] = date.split('-');
  const [hh, min] = time.split(':');
  const startDt = `${yyyy}${mm}${dd}T${hh}${min}00`;

  // Aritmética pura — sin new Date() para evitar conversión UTC que desplaza la hora
  const startMinutes = parseInt(hh) * 60 + parseInt(min);
  const endTotalMinutes = startMinutes + duration;
  const endH = String(Math.floor(endTotalMinutes / 60) % 24).padStart(2, '0');
  const endM = String(endTotalMinutes % 60).padStart(2, '0');
  const endDt = `${yyyy}${mm}${dd}T${endH}${endM}00`;

  const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  // RFC 5545: escapar \ primero, luego , y ; y newlines
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, c => `\\${c}`).replace(/\n/g, '\\n');
  // CN (nombre) no debe contener comas/dobles comillas sin escapar
  const escCn = (s: string) => (s || '').replace(/[\\;,:"]/g, ' ').trim();

  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Clinica Maslife//AgendaMaslife//ES',
    'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${startDt}`,
    `DTEND:${endDt}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    `ORGANIZER;CN=${escCn(organizerName)}:mailto:${p.organizerEmail || FALLBACK_ORGANIZER}`,
    `ATTENDEE;CN=${escCn(attendeeName)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendeeEmail}`,
    'SEQUENCE:0',
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(summary)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

// Escapa entidades HTML para evitar inyección de HTML/scripts en los correos
// (los nombres, servicios, etc. provienen de input del usuario sin confianza)
function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Elimina saltos de línea para evitar header injection en asuntos de correo
function cleanLine(str: unknown): string {
  return String(str ?? '').replace(/[\r\n]+/g, ' ').trim();
}

const ROW_LABEL = `padding:8px 0;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;`;
const ROW_VALUE = `padding:8px 0;color:#0f172a;font-weight:bold;text-align:right;`;
const INFO_BOX = `background:#f0fdfa;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid #00a89e;`;

// ── Plantilla de marca MasLife para TODOS los correos ────────────────────────
// Header teal con el nombre de la clínica, tarjeta de contenido y footer oscuro
// con copyright (estilo profesional, tipo Passline pero con nuestra marca).
const BRAND_TEAL = '#00a89e';
const BRAND_TEAL_DEEP = '#007e77';

function emailShell(opts: { icon?: string; title: string; subtitle?: string; bodyHtml: string }): string {
  return `<div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f6f8;padding:24px;">
    <div style="background:linear-gradient(135deg,${BRAND_TEAL},${BRAND_TEAL_DEEP});border-radius:16px 16px 0 0;padding:34px 32px;text-align:center;">
      ${opts.icon ? `<div style="font-size:40px;line-height:1;margin-bottom:10px;">${opts.icon}</div>` : ''}
      <div style="font-size:23px;font-weight:800;color:#ffffff;letter-spacing:.3px;">Clínica Mas Life <span style="opacity:.9;">🧡</span></div>
      <div style="color:rgba(255,255,255,.85);font-size:11px;margin-top:5px;letter-spacing:1.5px;text-transform:uppercase;">clinicamaslife.cl</div>
    </div>
    <div style="background:#ffffff;padding:32px;border-left:1px solid #e6ebf0;border-right:1px solid #e6ebf0;">
      <h1 style="color:#0f172a;font-size:20px;margin:0 0 ${opts.subtitle ? '4px' : '18px'};text-align:center;">${escapeHtml(opts.title)}</h1>
      ${opts.subtitle ? `<p style="color:#64748b;font-size:13px;text-align:center;margin:0 0 22px;">${escapeHtml(opts.subtitle)}</p>` : ''}
      ${opts.bodyHtml}
    </div>
    <div style="background:#0e1b2b;border-radius:0 0 16px 16px;padding:22px 32px;text-align:center;">
      <div style="font-size:15px;font-weight:800;color:#ffffff;">Clínica Mas Life <span style="opacity:.9;">🧡</span></div>
      <div style="color:#7a8aa0;font-size:11px;margin-top:6px;">© 2026 Clínica Mas Life · Todos los derechos reservados.</div>
    </div>
  </div>`;
}

// value se escapa como HTML; los labels son literales de confianza
function tableRow(label: string, value: string) {
  return `<tr><td style="${ROW_LABEL}">${label}</td><td style="${ROW_VALUE}">${escapeHtml(value)}</td></tr>`;
}

function professionalNewBookingHtml(p: { professionalName: string; patientName: string; serviceName: string; date: string; time: string; type: string }) {
  return emailShell({
    icon: '📅',
    title: 'Nueva cita agendada',
    bodyHtml: `
      <p style="color:#334155;font-size:15px;margin:0 0 8px;">Hola <strong>${escapeHtml(p.professionalName || 'Profesional')}</strong>,</p>
      <p style="color:#64748b;font-size:14px;margin:0 0 4px;">Tienes una nueva cita agendada:</p>
      <div style="${INFO_BOX}">
        <table style="width:100%;border-collapse:collapse;">
          ${tableRow('Paciente', p.patientName)}
          ${tableRow('Servicio', p.serviceName || 'General')}
          ${tableRow('Fecha', p.date)}
          ${tableRow('Hora', p.time)}
          ${tableRow('Modalidad', p.type || 'Presencial')}
        </table>
      </div>`,
  });
}

function patientConfirmationHtml(p: { patientName: string; doctorName: string; serviceName: string; date: string; time: string; type: string }) {
  return emailShell({
    icon: '✅',
    title: '¡Tu cita está confirmada!',
    subtitle: 'Tu hora quedó reservada exitosamente',
    bodyHtml: `
      <p style="color:#334155;font-size:15px;margin:0 0 8px;">Hola <strong>${escapeHtml(p.patientName)}</strong>,</p>
      <p style="color:#64748b;font-size:14px;margin:0 0 4px;">Aquí están los detalles de tu cita:</p>
      <div style="${INFO_BOX}">
        <table style="width:100%;border-collapse:collapse;">
          ${tableRow('Profesional', p.doctorName)}
          ${tableRow('Servicio', p.serviceName || 'Consulta')}
          ${tableRow('Fecha', p.date)}
          ${tableRow('Hora', p.time)}
          ${tableRow('Modalidad', p.type || 'Presencial')}
        </table>
      </div>
      <p style="color:#64748b;font-size:13px;margin:0 0 6px;">Adjuntamos un archivo de calendario (.ics) para agregar la cita a Google Calendar, Apple Calendar u Outlook con un clic.</p>
      <p style="color:#64748b;font-size:13px;margin:0;">Si necesitas cancelar o reagendar, comunícate directamente con el profesional.</p>`,
  });
}

function paymentReceiptHtml(p: { patientName: string; doctorName: string; serviceName: string; date: string; time: string; transactionRef?: string; price?: number }) {
  const priceStr = p.price ? `$${p.price.toLocaleString('es-CL')}` : '—';
  return emailShell({
    icon: '🧾',
    title: 'Comprobante de pago',
    subtitle: 'Tu pago ha sido confirmado',
    bodyHtml: `
      <p style="color:#334155;font-size:15px;margin:0 0 8px;">Hola <strong>${escapeHtml(p.patientName)}</strong>,</p>
      <div style="${INFO_BOX}">
        <table style="width:100%;border-collapse:collapse;">
          ${tableRow('Paciente', p.patientName)}
          ${tableRow('Profesional', p.doctorName)}
          ${tableRow('Servicio', p.serviceName || 'Consulta')}
          ${tableRow('Fecha', p.date)}
          ${tableRow('Hora', p.time)}
          ${p.transactionRef ? tableRow('Referencia', p.transactionRef) : ''}
          ${tableRow('Monto Pagado', priceStr)}
        </table>
      </div>
      <p style="color:#64748b;font-size:13px;margin:0;">Guarda este comprobante como respaldo de tu pago.</p>`,
  });
}

async function sendEmail(apiKey: string, from: string, to: string, subject: string, html: string, icsContent?: string) {
  const body: Record<string, unknown> = { from, to: [to], subject, html };
  if (icsContent) {
    body.attachments = [{
      filename: 'cita.ics',
      content: Buffer.from(icsContent).toString('base64'),
      // content_type de invitación: hace que Gmail/Outlook muestren el evento
      // de forma interactiva y lo agreguen al calendario automáticamente
      content_type: 'text/calendar; method=REQUEST; charset=UTF-8'
    }];
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}

function ratingRequestHtml(p: { professionalName: string; patientName: string; serviceName: string; date: string; reviewLink: string }): string {
  const dateFormatted = p.date ? new Date(p.date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return emailShell({
    icon: '⭐',
    title: '¿Cómo fue tu atención?',
    subtitle: 'Tu opinión ayuda a otros pacientes',
    bodyHtml: `
      <p style="color:#334155;font-size:15px;margin:0 0 16px;">Hola <strong>${escapeHtml(p.patientName)}</strong>,</p>
      <p style="color:#475569;font-size:15px;margin:0 0 24px;line-height:1.6;">
        Tu sesión de <strong>${escapeHtml(p.serviceName)}</strong>${dateFormatted ? ` del ${dateFormatted}` : ''} con
        <strong>${escapeHtml(p.professionalName)}</strong> ha finalizado. Nos gustaría saber cómo fue tu experiencia.
      </p>
      <div style="text-align:center;margin:0 0 24px;font-size:32px;letter-spacing:4px;color:#f59e0b;">★★★★★</div>
      <div style="text-align:center;margin:0 0 24px;">
        <a href="${p.reviewLink}" style="display:inline-block;background:${BRAND_TEAL};color:white;text-decoration:none;font-weight:800;font-size:15px;padding:14px 32px;border-radius:12px;">
          Dejar mi calificación →
        </a>
      </div>
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">Tu RUT solo se usa para verificar que fuiste atendido/a. No se publica.</p>`,
  });
}

function charlaBlastHtml(nombre: string, asunto: string, mensaje: string): string {
  return emailShell({
    icon: '📢',
    title: asunto,
    subtitle: 'Clínica Mas Life · Charlas de salud',
    bodyHtml: `
      <p style="color:#334155;font-size:16px;margin:0 0 20px;">Hola <strong>${escapeHtml(nombre)}</strong>,</p>
      <div style="color:#334155;font-size:15px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(mensaje)}</div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">Recibiste este mensaje porque te inscribiste a las charlas gratuitas de Clínica Mas Life.<br>
      Para no recibir más comunicaciones, responde este email solicitando darte de baja.</p>`,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Reward referral: credit referrer $1,000 and give referred +30 days
  if (req.body?.action === 'reward-referral') {
    const { referrer_id, referred_id } = req.body || {};
    if (!referrer_id || !referred_id) {
      return res.status(400).json({ error: 'referrer_id y referred_id requeridos' });
    }

    // Validate both IDs exist
    const { data: referrer } = await supabase.from('professionals').select('id').eq('id', referrer_id).single();
    const { data: referred } = await supabase.from('professionals').select('id').eq('id', referred_id).single();
    if (!referrer || !referred) return res.status(404).json({ error: 'Profesional no encontrado' });

    // Give referrer $1,000 credit
    await supabase.rpc('increment_referral_credit', { pro_id: referrer_id, amount: 1000 })
      .then(async ({ error }) => {
        if (error) {
          // Fallback if RPC doesn't exist: manual increment
          const { data: pro } = await supabase.from('professionals').select('referral_credit_clp').eq('id', referrer_id).single();
          await supabase.from('professionals').update({ referral_credit_clp: ((pro as any)?.referral_credit_clp || 0) + 1000 }).eq('id', referrer_id);
        }
      });

    // Give referred professional +30 extra days
    const { data: refPro } = await supabase.from('professionals').select('trial_end_date').eq('id', referred_id).single();
    const base = (refPro as any)?.trial_end_date ? new Date((refPro as any).trial_end_date) : new Date();
    const extended = new Date(Math.max(base.getTime(), Date.now()) + 30 * 24 * 60 * 60 * 1000);
    await supabase.from('professionals').update({ trial_end_date: extended.toISOString() }).eq('id', referred_id);

    return res.status(200).json({ rewarded: true });
  }

  // Submit review: server-side RUT verification against appointments
  if (req.body?.action === 'submit-review') {
    const { professional_id, patient_rut, patient_name, rating, comment } = req.body || {};

    if (!professional_id || !patient_rut || !patient_name || !rating) {
      return res.status(400).json({ error: 'Campos requeridos: professional_id, patient_rut, patient_name, rating' });
    }
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Calificación inválida (1-5)' });
    }

    const { data: pro } = await supabase
      .from('professionals')
      .select('reviews_enabled')
      .eq('id', professional_id)
      .single();
    if (!pro?.reviews_enabled) {
      return res.status(403).json({ error: 'Este profesional no acepta calificaciones.' });
    }

    const normalizedRut = String(patient_rut).replace(/\./g, '').replace(/-/g, '').toLowerCase().trim();
    const { data: appointments } = await supabase
      .from('appointments')
      .select('id')
      .eq('professional_id', professional_id)
      .or(`patient_rut.ilike.${normalizedRut},patient_rut.ilike.${String(patient_rut).trim()}`)
      .in('status', ['Confirmado', 'Completado'])
      .limit(1);

    const isVerified = !!(appointments && appointments.length > 0);

    if (!isVerified) {
      return res.status(403).json({
        error: 'Solo pueden calificar pacientes que fueron atendidos por este profesional.',
        code: 'NOT_A_PATIENT'
      });
    }

    const { error: insertErr } = await supabase
      .from('professional_reviews')
      .upsert({
        professional_id,
        patient_rut: normalizedRut,
        patient_name: String(patient_name).trim().slice(0, 80),
        rating: Math.round(rating),
        comment: comment ? String(comment).trim().slice(0, 500) : null,
        is_verified: true,
      }, { onConflict: 'professional_id,patient_rut' });

    if (insertErr) {
      console.error('[submit-review]', insertErr.message);
      return res.status(500).json({ error: 'No se pudo guardar la reseña.' });
    }

    return res.status(200).json({ submitted: true });
  }

  // ── Solicitud de calificación post-atención ────────────────────────────────
  if (req.body?.action === 'rating-request') {
    const { patientEmail, patientName, professionalName, professionalId, proSlug, serviceName, date } = req.body || {};

    if (!patientEmail || !EMAIL_RE.test(String(patientEmail)))
      return res.status(400).json({ error: 'Email inválido' });
    if (!professionalId || !patientName || !professionalName)
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });

    const { data: pro } = await supabase
      .from('professionals')
      .select('reviews_enabled')
      .eq('id', professionalId)
      .single();
    if (!pro?.reviews_enabled)
      return res.status(403).json({ error: 'Este profesional no acepta calificaciones.' });

    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });
    const FROM = process.env.EMAIL_FROM || 'notificaciones@clinicamaslife.cl';

    const reviewLink = `https://clinicamaslife.cl/p/${proSlug || professionalId}?review=1&name=${encodeURIComponent(String(patientName))}`;
    const subject = `¿Cómo fue tu atención con ${escapeHtml(String(professionalName))}? ⭐`;
    await sendEmail(RESEND_KEY, FROM, String(patientEmail), subject,
      ratingRequestHtml({
        professionalName: String(professionalName),
        patientName: String(patientName),
        serviceName: String(serviceName || 'Consulta'),
        date: String(date || ''),
        reviewLink,
      })
    );
    return res.status(200).json({ ok: true });
  }

  // ── Aviso al administrador: nuevo mensaje de soporte de un profesional ──────
  // Solo envía al ADMIN_EMAIL fijo (no a destinatarios arbitrarios), así que no se
  // puede abusar para spam a terceros. No bloquea si el correo no está configurado.
  if (req.body?.action === 'admin-feedback') {
    const RESEND_KEY = process.env.RESEND_API_KEY;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    if (!RESEND_KEY || !ADMIN_EMAIL) return res.status(200).json({ ok: false, skipped: true });
    const FROM = (process.env.EMAIL_FROM || 'Clínica Maslife <notificaciones@clinicamaslife.cl>').trim();
    const { fbType, subject, message, professionalName, professionalEmail } = req.body || {};
    const tipo = fbType === 'problem' ? '🐞 Problema' : '💡 Sugerencia';
    const html = emailShell({
      icon: '📨',
      title: `${tipo} — nuevo mensaje de soporte`,
      bodyHtml: `
        <p style="color:#334155;font-size:15px;margin:0 0 8px;"><strong>De:</strong> ${escapeHtml(String(professionalName || '—'))} (${escapeHtml(String(professionalEmail || '—'))})</p>
        ${subject ? `<p style="color:#334155;font-size:15px;margin:0 0 12px;"><strong>Asunto:</strong> ${escapeHtml(String(subject))}</p>` : ''}
        <div style="white-space:pre-wrap;background:#f8fafc;color:#334155;font-size:14px;line-height:1.6;padding:16px;border-radius:12px;border-left:4px solid ${BRAND_TEAL};">${escapeHtml(String(message || ''))}</div>
        <p style="color:#94a3b8;font-size:13px;margin:18px 0 0;">Revísalo y márcalo como resuelto en el panel admin → Soporte.</p>`,
    });
    await sendEmail(RESEND_KEY, FROM, ADMIN_EMAIL, `[MasLife Soporte] ${tipo}${subject ? ': ' + subject : ''}`, html).catch(() => null);
    return res.status(200).json({ ok: true });
  }

  // ── Correo de bienvenida a un profesional recién registrado (nuestro Resend) ─
  if (req.body?.action === 'pro-welcome') {
    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(200).json({ ok: false, skipped: true });
    const FROM = (process.env.EMAIL_FROM || 'Clínica Maslife <notificaciones@clinicamaslife.cl>').trim();
    const { to, professionalName } = req.body || {};
    if (!to || !EMAIL_RE.test(String(to))) return res.status(400).json({ error: 'Email inválido' });
    const html = emailShell({
      icon: '🧡',
      title: `¡Bienvenido/a a Clínica Mas Life, ${String(professionalName || '')}!`,
      subtitle: 'Tu cuenta ya está activa',
      bodyHtml: `
        <p style="color:#334155;font-size:15px;margin:0 0 16px;">Tienes <strong>30 días gratis</strong> para probar todo, sin permanencia.</p>
        <p style="color:#475569;font-size:14px;margin:0 0 8px;">Para empezar:</p>
        <ol style="color:#475569;font-size:14px;line-height:1.8;margin:0 0 8px;padding-left:20px;">
          <li>Completa tu perfil (foto, especialidad y ciudad).</li>
          <li>Agrega tus servicios con precio y duración.</li>
          <li>Comparte tu link de reservas y empieza a recibir pacientes.</li>
        </ol>
        <div style="text-align:center;margin:24px 0 8px;">
          <a href="https://clinicamaslife.cl/pro/dashboard" style="display:inline-block;background:${BRAND_TEAL};color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:800;font-size:15px;">Ir a mi panel →</a>
        </div>
        <p style="color:#94a3b8;font-size:12px;text-align:center;margin:16px 0 0;">Si no creaste esta cuenta, ignora este correo.</p>`,
    });
    await sendEmail(RESEND_KEY, FROM, String(to), '¡Tu cuenta en Clínica Mas Life está lista! 🧡', html).catch(() => null);
    return res.status(200).json({ ok: true });
  }

  // ── Envío masivo a inscritos en charlas (solo admin) ──────────────────────
  if (req.body?.action === 'charla-blast') {
    // El token admin se firma con la service-role key (ver admin-auth.ts).
    const ADMIN_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ADMIN_JWT_SECRET;
    if (!ADMIN_SECRET) return res.status(500).json({ error: 'Configuración incompleta' });
    const authHeader = (req.headers.authorization as string | undefined) || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!verifyAdminJwt(token, ADMIN_SECRET)) return res.status(401).json({ error: 'No autorizado' });

    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });

    const { charlaId, asunto, mensaje } = req.body;
    if (!asunto?.trim() || !mensaje?.trim()) return res.status(400).json({ error: 'asunto y mensaje son requeridos' });

    // Fetch registrations (charla específica o todas)
    let query = supabase.from('charla_registrations').select('nombre, email').neq('email', '');
    if (charlaId) query = query.eq('charla_id', charlaId);
    const { data: regs, error: fetchErr } = await query;
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!regs || regs.length === 0) return res.status(200).json({ sent: 0, message: 'Sin destinatarios' });

    // Eliminar duplicados por email
    const seen = new Set<string>();
    const unique = (regs as { nombre: string; email: string }[]).filter(r => {
      if (!EMAIL_RE.test(r.email) || seen.has(r.email.toLowerCase())) return false;
      seen.add(r.email.toLowerCase()); return true;
    });

    const FROM = (process.env.EMAIL_FROM || 'Clínica Maslife <notificaciones@clinicamaslife.cl>').trim();
    const cleanAsunto = cleanLine(asunto);

    // Resend batch: máx 100 por request
    let sent = 0;
    const chunk = 100;
    for (let i = 0; i < unique.length; i += chunk) {
      const batch = unique.slice(i, i + chunk).map(r => ({
        from: FROM,
        to: [r.email],
        subject: cleanAsunto,
        html: charlaBlastHtml(r.nombre, cleanAsunto, mensaje),
      }));
      const batchRes = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (batchRes.ok) sent += batch.length;
    }

    return res.status(200).json({ sent, total: unique.length });
  }

  // ── Mensaje masivo a profesionales (solo admin) ───────────────────────────
  if (req.body?.action === 'pro-blast') {
    const ADMIN_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ADMIN_JWT_SECRET;
    if (!ADMIN_SECRET) return res.status(500).json({ error: 'Configuración incompleta' });
    const authHeader = (req.headers.authorization as string | undefined) || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!verifyAdminJwt(token, ADMIN_SECRET)) return res.status(401).json({ error: 'No autorizado' });

    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });

    const { asunto, mensaje, professionalIds } = req.body;
    if (!asunto?.trim() || !mensaje?.trim()) return res.status(400).json({ error: 'asunto y mensaje son requeridos' });

    // Destinatarios: todos, o los IDs seleccionados
    let query = supabase.from('professionals').select('name, email').neq('email', '');
    if (Array.isArray(professionalIds) && professionalIds.length) query = query.in('id', professionalIds);
    const { data: pros, error: fetchErr } = await query;
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!pros || pros.length === 0) return res.status(200).json({ sent: 0, message: 'Sin destinatarios' });

    const seen = new Set<string>();
    const unique = (pros as { name: string; email: string }[]).filter(r => {
      if (!EMAIL_RE.test(r.email) || seen.has(r.email.toLowerCase())) return false;
      seen.add(r.email.toLowerCase()); return true;
    });

    const FROM = (process.env.EMAIL_FROM || 'Clínica Maslife <notificaciones@clinicamaslife.cl>').trim();
    const cleanAsunto = cleanLine(asunto);
    let sent = 0;
    const chunk = 100;
    for (let i = 0; i < unique.length; i += chunk) {
      const batch = unique.slice(i, i + chunk).map(r => ({
        from: FROM,
        to: [r.email],
        subject: cleanAsunto,
        html: charlaBlastHtml(r.name, cleanAsunto, mensaje),
      }));
      const batchRes = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (batchRes.ok) sent += batch.length;
    }
    return res.status(200).json({ sent, total: unique.length });
  }

  // Rama de diagnóstico: registrar errores del cliente (p. ej. fallos del Brick
  // de MercadoPago) en los logs del servidor sin necesidad de un endpoint extra.
  if (req.body?.clientError) {
    try {
      console.error('[client-error]', JSON.stringify(req.body).slice(0, 2000));
    } catch {
      console.error('[client-error] cuerpo no parseable');
    }
    return res.status(200).json({ logged: true });
  }

  if (!checkRateLimit(req.headers, 20, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en una hora.' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });

  const { to: toRaw, professionalId, professionalName, patientName, serviceName, date, time, type, patientEmail, isReceipt, transactionRef, price, duration } = req.body;

  // El perfil público ya no expone el email del profesional (Ley 21.719):
  // el cliente envía professionalId y el email se resuelve aquí con service role.
  let to = typeof toRaw === 'string' ? toRaw : '';
  const PRO_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!EMAIL_RE.test(to) && typeof professionalId === 'string' && PRO_UUID_RE.test(professionalId)) {
    const { data: proRow } = await supabase
      .from('professionals').select('email').eq('id', professionalId).maybeSingle();
    if (proRow?.email) to = proRow.email as string;
  }

  if (!to || !patientName) return res.status(400).json({ error: 'Faltan campos requeridos' });

  if (!EMAIL_RE.test(to)) return res.status(400).json({ error: 'Email de destinatario inválido' });
  if (patientEmail && !EMAIL_RE.test(patientEmail)) return res.status(400).json({ error: 'Email de paciente inválido' });

  // Limpia saltos de línea/espacios accidentales en la variable de entorno
  const FROM = (process.env.EMAIL_FROM || 'Clínica Maslife <notificaciones@clinicamaslife.cl>').trim();

  // Generar invitación .ics solo para confirmaciones (no comprobantes de pago),
  // y solo si el date tiene formato YYYY-MM-DD. Cada destinatario recibe su propia
  // invitación (él mismo como ATTENDEE), compartiendo el mismo UID del evento.
  const canInvite = !isReceipt && date && time && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const appDuration = typeof duration === 'number' && duration > 0 ? duration : 60;
  const eventUid = `${Date.now()}-${Math.random().toString(36).slice(2)}@clinicamaslife.cl`;
  const icsSummary = `Atención: ${serviceName || 'Consulta'} – ${professionalName}`;
  const icsDescription = `Paciente: ${patientName}\nProfesional: ${professionalName}\nServicio: ${serviceName || 'Consulta'}\nModalidad: ${type || 'Presencial'}\n\nClínica Maslife – clinicamaslife.cl`;

  // `to` is the professional's email — use it as ORGANIZER so RSVPs reach the doctor directly
  const buildInvite = (attendeeName: string, attendeeEmail: string) => generateIcs({
    date, time, duration: appDuration,
    summary: icsSummary,
    description: icsDescription,
    uid: eventUid,
    organizerName: professionalName || 'Clínica Maslife',
    organizerEmail: EMAIL_RE.test(to) ? to : FALLBACK_ORGANIZER,
    attendeeName,
    attendeeEmail,
  });

  try {
    const sends: Promise<any>[] = [];

    const subjName = cleanLine(patientName);
    const subjService = cleanLine(serviceName);

    if (isReceipt) {
      sends.push(sendEmail(RESEND_API_KEY, FROM, to,
        `Pago confirmado – ${subjName}`,
        paymentReceiptHtml({ patientName, doctorName: professionalName, serviceName, date, time, transactionRef, price })
      ));
    } else {
      sends.push(sendEmail(RESEND_API_KEY, FROM, to,
        `Nueva cita agendada – ${subjName}`,
        professionalNewBookingHtml({ professionalName, patientName, serviceName, date, time, type }),
        canInvite ? buildInvite(professionalName || 'Profesional', to) : undefined
      ));
    }

    if (patientEmail) {
      if (isReceipt) {
        sends.push(sendEmail(RESEND_API_KEY, FROM, patientEmail,
          `Comprobante de pago – ${subjService}`,
          paymentReceiptHtml({ patientName, doctorName: professionalName, serviceName, date, time, transactionRef, price })
        ));
      } else {
        sends.push(sendEmail(RESEND_API_KEY, FROM, patientEmail,
          `Tu cita ha sido confirmada – ${subjService}`,
          patientConfirmationHtml({ patientName, doctorName: professionalName, serviceName, date, time, type }),
          canInvite ? buildInvite(patientName, patientEmail) : undefined
        ));
      }
    }

    const results = await Promise.all(sends);
    return res.status(200).json({ success: true, ids: results.map(r => r.id) });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
