import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Vitals } from '../types';
import { useClinic } from '../ClinicContext';

interface AiChatMessage {
  role: 'user' | 'model';
  text: string;
}

const ConsultationSession: React.FC = () => {
  const { logout } = useClinic();
  const navigate = useNavigate();
  const { id } = useParams();
  const [transcription, setTranscription] = useState<{ text: string, type?: 'symptom' | 'drug' }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [query, setQuery] = useState('');

  // Nuevo Estado para Chat IA durante la sesión
  const [aiChat, setAiChat] = useState<AiChatMessage[]>([
    { role: 'model', text: 'Bienvenido a la sesión. Soy tu apoyo clínico IA. ¿Necesitas revisar algún protocolo o dosis mientras atiendes?' }
  ]);
  const chatScrollRef = useRef<HTMLDivElement>(null);

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

  const lines = [
    { text: "Paciente: Me he sentido con un dolor punzante en la espalda.", type: 'symptom' as const },
    { text: "Médico: Vamos a tomar su presión primero.", type: undefined },
    { text: "Médico: PA 120/80, frecuencia cardíaca normal.", type: undefined },
  ];

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < lines.length) {
        setTranscription(prev => [...prev, lines[i]]);
        i++;
      } else {
        clearInterval(interval);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChat]);

  const talkToConsultant = async () => {
    if (!query.trim()) return;

    const userMsg = query;
    setAiChat(prev => [...prev, { role: 'user', text: userMsg }]);
    setQuery('');
    setIsProcessing(true);

    try {
      const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || '');
      const context = `Contexto Sesión: Paciente ID ${id}. SOAP actual: Subj: ${soapData.subjective}, Plan: ${soapData.plan}.`;
      const prompt = `${context}\n\nMédico pregunta en sesión: "${userMsg}". Responde como consultor profesional rápido.`;

      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const response = await model.generateContent(prompt);
      const resultText = response.response.text();

      setAiChat(prev => [...prev, { role: 'model', text: resultText || "No logré obtener respuesta." }]);
    } catch (error) {
      setAiChat(prev => [...prev, { role: 'model', text: "Error de conexión con el consultor IA." }]);
    } finally {
      setIsProcessing(false);
    }
  };

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

            {/* Transcripción por Voz */}
            <div className="absolute top-8 left-8 w-80 bg-black/70 backdrop-blur-3xl rounded-3xl p-6 border border-white/10 h-72 overflow-y-auto custom-scrollbar shadow-2xl">
              <div className="flex items-center gap-2 mb-6">
                <span className="w-2 h-2 bg-teal-400 rounded-full animate-pulse shadow-[0_0_8px_teal]"></span>
                <span className="text-xs font-black text-white/50 uppercase tracking-widest">Escucha Activa</span>
              </div>
              <div className="space-y-4">
                {transcription.map((line, idx) => (
                  <p key={idx} className={`text-xs font-bold leading-relaxed ${line.type === 'symptom' ? 'text-amber-300' : 'text-white/80'}`}>
                    {line.text}
                  </p>
                ))}
              </div>
            </div>

            {/* Burbuja del Consultor IA Flotante */}
            <div className="absolute bottom-8 left-8 right-8 h-48 bg-slate-900/90 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
              <div className="px-6 py-3 border-b border-white/5 bg-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-icons-round text-sm text-indigo-400">psychology</span>
                  <span className="text-xs font-black text-white/60 uppercase tracking-[0.2em]">Asistente Clínico Inteligente</span>
                </div>
                {isProcessing && <div className="text-xs font-black text-indigo-400 animate-pulse">Analizando caso...</div>}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs font-medium custom-scrollbar">
                {aiChat.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-4 py-2 rounded-2xl ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/80'}`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={chatScrollRef} />
              </div>
              <div className="p-3 bg-black/20 flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && talkToConsultant()}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs focus:ring-1 focus:ring-indigo-500 placeholder-white/20"
                  placeholder="Escribe tu duda: ¿Dosis para este peso? o ¿Protocolo para sospecha de...?"
                />
                <button onClick={talkToConsultant} className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center hover:bg-indigo-700">
                  <span className="material-icons-round text-sm text-white">send</span>
                </button>
              </div>
            </div>
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
