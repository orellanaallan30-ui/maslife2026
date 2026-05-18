import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
    },
  },
  APP_URL: 'https://www.clinicamaslife.cl',
}));

import { supabase } from '../supabaseClient';
import { auditService } from '../auditService';

// ── Helper: query-builder encadenable ────────────────────────────────────────
function makeBuilder(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const builder: any = {};
  Object.assign(builder, {
    select: vi.fn().mockReturnValue(builder),
    eq: vi.fn().mockReturnValue(builder),
    insert: vi.fn().mockResolvedValue(result),
    then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
    catch: (fn: any) => Promise.resolve(result).catch(fn),
    finally: (fn: any) => Promise.resolve(result).finally(fn),
  });
  return builder;
}

const sampleLogArgs = {
  userId: 'pro-1',
  userName: 'Dr. Test',
  action: 'SOAP_VIEW' as const,
  resourceId: 'soap-123',
  resourceType: 'soap' as const,
  details: { sessionNumber: 3 },
};

// ═════════════════════════════════════════════════════════════════════════════
// auditService.log
// ═════════════════════════════════════════════════════════════════════════════
describe('auditService.log', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ ip: '192.168.1.1' }),
    }));
  });

  it('inserta el log en audit_logs con todos los campos obligatorios', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: null }));

    await auditService.log(sampleLogArgs);

    expect(supabase.from).toHaveBeenCalledWith('audit_logs');
    const builder = vi.mocked(supabase.from).mock.results[0].value;
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'pro-1',
        user_name: 'Dr. Test',
        action: 'SOAP_VIEW',
        resource_id: 'soap-123',
        resource_type: 'soap',
        ip_address: '192.168.1.1',
        details: { sessionNumber: 3 },
      })
    );
  });

  it('incluye un timestamp ISO 8601 en el log', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: null }));

    await auditService.log(sampleLogArgs);

    const builder = vi.mocked(supabase.from).mock.results[0].value;
    const insertArg = builder.insert.mock.calls[0][0];
    expect(insertArg.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('guarda en fallback local si Supabase devuelve error (nunca falla silenciosamente)', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: { message: 'DB error' } }));

    await auditService.log(sampleLogArgs);

    const fallback = JSON.parse(localStorage.getItem('maslife_audit_fallback')!);
    expect(fallback).toHaveLength(1);
    expect(fallback[0]).toMatchObject({
      userId: 'pro-1',
      action: 'SOAP_VIEW',
      synced: false,
    });
  });

  it('usa "UNKNOWN" como IP si el servicio externo de IP falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: null }));

    await auditService.log(sampleLogArgs);

    const builder = vi.mocked(supabase.from).mock.results[0].value;
    const insertArg = builder.insert.mock.calls[0][0];
    expect(insertArg.ip_address).toBe('UNKNOWN');
  });

  it('no lanza excepción aunque todo falle — es fire-and-forget', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: { message: 'DB down' } }));

    await expect(auditService.log(sampleLogArgs)).resolves.toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// auditService._saveToLocalFallback
// ═════════════════════════════════════════════════════════════════════════════
describe('auditService._saveToLocalFallback', () => {
  it('guarda una nueva entrada con timestamp y synced: false', () => {
    auditService._saveToLocalFallback({ userId: 'u1', action: 'SOAP_VIEW' });

    const entries = JSON.parse(localStorage.getItem('maslife_audit_fallback')!);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ userId: 'u1', action: 'SOAP_VIEW', synced: false });
    expect(entries[0].timestamp).toBeDefined();
  });

  it('acumula múltiples entradas en el mismo array', () => {
    auditService._saveToLocalFallback({ action: 'SOAP_VIEW' });
    auditService._saveToLocalFallback({ action: 'SOAP_SIGN' });
    auditService._saveToLocalFallback({ action: 'SOAP_EXPORT_PDF' });

    const entries = JSON.parse(localStorage.getItem('maslife_audit_fallback')!);
    expect(entries).toHaveLength(3);
  });

  it('aplica el límite de 100 entradas (FIFO — elimina las más antiguas)', () => {
    const existing = Array.from({ length: 100 }, (_, i) => ({
      action: `ACTION_${i}`, synced: false, timestamp: new Date().toISOString(),
    }));
    localStorage.setItem('maslife_audit_fallback', JSON.stringify(existing));

    auditService._saveToLocalFallback({ action: 'SOAP_CREATE' });

    const entries = JSON.parse(localStorage.getItem('maslife_audit_fallback')!);
    expect(entries).toHaveLength(100);
    // La más nueva debe estar al final
    expect(entries[99]).toMatchObject({ action: 'SOAP_CREATE' });
    // La más antigua (ACTION_0) fue eliminada
    expect(entries[0].action).toBe('ACTION_1');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// auditService.syncFallback
// ═════════════════════════════════════════════════════════════════════════════
describe('auditService.syncFallback', () => {
  it('no llama a Supabase si no hay entradas en localStorage', async () => {
    await auditService.syncFallback();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('no llama a Supabase si todas las entradas ya están sincronizadas', async () => {
    const alreadySynced = [
      { action: 'SOAP_VIEW', synced: true, timestamp: new Date().toISOString() },
      { action: 'SOAP_SIGN', synced: true, timestamp: new Date().toISOString() },
    ];
    localStorage.setItem('maslife_audit_fallback', JSON.stringify(alreadySynced));

    await auditService.syncFallback();

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('sincroniza las entradas pendientes y las marca como synced: true', async () => {
    const pending = [
      { userId: 'u1', action: 'SOAP_VIEW', synced: false, timestamp: new Date().toISOString() },
      { userId: 'u1', action: 'SOAP_SIGN', synced: false, timestamp: new Date().toISOString() },
    ];
    localStorage.setItem('maslife_audit_fallback', JSON.stringify(pending));

    vi.mocked(supabase.from)
      .mockReturnValueOnce(makeBuilder({ error: null }))
      .mockReturnValueOnce(makeBuilder({ error: null }));

    await auditService.syncFallback();

    expect(supabase.from).toHaveBeenCalledTimes(2);
    const saved = JSON.parse(localStorage.getItem('maslife_audit_fallback')!);
    expect(saved[0].synced).toBe(true);
    expect(saved[1].synced).toBe(true);
  });

  it('mantiene synced: false si Supabase falla durante la sincronización', async () => {
    const pending = [
      { userId: 'u1', action: 'SOAP_VIEW', synced: false, timestamp: new Date().toISOString() },
    ];
    localStorage.setItem('maslife_audit_fallback', JSON.stringify(pending));

    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: { message: 'DB error' } }));

    await auditService.syncFallback();

    const saved = JSON.parse(localStorage.getItem('maslife_audit_fallback')!);
    expect(saved[0].synced).toBe(false);
  });

  it('sincroniza solo las entradas pendientes, sin tocar las ya sincronizadas', async () => {
    const mixed = [
      { userId: 'u1', action: 'SOAP_VIEW', synced: true, timestamp: new Date().toISOString() },
      { userId: 'u1', action: 'SOAP_SIGN', synced: false, timestamp: new Date().toISOString() },
    ];
    localStorage.setItem('maslife_audit_fallback', JSON.stringify(mixed));

    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: null }));

    await auditService.syncFallback();

    // Solo se sincronizó 1 entrada (la pendiente)
    expect(supabase.from).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(localStorage.getItem('maslife_audit_fallback')!);
    expect(saved[0].synced).toBe(true); // ya estaba synced
    expect(saved[1].synced).toBe(true); // ahora también
  });
});
