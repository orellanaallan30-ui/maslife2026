import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Appointment, Transaction } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useClinic } from '../ClinicContext';

const Finances: React.FC = () => {
  const navigate = useNavigate();
  const { appointments, manualTransactions, deleteAppointment, deleteTransaction, setManualTransactions, logout } = useClinic();

  const onAddTransaction = (t: Transaction) => setManualTransactions(prev => [...prev, t]);
  const onDeleteTransaction = (id: string) => setManualTransactions(prev => prev.filter(item => item.id !== id));
  const onReset = async () => {
    // Delete each appointment and manual transaction from Supabase so they don't come back on refresh
    await Promise.all([
      ...appointments.map(a => deleteAppointment(a.id)),
      ...manualTransactions.map(t => deleteTransaction(t.id))
    ]);
  };
  const onLogout = () => logout(navigate, 'PROFESSIONAL');
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

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
    <div className="flex-1 w-full overflow-hidden">
      <main className="flex-1 overflow-y-auto bg-slate-50 custom-scrollbar p-6 md:p-10">
        <div className="max-w-[1400px] mx-auto space-y-10">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <p className="text-xs font-black text-teal-600 uppercase tracking-[0.2em] mb-1">AgendaMaslife Finanzas</p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Balance de Gestión Clínica</h1>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => setShowManualModal(true)}
                className="bg-primary text-white px-8 py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest border-b-4 border-blue-700 active:border-b-0 active:translate-y-1 hover:brightness-110 flex items-center gap-3 transition-all shadow-[0_10px_30px_-10px_rgba(19,91,236,0.6)]"
              >
                <span className="material-icons-round text-lg">add_circle</span>
                NUEVO REGISTRO
              </button>
              <button
                onClick={() => setShowConfirmReset(true)}
                className="bg-white border-b-4 border-slate-200 text-rose-500 px-8 py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 hover:border-rose-300 active:border-b-0 active:translate-y-1 flex items-center gap-2 transition-all shadow-sm"
              >
                <span className="material-icons-round text-sm">history_toggle_off</span>
                REINICIAR
              </button>
              <button onClick={() => window.print()} className="bg-teal-500 text-white px-8 py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest border-b-4 border-teal-700 active:border-b-0 active:translate-y-1 shadow-[0_10px_30px_-10px_rgba(20,184,166,0.6)] hover:brightness-110 flex items-center gap-3 transition-all">
                <span className="material-icons-round text-sm">download</span>
                INFORME
              </button>
            </div>
          </header>

          {/* CABECERA EXCLUSIVA PARA IMPRESIÓN */}
          <div className="hidden print:block mb-10 border-b-4 border-teal-500 pb-6">
            <div className="flex justify-between items-end">
              <div>
                <h1 className="text-4xl font-black text-slate-900 mb-2">REPORTE FINANCIERO CLÍNICO</h1>
                <p className="text-teal-600 font-black tracking-widest uppercase text-sm">MasLife 🧡 Gestión de Balance</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Fecha de Generación</p>
                <p className="text-lg font-black">{new Date().toLocaleDateString('es-CL')}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: 'Balance Neto', val: `$${netBalance.toLocaleString('es-CL')}`, grow: 'Saldo Final', icon: 'account_balance', color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { label: 'Ingresos Totales', val: `$${totalIncome.toLocaleString('es-CL')}`, grow: 'Citas + Otros', icon: 'trending_up', color: 'text-teal-600', bg: 'bg-teal-50' },
              { label: 'Gastos Registrados', val: `$${expensesManual.toLocaleString('es-CL')}`, grow: 'Egresos', icon: 'trending_down', color: 'text-rose-500', bg: 'bg-rose-50' },
              { label: 'Ticket Promedio', val: `$${ticketPromedio.toLocaleString('es-CL')}`, grow: 'Eficiencia', icon: 'analytics', color: 'text-amber-500', bg: 'bg-amber-50' },
            ].map((stat, i) => (
              <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-[0_20px_40px_-15px_rgba(19,91,236,0.05)] hover:-translate-y-1 hover:shadow-xl transition-all">
                <div className="flex items-center justify-between mb-8">
                  <div className={`w-16 h-16 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center shadow-sm`}>
                    <span className="material-icons-round text-4xl">{stat.icon}</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-slate-50 text-slate-500 border border-slate-100 shadow-inner">
                    {stat.grow}
                  </span>
                </div>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{stat.label}</p>
                <h3 className="text-3xl font-black mt-2 tracking-tight text-slate-900">{stat.val}</h3>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Se añade min-h-[400px] para asegurar que Recharts detecte altura siempre */}
            <div className="lg:col-span-8 bg-white p-10 md:p-12 rounded-[3rem] border border-slate-100 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] relative overflow-hidden min-h-[450px]">
              <div className="flex items-center justify-between mb-12">
                <div>
                  <h3 className="font-black text-2xl tracking-tight text-slate-900">Actividad Económica</h3>
                  <p className="text-sm text-slate-500 font-medium">Historial consolidado de la red</p>
                </div>
              </div>
              <div className="h-80 w-full min-h-[320px]">
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

            <div className="lg:col-span-4 bg-white p-10 md:p-12 rounded-[3rem] border border-slate-100 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] flex flex-col">
              <h3 className="text-lg font-black tracking-tight mb-8 text-slate-900">Últimos Movimientos</h3>
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

        {/* MODAL: REGISTRO MANUAL (INGRESO O GASTO) */}
        {showManualModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-300">
              <div className={`p-10 ${newManual.type === 'Ingreso' ? 'bg-primary' : 'bg-rose-500'} text-white`}>
                <div className="flex justify-between items-center mb-8">
                  <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center shadow-sm backdrop-blur-md">
                    <span className="material-icons-round text-3xl">{newManual.type === 'Ingreso' ? 'paid' : 'receipt'}</span>
                  </div>
                  <button onClick={() => setShowManualModal(false)} className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 transition-all active:scale-95 flex items-center justify-center">
                    <span className="material-icons-round">close</span>
                  </button>
                </div>
                <h3 className="text-3xl font-black tracking-tight mb-2">Registro de {newManual.type}</h3>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mt-1">Gestión directa de flujos de caja</p>
              </div>

              <form onSubmit={handleAddManualEntry} className="p-10 space-y-6">
                <div className="flex bg-slate-50/80 shadow-inner p-2 rounded-2xl border border-slate-200 gap-2 mb-8">
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

                <button type="submit" className={`w-full py-5 ${newManual.type === 'Ingreso' ? 'bg-slate-900 border-b-4 border-black' : 'bg-rose-600 border-b-4 border-rose-800'} text-white rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] active:border-b-0 active:translate-y-1 transition-all mt-8`}>
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
              <h3 className="text-xl font-black text-slate-900 text-center mb-2">¿Reiniciar Historial Clínico?</h3>
              <p className="text-slate-500 text-sm text-center mb-10 leading-relaxed font-medium">Esta acción eliminará todas las citas registradas y los ingresos/gastos manuales digitados. No se puede deshacer.</p>
              <div className="flex gap-4">
                <button onClick={() => setShowConfirmReset(false)} className="flex-1 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">Cancelar</button>
                <button
                  onClick={() => { onReset(); setShowConfirmReset(false); }}
                  className="flex-1 py-4 bg-rose-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-rose-600/20 transition-all hover:bg-rose-700"
                >REINICIAR TODO</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Finances;
