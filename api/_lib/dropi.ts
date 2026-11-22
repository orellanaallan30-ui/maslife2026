// Cliente de la API de integraciones de Dropi Chile (https://api.dropi.cl/integrations/).
// Formato tomado del plugin oficial wc-dropi-integration 4.7.3: cabecera
// `dropi-integration-key` y respuestas { isSuccess, objects, message }.
// El token vive solo en el servidor (DROPI_INTEGRATION_KEY en Vercel).

import { clasificarErrorDropi, ESTADO_BORRADOR_DROPI, type TipoErrorDropi } from './shopRules';

const BASE = 'https://api.dropi.cl/integrations/';
const TIMEOUT_MS = 20_000;

export type DropiResult<T = any> =
  | { ok: true; objects: T }
  | { ok: false; tipo: TipoErrorDropi; status: number; mensaje: string };

const clave = () => (process.env.DROPI_INTEGRATION_KEY || '').trim();

async function dropiRequest<T = any>(ruta: string, opciones: { method: 'GET' | 'POST'; body?: unknown }): Promise<DropiResult<T>> {
  const key = clave();
  if (!key) return { ok: false, tipo: 'auth', status: 0, mensaje: 'DROPI_INTEGRATION_KEY no configurada' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(BASE + ruta, {
      method: opciones.method,
      headers: { 'Content-Type': 'application/json;charset=UTF-8', 'dropi-integration-key': key },
      body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
      signal: ctrl.signal,
    });
    let j: any = null;
    try { j = await r.json(); } catch { /* cuerpo no JSON: se trata abajo como error */ }
    if (!r.ok || !j || j.isSuccess === false) {
      const mensaje = String(j?.message || j?.status || `HTTP ${r.status}`).slice(0, 300);
      return { ok: false, tipo: clasificarErrorDropi(r.status, mensaje), status: r.status, mensaje };
    }
    return { ok: true, objects: j.objects as T };
  } catch (e: any) {
    const mensaje = e?.name === 'AbortError' ? 'Tiempo de espera agotado' : String(e?.message || 'Error de red');
    return { ok: false, tipo: 'red', status: 0, mensaje };
  } finally {
    clearTimeout(timer);
  }
}

/** Listado y búsqueda de productos (mismo cuerpo que el plugin oficial). */
export function listarProductosDropi(p: { pagina?: number; porPagina?: number; buscar?: string; categoria?: number; conStock?: boolean }) {
  const porPagina = Math.min(Math.max(p.porPagina ?? 20, 1), 50);
  return dropiRequest<any[]>('products/index', {
    method: 'POST',
    body: {
      startData: Math.max(p.pagina ?? 0, 0) * porPagina,
      pageSize: porPagina,
      keywords: (p.buscar || '').slice(0, 80),
      active: true,
      no_count: true,
      integration: true,
      ...(p.categoria ? { category: p.categoria } : {}),
      ...(p.conStock ? { stockmayor: 1 } : {}),
    },
  });
}

/** Detalle de un producto (stock al día). */
export function obtenerProductoDropi(id: number) {
  if (!Number.isInteger(id) || id <= 0) {
    return Promise.resolve<DropiResult>({ ok: false, tipo: 'datos', status: 0, mensaje: 'id inválido' });
  }
  return dropiRequest(`products/${id}`, { method: 'GET' });
}

export const listarCategoriasDropi = () => dropiRequest<any[]>('categories/', { method: 'GET' });

/**
 * Crea el pedido en Dropi. Por diseño SOLO como borrador (PENDIENTE CONFIRMACION):
 * Rodrigo lo confirma en Dropi. Si el cuerpo trae otro estado, no se envía.
 */
export function crearPedidoBorradorDropi(cuerpo: { status: string } & Record<string, unknown>) {
  if (cuerpo.status !== ESTADO_BORRADOR_DROPI) {
    return Promise.resolve<DropiResult>({ ok: false, tipo: 'datos', status: 0, mensaje: 'Solo se permiten pedidos en borrador' });
  }
  return dropiRequest<{ id?: number }>('orders/myorders', { method: 'POST', body: cuerpo });
}
