import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TIMEZONE   = 'America/Santiago';
const MASLIFE_KEY = 'maslifeId';

interface GCalEvent {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end:   { dateTime: string; timeZone: string };
  extendedProperties?: { private: Record<string, string> };
  status?: string;
}

interface SecretRow {
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_calendar_id: string | null;
  google_sync_token: string | null;
  google_channel_id: string | null;
  google_channel_expiration: number | null;
}

// ── Token management ─────────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

export async function getValidToken(professionalId: string): Promise<{ token: string; calendarId: string } | null> {
  const { data, error } = await supabase
    .from('professional_secrets')
    .select('google_access_token, google_refresh_token, google_calendar_id')
    .eq('professional_id', professionalId)
    .maybeSingle();

  if (error || !data?.google_refresh_token) return null;

  let token = data.google_access_token;
  // Always try using stored token first; on 401 we'll refresh in callers.
  // Here we just ensure we have something to return.
  if (!token && data.google_refresh_token) {
    token = await refreshAccessToken(data.google_refresh_token);
    if (token) {
      await supabase
        .from('professional_secrets')
        .update({ google_access_token: token })
        .eq('professional_id', professionalId);
    }
  }
  if (!token) return null;
  return { token, calendarId: data.google_calendar_id || 'primary' };
}

// ── Event conversion ─────────────────────────────────────────────────────────

// appointment row shape used server-side (DB columns)
interface AppRow {
  id: string;
  patient_name: string;
  service_name: string;
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM
  duration: number;
  notes?: string | null;
  status?: string;
  type?: string;
}

