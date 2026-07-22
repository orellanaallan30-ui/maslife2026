import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { exportRoutinePDFPublic } from '../pdfExport';
import { EvidenceCapture } from '../components/EvidenceCapture';

interface RoutineItemView {
  id: string;
  nameEs: string;
  imageUrls: string[];
  instructionsEs: string[];
  sets: number | null;
  reps: string;
  restSeconds: number | null;
  notes: string | null;
  completedDates: string[];
  completions: Array<{ on: string; pain: number | null }>;
  evidenceCount: number;
}

// Semáforo de dolor (escala EVA 1-10):
//   1-3 verde: tolerable, permitido · 4-5 amarillo: precaución, menos
//   intensidad y más descanso · 6-10 rojo: no realizar el ejercicio.
const painBand = (n: number) => (n <= 3 ? 'green' : n <= 5 ? 'yellow' : 'red');
const PAIN_STYLES: Record<string, { dot: string; selected: string; text: string; msg: string }> = {
  green:  { dot: 'bg-emerald-500', selected: 'bg-emerald-500 text-white border-emerald-500', text: 'text-emerald-700',
            msg: 'Dolor tolerable — puedes realizar el ejercicio.' },
  yellow: { dot: 'bg-amber-400',   selected: 'bg-amber-400 text-white border-amber-400',     text: 'text-amber-700',
            msg: 'Precaución: baja la intensidad y descansa más entre series.' },
  red:    { dot: 'bg-rose-500',    selected: 'bg-rose-500 text-white border-rose-500',       text: 'text-rose-700',
            msg: 'Con este dolor NO realices el ejercicio. Avísale a tu kinesiólogo.' },
};

interface TodaySession { id: string; painPre: number | null; finished: boolean }

interface RoutineData {
  title: string;
  notes: string | null;
  professionalName: string;
  professionalSpecialty?: string;
  patientName: string;
  sessionsPerWeek: number | null;
  sessionDates: string[];
  todaySession: TodaySession | null;
  items: RoutineItemView[];
}

// Esfuerzo percibido (RPE, Borg modificada 1-4).
const RPE_OPTIONS = [
  { v: 1, l: 'Fácil' }, { v: 2, l: 'Moderado' }, { v: 3, l: 'Difícil' }, { v: 4, l: 'Muy difícil' },
];
// Check-in de síntomas post-sesión.
const SYMPTOMS = ['Sin molestia', 'Inestabilidad', 'Pinchazo', 'Fatiga muscular'];
// Mensajes breves de motivación al cumplir la meta del día (varían por racha).
const MOTIVATION = [
  '¡Excelente! Diste el primer paso de hoy. 💪',
  '¡Dos días seguidos! Estás construyendo el hábito. 🔥',
  '¡Tres días! Tu constancia acelera tu recuperación. 🌟',
  '¡Una racha increíble! Tu cuerpo te lo agradece. 🚀',
  '¡Imparable! Cada sesión te acerca a tu meta. 🏆',
];

