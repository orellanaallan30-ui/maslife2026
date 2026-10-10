import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const PRO_ID = 'd248409b-f9c9-4a90-85b0-e9482e0b4b6b';
const APT_ID = '2a40a859-9ad6-4a04-b9e5-31df4c4359a8';

const db = vi.hoisted(() => ({
  apt: null as any,
  updates: [] as Array<{ table: string; payload: any }>,
}));

vi.mock('@supabase/supabase-js', () => {
  const builder = (table: string) => {
    let isUpdate = false;
    const b: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'update') return (payload: any) => { isUpdate = true; db.updates.push({ table, payload }); return b; };
        if (prop === 'maybeSingle' || prop === 'single') {
          return async () => {
            if (isUpdate) return { data: { id: APT_ID }, error: null };
            if (table === 'appointments') return { data: db.apt, error: null };
            if (table === 'professionals') return { data: { email: 'pro@mail.cl', payment_enabled: true }, error: null };
            return { data: null, error: null };
          };
        }
        if (prop === 'then') return (res: any) => res({ data: [], error: null });
        return () => b;
      },
    });
    return b;
  };
  return { createClient: () => ({ from: (t: string) => builder(t) }) };
});

type Envio = { to: string; subject: string };

function mockResend(falla: (to: string, intento: number) => boolean) {
  const envios: Envio[] = [];
  const intentos: Record<string, number> = {};
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
    const b = JSON.parse(init.body);
    const to = b.to[0] as string;
    intentos[to] = (intentos[to] || 0) + 1;
    if (falla(to, intentos[to])) return { ok: false, json: async () => ({ message: 'boom' }) };
    envios.push({ to, subject: b.subject });
    return { ok: true, json: async () => ({ id: `id-${envios.length}` }) };
  }));
  return envios;
}

let n = 0;
async function llamar(handler: any, body: any) {
  const res: any = {
    code: 0, body: null,
    setHeader() {}, end() { return this; },
    status(c: number) { this.code = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
  await handler({ method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${++n}` }, body }, res);
  return res;
}

const base = {
  professionalId: PRO_ID, professionalName: 'Sebastián Orellana', patientName: 'Mercy Marín',
  serviceName: 'Kinesiología', date: '2026-10-15', time: '10:00:00', type: 'Presencial',
  appointmentId: APT_ID, isReceipt: true, price: 30000,
};

describe('/api/notify: correo a la paciente', () => {
  let handler: any;
  beforeAll(async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'x');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    handler = (await import('../../api/notify')).default;
  });
  beforeEach(() => {
    db.updates.length = 0;
    db.apt = {
      id: APT_ID, professional_id: PRO_ID, patient_name: 'Mercy Marín', service_name: 'Kinesiología',
      patient_email: 'mercy@mail.cl', payment_status: 'Pagado', payment_amount: 30000, price: 30000,
      booking_source: 'web', type: 'Presencial', duration: 60, date: '2026-10-15', time: '10:00:00',
      patient_email_sent_at: null,
    };
  });

  it('usa el correo guardado en la cita cuando el cuerpo no lo trae', async () => {
    const envios = mockResend(() => false);
    const r = await llamar(handler, base);
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ pro: 'ok', patient: 'ok' });
    expect(envios.map(e => e.to)).toEqual(['pro@mail.cl', 'mercy@mail.cl']);
    expect(db.updates.some(u => u.table === 'appointments' && u.payload.patient_email_sent_at)).toBe(true);
  });

  it('reintenta una vez si el primer envío a la paciente falla', async () => {
    const envios = mockResend((to, intento) => to === 'mercy@mail.cl' && intento === 1);
    const r = await llamar(handler, base);
    expect(r.body).toMatchObject({ pro: 'ok', patient: 'ok' });
    expect(envios.some(e => e.to === 'mercy@mail.cl')).toBe(true);
  });

  it('si falla el correo a la paciente, lo informa y NO marca patient_email_sent_at', async () => {
    mockResend(to => to === 'mercy@mail.cl');
    const r = await llamar(handler, base);
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ pro: 'ok', patient: 'error' });
    expect(db.updates.some(u => u.payload.patient_email_sent_at)).toBe(false);
  });

  it('onlyPatient: envía solo a la paciente y reclama el reenvío', async () => {
    const envios = mockResend(() => false);
    const r = await llamar(handler, { ...base, onlyPatient: true });
    expect(r.body).toMatchObject({ pro: 'omitido', patient: 'ok' });
    expect(envios.map(e => e.to)).toEqual(['mercy@mail.cl']);
  });

  it('onlyPatient: rechaza citas que no están pagadas', async () => {
    mockResend(() => false);
    db.apt.payment_status = 'Pendiente';
    const r = await llamar(handler, { ...base, onlyPatient: true });
    expect(r.code).toBe(400);
  });

  it('onlyPatient: si el envío falla libera el reclamo para reintentar luego', async () => {
    mockResend(to => to === 'mercy@mail.cl');
    const r = await llamar(handler, { ...base, onlyPatient: true });
    expect(r.body).toMatchObject({ patient: 'error' });
    expect(db.updates.at(-1)?.payload).toEqual({ patient_email_sent_at: null });
  });
});
