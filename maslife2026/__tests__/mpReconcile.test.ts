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
  avisos: unknown[];       // filas insertadas en pro_notifications
  canceladas?: string[];   // citas cuyo hold ya expiró (status 'Cancelado')
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

// syncAppointmentToGoogle hace su propia red; se simula para aislar la lógica.
const sincronizadas: string[] = [];
let googleFalla = false;
vi.mock('../../api/_lib/googleCalendar', () => ({
  syncAppointmentToGoogle: async (_pro: string, id: string) => {
    if (googleFalla) throw new Error('Google caído');
    sincronizadas.push(id);
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      if (tabla === 'appointments') {
        return {
          select: () => tablaAppointments(),
          // Cadena flexible: acepta cualquier número de .eq()/.is() y resuelve al
          // llamar .select(), como el cliente real. Así el doble no se rompe cada
          // vez que la consulta gana un filtro.
          update: (campos: any) => {
            const filtros: Record<string, unknown> = {};
            const chain: any = {
              eq(col: string, valor: unknown) { filtros[col] = valor; return this; },
              is(col: string, valor: unknown) { filtros[col] = valor; return this; },
              select: async () => {
                const id = String(filtros.id ?? '');
                // La conciliación exige status 'Pendiente'; la rama de pago tardío
                // exige 'Cancelado'. El escenario dice en cuál está cada cita.
                const estadoPedido = filtros.status;
                const estadoReal = esc.canceladas?.includes(id) ? 'Cancelado' : 'Pendiente';
                const coincide = esc.confirmadas.includes(id)
                  && (estadoPedido === undefined || estadoPedido === estadoReal);
                return {
                  data: coincide
                    ? [{ id, professional_id: 'pro-1', patient_id: null, patient_name: 'Juan',
                         service_name: 'prueba', date: '2026-08-26', time: '13:00:00', ...campos }]
                    : [],
                  error: null,
                };
              },
              maybeSingle: async () => ({ data: null }),
            };
            return chain;
          },
        };
      }
      if (tabla === 'professional_secrets') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: esc.token ? { mp_access_token: esc.token } : null }) }),
          }),
        };
      }
      if (tabla === 'pro_notifications') {
        return { insert: async (fila: unknown) => { esc.avisos.push(fila); return { error: null }; } };
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

const { reconcilePendingWithMP, confirmPaidAppointment } = await import('../../api/_lib/mpReconcile');

const respuestaMP = (resultados: unknown[]) => ({
  ok: true,
  json: async () => ({ results: resultados }),
});

describe('reconcilePendingWithMP', () => {
  beforeEach(() => {
    esc = { pendientes: [], token: 'TOKEN-DEL-PROFESIONAL', confirmadas: [], ingresos: [], avisos: [] };
    sincronizadas.length = 0;
    googleFalla = false;
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

describe('confirmPaidAppointment', () => {
  beforeEach(() => {
    esc = { pendientes: [], token: 'TOKEN', confirmadas: ['cita-1'], ingresos: [], avisos: [] };
    sincronizadas.length = 0;
    googleFalla = false;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as any));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('avisa en la campana del panel, no solo por correo', async () => {
    await confirmPaidAppointment('cita-1', 1000, '2026-08-25T03:17:45Z');
    expect(esc.avisos).toHaveLength(1);
    expect((esc.avisos[0] as any).kind).toBe('booking');
    expect((esc.avisos[0] as any).body).toContain('Nueva cita pagada');
  });

  it('sincroniza la cita con el Google Calendar del profesional', async () => {
    // Esto antes solo ocurría si el paciente volvía del checkout: al cerrar la
    // pestaña, la cita se cobraba pero nunca llegaba al calendario.
    await confirmPaidAppointment('cita-1', 1000, '2026-08-25T03:17:45Z');
    expect(sincronizadas).toEqual(['cita-1']);
  });

  it('si Google falla, la cita igual queda confirmada', async () => {
    googleFalla = true;
    expect(await confirmPaidAppointment('cita-1', 1000, '2026-08-25T03:17:45Z')).toBe(true);
    expect(esc.ingresos).toHaveLength(1);
  });

  it('una segunda llamada no duplica ingreso, aviso ni evento', async () => {
    esc.confirmadas = [];  // el UPDATE no actualiza nada: ya estaba confirmada
    expect(await confirmPaidAppointment('cita-1', 1000, '2026-08-25T03:17:45Z')).toBe(false);
    expect(esc.ingresos).toHaveLength(0);
    expect(esc.avisos).toHaveLength(0);
    expect(sincronizadas).toHaveLength(0);
  });
});

describe('pago que llega cuando la reserva ya expiró', () => {
  // El agujero que cerraba este cambio: si el cupo se libera antes de que el pago
  // se acredite, el dinero entra igual. Antes la fila se borraba y ese pago
  // quedaba huérfano; ahora la reserva queda 'Cancelado' y el caso se atiende.
  beforeEach(() => {
    esc = { pendientes: [], token: 'TOKEN', confirmadas: ['cita-1'], canceladas: ['cita-1'],
            ingresos: [], avisos: [] };
    sincronizadas.length = 0;
    googleFalla = false;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as any));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('NO re-toma el horario de una reserva cancelada', async () => {
    // Podría estar ocupado por otro paciente: re-confirmarla sería doble reserva.
    expect(await confirmPaidAppointment('cita-1', 1000, '2026-08-25T03:17:45Z')).toBe(false);
    expect(sincronizadas).toHaveLength(0);
    expect(esc.ingresos).toHaveLength(0);
  });

  it('avisa al profesional para que contacte al paciente y reagende', async () => {
    await confirmPaidAppointment('cita-1', 1000, '2026-08-25T03:17:45Z');
    expect(esc.avisos).toHaveLength(1);
    expect((esc.avisos[0] as any).body).toContain('ya había expirado');
    expect((esc.avisos[0] as any).body).toContain('reagendar');
  });

  it('no avisa nada si la cita simplemente ya estaba confirmada', async () => {
    // Caso normal: el webhook y la conciliación llegan casi a la vez. No es un
    // problema y no debe generar ruido en la campana.
    esc.confirmadas = [];
    expect(await confirmPaidAppointment('cita-1', 1000, '2026-08-25T03:17:45Z')).toBe(false);
    expect(esc.avisos).toHaveLength(0);
  });
});
