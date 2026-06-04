import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfessionalProfile, SubscriptionStatus } from '../types';
import { useClinic } from '../ClinicContext';
import { supabase } from '../supabaseClient';

type AdminTab = 'pending' | 'professionals' | 'config';

const AdminManagement: React.FC = () => {
  const navigate  = useNavigate();
  const { professionals: professionalsList, updatePro: onUpdatePro, logout, isAdmin, setProfessionals } = useClinic();

  const [activeTab, setActiveTab]     = useState<AdminTab>('pending');
  const [allPros, setAllPros]         = useState<ProfessionalProfile[]>([]);
  const [loadingIds, setLoadingIds]   = useState<Set<string>>(new Set());
  const [toast, setToast]             = useState('');
  const [linkCopied, setLinkCopied]   = useState(false);
  const [giftModal, setGiftModal]     = useState<{ pro: ProfessionalProfile; days: string } | null>(null);
  const [subLinkModal, setSubLinkModal] = useState<{ pro: ProfessionalProfile; link: string } | null>(null);

  const MP_SUBSCRIPTION_LINK = import.meta.env.VITE_GLOBAL_SUBSCRIPTION_LINK || "https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=7e9fa964bb6d4ecd89058685ba8a5b34";

  // Guard
  useEffect(() => { if (!isAdmin) navigate('/admin/login'); }, [isAdmin, navigate]);

  // Helper: todas las llamadas admin usan el token JWT almacenado en sessionStorage
  function adminFetch(method: string, body?: object, action?: string) {
    const token = sessionStorage.getItem('maslife_admin_token') || '';
    const url = '/api/admin-auth' + (action ? `?action=${action}` : '');
    return fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  // Cargar TODOS los profesionales via API segura (service_role en el servidor)
  useEffect(() => {
    const loadAll = async () => {
      const res = await adminFetch('GET', undefined, 'list');
      const json = await res.json();
      if (!res.ok || json.error) {
        console.error('[admin] loadAll error:', json.error);
        return;
      }
      setAllPros((json.data as Record<string, unknown>[]).map(mapDBtoPro));
    };
    if (isAdmin) loadAll();
  }, [isAdmin]);

  const pending  = allPros.filter(p => !p.isApproved);
  const approved = allPros.filter(p => p.isApproved);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const setLoading = (id: string, val: boolean) => {
    setLoadingIds(prev => {
      const next = new Set(prev);
      val ? next.add(id) : next.delete(id);
      return next;
    });
  };

  // ── Aprobar profesional ────────────────────────────────────────
  const handleApprove = async (pro: ProfessionalProfile) => {
    setLoading(pro.id, true);
    try {
      const res = await adminFetch('PATCH', { id: pro.id, is_verified: true, is_approved: true });
      if (!res.ok) throw new Error((await res.json()).error);
      const updated = { ...pro, isVerified: true, isApproved: true };
      setAllPros(prev => prev.map(p => p.id === pro.id ? updated : p));
      showToast(`✅ ${pro.name} aprobado — ya puede ingresar`);
    } catch {
      showToast('❌ Error al aprobar. Intenta de nuevo.');
    } finally {
      setLoading(pro.id, false);
    }
  };

  // ── Rechazar / desactivar profesional ─────────────────────────
  const handleReject = async (pro: ProfessionalProfile) => {
    if (!confirm(`¿Rechazar a ${pro.name}? Su cuenta quedará desactivada.`)) return;
    setLoading(pro.id, true);
    try {
      const res = await adminFetch('PATCH', { id: pro.id, is_approved: false, is_verified: false });
      if (!res.ok) throw new Error((await res.json()).error);
      const updated = { ...pro, isApproved: false, isVerified: false };
      setAllPros(prev => prev.map(p => p.id === pro.id ? updated : p));
      showToast(`⛔ ${pro.name} desactivado`);
    } catch {
      showToast('❌ Error al desactivar.');
    } finally {
      setLoading(pro.id, false);
    }
  };

  // ── Eliminar profesional ───────────────────────────────────────
  const handleDelete = async (pro: ProfessionalProfile) => {
    if (!confirm(`¿ELIMINAR permanentemente a ${pro.name}? Esta acción no se puede deshacer.`)) return;
    setLoading(pro.id, true);
    try {
      const res = await adminFetch('DELETE', { id: pro.id });
      if (!res.ok) throw new Error((await res.json()).error);
      setAllPros(prev => prev.filter(p => p.id !== pro.id));
      showToast(`🗑️ ${pro.name} eliminado`);
    } catch {
      showToast('❌ Error al eliminar.');
    } finally {
      setLoading(pro.id, false);
    }
  };

  // ── Gestión de suscripción ─────────────────────────────────────
  const setSubStatus = async (pro: ProfessionalProfile, next: SubscriptionStatus) => {
    const isActive = next === 'active';
    const isPausedNext = next === 'paused';
    const res = await adminFetch('PATCH', {
      id: pro.id,
      subscription_status: next,
      is_subscribed: isActive,
      is_public: !isPausedNext,
    });
    if (res.ok) {
      const updated = { ...pro, subscriptionStatus: next, isSubscribed: isActive, isPublic: !isPausedNext };
      setAllPros(prev => prev.map(p => p.id === pro.id ? updated : p));
      const label = isActive ? '✅ Activo' : isPausedNext ? '⏸️ Pausado' : '⏳ Trial';
      showToast(`${pro.name} → ${label}`);
    }
  };

  // ── Guardar link de suscripción por profesional ───────────────
  const handleSaveSubLink = async () => {
    if (!subLinkModal) return;
    const res = await adminFetch('PATCH', { id: subLinkModal.pro.id, subscription_link: subLinkModal.link.trim() });
    if (res.ok) {
      setAllPros(prev => prev.map(p => p.id === subLinkModal!.pro.id ? { ...p, subscriptionLink: subLinkModal!.link.trim() } : p));
      showToast(`Link de pago actualizado: ${subLinkModal.pro.name}`);
      setSubLinkModal(null);
    }
  };

  // ── Regalar días de prueba ─────────────────────────────────────
  const handleGiftDays = async () => {
    if (!giftModal) return;
    const days = parseInt(giftModal.days, 10);
    if (!days || days < 1 || days > 365) return;
    const base = giftModal.pro.trialEndDate && new Date(giftModal.pro.trialEndDate) > new Date()
      ? new Date(giftModal.pro.trialEndDate)
      : new Date();
    base.setDate(base.getDate() + days);
    const newDate = base.toISOString().split('T')[0];
    const res = await adminFetch('PATCH', {
      id: giftModal.pro.id,
      subscription_status: 'trial',
      trial_end_date: newDate,
      is_subscribed: false,
      is_public: true,
    });
    if (res.ok) {
      const updated = { ...giftModal.pro, subscriptionStatus: 'trial' as SubscriptionStatus, trialEndDate: newDate, isSubscribed: false, isPublic: true };
      setAllPros(prev => prev.map(p => p.id === giftModal!.pro.id ? updated : p));
      showToast(`🎁 ${giftModal.pro.name} → +${days} días (hasta ${new Date(newDate + 'T12:00:00').toLocaleDateString('es-CL')})`);
      setGiftModal(null);
    }
  };

  // ── Enviar reset de contraseña ─────────────────────────────────
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

  return (
    <div className="flex-1 w-full h-full bg-slate-950 overflow-y-auto text-slate-300">

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-slate-800 text-white px-5 py-3 rounded-2xl
          shadow-2xl text-sm font-bold border border-white/10 animate-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      <div className="max-w-6xl mx-auto p-6 md:p-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-teal-500 font-black text-xs uppercase tracking-widest mb-1">Panel de Control</p>
            <h1 className="text-3xl font-black text-white">Administración Central</h1>
          </div>
          <button onClick={() => logout(navigate, 'ADMIN')}
            className="px-4 py-2 bg-white/5 text-slate-400 rounded-xl text-xs font-black uppercase tracking-widest
              hover:bg-rose-500/20 hover:text-rose-400 transition-all flex items-center gap-2">
            <span className="material-icons-round text-base">logout</span>
            Salir
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 bg-slate-900/50 p-1.5 rounded-2xl w-fit">
          {([
            { id: 'pending',       label: 'Pendientes',     icon: 'pending_actions', count: pending.length },
            { id: 'professionals', label: 'Profesionales',  icon: 'groups',          count: approved.length },
            { id: 'config',        label: 'Configuración',  icon: 'settings',        count: 0 },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all
                ${activeTab === tab.id
                  ? 'bg-teal-500 text-white shadow-lg'
                  : 'text-slate-500 hover:text-slate-300'}`}>
              <span className="material-icons-round text-base">{tab.icon}</span>
              {tab.label}
              {tab.count > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black
                  ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-400'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── TAB: Pendientes de aprobación ── */}
        {activeTab === 'pending' && (
          <div>
            {pending.length === 0 ? (
              <div className="text-center py-20">
                <span className="material-icons-round text-5xl text-slate-700 block mb-3">check_circle</span>
                <p className="text-slate-500 font-bold">No hay solicitudes pendientes</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-slate-400 text-sm font-bold mb-6">
                  {pending.length} profesional{pending.length !== 1 ? 'es' : ''} esperando aprobación
                </p>
                {pending.map(pro => (
                  <div key={pro.id} className="bg-slate-900/60 rounded-2xl border border-white/10 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                    <div className="flex gap-4 items-center sm:items-start flex-1 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                      {pro.avatar
                        ? <img src={pro.avatar} className="w-full h-full object-cover" alt={pro.name} />
                        : <span className="font-black text-white text-lg">{pro.name.charAt(0)}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-white">{pro.name}</p>
                      <p className="text-xs text-slate-500">{pro.email}</p>
                      <p className="text-xs text-teal-400 font-bold mt-0.5">{pro.specialty} · {pro.city}</p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Registrado: {new Date(pro.createdAt).toLocaleDateString('es-CL')}
                      </p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 border-t border-white/5 pt-4 sm:border-0 sm:pt-0 w-full sm:w-auto">
                      <button onClick={() => handleApprove(pro)} disabled={loadingIds.has(pro.id)}
                        className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30
                          rounded-xl text-xs font-black hover:bg-emerald-500 hover:text-white transition-all
                          disabled:opacity-50 flex items-center gap-1.5">
                        <span className="material-icons-round text-base">
                          {loadingIds.has(pro.id) ? 'sync' : 'check_circle'}
                        </span>
                        <span className="hidden sm:inline">Aprobar</span>
                      </button>
                      <button onClick={() => handleReject(pro)} disabled={loadingIds.has(pro.id)}
                        className="flex-1 sm:flex-none justify-center px-4 py-3 sm:py-2 bg-rose-500/10 text-rose-400 border border-rose-500/20
                          rounded-xl text-xs font-black hover:bg-rose-500 hover:text-white transition-all
                          disabled:opacity-50 flex items-center gap-1.5">
                        <span className="material-icons-round text-base">cancel</span>
                        <span className="hidden sm:inline">Rechazar</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Profesionales aprobados ── */}
        {activeTab === 'professionals' && (
          <div className="bg-slate-900/60 rounded-3xl border border-white/10 overflow-hidden">
            {approved.length === 0 ? (
              <div className="text-center py-20">
                <span className="material-icons-round text-5xl text-slate-700 block mb-3">groups</span>
                <p className="text-slate-500 font-bold">Sin profesionales aprobados aún</p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto hide-scrollbar">
                <table className="w-full text-left min-w-[700px]">
                  <thead className="bg-slate-800/50 border-b border-white/5">
                  <tr>
                    <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Especialista</th>
                    <th className="px-6 py-5 text-xs font-black text-slate-500 uppercase tracking-widest">Estado</th>
                    <th className="px-6 py-5 text-xs font-black text-slate-500 uppercase tracking-widest">Suscripción</th>
                    <th className="px-6 py-5 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {approved.map(pro => (
                    <tr key={pro.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                            {pro.avatar
                              ? <img src={pro.avatar} className="w-full h-full object-cover" alt={pro.name} />
                              : <span className="font-black text-white">{pro.name.charAt(0)}</span>}
                          </div>
                          <div>
                            <p className="text-sm font-black text-white">{pro.name}</p>
                            <p className="text-xs text-slate-500">{pro.email}</p>
                            <p className="text-xs text-teal-400">{pro.specialty}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${pro.isPublic ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
                          {pro.isPublic ? 'Visible' : 'Oculto'}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col gap-1">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-black w-fit
                            ${pro.subscriptionStatus === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : pro.subscriptionStatus === 'trial'
                              ? 'bg-blue-500/10 text-blue-400'
                              : 'bg-rose-500/10 text-rose-400'}`}>
                            {pro.subscriptionStatus === 'trial' ? 'Prueba'
                              : pro.subscriptionStatus === 'active' ? 'Suscrito' : 'Pausado'}
                          </span>
                          {pro.trialEndDate && (
                            <span className="text-[10px] text-slate-500 font-bold">
                              {pro.subscriptionStatus === 'active' ? 'desde' : 'vence'} {new Date(pro.trialEndDate + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex justify-end gap-2 flex-wrap">
                          {/* Link de suscripción */}
                          <button onClick={() => setSubLinkModal({ pro, link: pro.subscriptionLink || '' })}
                            title="Editar link de pago de suscripción"
                            className={`p-2.5 rounded-xl border transition-all ${pro.subscriptionLink ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-white/5 hover:bg-sky-500 hover:text-white'}`}>
                            <span className="material-icons-round text-sm">link</span>
                          </button>
                          {/* Regalar días */}
                          <button onClick={() => setGiftModal({ pro, days: '30' })}
                            title="Regalar días de prueba"
                            className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:bg-violet-500 hover:text-white transition-all border border-white/5">
                            <span className="material-icons-round text-sm">card_giftcard</span>
                          </button>
                          {/* Reset contraseña */}
                          <button
                            onClick={() => sendPasswordReset(pro)}
                            disabled={resetSent[pro.id] === 'loading' || resetSent[pro.id] === 'sent'}
                            title={resetSent[pro.id] === 'sent' ? 'Email enviado' : 'Enviar reset de contraseña'}
                            className={`p-2.5 rounded-xl border transition-all
                              ${resetSent[pro.id] === 'sent'
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 cursor-default'
                                : resetSent[pro.id] === 'error'
                                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                : 'bg-slate-800 text-slate-400 hover:bg-blue-500 hover:text-white border-white/5'}`}>
                            <span className={`material-icons-round text-sm ${resetSent[pro.id] === 'loading' ? 'animate-spin' : ''}`}>
                              {resetSent[pro.id] === 'loading' ? 'sync'
                                : resetSent[pro.id] === 'sent' ? 'mark_email_read'
                                : resetSent[pro.id] === 'error' ? 'error'
                                : 'lock_reset'}
                            </span>
                          </button>
                          {/* Activar */}
                          {pro.subscriptionStatus !== 'active' && (
                            <button onClick={() => setSubStatus(pro, 'active')}
                              title="Activar suscripción"
                              className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:bg-emerald-500 hover:text-white transition-all border border-white/5">
                              <span className="material-icons-round text-sm">play_arrow</span>
                            </button>
                          )}
                          {/* Pausar */}
                          {pro.subscriptionStatus !== 'paused' && (
                            <button onClick={() => setSubStatus(pro, 'paused')}
                              title="Pausar (oculta perfil)"
                              className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:bg-amber-500 hover:text-white transition-all border border-white/5">
                              <span className="material-icons-round text-sm">pause</span>
                            </button>
                          )}
                          {/* Desactivar aprobación */}
                          <button onClick={() => handleReject(pro)} title="Desactivar aprobación"
                            className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:bg-amber-600 hover:text-white transition-all border border-white/5">
                            <span className="material-icons-round text-sm">block</span>
                          </button>
                          {/* Eliminar */}
                          <button onClick={() => handleDelete(pro)} title="Eliminar permanentemente"
                            className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:bg-rose-500 hover:text-white transition-all border border-white/5">
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
        )}

        {/* ── TAB: Configuración ── */}
        {activeTab === 'config' && (
          <div className="bg-slate-900/60 rounded-3xl border border-white/10 p-8 space-y-6">
            <h3 className="font-black text-white text-lg">Configuración del sistema</h3>

            <div className="bg-slate-800/50 rounded-2xl p-5 border border-white/5">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Link global de suscripción (botón "Pagar Suscripción")</p>
              <p className="text-slate-300 text-sm font-medium mb-1">
                Variable: <code className="bg-slate-700 px-2 py-0.5 rounded text-teal-400">VITE_GLOBAL_SUBSCRIPTION_LINK</code>
              </p>
              <p className="text-white/80 text-sm mb-2 break-all">{MP_SUBSCRIPTION_LINK}</p>
              <p className="text-xs text-slate-500">Para cambiarlo: Vercel → Settings → Environment Variables. También puedes asignar un link individual por profesional con el botón <span className="material-icons-round text-xs align-middle">link</span> en la tabla.</p>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-5 border border-white/5">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Código de autorización actual</p>
              <p className="text-slate-300 text-sm font-medium mb-1">
                El código se gestiona desde la variable de entorno <code className="bg-slate-700 px-2 py-0.5 rounded text-teal-400">VITE_CLINIC_AUTH_CODE</code> en Vercel.
              </p>
              <p className="text-xs text-slate-500">Para cambiarlo: Vercel Dashboard → Tu proyecto → Settings → Environment Variables</p>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-5 border border-white/5">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Estadísticas rápidas</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
                {[
                  { val: allPros.length,    label: 'Total profesionales' },
                  { val: approved.length,   label: 'Aprobados' },
                  { val: pending.length,    label: 'Pendientes' },
                ].map(s => (
                  <div key={s.label} className="bg-slate-900/50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-black text-white">{s.val}</p>
                    <p className="text-xs text-slate-500 font-bold mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── MODAL: Regalar días de prueba ── */}
      {giftModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/20 flex items-center justify-center">
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
              <input
                type="number"
                min={1}
                max={365}
                value={giftModal.days}
                onChange={e => setGiftModal({ ...giftModal, days: e.target.value })}
                className="w-full bg-slate-800 border border-white/10 rounded-2xl px-5 py-4 text-white text-2xl font-black focus:outline-none focus:border-violet-500/50 text-center"
                placeholder="30"
                autoFocus
              />
              {parseInt(giftModal.days) > 0 && (
                <p className="text-xs text-slate-500 text-center">
                  Nueva fecha: {(() => {
                    const base = giftModal.pro.trialEndDate && new Date(giftModal.pro.trialEndDate) > new Date()
                      ? new Date(giftModal.pro.trialEndDate)
                      : new Date();
                    base.setDate(base.getDate() + parseInt(giftModal.days));
                    return base.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
                  })()}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setGiftModal(null)}
                className="flex-1 py-3 text-slate-400 text-xs font-black uppercase tracking-widest hover:text-white transition-all">
                Cancelar
              </button>
              <button
                onClick={handleGiftDays}
                disabled={!parseInt(giftModal.days) || parseInt(giftModal.days) < 1}
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
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 flex items-center justify-center">
                <span className="material-icons-round text-sky-400 text-2xl">link</span>
              </div>
              <div>
                <h3 className="text-white font-black text-lg">Link de pago suscripción</h3>
                <p className="text-slate-400 text-sm">{subLinkModal.pro.name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
              URL de MercadoPago para que este profesional pague su suscripción. Si está vacío, se usa el link global configurado en Vercel (<code className="text-teal-400">VITE_GLOBAL_SUBSCRIPTION_LINK</code>).
            </p>

            <input
              type="url"
              value={subLinkModal.link}
              onChange={e => setSubLinkModal({ ...subLinkModal, link: e.target.value })}
              placeholder="https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=..."
              className="w-full bg-slate-800 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-sky-500 mb-5"
            />

            <div className="flex gap-3">
              <button onClick={() => setSubLinkModal(null)}
                className="flex-1 py-3 text-slate-400 text-xs font-black uppercase tracking-widest hover:text-white transition-all">
                Cancelar
              </button>
              <button
                onClick={handleSaveSubLink}
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

// Mapper DB → ProfessionalProfile
function mapDBtoPro(d: Record<string, unknown>): ProfessionalProfile {
  return {
    id:                 d.id as string,
    slug:               (d.slug as string) || '',
    name:               (d.name as string) || '',
    email:              (d.email as string) || '',
    specialty:          (d.specialty as string) || '',
    city:               (d.city as string) || '',
    bio:                (d.bio as string) || '',
    avatar:             (d.avatar as string) || '',
    workingHours:       (d.working_hours as ProfessionalProfile['workingHours']) || { start: '09:00', end: '18:00' },
    modalities:         (d.modalities as ProfessionalProfile['modalities']) || { online: true, inPerson: true, home: false },
    services:           (d.services as ProfessionalProfile['services']) || [],
    isPublic:           (d.is_public as boolean) ?? false,
    isVerified:         (d.is_verified as boolean) ?? false,
    isApproved:         (d.is_approved as boolean) ?? false,
    isSubscribed:       (d.is_subscribed as boolean) ?? false,
    subscriptionStatus: (d.subscription_status as SubscriptionStatus) || 'trial',
    trialEndDate:       (d.trial_end_date as string) || undefined,
    needsPasswordReset: (d.needs_password_reset as boolean) ?? false,
    paymentEnabled:     (d.payment_enabled as boolean) ?? false,
    bookingPaymentLink: (d.booking_payment_link as string) || undefined,
    subscriptionLink:   (d.subscription_link as string) || '',
    createdAt:          (d.created_at as string) || new Date().toISOString(),
    rut:                d.rut as string | undefined,
    schedule:           d.schedule as ProfessionalProfile['schedule'],
  };
}

export default AdminManagement;
