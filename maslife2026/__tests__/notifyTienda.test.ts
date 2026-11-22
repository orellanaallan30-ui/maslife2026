import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }));

vi.mock('@supabase/supabase-js', async () => {
  const { makeFakeSupabase } = await import('./helpers/fakeSupabase');
  return { createClient: () => makeFakeSupabase(db.tables) };
});

let handler: any;
let internalKey: () => string;
let enviados: Array<{ to: string; subject: string; html: string }> = [];
let n = 0;
const ORDER = '7a1c2a9e-4b7d-4c1a-9e0f-5a6b7c8d9e02';
const CLIENTE = '8b1c2a9e-4b7d-4c1a-9e0f-5a6b7c8d9e03';

async function llamar(body: any, interno = true) {
  const res: any = {
    code: 0, body: null, setHeader() {}, end() { return this; },
    status(c: number) { this.code = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
  const headers: Record<string, string> = { 'x-forwarded-for': `10.8.0.${++n}` };
  if (interno) headers['x-agendamas-internal'] = internalKey();
  await handler({ method: 'POST', headers, body }, res);
  return res;
}

beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'x');
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('ADMIN_EMAIL', 'rodrigo@clinica.cl');
  handler = (await import('../../api/notify')).default;
  internalKey = (await import('../../api/_lib/auth')).internalKey;
});

beforeEach(() => {
  enviados = [];
  Object.keys(db.tables).forEach(k => delete db.tables[k]);
  Object.assign(db.tables, {
    orders: [{
      id: ORDER, tipo: 'tienda', status: 'pagado', buyer_name: 'Ana <b>Pérez</b>', buyer_email: 'ana@mail.cl',
      customer_id: CLIENTE, direccion: 'Av. Siempre Viva 123', comuna: 'PROVIDENCIA', region: 'RM',
      envio_monto: 3990, amount: 21980, transportista: null, tracking: null, url_seguimiento: null,
    }],
    order_items: [{ order_id: ORDER, nombre: 'Magnesio 120 cápsulas', cantidad: 2, precio_unitario: 8995 }],
    shop_customers: [{ id: CLIENTE, telefono: '+56912345678' }],
  });
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => {
    const b = JSON.parse(init.body);
    enviados.push({ to: b.to[0], subject: b.subject, html: b.html });
    return { ok: true, json: async () => ({ id: 'id-1' }) };
  }));
});

describe('/api/notify action shop-aviso', () => {
  it('rechaza llamadas que no vienen del servidor', async () => {
    const r = await llamar({ action: 'shop-aviso', tipo: 'nuevo-pedido', orderId: ORDER }, false);
    expect(r.code).toBe(403);
    expect(enviados).toHaveLength(0);
  });

  it('avisa a Rodrigo con lo que hay que despachar, sin inyectar HTML', async () => {
    const r = await llamar({ action: 'shop-aviso', tipo: 'nuevo-pedido', orderId: ORDER, to: 'otro@mail.cl' });
    expect(r.code).toBe(200);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toBe('rodrigo@clinica.cl');
    expect(enviados[0].html).toContain('PROVIDENCIA');
    expect(enviados[0].html).toContain('+56912345678');
    expect(enviados[0].html).toContain('2 × Magnesio 120 cápsulas');
    expect(enviados[0].html).not.toContain('<b>Pérez</b>');
  });

  it('el aviso de despacho va al comprador y exige seguimiento', async () => {
    expect((await llamar({ action: 'shop-aviso', tipo: 'enviado', orderId: ORDER })).code).toBe(409);
    Object.assign(db.tables.orders[0], { transportista: 'Blue Express', tracking: 'BX123', url_seguimiento: 'https://www.bluex.cl/s?n=BX123' });
    const r = await llamar({ action: 'shop-aviso', tipo: 'enviado', orderId: ORDER });
    expect(r.code).toBe(200);
    expect(enviados[0].to).toBe('ana@mail.cl');
    expect(enviados[0].html).toContain('BX123');
    expect(enviados[0].html).toContain('https://www.bluex.cl/s?n=BX123');
  });

  it('no avisa de pedidos sin pagar', async () => {
    db.tables.orders[0].status = 'pendiente';
    expect((await llamar({ action: 'shop-aviso', tipo: 'nuevo-pedido', orderId: ORDER })).code).toBe(404);
  });
});
