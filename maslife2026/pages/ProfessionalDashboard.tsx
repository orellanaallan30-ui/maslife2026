import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Appointment } from '../types';
import { useClinic } from '../ClinicContext';
import { supabase } from '../supabaseClient';

interface MPPayment {
  id: number;
  status: string;
  statusDetail: string;
  amount: number;
  currency: string;
  description: string;
  externalRef: string;
  payerEmail: string | null;
  payerName: string | null;
  paymentMethod: string;
  paymentType: string;
  createdAt: string;
  approvedAt: string | null;
}
interface MPSummary {
  approvedCount: number; approvedAmount: number;
  pendingCount: number;  pendingAmount: number;
  rejectedCount: number; days: number;
}

const ProfessionalDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { appointments, manualTransactions, loggedPro } = useClinic();

  if (!loggedPro) return <Navigate to="/pro/login" />;

  // Verificar estado de suscripción desde el servidor (no confiar solo en localStorage)
  const [serverSubStatus, setServerSubStatus] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('professionals')
      .select('subscription_status')
      .eq('id', loggedPro.id)
      .single()
      .then(({ data }) => {
        if (data?.subscription_status) setServerSubStatus(data.subscription_status);
      })
      .catch(() => {
        // Sin conexión: usar estado local como fallback
        setServerSubStatus(loggedPro.subscriptionStatus);
      });
  }, [loggedPro.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // El estado del servidor tiene precedencia; fallback al local mientras carga
  const isPaused = (serverSubStatus ?? loggedPro.subscriptionStatus) === 'paused';

  const [linkCopied, setLinkCopied] = useState(false);

  // ── Panel de Ventas MP ──
  const [activeTab, setActiveTab]       = useState<'agenda' | 'ventas'>('agenda');
  const [mpPayments, setMpPayments]     = useState<MPPayment[]>([]);
  const [mpSummary, setMpSummary]       = useState<MPSummary | null>(null);
  const [mpLoading, setMpLoading]       = useState(false);
  const [mpRange, setMpRange]           = useState<'7' | '30' | '90'>('30');
  const [mpLoaded, setMpLoaded]         = useState(false);

  useEffect(() => {
    if (activeTab !== 'ventas' || mpLoaded) return;
    setMpLoading(true);
    fetch(`/api/mp-payments?range=${mpRange}&limit=100`)
      .then(r => r.json())
      .then(data => {
        if (data.payments) { setMpPayments(data.payments); setMpSummary(data.summary); setMpLoaded(true); }
      })
      .catch(() => {})
      .finally(() => setMpLoading(false));
  }, [activeTab, mpRange, mpLoaded]);

  const reloadMP = (range: '7' | '30' | '90') => {
    setMpRange(range); setMpLoaded(false);
  };

  const bookingLink = `${window.location.origin}/p/${loggedPro.slug || loggedPro.id}`;

  const handleCopyBookingLink = useCallback(() => {
    navigator.clipboard.writeText(bookingLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    }).catch(() => {
      const el = document.createElement('textarea');
      el.value = bookingLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  }, [bookingLink]);

  const handleShareBookingLink = useCallback(() => {
    if (navigator.share) {
      navigator.share({ title: `Agenda con ${loggedPro.name}`, text: '¡Agenda tu hora conmigo!', url: bookingLink });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`¡Hola! Puedes agendar una cita conmigo directamente aquí: ${bookingLink}`)}`, '_blank');
    }
  }, [bookingLink, loggedPro.name]);

  const profileComplete = !!(loggedPro.slug && loggedPro.specialty && loggedPro.services?.length > 0);
  const MP_SUBSCRIPTION_LINK = import.meta.env.VITE_GLOBAL_SUBSCRIPTION_LINK || "https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=7e9fa964bb6d4ecd89058685ba8a5b34";
  const mpLinkWithBack = `${MP_SUBSCRIPTION_LINK}&back_url=${encodeURIComponent('https://clinicamaslife.cl/pro/settings?subscribed=1')}`;

  const today = new Date().toISOString().split('T')[0];
  const myTodayApps = React.useMemo(() =>
    appointments.filter(a => a.date === today && a.professionalId === loggedPro.id && a.status !== 'Cancelado'),
    [appointments, today, loggedPro.id]
  );

  const totalIncomeToday = React.useMemo(() => {
    const appsIncome = myTodayApps.reduce((acc, curr) => acc + (curr.price || 0), 0);
    const manualIncome = manualTransactions
      .filter(t => t.date === today && t.type === 'Ingreso')
      .reduce((acc, curr) => acc + curr.amount, 0);
    return appsIncome + manualIncome;
  }, [myTodayApps, manualTransactions, today]);

  const getStatusStyles = (status: Appointment['status'], appColor?: string) => {
    const baseColor = appColor || 'bg-primary';

    const colorMap: Record<string, { bg: string, border: string, text: string, icon: string }> = {
      'bg-primary': { bg: 'bg-primary/10', border: 'border-primary/20', text: 'text-primary', icon: 'check_circle' },
      'bg-emerald-500': { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-700', icon: 'check_circle' },
      'bg-indigo-500': { bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-700', icon: 'psychology' },
      'bg-rose-500': { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-700', icon: 'cancel' },
      'bg-amber-500': { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-700', icon: 'warning' },
      'bg-slate-700': { bg: 'bg-slate-700/10', border: 'border-slate-700/20', text: 'text-slate-700', icon: 'block' },
    };

    const baseStyles = colorMap[baseColor] || colorMap['bg-primary'];

    // Specific icons based on status (overrides mapping if needed)
    const statusIcons: any = {
      'Confirmado': 'check_circle',
      'Llegado': 'hail',
      'En Sesión': 'psychology',
      'Finalizado': 'task_alt',
      'Cancelado': 'cancel',
      'Bloqueado': 'block'
    };

    return {
      bg: baseStyles.bg,
      border: baseStyles.border,
      text: baseStyles.text,
      icon: statusIcons[status] || baseStyles.icon
    };
  };

  return (
    <div className="flex-1 w-full h-full overflow-hidden bg-white relative">

      {isPaused && (
        <div className="absolute inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 transition-all">
          <div className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl text-center">
            <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-xl">
              <span className="material-icons-round text-5xl">lock_person</span>
            </div>
            <h2 className="text-4xl font-black text-black tracking-tight mb-4">Agenda Suspendida</h2>
            <p className="text-slate-800 font-bold mb-8 text-lg leading-relaxed">Por favor regulariza tu suscripción para recibir pacientes.</p>
            <a href={mpLinkWithBack} className="w-full py-6 bg-primary text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-2xl shadow-primary/20 flex items-center justify-center gap-3 transition-all hover:scale-[1.02]">
              PAGAR SUSCRIPCIÓN <span className="material-icons-round">payment</span>
            </a>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 md:p-10 bg-slate-50/50 custom-scrollbar">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 text-center md:text-left">
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-950 leading-tight">Hola, {loggedPro.name}</h1>
            <p className="text-primary font-black text-xs uppercase tracking-[0.4em] mt-3 opacity-80">Panel de Control Clínico</p>
          </div>

          {/* ── Tu Link de Reservas ── */}
          <div className={`mb-8 rounded-[2.5rem] border p-6 md:p-7 flex flex-col md:flex-row items-stretch md:items-center gap-5 overflow-hidden transition-all ${
            profileComplete
              ? 'bg-white border-slate-100 shadow-sm'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
              profileComplete ? 'bg-blue-50' : 'bg-amber-100'
            }`}>
              <span className={`material-icons-round text-2xl ${profileComplete ? 'text-blue-600' : 'text-amber-600'}`}>
                {profileComplete ? 'link' : 'warning'}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Tu Link de Reservas Online</p>
                {profileComplete ? (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-lg uppercase tracking-widest">
                    ✓ Activo
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-[10px] font-black rounded-lg uppercase tracking-widest">
                    Perfil incompleto
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-blue-600 truncate">{bookingLink}</p>
              {!profileComplete && (
                <p className="text-[10px] text-amber-700 font-bold mt-1">
                  Completa en{' '}
                  <button onClick={() => navigate('/pro/settings')} className="underline">Configuración</button>
                  {': '}
                  {!loggedPro.specialty && 'especialidad · '}
                  {(!loggedPro.services || loggedPro.services.length === 0) && 'al menos 1 servicio'}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                onClick={() => window.open(bookingLink, '_blank')}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center gap-2"
              >
                <span className="material-icons-round text-sm">visibility</span>
                Ver Perfil
              </button>
              <button
                onClick={handleCopyBookingLink}
                className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${
                  linkCopied ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <span className="material-icons-round text-sm">{linkCopied ? 'check_circle' : 'content_copy'}</span>
                {linkCopied ? '¡Copiado!' : 'Copiar Link'}
              </button>
              <button
                onClick={handleShareBookingLink}
                className="w-10 h-10 rounded-xl bg-[#25D366] text-white font-black text-xs hover:bg-[#1ebe5d] transition-all flex items-center justify-center"
                title="Compartir por WhatsApp"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.767 5.767 0 1.267.408 2.438 1.103 3.394l-.717 2.63 2.7-.708c.846.541 1.847.851 2.923.851 3.181 0 5.767-2.586 5.767-5.767 0-3.181-2.586-5.767-5.767-5.767zm3.344 8.205c-.145.409-.838.74-1.164.786-.324.045-.72.079-2.315-.572-1.911-.781-3.142-2.723-3.238-2.85-.095-.126-.777-.963-.777-1.838s.454-1.306.616-1.467c.163-.162.355-.202.474-.202s.237.001.341.006c.108.005.253-.041.396.304.145.352.497 1.21.541 1.298.045.089.074.192.015.309-.059.117-.089.192-.178.297-.089.105-.187.234-.267.314s-.17.169-.074.335c.095.166.424.699.91 1.132.626.557 1.152.73 1.316.812.163.081.258.067.354-.044.095-.112.408-.48.517-.643.11-.163.22-.136.371-.081s.956.45 1.12.532c.164.081.274.121.314.192s.041.527-.104.935z"/><path d="M19.057 4.298c-1.883-1.884-4.386-2.922-7.051-2.922-5.485 0-9.946 4.461-9.946 9.946 0 1.753.458 3.465 1.328 4.972l-1.41 5.148 5.268-1.381c1.458.794 3.097 1.213 4.76 1.213h.004c5.484 0 9.946-4.461 9.946-9.946 0-2.657-1.034-5.164-2.919-7.049l-.04-.04zm-7.051 15.352c-1.487 0-2.945-.399-4.216-1.155l-.302-.18-3.132.821.835-3.053-.198-.314c-.832-1.321-1.272-2.857-1.272-4.43 0-4.542 3.696-8.237 8.241-8.237 2.201 0 4.271.857 5.827 2.414s2.414 3.626 2.414 5.827c.001 4.542-3.695 8.237-8.238 8.237l-.059-.03z"/></svg>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white p-5 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-slate-100 shadow-[0_20px_40px_-15px_rgba(19,91,236,0.05)] transition-all transform hover:-translate-y-2 hover:shadow-2xl group flex flex-col justify-between">
              <div className="flex items-center justify-between mb-5 md:mb-8 text-slate-400 group-hover:text-primary transition-colors">
                <span className="font-black text-[10px] uppercase tracking-[0.2em]">Pacientes Hoy</span>
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <span className="material-icons-round text-2xl">groups</span>
                </div>
              </div>
              <div className="flex items-baseline gap-4">
                <span className="text-6xl font-black text-slate-900 tracking-tighter">{myTodayApps.length}</span>
                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl uppercase tracking-widest border border-emerald-100">En cola</span>
              </div>
            </div>

            <div className="bg-white p-5 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-slate-100 shadow-[0_20px_40px_-15px_rgba(19,91,236,0.05)] transition-all transform hover:-translate-y-2 hover:shadow-2xl group flex flex-col justify-between">
              <div className="flex items-center justify-between mb-5 md:mb-8 text-slate-400 group-hover:text-primary transition-colors">
                <span className="font-black text-[10px] uppercase tracking-[0.2em]">Ingresos</span>
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <span className="material-icons-round text-2xl">payments</span>
                </div>
              </div>
              <div>
                <h3 className="text-4xl font-black text-slate-900 tracking-tighter">${totalIncomeToday.toLocaleString('es-CL')}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Total parcial hoy</p>
              </div>
            </div>

            <div
              className="bg-gradient-to-br from-teal-500 to-teal-600 p-5 md:p-8 rounded-2xl md:rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(20,184,166,0.5)] border-b-4 md:border-b-8 border-teal-700 text-white cursor-pointer group relative overflow-hidden transform transition-all hover:-translate-y-2 hover:shadow-teal-500/60 active:border-b-0 active:translate-y-2"
              onClick={() => navigate('/pro/settings')}
            >
              <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                  <span className="text-white/90 font-black text-[10px] uppercase tracking-[0.3em] block mb-3">Sistema de Agenda</span>
                  <h3 className="text-3xl font-black tracking-tight uppercase drop-shadow-lg mb-2">
                    AGENDA MASLIFE
                  </h3>
                  <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-xl border border-white/30 backdrop-blur-md">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">ACTIVE</span>
                  </div>
                </div>
                <div className="mt-6 bg-white/20 p-4 rounded-2xl border border-white/30 backdrop-blur-md inline-block group-hover:bg-white group-hover:text-teal-600 transition-colors shadow-lg self-start">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                    <span className="material-icons-round text-sm">settings</span>
                    Configurar Plan
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('agenda')}
              className={`px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'agenda' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-400'}`}
            >
              <span className="material-icons-round text-sm align-middle mr-1">event</span>Agenda
            </button>
            <button
              onClick={() => setActiveTab('ventas')}
              className={`px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'ventas' ? 'bg-[#009ee3] text-white shadow-lg shadow-[#009ee3]/30' : 'bg-white text-slate-500 border border-slate-200 hover:border-[#009ee3]'}`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 inline-block mr-1 fill-current align-middle"><path d="M12 0C5.374 0 0 5.373 0 12c0 6.628 5.374 12 12 12 6.628 0 12-5.372 12-12C24 5.373 18.628 0 12 0zm5.49 8.444l-2.18 9.778a.42.42 0 01-.41.322h-1.638a.42.42 0 01-.418-.322l-1.084-4.626-1.083 4.626a.42.42 0 01-.418.322H8.62a.42.42 0 01-.41-.322L5.98 8.444a.42.42 0 01.41-.516h1.638c.2 0 .373.139.41.335l1.196 5.692 1.192-5.692a.42.42 0 01.41-.335h1.527c.2 0 .373.139.41.335l1.192 5.692 1.196-5.692a.42.42 0 01.41-.335h1.519a.42.42 0 01.41.516z"/></svg>
              Ventas MP
            </button>
          </div>

          {/* ── Tab: Agenda ── */}
          {activeTab === 'agenda' && (
          <div className="bg-white rounded-3xl md:rounded-[3rem] border border-slate-100 shadow-[0_48px_100px_-20px_rgba(19,91,236,0.1)] overflow-hidden">
            <div className="p-5 md:p-10 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50/30">
              <h2 className="font-black text-2xl text-slate-900 tracking-tight flex items-center gap-4">
                 <span className="w-4 h-4 rounded-full bg-emerald-400 animate-pulse"></span>
                 Citas de Hoy
              </h2>
              <button onClick={() => navigate('/pro/agenda')} className="group bg-white px-8 py-4 rounded-2xl border-b-4 border-slate-200 text-[10px] font-black uppercase tracking-[0.2em] shadow-sm hover:border-primary active:border-b-0 active:translate-y-1 transition-all flex items-center gap-2">
                VER TODA LA AGENDA
                <span className="material-icons-round text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </button>
            </div>
            <div className="divide-y divide-slate-50">
              {myTodayApps.length > 0 ? myTodayApps.map((p, i) => {
                const styles = getStatusStyles(p.status, p.color);
                return (
                  <div key={i} className="p-4 md:p-8 flex flex-col md:flex-row items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors cursor-pointer group" onClick={() => p.patientId ? navigate(`/pro/session/${p.patientId}`) : alert('Cita sin paciente asociado')}>
                    <div className="flex items-center gap-6 w-full md:w-auto">
                      <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-xl shadow-lg group-hover:scale-110 transition-transform">{p.patientName.charAt(0)}</div>
                      <div>
                        <p className="font-black text-slate-900 text-lg tracking-tight mb-1">{p.patientName}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.time} • {p.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                      <span className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border shadow-sm ${styles.bg} ${styles.text} ${styles.border} flex items-center gap-2`}>
                        <span className="material-icons-round text-[14px]">{styles.icon}</span>
                        {p.status}
                      </span>
                      <div className="w-12 h-12 bg-primary text-white rounded-2xl flex items-center justify-center shadow-[0_10px_20px_-10px_rgba(19,91,236,0.5)] border-b-4 border-blue-700 group-hover:scale-110 active:border-b-0 active:translate-y-1 transition-all"><span className="material-icons-round text-2xl">play_arrow</span></div>
                    </div>
                  </div>
                );
              }) : (
                <div className="p-24 text-center">
                  <div className="w-24 h-24 bg-slate-100 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                    <span className="material-icons-round text-slate-300 text-5xl">event_busy</span>
                  </div>
                  <p className="text-slate-400 font-black text-xs uppercase tracking-[0.3em]">No hay citas registradas para hoy.</p>
                </div>
              )}
            </div>
          </div>
          )} {/* end tab agenda */}

          {/* ── Tab: Ventas MercadoPago ── */}
          {activeTab === 'ventas' && (
          <div className="bg-white rounded-3xl md:rounded-[3rem] border border-slate-100 shadow-[0_48px_100px_-20px_rgba(0,158,227,0.12)] overflow-hidden">
            {/* Header */}
            <div className="p-5 md:p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-[#009ee3]/5 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#009ee3] flex items-center justify-center shadow-lg shadow-[#009ee3]/30">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M12 0C5.374 0 0 5.373 0 12c0 6.628 5.374 12 12 12 6.628 0 12-5.372 12-12C24 5.373 18.628 0 12 0zm5.49 8.444l-2.18 9.778a.42.42 0 01-.41.322h-1.638a.42.42 0 01-.418-.322l-1.084-4.626-1.083 4.626a.42.42 0 01-.418.322H8.62a.42.42 0 01-.41-.322L5.98 8.444a.42.42 0 01.41-.516h1.638c.2 0 .373.139.41.335l1.196 5.692 1.192-5.692a.42.42 0 01.41-.335h1.527c.2 0 .373.139.41.335l1.192 5.692 1.196-5.692a.42.42 0 01.41-.335h1.519a.42.42 0 01.41.516z"/></svg>
                </div>
                <div>
                  <h2 className="font-black text-xl text-slate-900 tracking-tight">Panel de Ventas</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">MercadoPago · Pagos en línea</p>
                </div>
              </div>
              {/* Rango */}
              <div className="flex gap-2">
                {(['7','30','90'] as const).map(r => (
                  <button key={r} onClick={() => reloadMP(r)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mpRange === r ? 'bg-[#009ee3] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {r}d
                  </button>
                ))}
              </div>
            </div>

            {mpLoading ? (
              <div className="p-20 text-center">
                <span className="material-icons-round text-5xl text-[#009ee3] animate-spin">sync</span>
                <p className="text-slate-400 font-black text-xs uppercase tracking-widest mt-4">Cargando pagos...</p>
              </div>
            ) : mpSummary ? (
              <>
                {/* Resumen */}
                <div className="grid grid-cols-3 gap-4 p-5 md:p-8 border-b border-slate-50">
                  <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Aprobados</p>
                    <p className="text-2xl font-black text-emerald-700">{mpSummary.approvedCount}</p>
                    <p className="text-xs font-bold text-emerald-600 mt-1">${mpSummary.approvedAmount.toLocaleString('es-CL')}</p>
                  </div>
                  <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Pendientes</p>
                    <p className="text-2xl font-black text-amber-700">{mpSummary.pendingCount}</p>
                    <p className="text-xs font-bold text-amber-600 mt-1">${mpSummary.pendingAmount.toLocaleString('es-CL')}</p>
                  </div>
                  <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100">
                    <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">Rechazados</p>
                    <p className="text-2xl font-black text-rose-700">{mpSummary.rejectedCount}</p>
                    <p className="text-xs font-bold text-rose-400 mt-1">últimos {mpSummary.days}d</p>
                  </div>
                </div>

                {/* Lista de pagos */}
                <div className="divide-y divide-slate-50">
                  {mpPayments.length === 0 ? (
                    <div className="p-20 text-center">
                      <span className="material-icons-round text-5xl text-slate-200">payments</span>
                      <p className="text-slate-400 font-black text-xs uppercase tracking-widest mt-4">Sin pagos en este período</p>
                    </div>
                  ) : mpPayments.map(p => {
                    const isOk = p.status === 'approved';
                    const isPending = p.status === 'pending' || p.status === 'in_process';
                    const statusColor = isOk ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                      : isPending ? 'text-amber-700 bg-amber-50 border-amber-200'
                                      : 'text-rose-700 bg-rose-50 border-rose-200';
                    const statusLabel = isOk ? 'Aprobado' : isPending ? 'Pendiente' : 'Rechazado';
                    const fecha = new Date(p.createdAt).toLocaleDateString('es-CL', { day:'2-digit', month:'short', year:'numeric' });
                    const hora  = new Date(p.createdAt).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' });
                    return (
                      <div key={p.id} className="px-5 md:px-8 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isOk ? 'bg-emerald-100' : isPending ? 'bg-amber-100' : 'bg-rose-100'}`}>
                            <span className={`material-icons-round text-lg ${isOk ? 'text-emerald-600' : isPending ? 'text-amber-600' : 'text-rose-500'}`}>
                              {isOk ? 'check_circle' : isPending ? 'schedule' : 'cancel'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-slate-900 text-sm truncate">{p.description || `Pago #${p.id}`}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                              {p.payerName || p.payerEmail || 'Pagador desconocido'} · {fecha} {hora}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${statusColor}`}>{statusLabel}</span>
                          <p className="font-black text-slate-900 text-base">${p.amount.toLocaleString('es-CL')}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="p-20 text-center">
                <span className="material-icons-round text-5xl text-slate-200">cloud_off</span>
                <p className="text-slate-400 font-black text-xs uppercase tracking-widest mt-4">No se pudo cargar. Verifica que MERCADOPAGO_ACCESS_TOKEN esté configurado en Vercel.</p>
              </div>
            )}
          </div>
          )} {/* end tab ventas */}

        </div>
      </main>
    </div>
  );
};

export default ProfessionalDashboard;
