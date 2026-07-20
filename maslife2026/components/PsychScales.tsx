import React, { useState } from 'react';

// Escalas estandarizadas de tamizaje (dominio público): PHQ-9 (depresión) y
// GAD-7 (ansiedad). Puntaje automático + interpretación; el historial se
// guarda por fecha en specialtyData.psychScales para ver la evolución.

export interface PsychScaleResult {
  type: 'phq9' | 'gad7';
  date: string;   // YYYY-MM-DD
  score: number;
}

interface Props {
  scales: PsychScaleResult[];
  onChange: (scales: PsychScaleResult[]) => void;
}

const OPTIONS = ['Nunca (0)', 'Varios días (1)', 'Más de la mitad (2)', 'Casi todos los días (3)'];

const PHQ9_ITEMS = [
  'Poco interés o placer en hacer las cosas',
  'Sentirse desanimado/a, deprimido/a o sin esperanza',
  'Problemas para dormir, o dormir demasiado',
  'Sentirse cansado/a o con poca energía',
  'Poco apetito o comer en exceso',
  'Sentirse mal consigo mismo/a o como un fracaso',
  'Dificultad para concentrarse',
  'Moverse o hablar muy lento, o estar muy inquieto/a',
  'Pensamientos de que estaría mejor muerto/a o de hacerse daño',
];

const GAD7_ITEMS = [
  'Sentirse nervioso/a, ansioso/a o al límite',
  'No poder dejar de preocuparse o controlar la preocupación',
  'Preocuparse demasiado por diferentes cosas',
  'Dificultad para relajarse',
  'Estar tan inquieto/a que es difícil quedarse quieto/a',
  'Irritarse o enojarse con facilidad',
  'Sentir miedo como si algo terrible fuera a pasar',
];

const SCALE_META = {
  phq9: { name: 'PHQ-9', label: 'Depresión', items: PHQ9_ITEMS, max: 27 },
  gad7: { name: 'GAD-7', label: 'Ansiedad', items: GAD7_ITEMS, max: 21 },
} as const;

function interpret(type: 'phq9' | 'gad7', score: number): { label: string; cls: string } {
  if (type === 'phq9') {
    if (score <= 4)  return { label: 'Mínima',    cls: 'bg-emerald-500/10 text-emerald-700' };
    if (score <= 9)  return { label: 'Leve',      cls: 'bg-lime-500/10 text-lime-700' };
    if (score <= 14) return { label: 'Moderada',  cls: 'bg-amber-400/10 text-amber-700' };
    if (score <= 19) return { label: 'Mod. severa', cls: 'bg-orange-500/10 text-orange-700' };
    return { label: 'Severa', cls: 'bg-rose-500/10 text-rose-700' };
  }
  if (score <= 4)  return { label: 'Mínima',   cls: 'bg-emerald-500/10 text-emerald-700' };
  if (score <= 9)  return { label: 'Leve',     cls: 'bg-lime-500/10 text-lime-700' };
  if (score <= 14) return { label: 'Moderada', cls: 'bg-amber-400/10 text-amber-700' };
  return { label: 'Severa', cls: 'bg-rose-500/10 text-rose-700' };
}

const localToday = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const PsychScales: React.FC<Props> = ({ scales, onChange }) => {
  const [activeScale, setActiveScale] = useState<'phq9' | 'gad7' | null>(null);
  const [answers, setAnswers] = useState<Array<number | null>>([]);

  const startScale = (type: 'phq9' | 'gad7') => {
    setActiveScale(type);
    setAnswers(Array(SCALE_META[type].items.length).fill(null));
  };

  const complete = activeScale && answers.every(a => a !== null);
  const score = answers.reduce<number>((s, a) => s + (a || 0), 0);

  const saveResult = () => {
    if (!activeScale || !complete) return;
    const result: PsychScaleResult = { type: activeScale, date: localToday(), score };
    // Un resultado por escala por día (re-aplicar el mismo día lo reemplaza).
    onChange([...scales.filter(s => !(s.type === activeScale && s.date === result.date)), result]);
    setActiveScale(null);
    setAnswers([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Escalas Estandarizadas</h3>
        <div className="flex gap-2 no-print">
          {(['phq9', 'gad7'] as const).map(t => (
            <button key={t} onClick={() => startScale(t)}
              className="text-[10px] font-black text-violet-600 bg-violet-500/10 px-4 py-2.5 rounded-xl hover:bg-violet-500/20 transition-all uppercase tracking-widest">
              Aplicar {SCALE_META[t].name}
            </button>
          ))}
        </div>
      </div>

      {/* Cuestionario activo */}
      {activeScale && (
        <div className="bg-violet-50/50 border border-violet-200 rounded-2xl p-4 lg:p-6 space-y-4 no-print">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black text-slate-700">
              {SCALE_META[activeScale].name} — {SCALE_META[activeScale].label}
              <span className="block text-[10px] font-bold text-slate-400 normal-case mt-0.5">
                Durante las últimas 2 semanas, ¿con qué frecuencia ha tenido molestias por...?
              </span>
            </p>
            <button onClick={() => { setActiveScale(null); setAnswers([]); }} aria-label="Cancelar escala"
              className="text-slate-400 hover:text-rose-500 shrink-0"><span className="material-icons-round">close</span></button>
          </div>
          <div className="space-y-3">
            {SCALE_META[activeScale].items.map((item, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-xs font-bold text-slate-600">{i + 1}. {item}</p>
                <div className="flex flex-wrap gap-1.5">
                  {OPTIONS.map((opt, val) => (
                    <button key={val}
                      onClick={() => setAnswers(prev => prev.map((a, j) => (j === i ? val : a)))}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition ${
                        answers[i] === val
                          ? 'bg-violet-500 text-white border-violet-500'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300'
                      }`}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-violet-100">
            <p className="text-sm font-black text-slate-700">
              Puntaje: {score}/{SCALE_META[activeScale].max}
              {complete && (
                <span className={`ml-2 px-2.5 py-1 rounded-full text-[10px] font-black ${interpret(activeScale, score).cls}`}>
                  {interpret(activeScale, score).label}
                </span>
              )}
            </p>
            <button onClick={saveResult} disabled={!complete}
              className="px-5 py-2.5 bg-violet-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-violet-600 transition-all disabled:opacity-40">
              Guardar resultado
            </button>
          </div>
          {activeScale === 'phq9' && (answers[8] ?? 0) > 0 && (
            <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">
              ⚠ Ítem 9 positivo (ideación de muerte/autolesión): evaluar riesgo suicida según protocolo clínico.
            </p>
          )}
        </div>
      )}

      {/* Historial de resultados */}
      {scales.length > 0 && (
        <div className="space-y-2">
          {(['phq9', 'gad7'] as const).map(t => {
            const results = scales.filter(s => s.type === t).sort((a, b) => a.date.localeCompare(b.date));
            if (!results.length) return null;
            return (
              <div key={t} className="flex items-center gap-3 flex-wrap bg-slate-50/80 rounded-2xl border border-slate-200 px-4 py-3">
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest w-24 shrink-0">
                  {SCALE_META[t].name}
                </span>
                <div className="flex gap-2 flex-wrap">
                  {results.map((r, i) => {
                    const info = interpret(t, r.score);
                    return (
                      <span key={i} className={`px-2.5 py-1 rounded-full text-[10px] font-black ${info.cls}`}
                        title={`${info.label} — ${r.date}`}>
                        {new Date(r.date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}: {r.score}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
