import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireSupabaseAuth, checkIpRateLimit } from './_lib/auth';
import { buildPurchaseEvent, hasMatchKeys, sendMetaEvent, eventIdFor } from './_lib/metaCapi';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'POST' && req.body?.action === 'meta-conversion') return metaConversion(req, res);
  if (req.method !== 'GET') return res.status(405).end();
  if (!checkIpRateLimit(req.headers, 60, 60 * 1000)) return res.status(429).json({ error: 'Demasiadas solicitudes.' });

  // Verificar que el profesional autenticado solo acceda a sus propios pagos
  const user = await requireSupabaseAuth(req, res);
  if (!user) return;

  const { range = '30', limit = '50', professional_id } = req.query as Record<string, string>;

  if (!professional_id) {
    return res.status(400).json({ error: 'professional_id requerido' });
  }

  if (user.id !== professional_id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  // Obtener el token MP del profesional — cada profesional solo ve sus propios pagos
  const { data: secret, error: secretErr } = await supabase
    .from('professional_secrets')
    .select('mp_access_token')
    .eq('professional_id', professional_id)
    .maybeSingle();

  if (secretErr) {
    console.error('[MP payments] Supabase error:', secretErr);
    return res.status(500).json({ error: 'Error al obtener credenciales' });
  }

  if (!secret?.mp_access_token) {
    return res.status(200).json({ error: 'MP_NOT_CONNECTED', payments: [], summary: null });
  }

  const ACCESS_TOKEN = secret.mp_access_token.trim();
  const days = Math.min(parseInt(range) || 30, 90);
  const beginDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19) + '.000-03:00';

  const params = new URLSearchParams({
    sort: 'date_created',
    criteria: 'desc',
    limit: String(Math.min(parseInt(limit) || 50, 100)),
    begin_date: beginDate,
  });

  try {
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/search?${params}`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    const data = await mpRes.json();
    if (!mpRes.ok) return res.status(500).json({ error: data.message || 'MP error' });

    const payments = (data.results || []).map((p: any) => ({
      id: p.id,
      status: p.status,
      statusDetail: p.status_detail,
      amount: p.transaction_amount,
      currency: p.currency_id,
      description: p.description,
      externalRef: p.external_reference,
      payerEmail: p.payer?.email,
      payerName: p.payer?.first_name ? `${p.payer.first_name} ${p.payer.last_name || ''}`.trim() : null,
      paymentMethod: p.payment_method_id,
      paymentType: p.payment_type_id,
      createdAt: p.date_created,
      approvedAt: p.date_approved,
    }));

    const approved = payments.filter((p: any) => p.status === 'approved');
    const pending  = payments.filter((p: any) => p.status === 'pending' || p.status === 'in_process');
    const rejected = payments.filter((p: any) => p.status === 'rejected' || p.status === 'cancelled');

    return res.json({
      total: data.paging?.total || payments.length,
      payments,
      summary: {
        approvedCount:  approved.length,
        approvedAmount: approved.reduce((s: number, p: any) => s + p.amount, 0),
        pendingCount:   pending.length,
        pendingAmount:  pending.reduce((s: number, p: any) => s + p.amount, 0),
        rejectedCount:  rejected.length,
        days,
      },
    });
  } catch (err) {
    console.error('[MP payments]', err);
    return res.status(500).json({ error: 'Network error' });
  }
}

// ── Venta de anuncio → Meta Conversions API ─────────────────────
// El profesional registra un ingreso asociado a un paciente que llegó por un anuncio
// de Meta (lead_source='meta_ads') y que autorizó la medición (ad_consent). Se envía
// un evento Purchase con datos cifrados y sin información clínica (ver _lib/metaCapi).
async function metaConversion(req: VercelRequest, res: VercelResponse) {
  if (!checkIpRateLimit(req.headers, 30, 60 * 1000)) return res.status(429).json({ ok: false, reason: 'error', error: 'Demasiadas solicitudes.' });
  const user = await requireSupabaseAuth(req, res);
  if (!user) return;

  const transactionId = String(req.body?.transactionId || '');
  if (!/^[0-9a-f-]{36}$/i.test(transactionId)) return res.status(400).json({ ok: false, reason: 'error', error: 'transactionId inválido' });

  const token = process.env.META_CAPI_TOKEN;
  const datasetId = process.env.META_DATASET_ID;
  if (!token || !datasetId) return res.status(200).json({ ok: false, reason: 'not_configured', error: 'Falta META_CAPI_TOKEN o META_DATASET_ID' });

  const eventId = eventIdFor(transactionId);
  const { data: prev } = await supabase.from('ad_conversions').select('status').eq('event_id', eventId).maybeSingle();
  if (prev?.status === 'sent') return res.status(200).json({ ok: true, alreadySent: true });

  const { data: tx, error: txErr } = await supabase
    .from('transactions').select('id, amount, date, type, professional_id, patient_id')
    .eq('id', transactionId).maybeSingle();
  if (txErr) return res.status(500).json({ ok: false, reason: 'error', error: 'No se pudo leer la transacción' });
  if (!tx || tx.professional_id !== user.id) return res.status(404).json({ ok: false, reason: 'error', error: 'Transacción no encontrada' });
  if (tx.type !== 'Ingreso' || !tx.patient_id) return res.status(200).json({ ok: false, reason: 'not_ad', error: 'El ingreso no tiene paciente asociado' });

  const { data: pac, error: pacErr } = await supabase
    .from('patients').select('id, name, phone, email, lead_source, ad_consent, professional_id')
    .eq('id', tx.patient_id).maybeSingle();
  if (pacErr) return res.status(500).json({ ok: false, reason: 'error', error: 'No se pudo leer el paciente' });
  if (!pac || pac.professional_id !== user.id) return res.status(404).json({ ok: false, reason: 'error', error: 'Paciente no encontrado' });
  if (pac.lead_source !== 'meta_ads') return res.status(200).json({ ok: false, reason: 'not_ad', error: 'El paciente no llegó por un anuncio' });
  if (!pac.ad_consent) return res.status(200).json({ ok: false, reason: 'no_consent', error: 'El paciente no autorizó la medición' });

  const ev = buildPurchaseEvent({
    transactionId, patientId: pac.id, amount: Number(tx.amount) || 0, date: String(tx.date || ''),
    phone: pac.phone, email: pac.email, fullName: pac.name,
  });
  if (!hasMatchKeys(ev)) return res.status(200).json({ ok: false, reason: 'error', error: 'El paciente no tiene teléfono ni correo válidos' });

  let result: { ok: boolean; status: number; body: unknown };
  try {
    result = await sendMetaEvent(ev, { datasetId, token, testCode: process.env.META_CAPI_TEST_CODE || undefined });
  } catch (err) {
    console.error('[meta-conversion] red', (err as Error)?.message);
    result = { ok: false, status: 0, body: { error: 'network' } };
  }

  const { error: logErr } = await supabase.from('ad_conversions').upsert({
    professional_id: user.id, patient_id: pac.id, transaction_id: transactionId,
    amount: ev.custom_data.value, event_id: eventId, event_time: new Date(ev.event_time * 1000).toISOString(),
    status: result.ok ? 'sent' : 'error', meta_response: result.body as object,
  }, { onConflict: 'event_id' });
  if (logErr) console.error('[meta-conversion] registro', logErr.message);

  if (!result.ok) {
    const msg = (result.body as { error?: { message?: string } })?.error?.message || `Meta respondió ${result.status}`;
    console.error('[meta-conversion] Meta', result.status, msg);
    return res.status(502).json({ ok: false, reason: 'error', error: msg });
  }
  return res.status(200).json({ ok: true });
}
