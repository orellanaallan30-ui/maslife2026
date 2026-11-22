import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getProduct } from './products';
import { buildEbookPurchaseEvent, sendMetaEvent, META_DATASET_DEFAULT } from './metaCapi';

// Pedidos de productos digitales: crear el cobro, confirmar el pago, entregar el
// enlace de descarga y canjearlo. Todo corre en el servidor con service_role; la
// tabla `orders` no tiene políticas RLS, así que el cliente nunca la toca.

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

const ORIGIN = 'https://clinicamaslife.cl';
export const ORDER_REF_PREFIX = 'ebook:';
/** Pedidos de la tienda física (Dropi). Mismo cobro y webhook que la guía. */
export const SHOP_REF_PREFIX = 'shop:';
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

/**
 * Identificadores del navegador que ayudan a Meta a reconocer la compra (user agent y
 * cookies del píxel). Se guardan solo si tienen el formato esperado.
 */
export function cleanMetaIds(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.ua === 'string' && r.ua.trim()) out.client_ua = r.ua.trim().slice(0, 400);
  if (typeof r.fbp === 'string' && /^fb\.\d\.\d{6,}\.\d{4,}$/.test(r.fbp)) out.meta_fbp = r.fbp;
  if (typeof r.fbc === 'string' && /^fb\.\d\.\d{6,}\.[\w-]{1,300}$/.test(r.fbc)) out.meta_fbc = r.fbc;
  return out;
}

/**
 * Informa la venta a Meta desde el servidor, para no depender de que el comprador vuelva
 * a la página de gracias. Nunca frena la venta: si falla o no está configurado, solo se registra.
 */
export type MetaReport = { ok: true; body: unknown } | { ok: false; reason: 'not_configured' | 'rejected' | 'network'; detail?: unknown };

