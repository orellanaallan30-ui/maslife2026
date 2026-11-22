import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// Checkout seguro, estado del pedido para el píxel, feed de catálogo y evento de Meta de la tienda.

const db = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }));

vi.mock('@supabase/supabase-js', async () => {
  const { makeFakeSupabase } = await import('./helpers/fakeSupabase');
  return { createClient: () => makeFakeSupabase(db.tables, undefined, () => ({ data: false, error: null })) };
});

let shop: typeof import('../../api/_lib/shop');
let meta: typeof import('../../api/_lib/metaCapi');
let prefs = 0;
let ultimaPref: any = null;

const FOTO = 'https://example.supabase.co/storage/v1/object/public/shop-images/productos/a.jpg';
const producto = (over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(), sku: 'MLP-0000AAAA', origen: 'propio', nombre: 'Magnesio 120 cápsulas',
  descripcion: '<p>Magnesio, "bisglicinato"</p>', imagenes: [FOTO], categoria: 'suplementos', costo: 8000,
  envio_estimado: 0, precio_venta: 13990, stock: 20, estado: 'publicado', resolucion_sanitaria: 'Reg. ISP F-1/26',
  aprobado_at: '2026-11-20T10:00:00Z', dropi_product_id: null, dropi_variation_id: null, ...over,
});
const compra = (over: Record<string, unknown> = {}) => ({
  name: 'Ana Pérez', email: 'ana@mail.cl', phone: '912345678', address: 'Av. Siempre Viva 123',
  region: 'RM', comuna: 'Providencia', acceptedTerms: true, items: [{ sku: 'MLP-0000AAAA', cantidad: 1 }], ...over,
});

beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'x');
  vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'APP_USR-test');
  shop = await import('../../api/_lib/shop');
  meta = await import('../../api/_lib/metaCapi');
});

beforeEach(() => {
  Object.keys(db.tables).forEach(k => delete db.tables[k]);
  db.tables.shop_settings = [{ id: true, margen: '0.35', comision_pct: '0.04', umbral_stock: 5, retencion_min: 15,
    envio_dropi_activo: false, tarifas_region: { RM: 3990 }, tienda_activa: true, contra_entrega: false }];
  db.tables.shop_products = [producto()];
  prefs = 0; ultimaPref = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    if (url.includes('/checkout/preferences')) {
      prefs++; ultimaPref = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ id: `pref-${prefs}`, init_point: `https://mp.example/pay/${prefs}` }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  }));
});

describe('checkout seguro', () => {
  it('la misma clave de checkout no crea un segundo pedido ni otro cobro', async () => {
    const key = crypto.randomUUID();
    const a = await shop.crearPedidoTienda(compra({ checkoutKey: key }));
    const b = await shop.crearPedidoTienda(compra({ checkoutKey: key }));
    expect(a).toEqual(b);
    expect(db.tables.orders).toHaveLength(1);
    expect(prefs).toBe(1);
    expect(db.tables.orders[0]).toMatchObject({ checkout_key: key, mp_init_point: 'https://mp.example/pay/1' });
  });

  it('una clave de un pedido ya pagado no genera otro link', async () => {
    const key = crypto.randomUUID();
    await shop.crearPedidoTienda(compra({ checkoutKey: key }));
    db.tables.orders[0].status = 'pagado';
    expect(await shop.crearPedidoTienda(compra({ checkoutKey: key }))).toMatchObject({ ok: false, code: 409 });
  });

  it('el link de pago vence a las 2 horas', async () => {
    await shop.crearPedidoTienda(compra());
    expect(ultimaPref.expires).toBe(true);
    const horas = (new Date(ultimaPref.expiration_date_to).getTime() - Date.now()) / 3_600_000;
    expect(horas).toBeGreaterThan(1.9);
    expect(horas).toBeLessThanOrEqual(2);
  });

  it('el campo trampa frena a los bots sin crear nada', async () => {
    expect(await shop.crearPedidoTienda(compra({ empresa: 'Spam SpA' }))).toMatchObject({ ok: false, code: 400 });
    expect(db.tables.orders).toBeUndefined();
  });

  it('rechaza pedidos sobre el monto máximo', async () => {
    db.tables.shop_products = [producto({ precio_venta: 150000 })];
    const r = await shop.crearPedidoTienda(compra({ items: [{ sku: 'MLP-0000AAAA', cantidad: 7 }] }));
    expect(r).toMatchObject({ ok: false, code: 409 });
    expect(db.tables.orders).toBeUndefined();
  });
});

