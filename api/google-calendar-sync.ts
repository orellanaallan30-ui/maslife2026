import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireSupabaseAuth, checkIpRateLimit } from './_lib/auth';
import {
  getValidToken,
  appointmentToGCalEvent,
  createGCalEvent,
  updateGCalEvent,
  deleteGCalEvent,
  doIncrementalSync,
} from './_lib/googleCalendar';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

const CORS = {
  'Access-Control-Allow-Origin':  'https://clinicamaslife.cl',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── AgendaMasLife → Google Calendar ──────────────────────────────────────────
async function handleOutboundSync(req: VercelRequest, res: VercelResponse) {
  if (!checkIpRateLimit(req.headers, 60, 60_000)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes' });
  }

  const user = await requireSupabaseAuth(req, res);
  if (!user) return;

  const { action, appointment } = req.body || {};
  if (!action || !appointment?.id) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  const creds = await getValidToken(user.id);
  if (!creds) {
    // Not connected — silently succeed (no GCal sync needed)
    return res.status(200).json({ synced: false, reason: 'not_connected' });
  }
  const { token, calendarId } = creds;

  // Fetch the full appointment row from DB to build the GCal event
  const { data: apptRow } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', appointment.id)
    .eq('professional_id', user.id)
    .maybeSingle();

  if (action === 'delete') {
    // Need the google_event_id from DB — use the appointment body as fallback
    const gcalId = apptRow?.google_event_id || appointment.googleEventId;
    if (gcalId) {
      await deleteGCalEvent(token, calendarId, gcalId);
    }
    return res.status(200).json({ synced: true });
  }

  if (!apptRow) return res.status(404).json({ error: 'Cita no encontrada' });

  const gcalEvent = appointmentToGCalEvent(apptRow);

  if (apptRow.google_event_id) {
    // Update existing GCal event
    const ok = await updateGCalEvent(token, calendarId, apptRow.google_event_id, gcalEvent);
    if (!ok) {
      // Event might have been deleted in GCal — recreate it
      const newId = await createGCalEvent(token, calendarId, gcalEvent);
      if (newId) {
        await supabase.from('appointments')
          .update({ google_event_id: newId })
          .eq('id', apptRow.id);
      }
    }
  } else {
    // Create new GCal event and store its ID
    const newId = await createGCalEvent(token, calendarId, gcalEvent);
    if (newId) {
      await supabase.from('appointments')
        .update({ google_event_id: newId })
        .eq('id', apptRow.id);
    }
  }

  return res.status(200).json({ synced: true });
}

// ── Google Calendar → AgendaMasLife (push notification) ──────────────────────
async function handleInboundPush(req: VercelRequest, res: VercelResponse) {
  const channelId     = req.headers['x-goog-channel-id'] as string | undefined;
  const resourceState = req.headers['x-goog-resource-state'] as string | undefined;

  // Acknowledge immediately — Google expects 2xx quickly
  res.status(200).end();

  if (!channelId || resourceState === 'sync') return; // initial handshake — nothing to do

  // Find the professional associated with this channel
  const { data: secrets } = await supabase
    .from('professional_secrets')
    .select('professional_id')
    .eq('google_channel_id', channelId)
    .maybeSingle();

  if (!secrets?.professional_id) {
    console.warn('[google-calendar-sync] Unknown channel:', channelId);
    return;
  }

  // Run incremental sync in background (response already sent)
  doIncrementalSync(secrets.professional_id).catch(err => {
    console.error('[google-calendar-sync] Incremental sync error:', err);
  });
}

// ── Manual full sync trigger (GET) ───────────────────────────────────────────
async function handleManualSync(req: VercelRequest, res: VercelResponse) {
  if (!checkIpRateLimit(req.headers, 10, 60_000)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes' });
  }

  const user = await requireSupabaseAuth(req, res);
  if (!user) return;

  await doIncrementalSync(user.id);
  return res.status(200).json({ synced: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();

  // Incoming Google push notification (no Authorization header, has X-Goog-Channel-Id)
  if (req.method === 'POST' && req.headers['x-goog-channel-id']) {
    return handleInboundPush(req, res);
  }

  if (req.method === 'POST') return handleOutboundSync(req, res);
  if (req.method === 'GET')  return handleManualSync(req, res);

  return res.status(405).json({ error: 'Método no permitido' });
}
