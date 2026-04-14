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

  const MP_SUBSCRIPTION_LINK = import.meta.env.VITE_GLOBAL_SUBSCRIPTION_LINK || "https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=7e9fa964bb6d4ecd89058685ba8a5b34";

  // Guard
  useEffect(() => { if (!isAdmin) navigate('/admin/login'); }, [isAdmin, navigate]);

  // Cargar TODOS los profesionales (incluyendo no aprobados) con service role
  // Como no tenemos service role en el frontend, usamos la anon key con RLS deshabilitado
  // mediante una política especial para admin — o cargamos todos desde el contexto
  useEffect(() => {
    const loadAll = async () => {
      const { data, error } = await supabase
        .from('professionals')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setAllPros(data.map(mapDBtoPro));
      }
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
      const { error } = await supabase
        .from('professionals')
        .update({ is_verified: true, is_approved: true })
        .eq('id', pro.id);

      if (error) throw error;

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
      const { error } = await supabase
        .from('professionals')
        .update({ is_approved: false, is_verified: false })
        .eq('id', pro.id);

      if (error) throw error;
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
      const { error } = await supabase.from('professionals').delete().eq('id', pro.id);
      if (error) throw error;
      setAllPros(prev => prev.filter(p => p.id !== pro.id));
      showToast(`🗑️ ${pro.name} eliminado`);
    } catch {
      showToast('❌ Error al eliminar.');
    } finally {
      setLoading(pro.id, false);
    }
  };

  // ── Toggle suscripción ─────────────────────────────────────────
  const toggleSub = async (pro: ProfessionalProfile) => {
    const next: SubscriptionStatus = pro.subscriptionStatus === 'paused' ? 'active' : 'paused';
    const { error } = await supabase.from('professionals').update({ subscription_status: next }).eq('id', pro.id);
    if (!error) {
      const updated = { ...pro, subscriptionStatus: next };
      setAllPros(prev => prev.map(p => p.id === pro.id ? updated : p));
      showToast(`${pro.name} → ${next === 'active' ? 'Activado' : 'Pausado'}`);
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
                        <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-500/10 text-emerald-400">
                          Activo
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-black
                          ${pro.subscriptionStatus === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : pro.subscriptionStatus === 'trial'
                            ? 'bg-blue-500/10 text-blue-400'
                            : 'bg-rose-500/10 text-rose-400'}`}>
                          {pro.subscriptionStatus === 'trial' ? 'Prueba'
                            : pro.subscriptionStatus === 'active' ? 'Suscrito' : 'Pausado'}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => toggleSub(pro)}
                            title={pro.subscriptionStatus === 'paused' ? 'Reactivar' : 'Pausar'}
                            className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:bg-teal-500 hover:text-white transition-all border border-white/5">
                            <span className="material-icons-round text-sm">
                              {pro.subscriptionStatus === 'paused' ? 'play_arrow' : 'pause'}
                            </span>
                          </button>
                          <button onClick={() => handleReject(pro)} title="Desactivar"
                            className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:bg-amber-500 hover:text-white transition-all border border-white/5">
                            <span className="material-icons-round text-sm">block</span>
                          </button>
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
    needsPasswordReset: (d.needs_password_reset as boolean) ?? false,
    paymentEnabled:     (d.payment_enabled as boolean) ?? false,
    subscriptionLink:   (d.subscription_link as string) || '',
    createdAt:          (d.created_at as string) || new Date().toISOString(),
  };
}

export default AdminManagement;