describe('estado del pedido para la página de gracias', () => {
  it('pendiente no expone montos; pagado da valor y SKU sin datos personales', async () => {
    const r = await shop.crearPedidoTienda(compra());
    const id = r.ok ? r.data.orderId : '';
    const pend = await shop.estadoPedidoTienda(id);
    expect(pend).toEqual({ ok: true, data: { status: 'pendiente' } });
    db.tables.orders[0].status = 'pagado';
    const pag = await shop.estadoPedidoTienda(id);
    expect(pag).toEqual({ ok: true, data: {
      status: 'pagado', amount: 13990 + 3990, envio: 3990,
      items: [{ sku: 'MLP-0000AAAA', nombre: 'Magnesio 120 cápsulas', cantidad: 1, precio: 13990 }],
    } });
    expect(JSON.stringify(pag)).not.toContain('ana@mail.cl');
  });
});

describe('feed de catálogo para Meta', () => {
  it('usa el SKU como id, precio en CLP, escapa el CSV y quita el HTML', async () => {
    db.tables.shop_products.push(producto({ sku: 'MLP-BORRADOR', estado: 'borrador' }));
    db.tables.shop_products.push(producto({ sku: 'MLP-SINFOTO', imagenes: [] }));
    db.tables.shop_products.push(producto({ sku: 'MLP-AGOTADO', stock: 2, estado: 'agotado' }));
    const lineas = (await shop.feedMeta()).trim().split('\n');
    expect(lineas[0]).toBe('id,title,description,availability,condition,price,link,image_link,brand,google_product_category');
    expect(lineas).toHaveLength(3);
    expect(lineas[1]).toContain('MLP-0000AAAA,Magnesio 120 cápsulas,"Magnesio, ""bisglicinato""",in stock,new,13990 CLP,https://clinicamaslife.cl/tienda/MLP-0000AAAA,');
    expect(lineas[2]).toContain('MLP-AGOTADO');
    expect(lineas[2]).toContain('out of stock');
    expect(lineas.join('\n')).not.toContain('<p>');
  });

  it('con la tienda cerrada queda vacío', async () => {
    db.tables.shop_settings[0].tienda_activa = false;
    expect((await shop.feedMeta()).trim().split('\n')).toHaveLength(1);
  });

  it('el catálogo público muestra el registro sanitario solo de suplementos', async () => {
    db.tables.shop_products.push(producto({ sku: 'MLP-BANDA', categoria: 'rehabilitacion', resolucion_sanitaria: 'x' }));
    const r = await shop.catalogoPublico();
    const ps = r.ok ? r.data.productos : [];
    expect(ps.find((p: any) => p.sku === 'MLP-0000AAAA').registro).toBe('Reg. ISP F-1/26');
    expect(ps.find((p: any) => p.sku === 'MLP-BANDA').registro).toBeNull();
    expect(JSON.stringify(ps)).not.toContain('8000');
  });
});

describe('vista previa para Rodrigo', () => {
  it('muestra borradores con la tienda cerrada, sin pausados ni costos', async () => {
    db.tables.shop_settings[0].tienda_activa = false;
    db.tables.shop_products.push(producto({ sku: 'MLP-BORRADOR', estado: 'borrador' }));
    db.tables.shop_products.push(producto({ sku: 'MLP-PAUSADO', estado: 'pausado' }));
    const r = await shop.vistaPreviaTienda();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ activa: true, preview: true });
    expect(r.data.productos.map((p: any) => p.sku).sort()).toEqual(['MLP-0000AAAA', 'MLP-BORRADOR']);
    expect(JSON.stringify(r.data.productos)).not.toContain('8000');
    expect(r.data.regiones[0]).toMatchObject({ codigo: 'RM', envio: 3990 });
  });

  it('la tienda pública sigue cerrada mientras tanto', async () => {
    db.tables.shop_settings[0].tienda_activa = false;
    expect(await shop.catalogoPublico()).toEqual({ ok: true, data: { activa: false, productos: [], regiones: [] } });
  });
});

