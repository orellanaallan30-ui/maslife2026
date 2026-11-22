// Tienda MasLife (dropshipping con Dropi Chile): catálogo público, pedido con
// cobro en MercadoPago, panel admin y sincronización de stock.
// Todo corre en el servidor con service_role: las tablas shop_* tienen RLS sin
// políticas. Los compradores van en shop_customers, nunca en patients.
// Se despacha desde endpoints existentes (límite de 12 funciones en Vercel):
//   público → api/book-appointment.ts (acciones shop-*)
//   admin   → api/admin-auth.ts (?action=shop-*, con token admin)
//   cobro   → api/process-payment.ts (acción create-shop-order)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import {
  calcularPrecioVenta, normalizarProductoDropi, calcularCarrito, validarDestino, tarifaEnvio,
  puedePublicar, estadoTrasSincronizar, CATEGORIAS_TIENDA, SETTINGS_POR_DEFECTO,
  type ShopSettings, type ProductoTienda, type CategoriaTienda,
} from './shopRules';
import { listarProductosDropi, obtenerProductoDropi } from './dropi';
import {
  crearPreferenciaMP, confirmPaidOrder, findApprovedPayment, fetchPayment, cleanUtms, cleanMetaIds,
  SHOP_REF_PREFIX, UUID_RE,
} from './orders';
import { REGIONES_DROPI, LOCALIDADES_DROPI } from './dropiPlaces';
import { internalKey, INTERNAL_HEADER } from './auth';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

type Result<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; code: number; error: string };

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const SKU_RE = /^[A-Z0-9-]{3,40}$/;
const COLUMNAS_PUBLICAS = 'sku, nombre, descripcion, imagenes, categoria, precio_venta, estado';

// ── Ajustes ───────────────────────────────────────────────────────────────

interface SettingsRow {
  margen: number | string; comision_pct: number | string; umbral_stock: number; retencion_min: number;
  envio_dropi_activo: boolean; tarifas_region: Record<string, number> | null; tienda_activa: boolean; contra_entrega: boolean;
}

export async function leerAjustes(): Promise<ShopSettings & { tiendaActiva: boolean }> {
  const { data } = await supabase.from('shop_settings').select('*').eq('id', true).maybeSingle();
  const r = data as SettingsRow | null;
  if (!r) return { ...SETTINGS_POR_DEFECTO, tiendaActiva: false };
  return {
    margen: Number(r.margen),
    comisionPct: Number(r.comision_pct),
    umbralStock: r.umbral_stock,
    retencionMin: r.retencion_min,
    envioDropiActivo: r.envio_dropi_activo,
    tarifasRegion: r.tarifas_region || {},
    tiendaActiva: r.tienda_activa,
  };
}

// ── Público ───────────────────────────────────────────────────────────────

const aPublico = (p: any, umbral: number) => ({
  sku: p.sku, nombre: p.nombre, descripcion: p.descripcion, imagenes: p.imagenes || [],
  categoria: p.categoria, precio: p.precio_venta,
  agotado: p.estado === 'agotado' || (typeof p.stock === 'number' && p.stock < umbral),
});

/** Catálogo visible: solo productos aprobados (publicado o agotado). Nunca expone el costo. */
export async function catalogoPublico(): Promise<Result<{ activa: boolean; productos: any[]; regiones: any[] }>> {
  const s = await leerAjustes();
  if (!s.tiendaActiva) return { ok: true, data: { activa: false, productos: [], regiones: [] } };
  const { data, error } = await supabase
    .from('shop_products').select(`${COLUMNAS_PUBLICAS}, stock`)
    .in('estado', ['publicado', 'agotado']).order('nombre');
  if (error) { console.error('[shop] catálogo:', error.message); return { ok: false, code: 500, error: 'No se pudo cargar la tienda' }; }
  const regiones = REGIONES_DROPI
    .filter(r => tarifaEnvio(s.tarifasRegion, r.codigo) !== null)
    .map(r => ({
      codigo: r.codigo, nombre: r.nombre, envio: tarifaEnvio(s.tarifasRegion, r.codigo),
      localidades: [...(LOCALIDADES_DROPI[r.codigo] || [])].sort((a, b) => a.localeCompare(b, 'es')),
    }));
  return { ok: true, data: { activa: true, productos: (data || []).map(p => aPublico(p, s.umbralStock)), regiones } };
}

