import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { Exercise, RoutineItem, Patient, ProfessionalProfile } from '../types';
import { exportRoutinePDF, getRoutinePDFBase64 } from '../pdfExport';
import { toast } from '../lib/toast';

interface Props {
  patient: Patient;
  loggedPro: ProfessionalProfile;
}

const EQUIPMENT_LABELS: Record<string, string> = {
  'body only': 'Peso corporal',
  dumbbell: 'Mancuerna',
  bands: 'Banda elástica',
  'exercise ball': 'Pelota de estabilidad',
  'foam roll': 'Foam roll',
  'medicine ball': 'Balón medicinal',
  other: 'Otro / accesorio',
};

const MUSCLE_LABELS: Record<string, string> = {
  abdominals: 'Abdomen', biceps: 'Bíceps', calves: 'Pantorrillas', chest: 'Pecho',
  forearms: 'Antebrazos', glutes: 'Glúteos', hamstrings: 'Isquiotibiales', lats: 'Dorsales',
  'lower back': 'Espalda baja', 'middle back': 'Espalda media', neck: 'Cuello',
  quadriceps: 'Cuádriceps', shoulders: 'Hombros', traps: 'Trapecios', triceps: 'Tríceps',
  adductors: 'Aductores', abductors: 'Abductores',
};

function mapExerciseFromDB(row: Record<string, unknown>): Exercise {
  return {
    id: row.id as string,
    name: row.name as string,
    nameEs: row.name_es as string,
    category: (row.category as string) || null,
    equipment: (row.equipment as string) || null,
    level: (row.level as string) || null,
    primaryMuscles: (row.primary_muscles as string[]) || [],
    secondaryMuscles: (row.secondary_muscles as string[]) || [],
    instructionsEs: (row.instructions_es as string[]) || [],
    imageUrls: (row.image_urls as string[]) || [],
  };
}

let newId = 0;
const localId = () => `new-${++newId}-${Date.now()}`;

// Rutina ya enviada, con el progreso que el paciente marcó desde /rutina/:id.
interface SentRoutine {
  id: string;
  title: string;
  sentAt: string | null;
  sentVia: string | null;
  items: Array<{ id: string; nameEs: string; completions: Array<{ on: string; pain: number | null }> }>;
}

// Semáforo de dolor EVA: 1-3 tolerable · 4-5 precaución · 6-10 no realizar.
const painDotClass = (n: number) => (n <= 3 ? 'bg-emerald-500' : n <= 5 ? 'bg-amber-400' : 'bg-rose-500');

