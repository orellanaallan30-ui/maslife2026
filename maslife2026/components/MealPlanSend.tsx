import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { MealPlanRow, Patient, ProfessionalProfile } from '../types';
import { exportMealPlanPDFPublic, getMealPlanPDFBase64 } from '../pdfExport';
import { toast } from '../lib/toast';

interface Props {
  patient: Patient;
  loggedPro: ProfessionalProfile;
  rows: MealPlanRow[];
}

interface SentPlan {
  id: string;
  title: string;
  sentAt: string | null;
  sentVia: string | null;
}

// Envío del plan alimentario al paciente — mismo modelo que las rutinas de
// ejercicios: se guarda una copia al enviar, WhatsApp lleva un link a la
// página pública /plan/:id, y el email adjunta el PDF generado al momento.
export const MealPlanSend: React.FC<Props> = ({ patient, loggedPro, rows }) => {
  const [sending, setSending] = useState<'whatsapp' | 'email' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [sentPlans, setSentPlans] = useState<SentPlan[]>([]);

  const visibleRows = rows.filter(r => (r.food || r.quantity || r.kcal || r.notes || '').toString().trim());
  const title = 'Plan alimentario';

  const loadSentPlans = useCallback(() => {
    supabase.from('meal_plans')
      .select('id, title, sent_at, sent_via')
      .eq('patient_id', patient.id)
      .order('sent_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (error) { console.error('[meal_plans] historial', error.message); return; }
        setSentPlans((data || []).map((p: Record<string, unknown>) => ({
          id: p.id as string,
          title: p.title as string,
          sentAt: p.sent_at as string | null,
          sentVia: p.sent_via as string | null,
        })));
      });
  }, [patient.id]);

  useEffect(() => { loadSentPlans(); }, [loadSentPlans]);

  const persistPlan = async (sentVia: 'whatsapp' | 'email'): Promise<string | null> => {
    try {
      const { data: plan, error } = await supabase.from('meal_plans').insert({
        patient_id: patient.id, professional_id: loggedPro.id, title,
        sent_at: new Date().toISOString(), sent_via: sentVia,
      }).select('id').single();
      if (error || !plan) throw error || new Error('sin id');
      const rowInserts = visibleRows.map((r, idx) => ({
        plan_id: plan.id, meal: r.meal, food: r.food, quantity: r.quantity,
        kcal: r.kcal, notes: r.notes, order_index: idx,
      }));
      const { error: rowsError } = await supabase.from('meal_plan_rows').insert(rowInserts);
      if (rowsError) throw rowsError;
      loadSentPlans();
      return plan.id as string;
    } catch (e) {
      console.error('[meal_plans] guardar', (e as Error)?.message || e);
      toast.error('⚠️ El plan se envió, pero no se guardó en el historial del paciente.');
      return null;
    }
  };

  const pdfData = () => ({
    patientName: patient.name || '',
    professionalName: loggedPro.name,
    professionalSpecialty: loggedPro.specialty,
    title,
    rows: visibleRows.map(r => ({ meal: r.meal, food: r.food, quantity: r.quantity, kcal: r.kcal, notes: r.notes })),
  });

  const handleDownloadPDF = async () => {
    if (!visibleRows.length) return;
    setDownloading(true);
    try {
      await exportMealPlanPDFPublic(patient.id, pdfData());
    } catch (e) {
      console.error('[meal plan] pdf', e);
      toast.error('No se pudo generar el PDF.');
    } finally {
      setDownloading(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!visibleRows.length) return;
    const phone = (patient.phone || '').replace(/\D/g, '');
    if (!phone) { toast.error('El paciente no tiene teléfono registrado.'); return; }
    setSending('whatsapp');
    try {
      const planId = await persistPlan('whatsapp');
      const planLink = planId ? `${window.location.origin}/plan/${planId}` : '';
      const list = visibleRows.map(r => `• ${r.meal}: ${r.food}${r.quantity ? ` (${r.quantity})` : ''}`).join('\n');
      const linkLine = planLink ? `\n\n🍽️ Ver plan completo con detalle: ${planLink}` : '';
      const msg = `Hola ${patient.name || ''} 👋 Soy ${loggedPro.name} de Agenda Maslife. Te envío tu plan alimentario:\n\n${list}${linkLine}\n\nCualquier duda, escríbeme por aquí.`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
      toast.success('Plan enviado por WhatsApp');
    } catch (e) {
      console.error('[meal plan] whatsapp', e);
      toast.error('No se pudo enviar el plan por WhatsApp.');
    } finally {
      setSending(null);
    }
  };

  const handleSendEmail = async () => {
    if (!visibleRows.length) return;
    if (!patient.email) { toast.error('El paciente no tiene email registrado.'); return; }
    setSending('email');
    try {
      const planId = await persistPlan('email');
      const pdfBase64 = await getMealPlanPDFBase64(planId || patient.id, pdfData());
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'meal-plan',
          patientEmail: patient.email,
          patientName: patient.name,
          professionalName: loggedPro.name,
          planTitle: title,
          rows: visibleRows.map(r => ({ meal: r.meal, food: r.food, quantity: r.quantity, kcal: r.kcal })),
          pdfBase64,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`Plan enviado a ${patient.email}`);
    } catch (e) {
      console.error('[meal plan] email', e);
      toast.error('No se pudo enviar el correo. Intenta de nuevo.');
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="no-print pt-4 border-t border-slate-100 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button onClick={handleDownloadPDF} disabled={downloading || !visibleRows.length}
          className="px-5 py-3 bg-slate-100 text-slate-700 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50 flex items-center gap-1.5">
          <span className="material-icons-round text-base">{downloading ? 'sync' : 'download'}</span> {downloading ? 'Generando...' : 'Descargar PDF'}
        </button>
        <button onClick={handleSendWhatsApp} disabled={sending !== null || !visibleRows.length}
          className="px-5 py-3 bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-50 flex items-center gap-1.5">
          <span className="material-icons-round text-base">{sending === 'whatsapp' ? 'sync' : 'chat'}</span> {sending === 'whatsapp' ? 'Enviando...' : 'Enviar por WhatsApp'}
        </button>
        <button onClick={handleSendEmail} disabled={sending !== null || !visibleRows.length}
          className="px-5 py-3 bg-teal-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-teal-600 transition-all disabled:opacity-50 flex items-center gap-1.5">
          <span className="material-icons-round text-base">{sending === 'email' ? 'sync' : 'mail'}</span> {sending === 'email' ? 'Enviando...' : 'Enviar por Email'}
        </button>
      </div>

      {sentPlans.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Planes enviados</h3>
          {sentPlans.map(p => {
            const link = `${window.location.origin}/plan/${p.id}`;
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 bg-slate-50/80 rounded-2xl border border-slate-200 px-4 py-2.5">
                <p className="text-[11px] font-bold text-slate-600">
                  {p.sentAt ? new Date(p.sentAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  {p.sentVia === 'whatsapp' ? ' · WhatsApp' : p.sentVia === 'email' ? ' · Email' : ''}
                </p>
                <button title="Copiar link del plan" aria-label="Copiar link del plan"
                  onClick={() => { navigator.clipboard?.writeText(link); toast.success('Link copiado'); }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 shrink-0">
                  <span className="material-icons-round text-base">link</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
