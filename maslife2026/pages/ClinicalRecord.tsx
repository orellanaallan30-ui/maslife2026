
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { askClaude, askClaudeWithImages } from '../lib/claudeHelper';
import { Vitals, Patient, Appointment, ClinicalTemplate, SessionLog, CustomField, ClinicalFile, MealPlanRow } from '../types';
import { useClinic } from '../ClinicContext';
import { calcAllMetrics, ACTIVITY_FACTORS, type ActivityLevel, type Gender } from '../lib/nutritionCalculations';
import { toast } from '../lib/toast';
import { exportPatientFichaToPDF, exportReportToPDF, exportOrdenPDF } from '../pdfExport';
import { downloadFhirBundle } from '../lib/fhirExport';
import { supabase } from '../supabaseService';
import { auditService } from '../auditService';
import BiomechReport, { BiomechReportData } from '../components/BiomechReport';
import { ConsentSendPanel } from '../components/ConsentFlow';
import { InformedConsent } from '../types_clinical';

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


const SOAP_LABELS: Record<string, Array<{ l: string; c: string; k: string; bg: string; ph: string }>> = {
  kinesiologia: [
    { l: 'Subjetivo',              c: 'S', k: 'subjective', bg: 'bg-primary',    ph: 'Lo que reporta el paciente: dolor EVA, funcionalidad...' },
    { l: 'Objetivo',               c: 'O', k: 'objective',  bg: 'bg-teal-500',   ph: 'ROM, fuerza muscular (Daniels), test especiales...' },
    { l: 'Evaluación',             c: 'A', k: 'assessment', bg: 'bg-indigo-500', ph: 'Diagnóstico kinésico, evolución clínica...' },
    { l: 'Plan',                   c: 'P', k: 'plan',       bg: 'bg-slate-800',  ph: 'Técnicas, ejercicios, pauta domiciliaria...' },
  ],
  nutricion: [
    { l: 'Anamnesis Alimentaria',  c: 'S', k: 'subjective', bg: 'bg-emerald-500', ph: 'Hábitos, horarios, aversiones, preferencias, hidratación...' },
    { l: 'Evaluación Clínica',     c: 'O', k: 'objective',  bg: 'bg-teal-500',   ph: 'Los datos antropométricos están en la calculadora superior...' },
    { l: 'Diagnóstico Nutricional',c: 'A', k: 'assessment', bg: 'bg-indigo-500', ph: 'Estado nutricional, diagnóstico, factores de riesgo...' },
    { l: 'Indicaciones Dietéticas',c: 'P', k: 'plan',       bg: 'bg-slate-800',  ph: 'Indicaciones, restricciones, suplementación, metas calóricas...' },
  ],
  psicologia: [
    { l: 'Motivo de Consulta',     c: 'S', k: 'subjective', bg: 'bg-violet-500',  ph: 'Describir motivo referido por el paciente en sus palabras...' },
    { l: 'Estado Mental',          c: 'O', k: 'objective',  bg: 'bg-teal-500',   ph: 'Orientación, memoria, atención, lenguaje, afecto, juicio...' },
    { l: 'Impresión Diagnóstica',  c: 'A', k: 'assessment', bg: 'bg-indigo-500', ph: 'Diagnóstico presuntivo DSM-5/CIE-11, hipótesis clínica...' },
    { l: 'Plan Terapéutico',       c: 'P', k: 'plan',       bg: 'bg-slate-800',  ph: 'Técnica de intervención, frecuencia, objetivos próxima sesión...' },
  ],
  to: [
    { l: 'Desempeño Ocupacional',  c: 'S', k: 'subjective', bg: 'bg-amber-500',  ph: 'AVD, AVDI, trabajo, juego, ocio, participación social...' },
    { l: 'Áreas de Intervención',  c: 'O', k: 'objective',  bg: 'bg-teal-500',   ph: 'Áreas a trabajar, capacidades observadas, test funcionales...' },
    { l: 'Análisis Funcional',     c: 'A', k: 'assessment', bg: 'bg-indigo-500', ph: 'Barreras, facilitadores, nivel de independencia...' },
    { l: 'Plan de Intervención',   c: 'P', k: 'plan',       bg: 'bg-slate-800',  ph: 'Estrategias, adaptaciones, ortesis, entrenamiento...' },
  ],
};

// ── ROM: definiciones por defecto (label y normal EDITABLES por el profesional) ──
// Los ids coinciden con las keys históricas de kiRom para que los valores ya
// guardados migren sin tocar nada.
export interface RomDef { id: string; label: string; normal: string; color?: string }
const ROM_DEFAULTS: RomDef[] = [
  { id: 'CueFlex', label: 'Cuello Flex.', normal: '45' },  { id: 'CueExt',  label: 'Cuello Ext.',  normal: '45' },
  { id: 'CueRotD', label: 'Cuello Rot.D', normal: '80' },  { id: 'CueRotI', label: 'Cuello Rot.I', normal: '80' },
  { id: 'HomFlex', label: 'Hombro Flex.', normal: '180' }, { id: 'HomAbd',  label: 'Hombro Abd.',  normal: '180' },
  { id: 'ColFlex', label: 'Col. Flex.',   normal: '90' },  { id: 'ColExt',  label: 'Col. Ext.',    normal: '30' },
  { id: 'CadFlex', label: 'Cadera Flex.', normal: '120' }, { id: 'CadExt',  label: 'Cadera Ext.',  normal: '30' },
  { id: 'RodFlex', label: 'Rodilla Flex.', normal: '135' },{ id: 'RodExt',  label: 'Rodilla Ext.', normal: '0' },
  { id: 'TobFlex', label: 'Tobillo Flex.', normal: '20' }, { id: 'TobExt',  label: 'Tobillo Ext.', normal: '50' },
];

// ── Catálogo de tests especiales por zona afectada (recomendaciones) ──
const TEST_CATALOG: Record<string, string[]> = {
  'Columna / Lumbar': ['Lasègue', 'Bragard', 'Slump', 'Schober', 'Adams', 'Kemp'],
  'Hombro':           ['Neer', 'Hawkins', 'Jobe', 'Speed', 'Yergason'],
  'Rodilla':          ['Lachman', 'Cajón Anterior', 'Cajón Posterior', 'McMurray', 'Apley', 'Thessaly'],
  'Cadera':           ['FABER', 'FADIR', 'Thomas', 'Ober', 'Trendelenburg'],
  'Tobillo / Pie':    ['Cajón Anterior de Tobillo', 'Thompson', 'Weight Bearing Lunge'],
  'Neuro / Equilibrio': ['Romberg', 'Unipodal', 'Timed Up & Go'],
};

