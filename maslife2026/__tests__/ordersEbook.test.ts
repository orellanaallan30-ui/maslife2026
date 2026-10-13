import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, sign: undefined as any }));

vi.mock('@supabase/supabase-js', async () => {
  const { makeFakeSupabase } = await import('./helpers/fakeSupabase');
  return { createClient: () => makeFakeSupabase(db.tables, (p: string) => (db.sign ? db.sign(p) : { data: { signedUrl: `https://signed.example/${p}` }, error: null })) };
});

let orders: typeof import('../../api/_lib/orders');
const SLUG = 'programa-lumbar-4-semanas';

type Llamada = { url: string; init: any };
let llamadas: Llamada[] = [];

function mockFetch(opts: { notifyOk?: boolean } = {}) {
  llamadas = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    llamadas.push({ url, init });
    if (url.includes('/checkout/preferences')) return { ok: true, json: async () => ({ id: 'pref-1', init_point: 'https://mp.example/pay' }) };
    if (url.includes('/api/notify')) return { ok: opts.notifyOk !== false, status: opts.notifyOk === false ? 500 : 200, text: async () => '' };
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  }));
}

const buenaCompra = { slug: SLUG, name: 'Ana Pérez', email: 'ANA@mail.cl', acceptedTerms: true };

beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'x');
  vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'APP_USR-test');
  vi.stubEnv('EBOOK_PROGRAMA_LUMBAR_ACTIVO', '1');
  orders = await import('../../api/_lib/orders');
});

beforeEach(() => {
  Object.keys(db.tables).forEach(k => delete db.tables[k]);
  db.sign = undefined;
  vi.stubEnv('EBOOK_PROGRAMA_LUMBAR_ACTIVO', '1');
  mockFetch();
});

describe('UTM de atribución', () => {
  it('guarda solo las 4 UTM esperadas, limpias y de largo acotado', async () => {
    await orders.createOrder({ ...buenaCompra, utm: {
      utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: 'programa-lumbar-coquimbo-oct26',
      utm_content: 'carrusel-mitos', utm_term: 'no-se-guarda', otra: 'x',
    } });
    expect(db.tables.orders[0]).toMatchObject({ utm_source: 'meta', utm_medium: 'paid_social', utm_content: 'carrusel-mitos' });
    expect(db.tables.orders[0]).not.toHaveProperty('utm_term');
    expect(db.tables.orders[0]).not.toHaveProperty('otra');
  });

  it('descarta valores con caracteres raros, demasiado largos o que no son texto', () => {
    expect(orders.cleanUtms({ utm_source: '<script>', utm_medium: 'a'.repeat(101), utm_campaign: 123, utm_content: 'ok-1' }))
      .toEqual({ utm_content: 'ok-1' });
    expect(orders.cleanUtms(null)).toEqual({});
    expect(orders.cleanUtms('texto')).toEqual({});
  });

  it('un pedido sin UTM se crea igual', async () => {
    const r = await orders.createOrder(buenaCompra);
    expect(r.ok).toBe(true);
    expect(db.tables.orders[0].utm_source).toBeUndefined();
  });
});

describe('createOrder', () => {
  it('cobra el precio del catálogo del servidor y deja el pedido pendiente', async () => {
    const r = await orders.createOrder({ ...buenaCompra, price: 1, amount: 1 } as any);
    expect(r.ok).toBe(true);
    const pref = JSON.parse(llamadas.find(l => l.url.includes('/checkout/preferences'))!.init.body);
    expect(pref.items[0].unit_price).toBe(9990);
    expect(pref.external_reference).toBe(`ebook:${(r as any).data.orderId}`);
    expect(pref.payment_methods.excluded_payment_types.map((t: any) => t.id)).toEqual(['ticket', 'atm']);
    expect(db.tables.orders[0]).toMatchObject({ amount: 9990, status: 'pendiente', buyer_email: 'ana@mail.cl' });
  });

  it('no vende si el programa no está activado', async () => {
    vi.stubEnv('EBOOK_PROGRAMA_LUMBAR_ACTIVO', '0');
    const r = await orders.createOrder(buenaCompra);
    expect(r).toMatchObject({ ok: false, code: 409 });
    expect(db.tables.orders ?? []).toHaveLength(0);
  });

  it('exige términos aceptados, nombre y correo válidos', async () => {
    expect(await orders.createOrder({ ...buenaCompra, acceptedTerms: false })).toMatchObject({ ok: false, code: 400 });
    expect(await orders.createOrder({ ...buenaCompra, email: 'no-es-correo' })).toMatchObject({ ok: false, code: 400 });
    expect(await orders.createOrder({ ...buenaCompra, name: ' ' })).toMatchObject({ ok: false, code: 400 });
    expect(await orders.createOrder({ ...buenaCompra, slug: 'otro' })).toMatchObject({ ok: false, code: 404 });
  });
});

async function pedidoPendiente() {
  const r: any = await orders.createOrder(buenaCompra);
  return r.data.orderId as string;
}
const pagoOk = (orderId: string, extra: any = {}) => ({
  id: 555, status: 'approved', external_reference: `ebook:${orderId}`, transaction_amount: 9990, currency_id: 'CLP', ...extra,
});

