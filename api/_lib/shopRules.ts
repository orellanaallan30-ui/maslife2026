// Reglas puras de la tienda (Dropi): precio de venta, stock, flete, cola de
// pedidos y conciliación. Sin red ni base de datos, para poder probarlas.
// El precio SIEMPRE se calcula aquí, en el servidor (regla 3 de CLAUDE.md).

import { REGIONES_DROPI, LOCALIDADES_DROPI } from './dropiPlaces';

export const CATEGORIAS_TIENDA = ['salud', 'suplementos', 'rehabilitacion', 'bienestar'] as const;
export type CategoriaTienda = typeof CATEGORIAS_TIENDA[number];

export interface ShopSettings {
  margen: number;            // 0.35 = 35 % del precio de venta
  comisionPct: number;       // comisión de la pasarela sobre el precio de venta (0.0399 = 3,99 %)
  umbralStock: number;       // bajo este stock el producto se muestra agotado
  retencionMin: number;      // minutos de espera antes de enviar el pedido a Dropi
  envioDropiActivo: boolean; // interruptor general: sin él no sale ningún pedido
  tarifasRegion: Record<string, number>; // código de región → CLP
}

export const SETTINGS_POR_DEFECTO: ShopSettings = {
  margen: 0.35,
  comisionPct: 0.0399,
  umbralStock: 5,
  retencionMin: 15,
  envioDropiActivo: false,
  tarifasRegion: {},
};

// ── Precio ────────────────────────────────────────────────────────────────

/** Sube al siguiente precio terminado en 990 (12.340 → 12.990; 12.990 se queda). */
export function redondear990(n: number): number {
  if (!Number.isFinite(n) || n <= 990) return 990;
  return Math.ceil((n - 990) / 1000) * 1000 + 990;
}

/**
 * Precio de venta = (costo + envío estimado) / (1 − margen − comisión).
 * La comisión de la pasarela es un % del precio final, por eso va en el
 * denominador: así el margen pedido queda limpio después de pagarla.
 */
export function calcularPrecioVenta(
  costo: number,
  envioEstimado: number,
  s: Pick<ShopSettings, 'margen' | 'comisionPct'>,
): { ok: true; precio: number } | { ok: false; error: string } {
  if (!Number.isFinite(costo) || costo <= 0) return { ok: false, error: 'Costo inválido' };
  if (!Number.isFinite(envioEstimado) || envioEstimado < 0) return { ok: false, error: 'Envío estimado inválido' };
  if (s.margen < 0 || s.comisionPct < 0) return { ok: false, error: 'Margen o comisión negativos' };
  const divisor = 1 - s.margen - s.comisionPct;
  if (divisor < 0.1) return { ok: false, error: 'Margen + comisión no pueden superar el 90 %' };
  return { ok: true, precio: redondear990((costo + envioEstimado) / divisor) };
}

// ── Producto de Dropi ─────────────────────────────────────────────────────

const CLOUDFRONT = 'https://d39ru7awumhhs2.cloudfront.net/';
const IMG_BASE = 'https://api.dropi.cl/';

