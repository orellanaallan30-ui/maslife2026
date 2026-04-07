import React from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Appointment } from '../types';
import { useClinic } from '../ClinicContext';

const ProfessionalDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { appointments, manualTransactions, loggedPro } = useClinic();

  if (!loggedPro) return <Navigate to="/pro/login" />;

  const isPaused = loggedPro.subscriptionStatus === 'paused';
  const MP_SUBSCRIPTION_LINK = "https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=7e9fa964bb6d4ecd89058685ba8a5b34";

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
            <a href={MP_SUBSCRIPTION_LINK} target="_blank" rel="noreferrer" className="w-full py-6 bg-primary text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-2xl shadow-primary/20 flex items-center justify-center gap-3 transition-all hover:scale-[1.02]">
              PAGAR SUSCRIPCIÓN <span className="material-icons-round">payment</span>
            </a>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-6 md:p-10 bg-slate-50/50 custom-scrollbar">
        <div className="max-w-6xl mx-auto">
          <div className="mb-10 text-center md:text-left">
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-950 leading-tight">Hola, {loggedPro.name}</h1>
            <p className="text-primary font-black text-xs uppercase tracking-[0.4em] mt-3 opacity-80">Panel de Control Clínico</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-[0_20px_40px_-15px_rgba(19,91,236,0.05)] transition-all transform hover:-translate-y-2 hover:shadow-2xl group flex flex-col justify-between">
              <div className="flex items-center justify-between mb-8 text-slate-400 group-hover:text-primary transition-colors">
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

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-[0_20px_40px_-15px_rgba(19,91,236,0.05)] transition-all transform hover:-translate-y-2 hover:shadow-2xl group flex flex-col justify-between">
              <div className="flex items-center justify-between mb-8 text-slate-400 group-hover:text-primary transition-colors">
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

            <div className="bg-primary p-8 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(19,91,236,0.4)] border-b-8 border-blue-700 text-white cursor-pointer group relative overflow-hidden transform transition-all hover:-translate-y-2 hover:shadow-primary/60 active:border-b-0 active:translate-y-2" onClick={() => navigate('/pro/settings')}>
              <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                  <span className="text-white/80 font-black text-[10px] uppercase tracking-[0.3em] block mb-2">Agenda Maslife</span>
                  <h3 className="text-2xl font-black tracking-tight mb-4 uppercase drop-shadow-md">{loggedPro.subscriptionStatus}</h3>
                </div>
                <div className="bg-white/20 p-4 rounded-2xl border border-white/30 backdrop-blur-md inline-block group-hover:bg-white group-hover:text-primary transition-colors shadow-lg self-start">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em]">Configurar Plan</p>
                </div>
              </div>
              <span className="material-icons absolute -bottom-6 -right-6 text-[160px] opacity-10 group-hover:rotate-12 group-hover:scale-110 transition-transform duration-500">lock_clock</span>
            </div>
          </div>

          <div className="bg-white rounded-[3rem] border border-slate-100 shadow-[0_48px_100px_-20px_rgba(19,91,236,0.1)] overflow-hidden">
            <div className="p-8 md:p-10 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6 bg-slate-50/30">
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
                  <div key={i} className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 hover:bg-slate-50/50 transition-colors cursor-pointer group" onClick={() => p.patientId ? navigate(`/pro/session/${p.patientId}`) : alert('Cita sin paciente asociado')}>
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
        </div>
      </main>
    </div>
  );
};

export default ProfessionalDashboard;
