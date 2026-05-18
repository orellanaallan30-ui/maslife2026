import React, { useState, useEffect } from 'react';
import {
  HashRouter, Routes, Route, Navigate,
  useNavigate, useLocation, Outlet
} from 'react-router-dom';
import MainHome              from './pages/MainHome';
import PatientResults        from './pages/PatientResults';
import PatientProfile        from './pages/PatientProfile';
import ProfessionalDashboard from './pages/ProfessionalDashboard';
import ClinicalRecord        from './pages/ClinicalRecord';
import PatientList           from './pages/PatientList';
import ConsultationSession   from './pages/ConsultationSession';
import ProfessionalRegistration from './pages/ProfessionalRegistration';
import ProfessionalLogin     from './pages/ProfessionalLogin';
import AdminManagement       from './pages/AdminManagement';
import AdminLogin            from './pages/AdminLogin';
import Finances              from './pages/Finances';
import Settings              from './pages/Settings';
import ProfessionalAgenda    from './pages/ProfessionalAgenda';
import PasswordSetup         from './pages/PasswordSetup';
import DocumentVerifier      from './pages/DocumentVerifier';
import { ConsentAcceptPage } from './pages/ConsentAcceptPage';
import { PasswordRecovery, ResetPassword } from './pages/PasswordRecovery';
import Sidebar          from './components/Sidebar';
import GlobalAIPanel    from './components/GlobalAIPanel';
import ToastContainer   from './components/ToastContainer';
import { ClinicProvider, useClinic } from './ClinicContext';
import { AppView, Notification } from './types';
import logoClinica from './assets/logo-clinica.png';
import logoAgenda  from './assets/logo-agenda.png';

// ── Guards ────────────────────────────────────────────────────
const ProGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loggedPro } = useClinic();
  return loggedPro ? <>{children}</> : <Navigate to="/pro/login" replace />;
};

const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setIsAdmin } = useClinic();
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem('maslife_admin_token');
    if (!token) { setVerified(false); return; }

    fetch('/api/admin-verify', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.valid === true) {
          setIsAdmin(true);
          setVerified(true);
        } else {
          sessionStorage.removeItem('maslife_admin_token');
          setIsAdmin(false);
          setVerified(false);
        }
      })
      .catch(() => setVerified(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (verified === null) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950">
        <span className="material-icons-round animate-spin text-primary text-5xl">sync</span>
      </div>
    );
  }
  return verified ? <>{children}</> : <Navigate to="/admin/login" replace />;
};

// ── Layout profesional ────────────────────────────────────────
const ProLayout: React.FC = () => {
  const { logout } = useClinic();
  const navigate = useNavigate();
  const location = useLocation();
  const [showAI, setShowAI] = useState(false);
  return (
    <div className="flex w-full h-full overflow-hidden bg-white">
      <Sidebar onLogout={() => logout(navigate, 'PROFESSIONAL')} onToggleAI={() => setShowAI(p => !p)} />
      <div className="flex-1 flex overflow-hidden">
        <div key={location.pathname} className="flex-1 flex flex-col overflow-hidden fade-in">
          <Outlet />
        </div>
      </div>
      <GlobalAIPanel isOpen={showAI} onClose={() => setShowAI(false)} />
    </div>
  );
};

