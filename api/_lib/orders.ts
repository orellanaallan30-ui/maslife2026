import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getProduct } from './products';

// Pedidos de productos digitales: crear el cobro, confirmar el pago, entregar el
// enlace de descarga y canjearlo. Todo corre en el servidor con service_role; la
// tabla `orders` no tiene políticas RLS, así que el cliente nunca la toca.

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

const ORIGIN = 'https://clinicamaslife.cl';
export const ORDER_REF_PREFIX = 'ebook:';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DOWNLOAD_TTL_DAYS = 7;
const SIGNED_URL_SECONDS = 60;

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

export const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

/** Compara el token recibido con el hash guardado, en tiempo constante. */
export function tokenMatches(storedHash: string | null | undefined, token: string): boolean {
  if (!storedHash || !TOKEN_RE.test(token)) return false;
  const a = Buffer.from(storedHash, 'hex');
  const b = Buffer.from(hashToken(token), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const platformToken = () => (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();

export interface OrderRow {
  id: string; product_slug: string; buyer_name: string; buyer_email: string;
  amount: number; currency: string; status: string; mp_payment_id: string | null;
  download_token_hash: string | null; expires_at: string | null;
  download_count: number; max_downloads: number; delivered_at: string | null;
}

type Result<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; code: number; error: string };

/** Crea el pedido (pendiente) y la preferencia de MercadoPago con el token de la plataforma. */
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;

/** Deja solo las 4 UTM esperadas, como texto corto y sin caracteres raros. */
export function cleanUtms(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of UTM_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'string' && /^[\w\-.~%+ ]{1,100}$/.test(v)) out[k] = v;
  }
  return out;
}

export async function createOrder(input: {
  slug?: unknown; name?: unknown; email?: unknown; acceptedTerms?: unknown; utm?: unknown;
}): Promise<Result<{ init_point: string; orderId: string }>> {
  const token = platformToken();
  if (!token) return { ok: false, code: 503, error: 'MP_NOT_CONFIGURED' };

  const product = getProduct(String(input.slug || ''));
  if (!product) return { ok: false, code: 404, error: 'Producto no encontrado' };
  if (!product.active) return { ok: false, code: 409, error: 'Este programa aún no está a la venta' };

  const name = String(input.name || '').trim().replace(/\s+/g, ' ');
  const email = String(input.email || '').trim().toLowerCase();
  if (name.length < 2 || name.length > 120) return { ok: false, code: 400, error: 'Ingresa tu nombre' };
  if (!EMAIL_RE.test(email)) return { ok: false, code: 400, error: 'Ingresa un correo válido' };
  if (input.acceptedTerms !== true) return { ok: false, code: 400, error: 'Debes aceptar los términos para comprar' };

  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      product_slug: product.slug, buyer_name: name, buyer_email: email,
      amount: product.price, currency: 'CLP', status: 'pendiente',
      accepted_terms_at: new Date().toISOString(),
      ...cleanUtms(input.utm),
    })
    .select('id')
    .single();
  if (error || !order) {
    console.error('[orders] no se pudo crear el pedido:', error?.message);
    return { ok: false, code: 500, error: 'No se pudo crear el pedido' };
  }

  const back = `${ORIGIN}/programas/gracias?order=${order.id}`;
  try {
    const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `order-${order.id}`,
      },
      body: JSON.stringify({
        items: [{ id: product.slug, title: product.name.slice(0, 250), quantity: 1, unit_price: product.price, currency_id: 'CLP' }],
        external_reference: `${ORDER_REF_PREFIX}${order.id}`,
        back_urls: { success: back, failure: back, pending: back },
        notification_url: `${ORIGIN}/api/mp-webhook`,
        // Solo medios inmediatos: el programa se entrega al aprobarse el pago.
        payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }] },
        auto_return: 'approved',
        statement_descriptor: 'CLINICAMASLIFE',
        payer: { email, name },
      }),
    });
    const pref: any = await r.json();
    if (!r.ok || !pref.init_point) {
      console.error('[orders] MP rechazó la preferencia:', JSON.stringify(pref).slice(0, 300));
      await supabase.from('orders').update({ status: 'cancelado' }).eq('id', order.id);
      return { ok: false, code: 502, error: 'No se pudo iniciar el pago' };
    }
    await supabase.from('orders').update({ mp_preference_id: String(pref.id) }).eq('id', order.id);
    return { ok: true, data: { init_point: pref.init_point, orderId: order.id } };
  } catch (e: any) {
    console.error('[orders] error de red con MP:', e?.message);
    await supabase.from('orders').update({ status: 'cancelado' }).eq('id', order.id);
    return { ok: false, code: 502, error: 'No se pudo iniciar el pago' };
  }
}

