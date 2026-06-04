
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClinic } from '../ClinicContext';

const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const { setIsAdmin } = useClinic();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  React.useEffect(() => {
    const saved = localStorage.getItem('maslife_admin_saved');
    if (saved) {
      try {
        const { u } = JSON.parse(saved);
        if (u) { setUsername(u); setRememberMe(true); }
        // La contraseña nunca se restaura automáticamente
      } catch { /* ignorar datos corruptos */ }
    }
  }, []);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);

    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = await res.json();

      if (!res.ok || !data.token) {
        setError(true);
        setTimeout(() => setError(false), 3000);
        return;
      }

      // Guardar token en sessionStorage (se borra al cerrar la pestaña, más seguro que localStorage)
      sessionStorage.setItem('maslife_admin_token', data.token);
      setIsAdmin(true);
      if (rememberMe) {
        // Solo guardar usuario (nunca la contraseña)
        localStorage.setItem('maslife_admin_saved', JSON.stringify({ u: username }));
      } else {
        localStorage.removeItem('maslife_admin_saved');
      }
      navigate('/admin/management');
    } catch {
      setError(true);
      setTimeout(() => setError(false), 3000);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Grid de fondo tecnológico */}
      <div className="absolute inset-0 opacity-10 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #135bec 1px, transparent 0)', backgroundSize: '40px 40px' }}>
      </div>
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-primary/20 rounded-full blur-[120px]"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10 animate-in fade-in slide-in-from-top-6 duration-700">
          <div className="bg-slate-900 border border-white/10 w-20 h-20 rounded-[2rem] flex items-center justify-center shadow-2xl mx-auto mb-6">
            <span className="material-icons-round text-primary text-4xl">admin_panel_settings</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Core Administration</h1>
          <p className="text-slate-500 font-bold mt-2 uppercase text-xs tracking-[0.3em]">AgendaMaslife Central Control</p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-2xl p-8 md:p-12 rounded-[3rem] shadow-[0_48px_80px_-16px_rgba(0,0,0,0.5)] border border-white/10 relative">
          <form onSubmit={handleAdminLogin} className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Correo Administrador</label>
              <div className="relative">
                <span className="material-icons-round absolute left-5 top-1/2 -translate-y-1/2 text-slate-600">account_circle</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-4 md:py-5 pl-14 pr-5 font-bold text-sm text-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-slate-700 shadow-inner"
                  placeholder="correo@dominio.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Clave de Acceso</label>
              <div className="relative">
                <span className="material-icons-round absolute left-5 top-1/2 -translate-y-1/2 text-slate-600">vpn_key</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-4 md:py-5 pl-14 pr-5 font-bold text-sm text-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-slate-700 shadow-inner"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-2 px-1">
              <input
                type="checkbox"
                id="rememberAdmin"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-white/10 bg-slate-950/50 text-primary focus:ring-primary/20 transition-all cursor-pointer accent-primary"
              />
              <label htmlFor="rememberAdmin" className="text-xs font-bold text-slate-400 cursor-pointer select-none">
                Mantener sesión y credenciales
              </label>
            </div>

            {error && (
              <div className="p-5 bg-rose-500/10 border border-rose-500/20 rounded-2xl animate-in shake duration-300 shadow-inner">
                <p className="text-xs font-black text-rose-500 uppercase tracking-widest text-center">Acceso Denegado: Credenciales Incorrectas</p>
              </div>
            )}

            <button
              type="submit"
              className="group w-full py-5 md:py-6 bg-primary text-white rounded-2xl font-black text-xs md:text-sm uppercase tracking-[0.2em] shadow-[0_10px_30px_-10px_rgba(19,91,236,0.6)] border-b-4 border-blue-700 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-3 mt-4"
            >
              Autenticar Sistema
              <span className="material-icons-round text-lg group-hover:scale-110 transition-transform">security</span>
            </button>
          </form>
        </div>

        <button
          onClick={() => navigate('/')}
          className="mt-8 w-full py-4 text-xs font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors flex items-center justify-center gap-2"
        >
          <span className="material-icons-round text-sm">arrow_back</span>
          Volver al Portal Público
        </button>
      </div>
    </div>
  );
};

export default AdminLogin;