describe('confirmPaidOrder', () => {
  it('rechaza pagos con monto o referencia que no coinciden', async () => {
    const id = await pedidoPendiente();
    expect(await orders.confirmPaidOrder(id, pagoOk(id, { transaction_amount: 100 }))).toBe('rechazado');
    expect(await orders.confirmPaidOrder(id, pagoOk(id, { external_reference: 'ebook:otro' }))).toBe('rechazado');
    expect(await orders.confirmPaidOrder(id, pagoOk(id, { status: 'pending' }))).toBe('rechazado');
    expect(db.tables.orders[0].status).toBe('pendiente');
  });

  it('marca como pagado una vez y es idempotente', async () => {
    const id = await pedidoPendiente();
    expect(await orders.confirmPaidOrder(id, pagoOk(id))).toBe('pagado');
    expect(await orders.confirmPaidOrder(id, pagoOk(id))).toBe('ya-pagado');
    expect(db.tables.orders[0]).toMatchObject({ status: 'pagado', mp_payment_id: '555' });
  });
});

describe('deliverOrder', () => {
  it('envía el correo una sola vez aunque se llame dos veces', async () => {
    const id = await pedidoPendiente();
    await orders.confirmPaidOrder(id, pagoOk(id));
    expect(await orders.deliverOrder(id)).toBe('enviado');
    expect(await orders.deliverOrder(id)).toBe('ya-enviado');
    const envios = llamadas.filter(l => l.url.includes('/api/notify'));
    expect(envios).toHaveLength(1);
    const body = JSON.parse(envios[0].init.body);
    expect(body.action).toBe('ebook-delivery');
    expect(body.orderId).toBe(id);
    expect(db.tables.orders[0].download_token_hash).toBe(orders.hashToken(body.token));
    expect(db.tables.orders[0].download_token_hash).not.toBe(body.token);
  });

  it('si el correo falla, libera la entrega para poder reintentar', async () => {
    const id = await pedidoPendiente();
    await orders.confirmPaidOrder(id, pagoOk(id));
    mockFetch({ notifyOk: false });
    expect(await orders.deliverOrder(id)).toBe('error');
    expect(db.tables.orders[0].delivered_at).toBeNull();
    mockFetch({ notifyOk: true });
    expect(await orders.deliverOrder(id)).toBe('enviado');
  });

  it('no entrega pedidos sin pago', async () => {
    const id = await pedidoPendiente();
    expect(await orders.deliverOrder(id)).toBe('ya-enviado');
    expect(llamadas.some(l => l.url.includes('/api/notify'))).toBe(false);
  });
});

describe('consumeDownload', () => {
  const token = 'a'.repeat(43);
  const sembrar = (extra: any = {}) => {
    db.tables.orders = [{
      id: 'o1', product_slug: SLUG, status: 'pagado', download_token_hash: orders.hashToken(token),
      expires_at: new Date(Date.now() + 86400000).toISOString(), download_count: 0, max_downloads: 5, delivered_at: 'x', ...extra,
    }];
  };

  it('entrega una URL firmada y cuenta la descarga', async () => {
    sembrar();
    const r: any = await orders.consumeDownload(token);
    expect(r.ok).toBe(true);
    expect(r.data.url).toContain('programa-lumbar-4-semanas.pdf');
    expect(r.data.restantes).toBe(4);
    expect(db.tables.orders[0].download_count).toBe(1);
  });

  it('rechaza token inexistente, malformado, vencido o agotado', async () => {
    sembrar();
    expect(await orders.consumeDownload('b'.repeat(43))).toMatchObject({ ok: false, code: 404 });
    expect(await orders.consumeDownload('corto')).toMatchObject({ ok: false, code: 404 });
    sembrar({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect(await orders.consumeDownload(token)).toMatchObject({ ok: false, code: 410 });
    sembrar({ download_count: 5 });
    expect(await orders.consumeDownload(token)).toMatchObject({ ok: false, code: 429 });
    sembrar({ status: 'pendiente' });
    expect(await orders.consumeDownload(token)).toMatchObject({ ok: false, code: 404 });
  });

  it('no gasta una descarga si el archivo no se puede firmar', async () => {
    sembrar();
    db.sign = () => ({ data: null, error: { message: 'Object not found' } });
    expect(await orders.consumeDownload(token)).toMatchObject({ ok: false, code: 503 });
    expect(db.tables.orders[0].download_count).toBe(0);
  });
});

describe('tokenMatches', () => {
  it('compara contra el hash y rechaza tokens mal formados', () => {
    const t = 'c'.repeat(43);
    expect(orders.tokenMatches(orders.hashToken(t), t)).toBe(true);
    expect(orders.tokenMatches(orders.hashToken(t), 'd'.repeat(43))).toBe(false);
    expect(orders.tokenMatches(null, t)).toBe(false);
    expect(orders.tokenMatches(orders.hashToken(t), 'x')).toBe(false);
  });
});
