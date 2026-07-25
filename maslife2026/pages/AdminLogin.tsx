
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClinic } from '../ClinicContext';
import { supabase } from '../supabaseClient';

const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const { setIsAdmin } = useClinic();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [hasSsoSession, setHasSsoSession] = useState(false);
  const [ssoEmail, setSsoEmail] = useState('');
  const [autoChecking, setAutoChecking] = useState(true); // verificando sesión al entrar
  const [showPasswordForm, setShowPasswordForm] = useState(false); // fallback legacy

  useEffect(() => {
    const saved = localStorage.getItem('maslife_admin_saved');
    if (saved) {
      try {
        const { u } = JSON.parse(saved);
        if (u) { setUsername(u); setRememberMe(true); }
      } catch { /* ignorar datos corruptos */ }
    }
    // Si hay sesión de profesional, intentar entrar al admin AUTOMÁTICAMENTE
    // (sin pedir credenciales). El acceso lo controla el flag is_admin.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        setHasSsoSession(true);
        setSsoEmail(session.user.email);
        handleSSO(true); // auto: si no es admin, muestra 403 sin bloquear
      } else {
        setAutoChecking(false);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = await res.json();

      if (res.status === 500) {
        showError('El panel de admin no está configurado en el servidor. Verifica las variables ADMIN_EMAIL, ADMIN_PASSWORD y ADMIN_JWT_SECRET en Vercel.');
        return;
      }
      if (res.status === 429) {
        showError('Demasiados intentos. Espera 15 minutos.');
        return;
      }
      if (!res.ok || !data.token) {
        showError(data.error || 'Credenciales incorrectas');
        return;
      }

      sessionStorage.setItem('maslife_admin_token', data.token);
      setIsAdmin(true);
      if (rememberMe) {
        localStorage.setItem('maslife_admin_saved', JSON.stringify({ u: username }));
      } else {
        localStorage.removeItem('maslife_admin_saved');
      }
      navigate('/admin/management');
    } catch {
      showError('Error de red. Verifica tu conexión.');
    }
  };

  const handleSSO = async (isAuto = false) => {
    setSsoLoading(true);
    setErrorMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (!isAuto) showError('No hay sesión activa. Ingresa a tu panel de profesional primero y vuelve aquí.');
        setSsoLoading(false); setAutoChecking(false);
        return;
      }
      const res = await fetch('/api/admin-auth?action=sso', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) {
        // Sesión válida pero sin permisos: en modo auto, no molestar con error.
        if (!isAuto) showError(`Tu cuenta (${body.email || session.user?.email}) no tiene permisos de administrador.`);
        setSsoLoading(false); setAutoChecking(false);
        return;
      }
      if (!res.ok || !body.token) {
        if (!isAuto) showError(body.error || 'Error de autenticación');
        setSsoLoading(false); setAutoChecking(false);
        return;
      }
      sessionStorage.setItem('maslife_admin_token', body.token);
      setIsAdmin(true);
      navigate('/admin/management');
    } catch {
      if (!isAuto) showError('Error de red al conectar con el servidor.');
      setSsoLoading(false); setAutoChecking(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #135bec 1px, transparent 0)', backgroundSize: '40px 40px' }}>
      </div>
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-primary/20 rounded-full blur-[120px]"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10 animate-in fade-in slide-in-from-top-6 duration-700">
          <div className="bg-slate-900 border border-white/10 w-20 h-20 rounded-blob-md flex items-center justify-center shadow-2xl mx-auto mb-6">
            <span className="material-icons-round text-primary text-4xl">admin_panel_settings</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Core Administration</h1>
          <p className="text-slate-500 font-bold mt-2 uppercase text-xs tracking-[0.06em]">Agenda Maslife Central Control</p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-2xl p-8 rounded-blob-xl shadow-[0_48px_80px_-16px_rgba(0,0,0,0.5)] border border-white/10 relative space-y-6">

          {/* Verificando la sesión al entrar (acceso automático) */}
          {autoChecking && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <span className="material-icons-round text-teal-400 text-4xl animate-spin">sync</span>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Verificando acceso…</p>
            </div>
          )}

          {/* Con sesión pero acceso automático no completó (reintento manual) */}
          {!autoChecking && hasSsoSession && (
            <div className="bg-teal-500/10 border border-teal-500/20 rounded-2xl p-4">
              <p className="text-[11px] font-black text-teal-400 uppercase tracking-widest mb-1">Sesión detectada</p>
              <p className="text-xs text-slate-300 font-bold mb-3 truncate">{ssoEmail}</p>
              <button
                onClick={() => handleSSO()}
                disabled={ssoLoading}
                className="w-full py-3 bg-teal-500 hover:bg-teal-400 disabled:opacity-60 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                {ssoLoading
                  ? <><span className="material-icons-round text-sm animate-spin">sync</span> Conectando...</>
                  : <><span className="material-icons-round text-sm">bolt</span> Entrar con esta sesión</>
                }
              </button>
            </div>
          )}

          {/* Sin sesión: guiar a iniciar sesión de profesional */}
          {!autoChecking && !hasSsoSession && (
            <div className="text-center space-y-4">
              <p className="text-sm font-bold text-slate-300 leading-relaxed">
                Para entrar al panel de administración, inicia sesión con tu cuenta de profesional.
              </p>
              <button
                onClick={() => navigate('/pro/login')}
                className="w-full py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:brightness-110 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-icons-round text-sm">login</span> Iniciar sesión de profesional
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl animate-in shake duration-300">
              <p className="text-xs font-bold text-rose-400 leading-relaxed">{errorMsg}</p>
            </div>
          )}

          {/* Fallback legacy: login por contraseña (oculto) */}
          {!autoChecking && !showPasswordForm && (
            <button
              onClick={() => setShowPasswordForm(true)}
              className="w-full text-[11px] font-black text-slate-600 hover:text-slate-400 uppercase tracking-widest transition-colors"
            >
              Usar contraseña
            </button>
          )}

          {showPasswordForm && (
          <form onSubmit={handleAdminLogin} className="space-y-6">
            <div className="space-y-3">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Correo Administrador</label>
              <div className="relative">
                <span className="material-icons-round absolute left-5 top-1/2 -translate-y-1/2 text-slate-600">account_circle</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-4 pl-14 pr-5 font-bold text-sm text-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-slate-700 shadow-inner"
                  placeholder="correo@dominio.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Clave de Acceso</label>
              <div className="relative">
                <span className="material-icons-round absolute left-5 top-1/2 -translate-y-1/2 text-slate-600">vpn_key</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-4 pl-14 pr-5 font-bold text-sm text-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-slate-700 shadow-inner"
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
                Recordar correo
              </label>
            </div>

            <button
              type="submit"
              className="group w-full py-5 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-[0.05em] shadow-cta border-b-4 border-blue-700 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-3"
            >
              Autenticar Sistema
              <span className="material-icons-round text-lg group-hover:scale-110 transition-transform">security</span>
            </button>
          </form>
          )}
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
