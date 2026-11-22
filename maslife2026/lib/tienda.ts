// Cliente de la tienda: catálogo, carrito local y pedido.
// El carrito guarda SOLO sku y cantidad: el precio que se cobra lo calcula el
// servidor (regla 3 de CLAUDE.md). localStorage es solo una comodidad del navegador.

export interface ProductoTienda {
  sku: string; nombre: string; descripcion: string; imagenes: string[];
  categoria: 'salud' | 'suplementos' | 'rehabilitacion' | 'bienestar'; precio: number; agotado: boolean;
}
export interface RegionTienda { codigo: string; nombre: string; envio: number; localidades: string[] }
export interface Catalogo { activa: boolean; productos: ProductoTienda[]; regiones: RegionTienda[] }
export interface ItemCarrito { sku: string; cantidad: number }

export const CATEGORIAS: Record<ProductoTienda['categoria'], string> = {
  salud: 'Salud', suplementos: 'Suplementos', rehabilitacion: 'Rehabilitación', bienestar: 'Bienestar',
};

export const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

const CLAVE = 'maslife_carrito_v1';
export const MAX_UNIDADES = 10;

export function leerCarrito(): ItemCarrito[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CLAVE) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((i: any) => typeof i?.sku === 'string' && Number.isInteger(i?.cantidad) && i.cantidad > 0)
      .map((i: any) => ({ sku: i.sku, cantidad: Math.min(i.cantidad, MAX_UNIDADES) }));
  } catch { return []; }
}

export function guardarCarrito(items: ItemCarrito[]): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(items));
    window.dispatchEvent(new Event('carrito'));
  } catch { /* modo privado o almacenamiento bloqueado: el carrito vive solo en memoria */ }
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

async function post(body: object): Promise<any> {
  const r = await fetch('/api/book-appointment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'No pudimos cargar la tienda');
  return j;
}

export const cargarCatalogo = (): Promise<Catalogo> => post({ action: 'shop-catalog' });
export const cargarProducto = (sku: string): Promise<{ producto: ProductoTienda }> => post({ action: 'shop-product', sku });
export const estadoPedido = (orderId: string, paymentId?: string): Promise<{ status: string }> =>
  post({ action: 'shop-order-status', orderId, paymentId });
