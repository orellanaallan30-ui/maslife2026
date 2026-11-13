import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useClinic } from '../ClinicContext';
import { useCenter } from '../CenterContext';

interface SidebarProps {
  onLogout?: () => void;
  onToggleAI?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout, onToggleAI }) => {
  const navigate = useNavigate();
  const { loggedPro, isAdmin } = useClinic();
  const { puedeGestionar } = useCenter();
  const [mas, setMas] = useState(false);

  const menuItems = [
    { icon: 'home',           label: 'Inicio',    path: '/pro/dashboard' },
    { icon: 'calendar_month', label: 'Agenda',    path: '/pro/agenda' },
    { icon: 'group',          label: 'Pacientes', path: '/pro/patients' },
    { icon: 'bar_chart',      label: 'Finanzas',  path: '/pro/finances' },
    { icon: 'settings',       label: 'Ajustes',   path: '/pro/settings' },
  ];

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex w-20 lg:w-56 h-full overflow-hidden bg-white border-r border-slate-100 flex-col shrink-0 transition-all">
        {/* Logo */}
        <div className="px-4 lg:px-6 pt-5 pb-3 border-b border-slate-100 flex items-center justify-center lg:justify-start">
          <img
            src="/logo-agenda-online.svg"
            alt="AgendaMas"
            className="h-10 w-auto object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
          />
          <span className="hidden text-lg font-extrabold tracking-tight text-slate-900">AgendaMas</span>
        </div>

        <nav className="flex-1 p-3 lg:p-4 space-y-1">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${isActive
                  ? 'bg-primary shadow-lg shadow-primary/20'
                  : 'hover:bg-primary/5'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`material-icons-round text-2xl flex-shrink-0 ${isActive ? 'text-white' : 'text-primary'}`}>
                    {item.icon}
                  </span>
                  <span className={`font-semibold text-base hidden lg:inline ${isActive ? 'text-white' : 'text-slate-800'}`}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}

          {/* Invita y Gana — solo desktop */}
          <NavLink
            to="/pro/referral"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${isActive
                ? 'bg-primary shadow-lg shadow-primary/20'
                : 'hover:bg-primary/5'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`material-icons-round text-2xl flex-shrink-0 ${isActive ? 'text-white' : 'text-primary'}`}>
                  card_giftcard
                </span>
                <span className={`font-semibold text-base hidden lg:inline ${isActive ? 'text-white' : 'text-slate-800'}`}>
                  Invita y Gana
                </span>
              </>
            )}
          </NavLink>

          {/* Asistente IA */}
          <button
            onClick={onToggleAI}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all w-full hover:bg-primary/5 group"
          >
            <span className="material-icons-round text-2xl text-primary flex-shrink-0 group-hover:scale-110 transition-transform">
              smart_toy
            </span>
            <span className="font-semibold text-base text-slate-800 hidden lg:inline">Asistente IA</span>
          </button>

          {/* Panel del centro (AgendaMas). Sin centro, lleva al bloque de Ajustes para crearlo. */}
          {(
            <button
              onClick={() => navigate(puedeGestionar ? '/centro/recepcion' : '/pro/settings?seccion=centro')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all w-full hover:bg-primary/5 group"
            >
              <span className="material-icons-round text-2xl text-primary flex-shrink-0 group-hover:scale-110 transition-transform">
                meeting_room
              </span>
              <span className="font-semibold text-base text-slate-800 hidden lg:inline">Mi centro</span>
            </button>
          )}

          {/* Admin — solo si el email coincide con VITE_ADMIN_EMAIL */}
          {isAdmin && (
            <button
              onClick={() => navigate('/admin/management')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all w-full hover:bg-primary/5 group"
            >
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 shadow-md shadow-primary/30 group-hover:scale-105 transition-transform">
                <span className="material-icons-round text-white text-base">person</span>
              </div>
              <span className="font-semibold text-base text-slate-800 hidden lg:inline">Admin</span>
            </button>
          )}
        </nav>

        <div className="p-3 lg:p-4 mt-auto space-y-3">
          <div className="bg-primary/5 rounded-2xl p-4 hidden lg:block border border-primary/10">
            <p className="text-[11px] font-bold text-primary uppercase tracking-wider mb-2">Soporte Médico</p>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">¿Necesitas ayuda técnica?</p>
            <button
              onClick={() => window.open('https://wa.me/56965329974?text=Hola,%20necesito%20soporte%20t%C3%A9cnico%20con%20la%20plataforma%20AgendaMas', '_blank')}
              className="mt-3 w-full py-3 bg-primary text-white rounded-xl text-[11px] font-bold shadow-lg shadow-primary/20 uppercase tracking-wider transition-all hover:scale-105 active:scale-95"
            >
              Chat Soporte
            </button>
          </div>

          <button
            onClick={(e) => { e.preventDefault(); if (onLogout) onLogout(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all font-semibold text-sm group"
          >
            <span className="material-icons-round text-xl group-hover:translate-x-1 transition-transform">logout</span>
            <span className="hidden lg:inline">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile Bottom Nav ──
          Cuatro accesos principales y "Más". Antes eran 7 botones en 390 px,
          con textos de 10-11 px apretados. */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex items-center justify-around px-1 z-[100] shadow-[0_-4px_24px_rgba(0,0,0,0.08)]"
        style={{ height: 68, paddingBottom: 'env(safe-area-inset-bottom, 6px)' }}
      >
        {menuItems.filter(i => i.path !== '/pro/settings').map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => setMas(false)}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full transition-all ${isActive ? 'text-primary' : 'text-slate-500'}`
            }
          >
            {({ isActive }) => (
              <>
                <span className="material-icons-round text-[24px]">{item.icon}</span>
                <span className="text-xs font-bold mt-0.5 leading-none">{item.label}</span>
                {isActive && <div className="mt-1 w-1 h-1 rounded-full bg-primary" />}
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMas(v => !v)}
          aria-expanded={mas}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-all ${mas ? 'text-primary' : 'text-slate-500'}`}
        >
          <span className="material-icons-round text-[24px]">{mas ? 'close' : 'menu'}</span>
          <span className="text-xs font-bold mt-0.5 leading-none">Más</span>
        </button>
      </nav>

      {/* Hoja "Más" (celular) */}
      {mas && (
        <>
          <div className="md:hidden fixed inset-0 bg-slate-900/40 z-[98]" onClick={() => setMas(false)} />
          <div
            className="md:hidden fixed left-0 right-0 z-[99] bg-white rounded-t-3xl shadow-2xl p-3 grid grid-cols-1 gap-1"
            style={{ bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}
            role="menu"
          >
            {[
              { icon: 'smart_toy', label: 'Asistente IA', onClick: () => onToggleAI?.() },
              { icon: 'settings', label: 'Ajustes', onClick: () => navigate('/pro/settings') },
              { icon: 'meeting_room', label: 'Mi centro', onClick: () => navigate(puedeGestionar ? '/centro/recepcion' : '/pro/settings?seccion=centro') },
              { icon: 'card_giftcard', label: 'Invita y gana', onClick: () => navigate('/pro/referral') },
              ...(isAdmin ? [{ icon: 'admin_panel_settings', label: 'Admin', onClick: () => navigate('/admin/management') }] : []),
              { icon: 'support_agent', label: 'Soporte por WhatsApp', onClick: () => window.open('https://wa.me/56965329974?text=Hola,%20necesito%20soporte%20t%C3%A9cnico%20con%20AgendaMas', '_blank') },
              { icon: 'logout', label: 'Cerrar sesión', onClick: () => onLogout?.() },
            ].map(it => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                onClick={() => { setMas(false); it.onClick(); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-left text-sm font-bold hover:bg-slate-50 ${it.icon === 'logout' ? 'text-rose-500' : 'text-slate-800'}`}
              >
                <span className={`material-icons-round text-xl ${it.icon === 'logout' ? 'text-rose-500' : 'text-primary'}`}>{it.icon}</span>
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
};

export default React.memo(Sidebar);