export async function productoPublico(sku: string): Promise<Result<{ producto: any }>> {
  if (!SKU_RE.test(sku)) return { ok: false, code: 404, error: 'Producto no encontrado' };
  const s = await leerAjustes();
  if (!s.tiendaActiva) return { ok: false, code: 404, error: 'Producto no encontrado' };
  const { data } = await supabase.from('shop_products').select(`${COLUMNAS_PUBLICAS}, stock`).eq('sku', sku).maybeSingle();
  if (!data || !['publicado', 'agotado'].includes(data.estado)) return { ok: false, code: 404, error: 'Producto no encontrado' };
  return { ok: true, data: { producto: aPublico(data, s.umbralStock) } };
}

/** Normaliza un teléfono chileno: 9 dígitos → +569XXXXXXXX. */
export function normalizarTelefono(raw: unknown): string | null {
  const d = String(raw || '').replace(/[^\d+]/g, '');
  const solo = d.replace(/^\+/, '');
  if (/^9\d{8}$/.test(solo)) return `+56${solo}`;
  if (/^569\d{8}$/.test(solo)) return `+${solo}`;
  if (/^\d{8,15}$/.test(solo) && d.startsWith('+')) return `+${solo}`;
  return null;
}

/**
 * Crea el pedido de la tienda y su cobro en MercadoPago. El cliente solo envía
 * sku + cantidad + datos de despacho: precios, flete y total salen de la BD.
 */
export async function crearPedidoTienda(input: any): Promise<Result<{ init_point: string; orderId: string }>> {
  const s = await leerAjustes();
  if (!s.tiendaActiva) return { ok: false, code: 409, error: 'La tienda aún no está abierta' };

  const nombre = String(input?.name || '').trim().replace(/\s+/g, ' ');
  const email = String(input?.email || '').trim().toLowerCase();
  const telefono = normalizarTelefono(input?.phone);
  const direccion = String(input?.address || '').trim().replace(/\s+/g, ' ');
  if (nombre.length < 2 || nombre.length > 120) return { ok: false, code: 400, error: 'Ingresa tu nombre' };
  if (!EMAIL_RE.test(email)) return { ok: false, code: 400, error: 'Ingresa un correo válido' };
  if (!telefono) return { ok: false, code: 400, error: 'Ingresa un teléfono válido (+569...)' };
  if (direccion.length < 5 || direccion.length > 200) return { ok: false, code: 400, error: 'Ingresa la dirección de despacho' };
  if (input?.acceptedTerms !== true) return { ok: false, code: 400, error: 'Debes aceptar los términos para comprar' };

  const codigoRegion = String(input?.region || '');
  const destino = validarDestino(codigoRegion, String(input?.comuna || ''));
  if (destino.ok === false) return { ok: false, code: 400, error: destino.error };
  const envio = tarifaEnvio(s.tarifasRegion, codigoRegion);
  if (envio === null) return { ok: false, code: 409, error: 'Todavía no despachamos a esa región' };

  const items = Array.isArray(input?.items) ? input.items : [];
  const skus = [...new Set(items.map((i: any) => String(i?.sku ?? '')))].filter(x => SKU_RE.test(x as string)) as string[];
  if (skus.length === 0) return { ok: false, code: 400, error: 'El carrito está vacío' };
  const { data: productos, error: eProd } = await supabase
    .from('shop_products').select('id, sku, nombre, categoria, precio_venta, costo, stock, estado, resolucion_sanitaria, aprobado_at')
    .in('sku', skus);
  if (eProd) { console.error('[shop] productos del carrito:', eProd.message); return { ok: false, code: 500, error: 'No se pudo crear el pedido' }; }
  const carrito = calcularCarrito(items, (productos || []) as any, s.umbralStock);
  if (carrito.ok === false) return { ok: false, code: 409, error: carrito.error };

  const clienteId = await guardarCliente(nombre, email, telefono);
  if (!clienteId) return { ok: false, code: 500, error: 'No se pudo crear el pedido' };

  const { data: order, error } = await supabase.from('orders').insert({
    tipo: 'tienda', buyer_name: nombre, buyer_email: email, customer_id: clienteId,
    amount: carrito.subtotal + envio, currency: 'CLP', status: 'pendiente',
    region: codigoRegion, comuna: destino.ciudad, direccion, envio_monto: envio, metodo_pago: 'online',
    accepted_terms_at: new Date().toISOString(),
    ...cleanUtms(input?.utm),
    ...cleanMetaIds(input?.meta),
  }).select('id').single();
  if (error || !order) {
    console.error('[shop] no se pudo crear el pedido:', error?.message);
    return { ok: false, code: 500, error: 'No se pudo crear el pedido' };
  }

  const porSku = new Map((productos || []).map((p: any) => [p.sku, p]));
  const { error: eItems } = await supabase.from('order_items').insert(carrito.lineas.map(l => ({
    order_id: order.id, product_id: porSku.get(l.sku)!.id, sku: l.sku, nombre: l.nombre,
    cantidad: l.cantidad, precio_unitario: l.precioUnitario, costo_unitario: l.costoUnitario,
  })));
  if (eItems) {
    console.error('[shop] no se pudieron guardar las líneas:', eItems.message);
    await supabase.from('orders').update({ status: 'cancelado' }).eq('id', order.id);
    return { ok: false, code: 500, error: 'No se pudo crear el pedido' };
  }

  return crearPreferenciaMP({
    orderId: order.id,
    refPrefix: SHOP_REF_PREFIX,
    backPath: '/tienda/gracias',
    items: [
      ...carrito.lineas.map(l => ({ id: l.sku, title: l.nombre, quantity: l.cantidad, unit_price: l.precioUnitario })),
      ...(envio > 0 ? [{ id: 'envio', title: `Envío a ${destino.ciudad}`, quantity: 1, unit_price: envio }] : []),
    ],
    payer: { email, name: nombre },
  });
}