function addMinutes(dateTimeStr: string, mins: number): string {
  const d = new Date(dateTimeStr);
  d.setMinutes(d.getMinutes() + mins);
  // Return in local ISO-like format without Z so Google respects timeZone field
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export function appointmentToGCalEvent(row: AppRow): GCalEvent {
  const startDT = `${row.date}T${row.time}:00`;
  const endDT   = addMinutes(startDT, row.duration || 30);
  return {
    summary: `${row.patient_name} — ${row.service_name}`,
    description: row.notes || undefined,
    start: { dateTime: startDT, timeZone: TIMEZONE },
    end:   { dateTime: endDT,   timeZone: TIMEZONE },
    extendedProperties: { private: { [MASLIFE_KEY]: row.id } },
  };
}

// ── CRUD helpers ─────────────────────────────────────────────────────────────

async function gcalRequest(
  token: string,
  method: string,
  url: string,
  body?: unknown
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function createGCalEvent(
  token: string,
  calId: string,
  event: GCalEvent
): Promise<string | null> {
  const res = await gcalRequest(token, 'POST', `${GCAL_BASE}/calendars/${encodeURIComponent(calId)}/events`, event);
  if (!res.ok) return null;
  const data = await res.json();
  return data.id || null;
}

export async function updateGCalEvent(
  token: string,
  calId: string,
  eventId: string,
  event: GCalEvent
): Promise<boolean> {
  const res = await gcalRequest(token, 'PUT', `${GCAL_BASE}/calendars/${encodeURIComponent(calId)}/events/${eventId}`, event);
  return res.ok;
}

export async function deleteGCalEvent(
  token: string,
  calId: string,
  eventId: string
): Promise<void> {
  await gcalRequest(token, 'DELETE', `${GCAL_BASE}/calendars/${encodeURIComponent(calId)}/events/${eventId}`);
}

// ── Push channel registration ─────────────────────────────────────────────────

export async function registerPushChannel(
  token: string,
  calId: string,
  professionalId: string
): Promise<boolean> {
  const channelId = `maslife-${professionalId}-${Date.now()}`;
  const webhookUrl = `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://clinicamaslife.cl'}/api/google-calendar-sync`;

  const res = await gcalRequest(token, 'POST', `${GCAL_BASE}/calendars/${encodeURIComponent(calId)}/events/watch`, {
    id:      channelId,
    type:    'web_hook',
    address: webhookUrl,
  });

  if (!res.ok) {
    console.error('[googleCalendar] Push channel registration failed:', await res.text());
    return false;
  }
  const data = await res.json();
  await supabase
    .from('professional_secrets')
    .update({
      google_channel_id:         channelId,
      google_channel_expiration: data.expiration ? parseInt(data.expiration) : null,
    })
    .eq('professional_id', professionalId);
  return true;
}

// ── Incremental sync: GCal → AgendaMasLife ───────────────────────────────────

export async function doIncrementalSync(professionalId: string): Promise<void> {
  const creds = await getValidToken(professionalId);
  if (!creds) return;

  const { data: secrets } = await supabase
    .from('professional_secrets')
    .select('google_sync_token, google_calendar_id, google_refresh_token')
    .eq('professional_id', professionalId)
    .maybeSingle() as { data: SecretRow | null };

  if (!secrets?.google_refresh_token) return;

  const calId = secrets.google_calendar_id || 'primary';
  let { token } = creds;

  // Build URL — use syncToken for incremental, or timeMin for first sync
  let url: string;
  if (secrets.google_sync_token) {
    url = `${GCAL_BASE}/calendars/${encodeURIComponent(calId)}/events?syncToken=${encodeURIComponent(secrets.google_sync_token)}&singleEvents=true`;
  } else {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    url = `${GCAL_BASE}/calendars/${encodeURIComponent(calId)}/events?timeMin=${encodeURIComponent(since)}&singleEvents=true&orderBy=startTime`;
  }

  let res = await gcalRequest(token, 'GET', url);

  // If syncToken expired, do full sync from scratch
  if (res.status === 410) {
    await supabase
      .from('professional_secrets')
      .update({ google_sync_token: null })
      .eq('professional_id', professionalId);
    await doIncrementalSync(professionalId);
    return;
  }

  // If 401, try refreshing token
  if (res.status === 401) {
    const newToken = await refreshAccessToken(secrets.google_refresh_token!);
    if (!newToken) return;
    await supabase
      .from('professional_secrets')
      .update({ google_access_token: newToken })
      .eq('professional_id', professionalId);
    token = newToken;
    res = await gcalRequest(token, 'GET', url);
  }

  if (!res.ok) return;

  const data = await res.json();
  const newSyncToken: string | undefined = data.nextSyncToken;
  const items: Array<Record<string, unknown>> = data.items || [];

  for (const event of items) {
    const maslifeId = (event.extendedProperties as any)?.private?.[MASLIFE_KEY] as string | undefined;
    const gcalEventId = event.id as string;
    const status = event.status as string;

    if (maslifeId) {
      // AgendaMasLife-owned event — sync changes back
      if (status === 'cancelled') {
        await supabase.from('appointments').update({ status: 'Cancelado' }).eq('id', maslifeId).eq('professional_id', professionalId);
      } else {
        // Update date/time if changed in GCal
        const startDT = (event.start as any)?.dateTime as string | undefined;
        if (startDT) {
          const d = new Date(startDT);
          const pad = (n: number) => String(n).padStart(2, '0');
          const newDate = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
          const newTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
          await supabase
            .from('appointments')
            .update({ date: newDate, time: newTime })
            .eq('id', maslifeId)
            .eq('professional_id', professionalId);
        }
      }
    } else {
      // External event — create or remove "Bloqueado" block
      if (status === 'cancelled') {
        await supabase.from('appointments').delete()
          .eq('professional_id', professionalId)
          .eq('google_event_id', gcalEventId);
      } else {
        const startDT = (event.start as any)?.dateTime as string | undefined;
        const endDT   = (event.end   as any)?.dateTime as string | undefined;
        if (!startDT) continue;

        const sDate = new Date(startDT);
        const eDate = endDT ? new Date(endDT) : new Date(sDate.getTime() + 60 * 60 * 1000);
        const durMins = Math.round((eDate.getTime() - sDate.getTime()) / 60000);
        const pad = (n: number) => String(n).padStart(2, '0');
        const date = `${sDate.getFullYear()}-${pad(sDate.getMonth()+1)}-${pad(sDate.getDate())}`;
        const time = `${pad(sDate.getHours())}:${pad(sDate.getMinutes())}`;

        // Upsert blocker using google_event_id as unique key
        const existing = await supabase
          .from('appointments')
          .select('id')
          .eq('professional_id', professionalId)
          .eq('google_event_id', gcalEventId)
          .maybeSingle();

        if (existing.data) {
          await supabase.from('appointments').update({ date, time, duration: durMins })
            .eq('id', existing.data.id);
        } else {
          await supabase.from('appointments').insert({
            id:              randomUUID(),
            professional_id: professionalId,
            patient_name:    (event.summary as string) || 'Bloqueado (Google Calendar)',
            doctor_name:     '',
            specialty:       '',
            service_name:    'Bloqueado',
            date, time,
            duration:        durMins,
            type:            'Personal',
            status:          'Bloqueado',
            price:           0,
            payment_status:  'Pendiente',
            category:        'Personal',
            google_event_id: gcalEventId,
          });
        }
      }
    }
  }

  // Save new syncToken
  if (newSyncToken) {
    await supabase
      .from('professional_secrets')
      .update({ google_sync_token: newSyncToken })
      .eq('professional_id', professionalId);
  }
}

/**
 * Sincroniza una reserva al Google Calendar del profesional, si lo tiene
 * conectado. Server-side vía refresh token guardado — no necesita la sesión del
 * profesional, así que sirve también para reservas de pacientes anónimos.
 *
 * Vivía dentro de api/book-appointment.ts, y por eso solo corría cuando el
 * paciente VOLVÍA del checkout. Si cerraba la pestaña, la cita se confirmaba y se
 * cobraba pero nunca llegaba al calendario. Al vivir aquí la usan los tres
 * caminos: reserva sin pago, retorno del checkout, y webhook/reconciliación.
 *
 * Best-effort e idempotente: el guard de google_event_id evita duplicar el evento
 * si se llama dos veces, y ningún fallo de Google voltea una reserva confirmada.
 */
export async function syncAppointmentToGoogle(professionalId: string, appointmentId: string): Promise<void> {
  try {
    const gc = await getValidToken(professionalId);
    if (!gc) return; // el profesional no conectó Google
    const { data: row } = await supabase.from('appointments').select('*').eq('id', appointmentId).single();
    if (!row || row.google_event_id) return; // ya sincronizada
    const eventId = await createGCalEvent(gc.token, gc.calendarId, appointmentToGCalEvent(row));
    if (eventId) await supabase.from('appointments').update({ google_event_id: eventId }).eq('id', appointmentId);
  } catch (e) {
    console.error('[googleCalendar] sync de reserva falló:', e);
  }
}
