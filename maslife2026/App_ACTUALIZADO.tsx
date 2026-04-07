
import React, { useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ClinicProvider } from './ClinicContext';
import MainHome from './pages/MainHome';
import PatientLanding from './pages/PatientLanding';
import PatientResults from './pages/PatientResults';
import PatientProfile from './pages/PatientProfile';
import ProfessionalDashboard from './pages/ProfessionalDashboard';
import ClinicalRecord from './pages/ClinicalRecord';
import PatientList from './pages/PatientList';
import ConsultationSession from './pages/ConsultationSession';
import ProfessionalRegistration from './pages/ProfessionalRegistration';
import ProfessionalLogin from './pages/ProfessionalLogin';
import AdminManagement from './pages/AdminManagement';
import AdminLogin from './pages/AdminLogin';
import Finances from './pages/Finances';
import Settings from './pages/Settings';
import ProfessionalAgenda from './pages/ProfessionalAgenda';
import PasswordSetup from './pages/PasswordSetup';
import { AppView, Notification } from './types';
import { useClinic } from './ClinicContext';

const Navbar: React.FC<{ 
  currentView: AppView; 
  setView: (view: AppView) => void;
  loggedPro: ProfessionalProfile | null;
  notifications: Notification[];
  onMarkAsRead: () => void;
}> = ({ currentView, setView, loggedPro, notifications, onMarkAsRead }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);

  const isPublicView = location.pathname === '/';

  const handleViewChange = (view: AppView) => {
    setView(view);
    if (view === 'PATIENT') navigate('/');
    else if (view === 'PROFESSIONAL') navigate('/pro/dashboard');
    else if (view === 'ADMIN') navigate('/admin/login');
  };

  const isAuthPage = location.pathname.includes('/login') || location.pathname.includes('/register') || location.pathname.includes('/password-setup');
  const showProActions = currentView === 'PROFESSIONAL' && !isAuthPage && loggedPro;
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <nav className="bg-white border-b border-slate-200 h-22 flex items-center px-4 md:px-12 shrink-0 z-50 sticky top-0 shadow-sm">
      <div className="flex items-center gap-3 cursor-pointer shrink-0" onClick={() => navigate('/')}>
        <div className="bg-teal-500 w-12 h-12 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20">
          <span className="material-icons-round text-white text-3xl">medical_services</span>
        </div>
        <div className="flex flex-col -gap-1">
          <span className="text-[10px] font-black text-teal-600 uppercase tracking-widest leading-none">PLATAFORMA</span>
          <span className="text-2xl font-black tracking-tight text-black">
            Mas Life<span className="text-teal-500">🧡</span>
          </span>
        </div>
      </div>

      <div className="flex-1 flex justify-center gap-2 md:gap-8 px-4 overflow-x-auto hide-scrollbar">
        {!isPublicView && (
          <>
            <button onClick={() => handleViewChange('PATIENT')} className={`whitespace-nowrap px-8 py-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${currentView === 'PATIENT' ? 'bg-black text-white shadow-lg' : 'text-slate-500 hover:text-black'}`}>Paciente</button>
            <button onClick={() => handleViewChange('PROFESSIONAL')} className={`whitespace-nowrap px-8 py-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${currentView === 'PROFESSIONAL' ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20' : 'text-slate-500 hover:text-teal-600'}`}>Profesional</button>
            <button onClick={() => handleViewChange('ADMIN')} className={`whitespace-nowrap px-8 py-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${currentView === 'ADMIN' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-black'}`}>Admin</button>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 md:gap-6 shrink-0 min-w-[120px] justify-end relative">
        {isPublicView && (
          <button 
            onClick={() => navigate('/patient/search')}
            className="hidden lg:flex items-center gap-2 bg-black text-white px-8 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl hover:scale-105 transition-all"
          >
            <span className="material-icons-round text-sm">search</span>
            Buscar profesionales
          </button>
        )}
        {showProActions && (
          <>
            <button onClick={() => { setShowNotifications(!showNotifications); if(!showNotifications) onMarkAsRead(); }} className="relative w-12 h-12 rounded-2xl text-black hover:bg-slate-100 transition-all flex items-center justify-center">
              <span className="material-icons-round text-2xl">notifications</span>
              {unreadCount > 0 && <span className="absolute top-2 right-2 w-6 h-6 bg-rose-600 rounded-full border-2 border-white text-[10px] font-black text-white flex items-center justify-center">{unreadCount}</span>}
            </button>
            <div onClick={() => navigate('/pro/settings')} className="w-11 h-11 rounded-2xl bg-slate-100 border-2 border-slate-200 overflow-hidden cursor-pointer hover:border-teal-500 transition-all shadow-sm">
              <img src={loggedPro.avatar || "https://picsum.photos/seed/placeholder/64/64"} alt="Pro" className="w-full h-full object-cover" />
            </div>
          </>
        )}
      </div>
    </nav>
  );
};

const AppContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>('PATIENT');
  const [notifications, setNotifications] = useState<Notification[]>([
    { id: '1', title: 'Sistema de red Maslife activo', time: 'Justo ahora', type: 'system', read: false }
  ]);

  const navigate = useNavigate();
  const { loggedPro, setLoggedPro, professionals, updateProfessional } = useClinic();

  const handleUpdatePro = (updated: any) => {
    updateProfessional(updated);
  };

  const handleLogout = () => {
    setLoggedPro(null);
    if (currentView === 'PROFESSIONAL') navigate('/pro/login');
    else if (currentView === 'ADMIN') navigate('/admin/login');
    else navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col bg-white pb-16 md:pb-0 font-sans">
      <Navbar currentView={currentView} setView={setCurrentView} loggedPro={loggedPro} notifications={notifications} onMarkAsRead={() => setNotifications(prev => prev.map(n => ({...n, read: true})))} />
      <div className="flex-1 flex overflow-hidden">
        <Routes>
          <Route path="/" element={<MainHome />} />
          <Route path="/pro/login" element={<ProfessionalLogin />} />
          <Route path="/pro/register" element={<ProfessionalRegistration onRegister={(p) => { setLoggedPro(p); navigate('/pro/dashboard'); }} />} />
          <Route path="/pro/password-setup" element={loggedPro ? <PasswordSetup profile={loggedPro} onComplete={handleUpdatePro} /> : <Navigate to="/pro/login" />} />
          <Route path="/pro/dashboard" element={<ProfessionalDashboard />} />
          <Route path="/pro/agenda" element={<ProfessionalAgenda />} />
          <Route path="/pro/patients" element={<PatientList />} />
          <Route path="/pro/record/:id" element={<ClinicalRecord />} />
          <Route path="/pro/session/:id" element={<ConsultationSession />} />
          <Route path="/pro/finances" element={<Finances />} />
          <Route path="/pro/settings" element={<Settings />} />
          <Route path="/patient/search" element={<PatientLanding />} />
          <Route path="/patient/results" element={<PatientResults />} />
          <Route path="/patient/profile/:id" element={<PatientProfile />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/management" element={<AdminManagement onLogout={handleLogout} onUpdatePro={handleUpdatePro} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <ClinicProvider>
        <AppContent />
      </ClinicProvider>
    </HashRouter>
  );
};

export default App;