/** Busca un pago aprobado del pedido en MercadoPago por su referencia externa. */
async function findApprovedPayment(orderId: string): Promise<any | null> {
  const token = platformToken();
  if (!token) return null;
  const r = await fetch(
    `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(ORDER_REF_PREFIX + orderId)}&sort=date_created&criteria=desc`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) return null;
  const j: any = await r.json();
  return (j.results || []).find((p: any) => p.status === 'approved') || null;
}

/** Consulta un pago por id en MercadoPago. */
async function fetchPayment(paymentId: string): Promise<any | null> {
  const token = platformToken();
  if (!token) return null;
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return r.json();
}

/**
 * Marca el pedido como pagado SOLO si el pago es real: aprobado, con la referencia
 * de este pedido, en CLP y por el monto exacto. Es idempotente: una segunda
 * notificación del mismo pago no hace nada nuevo.
 */
export async function confirmPaidOrder(orderId: string, payment: any): Promise<'pagado' | 'ya-pagado' | 'rechazado'> {
  if (!UUID_RE.test(orderId) || !payment) return 'rechazado';
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!order) return 'rechazado';

  const valid =
    payment.status === 'approved' &&
    String(payment.external_reference || '') === `${ORDER_REF_PREFIX}${orderId}` &&
    String(payment.currency_id || 'CLP') === order.currency &&
    Math.round(Number(payment.transaction_amount) || 0) === order.amount;
  if (!valid) {
    console.error('[orders] pago no válido para el pedido', orderId, payment?.status, payment?.transaction_amount);
    return 'rechazado';
  }

  if (order.status === 'pendiente') {
    const { data: upd, error } = await supabase
      .from('orders')
      .update({ status: 'pagado', mp_payment_id: String(payment.id), paid_at: payment.date_approved || new Date().toISOString() })
      .eq('id', orderId).eq('status', 'pendiente')
      .select('id').maybeSingle();
    if (error) {
      console.error('[orders] no se pudo marcar como pagado:', error.message);
      return 'rechazado';
    }
    if (upd) return 'pagado';
  }
  return 'ya-pagado';
}

/**
 * Entrega el enlace por correo, una sola vez por pedido. Reclama la entrega de forma
 * atómica (delivered_at) y la libera si el envío falla, para que se pueda reintentar.
 */
