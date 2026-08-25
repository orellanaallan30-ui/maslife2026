import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Tests de la reconciliación activa de pagos con MercadoPago.
//
// Contexto: el 25/08 un pago real se acreditó y la cita quedó en "Pendiente"
// porque el paciente cerró la pestaña y MercadoPago nunca llamó al webhook.
// reconcilePendingWithMP existe para que eso no vuelva a ocurrir: en vez de
// esperar el aviso, preguntamos nosotros.

// ── Doble de Supabase ────────────────────────────────────────────────────────
// Encadena como el cliente real y devuelve lo que cada test configure.
type Escenario = {
  pendientes: Array<{ id: string }>;
  token: string | null;
  confirmadas: string[];   // ids que el UPDATE dio por actualizados
  ingresos: unknown[];     // filas insertadas en transactions
  errorLectura?: string;
};

let esc: Escenario;

function tablaAppointments() {
  const chain: any = {
    _select: null as string | null,
    select(cols: string) { this._select = cols; return this; },
    eq() { return this; },
    not() { return this; },
    gte() { return this; },
    is() { return this; },
    maybeSingle: async () => ({ data: null }),
    then(resolve: (v: any) => void) {
      // Lectura de pendientes
      if (esc.errorLectura) return resolve({ data: null, error: { message: esc.errorLectura } });
      return resolve({ data: esc.pendientes, error: null });
    },
  };
  return chain;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      if (tabla === 'appointments') {
        return {
          select: () => tablaAppointments(),
          update: (campos: any) => ({
            eq: (_c: string, valor: string) => ({
              eq: () => ({
                select: async () => ({
                  data: esc.confirmadas.includes(valor)
                    ? [{ id: valor, professional_id: 'pro-1', patient_name: 'Juan', service_name: 'prueba', ...campos }]
                    : [],
                  error: null,
                }),
              }),
              is: () => ({
                select: () => ({ maybeSingle: async () => ({ data: null }) }),
              }),
            }),
          }),
        };
      }
      if (tabla === 'professional_secrets') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: esc.token ? { mp_access_token: esc.token } : null }) }),
          }),
        };
      }
      if (tabla === 'transactions') {
        return { insert: async (fila: unknown) => { esc.ingresos.push(fila); return { error: null }; } };
      }
      if (tabla === 'professionals') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
    },
  }),
}));

const { reconcilePendingWithMP } = await import('../../api/_lib/mpReconcile');

const respuestaMP = (resultados: unknown[]) => ({
  ok: true,
  json: async () => ({ results: resultados }),
});

describe('reconcilePendingWithMP', () => {
  beforeEach(() => {
    esc = { pendientes: [], token: 'TOKEN-DEL-PROFESIONAL', confirmadas: [], ingresos: [] };
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('confirma la cita cuando MercadoPago reporta el pago aprobado', async () => {
    esc.pendientes = [{ id: 'cita-1' }];
    esc.confirmadas = ['cita-1'];
    vi.mocked(fetch).mockResolvedValue(
      respuestaMP([{ status: 'approved', transaction_amount: 1000, date_approved: '2026-08-25T03:17:45Z' }]) as any,
    );

    expect(await reconcilePendingWithMP('pro-1')).toBe(1);
    expect(esc.ingresos).toHaveLength(1);
  });

  it('usa el token del profesional, no el de la plataforma', async () => {
    // El pago vive en la cuenta del profesional: con el token de la plataforma
    // MercadoPago responde "Payment not found". Este es el detalle que hace que
    // toda la conciliación funcione.
    esc.pendientes = [{ id: 'cita-1' }];
    vi.mocked(fetch).mockResolvedValue(respuestaMP([]) as any);

    await reconcilePendingWithMP('pro-1');

    const [, opciones] = vi.mocked(fetch).mock.calls[0];
    expect((opciones as any).headers.Authorization).toBe('Bearer TOKEN-DEL-PROFESIONAL');
  });

  it('no toca nada si el pago sigue pendiente o fue rechazado', async () => {
    esc.pendientes = [{ id: 'cita-1' }];
    esc.confirmadas = ['cita-1'];
    vi.mocked(fetch).mockResolvedValue(
      respuestaMP([{ status: 'pending', transaction_amount: 1000 }]) as any,
    );

    expect(await reconcilePendingWithMP('pro-1')).toBe(0);
    expect(esc.ingresos).toHaveLength(0);
  });

  it('no llama a MercadoPago si el profesional no conectó su cuenta', async () => {
    esc.pendientes = [{ id: 'cita-1' }];
    esc.token = null;

    expect(await reconcilePendingWithMP('pro-1')).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('no llama a MercadoPago si no hay citas pendientes', async () => {
    esc.pendientes = [];

    expect(await reconcilePendingWithMP('pro-1')).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('no explota si MercadoPago responde con error', async () => {
    esc.pendientes = [{ id: 'cita-1' }];
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as any);

    expect(await reconcilePendingWithMP('pro-1')).toBe(0);
  });

  it('no explota si la red falla — es un respaldo, no debe tumbar el flujo', async () => {
    esc.pendientes = [{ id: 'cita-1' }];
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNRESET'));

    expect(await reconcilePendingWithMP('pro-1')).toBe(0);
  });

  it('no explota si no se pueden leer las citas', async () => {
    esc.errorLectura = 'permission denied';

    expect(await reconcilePendingWithMP('pro-1')).toBe(0);
  });
});
