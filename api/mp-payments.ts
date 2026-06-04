import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireSupabaseAuth } from './_lib/auth';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

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
