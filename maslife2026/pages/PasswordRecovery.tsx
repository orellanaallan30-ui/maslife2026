import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { requestPasswordReset, updatePassword } from '../supabaseService';

// ================================================================
// PasswordRecovery — Solicitar link de recuperación por email
// ================================================================
export const PasswordRecovery: React.FC = () => {
  const [email, setEmail]     = useState('');
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Ingresa un email válido.'); return;
    }
    setLoading(true);
    try {
      const result = await requestPasswordReset(email.trim().toLowerCase());
      if (result.error) setError(result.error);
      else setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/pro/login"
            className="inline-flex items-center gap-2 text-teal-600 font-bold text-sm hover:text-teal-800 transition-colors mb-6">
            <span className="material-icons-round text-base">arrow_back</span>
            Volver al login
          </Link>
          <div className="w-16 h-16 bg-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/30">
            <span className="material-icons-round text-white text-3xl">lock_reset</span>
          </div>
          <h1 className="text-xl font-black text-slate-800">Recuperar acceso</h1>
          <p className="text-sm text-slate-500 mt-1">Te enviaremos un link para restablecer tu contraseña</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-8">
          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="material-icons-round text-emerald-600 text-3xl">mark_email_read</span>
              </div>
              <h3 className="font-black text-slate-800 text-lg mb-2">Email enviado</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                Si existe una cuenta con <strong className="text-slate-700">{email}</strong>,
                recibirás un link en los próximos minutos. Revisa también tu carpeta de spam.
              </p>
              <p className="text-xs text-slate-400 mb-4">El link expira en 1 hora</p>
              <Link to="/pro/login" className="text-teal-600 font-bold text-sm hover:text-teal-800">
                Volver al login →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5">
                  Email de tu cuenta
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  autoComplete="email"
                  disabled={loading}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-sm
                    font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white
                    transition-all placeholder:text-slate-400 disabled:opacity-50"
                />
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center gap-2">
                  <span className="material-icons-round text-rose-500 text-base">error</span>
                  <p className="text-sm text-rose-700 font-medium">{error}</p>
                </div>
              )}

              <button type="submit" disabled={loading || !email}
                className="w-full py-4 bg-teal-500 text-white rounded-2xl font-black text-sm
                  hover:bg-teal-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2
                  shadow-lg shadow-teal-500/25">
                {loading
                  ? <><span className="material-icons-round text-base animate-spin">sync</span>Enviando...</>
                  : <><span className="material-icons-round text-base">send</span>Enviar link de recuperación</>}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// ================================================================
// ResetPassword — Nueva contraseña desde el link del email
// ================================================================
export const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [show, setShow]         = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Verificar que hay sesión activa de recuperación antes de mostrar el formulario
  useEffect(() => {
    import('../supabaseClient').then(({ supabase }) => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setSessionReady(true);
        } else {
          // Sin sesión: esperar evento PASSWORD_RECOVERY (puede llegar ligeramente después)
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
            if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && s) {
              setSessionReady(true);
              subscription.unsubscribe();
            }
          });
          // Si en 3s no llega sesión, mostrar error
          setTimeout(() => setSessionReady(prev => {
            if (!prev) setError('El link expiró o ya fue usado. Solicita uno nuevo.');
            return true;
          }), 3000);
        }
      });
    });
  }, []);

  const checks = {
    length: password.length >= 8,
    upper:  /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    match:  password === confirm && confirm !== '',
  };
  const allOk = Object.values(checks).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allOk) { setError('Completa todos los requisitos.'); return; }
    setLoading(true);
    try {
      const result = await updatePassword(password);
      if (result.error) setError(result.error);
      else { setDone(true); setTimeout(() => navigate('/pro/login'), 3000); }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/30">
            <span className="material-icons-round text-white text-3xl">key</span>
          </div>
          <h1 className="text-xl font-black text-slate-800">Nueva contraseña</h1>
          <p className="text-sm text-slate-500 mt-1">Elige una contraseña segura para tu cuenta</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-8">
          {!sessionReady ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <span className="material-icons-round text-teal-500 text-4xl animate-spin">sync</span>
              <p className="text-sm text-slate-500 font-medium">Verificando enlace de recuperación...</p>
            </div>
          ) : done ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="material-icons-round text-emerald-600 text-3xl">task_alt</span>
              </div>
              <h3 className="font-black text-slate-800 text-lg mb-2">¡Contraseña actualizada!</h3>
              <p className="text-slate-500 text-sm">Redirigiendo al login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5">
                  Nueva contraseña
                </label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3.5 pr-12 text-sm
                      font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white transition-all"
                  />
                  <button type="button" onClick={() => setShow(s => !s)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-500">
                    <span className="material-icons-round text-xl">{show ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5">
                  Confirmar contraseña
                </label>
                <input
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  autoComplete="new-password"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-sm
                    font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white transition-all"
                />
              </div>

              {password && (
                <div className="bg-slate-50 rounded-2xl p-4 grid grid-cols-2 gap-2">
                  {[
                    { ok: checks.length, label: '8+ caracteres' },
                    { ok: checks.upper,  label: 'Mayúscula' },
                    { ok: checks.number, label: 'Número' },
                    { ok: checks.match,  label: 'Contraseñas iguales' },
                  ].map(c => (
                    <p key={c.label} className={`text-xs flex items-center gap-1.5 font-bold
                      ${c.ok ? 'text-emerald-600' : 'text-slate-400'}`}>
                      <span className="material-icons-round text-xs">
                        {c.ok ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      {c.label}
                    </p>
                  ))}
                </div>
              )}

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center gap-2">
                  <span className="material-icons-round text-rose-500 text-base">error</span>
                  <p className="text-sm text-rose-700">{error}</p>
                </div>
              )}

              <button type="submit" disabled={loading || !allOk}
                className="w-full py-4 bg-teal-500 text-white rounded-2xl font-black text-sm mt-1
                  hover:bg-teal-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2
                  shadow-lg shadow-teal-500/25">
                {loading
                  ? <><span className="material-icons-round text-base animate-spin">sync</span>Guardando...</>
                  : <><span className="material-icons-round text-base">lock_reset</span>Guardar nueva contraseña</>}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