export const ExerciseRoutinePanel: React.FC<Props> = ({ patient, loggedPro }) => {
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('');
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [title, setTitle] = useState('Rutina de ejercicios');
  const [bulkSets, setBulkSets] = useState<number | ''>(3);
  const [bulkReps, setBulkReps] = useState('12');
  const [bulkRest, setBulkRest] = useState<number | ''>(60);
  const [sending, setSending] = useState<'whatsapp' | 'email' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [sentRoutines, setSentRoutines] = useState<SentRoutine[]>([]);
  const [expandedRoutine, setExpandedRoutine] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('exercises').select('*').order('name_es').then(({ data, error }) => {
      if (error) { console.error('[exercises] carga', error.message); setLoadingCatalog(false); return; }
      setCatalog((data || []).map(mapExerciseFromDB));
      setLoadingCatalog(false);
    });
  }, []);

  // Historial de rutinas enviadas al paciente, con las marcas de "realizado"
  // que dejó desde el link público (adherencia al tratamiento).
  const loadSentRoutines = React.useCallback(() => {
    supabase.from('exercise_routines')
      .select('id, title, sent_at, sent_via, routine_items(id, order_index, exercises(name_es), routine_completions(completed_on, pain_level))')
      .eq('patient_id', patient.id)
      .order('sent_at', { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (error) { console.error('[routines] historial', error.message); return; }
        setSentRoutines((data || []).map((r: Record<string, any>) => ({
          id: r.id,
          title: r.title,
          sentAt: r.sent_at,
          sentVia: r.sent_via,
          items: (r.routine_items || [])
            .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
            .map((it: any) => ({
              id: it.id,
              nameEs: it.exercises?.name_es || 'Ejercicio',
              completions: (it.routine_completions || [])
                .map((c: any) => ({ on: c.completed_on as string, pain: (c.pain_level ?? null) as number | null }))
                .sort((a: any, b: any) => a.on.localeCompare(b.on)),
            })),
        })));
      });
  }, [patient.id]);

  useEffect(() => { loadSentRoutines(); }, [loadSentRoutines]);

  const muscles = useMemo(() => {
    const s = new Set<string>();
    catalog.forEach(e => e.primaryMuscles.forEach(m => s.add(m)));
    return Array.from(s).sort();
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter(e => {
      if (muscleFilter && !e.primaryMuscles.includes(muscleFilter)) return false;
      if (q && !e.nameEs.toLowerCase().includes(q) && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalog, search, muscleFilter]);

  const addExercise = (ex: Exercise) => {
    setItems(prev => [...prev, {
      id: localId(), exerciseId: ex.id, sets: 3, reps: '12', restSeconds: 60, notes: '', orderIndex: prev.length, exercise: ex,
    }]);
    toast.success(`${ex.nameEs} agregado a la rutina`);
  };
  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const updateItem = (id: string, patch: Partial<RoutineItem>) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
  const moveItem = (id: string, dir: -1 | 1) =>
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === id);
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });

  // Aplica series/repeticiones/descanso a TODOS los ejercicios de la rutina de
  // una vez — evita tener que repetir los mismos valores ítem por ítem cuando
  // la rutina es uniforme (lo más común).
  const applyBulkToAll = () => {
    setItems(prev => prev.map(i => ({
      ...i,
      sets: bulkSets === '' ? i.sets : bulkSets,
      reps: bulkReps.trim() ? bulkReps : i.reps,
      restSeconds: bulkRest === '' ? i.restSeconds : bulkRest,
    })));
    toast.success('Valores aplicados a todos los ejercicios');
  };

  // Guarda la rutina en Supabase (queda en el historial del paciente) y devuelve
  // su id — lo necesita el envío por WhatsApp para nombrar el PDF en Storage.
  // Si falla, se avisa pero no bloquea el envío — el profesional ya tiene el
  // contenido listo, no debe perderlo por un problema de guardado.
  const persistRoutine = async (sentVia: 'whatsapp' | 'email'): Promise<string | null> => {
    try {
      const { data: routine, error } = await supabase.from('exercise_routines').insert({
        patient_id: patient.id, professional_id: loggedPro.id, title,
        sent_at: new Date().toISOString(), sent_via: sentVia,
      }).select('id').single();
      if (error || !routine) throw error || new Error('sin id');
      const rows = items.map((it, idx) => ({
        routine_id: routine.id, exercise_id: it.exerciseId, sets: it.sets,
        reps: it.reps, rest_seconds: it.restSeconds, notes: it.notes || null, order_index: idx,
      }));
      const { error: itemsError } = await supabase.from('routine_items').insert(rows);
      if (itemsError) throw itemsError;
      loadSentRoutines();
      return routine.id as string;
    } catch (e) {
      console.error('[exercise_routines] guardar', (e as Error)?.message || e);
      toast.error('⚠️ La rutina se envió, pero no se guardó en el historial del paciente.');
      return null;
    }
  };

  const handleDownloadPDF = async () => {
    if (!items.length) return;
    setDownloading(true);
    try {
      await exportRoutinePDF(patient, loggedPro, title, items);
    } catch (e) {
      console.error('[routine] pdf', e);
      toast.error('No se pudo generar el PDF.');
    } finally {
      setDownloading(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!items.length) return;
    const phone = (patient.phone || '').replace(/\D/g, '');
    if (!phone) { toast.error('El paciente no tiene teléfono registrado.'); return; }
    setSending('whatsapp');
    try {
      const routineId = await persistRoutine('whatsapp');

      // La página /rutina/:id muestra imágenes e indicaciones y genera el PDF
      // al momento — no se sube ningún archivo a Storage (un PDF pre-generado
      // quedaba congelado con los datos del día del envío).
      const routineLink = routineId ? `${window.location.origin}/rutina/${routineId}` : '';

      const list = items.map((it, i) => {
        const setsReps = `${it.sets ? `${it.sets}x` : ''}${it.reps || ''}`;
        const rest = it.restSeconds ? ` (descanso ${it.restSeconds}s)` : '';
        return `${i + 1}. ${it.exercise?.nameEs || 'Ejercicio'} — ${setsReps}${rest}`;
      }).join('\n');
      const linkLine = routineLink ? `\n\n📋 Ver rutina con imágenes e indicaciones: ${routineLink}` : '';
      const msg = `Hola ${patient.name || ''} 👋 Soy ${loggedPro.name} de Agenda Maslife. Te envío tu rutina "${title}":\n\n${list}${linkLine}\n\nSi sientes dolor al hacer algún ejercicio, detente y avísame. Cualquier duda, escríbeme por aquí.`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
      toast.success('Rutina enviada por WhatsApp');
    } catch (e) {
      console.error('[routine] whatsapp', e);
      toast.error('No se pudo enviar la rutina por WhatsApp.');
    } finally {
      setSending(null);
    }
  };

  const handleSendEmail = async () => {
    if (!items.length) return;
    if (!patient.email) { toast.error('El paciente no tiene email registrado.'); return; }
    setSending('email');
    try {
      const pdfBase64 = await getRoutinePDFBase64(patient, loggedPro, title, items);
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'exercise-routine',
          patientEmail: patient.email,
          patientName: patient.name,
          professionalName: loggedPro.name,
          routineTitle: title,
          items: items.map(it => ({ nameEs: it.exercise?.nameEs || '', sets: it.sets, reps: it.reps, restSeconds: it.restSeconds })),
          pdfBase64,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await persistRoutine('email');
      toast.success(`Rutina enviada a ${patient.email}`);
    } catch (e) {
      console.error('[routine] email', e);
      toast.error('No se pudo enviar el correo. Intenta de nuevo.');
    } finally {
      setSending(null);
    }
  };

  return (
    <section className="bg-white rounded-2xl lg:rounded-blob-xl p-4 lg:p-10 shadow-section border border-slate-200 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-700 border-l-4 border-teal-500 pl-4">Rutina de Ejercicios</h2>
        <button onClick={() => setShowPicker(true)}
          className="text-xs font-black text-teal-600 bg-teal-500/10 px-5 py-3 rounded-xl no-print hover:bg-teal-500/20 transition-all flex items-center gap-1.5">
          <span className="material-icons-round text-base">add</span> Agregar Ejercicio
        </button>
      </div>

      <div>
        <label htmlFor="routine-title" className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Nombre de la Rutina</label>
        <input id="routine-title" value={title} onChange={e => setTitle(e.target.value)}
          className="w-full bg-white shadow-input-inset border border-slate-300 rounded-2xl py-3 px-4 font-bold text-sm focus:ring-4 focus:ring-teal-500/10 transition-all" />
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 bg-slate-50/50 rounded-blob-lg border border-dashed border-slate-200 text-slate-400 text-sm font-bold no-print">
          Aún no agregaste ejercicios. Usa "Agregar Ejercicio" para armar la rutina.
        </div>
      ) : (
        <>
        <div className="no-print flex flex-wrap items-end gap-2 p-3 bg-teal-50/60 rounded-xl border border-teal-100">
          <div>
            <label htmlFor="bulk-sets" className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Series</label>
            <input id="bulk-sets" type="number" min={1} value={bulkSets}
              onChange={e => setBulkSets(e.target.value ? Number(e.target.value) : '')}
              className="w-16 bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-xs font-bold text-center block" />
          </div>
          <div>
            <label htmlFor="bulk-reps" className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Repeticiones</label>
            <input id="bulk-reps" value={bulkReps} onChange={e => setBulkReps(e.target.value)} placeholder="ej: 12 o 30 seg"
              className="w-32 bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-xs font-bold block" />
          </div>
          <div>
            <label htmlFor="bulk-rest" className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Descanso (seg)</label>
            <input id="bulk-rest" type="number" min={0} step={5} value={bulkRest}
              onChange={e => setBulkRest(e.target.value ? Number(e.target.value) : '')}
              className="w-20 bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-xs font-bold text-center block" />
          </div>
          <button onClick={applyBulkToAll}
            className="px-4 py-2 bg-teal-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-teal-600 transition-all">
            Aplicar a todos
          </button>
        </div>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={item.id} className="flex items-start gap-3 p-4 bg-slate-50/80 rounded-2xl border border-slate-200">
              {item.exercise?.imageUrls?.[0] && (
                <img src={item.exercise.imageUrls[0]} alt={item.exercise.nameEs} loading="lazy"
                  className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0 no-print" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm text-slate-800">{item.exercise?.nameEs}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <input type="number" min={1} value={item.sets ?? ''} placeholder="Series"
                    onChange={e => updateItem(item.id, { sets: e.target.value ? Number(e.target.value) : null })}
                    className="w-20 bg-white border border-slate-200 rounded-xl py-1.5 px-2 text-xs font-bold text-center" />
                  <input value={item.reps} placeholder="Reps (ej: 12 o 30 seg)"
                    onChange={e => updateItem(item.id, { reps: e.target.value })}
                    className="w-40 bg-white border border-slate-200 rounded-xl py-1.5 px-2 text-xs font-bold" />
                  <input type="number" min={0} step={5} value={item.restSeconds ?? ''} placeholder="Descanso (seg)"
                    onChange={e => updateItem(item.id, { restSeconds: e.target.value ? Number(e.target.value) : null })}
                    className="w-28 bg-white border border-slate-200 rounded-xl py-1.5 px-2 text-xs font-bold text-center" />
                  <input value={item.notes} placeholder="Notas (opcional)"
                    onChange={e => updateItem(item.id, { notes: e.target.value })}
                    className="flex-1 min-w-[140px] bg-white border border-slate-200 rounded-xl py-1.5 px-2 text-xs font-bold" />
                </div>
              </div>
              <div className="flex flex-col gap-1 no-print shrink-0">
                <button onClick={() => moveItem(item.id, -1)} disabled={idx === 0} title="Subir"
                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-teal-600 disabled:opacity-20">
                  <span className="material-icons-round text-base">arrow_upward</span>
                </button>
                <button onClick={() => moveItem(item.id, 1)} disabled={idx === items.length - 1} title="Bajar"
                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-teal-600 disabled:opacity-20">
                  <span className="material-icons-round text-base">arrow_downward</span>
                </button>
                <button onClick={() => removeItem(item.id)} title="Eliminar" aria-label="Eliminar ejercicio"
                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-rose-500">
                  <span className="material-icons-round text-base">close</span>
                </button>
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 no-print pt-2 border-t border-slate-100">
          <button onClick={handleDownloadPDF} disabled={downloading}
            className="px-5 py-3 bg-slate-100 text-slate-700 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50 flex items-center gap-1.5">
            <span className="material-icons-round text-base">{downloading ? 'sync' : 'download'}</span> {downloading ? 'Generando...' : 'Descargar PDF'}
          </button>
          <button onClick={handleSendWhatsApp} disabled={sending !== null}
            className="px-5 py-3 bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-50 flex items-center gap-1.5">
            <span className="material-icons-round text-base">{sending === 'whatsapp' ? 'sync' : 'chat'}</span> {sending === 'whatsapp' ? 'Enviando...' : 'Enviar por WhatsApp'}
          </button>
          <button onClick={handleSendEmail} disabled={sending !== null}
            className="px-5 py-3 bg-teal-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-teal-600 transition-all disabled:opacity-50 flex items-center gap-1.5">
            <span className="material-icons-round text-base">{sending === 'email' ? 'sync' : 'mail'}</span> {sending === 'email' ? 'Enviando...' : 'Enviar por Email'}
          </button>
        </div>
      )}

      {sentRoutines.length > 0 && (
        <div className="no-print pt-4 border-t border-slate-100 space-y-3">
          <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Rutinas enviadas y adherencia</h3>
          {sentRoutines.map(r => {
            const totalChecks = r.items.reduce((acc, it) => acc + it.completions.length, 0);
            const weekAgo = new Date(Date.now() - 7 * 86400000);
            const recentChecks = r.items.reduce((acc, it) =>
              acc + it.completions.filter(c => new Date(c.on + 'T12:00:00') >= weekAgo).length, 0);
            const maxRecentPain = r.items.flatMap(it =>
              it.completions.filter(c => new Date(c.on + 'T12:00:00') >= weekAgo).map(c => c.pain)
            ).filter((p): p is number => p != null).reduce((a, b) => Math.max(a, b), 0);
            const isOpen = expandedRoutine === r.id;
            const link = `${window.location.origin}/rutina/${r.id}`;
            return (
              <div key={r.id} className="bg-slate-50/80 rounded-2xl border border-slate-200 p-4 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <button onClick={() => setExpandedRoutine(isOpen ? null : r.id)}
                    className="flex items-center gap-2 text-left flex-1 min-w-0">
                    <span className="material-icons-round text-slate-400 text-base">{isOpen ? 'expand_less' : 'expand_more'}</span>
                    <div className="min-w-0">
                      <p className="font-black text-xs text-slate-800 truncate">{r.title}</p>
                      <p className="text-[10px] text-slate-400">
                        {r.sentAt ? new Date(r.sentAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '—'}
                        {r.sentVia === 'whatsapp' ? ' · WhatsApp' : r.sentVia === 'email' ? ' · Email' : ''}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${recentChecks > 0 ? 'bg-teal-500/10 text-teal-700' : 'bg-slate-200 text-slate-500'}`}>
                      {recentChecks} checks últimos 7 días
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-200 text-slate-500">{totalChecks} total</span>
                    {maxRecentPain > 0 && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-white border border-slate-200 text-slate-600 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${painDotClass(maxRecentPain)}`} />
                        dolor máx. {maxRecentPain}/10 (7d)
                      </span>
                    )}
                    <button title="Copiar link de la rutina" aria-label="Copiar link de la rutina"
                      onClick={() => { navigator.clipboard?.writeText(link); toast.success('Link copiado'); }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50">
                      <span className="material-icons-round text-base">link</span>
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="pl-6 space-y-1.5 pt-1">
                    {r.items.map(it => {
                      const last = it.completions[it.completions.length - 1];
                      return (
                        <div key={it.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-slate-600 truncate">{it.nameEs}</span>
                          <span className={`shrink-0 font-black text-[10px] flex items-center gap-1.5 ${it.completions.length ? 'text-teal-600' : 'text-slate-400'}`}>
                            {last
                              ? `${it.completions.length} ${it.completions.length === 1 ? 'día' : 'días'} · último ${new Date(last.on + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`
                              : 'Sin registros'}
                            {last?.pain != null && (
                              <span className="flex items-center gap-1 text-slate-500">
                                · dolor {last.pain}
                                <span className={`w-2 h-2 rounded-full ${painDotClass(last.pain)}`} />
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showPicker && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 no-print" onClick={() => setShowPicker(false)}>
          <div className="bg-white w-full max-w-2xl max-h-[85vh] rounded-blob-lg shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
              <h3 className="font-black text-slate-800">Buscar Ejercicio</h3>
              <button onClick={() => setShowPicker(false)} aria-label="Cerrar" className="text-slate-400 hover:text-rose-500">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-4 border-b border-slate-100 flex gap-2 flex-wrap">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre..."
                className="flex-1 min-w-[160px] bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold" />
              <select value={muscleFilter} onChange={e => setMuscleFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold">
                <option value="">Todos los músculos</option>
                {muscles.map(m => <option key={m} value={m}>{MUSCLE_LABELS[m] || m}</option>)}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingCatalog ? (
                <p className="text-center text-sm text-slate-400 py-8">Cargando catálogo...</p>
              ) : filtered.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-8">Sin resultados.</p>
              ) : filtered.map(ex => (
                <button key={ex.id} onClick={() => addExercise(ex)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-teal-300 hover:bg-teal-50/50 transition-all text-left">
                  {ex.imageUrls[0] && (
                    <img src={ex.imageUrls[0]} alt={ex.nameEs} loading="lazy" className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm text-slate-800 truncate">{ex.nameEs}</p>
                    <p className="text-[11px] text-slate-400">
                      {ex.primaryMuscles.map(m => MUSCLE_LABELS[m] || m).join(', ')}
                      {ex.equipment ? ` · ${EQUIPMENT_LABELS[ex.equipment] || ex.equipment}` : ''}
                    </p>
                  </div>
                  <span className="material-icons-round text-teal-500">add_circle</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
