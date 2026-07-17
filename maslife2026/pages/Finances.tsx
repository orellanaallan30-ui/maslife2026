import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Appointment, Transaction } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useClinic } from '../ClinicContext';
import { supabase } from '../supabaseService';

interface MPPayment {
  id: number; status: string; amount: number; description: string;
  externalRef: string; payerEmail: string | null; payerName: string | null;
  createdAt: string; approvedAt: string | null;
}
interface MPSummary {
  approvedCount: number; approvedAmount: number;
  pendingCount: number;  pendingAmount: number;
  rejectedCount: number; days: number;
}

const Finances: React.FC = () => {
  const navigate = useNavigate();
  const { appointments: allAppointments, manualTransactions: allTransactions, deleteAppointment, addManualTransaction, deleteManualTransaction, logout, loggedPro } = useClinic();

  // Solo mostrar datos financieros de este profesional
  const appointments = allAppointments.filter(a => !a.professionalId || a.professionalId === loggedPro?.id);
  const manualTransactions = allTransactions.filter(t => !t.professionalId || t.professionalId === loggedPro?.id);

  // Persisten en Supabase con notificación si falla (nunca solo en este dispositivo)
  const onAddTransaction = (t: Transaction) => addManualTransaction(t);
  const onDeleteTransaction = (id: string) => deleteManualTransaction(id);
  const onReset = async () => {
    // Reinicia SOLO los ingresos/gastos manuales digitados aquí. NUNCA toca las
    // citas: son la agenda clínica (borrarlas dejaba a pacientes sin cita y liberaba
    // horarios para doble reserva). Las citas se gestionan desde la Agenda.
    manualTransactions.forEach(t => deleteManualTransaction(t.id));
  };
  const onLogout = () => logout(navigate, 'PROFESSIONAL');
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  // ── Panel de Ventas MercadoPago ──
  const [mpExpanded, setMpExpanded]     = useState(false);
  const [mpPayments, setMpPayments]     = useState<MPPayment[]>([]);
  const [mpSummary, setMpSummary]       = useState<MPSummary | null>(null);
  const [mpLoading, setMpLoading]       = useState(false);
  const [mpRange, setMpRange]           = useState<'7' | '30' | '90'>('30');
  const [mpLoaded, setMpLoaded]         = useState(false);
  const [mpNotConnected, setMpNotConnected] = useState(false);

  useEffect(() => {
    if (!mpExpanded || mpLoaded || !loggedPro?.id) return;
    setMpLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      fetch(`/api/mp-payments?range=${mpRange}&limit=100&professional_id=${loggedPro.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.json())
        .then(data => {
          if (data.error === 'MP_NOT_CONNECTED') { setMpNotConnected(true); return; }
          if (data.payments) { setMpPayments(data.payments); setMpSummary(data.summary); setMpLoaded(true); }
        })
        .catch(() => {})
        .finally(() => setMpLoading(false));
    });
  }, [mpExpanded, mpRange, mpLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadMP = (range: '7' | '30' | '90') => { setMpRange(range); setMpLoaded(false); setMpNotConnected(false); };

  const [newManual, setNewManual] = useState({
    amount: '',
    description: '',
    date: new Date().toLocaleDateString('en-CA'), // Formato YYYY-MM-DD usando la zona horaria local
    type: 'Ingreso' as 'Ingreso' | 'Gasto'
  });

  // Cálculos consolidados
  const incomeFromApps = appointments
    .filter(a => a.paymentStatus === 'Pagado')
    .reduce((acc, curr) => acc + curr.price, 0);

  const incomeManual = manualTransactions
    .filter(t => t.type === 'Ingreso')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const expensesManual = manualTransactions
    .filter(t => t.type === 'Gasto')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalIncome = incomeFromApps + incomeManual;
  const netBalance = totalIncome - expensesManual;

  const totalItems = appointments.length + manualTransactions.length;
  const ticketPromedio = totalItems > 0 ? totalIncome / totalItems : 0;

  // Gráfico dinámico - Se asegura que siempre haya al menos dos puntos para evitar errores de renderizado
  const incomeData = [
    { name: 'Inicio', income: 0 },
    { name: 'Actual', income: netBalance }
  ];

  const handleAddManualEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newManual.amount || !newManual.description) return;

    const entry: Transaction = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9),
      amount: Number(newManual.amount),
      description: newManual.description,
      date: newManual.date,
      type: newManual.type
    };

    onAddTransaction(entry);
    setShowManualModal(false);
    setNewManual({ amount: '', description: '', date: new Date().toLocaleDateString('en-CA'), type: 'Ingreso' });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full">
      <main className="flex-1 min-h-0 overflow-y-auto bg-slate-50 custom-scrollbar p-4 md:p-10 pb-24 md:pb-10">
        <div className="max-w-[1400px] mx-auto space-y-4 md:space-y-10">
          <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-6">
            <div>
              <p className="text-[10px] font-black text-teal-600 uppercase tracking-[0.2em] mb-0.5">Agenda Maslife Finanzas</p>
              <h1 className="text-xl md:text-3xl font-black tracking-tight text-slate-900">Balance de Gestión Clínica</h1>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              <button
                onClick={() => setShowManualModal(true)}
                className="flex-1 md:flex-none bg-primary text-white px-4 md:px-8 py-3 md:py-5 rounded-xl md:rounded-2xl font-black text-[10px] uppercase tracking-widest border-b-4 border-blue-700 active:border-b-0 active:translate-y-1 hover:brightness-110 flex items-center justify-center gap-2 transition-all shadow-cta"
              >
                <span className="material-icons-round text-base">add_circle</span>
                <span>NUEVO REGISTRO</span>
              </button>
              <button
                onClick={() => setShowConfirmReset(true)}
                className="bg-white border-b-4 border-slate-200 text-rose-500 px-3 md:px-8 py-3 md:py-5 rounded-xl md:rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 hover:border-rose-300 active:border-b-0 active:translate-y-1 flex items-center gap-1.5 transition-all shadow-sm"
              >
                <span className="material-icons-round text-sm">history_toggle_off</span>
                <span className="hidden md:inline">REINICIAR</span>
              </button>
              <button onClick={() => window.print()} className="bg-teal-500 text-white px-3 md:px-8 py-3 md:py-5 rounded-xl md:rounded-2xl font-black text-[10px] uppercase tracking-widest border-b-4 border-teal-700 active:border-b-0 active:translate-y-1 shadow-teal-500/60 hover:brightness-110 flex items-center gap-1.5 transition-all">
                <span className="material-icons-round text-sm">download</span>
                <span className="hidden md:inline">INFORME</span>
              </button>
            </div>
          </header>

          {/* CABECERA EXCLUSIVA PARA IMPRESIÓN */}
          <div className="hidden print:block mb-10 border-b-4 border-teal-500 pb-6">
            <div className="flex justify-between items-end">
              <div>
                <h1 className="text-4xl font-black text-slate-900 mb-2">REPORTE FINANCIERO CLÍNICO</h1>
                <p className="text-teal-600 font-black tracking-widest uppercase text-sm">Agenda Maslife 🧡 Gestión de Balance</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Fecha de Generación</p>
                <p className="text-lg font-black">{new Date().toLocaleDateString('es-CL')}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
            {[
              { label: 'Balance Neto', val: `$${netBalance.toLocaleString('es-CL')}`, grow: 'Saldo Final', icon: 'account_balance', color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { label: 'Ingresos Totales', val: `$${totalIncome.toLocaleString('es-CL')}`, grow: 'Citas + Otros', icon: 'trending_up', color: 'text-teal-600', bg: 'bg-teal-50' },
              { label: 'Gastos Registrados', val: `$${expensesManual.toLocaleString('es-CL')}`, grow: 'Egresos', icon: 'trending_down', color: 'text-rose-500', bg: 'bg-rose-50' },
              { label: 'Ticket Promedio', val: `$${ticketPromedio.toLocaleString('es-CL')}`, grow: 'Eficiencia', icon: 'analytics', color: 'text-amber-500', bg: 'bg-amber-50' },
            ].map((stat, i) => (
              <div key={i} className="bg-white p-4 md:p-8 rounded-2xl md:rounded-blob-lg border border-slate-100 shadow-sm hover:-translate-y-1 hover:shadow-xl transition-all">
                <div className="flex items-center justify-between mb-3 md:mb-8">
                  <div className={`w-10 h-10 md:w-16 md:h-16 ${stat.bg} ${stat.color} rounded-xl md:rounded-2xl flex items-center justify-center shadow-sm`}>
                    <span className="material-icons-round text-2xl md:text-4xl">{stat.icon}</span>
                  </div>
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-slate-50 text-slate-500 border border-slate-100 shadow-inner">
                    {stat.grow}
                  </span>
                </div>
                <p className="text-slate-400 text-[9px] md:text-[10px] font-black uppercase tracking-widest">{stat.label}</p>
                <h3 className="text-xl md:text-3xl font-black mt-1 md:mt-2 tracking-tight text-slate-900">{stat.val}</h3>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-10">
            {/* Se añade min-h para asegurar que Recharts detecte altura siempre */}
            <div className="lg:col-span-8 bg-white p-5 md:p-12 rounded-2xl md:rounded-blob-xl border border-slate-100 shadow-sm md:shadow-card-ambient relative overflow-hidden min-h-[280px] md:min-h-[450px]">
              <div className="flex items-center justify-between mb-5 md:mb-12">
                <div>
                  <h3 className="font-black text-lg md:text-2xl tracking-tight text-slate-900">Actividad Económica</h3>
                  <p className="text-xs md:text-sm text-slate-500 font-medium">Historial consolidado de la red</p>
                </div>
              </div>
              <div className="h-48 md:h-80 w-full min-h-[180px] md:min-h-[320px]">
                {/* minWidth 0 ayuda a evitar el error de ancho -1 en layouts de grid/flex */}
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={incomeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00a89e" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#00a89e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ borderRadius: '1.5rem', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
                      cursor={{ stroke: '#00a89e', strokeWidth: 2 }}
                    />
                    <Area type="monotone" dataKey="income" stroke="#00a89e" strokeWidth={5} fillOpacity={1} fill="url(#colorIncome)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-4 bg-white p-5 md:p-12 rounded-2xl md:rounded-blob-xl border border-slate-100 shadow-sm md:shadow-card-ambient flex flex-col">
              <h3 className="text-base md:text-lg font-black tracking-tight mb-4 md:mb-8 text-slate-900">Últimos Movimientos</h3>
              <div className="flex-1 space-y-4 overflow-y-auto max-h-[350px] custom-scrollbar pr-2">
                {manualTransactions.length === 0 && appointments.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 italic py-10">
                    <span className="material-icons-round text-4xl mb-2">inbox</span>
                    <p className="text-xs font-bold uppercase">Sin movimientos</p>
                  </div>
                )}
                {manualTransactions.slice().reverse().map(t => (
                  <div key={t.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group hover:bg-white hover:shadow-md transition-all relative">
                    <div>
                      <p className={`text-xs font-black ${t.type === 'Ingreso' ? 'text-indigo-600' : 'text-rose-500'} uppercase tracking-widest mb-0.5`}>{t.type}</p>
                      <p className="text-sm font-black text-slate-800 truncate max-w-[140px]">{t.description}</p>
                      <p className="text-xs font-bold text-slate-500">{t.date}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-black ${t.type === 'Ingreso' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {t.type === 'Ingreso' ? '+' : '-'} ${t.amount.toLocaleString('es-CL')}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteTransaction(t.id); }}
                        className="opacity-0 group-hover:opacity-100 p-2 rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-all absolute right-2 bg-white/80 backdrop-blur-sm"
                        title="Eliminar registro"
                      >
                        <span className="material-icons-round text-sm">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
                {appointments.filter(a => a.paymentStatus === 'Pagado').slice(-5).map(a => (
                  <div key={a.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group hover:bg-white hover:shadow-md transition-all">
                    <div>
                      <p className="text-xs font-black text-primary uppercase tracking-widest mb-0.5">CITA MÉDICA</p>
                      <p className="text-sm font-black text-slate-800 truncate max-w-[140px]">{a.patientName}</p>
                      <p className="text-xs font-bold text-slate-500">{a.date}</p>
                    </div>
                    <span className="text-sm font-black text-emerald-600">+ ${a.price.toLocaleString('es-CL')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── PANEL VENTAS MERCADOPAGO (colapsable, por profesional) ── */}
        <div>
          <button
            onClick={() => setMpExpanded(!mpExpanded)}
            className={`w-full flex items-center justify-between px-4 md:px-6 py-3 md:py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all ${mpExpanded ? 'bg-[#009ee3] text-white shadow-lg shadow-[#009ee3]/30' : 'bg-white text-slate-600 border border-slate-200 hover:border-[#009ee3]'}`}
          >
            <span className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0"><path d="M12 0C5.374 0 0 5.373 0 12c0 6.628 5.374 12 12 12 6.628 0 12-5.372 12-12C24 5.373 18.628 0 12 0zm5.49 8.444l-2.18 9.778a.42.42 0 01-.41.322h-1.638a.42.42 0 01-.418-.322l-1.084-4.626-1.083 4.626a.42.42 0 01-.418.322H8.62a.42.42 0 01-.41-.322L5.98 8.444a.42.42 0 01.41-.516h1.638c.2 0 .373.139.41.335l1.196 5.692 1.192-5.692a.42.42 0 01.41-.335h1.527c.2 0 .373.139.41.335l1.192 5.692 1.196-5.692a.42.42 0 01.41-.335h1.519a.42.42 0 01.41.516z"/></svg>
              Ventas MercadoPago
            </span>
            <span className="material-icons-round text-lg">{mpExpanded ? 'expand_less' : 'expand_more'}</span>
          </button>

          {mpExpanded && (
            <div className="mt-3 bg-white rounded-3xl md:rounded-blob-xl border border-slate-100 shadow-[0_48px_100px_-20px_rgba(0,158,227,0.12)] overflow-hidden">
              {/* Header */}
              <div className="p-5 md:p-8 border-b border-slate-50 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-gradient-to-r from-[#009ee3]/5 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#009ee3] flex items-center justify-center shadow-lg shadow-[#009ee3]/30">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M12 0C5.374 0 0 5.373 0 12c0 6.628 5.374 12 12 12 6.628 0 12-5.372 12-12C24 5.373 18.628 0 12 0zm5.49 8.444l-2.18 9.778a.42.42 0 01-.41.322h-1.638a.42.42 0 01-.418-.322l-1.084-4.626-1.083 4.626a.42.42 0 01-.418.322H8.62a.42.42 0 01-.41-.322L5.98 8.444a.42.42 0 01.41-.516h1.638c.2 0 .373.139.41.335l1.196 5.692 1.192-5.692a.42.42 0 01.41-.335h1.527c.2 0 .373.139.41.335l1.192 5.692 1.196-5.692a.42.42 0 01.41-.335h1.519a.42.42 0 01.41.516z"/></svg>
                  </div>
                  <div>
                    <h2 className="font-black text-xl text-slate-900 tracking-tight">Panel de Ventas</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">MercadoPago · Pagos en línea</p>
                  </div>
                </div>
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
                <div className="p-16 text-center">
                  <span className="material-icons-round text-5xl text-[#009ee3] animate-spin">sync</span>
                  <p className="text-slate-400 font-black text-xs uppercase tracking-widest mt-4">Cargando pagos...</p>
                </div>
              ) : mpNotConnected ? (
                <div className="p-16 text-center">
                  <span className="material-icons-round text-5xl text-slate-200 block mb-4">account_balance_wallet</span>
                  <p className="text-slate-700 font-black text-sm mb-2">No tienes MercadoPago conectado</p>
                  <p className="text-slate-400 font-bold text-xs max-w-xs mx-auto">Conecta tu cuenta de MercadoPago desde Ajustes para ver tus pagos en línea aquí.</p>
                </div>
              ) : mpSummary ? (
                <>
                  <div className="grid grid-cols-3 gap-3 md:gap-4 p-5 md:p-8 border-b border-slate-50">
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
                  <div className="divide-y divide-slate-50">
                    {mpPayments.length === 0 ? (
                      <div className="p-16 text-center">
                        <span className="material-icons-round text-5xl text-slate-200">payments</span>
                        <p className="text-slate-400 font-black text-xs uppercase tracking-widest mt-4">Sin pagos en este período</p>
                      </div>
                    ) : mpPayments.map(p => {
                      const isOk = p.status === 'approved';
                      const isPend = p.status === 'pending' || p.status === 'in_process';
                      const statusColor = isOk ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                        : isPend ? 'text-amber-700 bg-amber-50 border-amber-200'
                                        : 'text-rose-700 bg-rose-50 border-rose-200';
                      const statusLabel = isOk ? 'Aprobado' : isPend ? 'Pendiente' : 'Rechazado';
                      const fecha = new Date(p.createdAt).toLocaleDateString('es-CL', { day:'2-digit', month:'short', year:'numeric' });
                      const hora  = new Date(p.createdAt).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' });
                      return (
                        <div key={p.id} className="px-5 md:px-8 py-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isOk ? 'bg-emerald-100' : isPend ? 'bg-amber-100' : 'bg-rose-100'}`}>
                              <span className={`material-icons-round text-lg ${isOk ? 'text-emerald-600' : isPend ? 'text-amber-600' : 'text-rose-500'}`}>
                                {isOk ? 'check_circle' : isPend ? 'schedule' : 'cancel'}
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
                <div className="p-16 text-center">
                  <span className="material-icons-round text-5xl text-slate-200">cloud_off</span>
                  <p className="text-slate-400 font-black text-xs uppercase tracking-widest mt-4">No se pudo cargar los pagos</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL: REGISTRO MANUAL (INGRESO O GASTO) */}
        {showManualModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <div className="bg-white w-full max-w-lg rounded-blob-lg shadow-modal border border-slate-100 overflow-hidden max-h-[92dvh] flex flex-col animate-in zoom-in-95 duration-300">
              <div className={`p-6 lg:p-10 shrink-0 ${newManual.type === 'Ingreso' ? 'bg-primary' : 'bg-rose-500'} text-white`}>
                <div className="flex justify-between items-center mb-4 lg:mb-8">
                  <div className="w-12 h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 flex items-center justify-center shadow-sm backdrop-blur-md">
                    <span className="material-icons-round text-2xl lg:text-3xl">{newManual.type === 'Ingreso' ? 'paid' : 'receipt'}</span>
                  </div>
                  <button onClick={() => setShowManualModal(false)} className="w-11 h-11 rounded-2xl bg-white/10 hover:bg-white/20 transition-all active:scale-95 flex items-center justify-center">
                    <span className="material-icons-round">close</span>
                  </button>
                </div>
                <h3 className="text-2xl lg:text-3xl font-black tracking-tight mb-1">Registro de {newManual.type}</h3>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Gestión directa de flujos de caja</p>
              </div>

              <form onSubmit={handleAddManualEntry} className="p-6 lg:p-10 space-y-4 lg:space-y-6 overflow-y-auto flex-1">
                <div className="flex bg-slate-50/80 shadow-inner p-2 rounded-2xl border border-slate-200 gap-2 mb-4 lg:mb-8">
                  <button
                    type="button"
                    onClick={() => setNewManual({ ...newManual, type: 'Ingreso' })}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${newManual.type === 'Ingreso' ? 'bg-white text-primary shadow-sm border border-slate-100' : 'text-slate-500 hover:bg-white/50'}`}
                  >Ingreso</button>
                  <button
                    type="button"
                    onClick={() => setNewManual({ ...newManual, type: 'Gasto' })}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${newManual.type === 'Gasto' ? 'bg-white text-rose-500 shadow-sm border border-slate-100' : 'text-slate-500 hover:bg-white/50'}`}
                  >Gasto</button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Monto ($)</label>
                  <input
                    required
                    type="number"
                    value={newManual.amount}
                    onChange={e => setNewManual({ ...newManual, amount: e.target.value })}
                    className={`w-full bg-slate-50/80 border border-slate-200 rounded-2xl py-4 px-6 font-black text-2xl ${newManual.type === 'Ingreso' ? 'text-primary' : 'text-rose-500'} focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner`}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Descripción / Concepto</label>
                  <input
                    required
                    value={newManual.description}
                    onChange={e => setNewManual({ ...newManual, description: e.target.value })}
                    className="w-full bg-slate-50/80 border border-slate-200 rounded-2xl py-4 px-6 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner placeholder:text-slate-400"
                    placeholder="Ej: Insumos médicos, Pago arriendo, Bono..."
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha</label>
                  <input
                    required
                    type="date"
                    value={newManual.date}
                    onChange={e => setNewManual({ ...newManual, date: e.target.value })}
                    className="w-full bg-slate-50/80 border border-slate-200 rounded-2xl py-4 px-6 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner text-slate-600"
                  />
                </div>

                <button type="submit" className={`w-full py-4 lg:py-5 ${newManual.type === 'Ingreso' ? 'bg-slate-900 border-b-4 border-black' : 'bg-rose-600 border-b-4 border-rose-800'} text-white rounded-blob-md font-black text-[10px] uppercase tracking-[0.2em] shadow-pop active:border-b-0 active:translate-y-1 transition-all mt-4 lg:mt-8`}>
                  CONFIRMAR REGISTRO
                </button>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: REINICIAR */}
        {showConfirmReset && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl animate-in zoom-in-95">
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="material-icons-round text-3xl">warning</span>
              </div>
              <h3 className="text-xl font-black text-slate-900 text-center mb-2">¿Reiniciar ingresos y gastos manuales?</h3>
              <p className="text-slate-500 text-sm text-center mb-10 leading-relaxed font-medium">Se eliminarán solo los ingresos y gastos que digitaste manualmente en Finanzas. <strong>Tus citas y tu agenda NO se tocan.</strong> Esta acción no se puede deshacer.</p>
              <div className="flex gap-4">
                <button onClick={() => setShowConfirmReset(false)} className="flex-1 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">Cancelar</button>
                <button
                  onClick={() => { onReset(); setShowConfirmReset(false); }}
                  className="flex-1 py-4 bg-rose-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-rose-600/20 transition-all hover:bg-rose-700"
                >REINICIAR</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Finances;
