import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfessionalProfile, SubscriptionStatus } from '../types';
import { useClinic } from '../ClinicContext';
import { supabase } from '../supabaseClient';

type AdminTab = 'pending' | 'professionals' | 'config' | 'charlas' | 'finance' | 'support' | 'messages' | 'health';

interface FinanceRow { id: string; name: string; email: string; paidCount: number; gross: number; platformFee: number; net: number; }
interface HealthEvent { created_at: string; event_type: string | null; outcome: string | null; mp_status: string | null; payer_email: string | null; detail: string | null; }
interface FeedbackItem { id: string; professional_name: string | null; professional_email: string | null; type: string; subject: string | null; message: string; status: string; admin_reply: string | null; created_at: string; }

interface AdminCharla {
  id: string; titulo: string; descripcion: string | null;
  fecha: string; hora: string; duracion_min: number;
  ponente: string | null; meet_link: string | null; es_activa: boolean;
  _count?: number;
}
interface AdminReg {
  id: string; nombre: string; apellido: string | null; email: string;
  celular: string | null; ciudad: string | null; temas_interes: string[] | null;
  created_at: string; charla_titulo: string | null;
}

const AdminManagement: React.FC = () => {
  const navigate  = useNavigate();
  const { logout, isAdmin } = useClinic();

  const [activeTab, setActiveTab]       = useState<AdminTab>('pending');
  const [allPros, setAllPros]           = useState<ProfessionalProfile[]>([]);
  const [loadingIds, setLoadingIds]     = useState<Set<string>>(new Set());
  const [toast, setToast]               = useState('');
  const [giftModal, setGiftModal]       = useState<{ pro: ProfessionalProfile; days: string } | null>(null);
  const [subLinkModal, setSubLinkModal] = useState<{ pro: ProfessionalProfile; link: string } | null>(null);
  const [deleteModal, setDeleteModal]   = useState<ProfessionalProfile | null>(null);
  const [rejectModal, setRejectModal]   = useState<ProfessionalProfile | null>(null);
  const [seedModal, setSeedModal]       = useState<{ pro: ProfessionalProfile; rating: string; count: string } | null>(null);
  const [searchQuery, setSearchQuery]   = useState('');

  // ── Charlas state ──
  const [charlasList, setCharlasList]     = useState<AdminCharla[]>([]);
  const [charlasLoading, setCharlasLoading] = useState(false);
  const [showCharlaForm, setShowCharlaForm] = useState(false);
  const [editingCharla, setEditingCharla]   = useState<AdminCharla | null>(null);
  const [charlaFormData, setCharlaFormData] = useState({
    titulo: '', descripcion: '', fecha: '', hora: '20:00',
    duracion_min: 60, ponente: 'Equipo Clínica Mas Life', meet_link: '', es_activa: true,
  });
  const [charlasSaving, setCharlasSaving]   = useState(false);
  const [selectedCharlaRegs, setSelectedCharlaRegs] = useState<{ charla: AdminCharla; regs: AdminReg[] } | null>(null);
  const [regsLoading, setRegsLoading]       = useState(false);
  const [blastModal, setBlastModal]         = useState<{ charla: AdminCharla | null; totalRegs: number } | null>(null);
  const [blastForm, setBlastForm]           = useState({ asunto: '', mensaje: '' });
  const [blastSending, setBlastSending]     = useState(false);
  const [blastResult, setBlastResult]       = useState<{ sent: number } | null>(null);

  // ── Finanzas / Salud / Soporte / Mensajes ──
  const [finance, setFinance] = useState<{ feePct: number; rows: FinanceRow[]; totals: { gross: number; fee: number; count: number } } | null>(null);
  const [health, setHealth] = useState<{ events: HealthEvent[]; outcomeCounts: Record<string, number>; pausedPros: { id: string; name: string }[] } | null>(null);
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [msgForm, setMsgForm] = useState({ asunto: '', mensaje: '' });
  const [msgSending, setMsgSending] = useState(false);
  const [msgResult, setMsgResult] = useState<{ sent: number } | null>(null);
  const [msgTargets, setMsgTargets] = useState<Set<string>>(new Set()); // vacío = todos

  const openFeedbackCount = feedbackList.filter(f => f.status === 'open').length;
  const healthAlertCount = health ? (health.outcomeCounts['unmatched'] || 0) + (health.outcomeCounts['error'] || 0) + (health.outcomeCounts['signature_rejected'] || 0) : 0;

  const MP_SUBSCRIPTION_LINK = import.meta.env.VITE_GLOBAL_SUBSCRIPTION_LINK || 'https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=e7c9a9a7adc24dee8c1f7fb78bdbdc67';

  useEffect(() => { if (!isAdmin) navigate('/admin/login'); }, [isAdmin, navigate]);

  function adminFetch(method: string, body?: object, action?: string) {
    const token = sessionStorage.getItem('maslife_admin_token') || '';
    const url = '/api/admin-auth' + (action ? `?action=${action}` : '');
    return fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  useEffect(() => {
    const loadAll = async () => {
      const res = await adminFetch('GET', undefined, 'list');
      const json = await res.json();
      if (!res.ok || json.error) { console.error('[admin] loadAll error:', json.error); return; }
      setAllPros((json.data as Record<string, unknown>[]).map(mapDBtoPro));
    };
    if (isAdmin) loadAll();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    // Cargas con aviso si fallan (antes catch vacío → pestaña vacía indistinguible
    // de "sin datos"; si el token expiró, ahora el admin se entera).
    const loadTab = async (action: string, apply: (j: any) => void) => {
      try {
        const r = await adminFetch('GET', undefined, action);
        const j = await r.json();
        if (!r.ok || j.error) throw new Error(j.error || 'Error');
        apply(j);
      } catch {
        showToast('❌ No se pudieron cargar los datos (¿sesión de admin expirada?).');
      }
    };
    if (activeTab === 'charlas') loadCharlas();
    if (activeTab === 'finance') loadTab('finance', setFinance);
    if (activeTab === 'health')  loadTab('health', setHealth);
    if (activeTab === 'support') loadTab('feedback', j => setFeedbackList(j.data || []));
  }, [isAdmin, activeTab]);

  // Precargar soporte y salud para los contadores de las pestañas
  useEffect(() => {
    if (!isAdmin) return;
    adminFetch('GET', undefined, 'feedback').then(r => r.json()).then(j => setFeedbackList(j.data || [])).catch(() => {});
    adminFetch('GET', undefined, 'health').then(r => r.json()).then(setHealth).catch(() => {});
  }, [isAdmin]);

  const resolveFeedback = async (item: FeedbackItem) => {
    await adminFetch('PATCH', { id: item.id, status: item.status === 'open' ? 'resolved' : 'open' }, 'feedback');
    setFeedbackList(prev => prev.map(f => f.id === item.id ? { ...f, status: f.status === 'open' ? 'resolved' : 'open' } : f));
  };

  const sendProBlast = async () => {
    if (!msgForm.asunto.trim() || !msgForm.mensaje.trim()) return;
    setMsgSending(true);
    const token = sessionStorage.getItem('maslife_admin_token') || '';
    const body: Record<string, unknown> = { action: 'pro-blast', asunto: msgForm.asunto, mensaje: msgForm.mensaje };
    if (msgTargets.size > 0) body.professionalIds = [...msgTargets];
    const res = await fetch('/api/notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setMsgSending(false);
    if (res.ok) { setMsgResult({ sent: json.sent }); setMsgForm({ asunto: '', mensaje: '' }); }
    else showToast(`❌ Error al enviar: ${json.error}`);
  };

  const clp = (n: number) => '$' + (n || 0).toLocaleString('es-CL');

  const pending  = allPros.filter(p => !p.isApproved);
  const approved = allPros.filter(p => p.isApproved);

  const activeCount  = approved.filter(p => p.subscriptionStatus === 'active').length;
  const trialCount   = approved.filter(p => p.subscriptionStatus === 'trial').length;
  const pausedCount  = approved.filter(p => p.subscriptionStatus === 'paused').length;
  const needsResetCount = allPros.filter(p => p.needsPasswordReset).length;

  const filteredApproved = approved.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      (p.specialty || '').toLowerCase().includes(q) ||
      (p.city || '').toLowerCase().includes(q)
    );
  });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };
  const setLoading = (id: string, val: boolean) => {
    setLoadingIds(prev => { const next = new Set(prev); val ? next.add(id) : next.delete(id); return next; });
  };

  const handleApprove = async (pro: ProfessionalProfile) => {
    setLoading(pro.id, true);
    try {
      // Aprobar = perfil usable. La insignia "Verificado" se otorga aparte tras
      // revisar el código SIS + RUT (handleToggleVerified).
      const res = await adminFetch('PATCH', { id: pro.id, is_approved: true });
      if (!res.ok) throw new Error((await res.json()).error);
      setAllPros(prev => prev.map(p => p.id === pro.id ? { ...p, isApproved: true } : p));
      showToast(`✅ ${pro.name} aprobado`);
    } catch { showToast('❌ Error al aprobar.'); }
    finally { setLoading(pro.id, false); }
  };

  // Otorga o retira la insignia de "Profesional Verificado" (tras revisar SIS + RUT).
  const handleToggleVerified = async (pro: ProfessionalProfile) => {
    setLoading(pro.id, true);
    const next = !pro.isVerified;
    try {
      const res = await adminFetch('PATCH', { id: pro.id, is_verified: next });
      if (!res.ok) throw new Error((await res.json()).error);
      setAllPros(prev => prev.map(p => p.id === pro.id ? { ...p, isVerified: next } : p));
      showToast(next ? `🛡️ ${pro.name} verificado` : `Insignia retirada a ${pro.name}`);
    } catch { showToast('❌ Error al actualizar la insignia.'); }
    finally { setLoading(pro.id, false); }
  };

  // Fija la nota base (estrellas) y nº de reseñas base para que el perfil no parta en cero.
  const handleSeedRating = async (pro: ProfessionalProfile, rating: number, count: number) => {
    const safeRating = Math.max(0, Math.min(5, rating));
    const safeCount = Math.max(0, Math.round(count));
    setLoading(pro.id, true);
    try {
      const res = await adminFetch('PATCH', { id: pro.id, seed_rating: safeRating, seed_rating_count: safeCount });
      if (!res.ok) throw new Error((await res.json()).error);
      setAllPros(prev => prev.map(p => p.id === pro.id ? { ...p, seedRating: safeRating, seedRatingCount: safeCount } : p));
      showToast(`⭐ Nota base de ${pro.name}: ${safeRating} (${safeCount})`);
    } catch { showToast('❌ Error al fijar la nota base.'); }
    finally { setLoading(pro.id, false); }
  };

  const handleReject = async (pro: ProfessionalProfile) => { setRejectModal(pro); };

  const confirmReject = async () => {
    if (!rejectModal) return;
    const pro = rejectModal;
    setRejectModal(null);
    setLoading(pro.id, true);
    try {
      const res = await adminFetch('PATCH', { id: pro.id, is_approved: false, is_verified: false });
      if (!res.ok) throw new Error((await res.json()).error);
      setAllPros(prev => prev.map(p => p.id === pro.id ? { ...p, isApproved: false, isVerified: false } : p));
      showToast(`⛔ ${pro.name} desactivado`);
    } catch { showToast('❌ Error al desactivar.'); }
    finally { setLoading(pro.id, false); }
  };

  const handleDelete = (pro: ProfessionalProfile) => { setDeleteModal(pro); };

  const confirmDelete = async () => {
    if (!deleteModal) return;
    const pro = deleteModal;
    setDeleteModal(null);
    setLoading(pro.id, true);
    try {
      const res = await adminFetch('DELETE', { id: pro.id });
      if (!res.ok) throw new Error((await res.json()).error);
      setAllPros(prev => prev.filter(p => p.id !== pro.id));
      showToast(`🗑️ ${pro.name} eliminado permanentemente`);
    } catch { showToast('❌ Error al eliminar.'); }
    finally { setLoading(pro.id, false); }
  };

  const setSubStatus = async (pro: ProfessionalProfile, next: SubscriptionStatus) => {
    const isActive    = next === 'active';
    const isPausedNext = next === 'paused';
    const res = await adminFetch('PATCH', {
      id: pro.id, subscription_status: next, is_subscribed: isActive, is_public: !isPausedNext,
    });
    if (res.ok) {
      setAllPros(prev => prev.map(p => p.id === pro.id
        ? { ...p, subscriptionStatus: next, isSubscribed: isActive, isPublic: !isPausedNext } : p));
      const label = isActive ? '✅ Activo' : isPausedNext ? '⏸️ Pausado' : '⏳ Trial';
      showToast(`${pro.name} → ${label}`);
    } else {
      showToast('❌ No se pudo cambiar la suscripción. Intenta de nuevo.');
    }
  };

  const handleToggleExempt = async (pro: ProfessionalProfile) => {
    const next = !pro.subscriptionExempt;
    const res = await adminFetch('PATCH', { id: pro.id, subscription_exempt: next });
    if (res.ok) {
      setAllPros(prev => prev.map(p => p.id === pro.id ? { ...p, subscriptionExempt: next } : p));
      showToast(next ? `🎁 Free pass activado: ${pro.name}` : `🔒 Free pass removido: ${pro.name}`);
    } else {
      showToast('❌ Error al actualizar free pass');
    }
  };

  const handleSaveSubLink = async () => {
    if (!subLinkModal) return;
    const res = await adminFetch('PATCH', { id: subLinkModal.pro.id, subscription_link: subLinkModal.link.trim() });
    if (res.ok) {
      setAllPros(prev => prev.map(p => p.id === subLinkModal!.pro.id
        ? { ...p, subscriptionLink: subLinkModal!.link.trim() } : p));
      showToast(`Link de pago actualizado: ${subLinkModal.pro.name}`);
      setSubLinkModal(null);
    } else {
      showToast('❌ No se pudo guardar el link de pago. Intenta de nuevo.');
    }
  };

  const handleGiftDays = async () => {
    if (!giftModal) return;
    const days = parseInt(giftModal.days, 10);
    if (!days || days < 1 || days > 365) return;
    const base = giftModal.pro.trialEndDate && new Date(giftModal.pro.trialEndDate) > new Date()
      ? new Date(giftModal.pro.trialEndDate) : new Date();
    base.setDate(base.getDate() + days);
    const newDate = base.toISOString().split('T')[0];
    const res = await adminFetch('PATCH', {
      id: giftModal.pro.id, subscription_status: 'trial',
      trial_end_date: newDate, is_subscribed: false, is_public: true,
    });
    if (res.ok) {
      const updated = { ...giftModal.pro, subscriptionStatus: 'trial' as SubscriptionStatus, trialEndDate: newDate, isSubscribed: false, isPublic: true };
      setAllPros(prev => prev.map(p => p.id === giftModal!.pro.id ? updated : p));
      showToast(`🎁 ${giftModal.pro.name} → +${days} días (hasta ${new Date(newDate + 'T12:00:00').toLocaleDateString('es-CL')})`);
      setGiftModal(null);
    } else {
      showToast('❌ No se pudieron regalar los días. Intenta de nuevo.');
    }
  };

  const [resetSent, setResetSent] = useState<Record<string, 'loading' | 'sent' | 'error'>>({});
  const sendPasswordReset = async (pro: ProfessionalProfile) => {
    setResetSent(s => ({ ...s, [pro.id]: 'loading' }));
    const { error } = await supabase.auth.resetPasswordForEmail(pro.email, {
      redirectTo: 'https://clinicamaslife.cl/pro/reset-password',
    });
    if (error) {
      setResetSent(s => ({ ...s, [pro.id]: 'error' }));
      showToast(`❌ Error al enviar email a ${pro.email}`);
    } else {
      setResetSent(s => ({ ...s, [pro.id]: 'sent' }));
      showToast(`📧 Email de recuperación enviado a ${pro.name}`);
    }
  };

  // ── Charlas handlers ──
  const loadCharlas = async () => {
    setCharlasLoading(true);
    // Vía el endpoint admin (service role, token verificado). Antes iba por el
    // cliente del navegador, que la RLS bloqueaba → las charlas no cargaban/guardaban.
    try {
      const [cRes, rRes] = await Promise.all([
        adminFetch('GET', undefined, 'charlas'),
        adminFetch('GET', undefined, 'charla-regs'),
      ]);
      const cJson = await cRes.json();
      const rJson = await rRes.json().catch(() => ({ data: [] }));
      if (!cRes.ok || cJson.error) throw new Error(cJson.error || 'Error');
      const countMap: Record<string, number> = {};
      (rJson.data || []).forEach((r: { charla_id: string }) => { if (r.charla_id) countMap[r.charla_id] = (countMap[r.charla_id] || 0) + 1; });
      setCharlasList((cJson.data || []).map((c: AdminCharla) => ({ ...c, _count: countMap[c.id] || 0 })));
    } catch {
      showToast('❌ No se pudieron cargar las charlas (revisa tu sesión de admin).');
    } finally {
      setCharlasLoading(false);
    }
  };

  const openCharlaForm = (c?: AdminCharla) => {
    if (c) {
      setEditingCharla(c);
      setCharlaFormData({ titulo: c.titulo, descripcion: c.descripcion || '', fecha: c.fecha,
        hora: c.hora, duracion_min: c.duracion_min, ponente: c.ponente || '',
        meet_link: c.meet_link || '', es_activa: c.es_activa });
    } else {
      setEditingCharla(null);
      setCharlaFormData({ titulo: '', descripcion: '', fecha: '', hora: '20:00',
        duracion_min: 60, ponente: 'Equipo Clínica Mas Life', meet_link: '', es_activa: true });
    }
    setShowCharlaForm(true);
  };

  const handleSaveCharla = async () => {
    if (!charlaFormData.titulo.trim() || !charlaFormData.fecha || !charlaFormData.hora) return;
    setCharlasSaving(true);
    const payload: Record<string, unknown> = {
      titulo: charlaFormData.titulo.trim(),
      descripcion: charlaFormData.descripcion.trim() || null,
      fecha: charlaFormData.fecha,
      hora: charlaFormData.hora,
      duracion_min: charlaFormData.duracion_min,
      ponente: charlaFormData.ponente.trim() || null,
      meet_link: charlaFormData.meet_link.trim() || null,
      es_activa: charlaFormData.es_activa,
    };
    if (editingCharla) payload.id = editingCharla.id;
    // Guardado por el endpoint admin: ahora SÍ verifica el error (antes fingía éxito
    // aunque la RLS rechazara → la charla nunca se guardaba y "desaparecía").
    const res = await adminFetch('PATCH', payload, 'charla');
    const json = await res.json().catch(() => ({}));
    setCharlasSaving(false);
    if (!res.ok || json.error) { showToast(`❌ No se pudo guardar la charla: ${json.error || 'error'}`); return; }
    setShowCharlaForm(false);
    loadCharlas();
    showToast(editingCharla ? '✅ Charla actualizada' : '✅ Charla creada');
  };

  const handleToggleCharla = async (c: AdminCharla) => {
    const next = !c.es_activa;
    const res = await adminFetch('PATCH', { id: c.id, es_activa: next }, 'charla');
    if (!res.ok) { showToast('❌ No se pudo cambiar el estado de la charla.'); return; }
    setCharlasList(prev => prev.map(x => x.id === c.id ? { ...x, es_activa: next } : x));
    showToast(next ? '✅ Charla activada' : '⏸️ Charla ocultada');
  };

  const loadRegs = async (c: AdminCharla) => {
    setRegsLoading(true);
    const res = await adminFetch('GET', undefined, `charla-regs&charlaId=${c.id}`);
    const json = await res.json().catch(() => ({ data: [] }));
    setSelectedCharlaRegs({ charla: c, regs: (json.data || []) as AdminReg[] });
    setRegsLoading(false);
  };

  const openBlastModal = async (charla: AdminCharla | null) => {
    // Cuenta destinatarios por el MISMO backend que hace el envío (service role),
    // para no mostrar 0 y bloquear el botón cuando la RLS ocultaba los inscritos.
    const res = await adminFetch('GET', undefined, charla ? `charla-regs&charlaId=${charla.id}` : 'charla-regs');
    const json = await res.json().catch(() => ({ count: 0 }));
    setBlastForm({ asunto: charla ? `Recordatorio: ${charla.titulo}` : 'Mensaje de Clínica Mas Life', mensaje: '' });
    setBlastResult(null);
    setBlastModal({ charla, totalRegs: json.count || 0 });
  };

  const handleSendBlast = async () => {
    if (!blastForm.asunto.trim() || !blastForm.mensaje.trim()) return;
    setBlastSending(true);
    const token = sessionStorage.getItem('maslife_admin_token') || '';
    const body: Record<string, unknown> = {
      action: 'charla-blast',
      asunto: blastForm.asunto,
      mensaje: blastForm.mensaje,
    };
    if (blastModal?.charla) body.charlaId = blastModal.charla.id;
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setBlastSending(false);
    if (res.ok) { setBlastResult({ sent: json.sent }); }
    else { showToast(`❌ Error al enviar: ${json.error}`); }
  };

  const exportCSV = (regs: AdminReg[], titulo: string) => {
    const headers = ['Nombre', 'Apellido', 'Email', 'Celular', 'Ciudad', 'Temas', 'Fecha inscripción'];
    const rows = regs.map(r => [
      r.nombre, r.apellido || '', r.email, r.celular || '', r.ciudad || '',
      (r.temas_interes || []).join(' | '),
      new Date(r.created_at).toLocaleDateString('es-CL'),
    ]);
    const csv = [headers, ...rows].map(row => row.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `inscritos-${titulo.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (!isAdmin) return null;

  const subStatusBadge = (status: SubscriptionStatus, trialEndDate?: string) => {
    const map: Record<SubscriptionStatus, { label: string; cls: string }> = {
      active:  { label: 'Activo',  cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20' },
      trial:   { label: 'Trial',   cls: 'bg-blue-500/15 text-blue-600 border-blue-500/20' },
      paused:  { label: 'Pausado', cls: 'bg-rose-500/15 text-rose-600 border-rose-500/20' },
    };
    const { label, cls } = map[status] || map.paused;
    const expiry = trialEndDate
      ? new Date(trialEndDate + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: '2-digit' })
      : null;
    return (
      <div className="flex flex-col gap-0.5">
        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border w-fit ${cls}`}>{label}</span>
        {expiry && <span className="text-[10px] text-slate-500">{status === 'active' ? 'desde' : 'vence'} {expiry}</span>}
      </div>
    );
  };

  return (
    <div className="flex-1 w-full h-full bg-slate-50 overflow-y-auto text-slate-700">

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-[300] bg-slate-800 text-white px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold border border-slate-200 animate-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      <div className="max-w-6xl mx-auto p-5 md:p-10">

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <p className="text-teal-500 font-black text-[10px] uppercase tracking-widest mb-1">Panel de Control</p>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900">Administración Central</h1>
          </div>
          <button onClick={() => logout(navigate, 'ADMIN')}
            className="px-4 py-2 bg-slate-100 text-slate-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-500/20 hover:text-rose-600 transition-all flex items-center gap-2 shrink-0">
            <span className="material-icons-round text-base">logout</span>
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>

        {/* ── Stats bar ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[
            { val: allPros.length,  label: 'Total',     icon: 'groups',          cls: 'text-slate-900' },
            { val: activeCount,     label: 'Activos',   icon: 'verified',        cls: 'text-emerald-600' },
            { val: trialCount,      label: 'Trial',     icon: 'hourglass_empty', cls: 'text-blue-600' },
            { val: pausedCount,     label: 'Pausados',  icon: 'pause_circle',    cls: 'text-rose-600' },
            { val: pending.length,  label: 'Pendientes',icon: 'pending_actions', cls: pending.length > 0 ? 'text-amber-600' : 'text-slate-500' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
              <span className={`material-icons-round text-xl ${s.cls}`}>{s.icon}</span>
              <div>
                <p className={`text-xl font-black leading-none ${s.cls}`}>{s.val}</p>
                <p className="text-[10px] text-slate-500 font-bold mt-0.5 uppercase tracking-widest">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-2 mb-6 bg-slate-100 p-1.5 rounded-2xl w-fit overflow-x-auto">
          {([
            { id: 'pending',       label: 'Pendientes',    icon: 'pending_actions', count: pending.length },
            { id: 'professionals', label: 'Profesionales', icon: 'groups',          count: 0 },
            { id: 'finance',       label: 'Finanzas',      icon: 'payments',        count: 0 },
            { id: 'support',       label: 'Soporte',       icon: 'forum',           count: openFeedbackCount },
            { id: 'messages',      label: 'Mensajes',      icon: 'campaign',        count: 0 },
            { id: 'health',        label: 'Salud',         icon: 'monitor_heart',   count: healthAlertCount },
            { id: 'charlas',       label: 'Charlas',       icon: 'mic',             count: 0 },
            { id: 'config',        label: 'Config',        icon: 'settings',        count: 0 },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap
                ${activeTab === tab.id ? 'bg-teal-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}>
              <span className="material-icons-round text-base">{tab.icon}</span>
              {tab.label}
              {tab.count > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-600'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── TAB: Pendientes ── */}
        {activeTab === 'pending' && (
          <div>
            {pending.length === 0 ? (
              <div className="text-center py-20">
                <span className="material-icons-round text-5xl text-slate-700 block mb-3">check_circle</span>
                <p className="text-slate-500 font-bold">No hay solicitudes pendientes</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-slate-400 text-sm font-bold">
                  {pending.length} profesional{pending.length !== 1 ? 'es' : ''} esperando aprobación
                </p>
                {pending.map(pro => {
                  const daysAgo = Math.floor((Date.now() - new Date(pro.createdAt).getTime()) / 86400000);
                  return (
                    <div key={pro.id} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
                      <div className="flex gap-4 items-start mb-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-400 to-sky-500 overflow-hidden shrink-0 flex items-center justify-center">
                          {pro.avatar
                            ? <img src={pro.avatar} className="w-full h-full object-cover" alt={pro.name} />
                            : <span className="font-black text-white text-lg">{pro.name.charAt(0)}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <p className="font-black text-slate-900">{pro.name}</p>
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 ${daysAgo >= 3 ? 'bg-amber-500/20 text-amber-600' : 'bg-slate-200 text-slate-500'}`}>
                              Hace {daysAgo === 0 ? 'hoy' : `${daysAgo}d`}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">{pro.email}</p>
                          <p className="text-xs text-teal-600 font-bold mt-0.5">{pro.specialty} · {pro.city}</p>
                          {pro.rut && <p className="text-xs text-slate-600 mt-0.5">RUT: {pro.rut}</p>}
                          {pro.sisCode && <p className="text-xs text-slate-600 mt-0.5">SIS: <strong className="font-mono">{pro.sisCode}</strong></p>}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-3 border-t border-slate-200">
                        <button onClick={() => handleApprove(pro)} disabled={loadingIds.has(pro.id)}
                          className="flex-1 px-4 py-2.5 bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 rounded-xl text-xs font-black hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                          <span className={`material-icons-round text-base ${loadingIds.has(pro.id) ? 'animate-spin' : ''}`}>
                            {loadingIds.has(pro.id) ? 'sync' : 'check_circle'}
                          </span>
                          Aprobar
                        </button>
                        <button onClick={() => handleReject(pro)} disabled={loadingIds.has(pro.id)}
                          className="flex-1 px-4 py-2.5 bg-rose-500/10 text-rose-600 border border-rose-500/20 rounded-xl text-xs font-black hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                          <span className="material-icons-round text-base">cancel</span>
                          Rechazar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Profesionales ── */}
        {activeTab === 'professionals' && (
          <div className="space-y-4">
            {/* Búsqueda */}
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 material-icons-round text-slate-500 text-lg pointer-events-none">search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, email, especialidad o ciudad…"
                className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-teal-500/50 transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors">
                  <span className="material-icons-round text-base">close</span>
                </button>
              )}
            </div>

            {needsResetCount > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="material-icons-round text-amber-600 text-lg">lock_reset</span>
                <p className="text-amber-600 text-xs font-bold">
                  {needsResetCount} profesional{needsResetCount !== 1 ? 'es necesitan' : ' necesita'} resetear contraseña
                </p>
              </div>
            )}

            {/* Tabla */}
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
              {filteredApproved.length === 0 ? (
                <div className="text-center py-20">
                  <span className="material-icons-round text-5xl text-slate-700 block mb-3">groups</span>
                  <p className="text-slate-500 font-bold">
                    {searchQuery ? 'Sin resultados para esa búsqueda' : 'Sin profesionales aprobados aún'}
                  </p>
                </div>
              ) : (
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-left min-w-[800px]">
                    <thead className="bg-slate-100 border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Especialista</th>
                        <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Ciudad</th>
                        <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Suscripción</th>
                        <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Registro</th>
                        <th className="px-5 py-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredApproved.map(pro => (
                        <tr key={pro.id} className="hover:bg-white/[0.03] transition-colors">
                          {/* Especialista */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-sky-500 overflow-hidden shrink-0 flex items-center justify-center">
                                {pro.avatar
                                  ? <img src={pro.avatar} className="w-full h-full object-cover" alt={pro.name} />
                                  : <span className="font-black text-slate-900">{pro.name.charAt(0)}</span>}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-sm font-black text-slate-900 truncate max-w-[140px]">{pro.name}</p>
                                  {pro.needsPasswordReset && (
                                    <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-600 border border-amber-500/30 rounded-md text-[9px] font-black uppercase tracking-wide shrink-0">
                                      Reset pwd
                                    </span>
                                  )}
                                  {!pro.isPublic && (
                                    <span className="px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded-md text-[9px] font-black uppercase tracking-wide shrink-0">Oculto</span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 truncate max-w-[180px]">{pro.email}</p>
                                <p className="text-[11px] text-teal-600 truncate max-w-[180px]">{pro.specialty}</p>
                              </div>
                            </div>
                          </td>
                          {/* Ciudad */}
                          <td className="px-5 py-4">
                            <p className="text-xs text-slate-700 font-bold">{pro.city || '—'}</p>
                            {pro.paymentEnabled && (
                              <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-0.5 mt-0.5">
                                <span className="material-icons-round text-[10px]">payments</span> Pago activo
                              </span>
                            )}
                          </td>
                          {/* Suscripción */}
                          <td className="px-5 py-4">
                            {subStatusBadge(pro.subscriptionStatus, pro.trialEndDate)}
                          </td>
                          {/* Fecha registro */}
                          <td className="px-5 py-4">
                            <p className="text-xs text-slate-500 font-bold">
                              {new Date(pro.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: '2-digit' })}
                            </p>
                          </td>
                          {/* Acciones */}
                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-1.5 flex-wrap">
                              {/* Link suscripción */}
                              <button onClick={() => setSubLinkModal({ pro, link: pro.subscriptionLink || '' })}
                                title="Link de pago"
                                className={`p-2 rounded-xl border transition-all text-xs ${pro.subscriptionLink ? 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-sky-500 hover:text-white'}`}>
                                <span className="material-icons-round text-sm">link</span>
                              </button>
                              {/* Regalar días */}
                              <button onClick={() => setGiftModal({ pro, days: '30' })}
                                title="Regalar días de trial"
                                className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-violet-500 hover:text-white transition-all border border-slate-200">
                                <span className="material-icons-round text-sm">card_giftcard</span>
                              </button>
                              {/* Reset contraseña */}
                              <button
                                onClick={() => sendPasswordReset(pro)}
                                disabled={resetSent[pro.id] === 'loading' || resetSent[pro.id] === 'sent'}
                                title={resetSent[pro.id] === 'sent' ? 'Email enviado' : 'Enviar reset de contraseña'}
                                className={`p-2 rounded-xl border transition-all ${
                                  resetSent[pro.id] === 'sent'   ? 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30 cursor-default'
                                  : resetSent[pro.id] === 'error' ? 'bg-rose-500/20 text-rose-600 border-rose-500/30'
                                  : pro.needsPasswordReset        ? 'bg-amber-500/20 text-amber-600 border-amber-500/30 hover:bg-amber-500 hover:text-white'
                                  : 'bg-slate-100 text-slate-500 hover:bg-blue-500 hover:text-white border-slate-200'}`}>
                                <span className={`material-icons-round text-sm ${resetSent[pro.id] === 'loading' ? 'animate-spin' : ''}`}>
                                  {resetSent[pro.id] === 'loading' ? 'sync' : resetSent[pro.id] === 'sent' ? 'mark_email_read' : resetSent[pro.id] === 'error' ? 'error' : 'lock_reset'}
                                </span>
                              </button>
                              {/* Activar */}
                              {pro.subscriptionStatus !== 'active' && (
                                <button onClick={() => setSubStatus(pro, 'active')} title="Activar suscripción"
                                  className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-emerald-500 hover:text-white transition-all border border-slate-200">
                                  <span className="material-icons-round text-sm">play_arrow</span>
                                </button>
                              )}
                              {/* Pausar */}
                              {pro.subscriptionStatus !== 'paused' && (
                                <button onClick={() => setSubStatus(pro, 'paused')} title="Pausar (oculta perfil)"
                                  className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-amber-500 hover:text-white transition-all border border-slate-200">
                                  <span className="material-icons-round text-sm">pause</span>
                                </button>
                              )}
                              {/* Desactivar */}
                              <button onClick={() => handleReject(pro)} title="Desactivar aprobación"
                                className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-amber-600 hover:text-white transition-all border border-slate-200">
                                <span className="material-icons-round text-sm">block</span>
                              </button>
                              {/* Free pass / Exento */}
                              <button onClick={() => handleToggleExempt(pro)}
                                title={pro.subscriptionExempt ? 'Quitar free pass' : 'Dar free pass (exento de pago)'}
                                className={`p-2 rounded-xl border transition-all ${
                                  pro.subscriptionExempt
                                    ? 'bg-teal-500 text-white border-teal-400 hover:bg-teal-600'
                                    : 'bg-slate-100 text-slate-500 hover:bg-teal-500 hover:text-white border-slate-200'
                                }`}>
                                <span className="material-icons-round text-sm">card_giftcard</span>
                              </button>
                              {/* Insignia verificado (revisar SIS + RUT) */}
                              <button onClick={() => handleToggleVerified(pro)}
                                title={pro.isVerified
                                  ? `Verificado — SIS: ${pro.sisCode || 's/i'} · RUT: ${pro.rut || 's/i'} (clic para quitar)`
                                  : `Otorgar insignia de verificado — SIS: ${pro.sisCode || 's/i'} · RUT: ${pro.rut || 's/i'}`}
                                className={`p-2 rounded-xl border transition-all ${
                                  pro.isVerified
                                    ? 'bg-emerald-500 text-white border-emerald-400 hover:bg-emerald-600'
                                    : 'bg-slate-100 text-slate-500 hover:bg-emerald-500 hover:text-white border-slate-200'
                                }`}>
                                <span className="material-icons-round text-sm">verified</span>
                              </button>
                              {/* Nota base (estrellas) */}
                              <button onClick={() => setSeedModal({ pro, rating: String(pro.seedRating ?? 0), count: String(pro.seedRatingCount ?? 0) })}
                                title={`Nota base: ${pro.seedRating ?? 0} (${pro.seedRatingCount ?? 0} reseñas)`}
                                className={`p-2 rounded-xl border transition-all ${
                                  (pro.seedRating ?? 0) > 0
                                    ? 'bg-amber-500/20 text-amber-600 border-amber-500/30 hover:bg-amber-500 hover:text-white'
                                    : 'bg-slate-100 text-slate-500 hover:bg-amber-500 hover:text-white border-slate-200'
                                }`}>
                                <span className="material-icons-round text-sm">star</span>
                              </button>
                              {/* Eliminar */}
                              <button onClick={() => handleDelete(pro)} title="Eliminar permanentemente"
                                className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-rose-500 hover:text-white transition-all border border-slate-200">
                                <span className="material-icons-round text-sm">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {searchQuery && filteredApproved.length > 0 && (
              <p className="text-xs text-slate-600 text-right">
                {filteredApproved.length} de {approved.length} profesionales
              </p>
            )}
          </div>
        )}

        {/* ── TAB: Finanzas ── */}
        {activeTab === 'finance' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: 'Ingreso bruto total', val: clp(finance?.totals.gross || 0), icon: 'trending_up', cls: 'text-emerald-600' },
                { label: `Comisión plataforma (${finance?.feePct ?? 5}%)`, val: clp(finance?.totals.fee || 0), icon: 'account_balance', cls: 'text-sky-600' },
                { label: 'Citas pagadas', val: String(finance?.totals.count || 0), icon: 'receipt_long', cls: 'text-violet-600' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-2"><span className={`material-icons-round ${s.cls}`}>{s.icon}</span>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{s.label}</p></div>
                  <p className={`text-2xl font-black ${s.cls}`}>{s.val}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Ingreso por profesional</p>
                {!finance && <span className="material-icons-round text-slate-300 animate-spin text-sm">sync</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="text-left px-6 py-3">Profesional</th>
                    <th className="text-right px-4 py-3">Citas</th>
                    <th className="text-right px-4 py-3">Bruto</th>
                    <th className="text-right px-4 py-3">Comisión</th>
                    <th className="text-right px-6 py-3">Neto profesional</th>
                  </tr></thead>
                  <tbody>
                    {(finance?.rows || []).map(r => (
                      <tr key={r.id} className="border-t border-slate-50 hover:bg-slate-50">
                        <td className="px-6 py-3"><p className="font-black text-slate-800">{r.name}</p><p className="text-[10px] text-slate-400">{r.email}</p></td>
                        <td className="px-4 py-3 text-right font-bold text-slate-600">{r.paidCount}</td>
                        <td className="px-4 py-3 text-right font-black text-slate-800">{clp(r.gross)}</td>
                        <td className="px-4 py-3 text-right font-bold text-sky-600">{clp(r.platformFee)}</td>
                        <td className="px-6 py-3 text-right font-black text-emerald-600">{clp(r.net)}</td>
                      </tr>
                    ))}
                    {finance && finance.rows.every(r => r.gross === 0) && (
                      <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400 text-sm italic">Aún no hay pagos registrados. Los ingresos aparecerán cuando los pacientes paguen por MercadoPago.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: Soporte / Sugerencias ── */}
        {activeTab === 'support' && (
          <div className="space-y-3">
            {feedbackList.length === 0 && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 text-center text-slate-400 text-sm italic">Sin mensajes de profesionales todavía.</div>
            )}
            {feedbackList.map(f => (
              <div key={f.id} className={`bg-white rounded-2xl border shadow-sm p-5 ${f.status === 'open' ? 'border-amber-200' : 'border-slate-200 opacity-70'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${f.type === 'problem' ? 'bg-rose-100 text-rose-600' : 'bg-teal-100 text-teal-600'}`}>{f.type === 'problem' ? 'Problema' : 'Sugerencia'}</span>
                      {f.status === 'open'
                        ? <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">Abierto</span>
                        : <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">Resuelto</span>}
                    </div>
                    {f.subject && <p className="font-black text-slate-800 text-sm">{f.subject}</p>}
                    <p className="text-sm text-slate-600 leading-relaxed mt-1 whitespace-pre-wrap">{f.message}</p>
                    <p className="text-[10px] text-slate-400 mt-2">{f.professional_name} · {f.professional_email} · {new Date(f.created_at).toLocaleDateString('es-CL')}</p>
                  </div>
                  <button onClick={() => resolveFeedback(f)} title={f.status === 'open' ? 'Marcar resuelto' : 'Reabrir'}
                    className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${f.status === 'open' ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                    <span className="material-icons-round text-lg">{f.status === 'open' ? 'check' : 'undo'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TAB: Mensajes a profesionales ── */}
        {activeTab === 'messages' && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-3"><span className="material-icons-round text-primary">campaign</span>
                <h3 className="text-base font-black text-slate-900">Enviar mensaje a profesionales</h3></div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setMsgTargets(new Set())}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${msgTargets.size === 0 ? 'bg-primary text-white border-primary' : 'bg-white text-slate-500 border-slate-200'}`}>
                  Todos ({approved.length})
                </button>
                {approved.map(p => (
                  <button key={p.id} onClick={() => setMsgTargets(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border ${msgTargets.has(p.id) ? 'bg-primary text-white border-primary' : 'bg-white text-slate-500 border-slate-200 hover:border-primary/40'}`}>
                    {p.name}
                  </button>
                ))}
              </div>
              {msgResult ? (
                <div className="flex items-center gap-2 px-4 py-4 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-bold">
                  <span className="material-icons-round">check_circle</span> Enviado a {msgResult.sent} profesional(es).
                  <button onClick={() => setMsgResult(null)} className="ml-auto text-xs underline">Enviar otro</button>
                </div>
              ) : (
                <>
                  <input value={msgForm.asunto} onChange={e => setMsgForm(f => ({ ...f, asunto: e.target.value }))} placeholder="Asunto"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 font-bold text-sm text-slate-800 outline-none focus:border-primary" />
                  <textarea value={msgForm.mensaje} onChange={e => setMsgForm(f => ({ ...f, mensaje: e.target.value }))} rows={5} placeholder="Escribe el mensaje…"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 font-bold text-sm text-slate-800 outline-none focus:border-primary resize-none" />
                  <button onClick={sendProBlast} disabled={msgSending || !msgForm.asunto.trim() || !msgForm.mensaje.trim()}
                    className="w-full py-3 rounded-xl bg-primary text-white font-black text-xs uppercase tracking-widest shadow-lg disabled:opacity-40 hover:brightness-110 transition-all flex items-center justify-center gap-2">
                    <span className="material-icons-round text-sm">{msgSending ? 'sync' : 'send'}</span>
                    {msgSending ? 'Enviando…' : `Enviar a ${msgTargets.size === 0 ? 'todos' : msgTargets.size}`}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: Salud del sistema ── */}
        {activeTab === 'health' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Pagos OK', val: health?.outcomeCounts['matched_updated'] || 0, cls: 'text-emerald-600' },
                { label: 'Sin conciliar', val: health?.outcomeCounts['unmatched'] || 0, cls: 'text-amber-600' },
                { label: 'Errores', val: (health?.outcomeCounts['error'] || 0) + (health?.outcomeCounts['signature_rejected'] || 0), cls: 'text-rose-600' },
                { label: 'Suscripciones pausadas', val: health?.pausedPros.length || 0, cls: 'text-slate-700' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
                  <p className={`text-2xl font-black ${s.cls}`}>{s.val}</p>
                  <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100"><p className="text-xs font-black text-slate-700 uppercase tracking-widest">Últimos eventos de MercadoPago (webhooks)</p></div>
              <div className="divide-y divide-slate-50 max-h-[420px] overflow-y-auto">
                {(health?.events || []).map((e, i) => {
                  const color = e.outcome === 'matched_updated' ? 'text-emerald-600' : e.outcome === 'unmatched' ? 'text-amber-600' : (e.outcome === 'error' || e.outcome === 'signature_rejected') ? 'text-rose-600' : 'text-slate-400';
                  return (
                    <div key={i} className="px-6 py-3 flex items-center gap-3 text-sm">
                      <span className={`material-icons-round text-base ${color}`}>{color.includes('emerald') ? 'check_circle' : color.includes('rose') ? 'error' : color.includes('amber') ? 'warning' : 'radio_button_unchecked'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-700">{e.outcome || '—'} <span className="text-slate-400 font-normal">· {e.event_type} {e.mp_status ? `· ${e.mp_status}` : ''}</span></p>
                        {(e.payer_email || e.detail) && <p className="text-[10px] text-slate-400 truncate">{e.payer_email || e.detail}</p>}
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">{new Date(e.created_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  );
                })}
                {health && health.events.length === 0 && (
                  <p className="px-6 py-10 text-center text-slate-400 text-sm italic">Sin eventos de webhook registrados aún.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: Charlas ── */}
        {activeTab === 'charlas' && (
          <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
              <p className="text-slate-400 text-sm font-bold">{charlasList.length} charla{charlasList.length !== 1 ? 's' : ''} registrada{charlasList.length !== 1 ? 's' : ''}</p>
              <div className="flex gap-2">
                <button onClick={() => openBlastModal(null)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all">
                  <span className="material-icons-round text-base">send</span>
                  Enviar a todos
                </button>
                <button onClick={() => openCharlaForm()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all">
                  <span className="material-icons-round text-base">add</span>
                  Nueva charla
                </button>
              </div>
            </div>

            {charlasLoading ? (
              <div className="text-center py-16">
                <span className="material-icons-round text-3xl text-slate-600 animate-spin block mb-2">sync</span>
                <p className="text-slate-500 text-sm">Cargando...</p>
              </div>
            ) : (
              <div className="space-y-3">
                {charlasList.map(c => (
                  <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
                    <div className="flex items-start gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${c.es_activa ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20' : 'bg-slate-500/20 text-slate-500 border border-slate-500/20'}`}>
                            {c.es_activa ? 'Activa' : 'Oculta'}
                          </span>
                          {c.meet_link && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 border border-blue-500/20">Meet listo</span>}
                          {c._count !== undefined && c._count > 0 && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-600 border border-teal-500/20">{c._count} inscrito{c._count !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                        <h4 className="text-slate-900 font-black text-sm leading-snug">{c.titulo}</h4>
                        <p className="text-slate-400 text-xs mt-1">{new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })} · {c.hora} hrs · {c.duracion_min} min</p>
                        {c.ponente && <p className="text-slate-500 text-xs mt-0.5">{c.ponente}</p>}
                        {c.meet_link && <p className="text-teal-500 text-xs mt-0.5 truncate">{c.meet_link}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0 flex-wrap">
                        <button onClick={() => openBlastModal(c)}
                          title="Enviar notificación a inscritos"
                          className="p-2 bg-violet-600/20 hover:bg-violet-600 text-violet-600 hover:text-white rounded-lg transition-all">
                          <span className="material-icons-round text-base">send</span>
                        </button>
                        <button onClick={() => loadRegs(c)}
                          title="Ver inscritos"
                          className="p-2 bg-slate-100 hover:bg-teal-500 text-slate-500 hover:text-white rounded-lg transition-all">
                          <span className="material-icons-round text-base">group</span>
                        </button>
                        <button onClick={() => openCharlaForm(c)}
                          title="Editar"
                          className="p-2 bg-slate-100 hover:bg-violet-500 text-slate-500 hover:text-white rounded-lg transition-all">
                          <span className="material-icons-round text-base">edit</span>
                        </button>
                        <button onClick={() => handleToggleCharla(c)}
                          title={c.es_activa ? 'Ocultar' : 'Activar'}
                          className="p-2 bg-slate-100 hover:bg-amber-500 text-slate-500 hover:text-white rounded-lg transition-all">
                          <span className="material-icons-round text-base">{c.es_activa ? 'visibility_off' : 'visibility'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {charlasList.length === 0 && (
                  <div className="text-center py-16">
                    <span className="material-icons-round text-5xl text-slate-700 block mb-3">mic_off</span>
                    <p className="text-slate-500 font-bold">No hay charlas creadas</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Config ── */}
        {activeTab === 'config' && (
          <div className="space-y-5">
            {/* Desglose suscripciones */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Desglose de suscripciones</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { val: allPros.length,  label: 'Total',      color: 'bg-slate-100 text-slate-700' },
                  { val: activeCount,     label: 'Activos',    color: 'bg-emerald-500/15 text-emerald-600' },
                  { val: trialCount,      label: 'En trial',   color: 'bg-blue-500/15 text-blue-600' },
                  { val: pausedCount,     label: 'Pausados',   color: 'bg-rose-500/15 text-rose-600' },
                ].map(s => (
                  <div key={s.label} className={`rounded-2xl p-4 text-center ${s.color}`}>
                    <p className="text-2xl font-black leading-none">{s.val}</p>
                    <p className="text-[10px] font-bold mt-1 uppercase tracking-widest opacity-70">{s.label}</p>
                  </div>
                ))}
              </div>
              {allPros.length > 0 && (
                <div className="bg-slate-100 rounded-2xl h-3 overflow-hidden flex">
                  <div className="bg-emerald-500 transition-all" style={{ width: `${(activeCount / allPros.length) * 100}%` }} />
                  <div className="bg-blue-500 transition-all"    style={{ width: `${(trialCount  / allPros.length) * 100}%` }} />
                  <div className="bg-rose-500 transition-all"    style={{ width: `${(pausedCount / allPros.length) * 100}%` }} />
                </div>
              )}
            </div>

            {/* Link global de suscripción */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-2">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Link global de suscripción</p>
              <p className="text-slate-700 text-sm font-medium">
                Variable: <code className="bg-slate-100 px-2 py-0.5 rounded text-teal-700 font-bold text-xs">VITE_GLOBAL_SUBSCRIPTION_LINK</code>
              </p>
              <p className="text-slate-500 text-xs break-all font-mono bg-slate-100 rounded-xl px-3 py-2">{MP_SUBSCRIPTION_LINK}</p>
              <p className="text-xs text-slate-500">Para cambiarlo: Vercel → Settings → Environment Variables. También puedes asignar un link individual por profesional con el botón <span className="material-icons-round text-xs align-middle">link</span> en la tabla.</p>
            </div>

            {/* Código de autorización */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-2">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Código de autorización</p>
              <p className="text-slate-700 text-sm font-medium">
                Variable: <code className="bg-slate-100 px-2 py-0.5 rounded text-teal-700 font-bold text-xs">CLINIC_AUTH_CODE</code>
              </p>
              <p className="text-xs text-slate-500">Gestiona desde Vercel Dashboard → Tu proyecto → Settings → Environment Variables</p>
            </div>
          </div>
        )}

      </div>

      {/* ── MODAL: Confirmar eliminación ── */}
      {deleteModal && (
        <div className="fixed inset-0 bg-slate-50/90 backdrop-blur-md z-[200] flex items-center justify-center p-6">
          <div className="bg-white border border-rose-500/30 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-rose-600 text-2xl">delete_forever</span>
              </div>
              <div>
                <h3 className="text-slate-900 font-black text-lg">Eliminar profesional</h3>
                <p className="text-slate-400 text-sm">{deleteModal.name}</p>
              </div>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl px-4 py-3 mb-6">
              <p className="text-rose-300 text-sm font-bold leading-relaxed">
                Esta acción es permanente e irreversible. Se eliminarán todos los datos del profesional de la base de datos.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteModal(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all">
                Cancelar
              </button>
              <button onClick={confirmDelete}
                className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all border-b-4 border-rose-700 active:border-b-0 active:translate-y-1">
                Eliminar definitivamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Confirmar desactivación ── */}
      {rejectModal && (
        <div className="fixed inset-0 bg-slate-50/90 backdrop-blur-md z-[200] flex items-center justify-center p-6">
          <div className="bg-white border border-amber-500/30 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-amber-600 text-2xl">block</span>
              </div>
              <div>
                <h3 className="text-slate-900 font-black text-lg">Desactivar profesional</h3>
                <p className="text-slate-400 text-sm">{rejectModal.name}</p>
              </div>
            </div>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              La cuenta quedará desactivada y el perfil dejará de ser visible para los pacientes. Podrás reactivarlo en cualquier momento.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all">
                Cancelar
              </button>
              <button onClick={confirmReject}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all border-b-4 border-amber-700 active:border-b-0 active:translate-y-1">
                Desactivar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Regalar días ── */}
      {giftModal && (
        <div className="fixed inset-0 bg-slate-50/80 backdrop-blur-md z-[200] flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/20 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-violet-600 text-2xl">card_giftcard</span>
              </div>
              <div>
                <h3 className="text-slate-900 font-black text-lg">Regalar días de prueba</h3>
                <p className="text-slate-400 text-sm">{giftModal.pro.name}</p>
              </div>
            </div>
            {giftModal.pro.trialEndDate && (
              <div className="bg-slate-100 rounded-2xl px-4 py-3 mb-5 text-sm text-slate-500">
                Vence actual: <span className="text-slate-900 font-black">
                  {new Date(giftModal.pro.trialEndDate + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
            )}
            <div className="space-y-2 mb-6">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Días a regalar</label>
              <input type="number" min={1} max={365} value={giftModal.days}
                onChange={e => setGiftModal({ ...giftModal, days: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 text-2xl font-black focus:outline-none focus:border-violet-500/50 text-center"
                placeholder="30" autoFocus />
              {parseInt(giftModal.days) > 0 && (
                <p className="text-xs text-slate-500 text-center">
                  Nueva fecha: {(() => {
                    const base = giftModal.pro.trialEndDate && new Date(giftModal.pro.trialEndDate) > new Date()
                      ? new Date(giftModal.pro.trialEndDate) : new Date();
                    base.setDate(base.getDate() + parseInt(giftModal.days));
                    return base.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
                  })()}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setGiftModal(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all">
                Cancelar
              </button>
              <button onClick={handleGiftDays} disabled={!parseInt(giftModal.days) || parseInt(giftModal.days) < 1}
                className="flex-1 py-3 bg-violet-500 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all border-b-4 border-violet-700 active:border-b-0 active:translate-y-1">
                Confirmar regalo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Nota base (estrellas) ── */}
      {seedModal && (
        <div className="fixed inset-0 bg-slate-50/80 backdrop-blur-md z-[200] flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-amber-600 text-2xl">star</span>
              </div>
              <div>
                <h3 className="text-slate-900 font-black text-lg">Nota base del perfil</h3>
                <p className="text-slate-400 text-sm">{seedModal.pro.name}</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Fija una calificación inicial para que el perfil no parta en cero. Se combina con las reseñas reales que lleguen (promedio ponderado).
            </p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estrellas (0–5)</label>
                <input type="number" min={0} max={5} step={0.1} value={seedModal.rating}
                  onChange={e => setSeedModal({ ...seedModal, rating: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 text-2xl font-black focus:outline-none focus:border-amber-500/50 text-center"
                  placeholder="4.8" autoFocus />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nº reseñas base</label>
                <input type="number" min={0} max={9999} value={seedModal.count}
                  onChange={e => setSeedModal({ ...seedModal, count: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 text-2xl font-black focus:outline-none focus:border-amber-500/50 text-center"
                  placeholder="12" />
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-6 text-xs text-amber-700 flex items-center gap-1.5">
              <span className="material-icons-round text-sm">star</span>
              Mostrará <strong>{(Math.max(0, Math.min(5, parseFloat(seedModal.rating) || 0))).toFixed(1)}</strong> con <strong>{Math.max(0, Math.round(parseInt(seedModal.count) || 0))}</strong> reseñas base.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSeedModal(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const m = seedModal; setSeedModal(null);
                  await handleSeedRating(m.pro, parseFloat(m.rating) || 0, parseInt(m.count) || 0);
                }}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all border-b-4 border-amber-700 active:border-b-0 active:translate-y-1">
                Guardar nota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Link de suscripción ── */}
      {subLinkModal && (
        <div className="fixed inset-0 bg-slate-50/80 backdrop-blur-md z-[200] flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-sky-600 text-2xl">link</span>
              </div>
              <div>
                <h3 className="text-slate-900 font-black text-lg">Link de pago suscripción</h3>
                <p className="text-slate-400 text-sm">{subLinkModal.pro.name}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
              URL de MercadoPago personalizado para este profesional. Si está vacío, se usa el link global (<code className="text-teal-600">VITE_GLOBAL_SUBSCRIPTION_LINK</code>).
            </p>
            <input type="url" value={subLinkModal.link}
              onChange={e => setSubLinkModal({ ...subLinkModal, link: e.target.value })}
              placeholder="https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=…"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-sky-500 mb-5"
            />
            <div className="flex gap-3">
              <button onClick={() => setSubLinkModal(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all">
                Cancelar
              </button>
              <button onClick={handleSaveSubLink}
                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all border-b-4 border-sky-700 active:border-b-0 active:translate-y-1">
                Guardar link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Envío masivo (blast) ── */}
      {blastModal && (
        <div className="fixed inset-0 z-[200] flex items-end lg:items-center justify-center p-0 lg:p-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => !blastSending && setBlastModal(null)} />
          <div className="relative bg-white border border-slate-200 w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl lg:rounded-3xl shadow-2xl z-10 p-6">
            <div className="flex items-start justify-between mb-5 gap-3">
              <div>
                <p className="text-[10px] font-black text-violet-600 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <span className="material-icons-round text-sm">send</span>
                  Notificación masiva
                </p>
                <h3 className="text-slate-900 font-black text-base leading-snug">
                  {blastModal.charla ? blastModal.charla.titulo : 'Todos los inscritos'}
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  {blastModal.totalRegs > 0
                    ? `Se enviará a ${blastModal.totalRegs} persona${blastModal.totalRegs !== 1 ? 's' : ''}`
                    : 'Sin destinatarios registrados aún'}
                </p>
              </div>
              {!blastSending && (
                <button onClick={() => setBlastModal(null)} className="p-1.5 hover:bg-slate-100 rounded-xl shrink-0">
                  <span className="material-icons-round text-slate-400">close</span>
                </button>
              )}
            </div>

            {blastResult ? (
              <div className="text-center py-10">
                <div className="w-16 h-16 bg-violet-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="material-icons-round text-violet-600 text-3xl">check_circle</span>
                </div>
                <h4 className="text-slate-900 font-black text-xl mb-1">¡Enviado!</h4>
                <p className="text-slate-400 text-sm">Emails enviados a <strong className="text-slate-900">{blastResult.sent}</strong> personas.</p>
                <button onClick={() => setBlastModal(null)}
                  className="mt-6 px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
                  Cerrar
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Asunto *</label>
                  <input
                    value={blastForm.asunto}
                    onChange={e => setBlastForm(f => ({ ...f, asunto: e.target.value }))}
                    placeholder="Ej: Recordatorio: charla de mañana 20:00 hrs"
                    disabled={blastSending}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-500 transition-all disabled:opacity-50" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Mensaje *</label>
                  <textarea
                    value={blastForm.mensaje}
                    onChange={e => setBlastForm(f => ({ ...f, mensaje: e.target.value }))}
                    rows={7}
                    placeholder="Hola, te recordamos que mañana jueves tenemos nuestra charla gratuita sobre dolor lumbar a las 20:00 hrs.&#10;&#10;El link de Google Meet es: https://meet.google.com/...&#10;&#10;¡Te esperamos!"
                    disabled={blastSending}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-500 transition-all resize-none disabled:opacity-50" />
                  <p className="text-slate-600 text-[10px] mt-1">El saludo "Hola, [nombre]" se agrega automáticamente.</p>
                </div>

                {blastModal.totalRegs === 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
                    <span className="material-icons-round text-amber-600 text-base">warning</span>
                    <p className="text-amber-600 text-xs font-bold">No hay inscritos para esta charla aún.</p>
                  </div>
                )}

                <div className="flex gap-3 mt-1">
                  <button onClick={() => setBlastModal(null)} disabled={blastSending}
                    className="flex-1 py-3 bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all disabled:opacity-50">
                    Cancelar
                  </button>
                  <button onClick={handleSendBlast}
                    disabled={blastSending || !blastForm.asunto.trim() || !blastForm.mensaje.trim() || blastModal.totalRegs === 0}
                    className="flex-1 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                    {blastSending ? (
                      <><span className="material-icons-round text-sm animate-spin">sync</span>Enviando...</>
                    ) : (
                      <><span className="material-icons-round text-sm">send</span>Enviar ahora</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Crear/Editar Charla ── */}
      {showCharlaForm && (
        <div className="fixed inset-0 z-[200] flex items-end lg:items-center justify-center p-0 lg:p-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCharlaForm(false)} />
          <div className="relative bg-white border border-slate-200 w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl lg:rounded-3xl shadow-2xl z-10 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-slate-900 font-black text-lg">{editingCharla ? 'Editar charla' : 'Nueva charla'}</h3>
              <button onClick={() => setShowCharlaForm(false)} className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors">
                <span className="material-icons-round text-slate-400">close</span>
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {[
                { label: 'Título *', key: 'titulo', type: 'text', placeholder: 'Ej: Manejo del dolor lumbar' },
                { label: 'Fecha *', key: 'fecha', type: 'date', placeholder: '' },
                { label: 'Hora *', key: 'hora', type: 'time', placeholder: '20:00' },
                { label: 'Ponente', key: 'ponente', type: 'text', placeholder: 'Equipo Clínica Mas Life' },
                { label: 'Link de Google Meet', key: 'meet_link', type: 'url', placeholder: 'https://meet.google.com/...' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    value={(charlaFormData as Record<string, unknown>)[f.key] as string}
                    onChange={e => setCharlaFormData(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-500 transition-all" />
                </div>
              ))}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Descripción</label>
                <textarea
                  value={charlaFormData.descripcion}
                  onChange={e => setCharlaFormData(p => ({ ...p, descripcion: e.target.value }))}
                  rows={3} placeholder="Descripción breve de la charla..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-500 transition-all resize-none" />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="esActiva" checked={charlaFormData.es_activa}
                  onChange={e => setCharlaFormData(p => ({ ...p, es_activa: e.target.checked }))}
                  className="w-4 h-4 accent-teal-500 cursor-pointer" />
                <label htmlFor="esActiva" className="text-sm text-slate-700 font-bold cursor-pointer">Charla activa (visible en el sitio)</label>
              </div>
              <div className="flex gap-3 mt-2">
                <button onClick={() => setShowCharlaForm(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all">
                  Cancelar
                </button>
                <button onClick={handleSaveCharla} disabled={charlasSaving}
                  className="flex-1 py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                  {charlasSaving ? <><span className="material-icons-round text-sm animate-spin">sync</span>Guardando...</> : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Inscritos de una charla ── */}
      {selectedCharlaRegs && (
        <div className="fixed inset-0 z-[200] flex items-end lg:items-center justify-center p-0 lg:p-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedCharlaRegs(null)} />
          <div className="relative bg-white border border-slate-200 w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl lg:rounded-3xl shadow-2xl z-10 p-6">
            <div className="flex items-start justify-between mb-4 gap-3">
              <div>
                <p className="text-[10px] font-black text-teal-500 uppercase tracking-widest mb-1">Inscritos</p>
                <h3 className="text-slate-900 font-black text-base leading-snug">{selectedCharlaRegs.charla.titulo}</h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedCharlaRegs.regs.length > 0 && (
                  <button onClick={() => exportCSV(selectedCharlaRegs.regs, selectedCharlaRegs.charla.titulo)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all">
                    <span className="material-icons-round text-sm">download</span>
                    CSV
                  </button>
                )}
                <button onClick={() => setSelectedCharlaRegs(null)} className="p-1.5 hover:bg-slate-100 rounded-xl">
                  <span className="material-icons-round text-slate-400">close</span>
                </button>
              </div>
            </div>
            {regsLoading ? (
              <div className="text-center py-12">
                <span className="material-icons-round text-3xl text-slate-600 animate-spin block mb-2">sync</span>
              </div>
            ) : selectedCharlaRegs.regs.length === 0 ? (
              <div className="text-center py-12">
                <span className="material-icons-round text-4xl text-slate-700 block mb-3">group</span>
                <p className="text-slate-500 font-bold">Sin inscritos aún</p>
              </div>
            ) : (
              <div>
                <p className="text-slate-500 text-xs font-bold mb-3">{selectedCharlaRegs.regs.length} inscrito{selectedCharlaRegs.regs.length !== 1 ? 's' : ''}</p>
                <div className="space-y-2">
                  {selectedCharlaRegs.regs.map(r => (
                    <div key={r.id} className="bg-slate-50 rounded-xl p-3 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-600 flex items-center justify-center shrink-0 font-black text-sm">
                        {r.nombre[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-900 text-sm font-black">{r.nombre} {r.apellido}</p>
                        <p className="text-teal-600 text-xs">{r.email}</p>
                        <div className="flex gap-3 mt-0.5 flex-wrap">
                          {r.celular && <span className="text-slate-400 text-xs">{r.celular}</span>}
                          {r.ciudad && <span className="text-slate-400 text-xs">📍 {r.ciudad}</span>}
                          {r.temas_interes && r.temas_interes.length > 0 && (
                            <span className="text-slate-500 text-xs">{r.temas_interes.join(' · ')}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-slate-600 text-[10px] shrink-0">{new Date(r.created_at).toLocaleDateString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

function mapDBtoPro(d: Record<string, unknown>): ProfessionalProfile {
  return {
    id:                 d.id as string,
    slug:               (d.slug as string)          || '',
    name:               (d.name as string)          || '',
    email:              (d.email as string)         || '',
    specialty:          (d.specialty as string)     || '',
    city:               (d.city as string)          || '',
    bio:                (d.bio as string)           || '',
    avatar:             (d.avatar as string)        || '',
    workingHours:       (d.working_hours as ProfessionalProfile['workingHours']) || { start: '09:00', end: '18:00' },
    modalities:         (d.modalities  as ProfessionalProfile['modalities'])     || { online: true, inPerson: true, home: false },
    services:           (d.services   as ProfessionalProfile['services'])        || [],
    isPublic:           (d.is_public   as boolean)  ?? false,
    isVerified:         (d.is_verified as boolean)  ?? false,
    isApproved:         (d.is_approved as boolean)  ?? false,
    isSubscribed:       (d.is_subscribed as boolean) ?? false,
    subscriptionStatus: (d.subscription_status as SubscriptionStatus) || 'trial',
    trialEndDate:       (d.trial_end_date as string) || undefined,
    needsPasswordReset: (d.needs_password_reset as boolean) ?? false,
    paymentEnabled:     (d.payment_enabled as boolean)      ?? false,
    bookingFee:         (d.booking_fee as number)           ?? 0,
    chargeFullService:  (d.charge_full_service as boolean)  ?? false,
    bookingPaymentLink: (d.booking_payment_link as string)  || undefined,
    subscriptionLink:   (d.subscription_link as string)     || '',
    createdAt:          (d.created_at as string)            || new Date().toISOString(),
    rut:                d.rut as string | undefined,
    schedule:           d.schedule as ProfessionalProfile['schedule'],
    instagram:          (d.instagram as string)             || undefined,
    sisCode:            (d.sis_code as string)              || undefined,
    seedRating:         (d.seed_rating as number)           ?? 0,
    seedRatingCount:    (d.seed_rating_count as number)     ?? 0,
  };
}

export default AdminManagement;
