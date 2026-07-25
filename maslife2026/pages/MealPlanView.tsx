import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { exportMealPlanPDFPublic, MealPlanPDFRow } from '../pdfExport';

interface MealPlanData {
  title: string;
  notes: string | null;
  professionalName: string;
  professionalSpecialty?: string;
  patientName: string;
  rows: MealPlanPDFRow[];
}

const MealPlanView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<MealPlanData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [finishedMsg, setFinishedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setError('Enlace inválido.'); setLoading(false); return; }
    void Promise.resolve(
      supabase.rpc('get_meal_plan_public', { p_plan_id: id })
        .then(({ data: res, error: err }) => {
          if (err || !res) { setError('No se pudo cargar el plan.'); return; }
          if ((res as { finished?: boolean }).finished) { setFinishedMsg((res as { message?: string }).message || 'Este plan ya no está activo.'); return; }
          if ((res as { error?: string }).error) { setError((res as { error?: string }).error!); return; }
          const parsed = res as MealPlanData;
          parsed.rows = parsed.rows || [];
          setData(parsed);
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

  if (finishedMsg) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-sm w-full text-center space-y-4">
          <span className="material-icons-round text-5xl text-emerald-500">verified</span>
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

  const { title, notes, professionalName, professionalSpecialty, patientName, rows } = data;
  const visibleRows = rows.filter(r => (r.food || r.quantity || r.kcal || r.notes || '').toString().trim());
  const totalKcal = visibleRows.reduce((s, r) => s + (parseFloat(r.kcal) || 0), 0);

  const handleDownloadPdf = async () => {
    if (!id || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      await exportMealPlanPDFPublic(id, { patientName, professionalName, professionalSpecialty, title, notes, rows: visibleRows });
    } catch (e) {
      console.error('[plan] pdf', e);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
          <span className="material-icons-round text-emerald-600 text-lg">restaurant</span>
        </div>
        <div>
          <p className="text-sm font-black text-slate-900">Clínica Mas Life</p>
          <p className="text-[11px] text-slate-400 uppercase tracking-widest">Plan alimentario</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        {/* Aviso */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3 flex items-center gap-3">
          <span className="material-icons-round text-emerald-500 text-lg">info</span>
          <p className="text-xs text-emerald-700 font-medium">
            {patientName ? `Hola ${patientName}, este` : 'Este'} es el plan alimentario que te envió <strong>{professionalName}</strong>. Cualquier duda o malestar, contáctale directamente.
          </p>
        </div>

        {/* Título + PDF */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-3">
          <h1 className="text-lg font-black text-slate-900">{title}</h1>
          {notes?.trim() && <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{notes}</p>}
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-500/20 transition disabled:opacity-60"
          >
            <span className="material-icons-round text-base">{downloadingPdf ? 'sync' : 'picture_as_pdf'}</span>
            {downloadingPdf ? 'Generando PDF...' : 'Descargar PDF'}
          </button>
        </section>

        {/* Comidas */}
        <section className="space-y-4">
          {visibleRows.map((row, i) => (
            <div key={i} className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-black text-slate-900">{row.meal || 'Comida'}</h2>
                {row.kcal && (
                  <span className="px-3 py-1 bg-emerald-500/10 text-emerald-700 rounded-full text-xs font-bold shrink-0">{row.kcal} kcal</span>
                )}
              </div>
              {row.food && <p className="text-sm text-slate-700 leading-relaxed">{row.food}</p>}
              {row.quantity && <p className="text-xs text-slate-500">Cantidad: {row.quantity}</p>}
              {row.notes?.trim() && <p className="text-xs text-slate-500 italic">{row.notes}</p>}
            </div>
          ))}
        </section>

        {totalKcal > 0 && (
          <p className="text-center text-sm font-black text-emerald-700">Total estimado: {totalKcal} kcal/día</p>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 py-4">
          Documento generado por Clínica Mas Life
        </p>
      </main>
    </div>
  );
};

export default MealPlanView;