async function guardarCliente(nombre: string, email: string, telefono: string): Promise<string | null> {
  const { data: existe } = await supabase.from('shop_customers').select('id').eq('email', email).maybeSingle();
  if (existe) {
    const { error } = await supabase.from('shop_customers')
      .update({ nombre, telefono, updated_at: new Date().toISOString() }).eq('id', existe.id);
    if (error) console.error('[shop] no se pudo actualizar el cliente:', error.message);
    return existe.id;
  }
  const { data, error } = await supabase.from('shop_customers').insert({ nombre, email, telefono }).select('id').single();
  if (error || !data) { console.error('[shop] no se pudo guardar el cliente:', error?.message); return null; }
  return data.id;
}

/** Estado del pedido al volver de MercadoPago. Verifica el pago contra MP si sigue pendiente. */
export async function estadoPedidoTienda(orderId: string, paymentId?: string): Promise<Result<{ status: string }>> {
  if (!UUID_RE.test(orderId)) return { ok: false, code: 400, error: 'Pedido inválido' };
  const { data: order } = await supabase.from('orders').select('id, status, tipo').eq('id', orderId).maybeSingle();
  if (!order || order.tipo !== 'tienda') return { ok: false, code: 404, error: 'Pedido no encontrado' };
  if (order.status === 'pendiente') {
    const payment = paymentId ? await fetchPayment(paymentId) : await findApprovedPayment(orderId, SHOP_REF_PREFIX);
    if (payment) {
      const r = await confirmPaidOrder(orderId, payment);
      if (r === 'pagado') await alPagarPedidoTienda(orderId);
      if (r !== 'rechazado') return { ok: true, data: { status: 'pagado' } };
    }
  }
  return { ok: true, data: { status: order.status } };
}