export async function deliverOrder(orderId: string): Promise<'enviado' | 'ya-enviado' | 'error'> {
  const { data: claimed } = await supabase
    .from('orders')
    .update({ delivered_at: new Date().toISOString() })
    .eq('id', orderId).eq('status', 'pagado').is('delivered_at', null)
    .select('id').maybeSingle();
  if (!claimed) return 'ya-enviado';

  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + DOWNLOAD_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  const release = () => supabase.from('orders').update({ delivered_at: null }).eq('id', orderId);

  const { error } = await supabase
    .from('orders')
    .update({ download_token_hash: hashToken(token), expires_at: expires, download_count: 0 })
    .eq('id', orderId);
  if (error) { console.error('[orders] no se pudo guardar el token:', error.message); await release(); return 'error'; }

  try {
    const base = (process.env.PUBLIC_BASE_URL || ORIGIN).replace(/\/$/, '');
    const r = await fetch(`${base}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ebook-delivery', orderId, token }),
    });
    if (!r.ok) {
      console.error('[orders] el envío del correo falló:', r.status, await r.text().catch(() => ''));
      await release();
      return 'error';
    }
    return 'enviado';
  } catch (e: any) {
    console.error('[orders] error enviando el correo:', e?.message);
    await release();
    return 'error';
  }
}

/** Verifica el pago (por id o buscándolo), lo confirma y entrega. Para el retorno de MercadoPago. */
export async function confirmAndDeliver(orderId: string, paymentId?: string): Promise<Result<{ status: string; entregado: boolean }>> {
  if (!UUID_RE.test(orderId)) return { ok: false, code: 400, error: 'Pedido inválido' };
  const { data: order } = await supabase.from('orders').select('id,status,delivered_at').eq('id', orderId).maybeSingle();
  if (!order) return { ok: false, code: 404, error: 'Pedido no encontrado' };

  if (order.status === 'pendiente') {
    const payment = paymentId ? await fetchPayment(paymentId) : await findApprovedPayment(orderId);
    if (!payment) return { ok: true, data: { status: 'pendiente', entregado: false } };
    const r = await confirmPaidOrder(orderId, payment);
    if (r === 'rechazado') return { ok: true, data: { status: 'pendiente', entregado: false } };
  }
  const d = await deliverOrder(orderId);
  const { data: after } = await supabase.from('orders').select('status,delivered_at').eq('id', orderId).maybeSingle();
  return { ok: true, data: { status: after?.status || 'pendiente', entregado: d !== 'error' && !!after?.delivered_at } };
}

/** Estado público mínimo de un pedido (sin datos personales). */
export async function orderStatus(orderId: string): Promise<Result<{ status: string; entregado: boolean }>> {
  if (!UUID_RE.test(orderId)) return { ok: false, code: 400, error: 'Pedido inválido' };
  const { data } = await supabase.from('orders').select('status,delivered_at').eq('id', orderId).maybeSingle();
  if (!data) return { ok: false, code: 404, error: 'Pedido no encontrado' };
  return { ok: true, data: { status: data.status, entregado: !!data.delivered_at } };
}

/** Canjea el token del correo por una URL firmada de pocos segundos. Cuenta cada descarga. */
export async function consumeDownload(token: string): Promise<Result<{ url: string; restantes: number }>> {
  if (!TOKEN_RE.test(token)) return { ok: false, code: 404, error: 'Enlace no válido' };
  const { data: order } = await supabase
    .from('orders').select('*').eq('download_token_hash', hashToken(token)).maybeSingle();
  if (!order || order.status !== 'pagado') return { ok: false, code: 404, error: 'Enlace no válido' };
  if (!order.expires_at || new Date(order.expires_at).getTime() < Date.now()) {
    return { ok: false, code: 410, error: 'Este enlace venció. Escríbenos y te enviamos uno nuevo.' };
  }
  if (order.download_count >= order.max_downloads) {
    return { ok: false, code: 429, error: 'Llegaste al máximo de descargas. Escríbenos y te ayudamos.' };
  }
  const product = getProduct(order.product_slug);
  if (!product) return { ok: false, code: 404, error: 'Producto no encontrado' };

  const { data: signed, error } = await supabase.storage
    .from('ebook-files').createSignedUrl(product.filePath, SIGNED_URL_SECONDS, { download: product.fileName });
  if (error || !signed?.signedUrl) {
    console.error('[orders] no se pudo firmar la URL:', error?.message);
    return { ok: false, code: 503, error: 'El archivo no está disponible por ahora. Intenta en unos minutos.' };
  }

  // Cuenta la descarga con concurrencia optimista: dos clics a la vez no pasan el tope.
  const usadas = order.download_count + 1;
  const { data: counted } = await supabase
    .from('orders').update({ download_count: usadas })
    .eq('id', order.id).eq('download_count', order.download_count)
    .select('id').maybeSingle();
  if (!counted) return { ok: false, code: 409, error: 'Intenta de nuevo' };

  return { ok: true, data: { url: signed.signedUrl, restantes: order.max_downloads - usadas } };
}
