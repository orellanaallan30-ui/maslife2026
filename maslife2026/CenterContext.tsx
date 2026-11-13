// Sesión de centro (AgendaMas): a qué centros pertenece quien inició sesión y con
// qué rol. Vive aparte de ClinicContext para no tocar el flujo del profesional:
// quien no pertenece a un centro no nota ningún cambio.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { centerApi, type Membership } from './centerService';

interface CenterContextType {
  /** null = aún no se sabe (cargando); [] = no pertenece a ningún centro. */
  memberships: Membership[] | null;
  /** Centro en uso: la membresía activa elegida (admin o recepción primero). */
  active: Membership | null;
  /** Invitaciones pendientes de aceptar (profesional). */
  invites: Membership[];
  /** true si puede abrir el panel del centro (admin o recepción con membresía activa). */
  puedeGestionar: boolean;
  selectCenter: (centerId: string) => void;
  reload: () => Promise<Membership[]>;
}

const Ctx = createContext<CenterContextType | undefined>(undefined);
const CLAVE = 'agendamas_center';

export const CenterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [selected, setSelected] = useState<string | null>(() => localStorage.getItem(CLAVE));

  const reload = useCallback(async (): Promise<Membership[]> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setMemberships([]); return []; }
    try {
      const { memberships: m } = await centerApi.me();
      setMemberships(m);
      return m;
    } catch (err) {
      // Sin centros no se rompe nada: el panel del profesional sigue igual.
      console.error('[centro] no se pudieron cargar tus centros:', (err as Error)?.message);
      setMemberships(prev => prev ?? []);
      return [];
    }
  }, []);

  useEffect(() => {
    reload();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') { setMemberships([]); }
      else if (event === 'SIGNED_IN') { reload(); }
    });
    return () => subscription.unsubscribe();
  }, [reload]);

  const value = useMemo<CenterContextType>(() => {
    const activas = (memberships || []).filter(m => m.status === 'active');
    const gestion = activas.filter(m => m.role === 'admin' || m.role === 'recepcion');
    const active = gestion.find(m => m.center.id === selected) || gestion[0] || activas.find(m => m.center.id === selected) || activas[0] || null;
    return {
      memberships,
      active,
      invites: (memberships || []).filter(m => m.status === 'invited'),
      puedeGestionar: !!active && (active.role === 'admin' || active.role === 'recepcion'),
      selectCenter: (id: string) => { localStorage.setItem(CLAVE, id); setSelected(id); },
      reload,
    };
  }, [memberships, selected, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useCenter(): CenterContextType {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCenter debe usarse dentro de CenterProvider');
  return c;
}
