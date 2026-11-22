import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listarProductosDropi, obtenerProductoDropi, crearPedidoBorradorDropi } from '../../api/_lib/dropi';

let llamadas: Array<{ url: string; init: any }> = [];

function responder(status: number, cuerpo: unknown) {
  llamadas = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    llamadas.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => cuerpo };
  }));
}

beforeEach(() => {
  vi.stubEnv('DROPI_INTEGRATION_KEY', 'clave-prueba');
});

describe('cliente Dropi', () => {
  it('envía la cabecera y el cuerpo del plugin oficial', async () => {
    responder(200, { isSuccess: true, objects: [{ id: 1 }] });
    const r = await listarProductosDropi({ buscar: 'rodillera', pagina: 1, porPagina: 10, conStock: true });
    expect(r).toEqual({ ok: true, objects: [{ id: 1 }] });
    expect(llamadas[0].url).toBe('https://api.dropi.cl/integrations/products/index');
    expect(llamadas[0].init.headers['dropi-integration-key']).toBe('clave-prueba');
    expect(JSON.parse(llamadas[0].init.body)).toMatchObject({
      startData: 10, pageSize: 10, keywords: 'rodillera', active: true, integration: true, stockmayor: 1,
    });
  });

  it('convierte un 401 en error de autenticación', async () => {
    responder(401, { isSuccess: false, message: 'Access denied', status: 401 });
    expect(await obtenerProductoDropi(5)).toMatchObject({ ok: false, tipo: 'auth', status: 401 });
  });

  it('detecta falta de saldo en la wallet', async () => {
    responder(200, { isSuccess: false, message: 'Saldo insuficiente' });
    const r = await crearPedidoBorradorDropi({ status: 'PENDIENTE CONFIRMACION' });
    expect(r).toMatchObject({ ok: false, tipo: 'saldo' });
  });

  it('un fallo de red es reintentable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));
    expect(await obtenerProductoDropi(5)).toMatchObject({ ok: false, tipo: 'red' });
  });

  it('nunca envía un pedido que no sea borrador', async () => {
    responder(200, { isSuccess: true, objects: { id: 9 } });
    const r = await crearPedidoBorradorDropi({ status: 'CONFIRMADO' });
    expect(r.ok).toBe(false);
    expect(llamadas).toHaveLength(0);
  });

  it('sin clave configurada no llama a Dropi', async () => {
    vi.stubEnv('DROPI_INTEGRATION_KEY', '');
    responder(200, { isSuccess: true, objects: [] });
    expect(await listarProductosDropi({})).toMatchObject({ ok: false, tipo: 'auth' });
    expect(llamadas).toHaveLength(0);
  });

  it('valida el id antes de consultar', async () => {
    responder(200, { isSuccess: true, objects: {} });
    expect((await obtenerProductoDropi(-1)).ok).toBe(false);
    expect(llamadas).toHaveLength(0);
  });
});
