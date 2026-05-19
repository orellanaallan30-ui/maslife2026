import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useClinic } from '../ClinicContext';
import { loginProfessional, checkRateLimit } from '../supabaseService';

// ── Countdown para rate limit ─────────────────────────────────
const RateCountdown: React.FC<{ ms: number; onExpire: () => void }> = ({ ms, onExpire }) => {
  const [left, setLeft] = useState(ms);
  useEffect(() => {
    const t = setInterval(() => {
      setLeft(p => {
        if (p <= 1000) { clearInterval(t); onExpire(); return 0; }
        return p - 1000;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [onExpire]);
  const min = Math.floor(left / 60000);
  const sec = Math.floor((left % 60000) / 1000);
  return (
    <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-6 text-center">
      <span className="material-icons-round text-rose-500 text-4xl block mb-3">lock_clock</span>
      <p className="font-black text-rose-700">Cuenta bloqueada temporalmente</p>
      <p className="text-rose-600 text-sm mt-1">Intenta de nuevo en</p>
      <p className="font-mono font-black text-rose-700 text-3xl mt-2">
        {String(min).padStart(2,'0')}:{String(sec).padStart(2,'0')}
      </p>
    </div>
  );
};

const ProfessionalLogin: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setLoggedPro } = useClinic();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [rl, setRl]             = useState(() => checkRateLimit());
  const [rememberMe, setRememberMe] = useState(false);
  const justRegistered = (location.state as any)?.registered === true;
  const stateEmail = (location.state as any)?.email as string | undefined;

  useEffect(() => {
    if (stateEmail) { setEmail(stateEmail); return; }
    const saved = localStorage.getItem('maslife_pro_saved');
    if (saved) {
      try {
        const { u } = JSON.parse(saved);
        if (u) { setEmail(u); setRememberMe(true); }
      } catch(e) {}
    }
  }, []);

  const blocked = rl.blocked && rl.remainingMs > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validaciones básicas en cliente
    if (!email.trim()) { setError('Ingresa tu email.'); return; }
    if (!password)     { setError('Ingresa tu contraseña.'); return; }

    setLoading(true);
    try {
      const result = await loginProfessional(
        email.trim().toLowerCase(),
        password
      );

      if ('error' in result && result.error) {
        setError(result.error);
        setRl(checkRateLimit());
      } else if ('pro' in result && result.pro) {
        // Solo guardamos el email, nunca la contraseña en localStorage
        if (rememberMe) {
          localStorage.setItem('maslife_pro_saved', JSON.stringify({ u: email }));
        } else {
          localStorage.removeItem('maslife_pro_saved');
        }
        setLoggedPro(result.pro);
        navigate(result.pro.needsPasswordReset ? '/pro/password-setup' : '/pro/dashboard');
      }
    } catch (err) {
      setError('Error inesperado. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 w-full bg-slate-50 flex items-center justify-center p-4 relative">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-teal-500/6 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-teal-500/4 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center cursor-pointer mb-2" onClick={() => navigate('/')}>
            <img
              src="/logo-agenda-online.svg"
              alt="Agenda Online - Clínica Mas Life"
              className="h-24 w-auto object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
              }}
            />
            <div className="hidden items-center gap-3">
              <div className="bg-teal-500 w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl shadow-teal-500/30">
                <span className="material-icons-round text-white text-3xl">medical_services</span>
              </div>
              <div className="text-left">
                <p className="text-xs font-black text-teal-600 uppercase tracking-widest leading-none">PLATAFORMA</p>
                <p className="text-2xl font-black text-slate-900 leading-tight">Mas Life 🧡</p>
              </div>
            </div>
          </div>
          <h1 className="text-xl font-black text-slate-800 mt-4">Acceso Profesional</h1>
          <p className="text-sm text-slate-500 mt-1">Ingresa a tu panel de gestión clínica</p>
        </div>

        {/* Banner registro exitoso */}
        {justRegistered && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
            <span className="material-icons-round text-emerald-500 text-xl shrink-0">check_circle</span>
            <p className="text-sm text-emerald-800 font-semibold">¡Cuenta creada! Ingresa con tu email y contraseña.</p>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-900/5 p-8">
          {blocked ? (
            <RateCountdown ms={rl.remainingMs} onExpire={() => setRl(checkRateLimit())} />
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
              {/* Email */}
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5">
                  Email profesional
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  autoComplete="username"
                  disabled={loading}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-sm
                    font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white
                    transition-all placeholder:text-slate-400 disabled:opacity-50"
                />
              </div>

              {/* Contraseña */}
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={loading}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3.5 pr-12 text-sm
                      font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white
                      transition-all placeholder:text-slate-400 disabled:opacity-50"
                  />
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-500 transition-colors">
                    <span className="material-icons-round text-xl">
                      {showPass ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Recordarme */}
              <div className="flex items-center gap-2 mt-1 px-1">
                <input
                  type="checkbox"
                  id="rememberPro"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-teal-500 focus:ring-teal-500 transition-all cursor-pointer accent-teal-500"
                />
                <label htmlFor="rememberPro" className="text-sm font-bold text-slate-500 cursor-pointer select-none">
                  Recordarme en este equipo
                </label>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <span className="material-icons-round text-rose-500 text-base shrink-0 mt-0.5">error</span>
                  <p className="text-sm text-rose-700 font-medium leading-snug">{error}</p>
                </div>
              )}

              {/* Botón */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-teal-500 text-white rounded-2xl font-black text-sm
                  hover:bg-teal-600 active:scale-[0.98] transition-all disabled:opacity-60
                  flex items-center justify-center gap-2 shadow-lg shadow-teal-500/25 mt-1"
              >
                {loading ? (
                  <><span className="material-icons-round text-base animate-spin">sync</span>Verificando...</>
                ) : (
                  <><span className="material-icons-round text-base">login</span>Ingresar al panel</>
                )}
              </button>

              {/* Links */}
              <div className="flex flex-col items-center gap-2 pt-1">
                <Link to="/pro/recover"
                  className="text-sm text-teal-600 hover:text-teal-800 font-bold transition-colors">
                  ¿Olvidaste tu contraseña?
                </Link>
                <p className="text-sm text-slate-500">
                  ¿No tienes cuenta?{' '}
                  <Link to="/pro/register" className="text-teal-600 font-bold hover:text-teal-800 transition-colors">
                    Regístrate aquí
                  </Link>
                </p>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          clinicamaslife.cl · Protegido contra accesos no autorizados
        </p>
      </div>
    </div>
  );
};

export default ProfessionalLogin;