// Paleta de acentos que el profesional puede asignar a campos (label + borde)
const FIELD_COLORS = ['#475569', '#0d9488', '#0284c7', '#d97706', '#e11d48', '#7c3aed'];

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

  // ── Evaluación Kinesiológica EV1 / EV2 ────────────────────────────────────
  type KiAnthro   = { weight: string; height: string; reach: string; legR: string; legL: string };
  type KiPostural = { plomadaSag: string; plomadaFront: string; shoulders: string; scapulas: string; pelvis: string; knees: string; feet: string; observations: string };
  type KiEvalSet  = { anthro: KiAnthro; postural: KiPostural; rom: Record<string, string>; tests: Record<string, 'pos'|'neg'|'ne'>; images: string[] };
  const mkKiSet = (): KiEvalSet => ({
    anthro:   { weight: '', height: '', reach: '', legR: '', legL: '' },
    postural: { plomadaSag: '', plomadaFront: '', shoulders: '', scapulas: '', pelvis: '', knees: '', feet: '', observations: '' },
    rom: {}, tests: {}, images: [],
  });
  const [kiData, setKiData]       = useState<{ initial: KiEvalSet; final: KiEvalSet }>({ initial: mkKiSet(), final: mkKiSet() });
  const [kiEvalTab, setKiEvalTab] = useState<'initial' | 'final' | 'compare'>('initial');

  // Aliases pointing to the active tab — form JSX stays unchanged
  const _kiTab        = kiEvalTab === 'compare' ? 'initial' : kiEvalTab;
  const kiActive      = kiData[_kiTab];
  const kiAnthro      = kiActive.anthro;
  const kiPostural    = kiActive.postural;
  const kiRom         = kiActive.rom;
  const kiTests       = kiActive.tests;
  const analysisImages = kiActive.images;
  const setKiAnthro   = (upd: (p: KiAnthro) => KiAnthro) =>
    setKiData(prev => ({ ...prev, [_kiTab]: { ...prev[_kiTab], anthro:   upd(prev[_kiTab].anthro)   } }));
  const setKiPostural = (upd: (p: KiPostural) => KiPostural) =>
    setKiData(prev => ({ ...prev, [_kiTab]: { ...prev[_kiTab], postural: upd(prev[_kiTab].postural) } }));
  const setKiRom      = (upd: (p: Record<string, string>) => Record<string, string>) =>
    setKiData(prev => ({ ...prev, [_kiTab]: { ...prev[_kiTab], rom:      upd(prev[_kiTab].rom)      } }));
  const setKiTests    = (upd: (p: Record<string, 'pos'|'neg'|'ne'>) => Record<string, 'pos'|'neg'|'ne'>) =>
    setKiData(prev => ({ ...prev, [_kiTab]: { ...prev[_kiTab], tests:    upd(prev[_kiTab].tests)    } }));
  const setAnalysisImages = (upd: ((p: string[]) => string[]) | string[]) =>
    setKiData(prev => ({ ...prev, [_kiTab]: { ...prev[_kiTab], images: typeof upd === 'function' ? upd(prev[_kiTab].images) : upd } }));

  const calcKiImc    = (a: KiAnthro) => a.weight && a.height ? (Number(a.weight) / Math.pow(Number(a.height) / 100, 2)).toFixed(1) : '';
  const calcKiDiscrep = (a: KiAnthro) => a.legR && a.legL ? Math.abs(Number(a.legR) - Number(a.legL)).toFixed(1) : '';
  const kiImc    = calcKiImc(kiAnthro);
  const kiDiscrep = calcKiDiscrep(kiAnthro);

  const initialPatient = patients.find(p => p.id === id);
  const safePatient = initialPatient || { name: '', age: 0, rut: '', birthDate: '', prevision: '', diagnoses: '', address: '', phone: '', email: '', emergencyContact: '', customFields: [], vitals: null, medicalHistory: '', sessionLogs: [], goals: [] } as any;

  const [isDirty, setIsDirty] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [soapVersions, setSoapVersions] = useState<Array<{ saved_at: string; saved_by_name: string; soap_snapshot: Record<string, string> }>>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [consentWarning, setConsentWarning] = useState(false);
  const [existingConsent, setExistingConsent] = useState<InformedConsent | null>(null);
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

  const isSavingRef = useRef(false);
  const setIsDirtyTrue = () => {
    setIsDirty(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (isSavingRef.current) return;
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

  // Antecedentes: se rehidratan desde specialtyData si la ficha ya los tenía
  // guardados (antes vivían solo en la sesión de edición y se perdían al recargar).
  const _savedAntecedentes = (safePatient.specialtyData || {}) as Record<string, any>;
  const [morbidos, setMorbidos] = useState<Antecedent[]>(
    (_savedAntecedentes.morbidos as Antecedent[])?.length
      ? (_savedAntecedentes.morbidos as Antecedent[])
      : [
          { id: 'm1', label: 'Hipertensión Arterial', checked: false },
          { id: 'm2', label: 'Diabetes Mellitus II', checked: false },
        ]
  );
  const [quirurgicos, setQuirurgicos] = useState<Antecedent[]>(
    (_savedAntecedentes.quirurgicos as Antecedent[])?.length
      ? (_savedAntecedentes.quirurgicos as Antecedent[])
      : [{ id: 'q1', label: 'Apendicectomía', checked: false }]
  );
  const [anamnesis, setAnamnesis] = useState(safePatient.medicalHistory || '');

  const [vitals, setVitals] = useState<Vitals>(safePatient.vitals || {
    heartRate: 0, systolic: 0, diastolic: 0, temperature: 0,
    oxygenSaturation: 0, respiratoryRate: 0, weight: 0, height: 0, bmi: 0, glucose: 0
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

  // Campos personalizados POR SECCIÓN (kinesiología, nutrición, psicología, SOAP,
  // objetivos, etc.). Cada sección de la ficha permite agregar/editar campos libres;
  // persisten dentro de specialtyData.sectionFields, para todas las especialidades.
  // Informe biomecánico estructurado (pantalla visual estilo kiosco) — persiste
  // en specialtyData.biomechReport
  const [biomechReport, setBiomechReport] = useState<BiomechReportData | null>(
    (savedSpec.biomechReport as BiomechReportData) || null
  );
  const [showBiomechReport, setShowBiomechReport] = useState(false);

  // ROM personalizable: labels, normales y colores editables. Compartido entre
  // EV1/EV2 (los VALORES siguen siendo por evaluación en kiRom).
  const [romDefs, setRomDefs] = useState<RomDef[]>(
    (savedSpec.romDefs as RomDef[])?.length ? (savedSpec.romDefs as RomDef[]) : ROM_DEFAULTS
  );

  // Tests especiales: solo aparecen los que el profesional escoge. Fichas con
  // resultados previos conservan sus tests; fichas nuevas parten vacías.
  const [testDefs, setTestDefs] = useState<string[]>(() => {
    const saved = savedSpec.testDefs as string[] | undefined;
    if (saved) return saved;
    const ki = savedSpec.kinesio as { initial?: { tests?: Record<string, string> }; final?: { tests?: Record<string, string> } } | undefined;
    const withResults = new Set<string>([
      ...Object.keys(ki?.initial?.tests || {}),
      ...Object.keys(ki?.final?.tests || {}),
    ]);
    return [...withResults];
  });
  const [testRegion, setTestRegion] = useState<string>('');
  const [customTestName, setCustomTestName] = useState('');

  const [sectionFields, setSectionFields] = useState<Record<string, CustomField[]>>(() => {
    const saved = ((savedSpec.sectionFields as Record<string, CustomField[]>) || {});
    // Migración: la clave general 'kinesiologia' (versión anterior) pasa a la
    // primera subsección para no perder campos ya creados.
    if (saved.kinesiologia?.length) {
      return { ...saved, 'ki-antropometria': [...(saved['ki-antropometria'] || []), ...saved.kinesiologia], kinesiologia: [] };
    }
    return saved;
  });

  // Cargar datos kinesiológicos guardados (soporta formato legacy y nuevo EV1/EV2)
  React.useEffect(() => {
    const ki = savedSpec.kinesio as any;
    if (!ki) return;
    if (ki.initial || ki.final) {
      setKiData({
        initial: { ...mkKiSet(), ...(ki.initial || {}) },
        final:   { ...mkKiSet(), ...(ki.final   || {}) },
      });
    } else if (ki.anthro || ki.postural || ki.rom || ki.tests) {
      // Migrar formato antiguo → EV1
      setKiData(prev => ({
        ...prev,
        initial: {
          anthro:   ki.anthro   || mkKiSet().anthro,
          postural: ki.postural || mkKiSet().postural,
          rom:      ki.rom      || {},
          tests:    ki.tests    || {},
          images:   ki.images   || [],
        },
      }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const [soap, setSoap] = useState({ subjective: '', objective: '', assessment: '', plan: '', ...((safePatient.soap as any) || {}) });

  // Rehidratar desde la ficha guardada: si no, el autosave sobrescribe con [] y
  // borra los objetivos existentes (misma clase de bug que antecedentes).
  const [goals, setGoals] = useState<TherapeuticGoal[]>((safePatient.goals as TherapeuticGoal[]) || []);

  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>(safePatient.sessionLogs || [
    { id: 'sl1', date: '2024-05-10', note: 'Sesión de evaluación inicial.' }
  ]);

  const [files, setFiles] = useState<ClinicalFile[]>(safePatient.attachments || []);

  const [analysisType, setAnalysisType] = useState<'Postural' | 'Marcha' | 'Musculoesquelético'>('Postural');
  const [analysisResult, setAnalysisResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [chatMessages, setChatMessages] = useState<Message[]>([
    { role: 'model', text: (import.meta.env.VITE_AI_ENABLED || process.env.AI_ENABLED) ? `AgenteMasLife conectado. Analizando la ficha de ${personalData.name}. ¿Deseas un análisis de evolución o biomecánico?` : "Error: IA AgenteMasLife no habilitada en este entorno. Contacta al administrador." }
  ]);
  const [userInput, setUserInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<any>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Cargar historial de versiones SOAP (CENS RCE — trazabilidad)
  useEffect(() => {
    if (!initialPatient?.id || !loggedPro?.id) return;
    supabase
      .from('soap_versions')
      .select('saved_at, saved_by_name, soap_snapshot')
      .eq('patient_id', initialPatient.id)
      .eq('professional_id', loggedPro.id)
      .order('saved_at', { ascending: false })
      .limit(5)
      .then(({ data }) => { if (data) setSoapVersions(data); });
    // Trazabilidad Ley 21.719 — registrar acceso a la ficha clínica del paciente
    void auditService.log({
      userId: loggedPro.id, userName: loggedPro.name,
      action: 'SOAP_VIEW', resourceId: initialPatient.id, resourceType: 'soap',
    });
  }, [initialPatient?.id, loggedPro?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Verificar consentimiento informado (CENS RCE — Ley 20.584). Cargamos el
  // consentimiento más reciente (cualquier estado) para poder mostrar el panel de
  // envío/firma y sincronizar el aviso: solo ACCEPTED lo desactiva.
  useEffect(() => {
    if (!initialPatient?.id || !loggedPro?.id) return;
    supabase
      .from('informed_consents')
      .select('*')
      .eq('patient_id', initialPatient.id)
      .eq('professional_id', loggedPro.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) return;
        const row = data && data[0];
        if (!row) { setExistingConsent(null); setConsentWarning(true); return; }
        setExistingConsent({
          id: row.id,
          patientId: row.patient_id,
          patientName: row.patient_name,
          patientEmail: row.patient_email,
          professionalId: row.professional_id,
          templateVersion: row.template_version,
          sentAt: row.created_at,
          expiresAt: row.expires_at,
          status: row.status,
          acceptedAt: row.accepted_at,
          ipAddress: row.ip_address,
          deviceInfo: row.device_info,
          patientSignatureBase64: row.patient_signature_b64,
          checkboxChecked: row.checkbox_checked,
          consentText: row.consent_text,
          verificationCode: row.verification_code,
        });
        setConsentWarning(row.status !== 'ACCEPTED');
      });
  }, [initialPatient?.id, loggedPro?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Construye el contexto clínico completo para el agente
  const buildClinicalContext = (): string => {
    const nutData = savedSpec as any;
    const soapLine = (label: string, val: string) => val?.trim() ? `${label}: ${val}` : '';

    const sections: string[] = [
      `═══ DATOS DEL PACIENTE ═══`,
      // Privacidad (Ley 21.719): NO enviamos identidad directa (nombre/RUT) al
      // asistente de IA. Se usa solo edad/sexo, suficiente para el razonamiento
      // clínico. Refiérete al paciente de forma genérica ("el/la paciente").
      `Paciente: ${safePatient.gender || 'sexo no registrado'}, ${personalData.age || '—'} años (identidad omitida por privacidad)`,
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
      'Genera un Informe Clínico Profesional completo. NO incluyas nombre ni RUT del paciente (no los tienes y la identificación se adjunta por separado); refiérete a "el/la paciente". Formato:\n1. RESUMEN CLÍNICO Y DIAGNÓSTICO\n2. HALLAZGOS CLÍNICOS Y EVOLUCIÓN\n3. PLAN DE TRATAMIENTO Y PROYECCIÓN\n4. OBSERVACIONES ADICIONALES\nUsa tono formal y técnico, listo para imprimir. Sin markdown complejo.',
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
      const systemPrompt = `Eres AgenteMasLife, asistente clínico inteligente integrado en el software Agenda Maslife (Chile).
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

      const { data: { session: _sess1 } } = await supabase.auth.getSession();
      const _authH1 = _sess1?.access_token ? { Authorization: `Bearer ${_sess1.access_token}` } : {};
      const r = await fetch('/api/clinical-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ..._authH1 },
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
        : `Genera un Informe Clínico Profesional completo. NO incluyas nombre ni RUT (no los tienes y la identificación se adjunta por separado); refiérete a "el/la paciente".\n\nEstructura obligatoria:\n1. RESUMEN CLÍNICO Y DIAGNÓSTICO\n2. HALLAZGOS CLÍNICOS Y EVOLUCIÓN\n3. PLAN DE TRATAMIENTO Y PROYECCIÓN\n4. OBSERVACIONES ADICIONALES\n\nDATOS CLÍNICOS:\n${clinicalContext}`;

      const { data: { session: _sess2 } } = await supabase.auth.getSession();
      const _authH2 = _sess2?.access_token ? { Authorization: `Bearer ${_sess2.access_token}` } : {};
      const r = await fetch('/api/clinical-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ..._authH2 },
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
    // Trazabilidad Ley 21.719 — registrar exportación de datos de salud
    if (initialPatient?.id) {
      void auditService.log({
        userId: loggedPro.id, userName: loggedPro.name,
        action: 'SOAP_EXPORT_PDF', resourceId: initialPatient.id, resourceType: 'soap',
      });
    }
    // ÚNICA FUENTE DE VERDAD: el PDF recibe el MISMO objeto que se guarda en la
    // ficha (buildUpdatedPatient), así lo impreso siempre coincide con lo editado.
    const patientObj = buildUpdatedPatient();
    await exportPatientFichaToPDF(
      patientObj,
      loggedPro,
      vitals,
      goals,
      sessionLogs,
      anamnesis,
      soap,
      specialtyKey,
      {
        ...(patientObj.specialtyData as Record<string, unknown>),
        // Métricas derivadas de nutrición (calculadas en vivo, no persistidas)
        nutMetrics,
        // Estado del consentimiento informado para la portada de la ficha
        consentAccepted: !consentWarning,
      }
    );
  };

  const handleExportFhir = () => {
    if (!loggedPro) { toast.error('No hay profesional conectado'); return; }
    const patientObj = { ...safePatient, ...personalData, soap } as Patient;
    downloadFhirBundle(patientObj, loggedPro);
    toast.success('Exportación FHIR R4 descargada');
  };

  const handleShareWithPatient = async () => {
    if (!initialPatient) { toast.error('Paciente no encontrado'); return; }
    setShareLoading(true);
    setShareLink(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Sin sesión activa'); return; }
      const { data, error } = await supabase
        .from('patient_access_tokens')
        .insert({ patient_id: initialPatient.id, professional_id: session.user.id })
        .select('token')
        .single();
      if (error || !data) { toast.error('No se pudo generar el enlace'); return; }
      const link = `${window.location.origin}/mi-ficha/${data.token}`;
      setShareLink(link);
    } finally {
      setShareLoading(false);
    }
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
      const posturalCtx = Object.entries(kiPostural)
        .filter(([k, v]) => v && k !== 'observations')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      const romCtx = Object.entries(kiRom)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}°`)
        .join(', ');

      const prompt = `Analiza las ${analysisImages.length} fotografías clínicas del/de la paciente (identidad omitida por privacidad).

Tipo de análisis solicitado: ${analysisType}
${kiAnthro.weight ? `Peso: ${kiAnthro.weight} kg` : ''}${kiAnthro.height ? `, Talla: ${kiAnthro.height} cm` : ''}${kiImc ? `, IMC: ${kiImc}` : ''}
${posturalCtx ? `Hallazgos posturales registrados: ${posturalCtx}` : ''}
${romCtx ? `ROM registrado: ${romCtx}` : ''}

Evalúa en cada fotografía:
— PLANO ANTERIOR: nivelación de hombros y pelvis, alineación de rodillas, postura global
— PLANO POSTERIOR: asimetría escapular, escoliosis, alineación axial
— PLANO LATERAL: hiperlordosis/cifosis, posición de cabeza, proyección abdominal

Entrega el informe con estas secciones:
1. HALLAZGOS OBSERVADOS POR VISTA
2. IMPRESIÓN BIOMECÁNICA GLOBAL
3. DIAGNÓSTICO POSTURAL KINESIOLÓGICO (con código CIE-10 sugerido)
4. OBJETIVOS DE TRATAMIENTO PRIORIZADOS (máx. 5)
5. PLAN KINESIOLÓGICO SUGERIDO

AL FINAL del informe, agrega un bloque de código \`\`\`json con este esquema EXACTO
(estimaciones cuantitativas a partir de lo observado; 4-8 métricas y 3-5 simetrías):
\`\`\`json
{
  "metricas": [{ "nombre": "Inclinación pélvica", "valor": 2, "unidad": "cm",
    "rango_normal": [0, 1], "umbral_riesgo": 4,
    "severidad": "normal|atencion|riesgo", "zona": "pelvis",
    "comentario": "breve explicación clínica" }],
  "simetrias": [{ "zona": "Hombros", "izquierda": "hallazgo lado izq",
    "derecha": "hallazgo lado der", "diferencia": "1 cm", "severidad": "atencion" }],
  "impresion_global": "…", "diagnostico": "…", "cie10": "…",
  "objetivos": ["…"], "plan": ["…"]
}
\`\`\``;

      const result = await askClaudeWithImages(
        analysisImages,
        prompt,
        "Eres un kinesiólogo clínico experto en análisis postural y biomecánico. Analiza las fotografías proporcionadas y genera un informe técnico profesional en español. Describe lo que observas visualmente en cada imagen con precisión clínica. Las métricas del bloque JSON son estimaciones visuales cuantificadas: sé consistente entre el texto y el JSON.",
        4096
      );

      // Separar el bloque JSON estructurado (informe visual) del texto narrativo
      const jsonMatch = (result || '').match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]) as BiomechReportData;
          if (Array.isArray(parsed.metricas)) {
            setBiomechReport({ ...parsed, generado: new Date().toISOString(), tipo: analysisType });
          }
        } catch { /* JSON malformado: el informe de texto sigue siendo útil */ }
      }
      const narrative = (result || '').replace(/```json[\s\S]*?```/, '').trim();
      setAnalysisResult(narrative || 'El análisis no pudo ser completado.');
    } catch (error) {
      console.error(error);
      setAnalysisResult('Error al procesar el análisis. Verifica que ANTHROPIC_API_KEY esté configurada en Vercel.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const uploadSlotRef = useRef<number>(-1); // -1 = append, 0-3 = slot específico

  // Extrae N fotogramas de un video local vía <video>+<canvas>. La API de visión
  // analiza imágenes (no video): los fotogramas entran al mismo pipeline y sirven
  // para evaluar marcha, sentadilla u otros movimientos.
  const extractVideoFrames = (file: File, count = 4): Promise<string[]> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      const frames: string[] = [];
      const positions = [0.15, 0.4, 0.65, 0.9].slice(0, count);
      let i = 0;
      const canvas = document.createElement('canvas');
      const fail = (msg: string) => { URL.revokeObjectURL(url); reject(new Error(msg)); };
      video.onerror = () => fail('No se pudo leer el video');
      video.onloadedmetadata = () => {
        if (!video.duration || !isFinite(video.duration)) return fail('Video sin duración');
        const scale = Math.min(1, 900 / (video.videoWidth || 900));
        canvas.width = Math.round((video.videoWidth || 900) * scale);
        canvas.height = Math.round((video.videoHeight || 1200) * scale);
        video.currentTime = positions[0] * video.duration;
      };
      video.onseeked = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return fail('Canvas no disponible');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.8));
        i++;
        if (i < positions.length) video.currentTime = positions[i] * video.duration;
        else { URL.revokeObjectURL(url); resolve(frames); }
      };
      video.src = url;
    });

  const handlePosturalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // ── VIDEO: se guarda en el registro clínico y se extraen fotogramas ──
    if (file.type.startsWith('video/')) {
      if (file.size > 60 * 1024 * 1024) { toast.error('El video supera los 60 MB. Graba un clip más corto.'); return; }
      toast.info('Procesando video: extrayendo fotogramas…');
      try {
        // El video original queda en el bucket privado como respaldo clínico
        const vext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
        const vpath = `${loggedPro?.id || 'unknown'}/${Date.now()}-video.${vext}`;
        supabase.storage.from('clinical-images').upload(vpath, file, { upsert: true })
          .then(({ error: vErr }) => { if (vErr) console.error('[video upload]', vErr.message); });

        const frames = await extractVideoFrames(file, 4);
        const slot = uploadSlotRef.current;
        setAnalysisImages(prev => {
          const next = [...prev];
          if (slot >= 0) {
            let s = slot;
            for (const f of frames) { if (s > 3) break; next[s] = f; s++; }
            return next.slice(0, 4);
          }
          return [...next, ...frames].slice(0, 4);
        });
        setIsDirtyTrue();
        toast.success(`Video procesado: ${frames.length} fotogramas listos para el análisis.`);
      } catch {
        toast.error('No se pudo procesar el video. Intenta con formato MP4.');
      }
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    // Bucket PRIVADO (Ley 21.719): fotos clínicas de pacientes nunca en bucket público.
    // RLS de storage acota la carpeta al profesional dueño; se accede con URL firmada.
    const path = `${loggedPro?.id || 'unknown'}/${Date.now()}.${ext}`;
    const { data: uploaded, error } = await supabase.storage
      .from('clinical-images')
      .upload(path, file, { upsert: true });
    if (error || !uploaded) {
      toast.error('No se pudo subir la imagen. Intenta de nuevo.');
      return;
    }
    const { data: signed, error: signErr } = await supabase.storage
      .from('clinical-images')
      .createSignedUrl(uploaded.path, 60 * 60 * 24 * 365 * 5); // 5 años
    if (signErr || !signed?.signedUrl) {
      toast.error('No se pudo generar el acceso a la imagen. Intenta de nuevo.');
      return;
    }
    const imageUrl = signed.signedUrl;
    const slot = uploadSlotRef.current;
    setAnalysisImages(prev => {
      const next = [...prev];
      if (slot >= 0) { next[slot] = imageUrl; return next; }
      return [...next, imageUrl].slice(0, 4);
    });
    setIsDirtyTrue();
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

  // ── Campos personalizados por sección ──────────────────────────────────────
  const addSectionField = (section: string) => {
    setSectionFields(prev => ({ ...prev, [section]: [...(prev[section] || []), { label: '', value: '' }] }));
    setIsDirtyTrue();
  };
  const updateSectionField = (section: string, index: number, key: 'label' | 'value' | 'color', val: string | undefined) => {
    setSectionFields(prev => {
      const list = [...(prev[section] || [])];
      list[index] = { ...list[index], [key]: val };
      return { ...prev, [section]: list };
    });
    setIsDirtyTrue();
  };
  const removeSectionField = (section: string, index: number) => {
    setSectionFields(prev => ({ ...prev, [section]: (prev[section] || []).filter((_, i) => i !== index) }));
    setIsDirtyTrue();
  };
  const moveSectionField = (section: string, index: number, dir: -1 | 1) => {
    setSectionFields(prev => {
      const list = [...(prev[section] || [])];
      const target = index + dir;
      if (target < 0 || target >= list.length) return prev;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...prev, [section]: list };
    });
    setIsDirtyTrue();
  };

  // Rota entre los colores de acento; volver al primero limpia el color
  const cycleFieldColor = (current?: string): string | undefined => {
    const idx = FIELD_COLORS.indexOf(current || FIELD_COLORS[0]);
    const next = FIELD_COLORS[(idx + 1) % FIELD_COLORS.length];
    return next === FIELD_COLORS[0] ? undefined : next;
  };

  // ── ROM personalizable (labels, normales, colores, orden) ──
  const updateRomDef = (defId: string, patch: Partial<RomDef>) => {
    setRomDefs(prev => prev.map(d => d.id === defId ? { ...d, ...patch } : d));
    setIsDirtyTrue();
  };
  const addRomDef = () => {
    setRomDefs(prev => [...prev, { id: `rom-${Date.now()}`, label: '', normal: '' }]);
    setIsDirtyTrue();
  };
  const removeRomDef = (defId: string) => {
    setRomDefs(prev => prev.filter(d => d.id !== defId));
    setIsDirtyTrue();
  };
  const moveRomDef = (defId: string, dir: -1 | 1) => {
    setRomDefs(prev => {
      const idx = prev.findIndex(d => d.id === defId);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const list = [...prev];
      [list[idx], list[target]] = [list[target], list[idx]];
      return list;
    });
    setIsDirtyTrue();
  };

  // ── Tests especiales escogidos por el profesional ──
  const addTest = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setTestDefs(prev => prev.includes(clean) ? prev : [...prev, clean]);
    setIsDirtyTrue();
  };
  const removeTest = (name: string) => {
    setTestDefs(prev => prev.filter(t => t !== name));
    setIsDirtyTrue();
  };
  const renameTest = (oldName: string, newName: string) => {
    const clean = newName.trim();
    if (!clean || clean === oldName) return;
    setTestDefs(prev => {
      const renamed = prev.map(t => (t === oldName ? clean : t));
      return [...new Set(renamed)];
    });
    // Migra el resultado registrado en AMBAS evaluaciones (EV1 y EV2)
    setKiData(prev => {
      const migrate = (tests: Record<string, 'pos' | 'neg' | 'ne'>) => {
        if (!(oldName in tests)) return tests;
        const { [oldName]: v, ...rest } = tests;
        return { ...rest, [clean]: v };
      };
      return {
        ...prev,
        initial: { ...prev.initial, tests: migrate(prev.initial.tests) },
        final:   { ...prev.final,   tests: migrate(prev.final.tests) },
      };
    });
    setIsDirtyTrue();
  };

  // Función de render (no componente anidado: evita perder el foco al tipear).
  // Va ARRIBA de cada sección/subsección. Los campos usan EXACTAMENTE el patrón
  // visual de los campos nativos de la ficha (label uppercase + input redondeado),
  // con etiqueta, color y orden editables por el profesional.
  const renderSectionFields = (section: string) => {
    const fields = sectionFields[section] || [];
    return (
      <div className={fields.length === 0 ? 'mb-3 print:hidden' : 'mb-4'}>
        <button
          onClick={() => addSectionField(section)}
          className="text-[10px] font-black text-primary bg-primary/5 px-4 py-2 rounded-xl no-print hover:bg-primary/10 transition-all uppercase tracking-widest mb-3"
        >
          + Agregar campo
        </button>
        {fields.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {fields.map((cf, idx) => (
              <div key={idx} className="space-y-1 group/cf animate-in slide-in-from-left-4 duration-300">
                <div className="flex items-center gap-1">
                  <input
                    value={cf.label}
                    onChange={e => updateSectionField(section, idx, 'label', e.target.value)}
                    placeholder="Etiqueta..."
                    className="flex-1 min-w-0 text-[10px] font-black uppercase tracking-widest ml-1 bg-transparent border-none p-0 focus:ring-0"
                    style={{ color: cf.color || '#475569' }}
                  />
                  <div className="flex items-center shrink-0 opacity-30 group-hover/cf:opacity-100 focus-within:opacity-100 transition-all no-print">
                    <button onClick={() => moveSectionField(section, idx, -1)} disabled={idx === 0} title="Subir"
                      className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-primary disabled:opacity-20">
                      <span className="material-icons-round text-xs">arrow_upward</span>
                    </button>
                    <button onClick={() => moveSectionField(section, idx, 1)} disabled={idx === fields.length - 1} title="Bajar"
                      className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-primary disabled:opacity-20">
                      <span className="material-icons-round text-xs">arrow_downward</span>
                    </button>
                    <button onClick={() => updateSectionField(section, idx, 'color', cycleFieldColor(cf.color))} title="Cambiar color"
                      className="w-5 h-5 flex items-center justify-center">
                      <span className="w-3 h-3 rounded-full inline-block border border-slate-300" style={{ background: cf.color || '#94a3b8' }} />
                    </button>
                    <button onClick={() => removeSectionField(section, idx)} title="Eliminar"
                      className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-rose-500">
                      <span className="material-icons-round text-xs">delete</span>
                    </button>
                  </div>
                </div>
                <input
                  value={cf.value}
                  onChange={e => updateSectionField(section, idx, 'value', e.target.value)}
                  placeholder="Valor..."
                  className="w-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border rounded-2xl py-3 px-4 font-bold text-sm focus:ring-4 focus:ring-primary/10 transition-all print:bg-white text-slate-700"
                  style={{ borderColor: cf.color ? `${cf.color}66` : '#cbd5e1' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const fileList = Array.from(e.target.files);
      // Cap por archivo: los adjuntos se guardan como base64 dentro de la fila del
      // paciente. Un archivo enorme puede hacer fallar el guardado de TODA la ficha
      // (perdiendo el resto de lo editado). Límite conservador de 4 MB por archivo.
      const MAX_MB = 4;
      fileList.forEach((file: any) => {
        if (file.size > MAX_MB * 1024 * 1024) {
          toast.error(`"${file.name}" pesa ${(file.size / 1048576).toFixed(1)} MB. Máximo ${MAX_MB} MB por archivo (comprímelo o súbelo dividido).`);
          return;
        }
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
        // Kinesiología
        kinesio: { initial: kiData.initial, final: kiData.final },
        // Campos personalizados por sección (todas las especialidades)
        sectionFields,
        // Definiciones personalizadas de ROM y tests escogidos por el profesional
        romDefs,
        testDefs,
        // Informe biomecánico visual (IA)
        biomechReport,
        // Antecedentes mórbidos/quirúrgicos (antes solo vivían en la sesión de edición)
        morbidos,
        quirurgicos,
      };
    })(),
  } as Patient);

  // Mantiene el ref actualizado para que el auto-save siempre use los últimos valores
  buildPatientRef.current = buildUpdatedPatient;

  const handleSaveAttention = async () => {
    isSavingRef.current = true;
    setIsSaving(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const saved = await onUpdatePatient(buildUpdatedPatient());

    // Guardar versión SOAP inmutable (CENS RCE — historial de versiones)
    if (initialPatient?.id && loggedPro?.id && Object.values(soap).some(v => (v as string)?.trim())) {
      supabase.from('soap_versions').insert({
        patient_id: initialPatient.id,
        professional_id: loggedPro.id,
        soap_snapshot: soap,
        saved_by_name: loggedPro.name,
      }).then(({ data: _d, error: _e }) => {
        if (!_e) {
          const newVer = { saved_at: new Date().toISOString(), saved_by_name: loggedPro.name, soap_snapshot: soap };
          setSoapVersions(prev => [newVer, ...prev.slice(0, 4)]);
        }
      });
    }

    isSavingRef.current = false;
    setIsSaving(false);
    if (!saved) return; // el aviso de error ya lo muestra notifyWriteError; permanecemos en la ficha

    setIsDirty(false);
    setAutoSaveStatus('idle');
    toast.success(`Ficha de ${personalData.name} guardada correctamente`);
    navigate('/pro/patients');
  };

  if (!initialPatient) {
    return (
      <div className="flex w-full h-screen items-center justify-center bg-slate-100">
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
    <div className={`flex-1 flex flex-col min-h-0 w-full font-sans text-slate-900 ${specialtyKey === 'nutricion' ? 'bg-[#FDF2F8]' : 'bg-slate-100'}`}>
      <main className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar relative ${specialtyKey === 'nutricion' ? 'bg-[#FDF2F8]' : 'bg-white lg:bg-slate-100'}`}>
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 lg:px-8 py-3 lg:py-4 flex items-center justify-between gap-3 shadow-sm no-print">
          {/* Patient info */}
          <div className="flex items-center gap-3 lg:gap-6 min-w-0">
            <div className="w-10 h-10 lg:w-16 lg:h-16 rounded-xl lg:rounded-2xl overflow-hidden border-2 border-primary/30 shadow-md bg-primary/5 flex items-center justify-center shrink-0">
              <span className="material-icons-round text-slate-500 text-2xl lg:text-4xl">person</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm lg:text-2xl font-black text-slate-900 tracking-tight truncate">{personalData.name}</h1>
              <p className="text-[10px] lg:text-xs font-bold text-primary uppercase tracking-widest mt-0.5">Paciente Agenda Maslife Premium</p>
            </div>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-1.5 lg:gap-3 shrink-0">
            {/* Auto-save indicator — desktop only */}
            {autoSaveStatus !== 'idle' && (
              <span className={`hidden lg:flex text-[10px] font-black uppercase tracking-widest items-center gap-1 transition-all ${autoSaveStatus === 'saving' ? 'text-amber-500' : 'text-emerald-500'}`}>
                <span className={`material-icons-round text-sm ${autoSaveStatus === 'saving' ? 'animate-spin' : ''}`}>
                  {autoSaveStatus === 'saving' ? 'sync' : 'check_circle'}
                </span>
                {autoSaveStatus === 'saving' ? 'Auto-guardando...' : 'Guardado'}
              </span>
            )}
            {/* PDF */}
            <button
              onClick={handleExportFicha}
              className="p-2.5 lg:px-6 lg:py-5 rounded-xl lg:rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-600 shadow-sm hover:bg-rose-100 transition-all border-b-[3px] lg:border-b-4 border-rose-300 active:border-b-0 active:translate-y-1"
              title="Descargar Ficha como PDF"
            >
              <span className="material-icons-round text-lg">picture_as_pdf</span>
              <span className="hidden lg:inline">PDF</span>
            </button>
            {/* ORDEN */}
            <button
              onClick={() => setShowOrdenModal(true)}
              className="p-2.5 lg:px-6 lg:py-5 rounded-xl lg:rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 bg-sky-50 border border-sky-200 text-sky-600 shadow-sm hover:bg-sky-100 transition-all border-b-[3px] lg:border-b-4 border-sky-300 active:border-b-0 active:translate-y-1"
              title="Emitir Orden Profesional"
            >
              <span className="material-icons-round text-lg">assignment</span>
              <span className="hidden lg:inline">ORDEN</span>
            </button>
            {/* FHIR — desktop only */}
            <button
              onClick={handleExportFhir}
              className="hidden lg:flex px-6 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] items-center gap-2 bg-violet-50 border border-violet-200 text-violet-600 shadow-sm hover:bg-violet-100 transition-all border-b-4 border-violet-300 active:border-b-0 active:translate-y-1"
              title="Exportar registro en formato FHIR R4 (estándar interoperabilidad)"
            >
              <span className="material-icons-round text-lg">data_object</span>
              FHIR
            </button>
            {/* Compartir */}
            <div className="relative">
              <button
                onClick={handleShareWithPatient}
                disabled={shareLoading}
                className="p-2.5 lg:px-6 lg:py-5 rounded-xl lg:rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-600 shadow-sm hover:bg-emerald-100 transition-all border-b-[3px] lg:border-b-4 border-emerald-300 active:border-b-0 active:translate-y-1 disabled:opacity-50"
                title="Generar enlace de acceso temporal para el paciente (Ley 20.584)"
              >
                {shareLoading
                  ? <span className="inline-block w-4 h-4 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
                  : <span className="material-icons-round text-lg">share</span>
                }
                <span className="hidden lg:inline">COMPARTIR</span>
              </button>
              {shareLink && (
                <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 w-72 lg:w-80 space-y-3">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Enlace para el paciente (30 días)</p>
                  <div className="flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2">
                    <span className="text-xs text-slate-600 truncate flex-1">{shareLink}</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(shareLink); toast.success('Enlace copiado'); }}
                      className="text-primary hover:text-primary/80 shrink-0"
                    >
                      <span className="material-icons-round text-lg">content_copy</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">El paciente puede acceder a su ficha sin login durante 30 días.</p>
                  <button onClick={() => setShareLink(null)} className="text-[10px] text-slate-400 hover:text-slate-600">Cerrar</button>
                </div>
              )}
            </div>
            {/* Guardar */}
            <button
              onClick={handleSaveAttention}
              disabled={isSaving || !isDirty}
              className={`p-2.5 lg:px-10 lg:py-5 rounded-xl lg:rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 lg:gap-3 transition-all ${isDirty ? 'bg-emerald-600 text-white shadow-[0_10px_30px_-10px_rgba(16,185,129,0.5)] border-b-[3px] lg:border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1' : 'bg-slate-100 text-slate-400 border-b-[3px] lg:border-b-4 border-slate-200 cursor-not-allowed shadow-none'} disabled:opacity-70`}
            >
              <span className="material-icons-round text-lg">{isSaving ? 'sync' : 'save'}</span>
              <span className="hidden lg:inline">{isSaving ? 'Guardando...' : 'Guardar Ficha'}</span>
            </button>
            {/* AI Agent */}
            <button onClick={() => setShowAiPanel(true)} className="p-2.5 lg:px-10 lg:py-5 bg-primary text-white rounded-xl lg:rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 lg:gap-3 border-b-[3px] lg:border-b-4 border-blue-700 active:border-b-0 active:translate-y-1 shadow-[0_10px_30px_-10px_rgba(19,91,236,0.6)] hover:brightness-110 transition-all">
              <span className="material-icons-round text-lg">auto_awesome</span>
              <span className="hidden lg:inline">AgenteMasLife</span>
            </button>
          </div>
        </header>

        <div className="hidden print:block mb-10 border-b-4 border-primary pb-6">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-4xl font-black text-slate-900 mb-2">FICHA CLÍNICA PROFESIONAL</h1>
              <p className="text-primary font-black tracking-widest uppercase text-sm">Agenda Maslife 🧡 Centro de Salud Integral</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Fecha de Emisión</p>
              <p className="text-lg font-black">{new Date().toLocaleDateString('es-CL')}</p>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto p-3 lg:p-6 space-y-4 lg:space-y-10 pb-24 print:p-0">
          {/* Consentimiento informado — Ley 20.584 / CENS RCE.
              Aviso + panel para generar/compartir el enlace de firma y ver su estado. */}
          <div className="no-print space-y-3">
            {consentWarning && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-2xl px-5 py-4">
                <span className="material-icons-round text-amber-500 text-lg shrink-0 mt-0.5">warning</span>
                <div className="flex-1">
                  <p className="text-xs font-black text-amber-800">Sin consentimiento informado aceptado</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Este paciente aún no firma su consentimiento informado (requerido por Ley 20.584 y CENS RCE). Genera el enlace aquí abajo y compártelo por WhatsApp — el paciente firma desde su teléfono en 1 minuto.
                  </p>
                </div>
              </div>
            )}
            {loggedPro && initialPatient?.id && (
              <ConsentSendPanel
                patient={safePatient}
                loggedPro={loggedPro}
                existingConsent={existingConsent}
                onSent={c => { setExistingConsent(c); setConsentWarning(true); }}
              />
            )}
          </div>

          <section className="bg-white rounded-2xl lg:rounded-[3rem] p-4 lg:p-10 shadow-[0_8px_32px_-4px_rgba(15,23,42,0.10)] border border-slate-200 print:border-none print:shadow-none">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-700 border-l-4 border-primary pl-4">Identificación del Paciente</h2>
              <button onClick={addCustomField} className="text-xs font-black text-primary bg-primary/5 px-6 py-3 rounded-xl no-print hover:bg-primary/10 transition-all">+ AGREGAR CAMPO</button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
              {[
                { label: 'Nombre Completo', val: personalData.name, k: 'name' },
                { label: 'RUT / ID', val: personalData.rut, k: 'rut' },
                { label: 'Edad', val: personalData.age, k: 'age', t: 'number' },
                { label: 'Nacimiento', val: personalData.birthDate, k: 'birthDate', t: 'date' },
                { label: 'Previsión', val: personalData.prevision, k: 'prevision' },
                { label: 'Teléfono', val: personalData.phone, k: 'phone' }
              ].map(f => (
                <div key={f.k} className="space-y-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">{f.label}</label>
                  <input
                    type={f.t || 'text'}
                    value={f.val}
                    onChange={e => { setPersonalData({ ...personalData, [f.k]: f.t === 'number' ? Number(e.target.value) : e.target.value }); setIsDirtyTrue(); }}
                    className={`w-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border border-slate-300 rounded-2xl py-4 px-5 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all print:bg-white text-slate-700`}
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
                      className="text-[10px] font-black text-slate-600 uppercase tracking-widest bg-transparent border-none p-0 focus:ring-0 w-2/3"
                    />
                    <button onClick={() => { removeCustomField(idx); setIsDirtyTrue(); }} className="opacity-0 group-hover:opacity-100 text-rose-500 no-print transition-all">
                      <span className="material-icons-round text-xs">delete</span>
                    </button>
                  </div>
                  <input
                    value={cf.value}
                    onChange={e => { updateCustomField(idx, 'value', e.target.value); setIsDirtyTrue(); }}
                    className="w-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border border-slate-300 rounded-2xl py-4 px-5 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all print:bg-white text-slate-700"
                  />
                </div>
              ))}

              <div className="lg:col-span-3 space-y-2">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Diagnóstico Principal</label>
                <input value={personalData.diagnoses} onChange={e => { setPersonalData({ ...personalData, diagnoses: e.target.value }); setIsDirtyTrue(); }} className="w-full bg-primary/5 text-primary shadow-inner border border-primary/20 rounded-2xl py-5 px-6 font-black text-lg print:bg-white" placeholder="Ej: Esguince de tobillo grado II..." />
              </div>
            </div>
          </section>

          {specialtyKey === 'kinesiologia' && (<>

          {/* ── Tabs EV1 / EV2 / Comparar ──────────────────────────────────── */}
          <div className="flex flex-wrap gap-2 no-print">
            {(['initial', 'final', 'compare'] as const).map(tab => (
              <button key={tab} onClick={() => setKiEvalTab(tab)}
                className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all border ${
                  kiEvalTab === tab
                    ? tab === 'compare' ? 'bg-slate-800 text-white border-slate-800 shadow-md' : tab === 'initial' ? 'bg-primary text-white border-primary shadow-md' : 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                    : 'bg-white text-slate-400 border-slate-200 hover:border-primary hover:text-primary'
                }`}>
                {tab === 'initial' ? 'EV1 — Inicial' : tab === 'final' ? 'EV2 — Final' : 'Comparar EV1 vs EV2'}
              </button>
            ))}
          </div>

          {kiEvalTab !== 'compare' && (<>
          {/* ── Evaluación Kinesiológica ──────────────────────────────────── */}
          <section className="bg-white rounded-2xl lg:rounded-[3rem] p-4 lg:p-10 shadow-[0_8px_32px_-4px_rgba(15,23,42,0.10)] border border-slate-200 overflow-hidden relative space-y-10">
            {/* Header */}
            <div className="flex flex-wrap justify-between items-start gap-4">
              <div>
                <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-700 border-l-4 border-primary pl-4">
                  {kiEvalTab === 'initial' ? 'Evaluación Kinesiológica — EV1 Inicial' : 'Evaluación Kinesiológica — EV2 Final'}
                </h2>
                <p className="text-xs font-bold text-primary uppercase mt-2 tracking-widest pl-5">Análisis postural · ROM · Tests especiales · Visión IA real</p>
              </div>
            </div>

            {/* ── 1. Datos Antropométricos ─────────────────────── */}
            <div>
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest border-l-4 border-primary pl-3 mb-4">Datos Antropométricos</h3>
              {renderSectionFields('ki-antropometria')}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Peso (kg)', key: 'weight', placeholder: '70' },
                  { label: 'Talla (cm)', key: 'height', placeholder: '170' },
                  { label: 'Envergadura (cm)', key: 'reach', placeholder: '172' },
                  { label: 'Long. MMII Der. (cm)', key: 'legR', placeholder: '88' },
                  { label: 'Long. MMII Izq. (cm)', key: 'legL', placeholder: '88' },
                ].map(({ label, key, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">{label}</label>
                    <input
                      type="number"
                      value={(kiAnthro as any)[key]}
                      onChange={e => { setKiAnthro(p => ({ ...p, [key]: e.target.value })); setIsDirtyTrue(); }}
                      placeholder={placeholder}
                      className="w-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border border-slate-300 rounded-2xl py-3 px-4 font-bold text-sm focus:ring-4 focus:ring-primary/10 transition-all text-slate-700"
                    />
                  </div>
                ))}
                {/* IMC y discrepancia calculados */}
                {kiImc && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">IMC</label>
                    <div className="w-full bg-primary/5 border border-primary/20 rounded-2xl py-3 px-4 font-black text-primary text-sm">{kiImc} kg/m²</div>
                  </div>
                )}
                {kiDiscrep && Number(kiDiscrep) > 0 && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Discrepancia MMII</label>
                    <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl py-3 px-4 font-black text-amber-700 text-sm">{kiDiscrep} cm</div>
                  </div>
                )}
              </div>
            </div>

            {/* ── 2. Evaluación Postural Estructurada ──────────── */}
            <div>
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest border-l-4 border-primary pl-3 mb-4">Evaluación Postural Estructurada</h3>
              {renderSectionFields('ki-postural')}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {([
                  { label: 'Plomada Sagital', key: 'plomadaSag', options: ['Normal','Hiperlordosis lumbar','Inversión lumbar','Hipercifosis dorsal','Rectificación lumbar','Cabeza adelantada'] },
                  { label: 'Plomada Frontal', key: 'plomadaFront', options: ['Normal','Escoliosis dextro-convexa','Escoliosis levo-convexa','Inclinación lateral Der.','Inclinación lateral Izq.'] },
                  { label: 'Hombros', key: 'shoulders', options: ['Normal','Elevado Der.','Elevado Izq.','Protracción bilateral','Protracción unilateral Der.','Protracción unilateral Izq.','Retroversión bilateral'] },
                  { label: 'Escápulas', key: 'scapulas', options: ['Normal','Aladas bilaterales','Aladas Der.','Aladas Izq.','Abducidas (protruidas)','Aducidas (retruidas)'] },
                  { label: 'Pelvis', key: 'pelvis', options: ['Normal','Anteversión','Retroversión','Oblicuidad Der. alta','Oblicuidad Izq. alta','Rotación anterior Der.','Rotación anterior Izq.'] },
                  { label: 'Rodillas', key: 'knees', options: ['Normal','Valgo bilateral','Varo bilateral','Valgo Der.','Valgo Izq.','Hiperextensión bilateral','Flexo bilateral'] },
                  { label: 'Pies', key: 'feet', options: ['Normal','Pronación bilateral','Supinación bilateral','Pie plano bilateral','Pie cavo bilateral','Pronación unilateral Der.','Pronación unilateral Izq.'] },
                ] as { label: string; key: keyof typeof kiPostural; options: string[] }[]).map(({ label, key, options }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">{label}</label>
                    <select
                      value={(kiPostural as any)[key]}
                      onChange={e => { setKiPostural(p => ({ ...p, [key]: e.target.value })); setIsDirtyTrue(); }}
                      className="w-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border border-slate-300 rounded-2xl py-3 px-4 font-bold text-sm focus:ring-4 focus:ring-primary/10 transition-all text-slate-700 appearance-none"
                    >
                      <option value="">— Sin evaluar —</option>
                      {options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Observaciones Posturales</label>
                <textarea
                  value={kiPostural.observations}
                  onChange={e => { setKiPostural(p => ({ ...p, observations: e.target.value })); setIsDirtyTrue(); }}
                  rows={2}
                  placeholder="Observaciones adicionales del análisis postural..."
                  className="w-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border border-slate-300 rounded-2xl py-3 px-4 font-bold text-sm focus:ring-4 focus:ring-primary/10 transition-all text-slate-700 resize-none"
                />
              </div>
            </div>

            {/* ── 3. ROM ─────────────────────────────────────────── */}
            <div>
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest border-l-4 border-primary pl-3 mb-4">Rango de Movimiento (ROM) en grados</h3>
              {renderSectionFields('ki-rom')}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {romDefs.map((def, idx) => (
                  <div key={def.id} className="space-y-1 group/rom">
                    <div className="flex items-center gap-1">
                      <input
                        value={def.label}
                        onChange={e => updateRomDef(def.id, { label: e.target.value })}
                        placeholder="Nombre..."
                        className="flex-1 min-w-0 text-[10px] font-black uppercase tracking-widest ml-1 bg-transparent border-none p-0 focus:ring-0"
                        style={{ color: def.color || '#475569' }}
                      />
                      <span className="text-[10px] font-black text-slate-400 shrink-0">(N:</span>
                      <input
                        value={def.normal}
                        onChange={e => updateRomDef(def.id, { normal: e.target.value })}
                        className="w-7 shrink-0 text-[10px] font-black text-slate-400 bg-transparent border-none p-0 focus:ring-0 text-center"
                      />
                      <span className="text-[10px] font-black text-slate-400 shrink-0">°)</span>
                      <div className="flex items-center shrink-0 opacity-30 group-hover/rom:opacity-100 focus-within:opacity-100 transition-all no-print">
                        <button onClick={() => moveRomDef(def.id, -1)} disabled={idx === 0} title="Subir"
                          className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-primary disabled:opacity-20">
                          <span className="material-icons-round text-xs">arrow_upward</span>
                        </button>
                        <button onClick={() => moveRomDef(def.id, 1)} disabled={idx === romDefs.length - 1} title="Bajar"
                          className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-primary disabled:opacity-20">
                          <span className="material-icons-round text-xs">arrow_downward</span>
                        </button>
                        <button onClick={() => updateRomDef(def.id, { color: cycleFieldColor(def.color) })} title="Cambiar color"
                          className="w-5 h-5 flex items-center justify-center">
                          <span className="w-3 h-3 rounded-full inline-block border border-slate-300" style={{ background: def.color || '#94a3b8' }} />
                        </button>
                        <button onClick={() => removeRomDef(def.id)} title="Eliminar"
                          className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-rose-500">
                          <span className="material-icons-round text-xs">delete</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={kiRom[def.id] || ''}
                        onChange={e => { setKiRom(p => ({ ...p, [def.id]: e.target.value })); setIsDirtyTrue(); }}
                        placeholder={def.normal}
                        className="w-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border rounded-2xl py-3 px-3 font-bold text-sm focus:ring-4 focus:ring-primary/10 transition-all text-slate-700"
                        style={{ borderColor: def.color ? `${def.color}66` : '#cbd5e1' }}
                      />
                      <span className="text-xs font-black text-slate-400">°</span>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={addRomDef}
                className="mt-3 text-[10px] font-black text-primary bg-primary/5 px-4 py-2 rounded-xl no-print hover:bg-primary/10 transition-all uppercase tracking-widest"
              >
                + Agregar campo ROM
              </button>
            </div>

            {/* ── 4. Tests Especiales ────────────────────────────── */}
            <div>
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest border-l-4 border-primary pl-3 mb-4">Tests Especiales</h3>
              {renderSectionFields('ki-tests')}
              {/* Selector de zona afectada → tests recomendados */}
              <div className="mb-4 space-y-3 no-print">
                <div className="flex flex-wrap gap-2">
                  {Object.keys(TEST_CATALOG).map(region => (
                    <button
                      key={region}
                      onClick={() => setTestRegion(r => r === region ? '' : region)}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                        testRegion === region
                          ? 'bg-primary text-white border-primary shadow-sm'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-primary/40 hover:text-primary'
                      }`}
                    >
                      {region}
                    </button>
                  ))}
                </div>
                {testRegion && (
                  <div className="flex flex-wrap items-center gap-2 p-3 bg-primary/5 rounded-2xl border border-primary/10">
                    <p className="w-full text-[9px] font-black text-primary uppercase tracking-widest">Tests recomendados — {testRegion}</p>
                    {TEST_CATALOG[testRegion].filter(t => !testDefs.includes(t)).map(t => (
                      <button
                        key={t}
                        onClick={() => addTest(t)}
                        className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-white text-slate-600 border border-slate-200 hover:border-primary hover:text-primary transition-all"
                      >
                        + {t}
                      </button>
                    ))}
                    {TEST_CATALOG[testRegion].every(t => testDefs.includes(t)) && (
                      <p className="text-[10px] text-slate-400 italic">Todos los tests de esta zona ya están agregados.</p>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    value={customTestName}
                    onChange={e => setCustomTestName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { addTest(customTestName); setCustomTestName(''); } }}
                    placeholder="Agregar otro test (nombre propio)..."
                    className="flex-1 bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border border-slate-300 rounded-2xl py-3 px-4 font-bold text-sm focus:ring-4 focus:ring-primary/10 transition-all text-slate-700"
                  />
                  <button
                    onClick={() => { addTest(customTestName); setCustomTestName(''); }}
                    disabled={!customTestName.trim()}
                    className="px-5 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40 transition-all"
                  >
                    Agregar
                  </button>
                </div>
              </div>

              {testDefs.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">Escoge la zona afectada del paciente para ver los tests recomendados, o agrega uno propio.</p>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  {testDefs.map(test => (
                    <div key={test} className="bg-slate-50 rounded-2xl p-3 border border-slate-200 group/test">
                      <div className="flex items-center gap-1 mb-2">
                        <input
                          defaultValue={test}
                          onBlur={e => { const nn = e.target.value.trim(); if (nn && nn !== test) renameTest(test, nn); else e.target.value = test; }}
                          className="flex-1 min-w-0 text-[10px] font-black text-slate-600 uppercase tracking-widest bg-transparent border-none p-0 focus:ring-0"
                        />
                        <button
                          onClick={() => removeTest(test)}
                          title="Quitar test"
                          className="shrink-0 w-5 h-5 flex items-center justify-center text-slate-300 hover:text-rose-500 opacity-40 group-hover/test:opacity-100 transition-all no-print"
                        >
                          <span className="material-icons-round text-xs">close</span>
                        </button>
                      </div>
                      <div className="flex gap-1">
                        {(['pos','neg','ne'] as const).map(v => (
                          <button
                            key={v}
                            onClick={() => { setKiTests(p => ({ ...p, [test]: v })); setIsDirtyTrue(); }}
                            className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all ${
                              kiTests[test] === v
                                ? v === 'pos' ? 'bg-rose-500 text-white shadow-sm'
                                  : v === 'neg' ? 'bg-emerald-500 text-white shadow-sm'
                                  : 'bg-slate-600 text-white shadow-sm'
                                : 'bg-white text-slate-400 border border-slate-200 hover:border-slate-300'
                            }`}
                          >{v === 'ne' ? 'N/E' : v.charAt(0).toUpperCase() + v.slice(1)}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ── Análisis Biomecánico con IA (fotos + resultado) ── */}
          <section className="bg-white rounded-2xl lg:rounded-[3rem] p-4 lg:p-10 shadow-[0_8px_32px_-4px_rgba(15,23,42,0.10)] border border-slate-200 overflow-hidden relative">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-10">
              <div>
                <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-700 border-l-4 border-primary pl-4">Análisis Biomecánico con IA</h2>
                <p className="text-xs font-bold text-primary uppercase mt-2 tracking-widest pl-5">Claude Vision — procesa las fotografías reales del paciente</p>
              </div>
              <div className="flex bg-slate-50/80 shadow-inner border border-slate-200 p-2 rounded-2xl no-print">
                {(['Postural', 'Marcha', 'Musculoesquelético'] as const).map(t => (
                  <button key={t} onClick={() => setAnalysisType(t)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all ${analysisType === t ? 'bg-white shadow-sm border border-slate-100 text-primary scale-105' : 'text-slate-400 hover:text-slate-600'}`}>{t}</button>
                ))}
              </div>
            </div>
            {renderSectionFields('biomecanica')}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-6">
                {/* Slots etiquetados */}
                <div className="grid grid-cols-2 gap-4">
                  {(['Anterior','Posterior','Lateral Der.','Lateral Izq.'] as const).map((label, idx) => (
                    <div key={label} className="space-y-1">
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest text-center">{label}</p>
                      {analysisImages[idx] ? (
                        <div className="relative aspect-square rounded-[2rem] overflow-hidden border-4 border-slate-50 shadow-md group cursor-pointer" onClick={() => { uploadSlotRef.current = idx; posturalInputRef.current?.click(); }}>
                          <img src={analysisImages[idx]} className="w-full h-full object-cover" alt={label} />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                            <button onClick={e => { e.stopPropagation(); uploadSlotRef.current = idx; posturalInputRef.current?.click(); }} className="w-8 h-8 bg-white text-slate-700 rounded-lg flex items-center justify-center shadow-xl no-print" title="Reemplazar">
                              <span className="material-icons-round text-sm">refresh</span>
                            </button>
                            <button onClick={e => { e.stopPropagation(); removeAnalysisImage(idx); }} className="w-8 h-8 bg-rose-500 text-white rounded-lg flex items-center justify-center shadow-xl no-print" title="Eliminar">
                              <span className="material-icons-round text-sm">close</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { uploadSlotRef.current = idx; posturalInputRef.current?.click(); }} className="aspect-square w-full rounded-[2rem] border-4 border-dashed border-slate-100 bg-slate-50 flex flex-col items-center justify-center gap-2 text-slate-300 hover:border-primary hover:text-primary transition-all no-print group">
                          <span className="material-icons-round text-3xl group-hover:scale-110 transition-transform">add_a_photo</span>
                          <span className="text-[9px] font-black uppercase tracking-widest">Cargar</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <input type="file" ref={posturalInputRef} onChange={handlePosturalUpload} className="hidden" accept="image/*,video/mp4,video/quicktime,video/webm" />

                <button
                  onClick={runAdvancedAnalysis}
                  disabled={isAnalyzing || analysisImages.filter(Boolean).length === 0}
                  className="w-full py-6 bg-slate-900 border-b-4 border-slate-800 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] active:border-b-0 active:translate-y-1 hover:brightness-110 transition-all disabled:opacity-50 disabled:translate-y-0 disabled:border-b-4 no-print"
                >
                  <span className={`material-icons-round ${isAnalyzing ? 'animate-spin' : ''}`}>{isAnalyzing ? 'sync' : 'biotech'}</span>
                  {isAnalyzing ? 'Procesando imágenes con IA...' : `Ejecutar Análisis ${analysisType}`}
                </button>

                <button
                  onClick={() => setShowBiomechReport(true)}
                  disabled={!biomechReport}
                  title={biomechReport ? 'Ver informe biomecánico visual' : 'Ejecuta primero un análisis con IA'}
                  className="w-full py-5 bg-gradient-to-r from-amber-400 to-amber-500 border-b-4 border-amber-600 text-slate-950 rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-[0_10px_30px_-10px_rgba(245,158,11,0.5)] active:border-b-0 active:translate-y-1 hover:brightness-105 transition-all disabled:opacity-40 disabled:translate-y-0 disabled:border-b-4 no-print"
                >
                  <span className="material-icons-round">insights</span>
                  Informe Visual — Postura · Simetrías · ROM
                </button>
              </div>

              <div className="bg-slate-50 rounded-xl lg:rounded-[2.5rem] p-4 lg:p-10 border border-slate-100 min-h-[200px] lg:min-h-[350px] flex flex-col shadow-inner relative">
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
                    analysisResult || <div className="text-center py-20 text-slate-300 italic">Cargue fotografías posturales y ejecute el análisis para que la IA evalúe lo que ve en las imágenes reales.</div>
                  )}
                </div>
              </div>
            </div>
          </section>
          </>)}

          {/* ── Vista Comparativa EV1 vs EV2 ─────────────────────────────── */}
          {kiEvalTab === 'compare' && (
          <section className="bg-white rounded-2xl lg:rounded-[3rem] p-4 lg:p-10 shadow-[0_8px_32px_-4px_rgba(15,23,42,0.10)] border border-slate-200 overflow-hidden relative space-y-10">
            <div>
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-700 border-l-4 border-slate-800 pl-4">Comparación EV1 vs EV2</h2>
              <p className="text-xs font-bold text-slate-500 uppercase mt-2 tracking-widest pl-5">Evolución kinesiológica del paciente</p>
            </div>
            {renderSectionFields('comparacion')}

            {/* Fotos comparativas */}
            <div>
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest border-l-4 border-slate-400 pl-3 mb-4">Fotografías Comparativas</h3>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'auto repeat(4, 1fr)' }}>
                <div></div>
                {(['Anterior','Posterior','Lat. Der.','Lat. Izq.'] as const).map(l => (
                  <div key={l} className="text-[9px] font-black text-slate-400 uppercase text-center tracking-widest pb-1">{l}</div>
                ))}
                {(['initial','final'] as const).map(ev => (<React.Fragment key={ev}>
                  <div className={`text-[9px] font-black uppercase tracking-widest flex items-center pr-2 ${ev === 'initial' ? 'text-primary' : 'text-emerald-600'}`}>{ev === 'initial' ? 'EV1' : 'EV2'}</div>
                  {[0,1,2,3].map(idx => (
                    <div key={idx}>
                      {kiData[ev].images[idx] ? (
                        <div className={`aspect-square rounded-2xl overflow-hidden border-2 shadow-sm ${ev === 'initial' ? 'border-primary/20' : 'border-emerald-200'}`}>
                          <img src={kiData[ev].images[idx]} className="w-full h-full object-cover" alt="" />
                        </div>
                      ) : (
                        <div className="aspect-square rounded-2xl border-2 border-dashed border-slate-100 bg-slate-50 flex items-center justify-center text-slate-200">
                          <span className="material-icons-round text-2xl">hide_image</span>
                        </div>
                      )}
                    </div>
                  ))}
                </React.Fragment>))}
              </div>
            </div>

            {/* Datos Antropométricos comparativos */}
            <div>
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest border-l-4 border-slate-400 pl-3 mb-4">Datos Antropométricos</h3>
              <div className="overflow-auto rounded-2xl border border-slate-100">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-black text-slate-500 uppercase tracking-wider">Parámetro</th>
                      <th className="px-4 py-3 font-black text-primary uppercase tracking-wider text-center">EV1</th>
                      <th className="px-4 py-3 font-black text-slate-400 uppercase tracking-wider text-center">Δ</th>
                      <th className="px-4 py-3 font-black text-emerald-600 uppercase tracking-wider text-center">EV2</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[
                      { label: 'Peso (kg)',            k: 'weight' as keyof KiAnthro },
                      { label: 'Talla (cm)',            k: 'height' as keyof KiAnthro },
                      { label: 'IMC (kg/m²)',           k: null },
                      { label: 'Envergadura (cm)',      k: 'reach'  as keyof KiAnthro },
                      { label: 'MMII Der. (cm)',        k: 'legR'   as keyof KiAnthro },
                      { label: 'MMII Izq. (cm)',        k: 'legL'   as keyof KiAnthro },
                      { label: 'Discrepancia MMII (cm)',k: null },
                    ].map(({ label, k }) => {
                      const isImc   = label.includes('IMC');
                      const isDiscrep = label.includes('Discrepancia');
                      const v1 = k ? kiData.initial.anthro[k] : isImc ? calcKiImc(kiData.initial.anthro) : calcKiDiscrep(kiData.initial.anthro);
                      const v2 = k ? kiData.final.anthro[k]   : isImc ? calcKiImc(kiData.final.anthro)   : calcKiDiscrep(kiData.final.anthro);
                      const delta = v1 && v2 ? (Number(v2) - Number(v1)).toFixed(1) : '';
                      const deltaNum = Number(delta);
                      return (
                        <tr key={label} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-bold text-slate-600">{label}</td>
                          <td className="px-4 py-3 text-center font-bold text-primary">{v1 || '—'}</td>
                          <td className={`px-4 py-3 text-center font-black ${!delta ? 'text-slate-300' : deltaNum > 0 ? 'text-emerald-600' : deltaNum < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                            {delta ? (deltaNum > 0 ? '+' : '') + delta : '—'}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-emerald-600">{v2 || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Evaluación Postural comparativa */}
            <div>
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest border-l-4 border-slate-400 pl-3 mb-4">Evaluación Postural</h3>
              <div className="overflow-auto rounded-2xl border border-slate-100">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-black text-slate-500 uppercase tracking-wider">Segmento</th>
                      <th className="px-4 py-3 font-black text-primary uppercase tracking-wider text-center">EV1</th>
                      <th className="px-4 py-3 font-black text-emerald-600 uppercase tracking-wider text-center">EV2</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {([
                      ['Plomada Sagital','plomadaSag'],['Plomada Frontal','plomadaFront'],
                      ['Hombros','shoulders'],['Escápulas','scapulas'],
                      ['Pelvis','pelvis'],['Rodillas','knees'],['Pies','feet'],
                    ] as [string, keyof KiPostural][]).map(([label, key]) => {
                      const p1 = kiData.initial.postural[key];
                      const p2 = kiData.final.postural[key];
                      const improved = p1 && p2 && p1 !== 'Normal' && p2 === 'Normal';
                      const worsened = p1 && p2 && p1 === 'Normal' && p2 !== 'Normal';
                      return (
                        <tr key={label} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-bold text-slate-600">{label}</td>
                          <td className="px-4 py-3 text-center font-bold text-primary">{p1 || '—'}</td>
                          <td className={`px-4 py-3 text-center font-bold ${improved ? 'text-emerald-600' : worsened ? 'text-rose-500' : 'text-slate-600'}`}>{p2 || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ROM comparativo */}
            <div>
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest border-l-4 border-slate-400 pl-3 mb-4">Rango de Movimiento (ROM)</h3>
              <div className="overflow-auto rounded-2xl border border-slate-100">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-black text-slate-500 uppercase tracking-wider">Movimiento</th>
                      <th className="px-4 py-3 font-black text-primary uppercase tracking-wider text-center">EV1 (°)</th>
                      <th className="px-4 py-3 font-black text-slate-400 uppercase tracking-wider text-center">Δ</th>
                      <th className="px-4 py-3 font-black text-emerald-600 uppercase tracking-wider text-center">EV2 (°)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {([
                      ['Cuello Flex.','CueFlex'],['Cuello Ext.','CueExt'],
                      ['Cuello Rot.D','CueRotD'],['Cuello Rot.I','CueRotI'],
                      ['Hombro Flex.','HomFlex'],['Hombro Abd.','HomAbd'],
                      ['Col. Flex.','ColFlex'],['Col. Ext.','ColExt'],
                      ['Cadera Flex.','CadFlex'],['Cadera Ext.','CadExt'],
                      ['Rodilla Flex.','RodFlex'],['Rodilla Ext.','RodExt'],
                      ['Tobillo Flex.','TobFlex'],['Tobillo Ext.','TobExt'],
                    ] as [string,string][]).filter(([,k]) => kiData.initial.rom[k] || kiData.final.rom[k]).map(([label, key]) => {
                      const r1 = kiData.initial.rom[key];
                      const r2 = kiData.final.rom[key];
                      const delta = r1 && r2 ? (Number(r2) - Number(r1)).toFixed(0) : '';
                      const dn = Number(delta);
                      return (
                        <tr key={label} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-bold text-slate-600">{label}</td>
                          <td className="px-4 py-3 text-center font-bold text-primary">{r1 || '—'}</td>
                          <td className={`px-4 py-3 text-center font-black ${!delta ? 'text-slate-300' : dn > 0 ? 'text-emerald-600' : dn < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                            {delta ? (dn > 0 ? '+' : '') + delta : '—'}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-emerald-600">{r2 || '—'}</td>
                        </tr>
                      );
                    })}
                    {!(['CueFlex','CueExt','CueRotD','CueRotI','HomFlex','HomAbd','ColFlex','ColExt','CadFlex','CadExt','RodFlex','RodExt','TobFlex','TobExt'].some(k => kiData.initial.rom[k] || kiData.final.rom[k])) && (
                      <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-300 italic">Sin datos de ROM registrados en ninguna evaluación</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tests Especiales comparativos */}
            <div>
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest border-l-4 border-slate-400 pl-3 mb-4">Tests Especiales</h3>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {(['Lasègue','Bragard','FABER','Thomas','Ober','Neer','Hawkins','Romberg','Trendelenburg','Apley'] as string[]).map(test => {
                  const t1 = kiData.initial.tests[test];
                  const t2 = kiData.final.tests[test];
                  const chip = (val: string | undefined) => {
                    if (!val) return <span className="px-2 py-0.5 rounded-lg text-[9px] font-black bg-slate-100 text-slate-300 uppercase">N/E</span>;
                    const color = val === 'pos' ? 'bg-rose-100 text-rose-600' : val === 'neg' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500';
                    return <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${color}`}>{val === 'ne' ? 'N/E' : val === 'pos' ? 'Pos' : 'Neg'}</span>;
                  };
                  return (
                    <div key={test} className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">{test}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[8px] text-primary font-black uppercase">EV1</span>
                          {chip(t1)}
                        </div>
                        <span className="material-icons-round text-slate-300 text-sm">arrow_forward</span>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[8px] text-emerald-600 font-black uppercase">EV2</span>
                          {chip(t2)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
          )}

          </>)}

          {/* ── Signos Vitales ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { l: 'FC (LPM)', k: 'heartRate', c: 'text-rose-500' },
              { l: 'SIS (MMHG)', k: 'systolic', c: 'text-primary' },
              { l: 'DIA (MMHG)', k: 'diastolic', c: 'text-blue-500' },
              { l: 'Sat O2 (%)', k: 'oxygenSaturation', c: 'text-teal-500' },
              { l: 'Temp (°C)', k: 'temperature', c: 'text-amber-500' }
            ].map(v => (
              <div key={v.k} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-[0_8px_32px_-4px_rgba(15,23,42,0.10)] text-center group hover:-translate-y-1 hover:shadow-xl transition-all">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4">{v.l}</p>
                <input type="number" value={(vitals as any)[v.k]} onChange={e => { setVitals({ ...vitals, [v.k]: Number(e.target.value) }); setIsDirtyTrue(); }} className={`w-full bg-transparent border-none p-0 text-4xl font-black ${v.c} text-center focus:ring-0`} />
              </div>
            ))}
          </div>

          {specialtyKey === 'nutricion' && (
          <section className="bg-white rounded-2xl lg:rounded-[3rem] p-4 lg:p-10 shadow-[0_8px_32px_-4px_rgba(15,23,42,0.10)] border border-slate-200 space-y-10">
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-700 border-l-4 border-emerald-500 pl-4">Evaluación Nutricional — Calculadora Clínica</h2>
            {renderSectionFields('nutricion')}

            {/* Inputs antropométricos */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
              {[
                { l: 'Peso (kg)',        v: nutPeso,    set: (n: number) => { setNutPeso(n);    setIsDirtyTrue(); } },
                { l: 'Talla (cm)',       v: nutTalla,   set: (n: number) => { setNutTalla(n);   setIsDirtyTrue(); } },
                { l: 'Circ. Cintura (cm)', v: nutCintura, set: (n: number) => { setNutCintura(n); setIsDirtyTrue(); } },
                { l: 'Circ. Cadera (cm)', v: nutCadera,  set: (n: number) => { setNutCadera(n);  setIsDirtyTrue(); } },
              ].map(f => (
                <div key={f.l} className="space-y-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{f.l}</label>
                  <input type="number" step="0.1" value={f.v || ''} onChange={e => f.set(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border border-slate-300 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all" />
                </div>
              ))}
            </div>

            {/* Género y nivel de actividad */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Género Biológico</label>
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
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Nivel de Actividad Física</label>
                <select value={nutActivity} onChange={e => { setNutActivity(e.target.value as ActivityLevel); setIsDirtyTrue(); }}
                  className="w-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border border-slate-300 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-emerald-500/10 transition-all">
                  {(Object.entries(ACTIVITY_FACTORS) as [ActivityLevel, { label: string; factor: number }][]).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Resultados calculados */}
            {nutMetrics ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { l: 'IMC',             val: nutMetrics.bmi,           unit: 'kg/m²', sub: nutMetrics.bmiClassification.label,  col: nutMetrics.bmiClassification.color },
                  { l: 'TMB (Mifflin)',   val: nutMetrics.bmr,           unit: 'kcal/día', sub: 'Tasa metabólica basal',          col: 'text-primary' },
                  { l: 'GET',             val: nutMetrics.totalCalories,  unit: 'kcal/día', sub: 'Gasto energético total',         col: 'text-teal-500' },
                  { l: 'Rel. C/C',        val: nutMetrics.whr || '—',     unit: '',      sub: nutMetrics.whrClassification.label, col: nutMetrics.whrClassification.color },
                ].map(card => (
                  <div key={card.l} className="bg-slate-50 rounded-[2rem] p-8 border border-slate-100 text-center shadow-inner">
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3">{card.l}</p>
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
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-700 border-l-4 border-emerald-400 pl-4">
                Composición Corporal Tetracompartimental
              </h3>

              {/* Inputs de porcentajes */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { l: 'Masa Grasa (%)',    v: nutMasaGrasaPct,    set: (n: number) => { setNutMasaGrasaPct(n);    setIsDirtyTrue(); } },
                  { l: 'Masa Adiposa (%)',  v: nutMasaAdiposaPct,  set: (n: number) => { setNutMasaAdiposaPct(n);  setIsDirtyTrue(); } },
                  { l: 'Masa Muscular (%)', v: nutMasaMuscularPct, set: (n: number) => { setNutMasaMuscularPct(n); setIsDirtyTrue(); } },
                  { l: 'Sum. 6 Pliegues (mm)', v: nutSum6Pliegues, set: (n: number) => { setNutSum6Pliegues(n); setIsDirtyTrue(); } },
                  { l: 'Sum. 8 Pliegues (mm)', v: nutSum8Pliegues, set: (n: number) => { setNutSum8Pliegues(n); setIsDirtyTrue(); } },
                ].map(f => (
                  <div key={f.l} className="space-y-2">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{f.l}</label>
                    <input type="number" step="0.01" value={f.v || ''} onChange={e => f.set(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border border-slate-300 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all" />
                  </div>
                ))}
              </div>

              {/* Cards calculadas (kg e Índice Muscular Óseo) */}
              {(nutMasaGrasaPct > 0 || nutMasaMuscularPct > 0) && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { l: 'Masa Grasa',      val: nutMasaGrasaKg,       unit: 'kg', col: 'text-rose-500' },
                    { l: 'Masa Adiposa',    val: nutMasaAdiposaKg,     unit: 'kg', col: 'text-orange-500' },
                    { l: 'Masa Muscular',   val: nutMasaMuscularKg,    unit: 'kg', col: 'text-emerald-600' },
                    { l: 'Índ. Musc. Óseo',val: nutIndiceMuscularOseo, unit: '',  col: 'text-blue-600' },
                  ].map(card => (
                    <div key={card.l} className="bg-slate-50 rounded-[2rem] p-6 border border-slate-100 text-center shadow-inner">
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">{card.l}</p>
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Objetivos Nutricionales</label>
                <textarea value={nutGoals} onChange={e => { setNutGoals(e.target.value); setIsDirtyTrue(); }} rows={4}
                  placeholder="Ej: Reducir peso corporal 5 kg en 3 meses, normalizar glicemia..."
                  className="w-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border border-slate-300 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-emerald-500/10 resize-none transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Suplementación Indicada</label>
                <textarea value={nutSupplements} onChange={e => { setNutSupplements(e.target.value); setIsDirtyTrue(); }} rows={4}
                  placeholder="Ej: Vitamina D 2000 UI/día, Omega-3 1g/día..."
                  className="w-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border border-slate-300 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-emerald-500/10 resize-none transition-all" />
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

          {specialtyKey === 'psicologia' && (
          <section className="bg-white rounded-2xl lg:rounded-[3rem] p-4 lg:p-10 shadow-[0_8px_32px_-4px_rgba(15,23,42,0.10)] border border-slate-200 space-y-8">
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-700 border-l-4 border-violet-500 pl-4">Evaluación Psicológica</h2>
            {renderSectionFields('psicologia')}

            {/* Escala de ánimo */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Escala de Ánimo Subjetivo (EVA Psicológica)</label>
                <span className={`text-3xl font-black ${psychMood <= 3 ? 'text-rose-500' : psychMood <= 6 ? 'text-amber-500' : 'text-emerald-500'}`}>{psychMood}/10</span>
              </div>
              <input type="range" min={0} max={10} step={1} value={psychMood}
                onChange={e => { setPsychMood(Number(e.target.value)); setIsDirtyTrue(); }}
                className="w-full accent-violet-500 h-3 rounded-full" />
              <div className="flex justify-between text-[10px] font-black text-slate-600 uppercase tracking-widest">
                <span>😔 Muy bajo</span><span>😐 Neutro</span><span>😊 Muy alto</span>
              </div>
            </div>

            {/* Antecedentes psiquiátricos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Antecedentes Psiquiátricos / Psicológicos</label>
                <textarea value={psychPsychHistory} onChange={e => { setPsychPsychHistory(e.target.value); setIsDirtyTrue(); }} rows={5}
                  placeholder="Diagnósticos previos, hospitalizaciones, intentos de autolesión, medicación psiquiátrica..."
                  className="w-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border border-slate-300 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-violet-500/10 resize-none transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Técnica / Intervención Aplicada</label>
                <textarea value={psychIntervention} onChange={e => { setPsychIntervention(e.target.value); setIsDirtyTrue(); }} rows={5}
                  placeholder="Ej: TCC — reestructuración cognitiva de pensamientos automáticos negativos. EMDR fase 3..."
                  className="w-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border border-slate-300 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-violet-500/10 resize-none transition-all" />
              </div>
            </div>

            {/* Objetivo próxima sesión */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Objetivo Próxima Sesión</label>
              <textarea value={psychNextObjective} onChange={e => { setPsychNextObjective(e.target.value); setIsDirtyTrue(); }} rows={3}
                placeholder="Ej: Trabajar exposición gradual a situaciones sociales. Revisar registro de pensamientos..."
                className="w-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.07)] border border-slate-300 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-violet-500/10 resize-none transition-all" />
            </div>
          </section>
          )}

          {/* ── Nota Clínica SOAP ── */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-10">
            <div className="lg:col-span-2">{renderSectionFields('soap')}</div>
            {(SOAP_LABELS[specialtyKey] || SOAP_LABELS.kinesiologia).map(f => (
              <div key={f.k} className="bg-white rounded-[3rem] border border-slate-200 shadow-[0_8px_32px_-4px_rgba(15,23,42,0.10)] overflow-hidden flex flex-col group hover:-translate-y-1 hover:shadow-xl transition-all">
                <div className="px-10 py-6 bg-slate-50/50 border-b border-slate-100 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl ${f.bg} text-white flex items-center justify-center font-black text-sm shadow-sm`}>{f.c}</div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-800">{f.l}</h4>
                </div>
                <textarea
                  value={soap[f.k as keyof typeof soap] || ''}
                  onChange={e => { setSoap({ ...soap, [f.k]: e.target.value }); setIsDirtyTrue(); }}
                  className="p-4 lg:p-10 h-40 lg:h-56 border-none text-sm font-bold text-slate-600 focus:ring-4 focus:ring-primary/5 inset-0 resize-none leading-relaxed"
                  placeholder={f.ph}
                />
              </div>
            ))}
          </section>

          <section className="bg-white rounded-2xl lg:rounded-[3rem] p-4 lg:p-10 shadow-[0_8px_32px_-4px_rgba(15,23,42,0.10)] border border-slate-200">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-700 border-l-4 border-primary pl-4">Objetivos del Tratamiento</h2>
              <button onClick={addGoal} className="text-[10px] bg-teal-500 text-white shadow-[0_10px_30px_-10px_rgba(20,184,166,0.5)] border-b-4 border-teal-700 px-6 py-4 rounded-xl font-black uppercase tracking-widest active:border-b-0 active:translate-y-1 hover:brightness-110 transition-all no-print flex items-center gap-2">
                <span className="material-icons-round text-sm">add</span> NUEVO OBJETIVO
              </button>
            </div>
            {renderSectionFields('objetivos')}
            <div className="space-y-8">
              {goals.map((obj) => (
                <div key={obj.id} className="p-8 rounded-[2rem] bg-slate-50/50 border border-slate-100 relative print:bg-white animate-in zoom-in-95 group">
                  <button onClick={() => { setGoals(goals.filter(g => g.id !== obj.id)); setIsDirtyTrue(); }} className="absolute top-8 right-8 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 no-print transition-all"><span className="material-icons-round">delete</span></button>
                  <div className="flex flex-col lg:flex-row gap-5 lg:gap-10 items-start">
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

          <section className="bg-white rounded-2xl lg:rounded-[3rem] p-4 lg:p-10 shadow-[0_8px_32px_-4px_rgba(15,23,42,0.10)] border border-slate-200">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-700 border-l-4 border-primary pl-4">Documentos y Exámenes</h2>
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
            {renderSectionFields('documentos')}
            {files.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {files.map(file => (
                  <div key={file.id} className="p-6 rounded-[2rem] bg-slate-50/80 shadow-sm border border-slate-200 flex items-center gap-4 group hover:bg-white hover:shadow-xl transition-all relative cursor-pointer">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${file.type === 'pdf' ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'bg-blue-50 text-blue-500 border border-blue-100'}`}>
                      <span className="material-icons-round text-2xl">
                        {file.type === 'pdf' ? 'picture_as_pdf' : 'image'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm text-slate-800 truncate">{file.name}</p>
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">
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

          <section className="bg-white rounded-2xl lg:rounded-[3rem] p-4 lg:p-10 shadow-[0_8px_32px_-4px_rgba(15,23,42,0.10)] border border-slate-200">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-700 border-l-4 border-primary pl-4">Bitácora de Evolución</h2>
              <button onClick={addSessionLog} className="text-[10px] bg-white border-b-4 border-slate-200 text-primary shadow-sm px-6 py-4 rounded-xl font-black uppercase tracking-widest active:border-b-0 active:translate-y-1 hover:bg-slate-50 transition-all no-print flex items-center gap-2">
                <span className="material-icons-round text-sm">add</span> NUEVA SESIÓN
              </button>
            </div>
            {renderSectionFields('bitacora')}
            <div className="space-y-6">
              {sessionLogs.map(log => (
                <div key={log.id} className="flex gap-8 relative group">
                  <div className="w-px bg-slate-200 absolute left-[58px] top-10 bottom-0 print:hidden"></div>
                  <div className="shrink-0 w-[116px] text-right pt-2">
                    <input type="date" value={log.date} onChange={e => { setSessionLogs(sessionLogs.map(s => s.id === log.id ? { ...s, date: e.target.value } : s)); setIsDirtyTrue(); }} className="text-[10px] font-black text-primary uppercase bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 text-center print:bg-transparent shadow-sm" />
                  </div>
                  <div className="flex-1 bg-slate-50/80 shadow-inner rounded-xl lg:rounded-[2rem] p-4 lg:p-10 border border-slate-200 relative print:bg-white group-hover:bg-white group-hover:shadow-[0_20px_40px_-15px_rgba(19,91,236,0.1)] transition-all">
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

        {/* ── Historial de versiones SOAP (CENS RCE) ── */}
        {soapVersions.length > 0 && (
          <div className="px-6 md:px-10 pb-6 no-print">
            <button
              onClick={() => setShowVersions(v => !v)}
              className="flex items-center gap-2 text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-slate-700 transition-colors"
            >
              <span className="material-icons-round text-sm">{showVersions ? 'expand_less' : 'history'}</span>
              {showVersions ? 'Ocultar historial' : `Historial SOAP (${soapVersions.length} versiones guardadas)`}
            </button>
            {showVersions && (
              <div className="mt-4 space-y-3">
                {soapVersions.map((v, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-2xl px-6 py-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        {new Date(v.saved_at).toLocaleString('es-CL')} — {v.saved_by_name}
                      </p>
                      {i === 0 && <span className="text-[9px] bg-emerald-100 text-emerald-700 font-black px-2 py-0.5 rounded-full uppercase tracking-widest">Más reciente</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {(['subjective', 'objective', 'assessment', 'plan'] as const).map(k =>
                        v.soap_snapshot[k]?.trim() ? (
                          <div key={k}>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{k}</p>
                            <p className="text-xs text-slate-600 line-clamp-2">{v.soap_snapshot[k]}</p>
                          </div>
                        ) : null
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="fixed bottom-10 right-10 z-50 no-print flex flex-col items-end gap-4 animate-in slide-in-from-bottom-10 duration-700">
          <div className="bg-white/90 backdrop-blur-md px-6 py-3 rounded-full border border-slate-200 shadow-2xl flex items-center gap-4">
            <div className={`w-3 h-3 ${(import.meta.env.VITE_AI_ENABLED || process.env.AI_ENABLED) ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.7)]' : 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.7)]'} rounded-full animate-pulse`}></div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-[0.25em]">
              {(import.meta.env.VITE_AI_ENABLED || process.env.AI_ENABLED) ? 'IA AgenteMasLife Conectada' : 'IA AgenteMasLife Offline'}
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
              <p className="text-primary font-black uppercase tracking-widest text-xs mt-2 italic">Emitido por Plataforma Agenda Maslife 🧡</p>
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

      {/* Informe biomecánico visual (pantalla completa, estilo kiosco) */}
      {showBiomechReport && biomechReport && (
        <BiomechReport
          report={biomechReport}
          images={analysisImages}
          patientName={personalData.name}
          rom={kiRom}
          romDefs={romDefs}
          anthro={kiAnthro}
          imc={kiImc}
          discrep={kiDiscrep}
          onClose={() => setShowBiomechReport(false)}
        />
      )}
    </div>
  );
};

export default ClinicalRecord;
