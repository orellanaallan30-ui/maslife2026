import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

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

interface RoutineData {
  title: string;
  notes: string | null;
  professionalName: string;
  patientName: string;
  items: RoutineItemView[];
}

// Fecha local del dispositivo del paciente (no toISOString: cruza de día en UTC).
const localToday = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const RoutineView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<RoutineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingItem, setSavingItem] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setError('Enlace inválido.'); setLoading(false); return; }
    void Promise.resolve(
      supabase.rpc('get_routine_public', { p_routine_id: id })
        .then(({ data: res, error: err }) => {
          if (err || !res) { setError('No se pudo cargar la rutina.'); return; }
          if ((res as { error?: string }).error) { setError((res as { error?: string }).error!); return; }
          const parsed = res as RoutineData;
          parsed.items = (parsed.items || []).map(it => ({
            ...it,
            completedDates: it.completedDates || [],
            completions: it.completions || [],
          }));
          setData(parsed);
        })
    ).finally(() => setLoading(false));
  }, [id]);

  const today = localToday();

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

  const { title, notes, professionalName, patientName, items } = data;
  const pdfUrl = id ? supabase.storage.from('routine-pdfs').getPublicUrl(`${id}.pdf`).data.publicUrl : null;
  const doneToday = items.filter(it => it.completedDates.includes(today)).length;

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
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary/20 transition"
            >
              <span className="material-icons-round text-base">picture_as_pdf</span>
              Descargar PDF
            </a>
          )}
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
