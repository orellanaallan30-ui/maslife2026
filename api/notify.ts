import type { VercelRequest, VercelResponse } from '@vercel/node';

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

// Email del remitente/organizador (solo la dirección, sin nombre)
const ORGANIZER_EMAIL = 'notificaciones@clinicamaslife.cl';

// Genera una invitación iCalendar (.ics) tiempo flotante (sin TZ) con ORGANIZER + ATTENDEE,
// para que Gmail/Outlook la muestren como invitación interactiva y la agenden automáticamente.
function generateIcs(p: {
  date: string; time: string; duration: number;
  summary: string; description: string; uid: string;
  organizerName: string;
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
    `ORGANIZER;CN=${escCn(organizerName)}:mailto:${ORGANIZER_EMAIL}`,
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

const BASE_STYLE = `font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:24px;`;
const CARD_STYLE = `background:white;padding:32px;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;`;
const ROW_LABEL = `padding:8px 0;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;`;
const ROW_VALUE = `padding:8px 0;color:#0f172a;font-weight:bold;text-align:right;`;
const INFO_BOX = `background:#f0f9ff;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid #2563eb;`;
const FOOTER = `color:#94a3b8;font-size:12px;text-align:center;margin-top:24px;`;

// value se escapa como HTML; los labels son literales de confianza
function tableRow(label: string, value: string) {
  return `<tr><td style="${ROW_LABEL}">${label}</td><td style="${ROW_VALUE}">${escapeHtml(value)}</td></tr>`;
}

function professionalNewBookingHtml(p: { professionalName: string; patientName: string; serviceName: string; date: string; time: string; type: string }) {
  return `<div style="${BASE_STYLE}">
    <div style="background:#2563eb;border-radius:16px 16px 0 0;padding:32px;text-align:center;">
      <h1 style="color:white;font-size:22px;margin:0;">Nueva Cita Agendada</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Clínica Maslife – Agenda Online</p>
    </div>
    <div style="${CARD_STYLE}">
      <p style="color:#334155;font-size:16px;margin:0 0 20px;">Hola <strong>${escapeHtml(p.professionalName || 'Profesional')}</strong>,</p>
      <p style="color:#64748b;font-size:14px;">Tienes una nueva cita agendada:</p>
      <div style="${INFO_BOX}">
        <table style="width:100%;border-collapse:collapse;">
          ${tableRow('Paciente', p.patientName)}
          ${tableRow('Servicio', p.serviceName || 'General')}
          ${tableRow('Fecha', p.date)}
          ${tableRow('Hora', p.time)}
          ${tableRow('Modalidad', p.type || 'Presencial')}
        </table>
      </div>
      <p style="${FOOTER}">Mensaje automático de Clínica Maslife Agenda Online.</p>
    </div>
  </div>`;
}

function patientConfirmationHtml(p: { patientName: string; doctorName: string; serviceName: string; date: string; time: string; type: string }) {
  return `<div style="${BASE_STYLE}">
    <div style="background:#10b981;border-radius:16px 16px 0 0;padding:32px;text-align:center;">
      <div style="font-size:48px;margin-bottom:8px;">✅</div>
      <h1 style="color:white;font-size:22px;margin:0;">¡Tu cita está confirmada!</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Clínica Maslife – Agenda Online</p>
    </div>
    <div style="${CARD_STYLE}">
      <p style="color:#334155;font-size:16px;margin:0 0 20px;">Hola <strong>${escapeHtml(p.patientName)}</strong>,</p>
      <p style="color:#64748b;font-size:14px;">Tu hora médica ha quedado reservada exitosamente. Aquí están los detalles:</p>
      <div style="background:#f0fdf4;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid #10b981;">
        <table style="width:100%;border-collapse:collapse;">
          ${tableRow('Profesional', p.doctorName)}
          ${tableRow('Servicio', p.serviceName || 'Consulta')}
          ${tableRow('Fecha', p.date)}
          ${tableRow('Hora', p.time)}
          ${tableRow('Modalidad', p.type || 'Presencial')}
        </table>
      </div>
      <p style="color:#334155;font-size:14px;">Adjuntamos un archivo de calendario (.ics) para que agregues esta cita a Google Calendar, Apple Calendar u Outlook con un clic.</p>
      <p style="color:#334155;font-size:14px;">Si necesitas cancelar o reagendar, comunícate directamente con el profesional.</p>
      <p style="${FOOTER}">Este es un mensaje automático de Clínica Maslife Agenda Online.</p>
    </div>
  </div>`;
}

function paymentReceiptHtml(p: { patientName: string; doctorName: string; serviceName: string; date: string; time: string; transactionRef?: string; price?: number }) {
  const priceStr = p.price ? `$${p.price.toLocaleString('es-CL')}` : '—';
  return `<div style="${BASE_STYLE}">
    <div style="background:#2563eb;border-radius:16px 16px 0 0;padding:32px;text-align:center;">
      <div style="font-size:48px;margin-bottom:8px;">🧾</div>
      <h1 style="color:white;font-size:22px;margin:0;">Comprobante de Pago</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Clínica Maslife – Agenda Online</p>
    </div>
    <div style="${CARD_STYLE}">
      <p style="color:#334155;font-size:16px;margin:0 0 20px;">Hola <strong>${escapeHtml(p.patientName)}</strong>,</p>
      <p style="color:#64748b;font-size:14px;">Tu pago ha sido confirmado:</p>
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
      <p style="${FOOTER}">Este es un mensaje automático de Clínica Maslife Agenda Online.</p>
    </div>
  </div>`;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!checkRateLimit(req.headers, 20, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en una hora.' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });

  const { to, professionalName, patientName, serviceName, date, time, type, patientEmail, isReceipt, transactionRef, price, duration } = req.body;
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

  const buildInvite = (attendeeName: string, attendeeEmail: string) => generateIcs({
    date, time, duration: appDuration,
    summary: icsSummary,
    description: icsDescription,
    uid: eventUid,
    organizerName: professionalName || 'Clínica Maslife',
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