// ── Navbar ────────────────────────────────────────────────────
const Navbar: React.FC<{ view: AppView; setView: (v: AppView) => void }> = ({ view, setView }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loggedPro, notifications, markNotificationRead, clearNotifications } = useClinic();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const publicPaths = ['/pro/login','/pro/register','/pro/recover','/pro/reset-password','/verify/','/consent/','/admin/login', '/patient'];
  const isFullPublic = location.pathname === '/' || publicPaths.some(p => location.pathname.startsWith(p));
  const isAuthPage   = publicPaths.some(p => location.pathname.startsWith(p));
  const showProActions = view === 'PROFESSIONAL' && !isAuthPage && !!loggedPro;
  const unread = notifications.filter(n => !n.read).length;
  const isRodrigo = loggedPro?.id === 'pro-rodrigo';

  // Ocultar navbar completamente en landing (MainHome tiene su propia)
  if (location.pathname === '/') return null;

  const isPublicView = isFullPublic;

  return (
    <nav className="bg-white border-b border-slate-200 flex items-center px-3 sm:px-6 md:px-10 shrink-0 z-50 sticky top-0 shadow-sm" style={{height: 56}}>
      {/* Logo */}
      <div className="flex items-center gap-3 cursor-pointer shrink-0" onClick={() => navigate('/')}>
        <img
          src={isPublicView ? logoClinica : logoAgenda}
          alt="Mas Life Logo"
          className="h-12 w-auto object-contain"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      <div className="flex items-center gap-2 shrink-0 justify-end">
        {/* Menú hamburguesa — en vista pública */}
        {isFullPublic && (
          <>
            <button
              id="hamburger-menu-btn"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menú"
              className="flex flex-col gap-1 items-center justify-center w-10 h-10 bg-slate-900 rounded-xl hover:bg-slate-700 transition-all group">
              {[0,1,2].map(i => <div key={i} className="w-4.5 h-[1.5px] bg-white rounded-full group-hover:bg-blue-400 transition-colors" style={{width:18}} />)}
            </button>

            {/* Panel de menú lateral */}
            {menuOpen && (
              <div className="fixed inset-0 z-[200] flex justify-end">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
                <div className="relative w-72 sm:w-80 h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                  {/* Header del menú */}
                  <div className="bg-slate-900 p-5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                      <img src="/logo-clinica-maslife.svg" alt="Mas Life" className="h-8 w-auto brightness-0 invert opacity-90" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                    </div>
                    <button
                      onClick={() => setMenuOpen(false)}
                      className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all">
                      <span className="material-icons-round text-white text-base">close</span>
                    </button>
                  </div>

                  {/* Contenido del menú */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {/* Para Pacientes */}
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Para Pacientes</p>
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/patient/results'); }}
                      className="w-full text-left p-4 rounded-2xl bg-teal-50 border border-teal-100 hover:bg-teal-100 transition-all flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <span className="material-icons-round text-white text-base">person_search</span>
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900 uppercase tracking-wide">Buscar Profesionales</p>
                        <p className="text-xs text-teal-600 font-bold mt-0.5">Red verificada +Life</p>
                      </div>
                    </button>

                    <button
                      onClick={() => { setMenuOpen(false); navigate('/', { state: { openContact: true } }); }}
                      className="w-full text-left p-4 rounded-2xl bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 transition-all flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <span className="material-icons-round text-white text-base">mark_email_unread</span>
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900 uppercase tracking-wide">Que me contacten</p>
                        <p className="text-xs text-indigo-600 font-bold mt-0.5">Respuesta en menos de 1 hora</p>
                      </div>
                    </button>

                    <button
                      onClick={() => { setMenuOpen(false); navigate('/', { state: { openAgendar: true } }); }}
                      className="w-full text-left p-4 rounded-2xl bg-orange-50 border border-orange-100 hover:bg-orange-100 transition-all flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <span className="material-icons-round text-white text-base">calendar_month</span>
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900 uppercase tracking-wide">Agendar Atención</p>
                        <p className="text-xs text-orange-600 font-bold mt-0.5">Domicilio · Online · Presencial</p>
                      </div>
                    </button>

                    <div className="h-px bg-slate-100 my-4" />

                    {/* Acceso al Sistema */}
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Acceso Sistema</p>
                    {[
                      { icon: 'badge', label: 'Portal Profesional', sub: 'Ingresa a tu cuenta', path: '/pro/login', bg: 'bg-slate-800', adminOnly: false },
                      { icon: 'admin_panel_settings', label: 'Administración', sub: 'Panel de control', path: '/admin/login', bg: 'bg-rose-600', adminOnly: true }
                    ].filter(item => !item.adminOnly || isRodrigo).map(item => (
                      <button
                        key={item.path}
                        onClick={() => { setMenuOpen(false); navigate(item.path); }}
                        className="w-full text-left p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-all flex items-center gap-3 group">
                        <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                          <span className="material-icons-round text-white text-base">{item.icon}</span>
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-900 uppercase tracking-wide">{item.label}</p>
                          <p className="text-xs text-slate-500 font-bold mt-0.5">{item.sub}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Footer del menú */}
                  <div className="border-t border-slate-100 p-4 text-center shrink-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">© 2026 Clínica Mas Life</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Acciones de profesional logueado */}
        {showProActions && loggedPro && (
          <>
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifications(s => !s);
                }}
                className="relative w-10 h-10 rounded-xl hover:bg-slate-100 transition-all flex items-center justify-center"
              >
                <span className="material-icons-round text-xl text-slate-700">notifications</span>
                {unread > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-[18px] h-[18px] bg-rose-500 rounded-full text-white text-[9px] font-black flex items-center justify-center">
                    {unread}
                  </span>
                )}
              </button>

              {showNotifications && (
                <>
                  <div className="fixed inset-0 z-[150]" onClick={() => setShowNotifications(false)} />
                  <div className="absolute right-0 top-12 z-[200] w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
                      <p className="font-black text-xs uppercase tracking-widest text-slate-700">Notificaciones</p>
                      <div className="flex items-center gap-2">
                        {unread > 0 && (
                          <button
                            onClick={() => notifications.forEach(n => !n.read && markNotificationRead(n.id))}
                            className="text-[10px] font-black text-teal-600 uppercase tracking-wider hover:text-teal-800 transition-colors"
                          >
                            Marcar leídas
                          </button>
                        )}
                        <button onClick={() => setShowNotifications(false)} className="w-7 h-7 rounded-lg hover:bg-slate-200 flex items-center justify-center transition-all">
                          <span className="material-icons-round text-sm text-slate-500">close</span>
                        </button>
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center">
                          <span className="material-icons-round text-slate-300 text-4xl block mb-2">notifications_none</span>
                          <p className="text-xs text-slate-400 font-bold">Sin notificaciones</p>
                        </div>
                      ) : notifications.map(n => (
                        <div
                          key={n.id}
                          onClick={() => !n.read && markNotificationRead(n.id)}
                          className={`flex items-start gap-3 px-5 py-4 cursor-pointer transition-colors hover:bg-slate-50 ${!n.read ? 'bg-teal-50/60' : ''}`}
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${n.type === 'appointment' ? 'bg-teal-100 text-teal-600' : 'bg-slate-100 text-slate-500'}`}>
                            <span className="material-icons-round text-base">
                              {n.type === 'appointment' ? 'event' : 'info'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm leading-snug ${!n.read ? 'font-black text-slate-900' : 'font-medium text-slate-600'}`}>{n.title}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{n.time}</p>
                          </div>
                          {!n.read && <div className="w-2 h-2 bg-teal-500 rounded-full shrink-0 mt-1.5" />}
                        </div>
                      ))}
                    </div>
                    {notifications.length > 0 && (
                      <div className="border-t border-slate-100 p-3">
                        <button
                          onClick={() => { clearNotifications(); setShowNotifications(false); }}
                          className="w-full text-center text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500 transition-colors py-2"
                        >
                          Borrar todas
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div
              onClick={() => navigate('/pro/settings')}
              className="w-10 h-10 rounded-xl bg-slate-100 border-2 border-slate-200 overflow-hidden cursor-pointer hover:border-teal-400 transition-all shrink-0">
              <img
                src={loggedPro.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(loggedPro.name)}&background=00a89e&color=fff&size=80`}
                alt={loggedPro.name}
                className="w-full h-full object-cover"
              />
            </div>
          </>
        )}
      </div>
    </nav>
  );
};

// ── AppContent ────────────────────────────────────────────────
const AppContent: React.FC = () => {
  const [view, setView] = useState<AppView>('PATIENT');
  const location = useLocation();
  const { loggedPro, updateProfessional } = useClinic();

  useEffect(() => {
    if (location.pathname.startsWith('/admin')) setView('ADMIN');
    else if (location.pathname.startsWith('/pro')) setView('PROFESSIONAL');
    else setView('PATIENT');
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans">
      <Navbar view={view} setView={setView} />
      <div className="flex-1 flex overflow-hidden">
        <Routes>
          {/* Públicas */}
          <Route path="/"                    element={<MainHome />} />
          <Route path="/patient/results"     element={<PatientResults />} />
          <Route path="/patient/profile/:id" element={<PatientProfile />} />
          <Route path="/verify/:code"        element={<DocumentVerifier />} />
          <Route path="/consent/:id"         element={<ConsentAcceptPage />} />
          {/* Auth */}
          <Route path="/pro/login"           element={<ProfessionalLogin />} />
          <Route path="/pro/register"        element={<ProfessionalRegistration />} />
          <Route path="/pro/recover"         element={<PasswordRecovery />} />
          <Route path="/pro/reset-password"  element={<ResetPassword />} />
          <Route path="/admin/login"         element={<AdminLogin />} />
          {/* Protegidas profesional */}
          <Route element={<ProGuard><ProLayout /></ProGuard>}>
            <Route path="/pro/password-setup" element={loggedPro ? <PasswordSetup profile={loggedPro} onComplete={updateProfessional} /> : <Navigate to="/pro/login" />} />
            <Route path="/pro/dashboard"   element={<ProfessionalDashboard />} />
            <Route path="/pro/agenda"      element={<ProfessionalAgenda />} />
            <Route path="/pro/patients"    element={<PatientList />} />
            <Route path="/pro/record/:id"  element={<ClinicalRecord />} />
            <Route path="/pro/session/:id" element={<ConsultationSession />} />
            <Route path="/pro/finances"    element={<Finances />} />
            <Route path="/pro/settings"    element={<Settings />} />
          </Route>
          {/* Protegidas admin */}
          <Route element={<AdminGuard><ProLayout /></AdminGuard>}>
            <Route path="/admin/management" element={<AdminManagement />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
};

const App: React.FC = () => (
  <HashRouter>
    <ClinicProvider>
      <AppContent />
      <ToastContainer />
    </ClinicProvider>
  </HashRouter>
);

export default App;
