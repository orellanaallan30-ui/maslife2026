import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useClinic } from '../ClinicContext';

interface SidebarProps {
  onLogout?: () => void;
  onToggleAI?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout, onToggleAI }) => {
  const navigate = useNavigate();
  const { loggedPro } = useClinic();
  const isAdmin = loggedPro?.email === import.meta.env.VITE_ADMIN_EMAIL;

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
      <aside className="hidden md:flex w-20 lg:w-64 h-full overflow-hidden bg-white border-r border-slate-100 flex-col shrink-0 transition-all">
        {/* Logo */}
        <div className="px-4 lg:px-6 pt-5 pb-3 border-b border-slate-100 flex items-center justify-center lg:justify-start">
          <img
            src="/logo-agenda-online.svg"
            alt="Agenda Online"
            className="h-10 w-auto object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
          />
          <span className="hidden text-lg font-extrabold tracking-tight text-slate-900">Agenda</span>
        </div>

        <nav className="flex-1 p-3 lg:p-4 space-y-1">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-4 rounded-2xl transition-all ${isActive
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

          {/* Asistente IA */}
          <button
            onClick={onToggleAI}
            className="flex items-center gap-3 px-4 py-4 rounded-2xl transition-all w-full hover:bg-primary/5 group"
          >
            <span className="material-icons-round text-2xl text-primary flex-shrink-0 group-hover:scale-110 transition-transform">
              smart_toy
            </span>
            <span className="font-semibold text-base text-slate-800 hidden lg:inline">Asistente IA</span>
          </button>

          {/* Admin — solo si el email coincide con VITE_ADMIN_EMAIL */}
          {isAdmin && (
            <button
              onClick={() => navigate('/admin/management')}
              className="flex items-center gap-3 px-4 py-4 rounded-2xl transition-all w-full hover:bg-primary/5 group"
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
            <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2">Soporte Médico</p>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">¿Necesitas ayuda técnica?</p>
            <button
              onClick={() => window.open('https://wa.me/56965329974?text=Hola,%20necesito%20soporte%20t%C3%A9cnico%20con%20la%20plataforma%20Maslife', '_blank')}
              className="mt-3 w-full py-3 bg-primary text-white rounded-xl text-[10px] font-bold shadow-lg shadow-primary/20 uppercase tracking-wider transition-all hover:scale-105 active:scale-95"
            >
              Chat Soporte
            </button>
          </div>

          <button
            onClick={(e) => { e.preventDefault(); if (onLogout) onLogout(); }}
            className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all font-semibold text-sm group"
          >
            <span className="material-icons-round text-xl group-hover:translate-x-1 transition-transform">logout</span>
            <span className="hidden lg:inline">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile Bottom Nav ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex items-center justify-around px-1 z-[100] shadow-[0_-4px_24px_rgba(0,0,0,0.08)]"
        style={{ height: 68, paddingBottom: 'env(safe-area-inset-bottom, 6px)' }}
      >
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full transition-all ${isActive ? 'text-primary' : 'text-slate-400'}`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`material-icons-round text-[22px] ${isActive ? 'text-primary' : 'text-slate-400'}`}>
                  {item.icon}
                </span>
                <span className="text-[9px] font-bold mt-0.5 leading-none">{item.label}</span>
                {isActive && <div className="mt-0.5 w-1 h-1 rounded-full bg-primary" />}
              </>
            )}
          </NavLink>
        ))}

        {/* IA */}
        <button
          onClick={onToggleAI}
          className="flex flex-col items-center justify-center flex-1 h-full text-primary"
        >
          <span className="material-icons-round text-[22px]">smart_toy</span>
          <span className="text-[9px] font-bold mt-0.5 leading-none">IA</span>
          <div className="mt-0.5 w-1 h-1 rounded-full bg-primary animate-pulse" />
        </button>

        {/* Admin */}
        {isAdmin && (
          <button
            onClick={() => navigate('/admin/management')}
            className="flex flex-col items-center justify-center flex-1 h-full gap-0.5"
          >
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-sm">
              <span className="material-icons-round text-white text-xs">person</span>
            </div>
            <span className="text-[9px] font-bold text-primary leading-none">Admin</span>
          </button>
        )}
      </nav>
    </>
  );
};

export default React.memo(Sidebar);
