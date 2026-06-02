
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { askClaude } from '../lib/claudeHelper';
import { Vitals, Patient, Appointment, ClinicalTemplate, SessionLog, CustomField, ClinicalFile, MealPlanRow } from '../types';
import { useClinic } from '../ClinicContext';
import { calcAllMetrics, ACTIVITY_FACTORS, type ActivityLevel, type Gender } from '../lib/nutritionCalculations';
import { toast } from '../lib/toast';
import { exportPatientFichaToPDF, exportReportToPDF, exportOrdenPDF } from '../pdfExport';

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
  const { patients, appointments, templates, setTemplates, setPatients, updatePatient, logout, loggedPro } = useClinic();

  const onUpdatePatient = (p: Patient) => updatePatient(p);
  const onSaveTemplate = (t: ClinicalTemplate) => setTemplates(prev => [...prev, t]);
  const onLogout = () => logout(navigate, 'PROFESSIONAL');

  const [showAiPanel, setShowAiPanel] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [reportFeedback, setReportFeedback] = useState('');
  const [showOrdenModal, setShowOrdenModal] = useState(false);
  const [ordenIndicaciones, setOrdenIndicaciones] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const posturalInputRef = useRef<HTMLInputElement>(null);

  const initialPatient = patients.find(p => p.id === id);
  const safePatient = initialPatient || { name: '', age: 0, rut: '', birthDate: '', prevision: '', diagnoses: '', address: '', phone: '', email: '', emergencyContact: '', customFields: [], vitals: null, medicalHistory: '', sessionLogs: [], goals: [] } as any;

  const [isDirty, setIsDirty] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Ref que apunta siempre al paciente actualizado con los valores más recientes
  const buildPatientRef = useRef<() => Patient>(() => safePatient as Patient);

  const setIsDirtyTrue = () => {
    setIsDirty(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      setAutoSaveStatus('saving');
      buildPatientRef.current && onUpdatePatient(buildPatientRef.current());
      setIsDirty(false);
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 3000);
    }, 2500);
  };

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

  // ── Detección de especialidad ──────────────────────────────────────────────
  const specialtyKey = useMemo(() => {
    const s = (loggedPro?.specialty || '').toLowerCase();
    if (s.includes('psicolog') || s.includes('psiquiat')) return 'psicologia';
    if (s.includes('nutrici') || s.includes('dietét') || s.includes('dietista')) return 'nutricion';
    if (s.includes('ocupacional') || s.includes('t.o.')) return 'to';
    return 'kinesiologia';
  }, [loggedPro?.specialty]);

  // ── Estado: datos especialidad guardados ───────────────────────────────────
  const savedSpec = (safePatient.specialtyData || {}) as Record<string, any>;

  // Estado nutrición
  const DEFAULT_MEAL_PLAN: MealPlanRow[] = [
    { id: '1', meal: 'Desayuno',         food: '', quantity: '', kcal: '', notes: '' },
    { id: '2', meal: 'Media Mañana',     food: '', quantity: '', kcal: '', notes: '' },
    { id: '3', meal: 'Almuerzo',         food: '', quantity: '', kcal: '', notes: '' },
    { id: '4', meal: 'Once',             food: '', quantity: '', kcal: '', notes: '' },
    { id: '5', meal: 'Cena',             food: '', quantity: '', kcal: '', notes: '' },
    { id: '6', meal: 'Colación Nocturna',food: '', quantity: '', kcal: '', notes: '' },
  ];
  const [nutPeso,         setNutPeso]         = useState<number>(savedSpec.nutPeso         || 0);
  const [nutTalla,        setNutTalla]        = useState<number>(savedSpec.nutTalla        || 0);
  const [nutCintura,      setNutCintura]      = useState<number>(savedSpec.nutCintura      || 0);
  const [nutCadera,       setNutCadera]       = useState<number>(savedSpec.nutCadera       || 0);
  const [nutGender,       setNutGender]       = useState<Gender>(savedSpec.nutGender       || 'Femenino');
  const [nutActivity,     setNutActivity]     = useState<ActivityLevel>(savedSpec.nutActivity || 'moderado');
  const [nutGoals,        setNutGoals]        = useState<string>(savedSpec.nutGoals        || '');
  const [nutSupplements,  setNutSupplements]  = useState<string>(savedSpec.nutSupplements  || '');
  const [mealPlan, setMealPlan] = useState<MealPlanRow[]>(
    (savedSpec.mealPlan as MealPlanRow[]) || DEFAULT_MEAL_PLAN
  );
  // Composición corporal tetracompartimental
  const [nutMasaGrasaPct,    setNutMasaGrasaPct]    = useState<number>(savedSpec.nutMasaGrasaPct    || 0);
  const [nutMasaAdiposaPct,  setNutMasaAdiposaPct]  = useState<number>(savedSpec.nutMasaAdiposaPct  || 0);
  const [nutMasaMuscularPct, setNutMasaMuscularPct] = useState<number>(savedSpec.nutMasaMuscularPct || 0);
  const [nutSum6Pliegues,    setNutSum6Pliegues]    = useState<number>(savedSpec.nutSum6Pliegues    || 0);
  const [nutSum8Pliegues,    setNutSum8Pliegues]    = useState<number>(savedSpec.nutSum8Pliegues    || 0);

  // Cálculos automáticos de nutrición (se recalculan en cada render)
  const nutMetrics = useMemo(
    () => calcAllMetrics(nutPeso, nutTalla, nutCintura, nutCadera, safePatient.age || 0, nutGender, nutActivity),
    [nutPeso, nutTalla, nutCintura, nutCadera, nutGender, nutActivity, safePatient.age]
  );
  // Valores de composición calculados automáticamente
  const nutMasaGrasaKg    = nutPeso > 0 && nutMasaGrasaPct > 0    ? +(nutPeso * nutMasaGrasaPct    / 100).toFixed(3) : 0;
  const nutMasaAdiposaKg  = nutPeso > 0 && nutMasaAdiposaPct > 0  ? +(nutPeso * nutMasaAdiposaPct  / 100).toFixed(3) : 0;
  const nutMasaMuscularKg = nutPeso > 0 && nutMasaMuscularPct > 0 ? +(nutPeso * nutMasaMuscularPct / 100).toFixed(3) : 0;
  const nutIndiceMuscularOseo = nutMasaMuscularKg > 0 && nutTalla > 0
    ? +(nutMasaMuscularKg / Math.pow(nutTalla / 100, 2)).toFixed(4) : 0;
  // Historial de evaluaciones para tabla EV1/EV2
  const compositionHistory = (savedSpec.compositionHistory as Array<Record<string, number | string>>) || [];

  // Estado psicología
  const [psychMood,          setPsychMood]          = useState<number>(savedSpec.psychMood ?? 5);
  const [psychPsychHistory,  setPsychPsychHistory]  = useState<string>(savedSpec.psychPsychHistory  || '');
  const [psychIntervention,  setPsychIntervention]  = useState<string>(savedSpec.psychIntervention  || '');
  const [psychNextObjective, setPsychNextObjective] = useState<string>(savedSpec.psychNextObjective || '');

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

  // Construye el contexto clínico completo para el agente
  const buildClinicalContext = (): string => {
    const nutData = savedSpec as any;
    const soapLine = (label: string, val: string) => val?.trim() ? `${label}: ${val}` : '';

    const sections: string[] = [
      `═══ DATOS DEL PACIENTE ═══`,
      `Nombre: ${personalData.name} | Edad: ${personalData.age} años | RUT: ${personalData.rut}`,
      `Diagnóstico: ${personalData.diagnoses || 'No registrado'}`,
      `Previsión: ${personalData.prevision || '—'} | Última visita: ${safePatient.lastVisit || 'No registrada'}`,
      '',
      `═══ SIGNOS VITALES ═══`,
      `FC: ${vitals.heartRate} lpm | PA: ${vitals.systolic}/${vitals.diastolic} mmHg | SatO2: ${vitals.oxygenSaturation}% | T°: ${vitals.temperature}°C`,
      '',
      `═══ NOTA CLÍNICA (SOAP) ═══`,
      soapLine('S', soap.subjective),
      soapLine('O', soap.objective),
      soapLine('A', soap.assessment),
      soapLine('P', soap.plan),
    ].filter(Boolean);

    if (anamnesis?.trim()) {
      sections.push('', `═══ ANAMNESIS ═══`, anamnesis.substring(0, 600));
    }

    if (goals.length > 0) {
      sections.push('', `═══ OBJETIVOS TERAPÉUTICOS ═══`);
      goals.forEach(g => sections.push(`• ${g.name}: ${g.progress}% — ${g.status}`));
    }

    if (sessionLogs.length > 0) {
      sections.push('', `═══ ÚLTIMAS SESIONES (${Math.min(5, sessionLogs.length)}) ═══`);
      sessionLogs.slice(0, 5).forEach(s => sections.push(`[${s.date}] ${s.note?.substring(0, 200) || '—'}`));
    }

    if (specialtyKey === 'nutricion' && nutMetrics) {
      sections.push('', `═══ EVALUACIÓN NUTRICIONAL ═══`);
      sections.push(`Peso: ${nutPeso} kg | Talla: ${nutTalla} cm`);
      sections.push(`IMC: ${nutMetrics.bmi} (${nutMetrics.bmiClassification.label})`);
      sections.push(`TMB: ${nutMetrics.bmr} kcal/día | GET: ${nutMetrics.totalCalories} kcal/día`);
      if (nutCintura && nutCadera) sections.push(`Rel. Cintura/Cadera: ${nutMetrics.whr} (${nutMetrics.whrClassification.label})`);
      if (nutGoals) sections.push(`Objetivos nutricionales: ${nutGoals}`);
      const planTotal = mealPlan.reduce((s, r) => s + (parseFloat(r.kcal) || 0), 0);
      sections.push(`Plan alimentario — Total: ${planTotal} kcal estimadas`);
    }

    if (specialtyKey === 'psicologia') {
      sections.push('', `═══ EVALUACIÓN PSICOLÓGICA ═══`);
      sections.push(`Escala de ánimo EVA: ${psychMood}/10`);
      if (psychPsychHistory) sections.push(`Antecedentes psiquiátricos: ${psychPsychHistory.substring(0, 300)}`);
      if (psychIntervention)  sections.push(`Técnica aplicada: ${psychIntervention.substring(0, 300)}`);
      if (psychNextObjective) sections.push(`Objetivo próxima sesión: ${psychNextObjective}`);
    }

    if (files.length > 0) {
      sections.push('', `Documentos adjuntos: ${files.map(f => f.name).join(', ')}`);
    }

    return sections.join('\n');
  };

  // Prompts diferenciados por acción del agente clínico
  const ACTION_PROMPTS: Record<string, string> = {
    'Análisis Evolutivo':
      'Analiza la evolución clínica del paciente basándote en el historial de sesiones y la nota SOAP actual. Identifica tendencias, progreso o deterioro. Compara con los objetivos terapéuticos y señala qué está avanzando bien y qué requiere ajuste. Sé específico y clínico.',
    'Protocolo Médico':
      'Busca en internet el protocolo clínico más actualizado para el diagnóstico principal de este paciente. Adapta las recomendaciones al sistema de salud chileno (MINSAL, GES si aplica). Incluye criterios de evaluación, técnicas recomendadas y frecuencia de sesiones.',
    'Diagnóstico Diferencial':
      'Basándote en los síntomas del SOAP subjetivo y objetivo, lista los principales diagnósticos diferenciales ordenados por probabilidad. Para los 2-3 más probables, indica qué criterios los apoyan o descartan. Busca en internet si necesitas criterios diagnósticos actualizados.',
    'Triaje':
      'Evalúa la urgencia del caso. Revisa los signos vitales y síntomas actuales. Determina: ¿requiere derivación urgente, atención pronto o puede continuar plan habitual? Indica señales de alarma específicas que justifiquen cambios en el plan.',
    'Buscar Guía Clínica':
      'Busca en internet la guía clínica o protocolo más reciente para este caso. Prioriza fuentes oficiales (MINSAL Chile, GPC, NICE, UpToDate). Reporta el título, año, recomendación principal y el enlace fuente.',
    'Generar Informe Formal':
      'Genera un Informe Clínico Profesional completo con el siguiente formato:\n1. IDENTIFICACIÓN DEL PACIENTE\n2. RESUMEN CLÍNICO Y DIAGNÓSTICO\n3. HALLAZGOS CLÍNICOS Y EVOLUCIÓN\n4. PLAN DE TRATAMIENTO Y PROYECCIÓN\n5. OBSERVACIONES ADICIONALES\nUsa tono formal y técnico, listo para imprimir. Sin markdown complejo.',
    'Consulta': '',
  };

  const handleAiAnalysis = async (action: string, query?: string) => {
    const userText = query?.trim() || action;
    if (!userText) return;

    setChatMessages(prev => [...prev, { role: 'user', text: userText }]);
    setUserInput('');
    setLoadingAi(true);
    setShowAiPanel(true);

    try {
      const clinicalContext = buildClinicalContext();
      const actionPrompt = ACTION_PROMPTS[action] || '';
      const systemPrompt = `Eres AgenteMasLife, asistente clínico inteligente integrado en el software MasLife (Chile).
Especialidad del profesional: ${loggedPro?.specialty || 'Salud General'}.
Fecha actual: ${new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.

CONTEXTO CLÍNICO DEL PACIENTE:
${clinicalContext}

INSTRUCCIONES:
- Responde en español, con terminología clínica apropiada para la especialidad
- Puedes buscar en internet usando la herramienta web_search cuando necesites información actualizada
- Cita las fuentes cuando uses resultados de búsqueda
- Sé conciso pero completo — el profesional tiene poco tiempo
- Ante dudas, recomienda consultar guías MINSAL o derivar
- No prescribas medicamentos, sugiere consultar médico tratante
${actionPrompt ? `\nTAREA ESPECÍFICA:\n${actionPrompt}` : ''}`;

      const r = await fetch('/api/clinical-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: userText === action ? (actionPrompt || userText) : userText }],
          system: systemPrompt,
        }),
      });

      if (!r.ok) throw new Error(`Error ${r.status}`);
      const data = await r.json();
      const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n') || 'Sin respuesta.';

      setChatMessages(prev => [...prev, { role: 'model', text }]);
    } catch (e: any) {
      const msg = e.message?.includes('API_KEY')
        ? 'Error: ANTHROPIC_API_KEY no configurada en Vercel.'
        : 'Error al conectar con el AgenteMasLife.';
      setChatMessages(prev => [...prev, { role: 'model', text: msg }]);
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
      const clinicalContext = buildClinicalContext();
      const sanitize = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const prompt = feedback
        ? `Modifica el siguiente informe basándote en el comentario del profesional:\n<comentario>${sanitize(feedback)}</comentario>\n\nINFORME ANTERIOR:\n${reportContent}\n\nDATOS DEL PACIENTE:\n${clinicalContext}`
        : `Genera un Informe Clínico Profesional completo para el paciente ${sanitize(personalData.name)}.\n\nEstructura obligatoria:\n1. IDENTIFICACIÓN DEL PACIENTE\n2. RESUMEN CLÍNICO Y DIAGNÓSTICO\n3. HALLAZGOS CLÍNICOS Y EVOLUCIÓN\n4. PLAN DE TRATAMIENTO Y PROYECCIÓN\n5. OBSERVACIONES ADICIONALES\n\nDATOS CLÍNICOS:\n${clinicalContext}`;

      const r = await fetch('/api/clinical-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          system: `Eres un redactor de informes clínicos experto. Genera documentos con tono sobrio, estructurado y profesional, listos para imprimir. Usa texto plano con guiones o numeración. Sin markdown complejo. Especialidad: ${loggedPro?.specialty || 'Salud'}.`,
        }),
      });
      if (!r.ok) throw new Error('Error al generar');
      const data = await r.json();
      const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n') || 'Error al generar el informe.';
      setReportContent(text);
    } catch {
      setReportContent('Error al generar el informe. Verifica la conexión con el AgenteMasLife.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleExportFicha = async () => {
    if (!loggedPro) { toast.error('No hay profesional conectado'); return; }
    const patientObj = { ...safePatient, ...personalData } as Patient;
    await exportPatientFichaToPDF(
      patientObj,
      loggedPro,
      vitals,
      goals,
      sessionLogs,
      anamnesis,
      soap,
      specialtyKey,
      { nutPeso, nutTalla, nutCintura, nutCadera, nutGoals: nutGoals, psychMood, psychIntervention, psychNextObjective }
    );
  };

  const handleExportOrden = async () => {
    if (!loggedPro) { toast.error('No hay profesional conectado'); return; }
    const patientObj = { ...safePatient, ...personalData } as Patient;
    await exportOrdenPDF(patientObj, loggedPro, ordenIndicaciones, specialtyKey);
    setShowOrdenModal(false);
    setOrdenIndicaciones('');
  };

  // Guarda el informe generado como documento adjunto en la ficha
  const handleSaveReportAsFile = () => {
    if (!reportContent.trim()) return;
    const newFile: ClinicalFile = {
      id: Date.now().toString(),
      name: `Informe_${personalData.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`,
      size: `${(reportContent.length / 1024).toFixed(1)} KB`,
      date: new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }),
      type: 'pdf',
      url: '#',
      base64: `data:text/plain;base64,${btoa(unescape(encodeURIComponent(reportContent)))}`,
    };
    setFiles(prev => [newFile, ...prev]);
    setIsDirtyTrue();
    toast.success('Informe guardado como documento en la ficha');
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

  // Construye el objeto Patient con todos los valores de estado actuales
  const buildUpdatedPatient = (): Patient => ({
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
    lastVisit: new Date().toISOString().split('T')[0],
    specialtyData: (() => {
      // Snapshot de composición para historial de evolución
      const today = new Date().toISOString().split('T')[0];
      const prevHistory = (savedSpec.compositionHistory as Array<Record<string, number | string>>) || [];
      const hasCompData = nutMasaGrasaPct > 0 || nutMasaMuscularPct > 0 || nutSum6Pliegues > 0;
      const snapshot = hasCompData ? {
        date: today,
        peso: nutPeso, talla: nutTalla,
        imc: nutMetrics?.bmi || 0,
        masaGrasaPct: nutMasaGrasaPct, masaGrasaKg: nutMasaGrasaKg,
        masaAdiposaPct: nutMasaAdiposaPct, masaAdiposaKg: nutMasaAdiposaKg,
        masaMuscularPct: nutMasaMuscularPct, masaMuscularKg: nutMasaMuscularKg,
        sum6Pliegues: nutSum6Pliegues, sum8Pliegues: nutSum8Pliegues,
        indiceMuscularOseo: nutIndiceMuscularOseo,
      } : null;
      const newHistory = snapshot
        ? [...prevHistory.filter(s => s.date !== today), snapshot]
        : prevHistory;
      return {
        // Nutrición
        nutPeso, nutTalla, nutCintura, nutCadera, nutGender, nutActivity,
        nutGoals, nutSupplements, mealPlan,
        nutMasaGrasaPct, nutMasaAdiposaPct, nutMasaMuscularPct,
        nutSum6Pliegues, nutSum8Pliegues,
        compositionHistory: newHistory,
        // Psicología
        psychMood, psychPsychHistory, psychIntervention, psychNextObjective,
      };
    })(),
  } as Patient);

  // Mantiene el ref actualizado para que el auto-save siempre use los últimos valores
  buildPatientRef.current = buildUpdatedPatient;

  const handleSaveAttention = async () => {
    setIsSaving(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    onUpdatePatient(buildUpdatedPatient());
    setIsDirty(false);
    setAutoSaveStatus('idle');
    setIsSaving(false);
    toast.success(`Ficha de ${personalData.name} guardada correctamente`);
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
    <div className="flex-1 flex flex-col min-h-0 w-full bg-[#f8fafc] font-sans text-slate-900">
      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative bg-white md:bg-[#f8fafc]">
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
          <div className="flex items-center gap-3">
            {/* Indicador de auto-guardado */}
            {autoSaveStatus !== 'idle' && (
              <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 transition-all ${autoSaveStatus === 'saving' ? 'text-amber-500' : 'text-emerald-500'}`}>
                <span className={`material-icons-round text-sm ${autoSaveStatus === 'saving' ? 'animate-spin' : ''}`}>
                  {autoSaveStatus === 'saving' ? 'sync' : 'check_circle'}
                </span>
                {autoSaveStatus === 'saving' ? 'Auto-guardando...' : 'Guardado automáticamente'}
              </span>
            )}
            {/* Descargar PDF */}
            <button
              onClick={handleExportFicha}
              className="px-6 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 bg-white border border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50 transition-all border-b-4 border-slate-200 active:border-b-0 active:translate-y-1"
              title="Descargar Ficha como PDF"
            >
              <span className="material-icons-round text-lg">picture_as_pdf</span>
              PDF
            </button>
            {/* Orden */}
            <button
              onClick={() => setShowOrdenModal(true)}
              className="px-6 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 bg-white border border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50 transition-all border-b-4 border-slate-200 active:border-b-0 active:translate-y-1"
              title="Emitir Orden Profesional"
            >
              <span className="material-icons-round text-lg">assignment</span>
              ORDEN
            </button>
            {/* Guardar manualmente */}
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

          {specialtyKey === 'kinesiologia' && (
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
                    <button
                      onClick={() => loggedPro && exportReportToPDF(analysisResult, { ...safePatient, ...personalData } as Patient, loggedPro)}
                      className="text-xs font-black text-primary hover:underline no-print"
                    >DESCARGAR INFORME</button>
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
          )}

          {/* ── Signos Vitales ─────────────────────────────────────────────── */}
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

          {/* ── Sección Nutrición ──────────────────────────────────────────── */}
          {specialtyKey === 'nutricion' && (
          <section className="bg-white rounded-[3rem] p-10 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] border border-slate-100 space-y-10">
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 border-l-4 border-emerald-500 pl-4">Evaluación Nutricional — Calculadora Clínica</h2>

            {/* Inputs antropométricos */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { l: 'Peso (kg)',        v: nutPeso,    set: (n: number) => { setNutPeso(n);    setIsDirtyTrue(); } },
                { l: 'Talla (cm)',       v: nutTalla,   set: (n: number) => { setNutTalla(n);   setIsDirtyTrue(); } },
                { l: 'Circ. Cintura (cm)', v: nutCintura, set: (n: number) => { setNutCintura(n); setIsDirtyTrue(); } },
                { l: 'Circ. Cadera (cm)', v: nutCadera,  set: (n: number) => { setNutCadera(n);  setIsDirtyTrue(); } },
              ].map(f => (
                <div key={f.l} className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{f.l}</label>
                  <input type="number" step="0.1" value={f.v || ''} onChange={e => f.set(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 shadow-inner border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all" />
                </div>
              ))}
            </div>

            {/* Género y nivel de actividad */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Género Biológico</label>
                <div className="flex gap-3">
                  {(['Femenino', 'Masculino'] as Gender[]).map(g => (
                    <button key={g} onClick={() => { setNutGender(g); setIsDirtyTrue(); }}
                      className={`flex-1 py-4 rounded-2xl font-black text-sm border-2 transition-all ${nutGender === g ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      {g === 'Femenino' ? '♀ Femenino' : '♂ Masculino'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nivel de Actividad Física</label>
                <select value={nutActivity} onChange={e => { setNutActivity(e.target.value as ActivityLevel); setIsDirtyTrue(); }}
                  className="w-full bg-slate-50 shadow-inner border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-emerald-500/10 transition-all">
                  {(Object.entries(ACTIVITY_FACTORS) as [ActivityLevel, { label: string; factor: number }][]).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Resultados calculados */}
            {nutMetrics ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { l: 'IMC',             val: nutMetrics.bmi,           unit: 'kg/m²', sub: nutMetrics.bmiClassification.label,  col: nutMetrics.bmiClassification.color },
                  { l: 'TMB (Mifflin)',   val: nutMetrics.bmr,           unit: 'kcal/día', sub: 'Tasa metabólica basal',          col: 'text-primary' },
                  { l: 'GET',             val: nutMetrics.totalCalories,  unit: 'kcal/día', sub: 'Gasto energético total',         col: 'text-teal-500' },
                  { l: 'Rel. C/C',        val: nutMetrics.whr || '—',     unit: '',      sub: nutMetrics.whrClassification.label, col: nutMetrics.whrClassification.color },
                ].map(card => (
                  <div key={card.l} className="bg-slate-50 rounded-[2rem] p-8 border border-slate-100 text-center shadow-inner">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{card.l}</p>
                    <p className={`text-3xl font-black ${card.col}`}>{card.val}</p>
                    {card.unit && <p className="text-[10px] text-slate-400 font-bold mt-1">{card.unit}</p>}
                    <p className={`text-xs font-black mt-2 ${card.col}`}>{card.sub}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200 text-slate-400 text-sm font-bold">
                Ingresa peso y talla para calcular automáticamente IMC, TMB y GET
              </div>
            )}

            {/* ── Composición Corporal ──────────────────────────────── */}
            <div className="space-y-6 border-t border-slate-100 pt-8">
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 border-l-4 border-emerald-400 pl-4">
                Composición Corporal Tetracompartimental
              </h3>

              {/* Inputs de porcentajes */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { l: 'Masa Grasa (%)',    v: nutMasaGrasaPct,    set: (n: number) => { setNutMasaGrasaPct(n);    setIsDirtyTrue(); } },
                  { l: 'Masa Adiposa (%)',  v: nutMasaAdiposaPct,  set: (n: number) => { setNutMasaAdiposaPct(n);  setIsDirtyTrue(); } },
                  { l: 'Masa Muscular (%)', v: nutMasaMuscularPct, set: (n: number) => { setNutMasaMuscularPct(n); setIsDirtyTrue(); } },
                  { l: 'Sum. 6 Pliegues (mm)', v: nutSum6Pliegues, set: (n: number) => { setNutSum6Pliegues(n); setIsDirtyTrue(); } },
                  { l: 'Sum. 8 Pliegues (mm)', v: nutSum8Pliegues, set: (n: number) => { setNutSum8Pliegues(n); setIsDirtyTrue(); } },
                ].map(f => (
                  <div key={f.l} className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{f.l}</label>
                    <input type="number" step="0.01" value={f.v || ''} onChange={e => f.set(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-50 shadow-inner border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all" />
                  </div>
                ))}
              </div>

              {/* Cards calculadas (kg e Índice Muscular Óseo) */}
              {(nutMasaGrasaPct > 0 || nutMasaMuscularPct > 0) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { l: 'Masa Grasa',      val: nutMasaGrasaKg,       unit: 'kg', col: 'text-rose-500' },
                    { l: 'Masa Adiposa',    val: nutMasaAdiposaKg,     unit: 'kg', col: 'text-orange-500' },
                    { l: 'Masa Muscular',   val: nutMasaMuscularKg,    unit: 'kg', col: 'text-emerald-600' },
                    { l: 'Índ. Musc. Óseo',val: nutIndiceMuscularOseo, unit: '',  col: 'text-blue-600' },
                  ].map(card => (
                    <div key={card.l} className="bg-slate-50 rounded-[2rem] p-6 border border-slate-100 text-center shadow-inner">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{card.l}</p>
                      <p className={`text-2xl font-black ${card.col}`}>{card.val || '—'}</p>
                      {card.unit && <p className="text-[10px] text-slate-400 font-bold mt-1">{card.unit}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Tabla de Evolución EV1 vs EV2 */}
              {compositionHistory.length >= 2 && (() => {
                const ev1 = compositionHistory[0];
                const ev2 = compositionHistory[compositionHistory.length - 1];
                const rows: { label: string; key: string; betterDown: boolean }[] = [
                  { label: 'Masa Corporal (kg)',   key: 'peso',              betterDown: true  },
                  { label: 'Talla (cms)',           key: 'talla',             betterDown: false },
                  { label: 'Masa Grasa (%)',        key: 'masaGrasaPct',      betterDown: true  },
                  { label: 'Masa Grasa (kg)',       key: 'masaGrasaKg',       betterDown: true  },
                  { label: 'Masa Adiposa (%)',      key: 'masaAdiposaPct',    betterDown: true  },
                  { label: 'Masa Adiposa (kg)',     key: 'masaAdiposaKg',     betterDown: true  },
                  { label: 'Masa Muscular (%)',     key: 'masaMuscularPct',   betterDown: false },
                  { label: 'Masa Muscular (kg)',    key: 'masaMuscularKg',    betterDown: false },
                  { label: 'Sum. 6 Pliegues (mm)', key: 'sum6Pliegues',      betterDown: true  },
                  { label: 'Sum. 8 Pliegues (mm)', key: 'sum8Pliegues',      betterDown: true  },
                  { label: 'Índice Muscular Óseo', key: 'indiceMuscularOseo',betterDown: false },
                  { label: 'Índice Masa Corporal', key: 'imc',               betterDown: true  },
                ];
                return (
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 flex items-center gap-2">
                      <span className="material-icons-round text-base text-emerald-500">trending_up</span>
                      Tabla de Evolución
                    </h4>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-left">Campo</th>
                            <th className="px-4 py-3 text-center">
                              <span className="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-wider">
                                EV 1 · {String(ev1.date)}
                              </span>
                            </th>
                            <th className="px-4 py-3 text-center">
                              <span className="inline-block px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-wider">
                                EV 2 · {String(ev2.date)}
                              </span>
                            </th>
                            <th className="px-4 py-3 text-center">
                              <span className="inline-block px-3 py-1 rounded-full bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider">DIF</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, idx) => {
                            const v1 = Number(ev1[row.key]) || 0;
                            const v2 = Number(ev2[row.key]) || 0;
                            const dif = +(v2 - v1).toFixed(3);
                            const improved = row.betterDown ? dif < 0 : dif > 0;
                            const neutral = dif === 0;
                            const difColor = neutral ? 'text-slate-400' : improved ? 'text-emerald-600' : 'text-rose-500';
                            const arrow = neutral ? '→' : dif < 0 ? '↓' : '↑';
                            return (
                              <tr key={row.key} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                                <td className="px-4 py-3 text-xs font-black text-slate-600">{row.label}</td>
                                <td className="px-4 py-3 text-center text-sm font-bold text-slate-500">{v1 || '—'}</td>
                                <td className="px-4 py-3 text-center text-sm font-bold text-slate-700">{v2 || '—'}</td>
                                <td className={`px-4 py-3 text-center text-sm font-black ${difColor}`}>
                                  {neutral ? '—' : `${arrow} ${dif > 0 ? '+' : ''}${dif}`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Objetivos nutricionales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Objetivos Nutricionales</label>
                <textarea value={nutGoals} onChange={e => { setNutGoals(e.target.value); setIsDirtyTrue(); }} rows={4}
                  placeholder="Ej: Reducir peso corporal 5 kg en 3 meses, normalizar glicemia..."
                  className="w-full bg-slate-50 shadow-inner border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-emerald-500/10 resize-none transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Suplementación Indicada</label>
                <textarea value={nutSupplements} onChange={e => { setNutSupplements(e.target.value); setIsDirtyTrue(); }} rows={4}
                  placeholder="Ej: Vitamina D 2000 UI/día, Omega-3 1g/día..."
                  className="w-full bg-slate-50 shadow-inner border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-emerald-500/10 resize-none transition-all" />
              </div>
            </div>

            {/* Plan alimentario editable */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Plan Alimentario — Tabla Editable</h3>
                <button onClick={() => {
                  setMealPlan(p => [...p, { id: Date.now().toString(), meal: 'Nueva Comida', food: '', quantity: '', kcal: '', notes: '' }]);
                  setIsDirtyTrue();
                }} className="text-[10px] bg-emerald-500 text-white px-5 py-3 rounded-xl font-black uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center gap-1 no-print">
                  <span className="material-icons-round text-sm">add</span> Agregar fila
                </button>
              </div>
              <div className="overflow-x-auto rounded-[2rem] border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-emerald-50 border-b border-slate-200">
                    <tr>
                      {['Tiempo', 'Preparación / Alimento', 'Cantidad', 'Kcal est.', 'Observaciones', ''].map(h => (
                        <th key={h} className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mealPlan.map((row, idx) => (
                      <tr key={row.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <td className="px-4 py-3">
                          <input value={row.meal} onChange={e => { setMealPlan(p => p.map(r => r.id === row.id ? { ...r, meal: e.target.value } : r)); setIsDirtyTrue(); }}
                            className="w-28 bg-transparent border-none font-black text-slate-700 text-xs focus:ring-0 p-0" />
                        </td>
                        {(['food', 'quantity', 'kcal', 'notes'] as const).map(key => (
                          <td key={key} className="px-4 py-3">
                            <input value={row[key]} onChange={e => { setMealPlan(p => p.map(r => r.id === row.id ? { ...r, [key]: e.target.value } : r)); setIsDirtyTrue(); }}
                              placeholder={key === 'kcal' ? '0' : '...'}
                              className="w-full bg-transparent border-none text-slate-600 text-sm focus:ring-0 p-0" />
                          </td>
                        ))}
                        <td className="px-4 py-3 no-print">
                          <button onClick={() => { setMealPlan(p => p.filter(r => r.id !== row.id)); setIsDirtyTrue(); }}
                            className="text-slate-300 hover:text-rose-500 transition-all">
                            <span className="material-icons-round text-base">delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {/* Total Kcal */}
                    <tr className="bg-emerald-50 font-black">
                      <td colSpan={3} className="px-5 py-4 text-xs text-slate-500 uppercase tracking-widest">Total estimado</td>
                      <td className="px-5 py-4 text-emerald-700 font-black">
                        {mealPlan.reduce((sum, r) => sum + (parseFloat(r.kcal) || 0), 0)} kcal
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
          )}

          {/* ── Sección Psicología ─────────────────────────────────────────── */}
          {specialtyKey === 'psicologia' && (
          <section className="bg-white rounded-[3rem] p-10 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] border border-slate-100 space-y-8">
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 border-l-4 border-violet-500 pl-4">Evaluación Psicológica</h2>

            {/* Escala de ánimo */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Escala de Ánimo Subjetivo (EVA Psicológica)</label>
                <span className={`text-3xl font-black ${psychMood <= 3 ? 'text-rose-500' : psychMood <= 6 ? 'text-amber-500' : 'text-emerald-500'}`}>{psychMood}/10</span>
              </div>
              <input type="range" min={0} max={10} step={1} value={psychMood}
                onChange={e => { setPsychMood(Number(e.target.value)); setIsDirtyTrue(); }}
                className="w-full accent-violet-500 h-3 rounded-full" />
              <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <span>😔 Muy bajo</span><span>😐 Neutro</span><span>😊 Muy alto</span>
              </div>
            </div>

            {/* Antecedentes psiquiátricos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Antecedentes Psiquiátricos / Psicológicos</label>
                <textarea value={psychPsychHistory} onChange={e => { setPsychPsychHistory(e.target.value); setIsDirtyTrue(); }} rows={5}
                  placeholder="Diagnósticos previos, hospitalizaciones, intentos de autolesión, medicación psiquiátrica..."
                  className="w-full bg-slate-50 shadow-inner border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-violet-500/10 resize-none transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Técnica / Intervención Aplicada</label>
                <textarea value={psychIntervention} onChange={e => { setPsychIntervention(e.target.value); setIsDirtyTrue(); }} rows={5}
                  placeholder="Ej: TCC — reestructuración cognitiva de pensamientos automáticos negativos. EMDR fase 3..."
                  className="w-full bg-slate-50 shadow-inner border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-violet-500/10 resize-none transition-all" />
              </div>
            </div>

            {/* Objetivo próxima sesión */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Objetivo Próxima Sesión</label>
              <textarea value={psychNextObjective} onChange={e => { setPsychNextObjective(e.target.value); setIsDirtyTrue(); }} rows={3}
                placeholder="Ej: Trabajar exposición gradual a situaciones sociales. Revisar registro de pensamientos..."
                className="w-full bg-slate-50 shadow-inner border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-violet-500/10 resize-none transition-all" />
            </div>
          </section>
          )}

          {/* ── Evolución SOAP (labels dinámicos por especialidad) ──────────── */}
          {(() => {
            const SOAP_LABELS: Record<string, Array<{ l: string; c: string; k: string; bg: string; ph: string }>> = {
              kinesiologia: [
                { l: 'Subjetivo',             c: 'S', k: 'subjective', bg: 'bg-primary',     ph: 'Lo que reporta el paciente: dolor EVA, funcionalidad...' },
                { l: 'Objetivo',              c: 'O', k: 'objective',  bg: 'bg-teal-500',    ph: 'ROM, fuerza muscular (Daniels), test especiales...' },
                { l: 'Evaluación',            c: 'A', k: 'assessment', bg: 'bg-indigo-500',  ph: 'Diagnóstico kinésico, evolución clínica...' },
                { l: 'Plan',                  c: 'P', k: 'plan',       bg: 'bg-slate-800',   ph: 'Técnicas, ejercicios, pauta domiciliaria...' },
              ],
              psicologia: [
                { l: 'Motivo de Consulta',    c: 'S', k: 'subjective', bg: 'bg-violet-500',  ph: 'Describir motivo referido por el paciente en sus palabras...' },
                { l: 'Estado Mental',         c: 'O', k: 'objective',  bg: 'bg-teal-500',    ph: 'Orientación, memoria, atención, lenguaje, afecto, juicio...' },
                { l: 'Impresión Diagnóstica', c: 'A', k: 'assessment', bg: 'bg-indigo-500',  ph: 'Diagnóstico presuntivo DSM-5/CIE-11, hipótesis clínica...' },
                { l: 'Plan Terapéutico',      c: 'P', k: 'plan',       bg: 'bg-slate-800',   ph: 'Técnica de intervención, frecuencia, objetivos próxima sesión...' },
              ],
              nutricion: [
                { l: 'Anamnesis Alimentaria', c: 'S', k: 'subjective', bg: 'bg-emerald-500', ph: 'Hábitos, horarios, aversiones, preferencias, hidratación...' },
                { l: 'Evaluación Clínica',    c: 'O', k: 'objective',  bg: 'bg-teal-500',    ph: 'Los datos antropométricos están en la calculadora superior...' },
                { l: 'Diagnóstico Nutricional',c: 'A', k: 'assessment', bg: 'bg-indigo-500', ph: 'Estado nutricional, diagnóstico, factores de riesgo...' },
                { l: 'Indicaciones Dietéticas',c: 'P', k: 'plan',      bg: 'bg-slate-800',   ph: 'Indicaciones, restricciones, suplementación, metas calóricas...' },
              ],
              to: [
                { l: 'Desempeño Ocupacional', c: 'S', k: 'subjective', bg: 'bg-amber-500',   ph: 'AVD, AVDI, trabajo, juego, ocio, participación social...' },
                { l: 'Áreas de Intervención', c: 'O', k: 'objective',  bg: 'bg-teal-500',    ph: 'Áreas a trabajar, capacidades observadas, test funcionales...' },
                { l: 'Análisis Funcional',    c: 'A', k: 'assessment', bg: 'bg-indigo-500',  ph: 'Barreras, facilitadores, nivel de independencia...' },
                { l: 'Plan de Intervención',  c: 'P', k: 'plan',       bg: 'bg-slate-800',   ph: 'Estrategias, adaptaciones, ortesis, entrenamiento...' },
              ],
            };
            const fields = SOAP_LABELS[specialtyKey] || SOAP_LABELS.kinesiologia;
            return (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {fields.map(f => (
              <div key={f.k} className="bg-white rounded-[3rem] border border-slate-100 shadow-[0_20px_40px_-15px_rgba(19,91,236,0.05)] overflow-hidden flex flex-col group hover:-translate-y-1 hover:shadow-xl transition-all">
                <div className="px-10 py-6 bg-slate-50/50 border-b border-slate-100 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl ${f.bg} text-white flex items-center justify-center font-black text-sm shadow-sm`}>{f.c}</div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-800">{f.l}</h4>
                </div>
                <textarea value={(soap as any)[f.k]} onChange={e => { setSoap({ ...soap, [f.k]: e.target.value }); setIsDirtyTrue(); }} className="p-10 h-56 border-none text-sm font-bold text-slate-600 focus:ring-4 focus:ring-primary/5 inset-0 resize-none leading-relaxed" placeholder={f.ph} />
              </div>
            ))}
          </section>
            );
          })()}

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
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse inline-block"></span>
                  IA Clínica + Búsqueda Web
                </p>
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
              {[
                { label: 'Análisis Evolutivo', icon: 'trending_up',      color: 'bg-white border-slate-100 text-slate-600 hover:border-primary hover:text-primary' },
                { label: 'Protocolo Médico',   icon: 'medical_services', color: 'bg-white border-slate-100 text-slate-600 hover:border-teal-500 hover:text-teal-600' },
                { label: 'Diagnóstico Diferencial', icon: 'biotech',     color: 'bg-white border-slate-100 text-slate-600 hover:border-indigo-500 hover:text-indigo-600' },
                { label: 'Triaje',             icon: 'emergency',        color: 'bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100' },
                { label: 'Buscar Guía Clínica',icon: 'travel_explore',   color: 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100' },
                { label: 'Generar Informe Formal', icon: 'description',  color: 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100' },
              ].map(btn => (
                <button
                  key={btn.label}
                  onClick={() => btn.label === 'Generar Informe Formal' ? handleGenerateProfessionalReport() : handleAiAnalysis(btn.label)}
                  className={`p-3.5 border rounded-2xl text-[10px] font-black uppercase tracking-wide transition-all shadow-sm flex items-center gap-2 ${btn.color}`}
                >
                  <span className="material-icons-round text-sm">{btn.icon}</span>
                  {btn.label}
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
                <button onClick={handleSaveReportAsFile} className="bg-teal-500 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-teal-600 transition-all shadow-xl">
                  <span className="material-icons-round text-base">save_alt</span> GUARDAR EN FICHA
                </button>
                <button
                  onClick={() => loggedPro && exportReportToPDF(reportContent, { ...safePatient, ...personalData } as Patient, loggedPro)}
                  className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl"
                >
                  <span className="material-icons-round text-base">picture_as_pdf</span> DESCARGAR PDF
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

      {/* Modal de Orden Profesional */}
      {showOrdenModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl p-10 space-y-6 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  {specialtyKey === 'kinesiologia' ? 'Orden Kinesiológica' :
                   specialtyKey === 'nutricion' ? 'Orden Nutricional' :
                   specialtyKey === 'psicologia' ? 'Orden Psicológica' : 'Orden Médica'}
                </h3>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Indicaciones para {personalData.name}</p>
              </div>
              <button onClick={() => setShowOrdenModal(false)} className="w-10 h-10 bg-slate-50 text-slate-500 rounded-2xl flex items-center justify-center hover:text-rose-500 transition-all">
                <span className="material-icons-round text-base">close</span>
              </button>
            </div>
            <textarea
              value={ordenIndicaciones}
              onChange={e => setOrdenIndicaciones(e.target.value)}
              placeholder="Escribe las indicaciones para el paciente&#10;Ej: Realizar ejercicios de flexión de rodilla 3 series × 15 repeticiones, 2 veces al día..."
              className="w-full h-52 rounded-2xl border border-slate-200 p-6 text-sm font-medium text-slate-700 resize-none focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none leading-relaxed"
            />
            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setShowOrdenModal(false)}
                className="px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleExportOrden}
                disabled={!ordenIndicaciones.trim()}
                className="px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-icons-round text-base">download</span>
                Descargar Orden
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
