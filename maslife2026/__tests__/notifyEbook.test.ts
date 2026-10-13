import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }));

vi.mock('@supabase/supabase-js', async () => {
  const { makeFakeSupabase } = await import('./helpers/fakeSupabase');
  return { createClient: () => makeFakeSupabase(db.tables) };
});

let handler: any;
let hashToken: (t: string) => string;
let enviados: Array<{ to: string; subject: string; html: string }> = [];
let n = 0;
const TOKEN = 'e'.repeat(43);
const ORDER = '3f1c2a9e-4b7d-4c1a-9e0f-5a6b7c8d9e01';

async function llamar(body: any) {
  const res: any = {
    code: 0, body: null, setHeader() {}, end() { return this; },
    status(c: number) { this.code = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
  await handler({ method: 'POST', headers: { 'x-forwarded-for': `10.9.0.${++n}` }, body }, res);
  return res;
}

beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'x');
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('EBOOK_PROGRAMA_LUMBAR_ACTIVO', '1');
  handler = (await import('../../api/notify')).default;
  hashToken = (await import('../../api/_lib/orders')).hashToken;
});

beforeEach(() => {
  enviados = [];
  Object.keys(db.tables).forEach(k => delete db.tables[k]);
  Object.assign(db.tables, {
    orders: [{
      id: ORDER, product_slug: 'programa-lumbar-4-semanas', status: 'pagado', buyer_name: 'Ana Pérez',
      buyer_email: 'comprador@mail.cl', download_token_hash: hashToken(TOKEN),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), max_downloads: 5,
    }],
  });
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => {
    const b = JSON.parse(init.body);
    enviados.push({ to: b.to[0], subject: b.subject, html: b.html });
    return { ok: true, json: async () => ({ id: 'id-1' }) };
  }));
});

describe('/api/notify action ebook-delivery', () => {
  it('escribe solo al correo del pedido y arma el enlace con el token', async () => {
    const r = await llamar({ action: 'ebook-delivery', orderId: ORDER, token: TOKEN, to: 'victima@mail.cl', patientEmail: 'victima@mail.cl', downloadLink: 'https://evil.example/x' });
    expect(r.code).toBe(200);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toBe('comprador@mail.cl');
    expect(enviados[0].html).toContain(`https://clinicamaslife.cl/descarga/${TOKEN}`);
    expect(enviados[0].html).not.toContain('evil.example');
  });

  it('rechaza token incorrecto, pedido sin pagar o datos mal formados', async () => {
    expect((await llamar({ action: 'ebook-delivery', orderId: ORDER, token: 'f'.repeat(43) })).code).toBe(403);
    db.tables.orders[0].status = 'pendiente';
    expect((await llamar({ action: 'ebook-delivery', orderId: ORDER, token: TOKEN })).code).toBe(403);
    expect((await llamar({ action: 'ebook-delivery', orderId: 'no-uuid', token: TOKEN })).code).toBe(400);
    expect((await llamar({ action: 'ebook-delivery', orderId: ORDER, token: 'corto' })).code).toBe(400);
    expect(enviados).toHaveLength(0);
  });
});