export interface VariacionDropi { id: number; sku: string; stock: number; costo: number | null; atributos: string }
export interface ProductoDropi {
  dropiId: number; nombre: string; tipo: 'SIMPLE' | 'VARIABLE'; descripcion: string;
  costo: number; sugerido: number | null; stock: number; supplierId: number | null;
  imagenes: string[]; variaciones: VariacionDropi[];
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

/** Stock total: campo `stock` o la suma por bodega (`warehouse_product[]`), como el plugin oficial. */
export function stockDe(raw: any): number {
  const bodegas = raw?.warehouse_product ?? raw?.warehouse_product_variation;
  if (Array.isArray(bodegas) && bodegas.length > 0) {
    return bodegas.reduce((acc: number, b: any) => acc + Math.max(0, num(b?.stock)), 0);
  }
  return Math.max(0, num(raw?.stock));
}

function urlImagen(img: any): string | null {
  if (img?.urlS3) return CLOUDFRONT + String(img.urlS3).replace(/^\/+/, '');
  if (img?.url) return IMG_BASE + String(img.url).replace(/^\/+/, '');
  return null;
}

/** Convierte el producto crudo de Dropi a la forma que usa la tienda. */
export function normalizarProductoDropi(raw: any): ProductoDropi | null {
  const dropiId = num(raw?.id);
  if (!dropiId || !raw?.name) return null;
  const tipo = raw.type === 'VARIABLE' ? 'VARIABLE' : 'SIMPLE';
  const variaciones: VariacionDropi[] = Array.isArray(raw.variations)
    ? raw.variations.map((v: any) => ({
        id: num(v?.id),
        sku: String(v?.sku ?? ''),
        stock: stockDe(v),
        costo: v?.sale_price != null ? num(v.sale_price) : null,
        atributos: Array.isArray(v?.attribute_values)
          ? v.attribute_values.map((a: any) => a?.value ?? a?.name ?? '').filter(Boolean).join(' / ')
          : '',
      })).filter((v: VariacionDropi) => v.id > 0)
    : [];
  return {
    dropiId,
    nombre: String(raw.name).trim(),
    tipo,
    descripcion: String(raw.description ?? ''),
    costo: num(raw.sale_price),
    sugerido: raw.suggested_price != null ? num(raw.suggested_price) : null,
    stock: tipo === 'VARIABLE' && variaciones.length > 0
      ? variaciones.reduce((a, v) => a + v.stock, 0)
      : stockDe(raw),
    supplierId: raw.user_id != null ? num(raw.user_id) : null,
    imagenes: (Array.isArray(raw.gallery) ? raw.gallery : []).map(urlImagen).filter(Boolean) as string[],
    variaciones,
  };
}

// ── Publicación y stock ───────────────────────────────────────────────────

export interface ProductoTienda {
  sku: string; categoria: CategoriaTienda; precio_venta: number; stock: number;
  estado: 'borrador' | 'publicado' | 'agotado' | 'pausado';
  resolucion_sanitaria: string | null; aprobado_at: string | null;
}

export const estaAgotado = (stock: number, umbral: number): boolean => stock < umbral;

/** Un producto solo se publica con visto bueno, precio, stock y (si es suplemento) resolución SEREMI. */
export function puedePublicar(p: ProductoTienda, umbral: number): { ok: true } | { ok: false; motivo: string } {
  if (!CATEGORIAS_TIENDA.includes(p.categoria)) return { ok: false, motivo: 'Categoría no permitida' };
  if (!p.aprobado_at) return { ok: false, motivo: 'Falta el visto bueno de Rodrigo' };
  if (p.categoria === 'suplementos' && !(p.resolucion_sanitaria || '').trim()) {
    return { ok: false, motivo: 'Falta la resolución sanitaria (SEREMI)' };
  }
  if (!(p.precio_venta > 0)) return { ok: false, motivo: 'Precio inválido' };
  if (estaAgotado(p.stock, umbral)) return { ok: false, motivo: 'Stock bajo el umbral' };
  return { ok: true };
}

/** Estado que debe quedar tras sincronizar stock. Borrador y pausado no se tocan. */
export function estadoTrasSincronizar(p: ProductoTienda, umbral: number): ProductoTienda['estado'] {
  if (p.estado === 'borrador' || p.estado === 'pausado') return p.estado;
  return estaAgotado(p.stock, umbral) ? 'agotado' : 'publicado';
}

// ── Destino y flete ───────────────────────────────────────────────────────

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/** Valida región y localidad contra la lista de Dropi. Devuelve los nombres que espera Dropi. */
export function validarDestino(codigoRegion: string, localidad: string):
  { ok: true; region: string; ciudad: string } | { ok: false; error: string } {
  const region = REGIONES_DROPI.find(r => r.codigo === codigoRegion);
  if (!region) return { ok: false, error: 'Región no válida' };
  const buscada = normalizar(String(localidad || ''));
  const ciudad = (LOCALIDADES_DROPI[region.codigo] || []).find(l => normalizar(l) === buscada);
  if (!ciudad) return { ok: false, error: 'Comuna o localidad no disponible para despacho' };
  return { ok: true, region: region.nombre, ciudad };
}

/** Tarifa de envío según la tabla por región. null = no despachamos ahí todavía. */
export function tarifaEnvio(tarifas: Record<string, number>, codigoRegion: string): number | null {
  const t = tarifas?.[codigoRegion];
  return Number.isFinite(t) && t >= 0 ? Math.round(t) : null;
}

// ── Carrito (siempre recalculado en el servidor) ──────────────────────────

export const MAX_UNIDADES = 10;

export interface LineaCarrito { sku: string; cantidad: number; precioUnitario: number; costoUnitario: number; nombre: string }

/**
 * Recalcula el carrito con los precios de la BD. Ignora cualquier precio que
 * mande el cliente: solo se leen sku y cantidad.
 */
export function calcularCarrito(
  pedido: unknown,
  catalogo: Array<ProductoTienda & { nombre: string; costo: number }>,
  umbral: number,
): { ok: true; lineas: LineaCarrito[]; subtotal: number } | { ok: false; error: string } {
  if (!Array.isArray(pedido) || pedido.length === 0) return { ok: false, error: 'El carrito está vacío' };
  if (pedido.length > 20) return { ok: false, error: 'Demasiados productos en el carrito' };
  const porSku = new Map(catalogo.map(p => [p.sku, p]));
  const cantidades = new Map<string, number>();
  for (const it of pedido as any[]) {
    const sku = String(it?.sku ?? '');
    const cantidad = Number(it?.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1) return { ok: false, error: 'Cantidad inválida' };
    cantidades.set(sku, (cantidades.get(sku) || 0) + cantidad);
  }
  const lineas: LineaCarrito[] = [];
  for (const [sku, cantidad] of cantidades) {
    const p = porSku.get(sku);
    if (!p || p.estado !== 'publicado') return { ok: false, error: 'Un producto ya no está disponible' };
    if (cantidad > MAX_UNIDADES) return { ok: false, error: `Máximo ${MAX_UNIDADES} unidades por producto` };
    if (p.stock - cantidad < 0 || estaAgotado(p.stock, umbral)) {
      return { ok: false, error: `Sin stock suficiente de ${p.nombre}` };
    }
    lineas.push({ sku, cantidad, precioUnitario: p.precio_venta, costoUnitario: p.costo, nombre: p.nombre });
  }
  const subtotal = lineas.reduce((a, l) => a + l.precioUnitario * l.cantidad, 0);
  return { ok: true, lineas, subtotal };
}

// ── Cola de pedidos a Dropi ───────────────────────────────────────────────

export const MAX_INTENTOS = 6;

/** Backoff exponencial: 5, 10, 20, 40, 80, 160 min (tope 240). null = no reintentar más. */
export function proximoIntento(intentos: number, ahora: Date): Date | null {
  if (intentos >= MAX_INTENTOS) return null;
  const minutos = Math.min(5 * 2 ** Math.max(0, intentos - 1), 240);
  return new Date(ahora.getTime() + minutos * 60_000);
}

export type TipoErrorDropi = 'auth' | 'saldo' | 'stock' | 'datos' | 'red';

/** Clasifica un error de Dropi para decidir si reintentar o avisar. */
export function clasificarErrorDropi(status: number, mensaje: string): TipoErrorDropi {
  const m = normalizar(mensaje || '');
  if (status === 401 || status === 403 || /ACCESS DENIED|TOKEN|UNAUTHORI/.test(m)) return 'auth';
  if (/SALDO|WALLET|CARTERA|FONDOS|INSUFFICIENT|BALANCE/.test(m)) return 'saldo';
  if (/STOCK|AGOTAD|EXISTENCIA/.test(m)) return 'stock';
  if (status === 0 || status === 408 || status === 429 || status >= 500) return 'red';
  return 'datos';
}

/** Solo los errores de red se reintentan solos; el resto necesita a una persona. */
export const esReintentable = (t: TipoErrorDropi): boolean => t === 'red';

export interface FulfillmentRow { estado: string; retener_hasta: string; proximo_intento: string | null; intentos: number }

/** ¿Toca enviar este pedido a Dropi ahora? Respeta interruptor, retención y backoff. */
export function debeEnviarAhora(f: FulfillmentRow, envioActivo: boolean, ahora: Date): boolean {
  if (!envioActivo) return false;
  if (f.estado !== 'en_espera' && f.estado !== 'reintentar') return false;
  if (new Date(f.retener_hasta).getTime() > ahora.getTime()) return false;
  if (f.proximo_intento && new Date(f.proximo_intento).getTime() > ahora.getTime()) return false;
  return true;
}

/** Divide "Nombre Apellido Apellido" en nombre y apellidos para Dropi. */
export function separarNombre(completo: string): { name: string; surname: string } {
  const partes = String(completo || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return { name: partes[0] || '', surname: '.' };
  return { name: partes[0], surname: partes.slice(1).join(' ') };
}

export const ESTADO_BORRADOR_DROPI = 'PENDIENTE CONFIRMACION';

export interface ItemPedidoDropi { dropiProductId: number; dropiVariationId: number | null; supplierId: number | null; nombre: string; cantidad: number; precioUnitario: number }

/**
 * Arma el cuerpo de `orders/myorders` igual que el plugin oficial, pero SIEMPRE
 * como borrador (PENDIENTE CONFIRMACION) y sin recaudo (ya pagado online).
 */
export function construirPedidoDropi(o: {
  orderId: string; nombre: string; email: string; telefono: string; direccion: string;
  region: string; ciudad: string; notas?: string; items: ItemPedidoDropi[];
}) {
  const { name, surname } = separarNombre(o.nombre);
  const products = o.items.map(i => ({
    id: i.dropiProductId,
    name: i.nombre,
    quantity: i.cantidad,
    price: i.precioUnitario,
    type: i.dropiVariationId ? 'VARIABLE' : 'SIMPLE',
    ...(i.dropiVariationId ? { variation_id: i.dropiVariationId } : {}),
  }));
  return {
    total_order: o.items.reduce((a, i) => a + i.precioUnitario * i.cantidad, 0),
    notes: (o.notas || '').slice(0, 500),
    name, surname,
    dir: o.direccion,
    country: 'CL',
    state: o.region,
    city: o.ciudad,
    phone: o.telefono,
    client_email: o.email,
    payment_method_id: 1,
    status: ESTADO_BORRADOR_DROPI,
    type: 'FINAL_ORDER',
    rate_type: 'SIN RECAUDO',
    products,
    calculate_costs_and_shiping: true,
    supplier_id: o.items[0]?.supplierId ?? null,
    shop_order_id: o.orderId,
  };
}

// ── Conciliación ──────────────────────────────────────────────────────────

/** Margen neto de un pedido. La comisión se calcula sobre todo lo cobrado (productos + envío). */
export function conciliar(x: {
  precioCobrado: number; envioCobrado: number; costoProducto: number; fleteReal: number | null; comisionPct: number;
}) {
  const totalCobrado = x.precioCobrado + x.envioCobrado;
  const comision = Math.round(totalCobrado * x.comisionPct);
  const flete = x.fleteReal ?? x.envioCobrado; // sin flete real aún, se asume el cobrado
  const margenNeto = totalCobrado - comision - x.costoProducto - flete;
  return {
    totalCobrado, comision, flete, margenNeto,
    margenPct: totalCobrado > 0 ? Math.round((margenNeto / totalCobrado) * 1000) / 10 : 0,
    fleteEstimado: x.fleteReal == null,
  };
}
