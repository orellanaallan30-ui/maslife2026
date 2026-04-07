import React, { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { Transaction } from '../types';
import { useClinic } from '../ClinicContext';

interface BoletalEntry {
  id: string;
  date: string;
  totalBoleta: number;
  description: string;
  retencion: number;
  montoRecibido: number;
}

const Finances: React.FC = () => {
  const { appointments, manualTransactions, addManualTransaction, loggedPro } = useClinic();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBoletas, setShowBoletas] = useState(false);
  const [newTransaction, setNewTransaction] = useState({ amount: 0, description: '', type: 'Ingreso' as 'Ingreso' | 'Gasto' });
  const [boletas, setBoletas] = useState<BoletalEntry[]>([]);
  const [newBoleta, setNewBoleta] = useState({ totalBoleta: 0, description: '' });

  if (!loggedPro) return <Navigate to="/pro/login" />;

  const RETENCION_PERCENTAGE = 15.25; // 15.25% retención 2da categoría

  const allTransactions = useMemo(() => {
    const appointmentTrans: Transaction[] = appointments
      .filter(a => a.professionalId === loggedPro.id && a.status === 'Finalizado')
      .map(a => ({
        id: `app-${a.id}`,
        date: a.date,
        amount: a.price,
        description: `Consulta: ${a.patientName} - ${a.serviceName}`,
        type: 'Ingreso' as const
      }));
    
    return [...appointmentTrans, ...manualTransactions].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [appointments, manualTransactions, loggedPro.id]);

  const totals = useMemo(() => {
    const income = allTransactions.filter(t => t.type === 'Ingreso').reduce((sum, t) => sum + t.amount, 0);
    const expenses = allTransactions.filter(t => t.type === 'Gasto').reduce((sum, t) => sum + t.amount, 0);
    return { income, expenses, balance: income - expenses };
  }, [allTransactions]);

  const handleAddTransaction = () => {
    const transaction: Transaction = {
      id: `manual-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      amount: newTransaction.amount,
      description: newTransaction.description,
      type: newTransaction.type
    };
    addManualTransaction(transaction);
    setShowAddModal(false);
    setNewTransaction({ amount: 0, description: '', type: 'Ingreso' });
  };

  const handleAddBoleta = () => {
    if (newBoleta.totalBoleta <= 0) return;
    
    const retencion = (newBoleta.totalBoleta * RETENCION_PERCENTAGE) / 100;
    const montoRecibido = newBoleta.totalBoleta - retencion;
    
    const boleta: BoletalEntry = {
      id: `boleta-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      totalBoleta: newBoleta.totalBoleta,
      description: newBoleta.description || 'Boleta de honorarios',
      retencion,
      montoRecibido
    };
    
    setBoletas(prev => [boleta, ...prev]);
    setNewBoleta({ totalBoleta: 0, description: '' });
  };

  const exportToPDF = async () => {
    const doc = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Informe Financiero - ${loggedPro.name}</title>
  <style>
    @page { margin: 2cm; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      max-width: 210mm;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #14b8a6;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 { color: #14b8a6; margin: 0; font-size: 28px; }
    .header p { color: #64748b; margin: 5px 0 0 0; }
    .section { margin: 30px 0; }
    .section h2 {
      background: #f1f5f9;
      padding: 12px 16px;
      margin: 0 0 15px 0;
      border-left: 4px solid #14b8a6;
      font-size: 18px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 12px;
      text-align: left;
    }
    th {
      background: #f8fafc;
      font-weight: 700;
      color: #334155;
    }
    .total-box {
      background: #14b8a6;
      color: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      margin: 20px 0;
    }
    .total-box h3 { margin: 0 0 10px 0; font-size: 16px; opacity: 0.9; }
    .total-box .amount { font-size: 32px; font-weight: 900; }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e2e8f0;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
    }
    @media print {
      body { padding: 0; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Informe Financiero Profesional</h1>
    <p><strong>${loggedPro.name}</strong> | ${loggedPro.specialty}</p>
    <p>Generado: ${new Date().toLocaleDateString('es-CL', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric' 
    })}</p>
  </div>

  <div class="section">
    <h2>Resumen General</h2>
    <table>
      <tr>
        <th>Concepto</th>
        <th style="text-align: right;">Monto (CLP)</th>
      </tr>
      <tr>
        <td><strong>Total Ingresos</strong></td>
        <td style="text-align: right; color: #10b981; font-weight: bold;">$${totals.income.toLocaleString('es-CL')}</td>
      </tr>
      <tr>
        <td><strong>Total Gastos</strong></td>
        <td style="text-align: right; color: #ef4444; font-weight: bold;">$${totals.expenses.toLocaleString('es-CL')}</td>
      </tr>
      <tr style="background: #f8fafc;">
        <td><strong>Balance Neto</strong></td>
        <td style="text-align: right; font-weight: bold; font-size: 18px;">$${totals.balance.toLocaleString('es-CL')}</td>
      </tr>
    </table>
  </div>

  ${boletas.length > 0 ? `
  <div class="section">
    <h2>Boletas de Honorarios (Retención 15.25%)</h2>
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Descripción</th>
          <th style="text-align: right;">Boleta Total</th>
          <th style="text-align: right;">Retención (15.25%)</th>
          <th style="text-align: right;">Monto Recibido</th>
        </tr>
      </thead>
      <tbody>
        ${boletas.map(b => `
          <tr>
            <td>${new Date(b.date).toLocaleDateString('es-CL')}</td>
            <td>${b.description}</td>
            <td style="text-align: right;">$${b.totalBoleta.toLocaleString('es-CL')}</td>
            <td style="text-align: right; color: #ef4444;">-$${b.retencion.toLocaleString('es-CL')}</td>
            <td style="text-align: right; font-weight: bold;">$${b.montoRecibido.toLocaleString('es-CL')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="section">
    <h2>Detalle de Transacciones (Últimas 10)</h2>
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Descripción</th>
          <th>Tipo</th>
          <th style="text-align: right;">Monto</th>
        </tr>
      </thead>
      <tbody>
        ${allTransactions.slice(0, 10).map(t => `
          <tr>
            <td>${new Date(t.date).toLocaleDateString('es-CL')}</td>
            <td>${t.description}</td>
            <td><span style="color: ${t.type === 'Ingreso' ? '#10b981' : '#ef4444'}; font-weight: bold;">${t.type}</span></td>
            <td style="text-align: right; font-weight: bold;">$${t.amount.toLocaleString('es-CL')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <p>Plataforma Maslife · clinicamaslife.cl</p>
    <p>Este documento es un informe generado automáticamente y no constituye un comprobante tributario oficial.</p>
  </div>
</body>
</html>
    `.trim();

    const blob = new Blob([doc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `informe-financiero-${new Date().toISOString().split('T')[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 w-full h-full overflow-hidden bg-slate-50">
      <main className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight">Finanzas</h1>
              <p className="text-slate-500 font-bold mt-2 text-sm">Gestión de ingresos, gastos y boletas</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBoletas(!showBoletas)}
                className="px-6 py-3 bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-indigo-600 transition-all shadow-lg"
              >
                <span className="material-icons-round text-sm align-middle mr-2">receipt_long</span>
                {showBoletas ? 'Ocultar' : 'Calculadora'} Boletas
              </button>
              <button
                onClick={exportToPDF}
                className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-emerald-600 transition-all shadow-lg"
              >
                <span className="material-icons-round text-sm align-middle mr-2">download</span>
                Exportar PDF
              </button>
            </div>
          </div>

          {/* Resumen Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-8 rounded-3xl text-white shadow-2xl">
              <p className="text-sm font-bold opacity-90 uppercase tracking-wider mb-2">Total Ingresos</p>
              <p className="text-4xl font-black">${totals.income.toLocaleString('es-CL')}</p>
            </div>
            <div className="bg-gradient-to-br from-rose-500 to-pink-600 p-8 rounded-3xl text-white shadow-2xl">
              <p className="text-sm font-bold opacity-90 uppercase tracking-wider mb-2">Total Gastos</p>
              <p className="text-4xl font-black">${totals.expenses.toLocaleString('es-CL')}</p>
            </div>
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-8 rounded-3xl text-white shadow-2xl">
              <p className="text-sm font-bold opacity-90 uppercase tracking-wider mb-2">Balance</p>
              <p className="text-4xl font-black">${totals.balance.toLocaleString('es-CL')}</p>
            </div>
          </div>

          {/* Calculadora de Boletas */}
          {showBoletas && (
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-lg mb-10 animate-in slide-in-from-top duration-300">
              <h2 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3">
                <span className="material-icons-round text-indigo-500">calculate</span>
                Calculadora de Retención de Honorarios
              </h2>
              
              <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100 mb-6">
                <p className="text-sm text-indigo-900 font-bold">
                  <span className="material-icons-round text-sm align-middle mr-1">info</span>
                  Los honorarios de segunda categoría tienen una retención del <strong>15.25%</strong> que se descuenta del total de la boleta emitida.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Monto Total Boleta (CLP)</label>
                  <input
                    type="number"
                    value={newBoleta.totalBoleta || ''}
                    onChange={e => setNewBoleta({ ...newBoleta, totalBoleta: Number(e.target.value) })}
                    placeholder="Ej: 195000"
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-lg focus:border-indigo-500 transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Descripción</label>
                  <input
                    type="text"
                    value={newBoleta.description}
                    onChange={e => setNewBoleta({ ...newBoleta, description: e.target.value })}
                    placeholder="Ej: 10 sesiones de kinesiología"
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              {newBoleta.totalBoleta > 0 && (
                <div className="grid md:grid-cols-2 gap-6 mb-6">
                  <div className="bg-rose-50 rounded-2xl p-6 border border-rose-200">
                    <p className="text-xs font-black text-rose-700 uppercase tracking-wider mb-2">Retención al SII (15.25%)</p>
                    <p className="text-3xl font-black text-rose-600">
                      ${((newBoleta.totalBoleta * RETENCION_PERCENTAGE) / 100).toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-200">
                    <p className="text-xs font-black text-emerald-700 uppercase tracking-wider mb-2">Monto que Recibes</p>
                    <p className="text-3xl font-black text-emerald-600">
                      ${(newBoleta.totalBoleta - (newBoleta.totalBoleta * RETENCION_PERCENTAGE) / 100).toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={handleAddBoleta}
                disabled={newBoleta.totalBoleta <= 0}
                className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-black text-sm hover:bg-indigo-600 disabled:opacity-50 transition-all shadow-lg"
              >
                Registrar Boleta
              </button>

              {/* Lista de Boletas Registradas */}
              {boletas.length > 0 && (
                <div className="mt-8 border-t border-slate-200 pt-6">
                  <h3 className="text-lg font-black text-slate-900 mb-4">Boletas Registradas</h3>
                  <div className="space-y-3">
                    {boletas.map(boleta => (
                      <div key={boleta.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-bold text-slate-900">{boleta.description}</p>
                            <p className="text-xs text-slate-500 font-medium">{new Date(boleta.date).toLocaleDateString('es-CL')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-slate-600 font-bold">Boleta: ${boleta.totalBoleta.toLocaleString('es-CL')}</p>
                            <p className="text-xs text-rose-600 font-bold">Retención: -${boleta.retencion.toLocaleString('es-CL')}</p>
                            <p className="text-lg text-emerald-600 font-black">Recibes: ${boleta.montoRecibido.toLocaleString('es-CL')}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Transacciones */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-2xl font-black text-slate-900">Historial de Transacciones</h2>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-6 py-3 bg-teal-500 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-teal-600 transition-all shadow-lg"
              >
                <span className="material-icons-round text-sm align-middle mr-2">add</span>
                Nueva Transacción
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {allTransactions.map(transaction => (
                <div key={transaction.id} className="p-6 hover:bg-slate-50 transition-colors flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                      transaction.type === 'Ingreso' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                    }`}>
                      <span className="material-icons-round">{transaction.type === 'Ingreso' ? 'arrow_downward' : 'arrow_upward'}</span>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{transaction.description}</p>
                      <p className="text-xs text-slate-500 font-medium">{new Date(transaction.date).toLocaleDateString('es-CL')}</p>
                    </div>
                  </div>
                  <p className={`text-xl font-black ${transaction.type === 'Ingreso' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {transaction.type === 'Ingreso' ? '+' : '-'}${transaction.amount.toLocaleString('es-CL')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Modal Agregar Transacción */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl">
            <h3 className="text-2xl font-black text-slate-900 mb-6">Nueva Transacción Manual</h3>
            
            <div className="space-y-6">
              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Tipo</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setNewTransaction({ ...newTransaction, type: 'Ingreso' })}
                    className={`py-3 rounded-xl font-black text-sm transition-all ${
                      newTransaction.type === 'Ingreso' 
                        ? 'bg-emerald-500 text-white shadow-lg' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Ingreso
                  </button>
                  <button
                    onClick={() => setNewTransaction({ ...newTransaction, type: 'Gasto' })}
                    className={`py-3 rounded-xl font-black text-sm transition-all ${
                      newTransaction.type === 'Gasto' 
                        ? 'bg-rose-500 text-white shadow-lg' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Gasto
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Monto (CLP)</label>
                <input
                  type="number"
                  value={newTransaction.amount || ''}
                  onChange={e => setNewTransaction({ ...newTransaction, amount: Number(e.target.value) })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-lg focus:border-teal-500 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Descripción</label>
                <input
                  type="text"
                  value={newTransaction.description}
                  onChange={e => setNewTransaction({ ...newTransaction, description: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddTransaction}
                  disabled={!newTransaction.amount || !newTransaction.description}
                  className="flex-1 py-3 bg-teal-500 text-white rounded-xl font-black hover:bg-teal-600 disabled:opacity-50 transition-all shadow-lg"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Finances;
