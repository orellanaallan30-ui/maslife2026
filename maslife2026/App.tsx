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
import Sidebar        from './components/Sidebar';
import GlobalAIPanel  from './components/GlobalAIPanel';
import { ClinicProvider, useClinic } from './ClinicContext';
import { AppView } from './types';

// ── Guards ────────────────────────────────────────────────────
const ProGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loggedPro, isLoading } = useClinic();
  if (isLoading) return null;
  return loggedPro ? <>{children}</> : <Navigate to="/pro/login" replace />;
};
const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin } = useClinic();
  return isAdmin ? <>{children}</> : <Navigate to="/admin/login" replace />;
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
  const { loggedPro, notifications, setNotifications } = useClinic();
  const [menuOpen, setMenuOpen] = useState(false);

  const publicPaths = ['/pro/login','/pro/register','/pro/recover','/pro/reset-password','/verify/','/consent/','/admin/login'];
  const isFullPublic = location.pathname === '/' || publicPaths.some(p => location.pathname.startsWith(p));
  const isAuthPage   = publicPaths.some(p => location.pathname.startsWith(p));
  const showProActions = view === 'PROFESSIONAL' && !isAuthPage && loggedPro;
  const unread = notifications.filter(n => !n.read).length;

  const handleView = (v: AppView) => {
    setView(v);
    navigate(v === 'PATIENT' ? '/' : v === 'PROFESSIONAL' ? '/pro/dashboard' : '/admin/login');
  };

  return (
    <nav className="bg-white border-b border-slate-200 flex items-center px-4 md:px-10 shrink-0 z-50 sticky top-0 shadow-sm" style={{height:72}}>
      <div className="flex items-center gap-3 cursor-pointer shrink-0" onClick={() => navigate('/')}>
        <div className="bg-teal-500 w-11 h-11 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20">
          <span className="material-icons-round text-white text-2xl">medical_services</span>
        </div>
        <div>
          <p className="text-[10px] font-black text-teal-600 uppercase tracking-widest leading-none">PLATAFORMA</p>
          <p className="text-xl font-black tracking-tight text-black leading-tight">Mas Life 🧡</p>
        </div>
      </div>

      <div className="flex-1 flex justify-center gap-1 px-4 overflow-x-auto hide-scrollbar">
        {!isFullPublic && (['PATIENT','PROFESSIONAL','ADMIN'] as AppView[]).map(v => (
          <button key={v} onClick={() => handleView(v)}
            className={`whitespace-nowrap px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all
              ${view === v
                ? v === 'PROFESSIONAL' ? 'bg-teal-500 text-white shadow-lg'
                : v === 'ADMIN' ? 'bg-slate-800 text-white' : 'bg-black text-white'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
            {v === 'PATIENT' ? 'Paciente' : v === 'PROFESSIONAL' ? 'Profesional' : 'Admin'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2.5 shrink-0 justify-end">
        {isFullPublic && (
          <>
            <button onClick={() => setMenuOpen(true)}
              className="flex flex-col gap-1.5 items-center justify-center w-11 h-11 bg-slate-900 rounded-xl hover:bg-slate-700 transition-all group">
              {[0,1,2].map(i => <div key={i} className="w-5 h-[1.5px] bg-white rounded-full group-hover:bg-teal-400 transition-colors" />)}
            </button>
            {menuOpen && (
              <div className="fixed inset-0 z-[100] flex justify-end">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
                <div className="relative w-72 h-full bg-white shadow-2xl flex flex-col">
                  <div className="bg-slate-900 p-6 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 bg-teal-500 rounded-xl flex items-center justify-center shrink-0">
                        <span className="material-icons-round text-white text-base">medical_services</span>
                      </div>
                      <div>
                        <p className="text-white font-black text-sm">Clínica Mas Life</p>
                        <p className="text-slate-400 text-xs">clinicamaslife.cl</p>
                      </div>
                    </div>
                    <button onClick={() => setMenuOpen(false)} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all">
                      <span className="material-icons-round text-white text-base">close</span>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5 space-y-2">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Para Pacientes</p>
                    <button onClick={() => { setMenuOpen(false); navigate('/patient/results'); }}
                      className="w-full text-left p-4 rounded-2xl bg-teal-50 border border-teal-100 hover:bg-teal-100 transition-all flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-teal-500 flex items-center justify-center shrink-0">
                        <span className="material-icons-round text-white text-base">person_search</span>
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900 uppercase">Buscar Profesionales</p>
                        <p className="text-xs text-teal-600 font-bold">Red verificada +Life</p>
                      </div>
                    </button>
                    <div className="h-px bg-slate-100 my-3" />
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Acceso Sistema</p>
                    {[{icon:'badge',label:'Portal Profesional',path:'/pro/login',bg:'bg-slate-800'},{icon:'admin_panel_settings',label:'Administración',path:'/admin/login',bg:'bg-rose-600'}].map(item => (
                      <button key={item.path} onClick={() => { setMenuOpen(false); navigate(item.path); }}
                        className="w-full text-left p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-all flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
                          <span className="material-icons-round text-white text-base">{item.icon}</span>
                        </div>
                        <p className="text-xs font-black text-slate-900 uppercase">{item.label}</p>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-slate-100 p-4 text-center shrink-0">
                    <p className="text-xs text-slate-400 font-bold">© 2026 Clínica Mas Life 🧡</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        {showProActions && (
          <>
            <button
              onClick={() => setNotifications(prev => prev.map(n => ({...n, read:true})))}
              className="relative w-10 h-10 rounded-xl hover:bg-slate-100 transition-all flex items-center justify-center">
              <span className="material-icons-round text-xl text-slate-700">notifications</span>
              {unread > 0 && <span className="absolute top-1.5 right-1.5 w-[18px] h-[18px] bg-rose-500 rounded-full text-white text-[9px] font-black flex items-center justify-center">{unread}</span>}
            </button>
            <div onClick={() => navigate('/pro/settings')}
              className="w-10 h-10 rounded-xl bg-slate-100 border-2 border-slate-200 overflow-hidden cursor-pointer hover:border-teal-400 transition-all shrink-0">
              <img
                src={loggedPro.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(loggedPro.name)}&background=00a89e&color=fff&size=80`}
                alt={loggedPro.name} className="w-full h-full object-cover" />
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
  const { isLoading, loggedPro, updatePro } = useClinic();

  useEffect(() => {
    if (location.pathname.startsWith('/admin')) setView('ADMIN');
    else if (location.pathname.startsWith('/pro')) setView('PROFESSIONAL');
    else setView('PATIENT');
  }, [location.pathname]);

  if (isLoading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white gap-5">
      <div className="relative w-16 h-16">
        <div className="w-16 h-16 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="material-icons-round text-teal-500 text-2xl">medical_services</span>
        </div>
      </div>
      <p className="text-[11px] font-black text-teal-600 uppercase tracking-[0.3em] animate-pulse">
        Conectando con MasLife Cloud...
      </p>
    </div>
  );

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
            <Route path="/pro/password-setup" element={loggedPro ? <PasswordSetup profile={loggedPro} onComplete={updatePro} /> : <Navigate to="/pro/login" />} />
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
    </ClinicProvider>
  </HashRouter>
);

export default App;
