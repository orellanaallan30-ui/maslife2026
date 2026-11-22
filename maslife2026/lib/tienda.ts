// Cliente de la tienda: catálogo (con caché), carrito local y pedido.
// El carrito guarda SOLO sku y cantidad: el precio que se cobra lo calcula el
// servidor (regla 3 de CLAUDE.md). localStorage/sessionStorage son solo una
// comodidad del navegador; todo funciona aunque estén bloqueados.

export interface ProductoTienda {
  sku: string; nombre: string; descripcion: string; imagenes: string[];
  categoria: 'salud' | 'suplementos' | 'rehabilitacion' | 'bienestar'; precio: number; agotado: boolean;
  registro: string | null;
}
export interface RegionTienda { codigo: string; nombre: string; envio: number; localidades: string[] }
export interface Catalogo { activa: boolean; productos: ProductoTienda[]; regiones: RegionTienda[]; preview?: boolean }
export interface ItemCarrito { sku: string; cantidad: number }
export interface EstadoPedido {
  status: string; amount?: number; envio?: number;
  items?: Array<{ sku: string; nombre: string; cantidad: number; precio: number }>;
}

export const CATEGORIAS: Record<ProductoTienda['categoria'], string> = {
  salud: 'Salud', suplementos: 'Suplementos', rehabilitacion: 'Rehabilitación', bienestar: 'Bienestar',
};

export const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

// ── Carrito ───────────────────────────────────────────────────────────────

const CLAVE = 'maslife_carrito_v1';
export const MAX_UNIDADES = 10;
let carritoMemoria: ItemCarrito[] = [];

export function leerCarrito(): ItemCarrito[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CLAVE) || '[]');
    if (!Array.isArray(raw)) return carritoMemoria;
    return raw
      .filter((i: any) => typeof i?.sku === 'string' && Number.isInteger(i?.cantidad) && i.cantidad > 0)
      .map((i: any) => ({ sku: i.sku, cantidad: Math.min(i.cantidad, MAX_UNIDADES) }));
  } catch { return carritoMemoria; }
}

export function guardarCarrito(items: ItemCarrito[]): void {
  carritoMemoria = items;
  try { localStorage.setItem(CLAVE, JSON.stringify(items)); } catch { /* modo privado: queda en memoria */ }
  try { window.dispatchEvent(new Event('carrito')); } catch { /* sin window (tests) */ }
}

export function agregarAlCarrito(sku: string, cantidad = 1): ItemCarrito[] {
  const items = leerCarrito();
  const it = items.find(i => i.sku === sku);
  if (it) it.cantidad = Math.min(it.cantidad + cantidad, MAX_UNIDADES);
  else items.push({ sku, cantidad: Math.min(cantidad, MAX_UNIDADES) });
  guardarCarrito(items);
  return items;
}

export function cambiarCantidad(sku: string, cantidad: number): ItemCarrito[] {
  const items = leerCarrito()
    .map(i => (i.sku === sku ? { ...i, cantidad: Math.min(Math.max(cantidad, 0), MAX_UNIDADES) } : i))
    .filter(i => i.cantidad > 0);
  guardarCarrito(items);
  return items;
}

/** Abre el carrito lateral desde cualquier parte de la tienda. */
export const abrirCarrito = () => { try { window.dispatchEvent(new Event('abrir-carrito')); } catch { /* */ } };

/** Clave de un intento de pago: el servidor no crea dos pedidos con la misma. */
export function nuevaClaveCheckout(): string {
  try { return crypto.randomUUID(); } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

// ── Vista previa (solo con sesión de admin) ──────────────────────────────
// /tienda?vista=previa muestra la tienda con los productos en borrador aunque esté
// cerrada. Usa el token admin de esta pestaña; el servidor lo verifica. Sin token,
// la tienda se ve como la ve cualquier cliente.

const CLAVE_PREVIA = 'maslife_tienda_previa';
const tokenAdmin = (): string => { try { return sessionStorage.getItem('maslife_admin_token') || ''; } catch { return ''; } };

export function enVistaPrevia(): boolean {
  if (!tokenAdmin()) return false;
  try {
    if (new URLSearchParams(window.location.search).get('vista') === 'previa') sessionStorage.setItem(CLAVE_PREVIA, '1');
    return sessionStorage.getItem(CLAVE_PREVIA) === '1';
  } catch { return false; }
}

export function salirDeVistaPrevia(): void {
  try { sessionStorage.removeItem(CLAVE_PREVIA); sessionStorage.removeItem('maslife_catalogo_v1'); } catch { /* */ }
  enMemoria = null;
}

// ── Catálogo con caché (memoria + sessionStorage) ────────────────────────
// El servidor lo entrega por GET cacheado en la CDN; aquí además se recuerda
// durante la visita para que ficha y checkout se pinten al instante.

const CLAVE_CATALOGO = 'maslife_catalogo_v1';
const VIGENCIA_MS = 60_000;
let enMemoria: { t: number; c: Catalogo } | null = null;
let enCurso: Promise<Catalogo> | null = null;

/** Catálogo guardado en esta visita (puede estar algo viejo); null si no hay. */
export function catalogoEnCache(): Catalogo | null {
  const previa = enVistaPrevia();
  const valido = (c: Catalogo) => !!c.preview === previa; // no mezclar vista previa con la pública
  if (enMemoria && valido(enMemoria.c)) return enMemoria.c;
  try {
    const raw = JSON.parse(sessionStorage.getItem(CLAVE_CATALOGO) || 'null');
    if (raw?.c?.productos && valido(raw.c)) { enMemoria = raw; return raw.c; }
  } catch { /* sin sessionStorage */ }
  return null;
}

export async function cargarCatalogo(forzar = false): Promise<Catalogo> {
  const previa = enVistaPrevia();
  if (!forzar && enMemoria && !!enMemoria.c.preview === previa && Date.now() - enMemoria.t < VIGENCIA_MS) return enMemoria.c;
  if (enCurso) return enCurso;
  enCurso = (async () => {
    const r = previa
      ? await fetch('/api/admin-auth?action=shop-preview', { headers: { Authorization: `Bearer ${tokenAdmin()}` } })
      : await fetch('/api/book-appointment?shop=catalog');
    const j = await r.json().catch(() => ({}));
    if (previa && r.status === 401) { salirDeVistaPrevia(); throw new Error('Tu sesión de admin venció. Vuelve a entrar al panel.'); }
    if (!r.ok) throw new Error(j.error || 'No pudimos cargar la tienda');
    enMemoria = { t: Date.now(), c: j as Catalogo };
    try { sessionStorage.setItem(CLAVE_CATALOGO, JSON.stringify(enMemoria)); } catch { /* */ }
    return j as Catalogo;
  })();
  try { return await enCurso; } finally { enCurso = null; }
}

export async function cargarProducto(sku: string): Promise<ProductoTienda> {
  if (enVistaPrevia()) {
    const p = (await cargarCatalogo()).productos.find(x => x.sku === sku);
    if (!p) throw new Error('Producto no encontrado');
    return p;
  }
  const r = await fetch(`/api/book-appointment?shop=product&sku=${encodeURIComponent(sku)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Producto no encontrado');
  return j.producto as ProductoTienda;
}

export async function estadoPedido(orderId: string, paymentId?: string): Promise<EstadoPedido> {
  const r = await fetch('/api/book-appointment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'shop-order-status', orderId, paymentId }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'No pudimos verificar tu compra');
  return j as EstadoPedido;
}
