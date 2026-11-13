// Marco del panel del centro (AgendaMas): cabecera con pestañas y control de acceso.
// Solo entra quien tiene membresía activa como administrador o recepción.
// Con `demo` muestra el centro de ejemplo público (/demo), sin sesión.

import React, { useEffect } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useCenter } from '../../CenterContext';
import { useClinic } from '../../ClinicContext';
import { supabase } from '../../supabaseClient';
import { PRODUCT_NAME } from '../../brand';

const TABS = [
  { to: 'recepcion', label: 'Recepción', icon: 'event_available' },
  { to: 'boxes', label: 'Boxes', icon: 'meeting_room' },
  { to: 'reporte', label: 'Reporte', icon: 'bar_chart' },
  { to: 'equipo', label: 'Equipo', icon: 'groups' },
];

const CentroLayout: React.FC<{ demo?: boolean }> = ({ demo = false }) => {
  const { memberships, active, puedeGestionar, selectCenter } = useCenter();
  const { loggedPro, logout } = useClinic();
  const navigate = useNavigate();
  const base = demo ? '/demo' : '/centro';

  // La demo no debe aparecer en buscadores.
  useEffect(() => {
    if (!demo) return;
    const titulo = document.title;
    document.title = `Demo ${PRODUCT_NAME}: recepción, boxes y reporte de horas`;
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => { document.title = titulo; meta.remove(); };
  }, [demo]);

  if (memberships === null) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <span className="material-icons-round animate-spin text-primary text-4xl">sync</span>
      </div>
    );
  }
  // Sin centro: al bloque "Crear mi centro" de Ajustes (o al ingreso si no hay sesión).
  if (!puedeGestionar || !active) return <Navigate to={loggedPro ? '/pro/settings?seccion=centro' : '/pro/login'} replace />;

  const gestionables = memberships.filter(m => m.status === 'active' && (m.role === 'admin' || m.role === 'recepcion'));
  const salir = () => {
    if (loggedPro) { logout(navigate, 'PROFESSIONAL'); return; }
    supabase.auth.signOut().catch(() => {});
    navigate('/pro/login');
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full bg-slate-50">
      {demo && (
        <div className="shrink-0 bg-slate-900 text-white text-xs lg:text-sm font-semibold px-4 lg:px-8 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
          <span>Estás viendo una demo con datos de ejemplo. Puedes agendar, reagendar y asignar boxes: nada se guarda.</span>
        </div>
      )}
      <header className="shrink-0 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3 px-4 lg:px-8 h-14">
          <span className="font-black text-lg tracking-tight text-slate-900">{PRODUCT_NAME}</span>
          <span className="text-slate-300">·</span>
          {!demo && gestionables.length > 1 ? (
            <select
              value={active.center.id}
              onChange={e => selectCenter(e.target.value)}
              aria-label="Centro"
              className="text-sm font-bold text-slate-700 bg-transparent border border-slate-200 rounded-lg py-1 pl-2 pr-7 max-w-[45vw]"
            >
              {gestionables.map(m => <option key={m.center.id} value={m.center.id}>{m.center.name}</option>)}
            </select>
          ) : (
            <span className="text-sm font-bold text-slate-700 truncate">{active.center.name}</span>
          )}
          <span className="hidden lg:inline text-[11px] font-bold uppercase tracking-wider text-primary bg-primary/10 rounded-full px-2.5 py-1">
            {demo ? 'Demo' : active.role === 'admin' ? 'Administración' : 'Recepción'}
          </span>
          <div className="flex-1" />
          {demo ? (
            <button onClick={() => navigate('/pro/register')} className="text-sm font-bold text-white bg-primary rounded-xl px-3 py-2 hover:brightness-95 whitespace-nowrap">
              Crear mi cuenta
            </button>
          ) : (
            <>
              {loggedPro && (
                <button onClick={() => navigate('/pro/dashboard')} className="text-sm font-bold text-slate-600 hover:text-primary px-2 py-1.5 rounded-lg">
                  Mi panel
                </button>
              )}
              <button onClick={salir} className="text-sm font-bold text-slate-600 hover:text-rose-600 px-2 py-1.5 rounded-lg flex items-center gap-1">
                <span className="material-icons-round text-base">logout</span>
                <span className="hidden lg:inline">Salir</span>
              </button>
            </>
          )}
        </div>
        <nav className="flex gap-1 px-2 lg:px-6 overflow-x-auto" aria-label="Secciones del centro">
          {TABS.map(t => (
            <NavLink
              key={t.to}
              to={`${base}/${t.to}`}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 lg:px-4 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
                  isActive ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              <span className="material-icons-round text-lg">{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default CentroLayout;
