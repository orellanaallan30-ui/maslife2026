import React from 'react';
import { NavLink } from 'react-router-dom';

interface SidebarProps {
  onLogout?: () => void;
  onToggleAI?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout, onToggleAI }) => {
  const menuItems = [
    { icon: 'dashboard', label: 'Inicio', path: '/pro/dashboard' },
    { icon: 'calendar_today', label: 'Agenda', path: '/pro/agenda' },
    { icon: 'people', label: 'Pacientes', path: '/pro/patients' },
    { icon: 'bar_chart', label: 'Finanzas', path: '/pro/finances' },
    { icon: 'settings', label: 'Ajustes', path: '/pro/settings' },
  ];

  return (
    <>
      <aside className="hidden md:flex w-24 lg:w-72 bg-white border-r border-slate-200 flex-col shrink-0 transition-all">
        <nav className="flex-1 p-8 space-y-4">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-6 px-6 py-5 rounded-2xl transition-all ${isActive
                  ? 'bg-primary text-white shadow-2xl shadow-primary/20 scale-[1.02]'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-primary'
                }`
              }
            >
              <span className="material-icons-round text-2xl">{item.icon}</span>
              <span className="font-extrabold text-sm uppercase tracking-widest hidden lg:inline">{item.label}</span>
            </NavLink>
          ))}

          {/* AI Assistant Button */}
          <button
            onClick={onToggleAI}
            className="flex items-center gap-6 px-6 py-5 rounded-2xl transition-all w-full text-amber-600 hover:bg-amber-50 hover:text-amber-700 group"
          >
            <span className="material-icons-round text-2xl group-hover:scale-110 transition-transform">smart_toy</span>
            <span className="font-extrabold text-sm uppercase tracking-widest hidden lg:inline">Asistente IA</span>
          </button>
        </nav>
        <div className="p-8 mt-auto space-y-8">
          <div className="bg-teal-50/50 rounded-[2.5rem] p-8 hidden lg:block border border-teal-100/50">
            <p className="text-xs font-black text-primary uppercase tracking-widest mb-3">Soporte Médico</p>
            <p className="text-sm text-slate-600 leading-relaxed font-bold">¿Necesitas ayuda técnica con la red?</p>
            <button 
              onClick={() => window.open('https://wa.me/56965329974?text=Hola,%20necesito%20soporte%20t%C3%A9cnico%20con%20la%20plataforma%20Maslife', '_blank')}
              className="mt-6 w-full py-4 bg-primary text-white rounded-2xl text-xs font-black shadow-xl shadow-primary/20 uppercase tracking-[0.2em] transition-all hover:scale-105 active:scale-95"
            >
              Chat Soporte
            </button>
          </div>

          <button
            onClick={(e) => {
              e.preventDefault();
              if (onLogout) {
                onLogout();
              }
            }}
            className="w-full flex items-center gap-6 px-6 py-5 rounded-2xl text-rose-500 hover:bg-rose-50 transition-all font-black text-sm uppercase tracking-[0.2em] group"
          >
            <span className="material-icons-round text-2xl group-hover:translate-x-1 transition-transform">logout</span>
            <span className="hidden lg:inline">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center justify-around h-24 px-4 z-[100] shadow-[0_-8px_48px_rgba(0,0,0,0.12)]">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full h-full transition-all ${isActive ? 'text-primary scale-110' : 'text-slate-500 opacity-60'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="material-icons-round text-2xl">{item.icon}</span>
                <span className="text-xs font-black uppercase tracking-widest mt-2">{item.label}</span>
                <div className={`mt-2.5 w-1.5 h-1.5 rounded-full bg-primary transition-all ${isActive ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}></div>
              </>
            )}
          </NavLink>
        ))}
        {/* Mobile AI Button */}
        <button
          onClick={onToggleAI}
          className="flex flex-col items-center justify-center w-full h-full transition-all text-amber-500"
        >
          <span className="material-icons-round text-2xl">smart_toy</span>
          <span className="text-xs font-black uppercase tracking-widest mt-2">IA</span>
          <div className="mt-2.5 w-1.5 h-1.5 rounded-full bg-amber-500 scale-100 opacity-100 animate-pulse"></div>
        </button>
      </nav>
    </>
  );
};

export default React.memo(Sidebar);
