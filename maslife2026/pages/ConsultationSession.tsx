import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { askClaude } from '../lib/claudeHelper';
import { Vitals } from '../types';
import { useClinic } from '../ClinicContext';

// Removed AI Chat Message Interface

const ConsultationSession: React.FC = () => {
  const { logout } = useClinic();
  const navigate = useNavigate();
  const { id } = useParams();
  const [isProcessing, setIsProcessing] = useState(false);

  const [vitals, setVitals] = useState<Partial<Vitals>>({
    systolic: 120,
    diastolic: 80,
    heartRate: 72,
    oxygenSaturation: 98
  });

  const [soapData, setSoapData] = useState({
    subjective: '',
    objective: '',
    assessment: '',
    plan: ''
  });



  return (
    <div className="flex flex-col w-full h-full bg-slate-900 overflow-hidden font-sans text-white">
      <header className="h-16 bg-slate-800/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-8 shrink-0 z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-rose-500 rounded-full animate-pulse shadow-lg shadow-rose-500/50"></div>
            <h2 className="text-white font-black text-sm tracking-tight tracking-widest">TELECONSULTA EN VIVO • PACIENTE ID: {id?.substring(0, 6)}</h2>
          </div>
          <p className="text-white/40 text-xs font-black uppercase tracking-[0.2em]">Protocolo HIPAA Seguro</p>
        </div>
        <div className="flex gap-4">
          <button className="px-6 py-3 bg-rose-600 text-white rounded-2xl text-[10px] font-black shadow-[0_10px_30px_-10px_rgba(244,63,94,0.6)] border-b-4 border-rose-800 active:border-b-0 active:translate-y-1 hover:brightness-110 transition-all uppercase tracking-widest" onClick={() => navigate('/pro/dashboard')}>
            TERMINAR ATENCIÓN
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Feed de Video y Transcripción */}
        <div className="flex-1 relative bg-slate-950 flex flex-col">
          <div className="flex-1 relative group">
            <img className="absolute inset-0 w-full h-full object-cover opacity-60" src="https://picsum.photos/seed/telehealth/1200/800" alt="Video Feed" />

            {/* Monitor de Signos en Pantalla */}
            <div className="absolute top-8 right-8 w-48 space-y-3">
              {[
                { label: 'Presión Arterial', val: `${vitals.systolic}/${vitals.diastolic}`, icon: 'favorite' },
                { label: 'Frecuencia Cardíaca', val: `${vitals.heartRate} BPM`, icon: 'pulse_alert' },
                { label: 'Saturación O2', val: `${vitals.oxygenSaturation}%`, icon: 'air' }
              ].map(v => (
                <div key={v.label} className="bg-black/60 backdrop-blur-2xl border border-white/10 p-3 rounded-2xl flex items-center justify-between shadow-2xl">
                  <span className="text-xs font-black text-white/60 uppercase tracking-widest">{v.label}</span>
                  <span className="text-xs font-black text-teal-400">{v.val}</span>
                </div>
              ))}
              <button className="w-full py-2 bg-teal-500/20 hover:bg-teal-500/40 text-xs font-black text-teal-300 rounded-xl uppercase tracking-widest border border-teal-500/30 transition-all">Sincronizar Vitales</button>
            </div>

            {/* Panels eliminados por solicitud */}
          </div>
        </div>

        {/* Panel SOAP y Acciones Médicas */}
        <div className="w-[400px] bg-white flex flex-col shrink-0 z-10 shadow-2xl text-slate-900">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black tracking-tight uppercase tracking-widest text-slate-500">Nota SOAP</h3>
              <span className="bg-slate-100 px-3 py-1 rounded-full text-xs font-black text-slate-500 uppercase tracking-widest border border-slate-200">Protocolo Minsal v24</span>
            </div>

            <div className="space-y-8">
              {[
                { label: 'Subjetivo', key: 'subjective', ph: 'Paciente refiere...', icon: 'chat_bubble' },
                { label: 'Objetivo', key: 'objective', ph: 'Signos y hallazgos físicos...', icon: 'visibility' },
                { label: 'Evaluación', key: 'assessment', ph: 'Impresión diagnóstica...', icon: 'science' },
                { label: 'Plan Terapéutico', key: 'plan', ph: 'Indicaciones y fármacos...', icon: 'fact_check' },
              ].map((field) => (
                <div key={field.key} className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 ml-1">
                    <span className="material-icons-round text-sm">{field.icon}</span>
                    {field.label}
                  </label>
                  <textarea
                    value={(soapData as any)[field.key]}
                    onChange={(e) => setSoapData({ ...soapData, [field.key]: e.target.value })}
                    className="w-full bg-slate-50 border-none rounded-[1.5rem] p-5 text-sm font-medium focus:ring-primary/10 min-h-[110px] resize-none leading-relaxed shadow-inner"
                    placeholder={field.ph}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="p-8 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-4">
            <button
              onClick={() => alert('Módulo de recetas próximamente disponible.')}
              className="py-4 bg-white border-b-4 border-slate-200 rounded-2xl text-[10px] font-black flex flex-col items-center gap-2 shadow-sm active:border-b-0 active:translate-y-1 hover:bg-slate-50 transition-all text-slate-600 uppercase tracking-widest">
              <span className="material-icons-round text-indigo-600">receipt_long</span> Nueva Receta
            </button>
            <button
              onClick={() => { navigate(`/pro/record/${id}`); }}
              className="py-4 bg-teal-500 text-white rounded-2xl text-[10px] font-black flex flex-col items-center gap-2 shadow-[0_10px_30px_-10px_rgba(20,184,166,0.6)] border-b-4 border-teal-700 active:border-b-0 active:translate-y-1 hover:brightness-110 transition-all uppercase tracking-widest">
              <span className="material-icons-round">cloud_done</span> Guardar Sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsultationSession;
