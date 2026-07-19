import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

interface RoutineItemView {
  nameEs: string;
  imageUrls: string[];
  instructionsEs: string[];
  sets: number | null;
  reps: string;
  restSeconds: number | null;
  notes: string | null;
}

interface RoutineData {
  title: string;
  notes: string | null;
  professionalName: string;
  patientName: string;
  items: RoutineItemView[];
}

const RoutineView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<RoutineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setError('Enlace inválido.'); setLoading(false); return; }
    void Promise.resolve(
      supabase.rpc('get_routine_public', { p_routine_id: id })
        .then(({ data: res, error: err }) => {
          if (err || !res) { setError('No se pudo cargar la rutina.'); return; }
          if ((res as { error?: string }).error) { setError((res as { error?: string }).error!); return; }
          setData(res as RoutineData);
        })
    ).finally(() => setLoading(false));
  }, [id]);

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

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <span className="material-icons-round text-primary text-lg">fitness_center</span>
        </div>
        <div>
          <p className="text-sm font-black text-slate-900">Clínica Mas Life</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Rutina de ejercicios — Solo lectura</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        {/* Aviso */}
        <div className="bg-sky-50 border border-sky-200 rounded-2xl px-5 py-3 flex items-center gap-3">
          <span className="material-icons-round text-sky-500 text-lg">info</span>
          <p className="text-xs text-sky-700 font-medium">
            {patientName ? `Hola ${patientName}, esta` : 'Esta'} es la rutina que te envió <strong>{professionalName}</strong>. Sigue las indicaciones de cada ejercicio y detente si sientes dolor.
          </p>
        </div>

        {/* Título */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-3">
          <h1 className="text-lg font-black text-slate-900">{title}</h1>
          {notes?.trim() && <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{notes}</p>}
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
          {items.map((item, i) => (
            <div key={i} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
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
              </div>
            </div>
          ))}
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
