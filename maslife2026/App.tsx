import React, { useState, useEffect } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate,
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
    <nav className="bg-white border-b border-slate-200 flex items-center px-3 sm:px-6 md:px-10 shrink-0 z-50 sticky top-0 shadow-sm" style={{height: 68}}>
      {/* Logo */}
      <div className="flex items-center gap-3 cursor-pointer shrink-0" onClick={() => navigate('/')}>
        <img
          src={isPublicView ? logoClinica : logoAgenda}
          alt="Mas Life Logo"
          className="h-14 w-auto object-contain"
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
                  <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                      <img src="/logo-clinica-maslife.svg" alt="Mas Life" className="h-9 w-auto brightness-0 invert opacity-95" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                    </div>
                    <button
                      onClick={() => setMenuOpen(false)}
                      className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all">
                      <span className="material-icons-round text-white text-lg">close</span>
                    </button>
                  </div>

                  {/* Contenido del menú */}
                  <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
                    {/* Tagline */}
                    <div className="text-center py-3">
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        Red de salud verificada en<br />
                        <span className="font-bold text-slate-700">Ovalle · Coquimbo · La Serena</span>
                      </p>
                    </div>

                    {/* Agendar — CTA principal */}
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/patient/results'); }}
                      className="w-full text-left p-4 rounded-2xl shadow-lg hover:scale-[1.02] transition-all flex items-center gap-4 group"
                      style={{ background: 'linear-gradient(135deg, #0284c7, #0ea5e9)', boxShadow: '0 8px 24px -8px rgba(2,132,199,.5)' }}>
                      <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                        <span className="material-icons-round text-white text-xl">event_available</span>
                      </div>
                      <div>
                        <p className="text-sm font-black text-white uppercase tracking-wide">Agendar</p>
                        <p className="text-xs font-medium mt-0.5" style={{ color: 'rgba(186,230,253,.85)' }}>Reserva tu consulta ahora</p>
                      </div>
                      <span className="material-icons-round text-white/50 text-base ml-auto group-hover:translate-x-1 transition-transform">chevron_right</span>
                    </button>

                    {/* Buscar Profesionales */}
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/patient/results'); }}
                      className="w-full text-left p-4 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-200 hover:shadow-teal-300 hover:scale-[1.02] transition-all flex items-center gap-4 group">
                      <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                        <span className="material-icons-round text-white text-xl">person_search</span>
                      </div>
                      <div>
                        <p className="text-sm font-black text-white uppercase tracking-wide">Buscar Profesionales</p>
                        <p className="text-xs text-teal-100 font-medium mt-0.5">Encuentra tu especialista</p>
                      </div>
                      <span className="material-icons-round text-white/50 text-base ml-auto group-hover:translate-x-1 transition-transform">chevron_right</span>
                    </button>

                    {/* Testimonios */}
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        if (window.location.pathname === '/') {
                          document.getElementById('testimonios')?.scrollIntoView({ behavior: 'smooth' });
                        } else {
                          sessionStorage.setItem('maslife_scrollTo', 'testimonios');
                          navigate('/');
                        }
                      }}
                      className="w-full text-left p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:scale-[1.02] transition-all flex items-center gap-4 group">
                      <div className="w-11 h-11 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                        <span className="material-icons-round text-slate-600 text-xl">format_quote</span>
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800 uppercase tracking-wide">Testimonios</p>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">Lo que dicen nuestros pacientes</p>
                      </div>
                      <span className="material-icons-round text-slate-400 text-base ml-auto group-hover:translate-x-1 transition-transform">chevron_right</span>
                    </button>

                    {/* Filosofía */}
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        if (window.location.pathname === '/') {
                          document.getElementById('filosofia')?.scrollIntoView({ behavior: 'smooth' });
                        } else {
                          sessionStorage.setItem('maslife_scrollTo', 'filosofia');
                          navigate('/');
                        }
                      }}
                      className="w-full text-left p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:scale-[1.02] transition-all flex items-center gap-4 group">
                      <div className="w-11 h-11 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                        <span className="material-icons-round text-slate-600 text-xl">auto_stories</span>
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800 uppercase tracking-wide">Filosofía</p>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">Nuestra visión de la salud</p>
                      </div>
                      <span className="material-icons-round text-slate-400 text-base ml-auto group-hover:translate-x-1 transition-transform">chevron_right</span>
                    </button>

                    {/* Panel Profesional */}
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/pro/login'); }}
                      className="w-full text-left p-4 rounded-2xl bg-slate-900 shadow-lg shadow-slate-200 hover:shadow-slate-300 hover:scale-[1.02] transition-all flex items-center gap-4 group">
                      <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                        <span className="material-icons-round text-white text-xl">badge</span>
                      </div>
                      <div>
                        <p className="text-sm font-black text-white uppercase tracking-wide">Panel Profesional</p>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">Acceso para profesionales</p>
                      </div>
                      <span className="material-icons-round text-white/30 text-base ml-auto group-hover:translate-x-1 transition-transform">chevron_right</span>
                    </button>
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
                      ) : notifications.map(n => {
                        // Parsear datos de cita desde el título: "Nueva cita: Nombre - Servicio (YYYY-MM-DD HH:MM)"
                        const citaMatch = n.type === 'appointment'
                          ? n.title.match(/Nueva cita: (.+?) - (.+?) \((\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})\)/)
                          : null;
                        return (
                          <div
                            key={n.id}
                            className={`px-4 py-3 transition-colors ${!n.read ? 'bg-teal-50/70' : 'hover:bg-slate-50'}`}
                          >
                            {citaMatch ? (
                              // Notificación de cita — formato enriquecido
                              <div>
                                <div className="flex items-start gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="material-icons-round text-base">event</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black text-teal-600 uppercase tracking-wider">Nueva Cita</p>
                                    <p className={`text-sm font-black text-slate-900 truncate`}>{citaMatch[1]}</p>
                                    <p className="text-xs font-bold text-slate-500 truncate">{citaMatch[2]}</p>
                                    <p className="text-xs text-slate-400 font-bold mt-0.5">
                                      {new Date(citaMatch[3] + 'T00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })} · {citaMatch[4]}
                                    </p>
                                  </div>
                                  {!n.read && <div className="w-2 h-2 bg-teal-500 rounded-full shrink-0 mt-2" />}
                                </div>
                                <div className="flex gap-2 mt-2.5 ml-12">
                                  <button
                                    onClick={() => { if (!n.read) markNotificationRead(n.id); setShowNotifications(false); navigate('/pro/dashboard'); }}
                                    className="flex-1 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1"
                                  >
                                    <span className="material-icons-round text-xs">calendar_today</span>
                                    Ver Agenda
                                  </button>
                                  <button
                                    onClick={() => { if (!n.read) markNotificationRead(n.id); setShowNotifications(false); navigate('/pro/patients'); }}
                                    className="flex-1 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1"
                                  >
                                    <span className="material-icons-round text-xs">person_add</span>
                                    Crear Ficha
                                  </button>
                                </div>
                              </div>
                            ) : (
                              // Notificación genérica
                              <div
                                onClick={() => { if (!n.read) markNotificationRead(n.id); setShowNotifications(false); }}
                                className="flex items-start gap-3 cursor-pointer"
                              >
                                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                                  <span className="material-icons-round text-base">info</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm leading-snug ${!n.read ? 'font-black text-slate-900' : 'font-medium text-slate-600'}`}>{n.title}</p>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{n.time}</p>
                                </div>
                                {!n.read && <div className="w-2 h-2 bg-slate-400 rounded-full shrink-0 mt-1.5" />}
                              </div>
                            )}
                          </div>
                        );
                      })}
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
    <div className="h-screen flex flex-col bg-white font-sans overflow-hidden">
      <Navbar view={view} setView={setView} />
      <div className="flex-1 flex overflow-hidden">
        <Routes>
          {/* Públicas */}
          <Route path="/"                    element={<MainHome />} />
          <Route path="/patient/results"     element={<PatientResults />} />
          <Route path="/patient/profile/:id" element={<PatientProfile />} />
          <Route path="/p/:id"               element={<PatientProfile />} />
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
  <BrowserRouter>
    <ClinicProvider>
      <AppContent />
      <ToastContainer />
    </ClinicProvider>
  </BrowserRouter>
);

export default App;