async function reportPurchaseToMeta(order: any): Promise<MetaReport> {
  const token = (process.env.META_CAPI_TOKEN || '').trim();
  const datasetId = (process.env.META_DATASET_ID || META_DATASET_DEFAULT).trim();
  if (!token || !datasetId) {
    // Sin token la venta no llega a Meta: se deja constancia (antes salía callado).
    console.warn('[orders] META_CAPI_TOKEN no configurado: la venta no se informó a Meta');
    return { ok: false, reason: 'not_configured' };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    // Tienda: SKU y cantidades (mismos ids que el píxel y el catálogo) y teléfono cifrado.
    let tienda: { contents?: Array<{ id: string; quantity: number; item_price: number }>; phone?: string | null; sourceUrl?: string } = {};
    if (order.tipo === 'tienda') {
      const [{ data: items }, { data: cli }] = await Promise.all([
        supabase.from('order_items').select('sku, cantidad, precio_unitario').eq('order_id', order.id),
        order.customer_id
          ? supabase.from('shop_customers').select('telefono').eq('id', order.customer_id).maybeSingle()
          : Promise.resolve({ data: null as any }),
      ]);
      tienda = {
        contents: (items || []).map((i: any) => ({ id: i.sku, quantity: i.cantidad, item_price: i.precio_unitario })),
        phone: cli?.telefono ?? null,
        sourceUrl: 'https://clinicamaslife.cl/tienda/gracias',
      };
    }
    const ev = buildEbookPurchaseEvent({
      orderId: order.id, productSlug: order.product_slug || 'tienda', amount: order.amount,
      email: order.buyer_email, fullName: order.buyer_name,
      userAgent: order.client_ua, fbp: order.meta_fbp, fbc: order.meta_fbc,
      ...tienda,
    });
    const r = await sendMetaEvent(ev, { datasetId, token, testCode: (process.env.META_CAPI_TEST_CODE || '').trim() || undefined, signal: ctrl.signal });
    if (!r.ok) {
      console.error('[orders] Meta no aceptó la venta:', r.status, JSON.stringify(r.body).slice(0, 300));
      return { ok: false, reason: 'rejected', detail: r.body };
    }
    return { ok: true, body: r.body };
  } catch (e: any) {
    console.error('[orders] no se pudo informar la venta a Meta:', e?.message);
    return { ok: false, reason: 'network', detail: e?.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prueba desde el panel admin: vuelve a informar a Meta el último pedido pagado.
 * Usa el mismo event_id (el id del pedido), así que Meta no lo cuenta dos veces.
 */
export async function resendLastPaidToMeta(): Promise<MetaReport | { ok: false; reason: 'no_orders' }> {
  const { data: order } = await supabase
    .from('orders')
    .select('id, product_slug, amount, buyer_email, buyer_name, client_ua, meta_fbp, meta_fbc')
    .eq('status', 'pagado')
    .order('paid_at', { ascending: false })
    .limit(1).maybeSingle();
  if (!order) return { ok: false, reason: 'no_orders' };
  return reportPurchaseToMeta(order);
}

export async function createOrder(input: {
  slug?: unknown; name?: unknown; email?: unknown; acceptedTerms?: unknown; utm?: unknown; meta?: unknown;
}): Promise<Result<{ init_point: string; orderId: string }>> {
  if (!platformToken()) return { ok: false, code: 503, error: 'MP_NOT_CONFIGURED' };

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
      ...cleanMetaIds(input.meta),
    })
    .select('id')
    .single();
  if (error || !order) {
    console.error('[orders] no se pudo crear el pedido:', error?.message);
    return { ok: false, code: 500, error: 'No se pudo crear el pedido' };
  }

  return crearPreferenciaMP({
    orderId: order.id,
    refPrefix: ORDER_REF_PREFIX,
    backPath: '/programas/gracias',
    items: [{ id: product.slug, title: product.name, quantity: 1, unit_price: product.price }],
    payer: { email, name },
  });
}

/**
 * Crea la preferencia de Checkout Pro de un pedido ya insertado como 'pendiente'.
 * Los montos vienen siempre del servidor. Si MercadoPago falla, el pedido queda
 * 'cancelado' para que no aparezca como una venta en curso.
 */
export async function crearPreferenciaMP(p: {
  orderId: string;
  refPrefix: string;
  backPath: string;
  items: Array<{ id: string; title: string; quantity: number; unit_price: number }>;
  payer: { email: string; name: string };
  /** Minutos de vigencia del link de pago (la tienda usa 120: evita pagar un link viejo). */
  expiraEnMin?: number;
  /** Guarda el link en el pedido para reutilizarlo si la misma compra llega dos veces. */
  guardarLink?: boolean;
}): Promise<Result<{ init_point: string; orderId: string }>> {
  const token = platformToken();
  if (!token) return { ok: false, code: 503, error: 'MP_NOT_CONFIGURED' };
  const back = `${ORIGIN}${p.backPath}?order=${p.orderId}`;
  const vencimiento = p.expiraEnMin
    ? { expires: true, expiration_date_from: new Date(Date.now() - 60_000).toISOString(), expiration_date_to: new Date(Date.now() + p.expiraEnMin * 60_000).toISOString() }
    : {};
  try {
    const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `order-${p.orderId}`,
      },
      body: JSON.stringify({
        items: p.items.map(it => ({ ...it, title: it.title.slice(0, 250), currency_id: 'CLP' })),
        external_reference: `${p.refPrefix}${p.orderId}`,
        back_urls: { success: back, failure: back, pending: back },
        notification_url: `${ORIGIN}/api/mp-webhook`,
        // Solo medios inmediatos: el pedido se procesa al aprobarse el pago.
        payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }] },
        auto_return: 'approved',
        statement_descriptor: 'CLINICAMASLIFE',
        payer: p.payer,
        ...vencimiento,
      }),
    });
    const pref: any = await r.json();
    if (!r.ok || !pref.init_point) {
      console.error('[orders] MP rechazó la preferencia:', JSON.stringify(pref).slice(0, 300));
      await supabase.from('orders').update({ status: 'cancelado' }).eq('id', p.orderId);
      return { ok: false, code: 502, error: 'No se pudo iniciar el pago' };
    }
    const guardar: Record<string, string> = { mp_preference_id: String(pref.id) };
    if (p.guardarLink && /^https:\/\//.test(String(pref.init_point))) guardar.mp_init_point = String(pref.init_point);
    const { error: eGuardar } = await supabase.from('orders').update(guardar).eq('id', p.orderId);
    if (eGuardar) console.error('[orders] no se pudo guardar la preferencia:', eGuardar.message);
    return { ok: true, data: { init_point: pref.init_point, orderId: p.orderId } };
  } catch (e: any) {
    console.error('[orders] error de red con MP:', e?.message);
    await supabase.from('orders').update({ status: 'cancelado' }).eq('id', p.orderId);
    return { ok: false, code: 502, error: 'No se pudo iniciar el pago' };
  }
}

/** Busca un pago aprobado del pedido en MercadoPago por su referencia externa. */
export async function findApprovedPayment(orderId: string, refPrefix: string = ORDER_REF_PREFIX): Promise<any | null> {
  const token = platformToken();
  if (!token) return null;
  const r = await fetch(
    `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(refPrefix + orderId)}&sort=date_created&criteria=desc`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) return null;
  const j: any = await r.json();
  return (j.results || []).find((p: any) => p.status === 'approved') || null;
}

/** Consulta un pago por id en MercadoPago. */
export async function fetchPayment(paymentId: string): Promise<any | null> {
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
    String(payment.external_reference || '') === `${order.tipo === 'tienda' ? SHOP_REF_PREFIX : ORDER_REF_PREFIX}${orderId}` &&
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
    if (upd) {
      // El cambio a 'pagado' ocurre una sola vez, así que la venta se informa una sola vez.
      await reportPurchaseToMeta(order);
      return 'pagado';
    }
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