describe('importación desde el CSV de Shopify', () => {
  const imagen = (tipo = 'image/jpeg', bytes = 10) => ({
    ok: true, status: 200, headers: { get: (h: string) => (h === 'content-type' ? tipo : String(bytes)) },
    arrayBuffer: async () => new ArrayBuffer(bytes),
  });

  it('copia solo fotos de cdn.shopify.com y crea todo en borrador', async () => {
    const pedidas: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { pedidas.push(url); return imagen(); }));
    const r = await shop.importarDesdeShopify([{
      nombre: 'Magnesio importado de Shopify', categoria: 'suplementos', costo: 8000, stock: 12, registro: 'Reg. ISP F-1/26',
      descripcion: '<p>Alta absorción</p>',
      imagenes: ['https://cdn.shopify.com/s/a.jpg', 'https://malicioso.example/x.jpg', 'http://cdn.shopify.com/b.jpg'],
    }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.resultados[0]).toMatchObject({ ok: true, fotos: 1, fotosFallidas: 2 });
    expect(pedidas).toEqual(['https://cdn.shopify.com/s/a.jpg']);
    const p = db.tables.shop_products.find((x: any) => x.nombre === 'Magnesio importado de Shopify');
    expect(p).toMatchObject({ estado: 'borrador', origen: 'propio', costo: 8000, stock: 12, consumible: true, resolucion_sanitaria: 'Reg. ISP F-1/26' });
    expect(p.imagenes[0]).toMatch(/^https:\/\/example\.supabase\.co\/storage\/v1\/object\/public\/shop-images\/productos\/.+\.jpg$/);
  });

  it('rechaza tipos de archivo no permitidos y fotos muy pesadas', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('.svg') ? imagen('image/svg+xml') : imagen('image/png', 6 * 1024 * 1024))));
    expect(await shop.copiarFotoShopify('https://cdn.shopify.com/x.svg')).toBeNull();
    expect(await shop.copiarFotoShopify('https://cdn.shopify.com/x.png')).toBeNull();
  });

  it('informa los productos sin costo y respeta el máximo por envío', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imagen()));
    const r = await shop.importarDesdeShopify([{ nombre: 'Sin costo', categoria: 'bienestar', costo: null, stock: 1, imagenes: [] }]);
    expect(r.ok && r.data.resultados[0]).toMatchObject({ ok: false, error: expect.stringMatching(/cost/i) });
    const muchos = Array.from({ length: 21 }, (_, i) => ({ nombre: `P${i}`, categoria: 'bienestar', costo: 1000, stock: 1 }));
    expect(await shop.importarDesdeShopify(muchos)).toMatchObject({ ok: false, code: 400 });
  });
});

describe('evento de Meta de la tienda', () => {
  it('lleva SKU, cantidades, teléfono cifrado y el id del pedido como event_id', () => {
    const ev = meta.buildEbookPurchaseEvent({
      orderId: 'o-1', productSlug: 'tienda', amount: 31970, email: 'ana@mail.cl', fullName: 'Ana Pérez',
      phone: '+56912345678', sourceUrl: 'https://clinicamaslife.cl/tienda/gracias',
      contents: [{ id: 'MLP-0000AAAA', quantity: 2, item_price: 13990 }],
    });
    expect(ev.event_id).toBe('o-1');
    expect(ev.event_source_url).toBe('https://clinicamaslife.cl/tienda/gracias');
    expect(ev.custom_data).toEqual({
      currency: 'CLP', value: 31970, content_type: 'product', content_ids: ['MLP-0000AAAA'],
      contents: [{ id: 'MLP-0000AAAA', quantity: 2, item_price: 13990 }], num_items: 2,
    });
    expect(ev.user_data.ph).toEqual([meta.sha256('56912345678')]);
  });

  it('la guía digital queda igual que antes', () => {
    const ev = meta.buildEbookPurchaseEvent({ orderId: 'o-2', productSlug: 'programa-lumbar-4-semanas', amount: 9990, email: 'a@b.cl' });
    expect(ev.event_source_url).toBe('https://clinicamaslife.cl/programas/gracias');
    expect(ev.custom_data).toEqual({ currency: 'CLP', value: 9990, content_type: 'product', content_ids: ['programa-lumbar-4-semanas'] });
    expect(ev.user_data.ph).toBeUndefined();
  });
});
