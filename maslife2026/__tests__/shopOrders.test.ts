import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }));

vi.mock('@supabase/supabase-js', async () => {
  const { makeFakeSupabase } = await import('./helpers/fakeSupabase');
  return { createClient: () => makeFakeSupabase(db.tables) };
});

let shop: typeof import('../../api/_lib/shop');
let orders: typeof import('../../api/_lib/orders');

let llamadas: Array<{ url: string; init: any }> = [];
function mockFetch(dropi: unknown = { isSuccess: true, objects: [] }) {
  llamadas = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    llamadas.push({ url, init });
    if (url.includes('/checkout/preferences')) return { ok: true, status: 200, json: async () => ({ id: 'pref-1', init_point: 'https://mp.example/pay' }) };
    if (url.includes('api.dropi.cl')) return { ok: true, status: 200, json: async () => dropi };
    return { ok: false, status: 404, json: async () => ({}) };
  }));
}

const producto = (over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(), sku: 'ML-001', nombre: 'Banda elástica', descripcion: 'Banda', imagenes: [],
  categoria: 'rehabilitacion', costo: 6000, envio_estimado: 0, precio_venta: 10990, stock: 20,
  estado: 'publicado', resolucion_sanitaria: null, aprobado_at: '2026-11-20T10:00:00Z',
  dropi_product_id: 77, dropi_variation_id: null, ...over,
});

const compra = {
  name: 'Ana Pérez', email: 'ANA@mail.cl', phone: '9 1234 5678', address: 'Av. Siempre Viva 123',
  region: 'RM', comuna: 'Providencia', acceptedTerms: true,
  items: [{ sku: 'ML-001', cantidad: 2, precio: 1 }],
};

beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'x');
  vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'APP_USR-test');
  vi.stubEnv('DROPI_INTEGRATION_KEY', 'k');
  shop = await import('../../api/_lib/shop');
  orders = await import('../../api/_lib/orders');
});

beforeEach(() => {
  Object.keys(db.tables).forEach(k => delete db.tables[k]);
  db.tables.shop_settings = [{
    id: true, margen: '0.35', comision_pct: '0.04', umbral_stock: 5, retencion_min: 15,
    envio_dropi_activo: false, tarifas_region: { RM: 3990 }, tienda_activa: true, contra_entrega: false,
  }];
  db.tables.shop_products = [producto()];
  mockFetch();
});

describe('pedido de la tienda', () => {
  it('calcula el total en el servidor e ignora el precio del cliente', async () => {
    const r = await shop.crearPedidoTienda(compra);
    expect(r.ok).toBe(true);
    const order = db.tables.orders[0];
    expect(order).toMatchObject({
      tipo: 'tienda', amount: 2 * 10990 + 3990, envio_monto: 3990, buyer_email: 'ana@mail.cl',
      region: 'RM', comuna: 'PROVIDENCIA', status: 'pendiente',
    });
    expect(db.tables.order_items).toHaveLength(1);
    expect(db.tables.order_items[0]).toMatchObject({ sku: 'ML-001', cantidad: 2, precio_unitario: 10990, costo_unitario: 6000 });
    expect(db.tables.shop_customers[0]).toMatchObject({ email: 'ana@mail.cl', telefono: '+56912345678' });

    const pref = JSON.parse(llamadas.find(l => l.url.includes('/checkout/preferences'))!.init.body);
    expect(pref.external_reference).toBe(`shop:${order.id}`);
    expect(pref.back_urls.success).toBe(`https://clinicamaslife.cl/tienda/gracias?order=${order.id}`);
    const totalMP = pref.items.reduce((a: number, i: any) => a + i.unit_price * i.quantity, 0);
    expect(totalMP).toBe(order.amount);
  });

  it('no vende si la tienda está cerrada', async () => {
    db.tables.shop_settings[0].tienda_activa = false;
    expect(await shop.crearPedidoTienda(compra)).toMatchObject({ ok: false, code: 409 });
    expect(db.tables.orders).toBeUndefined();
  });

  it('bloquea regiones sin tarifa y comunas que Dropi no conoce', async () => {
    expect(await shop.crearPedidoTienda({ ...compra, region: 'MA', comuna: 'Cabo de Hornos' })).toMatchObject({ ok: false, code: 409 });
    expect(await shop.crearPedidoTienda({ ...compra, comuna: 'Gotham' })).toMatchObject({ ok: false, code: 400 });
  });

  it('no vende productos en borrador ni sin stock', async () => {
    db.tables.shop_products = [producto({ estado: 'borrador' })];
    expect((await shop.crearPedidoTienda(compra)).ok).toBe(false);
    db.tables.shop_products = [producto({ stock: 3 })];
    expect((await shop.crearPedidoTienda(compra)).ok).toBe(false);
  });

  it('reutiliza el cliente existente por correo', async () => {
    await shop.crearPedidoTienda(compra);
    await shop.crearPedidoTienda({ ...compra, phone: '+56987654321' });
    expect(db.tables.shop_customers).toHaveLength(1);
    expect(db.tables.shop_customers[0].telefono).toBe('+56987654321');
  });

  it('confirma el pago solo con la referencia shop: y el monto exacto', async () => {
    await shop.crearPedidoTienda(compra);
    const o = db.tables.orders[0];
    const pago = { id: 555, status: 'approved', currency_id: 'CLP', transaction_amount: o.amount };
    expect(await orders.confirmPaidOrder(o.id, { ...pago, external_reference: `ebook:${o.id}` })).toBe('rechazado');
    expect(await orders.confirmPaidOrder(o.id, { ...pago, external_reference: `shop:${o.id}`, transaction_amount: 1 })).toBe('rechazado');
    expect(await orders.confirmPaidOrder(o.id, { ...pago, external_reference: `shop:${o.id}` })).toBe('pagado');
    expect(await orders.confirmPaidOrder(o.id, { ...pago, external_reference: `shop:${o.id}` })).toBe('ya-pagado');
  });
});

