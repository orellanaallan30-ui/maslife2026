// Vercel Serverless Function — Notificación por email al profesional
// Para activar: configura RESEND_API_KEY en Vercel Environment Variables
// Resend ofrece 100 emails/día gratis: https://resend.com

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });
  }

  const { to, professionalName, patientName, serviceName, date, time, type } = req.body;

  if (!to || !patientName) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Clínica Maslife <notificaciones@maslife2026.vercel.app>',
        to: [to],
        subject: `Nueva cita agendada - ${patientName}`,
        html: `
          <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 24px;">
            <div style="background: #2563eb; border-radius: 16px 16px 0 0; padding: 32px; text-align: center;">
              <h1 style="color: white; font-size: 22px; margin: 0;">Nueva Cita Agendada</h1>
              <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">Clínica Maslife - Agenda Online</p>
            </div>
            <div style="background: white; padding: 32px; border-radius: 0 0 16px 16px; border: 1px solid #e2e8f0;">
              <p style="color: #334155; font-size: 16px; margin: 0 0 20px;">Hola <strong>${professionalName || 'Profesional'}</strong>,</p>
              <p style="color: #64748b; font-size: 14px;">Tienes una nueva cita agendada:</p>

              <div style="background: #f0f9ff; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #2563eb;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Paciente</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: bold; text-align: right;">${patientName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Servicio</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: bold; text-align: right;">${serviceName || 'General'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Fecha</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: bold; text-align: right;">${date}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Hora</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: bold; text-align: right;">${time}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Modalidad</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: bold; text-align: right;">${type || 'Presencial'}</td>
                  </tr>
                </table>
              </div>

              <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 24px;">
                Este es un mensaje automático de Clínica Maslife Agenda Online.
              </p>
            </div>
          </div>
        `
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    return res.status(200).json({ success: true, id: data.id });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
