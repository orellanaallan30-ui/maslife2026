
import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { askClaude } from '../lib/claudeHelper';
import { Vitals, Patient, Appointment, ClinicalTemplate, SessionLog, CustomField, ClinicalFile } from '../types';
import { useClinic } from '../ClinicContext';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface Antecedent {
  id: string;
  label: string;
  checked: boolean;
}

interface TherapeuticGoal {
  id: string;
  name: string;
  description: string;
  progress: number;
  status: 'En Proceso' | 'Logrado' | 'Pendiente';
  color: string;
}


const ClinicalRecord: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { patients, appointments, templates, setTemplates, setPatients, logout } = useClinic();

  const onUpdatePatient = (p: Patient) => setPatients(prev => prev.map(old => old.id === p.id ? p : old));
  const onSaveTemplate = (t: ClinicalTemplate) => setTemplates(prev => [...prev, t]);
  const onLogout = () => logout(navigate, 'PROFESSIONAL');

  const [showAiPanel, setShowAiPanel] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [reportFeedback, setReportFeedback] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const posturalInputRef = useRef<HTMLInputElement>(null);

  const initialPatient = patients.find(p => p.id === id);
  const safePatient = initialPatient || { name: '', age: 0, rut: '', birthDate: '', prevision: '', diagnoses: '', address: '', phone: '', email: '', emergencyContact: '', customFields: [], vitals: null, medicalHistory: '', sessionLogs: [], goals: [] } as any;

  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const setIsDirtyTrue = () => setIsDirty(true);

  const [personalData, setPersonalData] = useState({
    name: safePatient.name,
    age: safePatient.age,
    rut: safePatient.rut,
    birthDate: safePatient.birthDate || '',
    prevision: safePatient.prevision,
    diagnoses: safePatient.diagnoses || '',
    address: safePatient.address || '',
    phone: safePatient.phone || '',
    email: safePatient.email || '',
    emergencyContact: safePatient.emergencyContact || ''
  });

  const [customFields, setCustomFields] = useState<CustomField[]>(safePatient.customFields || []);

  const [morbidos, setMorbidos] = useState<Antecedent[]>([
    { id: 'm1', label: 'Hipertensión Arterial', checked: false },
    { id: 'm2', label: 'Diabetes Mellitus II', checked: false },
  ]);
  const [quirurgicos, setQuirurgicos] = useState<Antecedent[]>([
    { id: 'q1', label: 'Apendicectomía', checked: true },
  ]);
  const [anamnesis, setAnamnesis] = useState(safePatient.medicalHistory || '');

  const [vitals, setVitals] = useState<Vitals>(safePatient.vitals || {
    heartRate: 72, systolic: 120, diastolic: 80, temperature: 36.5,
    oxygenSaturation: 98, respiratoryRate: 16, weight: 64.2, height: 1.70, bmi: 24.2, glucose: 95
  });

  const [soap, setSoap] = useState({ subjective: '', objective: '', assessment: '', plan: '' });

  const [goals, setGoals] = useState<TherapeuticGoal[]>([
    { id: 'g1', name: 'Rango de Movimiento', description: 'Recuperar 160° de flexión', progress: 75, status: 'En Proceso', color: 'bg-primary' },
  ]);

  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>(safePatient.sessionLogs || [
    { id: 'sl1', date: '2024-05-10', note: 'Sesión de evaluación inicial.' }
  ]);

  const [files, setFiles] = useState<ClinicalFile[]>(safePatient.attachments || []);

  const [analysisType, setAnalysisType] = useState<'Postural' | 'Marcha' | 'Musculoesquelético'>('Postural');
  const [analysisImages, setAnalysisImages] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [chatMessages, setChatMessages] = useState<Message[]>([
    { role: 'model', text: (import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY) ? `AgenteMasLife conectado. Analizando la ficha de ${personalData.name}. ¿Deseas un análisis de evolución o biomecánico?` : "Error: No se detectó API Key en el servidor. El AgenteMasLife está offline." }
  ]);
  const [userInput, setUserInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<any>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleAiAnalysis = async (type: string, query?: string) => {
    const textToSearch = query || type;
    if (!textToSearch.trim()) return;

    // Feedback instantáneo: Agregamos el mensaje del usuario y limpiamos el input de inmediato
    setChatMessages(prev => [...prev, { role: 'user', text: textToSearch }]);
    setUserInput('');
    setLoadingAi(true);
    setShowAiPanel(true);

    try {
      let attachmentsContext = "";
      if (files.length > 0) {
        attachmentsContext = "Documentos adjuntos: " + files.map(f => f.name).join(', ') + ".\n";
      }

      const clinicalContext = `
        Paciente: ${personalData.name}, RUT: ${personalData.rut}, Edad: ${personalData.age} años.
        Contacto: Tel ${personalData.phone}, Email ${personalData.email}.
        Dirección: ${personalData.address}.
        Última visita: ${safePatient.lastVisit || 'No registrada'}.
        DX: ${personalData.diagnoses}.
        Signos Vitales: FC=${vitals.heartRate}, PA=${vitals.systolic}/${vitals.diastolic}, SatO2=${vitals.oxygenSaturation}, T°=${vitals.temperature}.
        Notas SOAP: S: ${soap.subjective}, O: ${soap.objective}, A: ${soap.assessment}, P: ${soap.plan}.
        Anamnesis: ${anamnesis}.
        Objetivos actuales: ${goals.map(g => `${g.name} (${g.progress}%)`).join(', ')}.
      `;

      const promptText = `Consulta: "${textToSearch}". \n\nContexto Clínico Extendido:\n${clinicalContext}\n${attachmentsContext}`;

      const resultText = await askClaude(
        promptText,
        "Eres AgenteMasLife, Investigador Clínico y Asistente Administrativo Senior. Responde de forma técnica, ultra-concisa y estructurada. Prioriza la velocidad y precisión."
      );

      setChatMessages(prev => [...prev,
        { role: 'model', text: resultText || "No se pudo generar la respuesta." }
      ]);
    } catch (e: any) {
      console.error("AI Error:", e);
      let errorMsg = "Error: No se pudo conectar con el Asistente IA.";
      if (e.message?.includes('API_KEY')) errorMsg = "Error: API Key no configurada en Vercel.";
      setChatMessages(prev => [...prev, { role: 'model', text: errorMsg }]);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleResetChat = () => {
    chatSessionRef.current = null;
    setChatMessages([{ role: 'model', text: `AgenteMasLife reiniciado. ¿En qué puedo ayudarte con la ficha de ${personalData.name}?` }]);
    setUserInput('');
    setLoadingAi(false);
  };

  const handleGenerateProfessionalReport = async (feedback?: string) => {
    setIsGeneratingReport(true);
    setIsReportModalOpen(true);
    try {
      const clinicalData = `
        Paciente: ${personalData.name}, RUT: ${personalData.rut}, Edad: ${personalData.age}, Diagnóstico: ${personalData.diagnoses}.
        Signos Vitales: FC=${vitals.heartRate}, PA=${vitals.systolic}/${vitals.diastolic}, SatO2=${vitals.oxygenSaturation}, T°=${vitals.temperature}.
        Notas SOAP: S: ${soap.subjective}, O: ${soap.objective}, A: ${soap.assessment}, P: ${soap.plan}.
        Anamnesis: ${anamnesis}.
        Objetivos: ${goals.map(g => `${g.name} (${g.progress}%)`).join(', ')}.
        Adjuntos: ${files.map(f => f.name).join(', ')}.
      `;

      const prompt = feedback
        ? `Modifica el informe anterior basado en este comentario: "${feedback}". Datos del paciente: ${clinicalData}`
        : `Genera un Informe Clínico Formal y Organizado para el paciente ${personalData.name}. Estructura: 1. Identificación, 2. Resumen Clínico, 3. Hallazgos y Evolución, 4. Plan de Tratamiento. Datos: ${clinicalData}`;

      const result = await askClaude(
        prompt,
        "Eres un redactor de informes médicos experto. Genera documentos con tono sobrio, estructurado y profesional, listos para descargar o imprimir. Usa formato de texto plano con guiones o puntos, sin markdown complejo."
      );
      setReportContent(result);
    } catch (e) {
      setReportContent("Error al generar el informe inteligente.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const runAdvancedAnalysis = async () => {
    if (analysisImages.length === 0) {
      alert('Por favor carga al menos una imagen (Vista Anterior, Posterior o Lateral).');
      return;
    }

    setIsAnalyzing(true);

    try {
      const prompt = `Como experto en biomecánica y fisioterapia avanzada, realiza un Análisis ${analysisType} para el paciente ${personalData.name}.
               Evalúa según los criterios estándar: asimetrías, niveles de hombros, inclinación pélvica, alineación de plomada, valgo/varo de rodillas y marcadores de marcha.
               Se han cargado ${analysisImages.length} imagen(es) para el análisis.
               Entrega un informe técnico con: 1. Hallazgos Observados, 2. Impresión Biomecánica, 3. Sugerencias de Tratamiento.
               Nota: Como las imágenes no pueden ser procesadas visualmente via API de texto, basa tu análisis en los datos clínicos disponibles y proporciona una plantilla de evaluación que el profesional pueda completar.`;

      const result = await askClaude(
        prompt,
        "Eres un experto en biomecánica, fisioterapia y análisis postural. Genera informes técnicos profesionales basados en los datos clínicos proporcionados."
      );
      setAnalysisResult(result || 'El análisis no pudo ser completado.');
    } catch (error) {
      console.error(error);
      setAnalysisResult('Error al procesar el análisis. Verifica que ANTHROPIC_API_KEY esté configurada.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePosturalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const fileList = Array.from(e.target.files) as File[];
      fileList.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setAnalysisImages(prev => [...prev, event.target!.result as string]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeAnalysisImage = (index: number) => {
    setAnalysisImages(analysisImages.filter((_, i) => i !== index));
  };

  const addCustomField = () => {
    setCustomFields([...customFields, { label: '', value: '' }]);
  };

  const updateCustomField = (index: number, key: 'label' | 'value', val: string) => {
    const updated = [...customFields];
    updated[index] = { ...updated[index], [key]: val };
    setCustomFields(updated);
  };

  const removeCustomField = (index: number) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const fileList = Array.from(e.target.files);
      fileList.forEach((file: any) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            const newFile: ClinicalFile = {
              id: Math.random().toString(36).substr(2, 9),
              name: file.name,
              size: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
              date: new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }),
              type: file.type.includes('pdf') ? 'pdf' : 'image',
              url: '#',
              base64: event.target.result as string
            };
            setFiles(prev => [...prev, newFile]);
            setIsDirtyTrue();
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeFile = (fileId: string) => {
    setFiles(files.filter(f => f.id !== fileId));
    setIsDirtyTrue();
  };

  const addAntecedent = (type: 'm' | 'q') => {
    const newItem: Antecedent = { id: Math.random().toString(36).substr(2, 9), label: '', checked: false };
    if (type === 'm') setMorbidos([...morbidos, newItem]);
    else setQuirurgicos([...quirurgicos, newItem]);
  };

  const addGoal = () => {
    const newGoal: TherapeuticGoal = {
      id: Math.random().toString(36).substr(2, 9), name: 'Nuevo Objetivo', description: '', progress: 0, status: 'Pendiente', color: 'bg-teal-500'
    };
    setGoals([...goals, newGoal]);
  };

  const addSessionLog = () => {
    const newLog: SessionLog = { id: Math.random().toString(36).substr(2, 9), date: new Date().toISOString().split('T')[0], note: '' };
    setSessionLogs([newLog, ...sessionLogs]);
  };

  const handleSaveAttention = async () => {
    setIsSaving(true);
    const updatedPatient: Patient = {
      ...initialPatient,
      name: personalData.name,
      rut: personalData.rut,
      age: personalData.age,
      birthDate: personalData.birthDate,
      prevision: personalData.prevision,
      diagnoses: personalData.diagnoses,
      address: personalData.address,
      phone: personalData.phone,
      email: personalData.email,
      emergencyContact: personalData.emergencyContact,
      vitals,
      soap,
      goals,
      sessionLogs,
      customFields,
      attachments: files,
      medicalHistory: anamnesis,
      status: 'En Tratamiento',
      lastVisit: new Date().toISOString().split('T')[0]
    } as Patient;
    onUpdatePatient(updatedPatient);
    setIsDirty(false);
    setIsSaving(false);
    alert("Ficha Clínica actualizada correctamente.");
    navigate('/pro/patients');
  };

  if (!initialPatient) {
    return (
      <div className="flex w-full h-screen items-center justify-center bg-[#f8fafc]">
        <div className="text-center">
          <span className="material-icons-round text-6xl text-slate-200 mb-4 block">person_off</span>
          <p className="text-slate-500 font-black text-sm uppercase tracking-widest">Paciente no encontrado</p>
          <button onClick={() => navigate("/pro/patients")} className="mt-6 px-8 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest">
            Volver a Pacientes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full h-screen bg-[#f8fafc] overflow-hidden font-sans text-slate-900">
      <main className="flex-1 overflow-y-auto custom-scrollbar relative bg-white md:bg-[#f8fafc]">
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-sm no-print">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-slate-100 shadow-sm bg-slate-100 flex items-center justify-center">
              <span className="material-icons-round text-slate-500 text-4xl">person</span>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">{personalData.name}</h1>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1 italic">Paciente Maslife Premium</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleSaveAttention}
              className={`px-10 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-3 transition-all ${isDirty ? 'bg-emerald-600 text-white shadow-[0_10px_30px_-10px_rgba(16,185,129,0.5)] border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1' : 'bg-slate-100 text-slate-400 border-b-4 border-slate-200 cursor-not-allowed shadow-none'}`}
            >
              <span className="material-icons-round text-lg">{isSaving ? 'sync' : 'save'}</span>
              {isSaving ? 'Guardando...' : 'Guardar Ficha'}
            </button>
            <button onClick={() => setShowAiPanel(true)} className="bg-primary text-white px-10 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-3 border-b-4 border-blue-700 active:border-b-0 active:translate-y-1 shadow-[0_10px_30px_-10px_rgba(19,91,236,0.6)] hover:brightness-110 transition-all">
              <span className="material-icons-round text-lg">auto_awesome</span> AgenteMasLife
            </button>
          </div>
        </header>

        <div className="hidden print:block mb-10 border-b-4 border-primary pb-6">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-4xl font-black text-slate-900 mb-2">FICHA CLÍNICA PROFESIONAL</h1>
              <p className="text-primary font-black tracking-widest uppercase text-sm">MasLife 🧡 Centro de Salud Integral</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Fecha de Emisión</p>
              <p className="text-lg font-black">{new Date().toLocaleDateString('es-CL')}</p>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto p-6 space-y-10 pb-24 print:p-0">
          <section className="bg-white rounded-[3rem] p-10 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] border border-slate-100 print:border-none print:shadow-none">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 border-l-4 border-primary pl-4">Identificación del Paciente</h2>
              <button onClick={addCustomField} className="text-xs font-black text-primary bg-primary/5 px-6 py-3 rounded-xl no-print hover:bg-primary/10 transition-all">+ AGREGAR CAMPO</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { label: 'Nombre Completo', val: personalData.name, k: 'name' },
                { label: 'RUT / ID', val: personalData.rut, k: 'rut' },
                { label: 'Edad', val: personalData.age, k: 'age', t: 'number' },
                { label: 'Nacimiento', val: personalData.birthDate, k: 'birthDate', t: 'date' },
                { label: 'Previsión', val: personalData.prevision, k: 'prevision' },
                { label: 'Teléfono', val: personalData.phone, k: 'phone' }
              ].map(f => (
                <div key={f.k} className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{f.label}</label>
                  <input
                    type={f.t || 'text'}
                    value={f.val}
                    onChange={e => { setPersonalData({ ...personalData, [f.k]: f.t === 'number' ? Number(e.target.value) : e.target.value }); setIsDirtyTrue(); }}
                    className={`w-full bg-slate-50/80 shadow-inner border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all print:bg-white text-slate-700`}
                  />
                </div>
              ))}

              {customFields.map((cf, idx) => (
                <div key={idx} className="space-y-1 relative group animate-in slide-in-from-left-4 duration-300">
                  <div className="flex justify-between items-center pr-1 mb-1">
                    <input
                      value={cf.label}
                      onChange={e => { updateCustomField(idx, 'label', e.target.value); setIsDirtyTrue(); }}
                      placeholder="Etiqueta (ej: Deporte)..."
                      className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-transparent border-none p-0 focus:ring-0 w-2/3"
                    />
                    <button onClick={() => { removeCustomField(idx); setIsDirtyTrue(); }} className="opacity-0 group-hover:opacity-100 text-rose-500 no-print transition-all">
                      <span className="material-icons-round text-xs">delete</span>
                    </button>
                  </div>
                  <input
                    value={cf.value}
                    onChange={e => { updateCustomField(idx, 'value', e.target.value); setIsDirtyTrue(); }}
                    className="w-full bg-slate-50/80 shadow-inner border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all print:bg-white text-slate-700"
                  />
                </div>
              ))}

              <div className="md:col-span-3 space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Diagnóstico Principal</label>
                <input value={personalData.diagnoses} onChange={e => { setPersonalData({ ...personalData, diagnoses: e.target.value }); setIsDirtyTrue(); }} className="w-full bg-primary/5 text-primary shadow-inner border border-primary/20 rounded-2xl py-5 px-6 font-black text-lg print:bg-white" placeholder="Ej: Esguince de tobillo grado II..." />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-[3rem] p-10 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] border border-slate-100 overflow-hidden relative">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 border-l-4 border-primary pl-4">Análisis Biomecánico Inteligente</h2>
                <p className="text-xs font-bold text-primary uppercase mt-2 tracking-widest pl-5">Soportado por Gemini 3 Pro AI</p>
              </div>
              <div className="flex bg-slate-50/80 shadow-inner border border-slate-200 p-2 rounded-2xl no-print">
                {(['Postural', 'Marcha', 'Musculoesquelético'] as const).map(t => (
                  <button key={t} onClick={() => setAnalysisType(t)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all ${analysisType === t ? 'bg-white shadow-sm border border-slate-100 text-primary scale-105' : 'text-slate-400 hover:text-slate-600'}`}>{t}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  {analysisImages.map((img, idx) => (
                    <div key={idx} className="relative aspect-square rounded-[2rem] overflow-hidden border-4 border-slate-50 shadow-md group">
                      <img src={img} className="w-full h-full object-cover" alt={`Vista ${idx}`} />
                      <button onClick={() => removeAnalysisImage(idx)} className="absolute top-2 right-2 w-8 h-8 bg-rose-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center no-print shadow-xl">
                        <span className="material-icons-round text-sm">close</span>
                      </button>
                    </div>
                  ))}
                  {analysisImages.length < 4 && (
                    <button onClick={() => posturalInputRef.current?.click()} className="aspect-square rounded-[2rem] border-4 border-dashed border-slate-100 bg-slate-50 flex flex-col items-center justify-center gap-3 text-slate-300 hover:border-primary hover:text-primary transition-all no-print group">
                      <span className="material-icons-round text-4xl group-hover:scale-110 transition-transform">add_a_photo</span>
                      <span className="text-xs font-black uppercase tracking-widest">Cargar Imagen Clínica</span>
                    </button>
                  )}
                </div>
                <input type="file" ref={posturalInputRef} onChange={handlePosturalUpload} className="hidden" multiple accept="image/*" />

                <button
                  onClick={runAdvancedAnalysis}
                  disabled={isAnalyzing || analysisImages.length === 0}
                  className="w-full py-6 bg-slate-900 border-b-4 border-slate-800 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] active:border-b-0 active:translate-y-1 hover:brightness-110 transition-all disabled:opacity-50 disabled:translate-y-0 disabled:border-b-4 no-print"
                >
                  <span className="material-icons-round">{isAnalyzing ? 'sync' : 'biotech'}</span>
                  {isAnalyzing ? 'Analizando Marcadores...' : `Ejecutar Análisis ${analysisType}`}
                </button>
              </div>

              <div className="bg-slate-50 rounded-[2.5rem] p-10 border border-slate-100 min-h-[350px] flex flex-col shadow-inner relative">
                <div className="flex items-center justify-between mb-8">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Informe IA Estructurado</h4>
                  {analysisResult && (
                    <button onClick={() => window.print()} className="text-xs font-black text-primary hover:underline no-print">DESCARGAR INFORME</button>
                  )}
                </div>
                <div className="flex-1 text-sm font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {isAnalyzing ? (
                    <div className="h-full flex flex-col items-center justify-center space-y-6 py-20">
                      <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                      <p className="text-xs font-black text-primary uppercase tracking-[0.3em] animate-pulse">Procesando anatomía digital...</p>
                    </div>
                  ) : (
                    analysisResult || <div className="text-center py-20 text-slate-300 italic">Cargue imágenes para iniciar el análisis biomecánico automático con IA.</div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { l: 'FC (LPM)', k: 'heartRate', c: 'text-rose-500' },
              { l: 'SIS (MMHG)', k: 'systolic', c: 'text-primary' },
              { l: 'DIA (MMHG)', k: 'diastolic', c: 'text-blue-500' },
              { l: 'Sat O2 (%)', k: 'oxygenSaturation', c: 'text-teal-500' },
              { l: 'Temp (°C)', k: 'temperature', c: 'text-amber-500' }
            ].map(v => (
              <div key={v.k} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-[0_20px_40px_-15px_rgba(19,91,236,0.05)] text-center group hover:-translate-y-1 hover:shadow-xl transition-all">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{v.l}</p>
                <input type="number" value={(vitals as any)[v.k]} onChange={e => { setVitals({ ...vitals, [v.k]: Number(e.target.value) }); setIsDirtyTrue(); }} className={`w-full bg-transparent border-none p-0 text-4xl font-black ${v.c} text-center focus:ring-0`} />
              </div>
            ))}
          </div>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {[
              { l: 'Subjetivo', c: 'S', k: 'subjective', bg: 'bg-primary' },
              { l: 'Objetivo', c: 'O', k: 'objective', bg: 'bg-teal-500' },
              { l: 'Evaluación', c: 'A', k: 'assessment', bg: 'bg-indigo-500' },
              { l: 'Plan', c: 'P', k: 'plan', bg: 'bg-slate-800' }
            ].map(f => (
              <div key={f.k} className="bg-white rounded-[3rem] border border-slate-100 shadow-[0_20px_40px_-15px_rgba(19,91,236,0.05)] overflow-hidden flex flex-col group hover:-translate-y-1 hover:shadow-xl transition-all">
                <div className="px-10 py-6 bg-slate-50/50 border-b border-slate-100 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl ${f.bg} text-white flex items-center justify-center font-black text-sm shadow-sm`}>{f.c}</div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-800">{f.l}</h4>
                </div>
                <textarea value={(soap as any)[f.k]} onChange={e => { setSoap({ ...soap, [f.k]: e.target.value }); setIsDirtyTrue(); }} className="p-10 h-56 border-none text-sm font-bold text-slate-600 focus:ring-4 focus:ring-primary/5 inset-0 resize-none leading-relaxed" placeholder="Registrar notas médicas relevantes..." />
              </div>
            ))}
          </section>

          <section className="bg-white rounded-[3rem] p-10 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] border border-slate-100">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 border-l-4 border-primary pl-4">Objetivos del Tratamiento</h2>
              <button onClick={addGoal} className="text-[10px] bg-teal-500 text-white shadow-[0_10px_30px_-10px_rgba(20,184,166,0.5)] border-b-4 border-teal-700 px-6 py-4 rounded-xl font-black uppercase tracking-widest active:border-b-0 active:translate-y-1 hover:brightness-110 transition-all no-print flex items-center gap-2">
                <span className="material-icons-round text-sm">add</span> NUEVO OBJETIVO
              </button>
            </div>
            <div className="space-y-8">
              {goals.map((obj) => (
                <div key={obj.id} className="p-8 rounded-[2rem] bg-slate-50/50 border border-slate-100 relative print:bg-white animate-in zoom-in-95 group">
                  <button onClick={() => { setGoals(goals.filter(g => g.id !== obj.id)); setIsDirtyTrue(); }} className="absolute top-8 right-8 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 no-print transition-all"><span className="material-icons-round">delete</span></button>
                  <div className="flex flex-col md:flex-row gap-10 items-start">
                    <div className="flex-1 w-full space-y-2">
                      <input value={obj.name} onChange={e => { setGoals(goals.map(g => g.id === obj.id ? { ...g, name: e.target.value } : g)); setIsDirtyTrue(); }} className="w-full bg-transparent border-none p-0 text-2xl font-black text-slate-800 focus:ring-0" />
                      <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden mt-6 shadow-inner border border-slate-200/50">
                        <div className={`h-full ${obj.color} transition-all duration-700 shadow-sm`} style={{ width: `${obj.progress}%` }}></div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 bg-white p-5 rounded-[2rem] shadow-sm no-print border border-slate-100">
                      <button onClick={() => { setGoals(goals.map(g => g.id === obj.id ? { ...g, progress: Math.max(0, g.progress - 10) } : g)); setIsDirtyTrue(); }} className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 text-slate-500 font-black hover:bg-slate-100 shadow-sm active:scale-95 transition-all">-</button>
                      <span className="text-2xl font-black text-primary w-16 text-center">{obj.progress}%</span>
                      <button onClick={() => { setGoals(goals.map(g => g.id === obj.id ? { ...g, progress: Math.min(100, g.progress + 10) } : g)); setIsDirtyTrue(); }} className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 text-slate-500 font-black hover:bg-slate-100 shadow-sm active:scale-95 transition-all">+</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-[3rem] p-10 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] border border-slate-100">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 border-l-4 border-primary pl-4">Documentos y Exámenes</h2>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[10px] bg-white border-b-4 border-slate-200 text-primary shadow-sm px-6 py-4 rounded-xl font-black uppercase tracking-widest active:border-b-0 active:translate-y-1 hover:bg-slate-50 transition-all no-print flex items-center gap-2"
              >
                <span className="material-icons-round text-sm">attach_file</span>
                ADJUNTAR DOCUMENTO
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                multiple
                accept=".pdf,image/*"
              />
            </div>
            {files.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {files.map(file => (
                  <div key={file.id} className="p-6 rounded-[2rem] bg-slate-50/80 shadow-sm border border-slate-200 flex items-center gap-4 group hover:bg-white hover:shadow-xl transition-all relative cursor-pointer">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${file.type === 'pdf' ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'bg-blue-50 text-blue-500 border border-blue-100'}`}>
                      <span className="material-icons-round text-2xl">
                        {file.type === 'pdf' ? 'picture_as_pdf' : 'image'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm text-slate-800 truncate">{file.name}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                        {file.date} • {file.size}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFile(file.id)}
                      className="w-10 h-10 rounded-xl bg-white text-rose-500 opacity-0 group-hover:opacity-100 shadow-md border border-slate-100 flex items-center justify-center no-print transition-all absolute right-4 hover:bg-rose-50"
                    >
                      <span className="material-icons-round text-sm">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-slate-50/50 rounded-[2.5rem] border border-dashed border-slate-200">
                <span className="material-icons-round text-5xl text-slate-300 mb-4 block">folder_open</span>
                <p className="text-slate-400 font-bold text-sm tracking-wide">No hay documentos adjuntos para este paciente.</p>
              </div>
            )}
          </section>

          <section className="bg-white rounded-[3rem] p-10 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] border border-slate-100">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 border-l-4 border-primary pl-4">Bitácora de Evolución</h2>
              <button onClick={addSessionLog} className="text-[10px] bg-white border-b-4 border-slate-200 text-primary shadow-sm px-6 py-4 rounded-xl font-black uppercase tracking-widest active:border-b-0 active:translate-y-1 hover:bg-slate-50 transition-all no-print flex items-center gap-2">
                <span className="material-icons-round text-sm">add</span> NUEVA SESIÓN
              </button>
            </div>
            <div className="space-y-6">
              {sessionLogs.map(log => (
                <div key={log.id} className="flex gap-8 relative group">
                  <div className="w-px bg-slate-200 absolute left-[58px] top-10 bottom-0 print:hidden"></div>
                  <div className="shrink-0 w-[116px] text-right pt-2">
                    <input type="date" value={log.date} onChange={e => { setSessionLogs(sessionLogs.map(s => s.id === log.id ? { ...s, date: e.target.value } : s)); setIsDirtyTrue(); }} className="text-[10px] font-black text-primary uppercase bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 text-center print:bg-transparent shadow-sm" />
                  </div>
                  <div className="flex-1 bg-slate-50/80 shadow-inner rounded-[2rem] p-10 border border-slate-200 relative print:bg-white group-hover:bg-white group-hover:shadow-[0_20px_40px_-15px_rgba(19,91,236,0.1)] transition-all">
                    <button onClick={() => { setSessionLogs(sessionLogs.filter(s => s.id !== log.id)); setIsDirtyTrue(); }} className="absolute top-6 right-6 w-10 h-10 rounded-xl bg-white text-slate-300 hover:text-rose-500 hover:shadow-md border border-slate-100 opacity-0 group-hover:opacity-100 no-print transition-all flex items-center justify-center">
                      <span className="material-icons-round text-sm">delete</span>
                    </button>
                    <textarea value={log.note} onChange={e => { setSessionLogs(sessionLogs.map(s => s.id === log.id ? { ...s, note: e.target.value } : s)); setIsDirtyTrue(); }} className="w-full bg-transparent border-none p-0 text-sm font-bold text-slate-600 focus:ring-0 resize-none h-24 leading-relaxed placeholder:text-slate-400" placeholder="Registrar evolución de la sesión..." />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="fixed bottom-10 right-10 z-50 no-print flex flex-col items-end gap-4 animate-in slide-in-from-bottom-10 duration-700">
          <div className="bg-white/90 backdrop-blur-md px-6 py-3 rounded-full border border-slate-200 shadow-2xl flex items-center gap-4">
            <div className={`w-3 h-3 ${(import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY) ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.7)]' : 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.7)]'} rounded-full animate-pulse`}></div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-[0.25em]">
              {(import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY) ? 'IA AgenteMasLife Conectada' : 'IA AgenteMasLife Offline'}
            </p>
          </div>
        </div>
      </main>

      {showAiPanel && (
        <div className="fixed top-[100px] right-8 w-[450px] h-[calc(100vh-150px)] max-h-[800px] bg-white shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] z-[100] flex flex-col rounded-[3rem] border border-slate-200/60 animate-in slide-in-from-right-10 duration-500 overflow-hidden no-print">
          <div className="bg-slate-900 px-8 py-8 text-white flex justify-between items-center shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <span className="material-icons-round text-white">auto_awesome</span>
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] mb-1">AgenteMasLife</h3>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Investigador Clínico IA</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetChat}
                className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center hover:bg-white/20 transition-all group/reset"
                title="Reiniciar Agente"
              >
                <span className="material-icons-round text-lg group-hover/reset:rotate-180 transition-transform duration-500">refresh</span>
              </button>
              <button onClick={() => setShowAiPanel(false)} className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center hover:bg-white/20 transition-all">
                <span className="material-icons-round">close</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/50 custom-scrollbar flex flex-col">
            <div className="grid grid-cols-2 gap-3 mb-4">
              {['Análisis Evolutivo', 'Protocolo Médico', 'Triaje', 'Generar Informe Formal'].map(t => (
                <button
                  key={t}
                  onClick={() => t === 'Generar Informe Formal' ? handleGenerateProfessionalReport() : handleAiAnalysis(t)}
                  className={`p-4 border rounded-2xl text-xs font-black uppercase transition-all shadow-sm ${t === 'Generar Informe Formal' ? 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100' : 'bg-white border-slate-100 text-slate-500 hover:border-primary hover:text-primary'}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {chatMessages.map((m, i) => (
              <div key={i} className={`p-6 rounded-3xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-primary text-white font-bold self-end max-w-[85%] shadow-lg shadow-primary/10' : 'bg-white border border-slate-100 text-slate-700 self-start w-full shadow-sm'}`}>
                {m.text}
              </div>
            ))}
            {loadingAi && (
              <div className="flex items-center gap-3 p-4">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Agente investigando...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-8 bg-white border-t border-slate-100 flex gap-3">
            <input
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAiAnalysis('Consulta', userInput)}
              className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all outline-none"
              placeholder="Pregunta sobre patologías, fármacos o guías..."
            />
            <button onClick={() => handleAiAnalysis('Consulta', userInput)} className="bg-primary text-white w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"><span className="material-icons-round text-lg">send</span></button>
          </div>
        </div>
      )}

      {/* Modal del Informe Formal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6 no-print">
          <div className="bg-white w-full max-w-4xl h-[85vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Informe Clínico Inteligente</h3>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Revisa, Edita y Descarga el Documento</p>
              </div>
              <div className="flex gap-4">
                <button onClick={() => window.print()} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl">
                  <span className="material-icons-round text-base">print</span> IMPRIMIR / PDF
                </button>
                <button onClick={() => setIsReportModalOpen(false)} className="w-12 h-12 bg-slate-50 text-slate-500 rounded-2xl flex items-center justify-center hover:text-rose-500 transition-all">
                  <span className="material-icons-round">close</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-12 bg-slate-50/30">
              {isGeneratingReport ? (
                <div className="h-full flex flex-col items-center justify-center gap-6">
                  <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                  <p className="text-xs font-black text-primary uppercase tracking-[0.3em] animate-pulse">Agente MasLife redactando documento formal...</p>
                </div>
              ) : (
                <textarea
                  value={reportContent}
                  onChange={e => setReportContent(e.target.value)}
                  className="w-full h-full bg-white border border-slate-200 rounded-[2rem] p-12 text-sm font-medium leading-relaxed text-slate-700 shadow-inner focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none resize-none overflow-y-auto"
                />
              )}
            </div>

            <div className="px-10 py-8 bg-white border-t border-slate-100 flex gap-4 items-center">
              <div className="flex-1 relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 material-icons-round text-primary text-xl">psychology</span>
                <input
                  value={reportFeedback}
                  onChange={e => setReportFeedback(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleGenerateProfessionalReport(reportFeedback)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 pl-14 pr-6 text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none"
                  placeholder="Ej: 'Resume el plan de tratamiento' o 'Agrega más sobre la movilidad'..."
                />
              </div>
              <button
                onClick={() => handleGenerateProfessionalReport(reportFeedback)}
                className="bg-primary/5 text-primary px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary/10 transition-all"
              >
                APLICAR CAMBIO IA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vista de Impresión del Informe (Solo visible al imprimir) */}
      <div className="hidden print:block fixed inset-0 bg-white z-[500] p-16 overflow-visible">
        <div className="max-w-4xl mx-auto space-y-10">
          <div className="flex justify-between items-end border-b-4 border-slate-900 pb-8">
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Informe Clínico</h1>
              <p className="text-primary font-black uppercase tracking-widest text-xs mt-2 italic">Emitido por Plataforma MasLife 🧡</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Fecha del Documento</p>
              <p className="text-xl font-black">{new Date().toLocaleDateString('es-CL')}</p>
            </div>
          </div>

          <div className="whitespace-pre-wrap text-base font-medium leading-relaxed text-slate-800">
            {reportContent}
          </div>

          <div className="pt-24 flex justify-center">
            <div className="text-center w-64 border-t-2 border-slate-200 pt-4">
              <p className="text-xs font-black uppercase tracking-widest">Firma Profesional</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClinicalRecord;
