import React from 'react';

// Evaluación de Terapia Ocupacional: índice de Barthel (AVD, escala estándar
// de dominio público, puntaje 0-100) + objetivos ocupacionales.
// Se guarda en specialtyData.toData.

export interface TOData {
  barthel: Record<string, number>;
  goals: string;
}

interface Props {
  data: TOData;
  onChange: (data: TOData) => void;
}

interface BarthelItem {
  key: string;
  label: string;
  options: Array<{ score: number; text: string }>;
}

const BARTHEL_ITEMS: BarthelItem[] = [
  { key: 'comer',      label: 'Comer',                    options: [{ score: 0, text: 'Incapaz' }, { score: 5, text: 'Necesita ayuda' }, { score: 10, text: 'Independiente' }] },
  { key: 'lavarse',    label: 'Lavarse (baño/ducha)',     options: [{ score: 0, text: 'Dependiente' }, { score: 5, text: 'Independiente' }] },
  { key: 'vestirse',   label: 'Vestirse',                 options: [{ score: 0, text: 'Dependiente' }, { score: 5, text: 'Necesita ayuda' }, { score: 10, text: 'Independiente' }] },
  { key: 'arreglarse', label: 'Arreglarse (aseo personal)', options: [{ score: 0, text: 'Dependiente' }, { score: 5, text: 'Independiente' }] },
  { key: 'deposiciones', label: 'Deposiciones',           options: [{ score: 0, text: 'Incontinente' }, { score: 5, text: 'Accidente ocasional' }, { score: 10, text: 'Continente' }] },
  { key: 'miccion',    label: 'Micción',                  options: [{ score: 0, text: 'Incontinente' }, { score: 5, text: 'Accidente ocasional' }, { score: 10, text: 'Continente' }] },
  { key: 'retrete',    label: 'Uso del retrete',          options: [{ score: 0, text: 'Dependiente' }, { score: 5, text: 'Necesita ayuda' }, { score: 10, text: 'Independiente' }] },
  { key: 'traslado',   label: 'Traslado sillón-cama',     options: [{ score: 0, text: 'Incapaz' }, { score: 5, text: 'Mucha ayuda' }, { score: 10, text: 'Mínima ayuda' }, { score: 15, text: 'Independiente' }] },
  { key: 'deambular',  label: 'Deambulación',             options: [{ score: 0, text: 'Inmóvil' }, { score: 5, text: 'Silla de ruedas' }, { score: 10, text: 'Con ayuda' }, { score: 15, text: 'Independiente' }] },
  { key: 'escalones',  label: 'Subir/bajar escalones',    options: [{ score: 0, text: 'Incapaz' }, { score: 5, text: 'Necesita ayuda' }, { score: 10, text: 'Independiente' }] },
];

function classify(score: number, answered: boolean): { label: string; cls: string } {
  if (!answered) return { label: 'Sin evaluar', cls: 'bg-slate-200 text-slate-500' };
  if (score < 20)  return { label: 'Dependencia total',    cls: 'bg-rose-500/10 text-rose-700' };
  if (score < 40)  return { label: 'Dependencia grave',    cls: 'bg-orange-500/10 text-orange-700' };
  if (score < 60)  return { label: 'Dependencia moderada', cls: 'bg-amber-400/10 text-amber-700' };
  if (score < 100) return { label: 'Dependencia leve',     cls: 'bg-lime-500/10 text-lime-700' };
  return { label: 'Independiente', cls: 'bg-emerald-500/10 text-emerald-700' };
}

export const TOAssessment: React.FC<Props> = ({ data, onChange }) => {
  const barthel = data.barthel || {};
  const answered = BARTHEL_ITEMS.every(it => barthel[it.key] !== undefined);
  const score = BARTHEL_ITEMS.reduce((s, it) => s + (barthel[it.key] || 0), 0);
  const cls = classify(score, answered);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-xs font-black uppercase tracking-[0.06em] text-slate-500">Índice de Barthel — Actividades de la Vida Diaria</h3>
        <p className="text-sm font-black text-slate-700">
          {score}/100
          <span className={`ml-2 px-2.5 py-1 rounded-full text-[11px] font-black ${cls.cls}`}>{cls.label}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {BARTHEL_ITEMS.map(it => (
          <div key={it.key} className="bg-slate-50/80 rounded-2xl border border-slate-200 p-4 space-y-2">
            <p className="text-xs font-black text-slate-600">{it.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {it.options.map(opt => (
                <button key={opt.score}
                  onClick={() => onChange({ ...data, barthel: { ...barthel, [it.key]: opt.score } })}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                    barthel[it.key] === opt.score
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-amber-300'
                  }`}>
                  {opt.text} ({opt.score})
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <label htmlFor="to-goals" className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Objetivos Ocupacionales</label>
        <textarea id="to-goals" value={data.goals || ''} onChange={e => onChange({ ...data, goals: e.target.value })} rows={4}
          placeholder="Ej: Recuperar independencia en vestido de hemicuerpo superior. Entrenamiento en AVD instrumentales. Adaptaciones del hogar..."
          className="w-full bg-white shadow-input-inset border border-slate-300 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-amber-500/10 resize-none transition-all" />
      </div>
    </div>
  );
};
