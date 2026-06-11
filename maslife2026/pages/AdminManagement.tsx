import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfessionalProfile, SubscriptionStatus } from '../types';
import { useClinic } from '../ClinicContext';
import { supabase } from '../supabaseClient';

type AdminTab = 'pending' | 'professionals' | 'config';

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
  const [searchQuery, setSearchQuery]   = useState('');

  const MP_SUBSCRIPTION_LINK = import.meta.env.VITE_GLOBAL_SUBSCRIPTION_LINK || 'https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=7e9fa964bb6d4ecd89058685ba8a5b34';

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
      const res = await adminFetch('PATCH', { id: pro.id, is_verified: true, is_approved: true });
      if (!res.ok) throw new Error((await res.json()).error);
      setAllPros(prev => prev.map(p => p.id === pro.id ? { ...p, isVerified: true, isApproved: true } : p));
      showToast(`✅ ${pro.name} aprobado`);
    } catch { showToast('❌ Error al aprobar.'); }
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

  if (!isAdmin) return null;

  const subStatusBadge = (status: SubscriptionStatus, trialEndDate?: string) => {
    const map: Record<SubscriptionStatus, { label: string; cls: string }> = {
      active:  { label: 'Activo',  cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
      trial:   { label: 'Trial',   cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
      paused:  { label: 'Pausado', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
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
    <div className="flex-1 w-full h-full bg-slate-950 overflow-y-auto text-slate-300">

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-[300] bg-slate-800 text-white px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold border border-white/10 animate-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      <div className="max-w-6xl mx-auto p-5 md:p-10">

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <p className="text-teal-500 font-black text-[10px] uppercase tracking-widest mb-1">Panel de Control</p>
            <h1 className="text-2xl md:text-3xl font-black text-white">Administración Central</h1>
          </div>
          <button onClick={() => logout(navigate, 'ADMIN')}
            className="px-4 py-2 bg-white/5 text-slate-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-500/20 hover:text-rose-400 transition-all flex items-center gap-2 shrink-0">
            <span className="material-icons-round text-base">logout</span>
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>

        {/* ── Stats bar ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[
            { val: allPros.length,  label: 'Total',     icon: 'groups',          cls: 'text-white' },
            { val: activeCount,     label: 'Activos',   icon: 'verified',        cls: 'text-emerald-400' },
            { val: trialCount,      label: 'Trial',     icon: 'hourglass_empty', cls: 'text-blue-400' },
            { val: pausedCount,     label: 'Pausados',  icon: 'pause_circle',    cls: 'text-rose-400' },
            { val: pending.length,  label: 'Pendientes',icon: 'pending_actions', cls: pending.length > 0 ? 'text-amber-400' : 'text-slate-500' },
          ].map(s => (
            <div key={s.label} className="bg-slate-900/60 border border-white/5 rounded-2xl p-4 flex items-center gap-3">
              <span className={`material-icons-round text-xl ${s.cls}`}>{s.icon}</span>
              <div>
                <p className={`text-xl font-black leading-none ${s.cls}`}>{s.val}</p>
                <p className="text-[10px] text-slate-500 font-bold mt-0.5 uppercase tracking-widest">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-2 mb-6 bg-slate-900/50 p-1.5 rounded-2xl w-fit overflow-x-auto">
          {([
            { id: 'pending',       label: 'Pendientes',    icon: 'pending_actions', count: pending.length },
            { id: 'professionals', label: 'Profesionales', icon: 'groups',          count: 0 },
            { id: 'config',        label: 'Config',        icon: 'settings',        count: 0 },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap
                ${activeTab === tab.id ? 'bg-teal-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
              <span className="material-icons-round text-base">{tab.icon}</span>
              {tab.label}
              {tab.count > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-400'}`}>
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
                    <div key={pro.id} className="bg-slate-900/60 rounded-2xl border border-white/10 p-5 sm:p-6">
                      <div className="flex gap-4 items-start mb-4">
                        <div className="w-12 h-12 rounded-xl bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                          {pro.avatar
                            ? <img src={pro.avatar} className="w-full h-full object-cover" alt={pro.name} />
                            : <span className="font-black text-white text-lg">{pro.name.charAt(0)}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <p className="font-black text-white">{pro.name}</p>
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 ${daysAgo >= 3 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>
                              Hace {daysAgo === 0 ? 'hoy' : `${daysAgo}d`}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">{pro.email}</p>
                          <p className="text-xs text-teal-400 font-bold mt-0.5">{pro.specialty} · {pro.city}</p>
                          {pro.rut && <p className="text-xs text-slate-600 mt-0.5">RUT: {pro.rut}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-3 border-t border-white/5">
                        <button onClick={() => handleApprove(pro)} disabled={loadingIds.has(pro.id)}
                          className="flex-1 px-4 py-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-black hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                          <span className={`material-icons-round text-base ${loadingIds.has(pro.id) ? 'animate-spin' : ''}`}>
                            {loadingIds.has(pro.id) ? 'sync' : 'check_circle'}
                          </span>
                          Aprobar
                        </button>
                        <button onClick={() => handleReject(pro)} disabled={loadingIds.has(pro.id)}
                          className="flex-1 px-4 py-2.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-black hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
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
                className="w-full bg-slate-900/60 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-teal-500/50 transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                  <span className="material-icons-round text-base">close</span>
                </button>
              )}
            </div>

            {needsResetCount > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="material-icons-round text-amber-400 text-lg">lock_reset</span>
                <p className="text-amber-400 text-xs font-bold">
                  {needsResetCount} profesional{needsResetCount !== 1 ? 'es necesitan' : ' necesita'} resetear contraseña
                </p>
              </div>
            )}

            {/* Tabla */}
            <div className="bg-slate-900/60 rounded-3xl border border-white/10 overflow-hidden">
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
                    <thead className="bg-slate-800/50 border-b border-white/5">
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
                              <div className="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                                {pro.avatar
                                  ? <img src={pro.avatar} className="w-full h-full object-cover" alt={pro.name} />
                                  : <span className="font-black text-white">{pro.name.charAt(0)}</span>}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-sm font-black text-white truncate max-w-[140px]">{pro.name}</p>
                                  {pro.needsPasswordReset && (
                                    <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-md text-[9px] font-black uppercase tracking-wide shrink-0">
                                      Reset pwd
                                    </span>
                                  )}
                                  {!pro.isPublic && (
                                    <span className="px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded-md text-[9px] font-black uppercase tracking-wide shrink-0">Oculto</span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 truncate max-w-[180px]">{pro.email}</p>
                                <p className="text-[11px] text-teal-400 truncate max-w-[180px]">{pro.specialty}</p>
                              </div>
                            </div>
                          </td>
                          {/* Ciudad */}
                          <td className="px-5 py-4">
                            <p className="text-xs text-slate-300 font-bold">{pro.city || '—'}</p>
                            {pro.paymentEnabled && (
                              <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-0.5 mt-0.5">
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
                                className={`p-2 rounded-xl border transition-all text-xs ${pro.subscriptionLink ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-white/5 hover:bg-sky-500 hover:text-white'}`}>
                                <span className="material-icons-round text-sm">link</span>
                              </button>
                              {/* Regalar días */}
                              <button onClick={() => setGiftModal({ pro, days: '30' })}
                                title="Regalar días de trial"
                                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:bg-violet-500 hover:text-white transition-all border border-white/5">
                                <span className="material-icons-round text-sm">card_giftcard</span>
                              </button>
                              {/* Reset contraseña */}
                              <button
                                onClick={() => sendPasswordReset(pro)}
                                disabled={resetSent[pro.id] === 'loading' || resetSent[pro.id] === 'sent'}
                                title={resetSent[pro.id] === 'sent' ? 'Email enviado' : 'Enviar reset de contraseña'}
                                className={`p-2 rounded-xl border transition-all ${
                                  resetSent[pro.id] === 'sent'   ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 cursor-default'
                                  : resetSent[pro.id] === 'error' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                  : pro.needsPasswordReset        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500 hover:text-white'
                                  : 'bg-slate-800 text-slate-400 hover:bg-blue-500 hover:text-white border-white/5'}`}>
                                <span className={`material-icons-round text-sm ${resetSent[pro.id] === 'loading' ? 'animate-spin' : ''}`}>
                                  {resetSent[pro.id] === 'loading' ? 'sync' : resetSent[pro.id] === 'sent' ? 'mark_email_read' : resetSent[pro.id] === 'error' ? 'error' : 'lock_reset'}
                                </span>
                              </button>
                              {/* Activar */}
                              {pro.subscriptionStatus !== 'active' && (
                                <button onClick={() => setSubStatus(pro, 'active')} title="Activar suscripción"
                                  className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:bg-emerald-500 hover:text-white transition-all border border-white/5">
                                  <span className="material-icons-round text-sm">play_arrow</span>
                                </button>
                              )}
                              {/* Pausar */}
                              {pro.subscriptionStatus !== 'paused' && (
                                <button onClick={() => setSubStatus(pro, 'paused')} title="Pausar (oculta perfil)"
                                  className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:bg-amber-500 hover:text-white transition-all border border-white/5">
                                  <span className="material-icons-round text-sm">pause</span>
                                </button>
                              )}
                              {/* Desactivar */}
                              <button onClick={() => handleReject(pro)} title="Desactivar aprobación"
                                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:bg-amber-600 hover:text-white transition-all border border-white/5">
                                <span className="material-icons-round text-sm">block</span>
                              </button>
                              {/* Eliminar */}
                              <button onClick={() => handleDelete(pro)} title="Eliminar permanentemente"
                                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:bg-rose-500 hover:text-white transition-all border border-white/5">
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

        {/* ── TAB: Config ── */}
        {activeTab === 'config' && (
          <div className="space-y-5">
            {/* Desglose suscripciones */}
            <div className="bg-slate-900/60 rounded-3xl border border-white/10 p-6 space-y-4">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Desglose de suscripciones</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { val: allPros.length,  label: 'Total',      color: 'bg-white/10 text-white' },
                  { val: activeCount,     label: 'Activos',    color: 'bg-emerald-500/15 text-emerald-400' },
                  { val: trialCount,      label: 'En trial',   color: 'bg-blue-500/15 text-blue-400' },
                  { val: pausedCount,     label: 'Pausados',   color: 'bg-rose-500/15 text-rose-400' },
                ].map(s => (
                  <div key={s.label} className={`rounded-2xl p-4 text-center ${s.color}`}>
                    <p className="text-2xl font-black leading-none">{s.val}</p>
                    <p className="text-[10px] font-bold mt-1 uppercase tracking-widest opacity-70">{s.label}</p>
                  </div>
                ))}
              </div>
              {allPros.length > 0 && (
                <div className="bg-slate-800/50 rounded-2xl h-3 overflow-hidden flex">
                  <div className="bg-emerald-500 transition-all" style={{ width: `${(activeCount / allPros.length) * 100}%` }} />
                  <div className="bg-blue-500 transition-all"    style={{ width: `${(trialCount  / allPros.length) * 100}%` }} />
                  <div className="bg-rose-500 transition-all"    style={{ width: `${(pausedCount / allPros.length) * 100}%` }} />
                </div>
              )}
            </div>

            {/* Link global de suscripción */}
            <div className="bg-slate-900/60 rounded-3xl border border-white/10 p-6 space-y-2">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Link global de suscripción</p>
              <p className="text-slate-300 text-sm font-medium">
                Variable: <code className="bg-slate-700 px-2 py-0.5 rounded text-teal-400 text-xs">VITE_GLOBAL_SUBSCRIPTION_LINK</code>
              </p>
              <p className="text-white/60 text-xs break-all font-mono bg-slate-800/50 rounded-xl px-3 py-2">{MP_SUBSCRIPTION_LINK}</p>
              <p className="text-xs text-slate-500">Para cambiarlo: Vercel → Settings → Environment Variables. También puedes asignar un link individual por profesional con el botón <span className="material-icons-round text-xs align-middle">link</span> en la tabla.</p>
            </div>

            {/* Código de autorización */}
            <div className="bg-slate-900/60 rounded-3xl border border-white/10 p-6 space-y-2">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Código de autorización</p>
              <p className="text-slate-300 text-sm font-medium">
                Variable: <code className="bg-slate-700 px-2 py-0.5 rounded text-teal-400 text-xs">CLINIC_AUTH_CODE</code>
              </p>
              <p className="text-xs text-slate-500">Gestiona desde Vercel Dashboard → Tu proyecto → Settings → Environment Variables</p>
            </div>
          </div>
        )}

      </div>

      {/* ── MODAL: Confirmar eliminación ── */}
      {deleteModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[200] flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-rose-500/30 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-rose-400 text-2xl">delete_forever</span>
              </div>
              <div>
                <h3 className="text-white font-black text-lg">Eliminar profesional</h3>
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
                className="flex-1 py-3 bg-slate-800 text-slate-300 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-700 transition-all">
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
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[200] flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-amber-400 text-2xl">block</span>
              </div>
              <div>
                <h3 className="text-white font-black text-lg">Desactivar profesional</h3>
                <p className="text-slate-400 text-sm">{rejectModal.name}</p>
              </div>
            </div>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              La cuenta quedará desactivada y el perfil dejará de ser visible para los pacientes. Podrás reactivarlo en cualquier momento.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(null)}
                className="flex-1 py-3 bg-slate-800 text-slate-300 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-700 transition-all">
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/20 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-violet-400 text-2xl">card_giftcard</span>
              </div>
              <div>
                <h3 className="text-white font-black text-lg">Regalar días de prueba</h3>
                <p className="text-slate-400 text-sm">{giftModal.pro.name}</p>
              </div>
            </div>
            {giftModal.pro.trialEndDate && (
              <div className="bg-slate-800/60 rounded-2xl px-4 py-3 mb-5 text-sm text-slate-400">
                Vence actual: <span className="text-white font-black">
                  {new Date(giftModal.pro.trialEndDate + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
            )}
            <div className="space-y-2 mb-6">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Días a regalar</label>
              <input type="number" min={1} max={365} value={giftModal.days}
                onChange={e => setGiftModal({ ...giftModal, days: e.target.value })}
                className="w-full bg-slate-800 border border-white/10 rounded-2xl px-5 py-4 text-white text-2xl font-black focus:outline-none focus:border-violet-500/50 text-center"
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
                className="flex-1 py-3 bg-slate-800 text-slate-300 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-700 transition-all">
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

      {/* ── MODAL: Link de suscripción ── */}
      {subLinkModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-sky-400 text-2xl">link</span>
              </div>
              <div>
                <h3 className="text-white font-black text-lg">Link de pago suscripción</h3>
                <p className="text-slate-400 text-sm">{subLinkModal.pro.name}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
              URL de MercadoPago personalizado para este profesional. Si está vacío, se usa el link global (<code className="text-teal-400">VITE_GLOBAL_SUBSCRIPTION_LINK</code>).
            </p>
            <input type="url" value={subLinkModal.link}
              onChange={e => setSubLinkModal({ ...subLinkModal, link: e.target.value })}
              placeholder="https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=…"
              className="w-full bg-slate-800 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-sky-500 mb-5"
            />
            <div className="flex gap-3">
              <button onClick={() => setSubLinkModal(null)}
                className="flex-1 py-3 bg-slate-800 text-slate-300 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-700 transition-all">
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
  };
}

export default AdminManagement;
