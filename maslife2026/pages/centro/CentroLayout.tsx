// Marco del panel del centro (AgendaMas): cabecera con pestañas y control de acceso.
// Solo entra quien tiene membresía activa como administrador o recepción.
// Con `demo` muestra el centro de ejemplo público (/demo), sin sesión.

import React, { useEffect } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useCenter } from '../../CenterContext';
import { useClinic } from '../../ClinicContext';
import { supabase } from '../../supabaseClient';
import { PRODUCT_NAME } from '../../brand';
import { AuroraBackground, AgendaMasLogo } from '../../components/centro/Aurora';

const TABS = [
  { to: 'recepcion', label: 'Recepción', icon: 'event_available' },
  { to: 'caja', label: 'Caja', icon: 'point_of_sale' },
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
    // index.html ya trae una etiqueta robots ("index, follow"): se cambia esa misma y se repone al salir.
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const creada = !meta;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'robots'; document.head.appendChild(meta); }
    const anterior = meta.content;
    meta.content = 'noindex, nofollow';
    return () => { document.title = titulo; if (creada) meta!.remove(); else meta!.content = anterior; };
  }, [demo]);

  if (memberships === null) {
    return (
      <div className="am-root flex-1 flex items-center justify-center">
        <AuroraBackground />
        <span className="material-icons-round animate-spin text-am-600 text-4xl">sync</span>
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

  const rol = demo ? 'Demo' : active.role === 'admin' ? 'Administración' : 'Recepción';

  return (
    <div className="am-root flex-1 min-h-0 flex flex-col w-full">
      <AuroraBackground />
      {demo && (
        <div role="note" className="shrink-0 bg-amber-100/90 border-b border-amber-200 text-amber-900 text-xs lg:text-sm font-bold px-4 lg:px-8 py-2 text-center">
          Estás viendo una demo con datos de ejemplo. Puedes agendar, cobrar y asignar boxes: nada se guarda.
        </div>
      )}
      <header className="shrink-0 px-3 lg:px-6 pt-3 lg:pt-4">
        <div className="am-glass rounded-[22px] px-3 lg:px-5">
          <div className="flex items-center gap-3 h-14">
            <AgendaMasLogo className="shrink-0" />
            <span className="hidden lg:block w-px h-6 bg-am-ink/10" />
            <div className="min-w-0 flex items-center gap-2">
              {!demo && gestionables.length > 1 ? (
                <select
                  value={active.center.id}
                  onChange={e => selectCenter(e.target.value)}
                  aria-label="Centro"
                  className="text-sm font-bold text-am-ink bg-white/60 border border-am-ink/10 rounded-lg py-1 pl-2 pr-7 max-w-[40vw]"
                >
                  {gestionables.map(m => <option key={m.center.id} value={m.center.id}>{m.center.name}</option>)}
                </select>
              ) : (
                <span className="text-sm font-bold text-am-ink truncate hidden sm:inline">{active.center.name}</span>
              )}
              <span className="hidden lg:inline text-[11px] font-black uppercase tracking-wider text-am-700 bg-am-50 border border-am-100 rounded-full px-2.5 py-1">{rol}</span>
            </div>
            <div className="flex-1" />
            {demo ? (
              <button onClick={() => navigate('/pro/register')} className="am-btn-primary text-sm font-bold rounded-xl px-3 lg:px-4 py-2 whitespace-nowrap">
                Crear mi cuenta
              </button>
            ) : (
              <>
                {loggedPro && (
                  <button onClick={() => navigate('/pro/dashboard')} className="hidden sm:inline-flex text-sm font-bold text-am-muted hover:text-am-700 px-2 py-1.5 rounded-lg">
                    Mi panel
                  </button>
                )}
                <button onClick={salir} className="text-sm font-bold text-am-muted hover:text-rose-600 px-2 py-1.5 rounded-lg flex items-center gap-1">
                  <span className="material-icons-round text-base">logout</span>
                  <span className="hidden lg:inline">Salir</span>
                </button>
              </>
            )}
          </div>
          <nav className="flex gap-1 pb-2.5 overflow-x-auto -mx-1 px-1" aria-label="Secciones del centro">
            {TABS.map(t => (
              <NavLink
                key={t.to}
                to={`${base}/${t.to}`}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition ${
                    isActive ? 'bg-am-ink text-white shadow-[0_8px_20px_-10px_rgba(15,23,42,0.6)]' : 'text-am-muted hover:text-am-ink hover:bg-white/70'}`}
              >
                <span className="material-icons-round text-[18px]">{t.icon}</span>
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default CentroLayout;