// Fecha local del dispositivo del paciente (no toISOString: cruza de día en UTC).
const localToday = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Racha: días consecutivos con sesión terminada, contando hacia atrás desde hoy o ayer.
const computeStreak = (dates: string[]): number => {
  const set = new Set(dates);
  const d = new Date();
  const iso = (x: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  };
  // Si no hizo hoy pero sí ayer, la racha sigue viva (se cuenta desde ayer).
  if (!set.has(iso(d))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (set.has(iso(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
};

// Cuenta sesiones dentro de la semana actual (lunes a hoy).
const sessionsThisWeek = (dates: string[]): number => {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = lunes
  const monday = new Date(now); monday.setDate(now.getDate() - day); monday.setHours(0, 0, 0, 0);
  return dates.filter(ds => new Date(ds + 'T12:00:00') >= monday).length;
};

const RoutineView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<RoutineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [finishedMsg, setFinishedMsg] = useState<string | null>(null);

  // ── Sesión de hoy (métricas clínicas) ──
  const [session, setSession] = useState<TodaySession | null>(null);
  const [sessionDates, setSessionDates] = useState<string[]>([]);
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number | null>(null);
  const [startPain, setStartPain] = useState<number | null>(null);
  const [showFinish, setShowFinish] = useState(false);
  const [endPain, setEndPain] = useState<number | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [symptom, setSymptom] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) { setError('Enlace inválido.'); setLoading(false); return; }
    void Promise.resolve(
      supabase.rpc('get_routine_public', { p_routine_id: id })
        .then(({ data: res, error: err }) => {
          if (err || !res) { setError('No se pudo cargar la rutina.'); return; }
          // 'finished' de nivel superior solo lo devuelve el alta del paciente.
          if ((res as { finished?: boolean }).finished) { setFinishedMsg((res as { message?: string }).message || 'Este plan ya no está activo.'); return; }
          if ((res as { error?: string }).error) { setError((res as { error?: string }).error!); return; }
          const parsed = res as RoutineData;
          parsed.items = (parsed.items || []).map(it => ({
            ...it,
            completedDates: it.completedDates || [],
            completions: it.completions || [],
            evidenceCount: it.evidenceCount || 0,
          }));
          setData(parsed);
          setSession(parsed.todaySession || null);
          setSessionDates(parsed.sessionDates || []);
          setSessionsPerWeek(parsed.sessionsPerWeek ?? null);
        })
    ).finally(() => setLoading(false));
  }, [id]);

  const today = localToday();
  const streak = useMemo(() => computeStreak(sessionDates), [sessionDates]);
  const weekCount = useMemo(() => sessionsThisWeek(sessionDates), [sessionDates]);

  const startSession = async () => {
    if (!id || busy) return;
    setBusy(true);
    try {
      const { data: res, error: err } = await supabase.rpc('start_routine_session', {
        p_routine_id: id, p_date: today, p_pain_pre: startPain,
      });
      const r = res as { sessionId?: string; error?: string };
      if (err || r?.error || !r?.sessionId) throw new Error(r?.error || err?.message);
      setSession({ id: r.sessionId, painPre: startPain, finished: false });
    } catch (e) {
      console.error('[rutina] iniciar sesión', e);
    } finally {
      setBusy(false);
    }
  };

  const finishSession = async () => {
    if (!id || !session || busy) return;
    setBusy(true);
    try {
      const { data: res, error: err } = await supabase.rpc('finish_routine_session', {
        p_session_id: session.id, p_routine_id: id,
        p_pain_post: endPain, p_rpe: rpe, p_symptom: symptom || null,
      });
      const r = res as { ok?: boolean; error?: string };
      if (err || r?.error) throw new Error(r?.error || err?.message);
      setSession({ ...session, finished: true });
      setSessionDates(prev => prev.includes(today) ? prev : [...prev, today]);
      setShowFinish(false);
    } catch (e) {
      console.error('[rutina] finalizar sesión', e);
    } finally {
      setBusy(false);
    }
  };

  // Aplica al estado local la marca del día (con o sin dolor) de un ítem.
  const applyLocal = (itemId: string, done: boolean, pain: number | null) =>
    setData(prev => prev ? {
      ...prev,
      items: prev.items.map(it => {
        if (it.id !== itemId) return it;
        const dates = it.completedDates.filter(d => d !== today);
        const comps = it.completions.filter(c => c.on !== today);
        return done
          ? { ...it, completedDates: [...dates, today], completions: [...comps, { on: today, pain }] }
          : { ...it, completedDates: dates, completions: comps };
      }),
    } : prev);

  const saveMark = async (item: RoutineItemView, done: boolean, pain: number | null) => {
    if (!id || savingItem) return;
    const prevDone = item.completedDates.includes(today);
    const prevPain = item.completions.find(c => c.on === today)?.pain ?? null;
    setSavingItem(item.id);
    applyLocal(item.id, done, pain); // optimista
    try {
      const { data: res, error: err } = await supabase.rpc('toggle_routine_item', {
        p_routine_id: id,
        p_item_id: item.id,
        p_date: today,
        p_done: done,
        p_pain: pain,
      });
      if (err || (res as { error?: string })?.error) throw new Error((res as { error?: string })?.error || err?.message);
    } catch (e) {
      console.error('[rutina] marcar', e);
      applyLocal(item.id, prevDone, prevPain); // revertir
    } finally {
      setSavingItem(null);
    }
  };

  const toggleDone = (item: RoutineItemView) => {
    const wasDone = item.completedDates.includes(today);
    void saveMark(item, !wasDone, wasDone ? null : item.completions.find(c => c.on === today)?.pain ?? null);
  };

  const setPain = (item: RoutineItemView, pain: number) => {
    void saveMark(item, true, pain);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (finishedMsg) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-sm w-full text-center space-y-4">
          <span className="material-icons-round text-5xl text-teal-500">verified</span>
          <h1 className="text-xl font-black text-slate-900">Tratamiento finalizado</h1>
          <p className="text-sm text-slate-500">{finishedMsg}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-sm w-full text-center space-y-4">
          <span className="material-icons-round text-5xl text-rose-400">link_off</span>
          <h1 className="text-xl font-black text-slate-900">Enlace no disponible</h1>
          <p className="text-sm text-slate-500">{error}</p>
          <p className="text-xs text-slate-400">Si crees que esto es un error, contacta a tu profesional de salud.</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { title, notes, professionalName, professionalSpecialty, patientName, items } = data;
  const doneToday = items.filter(it => it.completedDates.includes(today)).length;

  // El PDF se genera al momento con los datos actuales (imágenes incluidas),
  // en vez de servir el archivo congelado que se subió al enviar la rutina.
  const handleDownloadPdf = async () => {
    if (!id || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      await exportRoutinePDFPublic(id, { patientName, professionalName, professionalSpecialty, title, items });
    } catch (e) {
      console.error('[rutina] pdf', e);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <span className="material-icons-round text-primary text-lg">fitness_center</span>
        </div>
        <div>
          <p className="text-sm font-black text-slate-900">Clínica Mas Life</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Rutina de ejercicios</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        {/* Aviso */}
        <div className="bg-sky-50 border border-sky-200 rounded-2xl px-5 py-3 flex items-center gap-3">
          <span className="material-icons-round text-sky-500 text-lg">info</span>
          <p className="text-xs text-sky-700 font-medium">
            {patientName ? `Hola ${patientName}, esta` : 'Esta'} es la rutina que te envió <strong>{professionalName}</strong>. Marca cada ejercicio cuando lo completes — tu profesional puede ver tu avance. Detente si sientes dolor.
          </p>
        </div>

        {/* Racha + progreso semanal */}
        {(streak > 0 || sessionDates.length > 0) && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="material-icons-round text-2xl text-orange-500">local_fire_department</span>
              <div>
                <p className="text-sm font-black text-slate-900">
                  {streak > 0 ? `Llevas ${streak} ${streak === 1 ? 'día' : 'días'} seguidos` : 'Retoma tu racha hoy'}
                </p>
                <p className="text-[11px] text-slate-400">Sesión completa = un día de racha</p>
              </div>
            </div>
            {sessionsPerWeek ? (
              <div className="text-right">
                <p className="text-sm font-black text-teal-600">{weekCount}<span className="text-slate-400 font-bold">/{sessionsPerWeek}</span></p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">esta semana</p>
              </div>
            ) : weekCount > 0 && (
              <div className="text-right">
                <p className="text-sm font-black text-teal-600">{weekCount}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">esta semana</p>
              </div>
            )}
          </div>
        )}

        {/* Sesión de hoy: iniciar → finalizar (métricas clínicas) */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-4">
          {!session ? (
            <>
              <div>
                <h2 className="text-sm font-black text-slate-900">¿List{patientName ? 'o' : 'o/a'} para tu rutina de hoy?</h2>
                <p className="text-xs text-slate-500 mt-1">Antes de empezar, cuéntanos con cuánto dolor inicias.</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dolor al iniciar (1-10) · opcional</p>
                <div className="flex gap-1.5 flex-wrap">
                  {Array.from({ length: 10 }, (_, n) => n + 1).map(n => {
                    const s = PAIN_STYLES[painBand(n)];
                    return (
                      <button key={n} onClick={() => setStartPain(startPain === n ? null : n)}
                        aria-label={`Dolor ${n} de 10`}
                        className={`w-8 h-8 rounded-full text-xs font-black border transition ${startPain === n ? s.selected : 'bg-white text-slate-500 border-slate-200'}`}>
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button onClick={startSession} disabled={busy}
                className="w-full min-h-[48px] rounded-2xl bg-primary text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60">
                <span className="material-icons-round text-lg">play_circle</span> Iniciar rutina de hoy
              </button>
            </>
          ) : session.finished ? (
            <div className="text-center space-y-2 py-2">
              <span className="material-icons-round text-4xl text-teal-500">celebration</span>
              <p className="text-sm font-black text-slate-900">¡Completaste tu rutina de hoy!</p>
              <p className="text-xs text-teal-700 font-bold">{MOTIVATION[Math.min(streak, MOTIVATION.length) - 1] || MOTIVATION[0]}</p>
            </div>
          ) : !showFinish ? (
            <>
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-teal-500 text-lg">bolt</span>
                <p className="text-sm font-black text-slate-900">Sesión en curso</p>
              </div>
              <p className="text-xs text-slate-500">Realiza tus ejercicios abajo y, cuando termines, cierra la sesión para registrar cómo te fue.</p>
              <button onClick={() => setShowFinish(true)}
                className="w-full min-h-[48px] rounded-2xl bg-teal-500 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-teal-600 transition">
                <span className="material-icons-round text-lg">flag</span> Finalizar rutina
              </button>
            </>
          ) : (
            <>
              <h2 className="text-sm font-black text-slate-900">¿Cómo te fue?</h2>
              {/* Dolor final */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dolor al terminar (1-10)</p>
                <div className="flex gap-1.5 flex-wrap">
                  {Array.from({ length: 10 }, (_, n) => n + 1).map(n => {
                    const s = PAIN_STYLES[painBand(n)];
                    return (
                      <button key={n} onClick={() => setEndPain(endPain === n ? null : n)} aria-label={`Dolor ${n} de 10`}
                        className={`w-8 h-8 rounded-full text-xs font-black border transition ${endPain === n ? s.selected : 'bg-white text-slate-500 border-slate-200'}`}>
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Esfuerzo percibido */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">¿Qué tan exigente fue?</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {RPE_OPTIONS.map(o => (
                    <button key={o.v} onClick={() => setRpe(rpe === o.v ? null : o.v)}
                      className={`py-2 rounded-xl text-xs font-bold border transition ${rpe === o.v ? 'bg-primary text-white border-primary' : 'bg-white text-slate-500 border-slate-200'}`}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              {/* Síntoma */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">¿Sentiste alguna molestia inusual?</p>
                <div className="flex gap-1.5 flex-wrap">
                  {SYMPTOMS.map(sy => (
                    <button key={sy} onClick={() => setSymptom(symptom === sy ? '' : sy)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition ${symptom === sy ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}>
                      {sy}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowFinish(false)} className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 bg-slate-100">Volver</button>
                <button onClick={finishSession} disabled={busy}
                  className="flex-1 min-h-[44px] rounded-xl bg-teal-500 text-white text-sm font-bold hover:bg-teal-600 transition disabled:opacity-60">
                  {busy ? 'Guardando...' : 'Guardar y finalizar'}
                </button>
              </div>
            </>
          )}
        </section>

        {/* Título + progreso de hoy */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-3">
          <h1 className="text-lg font-black text-slate-900">{title}</h1>
          {notes?.trim() && <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{notes}</p>}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all"
                style={{ width: items.length ? `${(doneToday / items.length) * 100}%` : '0%' }}
              />
            </div>
            <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Hoy: {doneToday} de {items.length}</span>
          </div>
          {/* Semáforo de dolor (leyenda única, minimalista) */}
          <div className="flex flex-col gap-1 pt-1 text-[11px] text-slate-500 leading-snug">
            <p className="font-black text-[10px] uppercase tracking-widest text-slate-400">Escala de dolor (1-10)</p>
            <p><span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${PAIN_STYLES.green.dot}`} />1-3 tolerable: puedes hacer el ejercicio</p>
            <p><span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${PAIN_STYLES.yellow.dot}`} />4-5 precaución: menos intensidad y más descanso</p>
            <p><span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${PAIN_STYLES.red.dot}`} />6-10 no realizar el ejercicio y avisa a tu kinesiólogo</p>
          </div>
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary/20 transition disabled:opacity-60"
          >
            <span className="material-icons-round text-base">{downloadingPdf ? 'sync' : 'picture_as_pdf'}</span>
            {downloadingPdf ? 'Generando PDF...' : 'Descargar PDF'}
          </button>
        </section>

        {/* Ejercicios */}
        <section className="space-y-4">
          {items.map((item, i) => {
            const isDone = item.completedDates.includes(today);
            const todayPain = item.completions.find(c => c.on === today)?.pain ?? null;
            const band = todayPain != null ? painBand(todayPain) : null;
            return (
              <div key={item.id || i} className={`bg-white rounded-3xl shadow-sm border overflow-hidden transition ${isDone ? 'border-teal-300' : 'border-slate-200'}`}>
                {item.imageUrls?.[0] && (
                  <div className="grid grid-cols-2 bg-slate-100">
                    {item.imageUrls.slice(0, 2).map((url, imgI) => (
                      <img key={imgI} src={url} alt={item.nameEs} className="w-full h-40 object-cover" loading="lazy" />
                    ))}
                  </div>
                )}
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-black text-slate-900">{i + 1}. {item.nameEs}</h2>
                    {isDone && <span className="material-icons-round text-teal-500 text-xl shrink-0">check_circle</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.sets != null && (
                      <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold">{item.sets} series</span>
                    )}
                    {item.reps && (
                      <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold">{item.reps} repeticiones</span>
                    )}
                    {item.restSeconds != null && (
                      <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold">Descanso {item.restSeconds}s</span>
                    )}
                  </div>
                  {item.instructionsEs?.length > 0 && (
                    <ol className="list-decimal list-inside space-y-1">
                      {item.instructionsEs.map((step, stepI) => (
                        <li key={stepI} className="text-xs text-slate-600 leading-relaxed">{step}</li>
                      ))}
                    </ol>
                  )}
                  {item.notes?.trim() && (
                    <p className="text-xs text-slate-500 italic">Nota: {item.notes}</p>
                  )}
                  {item.id && (
                    <>
                      <button
                        onClick={() => toggleDone(item)}
                        disabled={savingItem === item.id}
                        className={`w-full min-h-[48px] rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-60 ${
                          isDone
                            ? 'bg-teal-50 text-teal-700 border border-teal-200'
                            : 'bg-primary text-white hover:opacity-90'
                        }`}
                      >
                        <span className="material-icons-round text-lg">{isDone ? 'task_alt' : 'radio_button_unchecked'}</span>
                        {isDone ? 'Realizado hoy ✓ (tocar para deshacer)' : 'Marcar como realizado hoy'}
                      </button>
                      {isDone && (
                        <div className="space-y-1.5 pt-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">¿Cuánto dolor sentiste? (1-10)</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {Array.from({ length: 10 }, (_, n) => n + 1).map(n => {
                              const s = PAIN_STYLES[painBand(n)];
                              const selected = todayPain === n;
                              return (
                                <button
                                  key={n}
                                  onClick={() => setPain(item, n)}
                                  disabled={savingItem === item.id}
                                  aria-label={`Dolor ${n} de 10`}
                                  className={`w-8 h-8 rounded-full text-xs font-black border transition disabled:opacity-60 ${
                                    selected ? s.selected : 'bg-white text-slate-500 border-slate-200'
                                  }`}
                                >
                                  {n}
                                </button>
                              );
                            })}
                          </div>
                          {band && (
                            <p className={`text-xs font-bold ${PAIN_STYLES[band].text}`}>{PAIN_STYLES[band].msg}</p>
                          )}
                        </div>
                      )}
                      {/* Evidencia: grabar video 10s o adjuntar (foto/video) */}
                      {id && (
                        <div className="pt-2 border-t border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Enviar evidencia (opcional)</p>
                          <EvidenceCapture routineId={id} itemId={item.id} count={item.evidenceCount || 0}
                            onUploaded={() => { /* el contador lo lleva el componente */ }} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 py-4">
          Documento generado por Clínica Mas Life
        </p>
      </main>
    </div>
  );
};

export default RoutineView;