describe('catálogo público', () => {
  it('no expone el costo y solo muestra regiones con tarifa', async () => {
    db.tables.shop_products.push(producto({ sku: 'ML-002', estado: 'borrador' }));
    const r = await shop.catalogoPublico();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.productos).toHaveLength(1);
    expect(r.data.productos[0]).not.toHaveProperty('costo');
    expect(r.data.regiones).toHaveLength(1);
    expect(r.data.regiones[0]).toMatchObject({ codigo: 'RM', nombre: 'METROPOLITANA DE SANTIAGO', envio: 3990 });
    expect(r.data.regiones[0].localidades).toContain('PROVIDENCIA');
  });

  it('cerrada no muestra nada', async () => {
    db.tables.shop_settings[0].tienda_activa = false;
    expect(await shop.catalogoPublico()).toEqual({ ok: true, data: { activa: false, productos: [], regiones: [] } });
  });
});

describe('panel admin', () => {
  it('importa como borrador con precio calculado y exige variación en productos variables', async () => {
    mockFetch({ isSuccess: true, objects: { id: 90, name: 'Rodillera', type: 'VARIABLE', sale_price: 9000, user_id: 5,
      variations: [{ id: 3, sku: 'R-M', stock: 8, attribute_values: [{ value: 'M' }] }] } });
    expect(await shop.importarProducto({ dropiId: 90, categoria: 'rehabilitacion' })).toMatchObject({ ok: false, code: 400 });
    const r = await shop.importarProducto({ dropiId: 90, variationId: 3, categoria: 'rehabilitacion' });
    expect(r).toMatchObject({ ok: true, data: { sku: 'ML-90-3' } });
    const p = db.tables.shop_products.find(x => x.sku === 'ML-90-3');
    expect(p).toMatchObject({ estado: 'borrador', costo: 9000, precio_venta: 14990, stock: 8, nombre: 'Rodillera — M' });
  });

  it('rechaza categorías fuera de salud y bienestar', async () => {
    expect(await shop.importarProducto({ dropiId: 90, categoria: 'tecnologia' })).toMatchObject({ ok: false, code: 400 });
  });

  it('no publica un suplemento sin resolución SEREMI ni sin visto bueno', async () => {
    const sup = producto({ sku: 'ML-SUP', categoria: 'suplementos', estado: 'borrador', aprobado_at: null });
    db.tables.shop_products.push(sup);
    expect(await shop.actualizarProducto(sup.id, { estado: 'publicado' }, false)).toMatchObject({ ok: false, code: 409 });
    expect(await shop.actualizarProducto(sup.id, { estado: 'publicado' }, true)).toMatchObject({ ok: false, code: 409 });
    const ok = await shop.actualizarProducto(sup.id, { estado: 'publicado', resolucion_sanitaria: 'Res. 123/2026' }, true);
    expect(ok.ok).toBe(true);
  });

  it('al cambiar el margen recalcula los precios', async () => {
    const r = await shop.guardarAjustes({ margen: 0.45 });
    expect(r).toEqual({ ok: true, data: { actualizados: 1 } });
    expect(db.tables.shop_products[0].precio_venta).toBe(11990); // 6000 / 0.51 = 11.765 → 11.990
  });

  it('valida las tarifas por región', async () => {
    expect((await shop.guardarAjustes({ tarifasRegion: { RM: -5 } })).ok).toBe(false);
    await shop.guardarAjustes({ tarifasRegion: { RM: '3490', XX: 1, VS: '' } });
    expect(db.tables.shop_settings[0].tarifas_region).toEqual({ RM: 3490 });
  });
});

describe('sincronización de stock', () => {
  it('marca agotado bajo el umbral y sube el precio si sube el costo', async () => {
    mockFetch({ isSuccess: true, objects: { id: 77, name: 'Banda', type: 'SIMPLE', sale_price: 7000, stock: 3 } });
    const r = await shop.sincronizarStock();
    expect(r).toMatchObject({ ok: true, data: { revisados: 1, cambios: 1, errores: 0 } });
    expect(db.tables.shop_products[0]).toMatchObject({ stock: 3, costo: 7000, estado: 'agotado', precio_venta: 11990 });
  });

  it('se detiene si Dropi rechaza el token', async () => {
    mockFetch({ isSuccess: false, message: 'Access denied' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ isSuccess: false, message: 'Access denied' }) })));
    expect(await shop.sincronizarStock()).toMatchObject({ ok: false, code: 502 });
  });
});

describe('seguridad', () => {
  it('el cron exige el secreto exacto', () => {
    vi.stubEnv('SHOP_CRON_SECRET', 'secreto-largo-de-prueba-123');
    expect(shop.cronAutorizado('Bearer secreto-largo-de-prueba-123')).toBe(true);
    expect(shop.cronAutorizado('Bearer otro')).toBe(false);
    expect(shop.cronAutorizado(undefined)).toBe(false);
    vi.stubEnv('SHOP_CRON_SECRET', 'corto');
    expect(shop.cronAutorizado('Bearer corto')).toBe(false);
  });

  it('normaliza teléfonos chilenos', () => {
    expect(shop.normalizarTelefono('9 1234 5678')).toBe('+56912345678');
    expect(shop.normalizarTelefono('+56 9 1234 5678')).toBe('+56912345678');
    expect(shop.normalizarTelefono('123')).toBeNull();
  });
});
