// Vercel Serverless Function — Notificaciones por email (profesional + paciente)
// Requiere RESEND_API_KEY en Vercel Environment Variables (resend.com)

import type { VercelRequest, VercelResponse } from '@vercel/node';

const BASE_STYLE = `font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:24px;`;
const CARD_STYLE = `background:white;padding:32px;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;`;
const ROW_LABEL = `padding:8px 0;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;`;
const ROW_VALUE = `padding:8px 0;color:#0f172a;font-weight:bold;text-align:right;`;
const INFO_BOX = `background:#f0f9ff;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid #2563eb;`;
const FOOTER = `color:#94a3b8;font-size:12px;text-align:center;margin-top:24px;`;

function tableRow(label: string, value: string) {
  return `<tr><td style="${ROW_LABEL}">${label}</td><td style="${ROW_VALUE}">${value}</td></tr>`;
}

function professionalNewBookingHtml(p: { professionalName: string; patientName: string; serviceName: string; date: string; time: string; type: string }) {
  return `<div style="${BASE_STYLE}">
    <div style="background:#2563eb;border-radius:16px 16px 0 0;padding:32px;text-align:center;">
      <h1 style="color:white;font-size:22px;margin:0;">Nueva Cita Agendada</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Clínica Maslife – Agenda Online</p>
    </div>
    <div style="${CARD_STYLE}">
      <p style="color:#334155;font-size:16px;margin:0 0 20px;">Hola <strong>${p.professionalName || 'Profesional'}</strong>,</p>
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
      <p style="color:#334155;font-size:16px;margin:0 0 20px;">Hola <strong>${p.patientName}</strong>,</p>
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
      <p style="color:#334155;font-size:14px;">Si necesitas cancelar o reagendar, comunícate directamente con el profesional con la mayor anticipación posible.</p>
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
      <p style="color:#334155;font-size:16px;margin:0 0 20px;">Hola <strong>${p.patientName}</strong>,</p>
      <p style="color:#64748b;font-size:14px;">Tu pago ha sido confirmado. Aquí está tu comprobante:</p>
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
      <div style="background:#eff6ff;border-radius:12px;padding:16px;text-align:center;margin-top:16px;">
        <p style="color:#1d4ed8;font-weight:bold;font-size:13px;margin:0;">Guarda este comprobante para tus registros.</p>
      </div>
      <p style="${FOOTER}">Este es un mensaje automático de Clínica Maslife Agenda Online.</p>
    </div>
  </div>`;
}

async function sendEmail(apiKey: string, from: string, to: string, subject: string, html: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });

  const { to, professionalName, patientName, serviceName, date, time, type, patientEmail, isReceipt, transactionRef, price } = req.body;
  if (!to || !patientName) return res.status(400).json({ error: 'Faltan campos requeridos' });

  const FROM = process.env.EMAIL_FROM || 'Clínica Maslife <notificaciones@maslife2026.vercel.app>';

  try {
    const sends: Promise<any>[] = [];

    // Email al profesional
    if (isReceipt) {
      sends.push(sendEmail(RESEND_API_KEY, FROM, to,
        `Pago confirmado – ${patientName}`,
        paymentReceiptHtml({ patientName, doctorName: professionalName, serviceName, date, time, transactionRef, price })
      ));
    } else {
      sends.push(sendEmail(RESEND_API_KEY, FROM, to,
        `Nueva cita agendada – ${patientName}`,
        professionalNewBookingHtml({ professionalName, patientName, serviceName, date, time, type })
      ));
    }

    // Email al paciente (si se proporcionó su email)
    if (patientEmail) {
      if (isReceipt) {
        sends.push(sendEmail(RESEND_API_KEY, FROM, patientEmail,
          `Comprobante de pago – ${serviceName}`,
          paymentReceiptHtml({ patientName, doctorName: professionalName, serviceName, date, time, transactionRef, price })
        ));
      } else {
        sends.push(sendEmail(RESEND_API_KEY, FROM, patientEmail,
          `Tu cita ha sido confirmada – ${serviceName}`,
          patientConfirmationHtml({ patientName, doctorName: professionalName, serviceName, date, time, type })
        ));
      }
    }

    const results = await Promise.all(sends);
    return res.status(200).json({ success: true, ids: results.map(r => r.id) });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
