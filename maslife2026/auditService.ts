// auditService.ts — Trazabilidad clínica conforme Ley 20.584
import { supabase } from './supabaseClient';
import { AuditAction } from './types_clinical';

/**
 * Obtiene la IP del cliente vía un servicio público.
 * En producción, la IP real viene del header X-Forwarded-For en el backend.
 * Aquí usamos un fallback de browser para el lado cliente.
 */
// Caché de IP a nivel de módulo: evita golpear ipify en cada evento auditado
// (p. ej. auto-save clínico). Se resuelve una vez por sesión de página.
let cachedIP: string | null = null;
async function getClientIP(): Promise<string> {
  if (cachedIP) return cachedIP;
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    cachedIP = data.ip || 'UNKNOWN';
    return cachedIP;
  } catch {
    return 'UNKNOWN';
  }
}

export const auditService = {
  /**
   * Registra una acción en la tabla audit_logs.
   * Esta función es fire-and-forget: los errores no deben
   * bloquear la acción principal del usuario.
   */
  async log({
    userId,
    userName,
    action,
    resourceId,
    resourceType,
    details,
  }: {
    userId: string;
    userName: string;
    action: AuditAction;
    resourceId: string;
    resourceType: 'soap' | 'patient' | 'consent' | 'document';
    details?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const ip = await getClientIP();
      const userAgent = navigator.userAgent;

      const { error } = await supabase.from('audit_logs').insert({
        user_id: userId,
        user_name: userName,
        action,
        resource_id: resourceId,
        resource_type: resourceType,
        timestamp: new Date().toISOString(),
        ip_address: ip,
        user_agent: userAgent,
        details: details || null,
      });

      if (error) {
        // Log local como fallback — nunca falla silenciosamente
        console.error('[AuditService] Error guardando log:', error.message);
        this._saveToLocalFallback({ userId, userName, action, resourceId, resourceType, ip });
      }
    } catch (err) {
      console.error('[AuditService] Excepción:', err);
    }
  },

  /** Fallback: guarda en localStorage si Supabase falla */
  _saveToLocalFallback(entry: object): void {
    const key = 'maslife_audit_fallback';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push({ ...entry, timestamp: new Date().toISOString(), synced: false });
    localStorage.setItem(key, JSON.stringify(existing.slice(-100))); // máx 100 entradas
  },

  /** Sincroniza el fallback local con Supabase (llamar al login) */
  async syncFallback(): Promise<void> {
    const key = 'maslife_audit_fallback';
    const pending = JSON.parse(localStorage.getItem(key) || '[]');
    const unsynced = pending.filter((e: { synced: boolean }) => !e.synced);
    if (unsynced.length === 0) return;

    for (const entry of unsynced) {
      await supabase.from('audit_logs').insert(entry).then(({ error }) => {
        if (!error) entry.synced = true;
      });
    }
    localStorage.setItem(key, JSON.stringify(pending));
  },
};