/** Pide a /api/notify un aviso de la tienda. El destinatario lo decide notify desde la BD. */
async function avisar(tipo: 'nuevo-pedido' | 'enviado', orderId: string): Promise<boolean> {
  try {
    const base = (process.env.PUBLIC_BASE_URL || 'https://clinicamaslife.cl').replace(/\/$/, '');
    const r = await fetch(`${base}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [INTERNAL_HEADER]: internalKey() },
      body: JSON.stringify({ action: 'shop-aviso', tipo, orderId }),
    });
    if (!r.ok) console.error(`[shop] aviso ${tipo} no salió:`, r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (e: any) {
    console.error(`[shop] aviso ${tipo} falló:`, e?.message);
    return false;
  }
}

/**
 * Tras confirmarse el pago: descuenta el stock propio (una sola vez, en la BD) y
 * avisa a Rodrigo por correo. Lo llaman el webhook de MP y el retorno del checkout;
 * solo el primero que reclama el pedido envía el aviso.
 */
export async function alPagarPedidoTienda(orderId: string): Promise<{ descontado: boolean; avisado: boolean }> {
  const { data, error } = await supabase.rpc('shop_descontar_stock', { p_order: orderId });
  if (error) {
    console.error('[shop] no se pudo descontar el stock de', orderId, error.message);
    return { descontado: false, avisado: false };
  }
  if (data !== true) return { descontado: false, avisado: false };
  return { descontado: true, avisado: await avisar('nuevo-pedido', orderId) };
}

/** Rodrigo marca un pedido como despachado: guarda el seguimiento y avisa al cliente. */
export async function marcarEnviado(input: any): Promise<Result<{ avisado: boolean }>> {
  const orderId = String(input?.orderId || '');
  if (!UUID_RE.test(orderId)) return { ok: false, code: 400, error: 'Pedido inválido' };
  const transportista = String(input?.transportista || '').trim().slice(0, 60);
  const tracking = String(input?.tracking || '').trim().slice(0, 80);
  const url = String(input?.url || '').trim();
  if (!transportista || !tracking) return { ok: false, code: 400, error: 'Indica transportista y número de seguimiento' };
  if (url && !/^https:\/\/[^\s]{4,300}$/.test(url)) return { ok: false, code: 400, error: 'El enlace de seguimiento debe empezar con https://' };
  const { data, error } = await supabase.from('orders')
    .update({ despacho_estado: 'enviado', transportista, tracking, url_seguimiento: url || null, despachado_at: new Date().toISOString() })
    .eq('id', orderId).eq('tipo', 'tienda').eq('status', 'pagado')
    .select('id').maybeSingle();
  if (error) { console.error('[shop] marcar enviado:', error.message); return { ok: false, code: 500, error: 'No se pudo guardar' }; }
  if (!data) return { ok: false, code: 409, error: 'El pedido no está pagado' };
  return { ok: true, data: { avisado: await avisar('enviado', orderId) } };
}

// ── Admin ─────────────────────────────────────────────────────────────────

/** Busca en el catálogo de Dropi y sugiere precio de venta con los ajustes actuales. */
export async function buscarEnDropi(q: string, pagina: number): Promise<Result<{ productos: any[] }>> {
  const s = await leerAjustes();
  const r = await listarProductosDropi({ buscar: q, pagina, porPagina: 20 });
  if (r.ok === false) {
    return { ok: false, code: r.tipo === 'auth' ? 502 : 503, error: r.tipo === 'auth' ? 'Dropi rechazó el token (revisa DROPI_INTEGRATION_KEY)' : `Dropi: ${r.mensaje}` };
  }
  const productos = (Array.isArray(r.objects) ? r.objects : [])
    .map(normalizarProductoDropi).filter(Boolean)
    .map(p => {
      const precio = calcularPrecioVenta(p!.costo, 0, s);
      return { ...p, precioSugerido: precio.ok ? precio.precio : null, descripcion: p!.descripcion.slice(0, 400) };
    });
  return { ok: true, data: { productos } };
}

/** Importa un producto (o una variación) de Dropi como borrador. No se publica solo. */
export async function importarProducto(input: any): Promise<Result<{ id: string; sku: string }>> {
  const dropiId = Number(input?.dropiId);
  const variacionId = input?.variationId != null && input.variationId !== '' ? Number(input.variationId) : null;
  const categoria = String(input?.categoria || '') as CategoriaTienda;
  if (!CATEGORIAS_TIENDA.includes(categoria)) return { ok: false, code: 400, error: 'Categoría no permitida' };

  const r = await obtenerProductoDropi(dropiId);
  if (r.ok === false) return { ok: false, code: 502, error: `Dropi: ${r.mensaje}` };
  const p = normalizarProductoDropi(r.objects);
  if (!p) return { ok: false, code: 404, error: 'Producto de Dropi no válido' };

  let costo = p.costo, stock = p.stock, nombre = p.nombre;
  if (p.tipo === 'VARIABLE') {
    const v = p.variaciones.find(x => x.id === variacionId);
    if (!v) return { ok: false, code: 400, error: 'Elige la variación a vender' };
    costo = v.costo ?? p.costo; stock = v.stock;
    nombre = v.atributos ? `${p.nombre} — ${v.atributos}` : p.nombre;
  }
  const s = await leerAjustes();
  const precio = calcularPrecioVenta(costo, 0, s);
  if (precio.ok === false) return { ok: false, code: 400, error: precio.error };

  const sku = String(input?.sku || `ML-${dropiId}${variacionId ? `-${variacionId}` : ''}`).toUpperCase();
  if (!SKU_RE.test(sku)) return { ok: false, code: 400, error: 'SKU inválido (A-Z, 0-9 y guiones)' };

  const { data, error } = await supabase.from('shop_products').insert({
    sku, dropi_product_id: dropiId, dropi_variation_id: p.tipo === 'VARIABLE' ? variacionId : null,
    supplier_id: p.supplierId, nombre: nombre.slice(0, 200), descripcion: p.descripcion,
    imagenes: p.imagenes.slice(0, 8), categoria, costo: Math.round(costo), precio_venta: precio.precio,
    stock, estado: 'borrador', sincronizado_at: new Date().toISOString(),
  }).select('id, sku').single();
  if (error || !data) {
    console.error('[shop] no se pudo importar:', error?.message);
    const dup = /duplicate|unique/i.test(error?.message || '');
    return { ok: false, code: dup ? 409 : 500, error: dup ? 'Ese producto o SKU ya está importado' : 'No se pudo importar' };
  }
  return { ok: true, data: { id: data.id, sku: data.sku } };
}

/** URL pública de una foto subida al bucket de la tienda (no se aceptan URLs externas). */
const esFotoPropia = (u: unknown): u is string =>
  typeof u === 'string' && u.startsWith(`${(process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')}/storage/v1/object/public/shop-images/`);

/** Crea un producto con stock propio (Rodrigo despacha). Nace como borrador. */
export async function crearProductoPropio(input: any): Promise<Result<{ id: string; sku: string }>> {
  const nombre = String(input?.nombre || '').trim().replace(/\s+/g, ' ');
  const categoria = String(input?.categoria || '') as CategoriaTienda;
  const costo = Math.round(Number(input?.costo));
  const stock = Math.round(Number(input?.stock));
  if (nombre.length < 2 || nombre.length > 200) return { ok: false, code: 400, error: 'Ingresa el nombre del producto' };
  if (!CATEGORIAS_TIENDA.includes(categoria)) return { ok: false, code: 400, error: 'Categoría no permitida' };
  if (!(costo > 0)) return { ok: false, code: 400, error: 'Ingresa cuánto te costó cada unidad' };
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) return { ok: false, code: 400, error: 'Stock inválido' };
  const imagenes = (Array.isArray(input?.imagenes) ? input.imagenes : []).filter(esFotoPropia).slice(0, 8);
  const s = await leerAjustes();
  const precio = calcularPrecioVenta(costo, 0, s);
  if (precio.ok === false) return { ok: false, code: 400, error: precio.error };
  const sku = `MLP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const { data, error } = await supabase.from('shop_products').insert({
    sku, origen: 'propio', nombre, categoria, costo, stock, precio_venta: precio.precio, estado: 'borrador',
    descripcion: String(input?.descripcion || '').slice(0, 4000), imagenes,
    resolucion_sanitaria: String(input?.resolucion_sanitaria || '').trim().slice(0, 120) || null,
    consumible: input?.consumible === true,
  }).select('id, sku').single();
  if (error || !data) { console.error('[shop] producto propio:', error?.message); return { ok: false, code: 500, error: 'No se pudo crear el producto' }; }
  return { ok: true, data: { id: data.id, sku: data.sku } };
}

/** URL firmada para que el panel suba una foto directo al bucket público de la tienda. */
export async function urlSubidaFoto(tipo: unknown): Promise<Result<{ path: string; token: string; publicUrl: string }>> {
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[String(tipo)];
  if (!ext) return { ok: false, code: 400, error: 'La foto debe ser JPG, PNG o WebP' };
  const path = `productos/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from('shop-images').createSignedUploadUrl(path);
  if (error || !data) return { ok: false, code: 500, error: error?.message || 'No se pudo preparar la subida' };
  const { data: pub } = supabase.storage.from('shop-images').getPublicUrl(path);
  return { ok: true, data: { path: data.path, token: data.token, publicUrl: pub.publicUrl } };
}

const CAMPOS_EDITABLES = ['nombre', 'descripcion', 'categoria', 'envio_estimado', 'resolucion_sanitaria', 'consumible', 'dias_recompra', 'estado'] as const;
const CAMPOS_SOLO_PROPIO = ['costo', 'stock', 'imagenes'] as const;

/** Edita un producto. Publicar exige visto bueno, resolución SEREMI (suplementos) y stock. */
export async function actualizarProducto(id: string, cambios: any, aprobar: boolean): Promise<Result<{ producto: any }>> {
  if (!UUID_RE.test(id)) return { ok: false, code: 400, error: 'Producto inválido' };
  const { data: actual } = await supabase.from('shop_products').select('*').eq('id', id).maybeSingle();
  if (!actual) return { ok: false, code: 404, error: 'Producto no encontrado' };

  const patch: Record<string, unknown> = {};
  for (const k of CAMPOS_EDITABLES) if (cambios?.[k] !== undefined) patch[k] = cambios[k];
  if (actual.origen === 'propio') {
    for (const k of CAMPOS_SOLO_PROPIO) if (cambios?.[k] !== undefined) patch[k] = cambios[k];
    if (patch.costo !== undefined && !(Math.round(Number(patch.costo)) > 0)) return { ok: false, code: 400, error: 'Costo inválido' };
    if (patch.costo !== undefined) patch.costo = Math.round(Number(patch.costo));
    if (patch.stock !== undefined) {
      const st = Math.round(Number(patch.stock));
      if (!Number.isInteger(st) || st < 0) return { ok: false, code: 400, error: 'Stock inválido' };
      patch.stock = st;
    }
    if (patch.imagenes !== undefined) patch.imagenes = (Array.isArray(patch.imagenes) ? patch.imagenes : []).filter(esFotoPropia).slice(0, 8);
  }
  if (patch.estado !== undefined && !['borrador', 'publicado', 'pausado'].includes(String(patch.estado))) {
    return { ok: false, code: 400, error: 'Estado no válido' };
  }
  if (aprobar) { patch.aprobado_at = new Date().toISOString(); patch.aprobado_por = 'Rodrigo (panel admin)'; }

  const s = await leerAjustes();
  const final = { ...actual, ...patch };
  // Si cambia el stock propio, el estado sigue la misma regla que la sincronización.
  if (patch.stock !== undefined && (final.estado === 'publicado' || final.estado === 'agotado') && patch.estado === undefined) {
    final.estado = estadoTrasSincronizar(final as ProductoTienda, s.umbralStock);
    patch.estado = final.estado;
  }
  if (patch.envio_estimado !== undefined || patch.costo !== undefined) {
    const precio = calcularPrecioVenta(final.costo, Number(final.envio_estimado), s);
    if (precio.ok === false) return { ok: false, code: 400, error: precio.error };
    patch.precio_venta = precio.precio;
    final.precio_venta = precio.precio;
  }
  if (final.estado === 'publicado') {
    const check = puedePublicar(final as ProductoTienda, s.umbralStock);
    if (check.ok === false) return { ok: false, code: 409, error: check.motivo };
  }
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('shop_products').update(patch).eq('id', id).select('*').maybeSingle();
  if (error || !data) { console.error('[shop] no se pudo actualizar:', error?.message); return { ok: false, code: 500, error: 'No se pudo guardar' }; }
  return { ok: true, data: { producto: data } };
}

/** Guarda ajustes. Si cambian margen o comisión, recalcula el precio de todos los productos. */
export async function guardarAjustes(c: any): Promise<Result<{ actualizados: number }>> {
  const patch: Record<string, unknown> = {};
  const n = (v: unknown) => Number(v);
  if (c?.margen !== undefined) patch.margen = n(c.margen);
  if (c?.comisionPct !== undefined) patch.comision_pct = n(c.comisionPct);
  if (c?.umbralStock !== undefined) patch.umbral_stock = Math.round(n(c.umbralStock));
  if (c?.retencionMin !== undefined) patch.retencion_min = Math.round(n(c.retencionMin));
  if (c?.envioDropiActivo !== undefined) patch.envio_dropi_activo = c.envioDropiActivo === true;
  if (c?.tiendaActiva !== undefined) patch.tienda_activa = c.tiendaActiva === true;
  if (c?.tarifasRegion !== undefined) {
    const t: Record<string, number> = {};
    for (const r of REGIONES_DROPI) {
      const v = c.tarifasRegion?.[r.codigo];
      if (v === undefined || v === null || v === '') continue;
      const monto = Math.round(n(v));
      if (!Number.isFinite(monto) || monto < 0 || monto > 100000) return { ok: false, code: 400, error: `Tarifa inválida para ${r.nombre}` };
      t[r.codigo] = monto;
    }
    patch.tarifas_region = t;
  }
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'number' && !Number.isFinite(v)) return { ok: false, code: 400, error: `Valor inválido: ${k}` };
  }
  patch.updated_at = new Date().toISOString();
  const { error } = await supabase.from('shop_settings').update(patch).eq('id', true);
  if (error) { console.error('[shop] ajustes:', error.message); return { ok: false, code: 400, error: 'Ajustes no válidos' }; }

  let actualizados = 0;
  if (patch.margen !== undefined || patch.comision_pct !== undefined) {
    const s = await leerAjustes();
    const { data: productos } = await supabase.from('shop_products').select('id, costo, envio_estimado, precio_venta');
    for (const p of productos || []) {
      const precio = calcularPrecioVenta(p.costo, p.envio_estimado, s);
      if (precio.ok && precio.precio !== p.precio_venta) {
        const { error: e } = await supabase.from('shop_products').update({ precio_venta: precio.precio, updated_at: new Date().toISOString() }).eq('id', p.id);
        if (e) console.error('[shop] no se pudo recalcular', p.id, e.message);
        else actualizados++;
      }
    }
  }
  return { ok: true, data: { actualizados } };
}

// ── Sincronización de stock (pg_cron cada 6 h) ───────────────────────────

/**
 * Actualiza stock y costo desde Dropi. Si sube el costo, recalcula el precio para
 * mantener el margen. Bajo el umbral → agotado; si vuelve el stock → publicado.
 */
export async function sincronizarStock(): Promise<Result<{ revisados: number; cambios: number; errores: number }>> {
  const s = await leerAjustes();
  const { data: productos } = await supabase.from('shop_products').select('*').eq('origen', 'dropi').neq('estado', 'pausado');
  let revisados = 0, cambios = 0, errores = 0;
  for (const p of productos || []) {
    const r = await obtenerProductoDropi(Number(p.dropi_product_id));
    if (r.ok === false) {
      errores++;
      if (r.tipo === 'auth') return { ok: false, code: 502, error: 'Dropi rechazó el token' };
      continue;
    }
    const d = normalizarProductoDropi(r.objects);
    if (!d) { errores++; continue; }
    revisados++;
    const v = p.dropi_variation_id ? d.variaciones.find(x => x.id === Number(p.dropi_variation_id)) : null;
    const stock = p.dropi_variation_id ? (v?.stock ?? 0) : d.stock;
    const costo = Math.round((p.dropi_variation_id ? v?.costo : null) ?? d.costo) || p.costo;
    const precio = calcularPrecioVenta(costo, p.envio_estimado, s);
    const estado = estadoTrasSincronizar({ ...p, stock } as ProductoTienda, s.umbralStock);
    const patch: Record<string, unknown> = { sincronizado_at: new Date().toISOString() };
    if (stock !== p.stock) patch.stock = stock;
    if (costo !== p.costo) patch.costo = costo;
    if (precio.ok && precio.precio !== p.precio_venta) patch.precio_venta = precio.precio;
    if (estado !== p.estado) patch.estado = estado;
    if (Object.keys(patch).length > 1) cambios++;
    const { error } = await supabase.from('shop_products').update(patch).eq('id', p.id);
    if (error) { errores++; console.error('[shop] sincronizar', p.sku, error.message); }
  }
  return { ok: true, data: { revisados, cambios, errores } };
}

/** El cron llega con Authorization: Bearer <SHOP_CRON_SECRET>. Comparación en tiempo constante. */
export function cronAutorizado(header: unknown): boolean {
  const secreto = (process.env.SHOP_CRON_SECRET || '').trim();
  if (secreto.length < 16 || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const a = crypto.createHash('sha256').update(header.slice(7)).digest();
  const b = crypto.createHash('sha256').update(secreto).digest();
  return crypto.timingSafeEqual(a, b);
}

// ── Despachadores ─────────────────────────────────────────────────────────

const ACCIONES_PUBLICAS = new Set(['shop-catalog', 'shop-product', 'shop-order-status', 'shop-cron']);
export const esAccionTienda = (a: unknown): boolean => typeof a === 'string' && ACCIONES_PUBLICAS.has(a);

/** Acciones públicas (desde api/book-appointment.ts). */
export async function handleShopPublic(req: VercelRequest, res: VercelResponse): Promise<void> {
  const body = req.body || {};
  let r: Result<any>;
  switch (body.action) {
    case 'shop-catalog': r = await catalogoPublico(); break;
    case 'shop-product': r = await productoPublico(String(body.sku || '')); break;
    case 'shop-order-status': r = await estadoPedidoTienda(String(body.orderId || ''), body.paymentId ? String(body.paymentId) : undefined); break;
    case 'shop-cron':
      if (!cronAutorizado(req.headers.authorization)) { res.status(401).json({ error: 'No autorizado' }); return; }
      r = body.task === 'stock' ? await sincronizarStock() : { ok: false, code: 400, error: 'Tarea desconocida' };
      break;
    default: r = { ok: false, code: 400, error: 'Acción desconocida' };
  }
  if (r.ok === false) res.status(r.code).json({ error: r.error }); else res.status(200).json(r.data);
}

/** Acciones del panel admin (desde api/admin-auth.ts, ya con token admin verificado). */
export async function handleShopAdmin(req: VercelRequest, res: VercelResponse): Promise<void> {
  const action = String(req.query.action || '');
  const body = req.body || {};
  let r: Result<any>;
  if (req.method === 'GET' && action === 'shop-admin') {
    const [ajustes, productos, pedidos] = await Promise.all([
      leerAjustes(),
      supabase.from('shop_products').select('*').order('created_at', { ascending: false }),
      supabase.from('orders')
        .select('id, created_at, status, amount, envio_monto, buyer_name, buyer_email, region, comuna, direccion, customer_id, paid_at, despacho_estado, transportista, tracking, url_seguimiento')
        .eq('tipo', 'tienda').order('created_at', { ascending: false }).limit(100),
    ]);
    const lista = pedidos.data || [];
    const ids = lista.map((o: any) => o.id);
    const clientes = [...new Set(lista.map((o: any) => o.customer_id).filter(Boolean))];
    const [items, telefonos] = await Promise.all([
      ids.length ? supabase.from('order_items').select('order_id, sku, nombre, cantidad, precio_unitario').in('order_id', ids) : Promise.resolve({ data: [] as any[] }),
      clientes.length ? supabase.from('shop_customers').select('id, telefono').in('id', clientes) : Promise.resolve({ data: [] as any[] }),
    ]);
    const tel = new Map((telefonos.data || []).map((c: any) => [c.id, c.telefono]));
    const conItems = lista.map((o: any) => ({
      ...o, telefono: tel.get(o.customer_id) || null,
      items: (items.data || []).filter((i: any) => i.order_id === o.id),
    }));
    r = { ok: true, data: { ajustes, productos: productos.data || [], pedidos: conItems, regiones: REGIONES_DROPI } };
  } else if (req.method === 'GET' && action === 'shop-dropi-search') {
    r = await buscarEnDropi(String(req.query.q || ''), Number(req.query.page || 0));
  } else if (req.method === 'POST' && action === 'shop-import') {
    r = await importarProducto(body);
  } else if (req.method === 'POST' && action === 'shop-product') {
    r = await actualizarProducto(String(body.id || ''), body.cambios || {}, body.aprobar === true);
  } else if (req.method === 'POST' && action === 'shop-settings') {
    r = await guardarAjustes(body);
  } else if (req.method === 'POST' && action === 'shop-sync') {
    r = await sincronizarStock();
  } else if (req.method === 'POST' && action === 'shop-own-product') {
    r = await crearProductoPropio(body);
  } else if (req.method === 'POST' && action === 'shop-image-upload-url') {
    r = await urlSubidaFoto(body.tipo);
  } else if (req.method === 'POST' && action === 'shop-shipped') {
    r = await marcarEnviado(body);
  } else {
    r = { ok: false, code: 400, error: 'Acción desconocida' };
  }
  if (r.ok === false) res.status(r.code).json({ error: r.error }); else res.status(200).json(r.data);
}
