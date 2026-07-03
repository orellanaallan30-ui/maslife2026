import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProfessionalProfile, Service } from '../types';
import { useClinic } from '../ClinicContext';
import { saveProfessional, getProfessionalBySlugOrId } from '../supabaseService';
import { supabase } from '../supabaseClient';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { loggedPro: profile, updatePro: onSave, logout, addNotification } = useClinic();

  const onLogout = () => logout(navigate, 'PROFESSIONAL');
  const [activeTab, setActiveTab] = useState<'perfil' | 'suscripcion' | 'seguridad'>('perfil');
  const [localProfile, setLocalProfile] = useState<ProfessionalProfile | null>(profile);
  const [hasChanges, setHasChanges] = useState(false);
  const [showSavedMsg, setShowSavedMsg] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [newService, setNewService] = useState<Partial<Service>>({ name: '', price: 0, duration: 45, description: '' });
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showEditServiceModal, setShowEditServiceModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Delete Account State ───────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);

  // ── Soporte / Sugerencias ──────────────────────────────────────────────────
  const [fbType, setFbType] = useState<'suggestion' | 'problem'>('suggestion');
  const [fbSubject, setFbSubject] = useState('');
  const [fbMessage, setFbMessage] = useState('');
  const [fbSending, setFbSending] = useState(false);
  const [fbSent, setFbSent] = useState(false);

  const submitFeedback = async () => {
    if (!fbMessage.trim() || !profile) return;
    setFbSending(true);
    try {
      const { error } = await supabase.from('feedback').insert({
        professional_id: profile.id,
        professional_name: profile.name,
        professional_email: profile.email,
        type: fbType,
        subject: fbSubject.trim() || null,
        message: fbMessage.trim(),
      });
      if (error) throw error;
      setFbSent(true);
      setFbSubject(''); setFbMessage('');
      setTimeout(() => setFbSent(false), 6000);
    } catch (e: any) {
      addNotification(`⚠️ No se pudo enviar tu mensaje: ${e?.message || 'intenta de nuevo'}`, 'system');
    } finally {
      setFbSending(false);
    }
  };

  const handleAdminSSO = async () => {
    setAdminLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setAdminLoading(false); navigate('/admin/login'); return; }
    const res = await fetch('/api/admin-auth?action=sso', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setAdminLoading(false);
    if (res.ok) {
      const { token } = await res.json();
      sessionStorage.setItem('maslife_admin_token', token);
      navigate('/admin/management');
    } else {
      const body = await res.json().catch(() => ({}));
      alert(`SSO error ${res.status}: ${body.error || '?'} — ${body.detail || body.email || ''}`);
      navigate('/admin/login');
    }
  };
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // ── MFA State ──────────────────────────────────────────────────────────────
  const [mfaFactors, setMfaFactors] = useState<Array<{ id: string; status: string; friendly_name?: string }>>([]);
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [mfaQr, setMfaQr] = useState<{ qr_code: string; secret: string; factorId: string; challengeId: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMsg, setMfaMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (data?.totp) setMfaFactors(data.totp);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMfaEnroll = async () => {
    setMfaEnrolling(true);
    setMfaMsg(null);
    // Limpiar factores sin verificar antes de enrollar (evita error de nombre duplicado)
    const { data: existing } = await supabase.auth.mfa.listFactors();
    const unverified = existing?.totp?.filter(f => f.status !== 'verified') ?? [];
    for (const f of unverified) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `totp-${Date.now()}` });
    if (error || !data) { setMfaMsg({ ok: false, text: error?.message || 'Error al iniciar registro' }); setMfaEnrolling(false); return; }
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: data.id });
    if (chErr || !ch) { setMfaMsg({ ok: false, text: 'Error al generar desafío' }); setMfaEnrolling(false); return; }
    setMfaQr({ qr_code: data.totp.qr_code, secret: data.totp.secret, factorId: data.id, challengeId: ch.id });
    setMfaEnrolling(false);
  };

  const handleMfaVerify = async () => {
    if (!mfaQr || mfaCode.length !== 6) return;
    const { error } = await supabase.auth.mfa.verify({ factorId: mfaQr.factorId, challengeId: mfaQr.challengeId, code: mfaCode });
    if (error) { setMfaMsg({ ok: false, text: 'Código incorrecto. Intenta nuevamente.' }); return; }
    setMfaMsg({ ok: true, text: 'Autenticación de dos factores activada correctamente.' });
    setMfaQr(null);
    setMfaCode('');
    const { data } = await supabase.auth.mfa.listFactors();
    if (data?.totp) setMfaFactors(data.totp);
  };

  const handleMfaUnenroll = async (factorId: string) => {
    if (!confirm('¿Desactivar la autenticación de dos factores? Tu cuenta quedará menos protegida.')) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) { setMfaMsg({ ok: false, text: error.message }); return; }
    setMfaFactors(prev => prev.filter(f => f.id !== factorId));
    setMfaMsg({ ok: true, text: 'MFA desactivado.' });
  };

  const handleDeleteAccount = async () => {
    if (!profile?.id) return;
    setIsDeleting(true);
    try {
      await supabase.from('appointments').delete().eq('professional_id', profile.id);
      await supabase.from('patients').delete().eq('professional_id', profile.id);
      await supabase.from('transactions').delete().eq('professional_id', profile.id);
      await supabase.from('professionals').delete().eq('id', profile.id);
      await supabase.auth.signOut();
      navigate('/');
    } catch (err) {
      console.error('[deleteAccount]', err);
      setIsDeleting(false);
      setShowDeleteModal(false);
      alert('Ocurrió un error. Escribe a soporte@maslife.cl para solicitar la eliminación manualmente.');
    }
  };

  const MP_SUBSCRIPTION_LINK = import.meta.env.VITE_GLOBAL_SUBSCRIPTION_LINK || "https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=e7c9a9a7adc24dee8c1f7fb78bdbdc67";
  const mpLinkWithBack = (localProfile?.subscriptionLink && localProfile.subscriptionLink.trim()) || MP_SUBSCRIPTION_LINK;
  const SUPPORT_PHONE = import.meta.env.VITE_SUPPORT_PHONE || '+56965329974';
  const [subscribedMsg, setSubscribedMsg] = useState(false);

  const daysLeft = (() => {
    if (!localProfile?.trialEndDate) return null;
    const diff = new Date(localProfile.trialEndDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  useEffect(() => {
    if (!profile) navigate('/pro/login');
    setLocalProfile(profile);
  }, [profile, navigate]);

  useEffect(() => {
    if (searchParams.get('subscribed') === '1') {
      setSubscribedMsg(true);
      setActiveTab('suscripcion');
      setSearchParams({}, { replace: true });
    }
    if (searchParams.get('mp_connected') === '1') {
      setSearchParams({}, { replace: true });
      if (profile?.id) {
        getProfessionalBySlugOrId(profile.id).then(freshPro => {
          if (freshPro) { onSave(freshPro); setLocalProfile(freshPro); }
        });
      }
    }
    if (searchParams.get('mp_error')) {
      setSearchParams({}, { replace: true });
    }
    if (searchParams.get('google_connected') === '1') {
      setSearchParams({}, { replace: true });
      if (profile?.id) {
        getProfessionalBySlugOrId(profile.id).then(freshPro => {
          if (freshPro) { onSave(freshPro); setLocalProfile(freshPro); }
        });
      }
    }
    if (searchParams.get('google_error')) {
      setSearchParams({}, { replace: true });
    }
  }, []);

  if (!localProfile) return null;

  const handleUpdate = (updates: Partial<ProfessionalProfile>) => {
    setLocalProfile(prev => prev ? { ...prev, ...updates } : null);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (localProfile) {
      // Auto-generar slug si no tiene o está vacío
      let profileToSave = { ...localProfile };
      if (!profileToSave.slug || profileToSave.slug.trim() === '') {
        profileToSave.slug = profileToSave.name
          .toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '') // remover acentos
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }
      setLocalProfile(profileToSave);
      onSave(profileToSave);
      saveProfessional(profileToSave).catch(err => {
        console.error('[Settings] No se pudo guardar perfil en Supabase:', err?.message);
        addNotification('⚠️ Los cambios de perfil NO se guardaron en el servidor. Intenta de nuevo.', 'appointment');
      });
      setHasChanges(false);
      setShowSavedMsg(true);
      setTimeout(() => setShowSavedMsg(false), 3000);
    }
  };

  const toggleModality = (key: keyof typeof localProfile.modalities) => {
    handleUpdate({
      modalities: {
        ...localProfile.modalities,
        [key]: !localProfile.modalities[key]
      }
    });
  };

  const handleAddService = () => {
    if (!newService.name || (newService.price || 0) <= 0) return;
    const service: Service = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9),
      name: newService.name!,
      price: Number(newService.price) || 0,
      duration: Number(newService.duration) || 45,
      description: newService.description || '',
      image: newService.image || ''
    };
    handleUpdate({ services: [...localProfile.services, service] });
    setShowServiceModal(false);
    setNewService({ name: '', price: 0, duration: 45, description: '', image: '' });
  };

  const removeService = (id: string) => {
    handleUpdate({ services: localProfile.services.filter(s => s.id !== id) });
  };

  const handleOpenEditService = (service: Service) => {
    setEditingService({ ...service });
    setShowEditServiceModal(true);
  };

  const handleSaveEditService = () => {
    if (!editingService) return;
    handleUpdate({
      services: localProfile.services.map(s => s.id === editingService.id ? editingService : s)
    });
    setShowEditServiceModal(false);
    setEditingService(null);
  };

  const handleServiceImageChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        alert('La imagen es demasiado grande. Máximo 5 MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        if (isEdit && editingService) {
          setEditingService(prev => prev ? { ...prev, image: result } : null);
        } else {
          setNewService(prev => ({ ...prev, image: result }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const getShareableLink = () => {
    return `${window.location.origin}/p/${localProfile.slug || localProfile.id}`;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getShareableLink()).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  };

  const handleShareLink = () => {
    const link = getShareableLink();
    if (navigator.share) {
      navigator.share({ title: `Agenda con ${localProfile.name}`, text: 'Agenda tu hora conmigo', url: link });
    } else {
      handleCopyLink();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        alert('La imagen es demasiado grande. Máximo 10 MB.');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX = 300;
          let w = img.width, h = img.height;
          if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
          else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff'; // evita marco negro en PNG/HEIC con transparencia al convertir a JPEG
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          handleUpdate({ avatar: canvas.toDataURL('image/jpeg', 0.85) });
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full bg-slate-50">
      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-6">
        <div className="max-w-5xl mx-auto space-y-5 pb-24 md:pb-10">
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black text-primary uppercase tracking-[0.3em] mb-1">Configuración Maslife</p>
              <h1 className="text-2xl font-black tracking-tight text-black">Ajustes de Cuenta</h1>
              <div className="flex bg-slate-50 p-1.5 rounded-xl mt-4 max-w-fit border border-slate-200 shadow-inner gap-1.5">
                <button onClick={() => setActiveTab('perfil')} className={`px-4 lg:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'perfil' ? 'bg-white text-primary shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>Mi Perfil</button>
                <button onClick={() => setActiveTab('suscripcion')} className={`px-4 lg:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'suscripcion' ? 'bg-white text-primary shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>Suscripción</button>
                <button onClick={() => setActiveTab('seguridad')} className={`px-4 lg:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'seguridad' ? 'bg-white text-primary shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>Seguridad</button>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {activeTab === 'perfil' && showSavedMsg && (
                <span className="text-xs font-black text-emerald-500 uppercase tracking-widest animate-in fade-in slide-in-from-right-4">✓ Cambios guardados</span>
              )}
              {activeTab === 'perfil' && (
                <button
                  disabled={!hasChanges}
                  onClick={handleSave}
                  className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${hasChanges ? 'bg-slate-900 text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] border-b-4 border-slate-800 active:border-b-0 active:translate-y-1' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}
                >
                  Guardar Cambios
                </button>
              )}
              {/* Acceso admin directo — SSO silencioso si el email coincide con ADMIN_EMAIL */}
              <button
                onClick={handleAdminSSO}
                disabled={adminLoading}
                className="flex items-center gap-2 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-violet-600 border border-violet-200 bg-white hover:bg-violet-50 active:scale-95 transition-all disabled:opacity-60"
              >
                {adminLoading
                  ? <span className="material-icons-round text-sm animate-spin">sync</span>
                  : <span className="material-icons-round text-sm">admin_panel_settings</span>
                }
                Admin
              </button>
              {/* Cerrar Sesión — visible en todos los tabs, especialmente útil en mobile */}
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-rose-500 border border-rose-200 bg-white hover:bg-rose-50 active:scale-95 transition-all"
              >
                <span className="material-icons-round text-sm">logout</span>
                Cerrar Sesión
              </button>
            </div>
          </header>

          {activeTab === 'perfil' && (
            <div className="space-y-4 md:space-y-5 animate-in fade-in duration-500">
              <section className="bg-white rounded-2xl border border-slate-100 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] overflow-hidden p-4 md:p-8 flex flex-col lg:flex-row gap-4 md:gap-6">
                <div className="relative group shrink-0 mx-auto lg:mx-0">
                  <img className="w-28 h-28 rounded-2xl object-cover border-4 border-slate-50 shadow-lg" src={localProfile.avatar || "https://picsum.photos/seed/doc/400/400"} alt="Avatar" />
                  <label className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary text-white rounded-xl shadow-lg cursor-pointer hover:scale-110 transition-transform flex items-center justify-center border-2 border-white">
                    <span className="material-icons-round text-lg">photo_camera</span>
                    <input type="file" onChange={handleFileChange} className="hidden" />
                  </label>
                </div>

                <div className="flex-1 space-y-4 md:space-y-5">
                  <div className="p-4 bg-slate-100 rounded-xl border-2 border-slate-200 shadow-inner">
                    <label className="text-xs font-black text-slate-800 uppercase tracking-widest block mb-2 ml-1">Slug Personalizado (URL)</label>
                    <div className="flex items-center bg-white border-2 border-slate-300 rounded-xl px-4 py-3 shadow-sm group focus-within:ring-4 focus-within:ring-primary/10 transition-all">
                      <span className="text-slate-500 font-black text-sm hidden sm:inline mr-1">clinicamaslife.cl/pro/</span>
                      <input
                        className="flex-1 bg-transparent border-none p-0 font-black text-primary focus:ring-0 text-base"
                        value={localProfile.slug}
                        onChange={e => handleUpdate({ slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                      />
                    </div>
                  </div>

                  {/* Mi Link — copiable/compartible */}
                  <div className="p-5 bg-teal-50 border-2 border-teal-200 rounded-2xl overflow-hidden flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                    <span className="material-icons-round text-teal-500 text-2xl shrink-0">link</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-teal-700 uppercase tracking-widest mb-1">Mi Link Profesional</p>
                      <p className="text-[11px] sm:text-sm font-bold text-teal-800 truncate">
                        {getShareableLink()}
                      </p>
                      {(!localProfile.slug || !localProfile.specialty || localProfile.services.length === 0) && (
                        <p className="text-[10px] text-amber-600 font-bold mt-1">Completa tu perfil (nombre, especialidad y servicios) para activar tu link</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleShareLink}
                        className="px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2 bg-white text-teal-600 border border-teal-200 hover:bg-teal-100"
                      >
                        <span className="material-icons-round text-sm">share</span>
                      </button>
                      <button
                        onClick={handleCopyLink}
                        className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2 ${
                          linkCopied
                            ? 'bg-emerald-500 text-white'
                            : 'bg-teal-500 text-white hover:bg-teal-600'
                        }`}
                      >
                        <span className="material-icons-round text-sm">{linkCopied ? 'check_circle' : 'content_copy'}</span>
                        {linkCopied ? 'Copiado' : 'Copiar'}
                      </button>
                      <button
                        onClick={() => {
                          const link = getShareableLink();
                          if (navigator.share) {
                            navigator.share({ title: `Agenda con ${localProfile.name}`, text: '¡Agenda tu hora conmigo!', url: link });
                          } else {
                            window.open(`https://wa.me/?text=${encodeURIComponent(`¡Hola! Puedes agendar conmigo directamente aquí: ${link}`)}`, '_blank');
                          }
                        }}
                        className="px-5 py-2.5 rounded-xl bg-[#25D366] text-white font-black text-xs uppercase tracking-widest hover:bg-[#1ebe5d] transition-all flex items-center gap-2"
                      >
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.767 5.767 0 1.267.408 2.438 1.103 3.394l-.717 2.63 2.7-.708c.846.541 1.847.851 2.923.851 3.181 0 5.767-2.586 5.767-5.767 0-3.181-2.586-5.767-5.767-5.767zm3.344 8.205c-.145.409-.838.74-1.164.786-.324.045-.72.079-2.315-.572-1.911-.781-3.142-2.723-3.238-2.85-.095-.126-.777-.963-.777-1.838s.454-1.306.616-1.467c.163-.162.355-.202.474-.202s.237.001.341.006c.108.005.253-.041.396.304.145.352.497 1.21.541 1.298.045.089.074.192.015.309-.059.117-.089.192-.178.297-.089.105-.187.234-.267.314s-.17.169-.074.335c.095.166.424.699.91 1.132.626.557 1.152.73 1.316.812.163.081.258.067.354-.044.095-.112.408-.48.517-.643.11-.163.22-.136.371-.081s.956.45 1.12.532c.164.081.274.121.314.192s.041.527-.104.935z"/><path d="M19.057 4.298c-1.883-1.884-4.386-2.922-7.051-2.922-5.485 0-9.946 4.461-9.946 9.946 0 1.753.458 3.465 1.328 4.972l-1.41 5.148 5.268-1.381c1.458.794 3.097 1.213 4.76 1.213h.004c5.484 0 9.946-4.461 9.946-9.946 0-2.657-1.034-5.164-2.919-7.049l-.04-.04zm-7.051 15.352c-1.487 0-2.945-.399-4.216-1.155l-.302-.18-3.132.821.835-3.053-.198-.314c-.832-1.321-1.272-2.857-1.272-4.43 0-4.542 3.696-8.237 8.241-8.237 2.201 0 4.271.857 5.827 2.414s2.414 3.626 2.414 5.827c.001 4.542-3.695 8.237-8.238 8.237l-.059-.03z"/></svg>
                        WhatsApp
                      </button>
                    </div>
                  </div>

                  {/* Visibilidad en búsqueda — auto-guarda al instante */}
                  <div className={`rounded-2xl p-5 border-2 flex items-center justify-between gap-4 ${localProfile.isPublic !== false ? 'bg-teal-50 border-teal-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`material-icons-round text-2xl shrink-0 ${localProfile.isPublic !== false ? 'text-teal-500' : 'text-slate-400'}`}>
                        {localProfile.isPublic !== false ? 'visibility' : 'visibility_off'}
                      </span>
                      <div className="min-w-0">
                        <p className="font-black text-slate-800 text-sm">Aparecer en búsqueda de pacientes</p>
                        <p className={`text-xs font-bold mt-0.5 ${localProfile.isPublic !== false ? 'text-teal-600' : 'text-slate-500'}`}>
                          {localProfile.isPublic !== false ? '✓ Tu perfil es visible — los pacientes pueden encontrarte' : 'Tu perfil está oculto — los pacientes no pueden encontrarte'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const newIsPublic = localProfile.isPublic === false ? true : false;
                        const updated = { ...localProfile, isPublic: newIsPublic };
                        setLocalProfile(updated);
                        onSave(updated);
                        setShowSavedMsg(true);
                        setTimeout(() => setShowSavedMsg(false), 2000);
                      }}
                      className={`w-14 h-8 rounded-full relative transition-all shrink-0 ${localProfile.isPublic !== false ? 'bg-teal-500' : 'bg-slate-300'}`}
                    >
                      <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all ${localProfile.isPublic !== false ? 'left-7' : 'left-1'}`}></div>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Nombre Completo</label>
                      <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-4 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" type="text" value={localProfile.name} onChange={e => handleUpdate({ name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Especialidad</label>
                      <select className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-4 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" value={localProfile.specialty} onChange={e => handleUpdate({ specialty: e.target.value })}>
                        <option value="">— Selecciona tu especialidad —</option>
                        <option value="Kinesiología y Rehabilitación">Kinesiología y Rehabilitación</option>
                        <option value="Nutrición y Dietética">Nutrición y Dietética</option>
                        <option value="Psicología Clínica">Psicología Clínica</option>
                        <option value="Fonoaudiología">Fonoaudiología</option>
                        <option value="Terapia Ocupacional">Terapia Ocupacional</option>
                        <option value="Quiropráctica">Quiropráctica</option>
                        <option value="Podología">Podología</option>
                        <option value="Enfermería a Domicilio">Enfermería a Domicilio</option>
                        <option value="Medicina General">Medicina General</option>
                        <option value="Fisioterapia">Fisioterapia</option>
                        <option value="Otra Especialidad">Otra Especialidad</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Ciudad</label>
                      <input
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-4 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all"
                        type="text"
                        placeholder="Ej: La Serena"
                        value={localProfile.city || ''}
                        onChange={e => handleUpdate({ city: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Redes sociales */}
                  <div className="border-t-2 border-slate-100 pt-5">
                    <h3 className="text-base font-black text-black flex items-center gap-3 mb-3">
                      <span className="material-icons-round text-primary">share</span>
                      Redes Sociales
                    </h3>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Instagram</label>
                      <div className="relative flex items-center">
                        <span className="absolute left-4 flex items-center pointer-events-none">
                          <svg viewBox="0 0 24 24" className="w-4 h-4" style={{ fill: 'url(#igGrad)' }}>
                            <defs>
                              <linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#f09433" />
                                <stop offset="25%" stopColor="#e6683c" />
                                <stop offset="50%" stopColor="#dc2743" />
                                <stop offset="75%" stopColor="#cc2366" />
                                <stop offset="100%" stopColor="#bc1888" />
                              </linearGradient>
                            </defs>
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                          </svg>
                        </span>
                        <input
                          className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 pl-10 pr-4 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all"
                          type="text"
                          placeholder="@tu_usuario"
                          value={localProfile.instagram || ''}
                          onChange={e => handleUpdate({ instagram: e.target.value.trim() })}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium ml-1">Solo aparece en tu perfil público si está activado. Ingresa tu usuario (ej: @clinicamaslife)</p>
                    </div>
                  </div>

                  <div className="border-t-2 border-slate-100 pt-5">
                    <h3 className="text-base font-black text-black flex items-center gap-3 mb-3">
                      <span className="material-icons-round text-primary">payments</span>
                      Configuración de Pagos
                    </h3>
                    <div className="bg-slate-50 rounded-2xl p-5 border-2 border-slate-200 space-y-5">
                      {/* MercadoPago Marketplace connect */}
                      {localProfile.mpConnected ? (
                        <div className="flex items-center gap-3 bg-green-50 border-2 border-green-200 rounded-xl px-4 py-3">
                          <span className="material-icons-round text-green-500">check_circle</span>
                          <div className="flex-1">
                            <p className="font-black text-green-800 text-sm">Cuenta MercadoPago conectada</p>
                            <p className="text-xs text-green-600">
                              {/^(APP_USR-|TEST-)/.test(localProfile.mpPublicKey ?? '')
                                ? 'Los pagos llegan directo a tu cuenta MP ✓'
                                : 'Falta la clave pública — haz clic en Reparar'}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1 items-end">
                            {!/^(APP_USR-|TEST-)/.test(localProfile.mpPublicKey ?? '') && (
                              <button
                                onClick={async () => {
                                  if (!localProfile) return;
                                  const { data: { session } } = await supabase.auth.getSession();
                                  if (!session) return;
                                  const res = await fetch('/api/mp-oauth', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                                    body: JSON.stringify({ action: 'fix-public-key' }),
                                  });
                                  const data = await res.json();
                                  if (res.ok) {
                                    const fresh = await getProfessionalBySlugOrId(localProfile.id);
                                    if (fresh) { setLocalProfile(fresh); onSave(fresh); }
                                    alert('¡Clave reparada! El formulario de pago debería funcionar ahora.');
                                  } else {
                                    alert(data.error || 'No se pudo reparar. Desconecta y vuelve a conectar tu cuenta.');
                                  }
                                }}
                                className="text-xs text-amber-600 font-black hover:underline"
                              >
                                🔧 Reparar clave
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                if (!localProfile) return;
                                const { data: { session } } = await supabase.auth.getSession();
                                if (!session) return;
                                const res = await fetch('/api/mp-oauth', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    Authorization: `Bearer ${session.access_token}`,
                                  },
                                  body: JSON.stringify({ action: 'disconnect' }),
                                });
                                if (res.ok) {
                                  const updated = { ...localProfile, mpConnected: false, mpPublicKey: undefined };
                                  setLocalProfile(updated);
                                  onSave(updated);
                                }
                              }}
                              className="text-xs text-red-500 font-bold hover:underline"
                            >
                              Desconectar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 bg-blue-50 border-2 border-blue-100 rounded-xl px-4 py-3">
                          <img src="https://http2.mlstatic.com/frontend-assets/ui-navigation/5.19.1/mercadopago/logo__large-v2.png" alt="MercadoPago" className="h-5 object-contain" />
                          <div className="flex-1">
                            <p className="font-black text-slate-800 text-sm">Conecta tu cuenta MercadoPago</p>
                            <p className="text-xs text-slate-500">Recibe pagos directo en tu cuenta, sin intermediarios</p>
                          </div>
                          <button
                            onClick={async () => {
                              const appId = import.meta.env.VITE_MP_APP_ID;
                              const { data: { session } } = await supabase.auth.getSession();
                              if (!session) return;
                              // Obtener estado OAuth firmado del servidor (anti-CSRF)
                              const initRes = await fetch('/api/mp-oauth', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                                body: JSON.stringify({ action: 'generate-state' }),
                              });
                              if (!initRes.ok) return;
                              const { state } = await initRes.json();
                              const redirectUri = encodeURIComponent('https://clinicamaslife.cl/api/mp-oauth');
                              window.location.href = `https://auth.mercadopago.com/authorization?client_id=${appId}&response_type=code&platform_id=mp&scope=offline_access+read+write&redirect_uri=${redirectUri}&state=${encodeURIComponent(state)}`;
                            }}
                            className="shrink-0 text-xs font-black text-white px-3 py-1.5 rounded-lg"
                            style={{ background: 'linear-gradient(135deg, #009ee3, #007eb5)' }}
                          >
                            Conectar
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-black text-black">Habilitar Pagos Anticipados</p>
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Los pacientes deberán pagar antes de confirmar su cita</p>
                        </div>
                        <button
                          onClick={() => handleUpdate({ paymentEnabled: !localProfile.paymentEnabled })}
                          className={`w-14 h-8 rounded-full relative transition-all ${localProfile.paymentEnabled ? 'bg-primary' : 'bg-slate-300'}`}
                        >
                          <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${localProfile.paymentEnabled ? 'left-7' : 'left-1'}`}></div>
                        </button>
                      </div>

                      {localProfile.paymentEnabled && !localProfile.mpConnected && (
                        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 animate-in slide-in-from-top-4 duration-300">
                          <span className="material-icons-round text-amber-500 text-xl shrink-0">warning_amber</span>
                          <p className="text-xs font-bold text-amber-800 leading-relaxed">
                            Tienes los cobros activos pero <b>aún no conectaste tu MercadoPago</b>. Mientras no lo conectes, tus pacientes reservarán sin pago. Conéctalo arriba para empezar a recibir los pagos en tu cuenta.
                          </p>
                        </div>
                      )}

                      {localProfile.paymentEnabled && (
                        <div className="space-y-3 animate-in slide-in-from-top-4 duration-300">
                          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Modo de cobro al reservar</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                            {/* Opción: Bono de Reserva */}
                            <div
                              onClick={() => handleUpdate({ chargeFullService: false })}
                              className={`cursor-pointer text-left p-4 rounded-2xl border-2 transition-all ${!localProfile.chargeFullService ? 'border-primary bg-primary/5' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${!localProfile.chargeFullService ? 'border-primary' : 'border-slate-300'}`}>
                                  {!localProfile.chargeFullService && <div className="w-2 h-2 rounded-full bg-primary" />}
                                </div>
                                <span className="text-sm font-black text-slate-900">Bono de Reserva</span>
                              </div>
                              <p className="text-xs text-slate-500 font-bold mb-3">Se cobra un monto fijo al reservar la cita</p>
                              {!localProfile.chargeFullService && (
                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  <span className="text-slate-500 text-sm font-bold">$</span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={(localProfile.bookingFee ?? 5000).toLocaleString('es-CL')}
                                    onChange={e => {
                                      const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '');
                                      handleUpdate({ bookingFee: raw === '' ? 0 : Number(raw) });
                                    }}
                                    className="w-28 text-right border-2 border-slate-200 rounded-xl px-3 py-1.5 text-sm font-black focus:border-primary focus:outline-none bg-white"
                                  />
                                </div>
                              )}
                            </div>

                            {/* Opción: Precio completo del servicio */}
                            <div
                              onClick={() => handleUpdate({ chargeFullService: true })}
                              className={`cursor-pointer text-left p-4 rounded-2xl border-2 transition-all ${localProfile.chargeFullService ? 'border-primary bg-primary/5' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${localProfile.chargeFullService ? 'border-primary' : 'border-slate-300'}`}>
                                  {localProfile.chargeFullService && <div className="w-2 h-2 rounded-full bg-primary" />}
                                </div>
                                <span className="text-sm font-black text-slate-900">Precio del Servicio</span>
                              </div>
                              <p className="text-xs text-slate-500 font-bold">Se cobra el precio del servicio seleccionado por el paciente</p>
                            </div>

                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div>
                          <p className="font-black text-black">Reseñas de pacientes</p>
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Los pacientes atendidos pueden calificarte con estrellas</p>
                        </div>
                        <button
                          onClick={() => handleUpdate({ reviewsEnabled: localProfile.reviewsEnabled !== false ? false : true })}
                          className={`w-14 h-8 rounded-full relative transition-all shrink-0 ${localProfile.reviewsEnabled !== false ? 'bg-primary' : 'bg-slate-300'}`}
                        >
                          <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${localProfile.reviewsEnabled !== false ? 'left-7' : 'left-1'}`}></div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Google Calendar Sync ── */}
              <section className="bg-white rounded-2xl border border-slate-100 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] p-5 md:p-8 space-y-5">
                <h3 className="text-base font-black text-black flex items-center gap-3">
                  <span className="material-icons-round text-[#4285F4]">calendar_month</span>
                  Google Calendar
                </h3>
                <div className="bg-slate-50 rounded-2xl p-5 border-2 border-slate-200">
                  {localProfile.googleCalendarConnected ? (
                    <div className="flex items-center gap-3 bg-green-50 border-2 border-green-200 rounded-xl px-4 py-3">
                      <span className="material-icons-round text-green-500">check_circle</span>
                      <div className="flex-1">
                        <p className="font-black text-green-800 text-sm">Google Calendar conectado</p>
                        <p className="text-xs text-green-600">Tus citas se sincronizan automáticamente en ambos sentidos</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {syncMsg && (
                          <span className={`text-[10px] font-bold ${syncMsg.ok ? 'text-green-600' : 'text-red-500'}`}>
                            {syncMsg.text}
                          </span>
                        )}
                        <div className="flex items-center gap-3">
                        <button
                          disabled={isSyncing}
                          onClick={async () => {
                            setIsSyncing(true);
                            setSyncMsg(null);
                            try {
                              const { data: { session } } = await supabase.auth.getSession();
                              if (!session) { setSyncMsg({ ok: false, text: 'Sin sesión activa' }); return; }
                              const r = await fetch('/api/google-calendar-sync', { method: 'GET', headers: { Authorization: `Bearer ${session.access_token}` } });
                              if (r.ok) {
                                setSyncMsg({ ok: true, text: '✓ Sincronización completada' });
                                setTimeout(() => setSyncMsg(null), 4000);
                              } else {
                                const err = await r.json().catch(() => ({}));
                                setSyncMsg({ ok: false, text: err.error || `Error ${r.status}` });
                              }
                            } catch {
                              setSyncMsg({ ok: false, text: 'Error de red' });
                            } finally {
                              setIsSyncing(false);
                            }
                          }}
                          className="text-xs text-sky-600 font-bold hover:underline flex items-center gap-1 disabled:opacity-50"
                        >
                          {isSyncing && (
                            <span className="inline-block w-3 h-3 border-2 border-sky-300 border-t-sky-600 rounded-full animate-spin" />
                          )}
                          {isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm('¿Desconectar Google Calendar?')) return;
                            await supabase.from('professionals').update({ google_calendar_connected: false }).eq('id', localProfile.id);
                            const updated = { ...localProfile, googleCalendarConnected: false };
                            setLocalProfile(updated);
                            onSave(updated);
                          }}
                          className="text-xs text-red-500 font-bold hover:underline"
                        >
                          Desconectar
                        </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 bg-blue-50 border-2 border-blue-100 rounded-xl px-4 py-3">
                      <div className="w-8 h-8 shrink-0 flex items-center justify-center">
                        <svg viewBox="0 0 48 48" className="w-7 h-7">
                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                          <path fill="none" d="M0 0h48v48H0z"/>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="font-black text-slate-800 text-sm">Sincroniza con Google Calendar</p>
                        <p className="text-xs text-slate-500">Tus citas aparecen en Google Calendar y los eventos externos bloquean tu agenda</p>
                      </div>
                      <button
                        onClick={async () => {
                          const { data: { session } } = await supabase.auth.getSession();
                          if (!session) return;
                          const r = await fetch('/api/google-oauth', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${session.access_token}` },
                          });
                          if (!r.ok) return;
                          const { url } = await r.json();
                          window.location.href = url;
                        }}
                        className="shrink-0 text-xs font-black text-white px-3 py-1.5 rounded-lg"
                        style={{ background: 'linear-gradient(135deg, #4285F4, #1a6cf5)' }}
                      >
                        Conectar
                      </button>
                    </div>
                  )}
                </div>
              </section>

              <section className="bg-white rounded-2xl border border-slate-100 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] p-5 md:p-8 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-black flex items-center gap-3">
                    <span className="material-icons-round text-primary">medical_services</span>
                    Mis Servicios y Tarifas
                  </h3>
                  <button
                    onClick={() => setShowServiceModal(true)}
                    className="bg-slate-900 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] border-b-4 border-slate-800 active:border-b-0 active:translate-y-1 transition-all flex items-center gap-2"
                  >
                    <span className="material-icons-round text-sm">add</span>
                    Nuevo Servicio
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {localProfile.services.map((service) => (
                    <div key={service.id} className="bg-slate-50 rounded-2xl p-5 border-2 border-slate-200 group hover:border-primary/30 transition-all flex flex-col justify-between relative overflow-hidden">
                      {service.image && (
                        <img src={service.image} alt={service.name} className="absolute inset-0 w-full h-full object-cover opacity-5 group-hover:opacity-10 transition-opacity" />
                      )}
                      <div className="relative space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="px-4 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-[0.2em]">{service.duration} min</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleOpenEditService(service)}
                              className="w-10 h-10 rounded-xl bg-primary/10 text-primary opacity-0 group-hover:opacity-100 transition-all hover:bg-primary hover:text-white flex items-center justify-center"
                              title="Editar servicio"
                            >
                              <span className="material-icons-round text-xl">edit</span>
                            </button>
                            <button onClick={() => removeService(service.id)} className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-500 hover:text-white flex items-center justify-center">
                              <span className="material-icons-round text-xl">delete</span>
                            </button>
                          </div>
                        </div>
                        <h4 className="text-xl font-black text-black">{service.name}</h4>
                        <p className="text-sm text-slate-500 font-medium line-clamp-2">{service.description}</p>
                      </div>
                      <div className="relative mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Precio</p>
                          <p className="text-2xl font-black text-black">${service.price.toLocaleString('es-CL')}</p>
                        </div>
                        <button
                          className="w-12 h-12 rounded-2xl bg-white border-2 border-slate-200 flex items-center justify-center text-primary hover:bg-primary hover:text-white hover:border-primary transition-all shadow-sm"
                          onClick={() => handleOpenEditService(service)}
                          title="Editar servicio"
                        >
                          <span className="material-icons-round">edit</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white rounded-2xl border border-slate-100 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] p-5 md:p-8 space-y-5">
                <h3 className="text-base font-black text-black flex items-center gap-3">
                  <span className="material-icons-round text-primary">schedule</span>
                  Horarios de Atención Semanal
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((dayName, idx) => {
                    const daySchedule = localProfile.schedule?.[idx] || { active: idx !== 0 && idx !== 6, start: '09:00', end: '18:00' };
                    return (
                      <div key={idx} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 sm:p-6 rounded-2xl border-2 transition-all ${daySchedule.active ? 'border-primary/20 bg-primary/5' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              const newSchedule = { ...(localProfile.schedule || {}) };
                              newSchedule[idx] = { ...daySchedule, active: !daySchedule.active };
                              handleUpdate({ schedule: newSchedule });
                            }}
                            className={`w-12 h-6 rounded-full relative transition-colors shrink-0 ${daySchedule.active ? 'bg-primary' : 'bg-slate-300'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${daySchedule.active ? 'left-7' : 'left-1'}`}></div>
                          </button>
                          <span className="text-sm font-black text-slate-900 uppercase tracking-widest w-24">{dayName}</span>
                          {!daySchedule.active && <span className="text-xs font-black text-slate-400 uppercase tracking-widest sm:hidden">No laboral</span>}
                        </div>

                        {daySchedule.active && (
                          <div className="flex items-center gap-3 pl-[60px] sm:pl-0">
                            <input
                              type="time"
                              value={daySchedule.start}
                              onChange={e => {
                                const newSchedule = { ...(localProfile.schedule || {}) };
                                newSchedule[idx] = { ...daySchedule, start: e.target.value };
                                handleUpdate({ schedule: newSchedule });
                              }}
                              className="bg-white border text-sm font-bold rounded-lg p-2 focus:ring-primary w-full sm:w-auto"
                            />
                            <span className="text-slate-500 font-bold shrink-0">a</span>
                            <input
                              type="time"
                              value={daySchedule.end}
                              onChange={e => {
                                const newSchedule = { ...(localProfile.schedule || {}) };
                                newSchedule[idx] = { ...daySchedule, end: e.target.value };
                                handleUpdate({ schedule: newSchedule });
                              }}
                              className="bg-white border text-sm font-bold rounded-lg p-2 focus:ring-primary w-full sm:w-auto"
                            />
                          </div>
                        )}
                        {!daySchedule.active && <span className="text-xs font-black text-slate-500 uppercase tracking-widest hidden sm:block">No Laboral</span>}
                      </div>
                    );
                  })}
                </div>
              </section>

            </div>
          )}

          {activeTab === 'suscripcion' && (
            <div className="space-y-5 animate-in fade-in duration-500" style={{ fontFamily: "'Inter','Manrope',sans-serif" }}>

              {subscribedMsg && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border"
                  style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' }}>
                  <span className="material-icons-round text-lg shrink-0" style={{ color: '#22C55E' }}>check_circle</span>
                  <p className="text-sm font-semibold" style={{ color: '#15803D' }}>¡Pago recibido! Tu suscripción se activará en los próximos minutos.</p>
                </div>
              )}

              {/* Hero card — gradiente igual que el dashboard */}
              <div className="rounded-2xl p-5 relative overflow-hidden text-white"
                style={
                  localProfile.subscriptionStatus === 'paused'
                    ? { background: 'linear-gradient(135deg,#E11D48 0%,#9F1239 100%)', boxShadow: '0 10px 30px rgba(225,29,72,0.30)' }
                    : localProfile.subscriptionStatus === 'trial' && daysLeft !== null && daysLeft <= 7
                    ? { background: 'linear-gradient(135deg,#F59E0B 0%,#D97706 100%)', boxShadow: '0 10px 30px rgba(245,158,11,0.30)' }
                    : { background: 'linear-gradient(135deg,#00B3A4 0%,#0F5EF7 100%)', boxShadow: '0 10px 30px rgba(0,179,164,0.30)' }
                }>

                {/* Orbe decorativo */}
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
                  style={{ background: 'rgba(255,255,255,0.08)', filter: 'blur(30px)' }} />

                {/* Header */}
                <div className="flex items-center gap-3 relative z-10">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.30)' }}>
                    <span className="material-icons-round text-xl text-white">
                      {localProfile.subscriptionStatus === 'paused' ? 'pause_circle' : localProfile.subscriptionStatus === 'trial' ? 'hourglass_top' : 'verified'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-black tracking-tight">Agenda MasLife</h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.12em]"
                        style={{ background: 'rgba(255,255,255,0.20)', border: '1px solid rgba(255,255,255,0.30)' }}>
                        {localProfile.subscriptionStatus === 'trial' ? 'Prueba Gratis'
                          : localProfile.subscriptionStatus === 'active' ? 'Pro · Activo'
                          : 'Pausado'}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5 leading-snug" style={{ color: 'rgba(255,255,255,0.80)' }}>
                      {localProfile.subscriptionStatus === 'trial'
                        ? `Trial hasta el ${localProfile.trialEndDate ? new Date(localProfile.trialEndDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' }) : '---'}.`
                        : localProfile.subscriptionStatus === 'paused'
                          ? 'Tu perfil está pausado. Regulariza tu pago para reactivarlo.'
                          : 'Tu suscripción está activa y tu agenda es visible en MasLife.'}
                    </p>
                  </div>
                </div>

                {/* Countdown */}
                {localProfile.subscriptionStatus === 'trial' && daysLeft !== null && daysLeft <= 7 && (
                  <div className="mt-3 relative z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black"
                    style={daysLeft <= 3
                      ? { background: 'white', color: '#DC2626' }
                      : { background: 'rgba(255,255,255,0.18)', color: 'white', border: '1px solid rgba(255,255,255,0.30)' }}>
                    <span className="material-icons-round text-sm">timer</span>
                    {daysLeft === 0 ? '¡Termina hoy!' : daysLeft === 1 ? '¡Queda 1 día!' : `Quedan ${daysLeft} días`}
                  </div>
                )}

                {/* Stats grid — glassmorphism */}
                <div className="mt-4 grid grid-cols-4 gap-2 relative z-10">
                  {[
                    {
                      label: 'Próx. Cobro',
                      value: localProfile.subscriptionStatus === 'active' && localProfile.trialEndDate
                        ? (() => { const d = new Date(localProfile.trialEndDate); const now = new Date(); while (d <= now) d.setMonth(d.getMonth() + 1); return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }); })()
                        : localProfile.trialEndDate
                          ? new Date(localProfile.trialEndDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                          : '---',
                    },
                    {
                      label: localProfile.subscriptionStatus === 'active' ? 'Renovación' : 'Días Rest.',
                      value: localProfile.subscriptionStatus === 'active'
                        ? '✦'
                        : daysLeft !== null ? `${daysLeft}d` : '---',
                      warn: daysLeft !== null && daysLeft <= 3 && localProfile.subscriptionStatus === 'trial',
                    },
                    { label: 'Plan', value: 'Pro' },
                    { label: 'Mensual', value: '$24.990' },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-2.5 text-center"
                      style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.20)' }}>
                      <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.60)' }}>{s.label}</p>
                      <p className={`text-sm font-black tracking-tight ${s.warn ? 'text-yellow-300' : 'text-white'}`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="mt-4 pt-4 relative z-10 flex items-center justify-between gap-3"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.18)' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="material-icons-round text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>security</span>
                    <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.45)' }}>Pago Seguro · MercadoPago</p>
                  </div>
                  <a href={mpLinkWithBack}
                    className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl font-black text-[11px] uppercase tracking-[0.15em] transition-all active:scale-95"
                    style={{ background: 'white', color: '#0F5EF7', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                    <span className="material-icons-round text-sm">
                      {localProfile.subscriptionStatus === 'active' ? 'manage_accounts' : 'credit_card'}
                    </span>
                    {localProfile.subscriptionStatus === 'active'
                      ? 'Gestionar'
                      : localProfile.subscriptionStatus === 'paused'
                        ? 'Reactivar'
                        : 'Vincular tarjeta'}
                  </a>
                </div>

                <span className="material-icons absolute -bottom-8 -right-6 text-[140px] pointer-events-none" style={{ color: 'rgba(255,255,255,0.06)', transform: 'rotate(12deg)' }}>card_membership</span>
              </div>

              {/* Incluido en tu plan */}
              <div className="rounded-2xl p-5" style={{ background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(15,23,42,0.06)' }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-4" style={{ color: '#7A859F' }}>Incluido en tu Plan Pro</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {[
                    { icon: 'calendar_month', label: 'Agenda inteligente ilimitada' },
                    { icon: 'group', label: 'Gestión de pacientes completa' },
                    { icon: 'payments', label: 'Control de finanzas y transacciones' },
                    { icon: 'notifications', label: 'Notificaciones automáticas' },
                    { icon: 'public', label: 'Perfil público en la red MasLife' },
                    { icon: 'support_agent', label: 'Soporte prioritario 24/7' },
                  ].map(f => (
                    <div key={f.icon} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: '#F5F8FC' }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'linear-gradient(135deg,rgba(0,179,164,0.12) 0%,rgba(15,94,247,0.12) 100%)' }}>
                        <span className="material-icons-round text-base" style={{ color: '#00B3A4' }}>{f.icon}</span>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: '#0B1736' }}>{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Soporte */}
              <div className="rounded-2xl p-5" style={{ background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(15,23,42,0.06)' }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-4" style={{ color: '#7A859F' }}>Soporte y Ayuda</p>
                <div className="flex flex-col lg:flex-row gap-3">
                  <a
                    href={`https://wa.me/${SUPPORT_PHONE.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola MasLife! Soy ${localProfile.name} y necesito ayuda con mi cuenta.`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-black text-sm text-white transition-all active:scale-95"
                    style={{ background: '#25D366', boxShadow: '0 4px 14px rgba(37,211,102,0.30)' }}>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Chatear con Soporte
                  </a>
                  <a
                    href={`mailto:soporte@maslife.cl?subject=Ayuda con mi cuenta - ${localProfile.name}`}
                    className="flex-1 flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-black text-sm transition-all active:scale-95"
                    style={{ background: '#F5F8FC', color: '#0B1736', border: '1px solid rgba(15,23,42,0.08)' }}>
                    <span className="material-icons-round text-base" style={{ color: '#7A859F' }}>mail</span>
                    Enviar Email
                  </a>
                </div>
                <p className="text-[11px] text-center mt-3" style={{ color: '#7A859F' }}>Tiempo de respuesta: menos de 2 horas en horario hábil</p>
              </div>

            </div>
          )}
          {showServiceModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden border-2 border-slate-200">
                <div className="p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-black tracking-tight">Nuevo Servicio</h3>
                    <button onClick={() => setShowServiceModal(false)} className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all flex items-center justify-center">
                      <span className="material-icons-round">close</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Nombre del Servicio</label>
                      <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-4 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" value={newService.name} onChange={e => setNewService({ ...newService, name: e.target.value })} placeholder="Ej: Consulta Médica General" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Precio ($)</label>
                        <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-4 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" type="text" inputMode="numeric" value={newService.price || ''} onChange={e => setNewService({ ...newService, price: Number(e.target.value.replace(/\D/g, '')) || 0 })} placeholder="0" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Duración (Min)</label>
                        <select className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-4 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all appearance-none" value={newService.duration} onChange={e => setNewService({ ...newService, duration: Number(e.target.value) })}>
                          <option value={15}>15 minutos</option>
                          <option value={30}>30 minutos</option>
                          <option value={45}>45 minutos</option>
                          <option value={60}>60 minutos</option>
                          <option value={90}>90 minutos</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Descripción</label>
                      <textarea className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-4 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all min-h-[100px]" value={newService.description} onChange={e => setNewService({ ...newService, description: e.target.value })} placeholder="Describe brevemente de qué trata este servicio..." />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Imagen del Servicio (opcional)</label>
                      {newService.image && (
                        <img src={newService.image} alt="preview" className="w-full h-32 object-cover rounded-2xl mb-2 border-2 border-slate-200" />
                      )}
                      <label className="flex items-center gap-3 cursor-pointer w-full bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl py-4 px-6 hover:border-primary hover:bg-primary/5 transition-all">
                        <span className="material-icons-round text-slate-400">add_photo_alternate</span>
                        <span className="text-sm font-bold text-slate-500">{newService.image ? 'Cambiar imagen' : 'Subir imagen (máx. 5MB)'}</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => handleServiceImageChange(e, false)} />
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-2">
                    <button onClick={() => setShowServiceModal(false)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
                    <button onClick={handleAddService} className="flex-1 py-3 rounded-xl bg-primary text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all">Crear Servicio</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab Seguridad — MFA (CENS RCE) ── */}
          {activeTab === 'seguridad' && (
            <div className="space-y-6 animate-in fade-in duration-500 max-w-xl">
              {/* Soporte / Sugerencias */}
              <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="material-icons-round text-primary">forum</span>
                  <h3 className="text-base font-black text-black">Sugerencias y Soporte</h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  ¿Tienes una idea para mejorar la plataforma o encontraste un problema? Escríbenos — el equipo lo revisa y te responde.
                </p>
                {fbSent ? (
                  <div className="flex items-center gap-2 px-4 py-4 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-bold">
                    <span className="material-icons-round text-base">check_circle</span>
                    ¡Gracias! Recibimos tu mensaje y te responderemos pronto.
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      {([['suggestion', 'Sugerencia', 'lightbulb'], ['problem', 'Problema', 'bug_report']] as const).map(([val, label, icon]) => (
                        <button key={val} onClick={() => setFbType(val)}
                          className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 border ${fbType === val ? 'bg-primary text-white border-primary' : 'bg-white text-slate-500 border-slate-200 hover:border-primary/40'}`}>
                          <span className="material-icons-round text-sm">{icon}</span> {label}
                        </button>
                      ))}
                    </div>
                    <input
                      value={fbSubject}
                      onChange={e => setFbSubject(e.target.value)}
                      placeholder="Asunto (opcional)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 font-bold text-sm text-slate-800 outline-none focus:border-primary"
                    />
                    <textarea
                      value={fbMessage}
                      onChange={e => setFbMessage(e.target.value)}
                      rows={4}
                      placeholder={fbType === 'problem' ? 'Describe el problema con el mayor detalle posible…' : 'Cuéntanos tu idea…'}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 font-bold text-sm text-slate-800 outline-none focus:border-primary resize-none"
                    />
                    <button
                      onClick={submitFeedback}
                      disabled={fbSending || !fbMessage.trim()}
                      className="w-full py-3 rounded-xl bg-primary text-white font-black text-xs uppercase tracking-widest shadow-lg disabled:opacity-40 hover:brightness-110 transition-all flex items-center justify-center gap-2"
                    >
                      <span className="material-icons-round text-sm">{fbSending ? 'sync' : 'send'}</span>
                      {fbSending ? 'Enviando…' : 'Enviar mensaje'}
                    </button>
                  </>
                )}
              </section>

              <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <span className="material-icons-round text-slate-700">shield</span>
                  <h3 className="text-base font-black text-black">Autenticación de Dos Factores (MFA)</h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Activa MFA para proteger tu cuenta con un código adicional desde una app de autenticación (Google Authenticator, Authy, etc.). Recomendado por CENS para proteger el acceso a fichas clínicas.
                </p>

                {mfaMsg && (
                  <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold ${mfaMsg.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                    <span className="material-icons-round text-sm">{mfaMsg.ok ? 'check_circle' : 'error'}</span>
                    {mfaMsg.text}
                  </div>
                )}

                {mfaFactors.filter(f => f.status === 'verified').length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                      <span className="material-icons-round text-emerald-500">verified_user</span>
                      <p className="text-xs font-black text-emerald-700">MFA activo — tu cuenta está protegida con dos factores.</p>
                    </div>
                    {mfaFactors.filter(f => f.status === 'verified').map(f => (
                      <button
                        key={f.id}
                        onClick={() => handleMfaUnenroll(f.id)}
                        className="text-xs font-bold text-rose-500 hover:text-rose-700 flex items-center gap-1"
                      >
                        <span className="material-icons-round text-sm">remove_circle_outline</span>
                        Desactivar MFA
                      </button>
                    ))}
                  </div>
                ) : !mfaQr ? (
                  <button
                    onClick={handleMfaEnroll}
                    disabled={mfaEnrolling}
                    className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest border-b-4 border-slate-700 active:border-b-0 active:translate-y-1 transition-all disabled:opacity-50"
                  >
                    {mfaEnrolling
                      ? <span className="inline-block w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                      : <span className="material-icons-round text-sm">add_moderator</span>
                    }
                    {mfaEnrolling ? 'Generando...' : 'Activar MFA'}
                  </button>
                ) : (
                  <div className="space-y-5">
                    <p className="text-xs text-slate-600 font-medium">
                      Escanea el código QR con tu app de autenticación, luego ingresa el código de 6 dígitos:
                    </p>
                    <div className="flex justify-center">
                      <img src={mfaQr.qr_code} alt="QR Code MFA" className="w-48 h-48 border-4 border-white shadow-lg rounded-xl" />
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Clave manual</p>
                      <p className="text-xs font-mono text-slate-600 break-all">{mfaQr.secret}</p>
                    </div>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={mfaCode}
                        onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        className="flex-1 bg-white border-2 border-slate-200 rounded-xl py-3 px-4 text-center text-xl font-black tracking-[0.5em] focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                      />
                      <button
                        onClick={handleMfaVerify}
                        disabled={mfaCode.length !== 6}
                        className="px-6 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:brightness-110 transition-all"
                      >
                        Verificar
                      </button>
                    </div>
                    <button onClick={() => { setMfaQr(null); setMfaCode(''); }} className="text-xs text-slate-400 hover:text-slate-600">
                      Cancelar
                    </button>
                  </div>
                )}
              </section>

              <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="material-icons-round text-slate-700">lock</span>
                  <h3 className="text-base font-black text-black">Cambiar Contraseña</h3>
                </div>
                <p className="text-xs text-slate-500">Usa la recuperación de contraseña para actualizarla de forma segura.</p>
                <button
                  onClick={async () => {
                    if (!profile?.email) return;
                    await supabase.auth.resetPasswordForEmail(profile.email);
                    setMfaMsg({ ok: true, text: 'Revisa tu correo para el enlace de cambio de contraseña.' });
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  <span className="material-icons-round text-sm">email</span>
                  Enviar enlace por email
                </button>
              </section>

              {/* ── Zona de Peligro ── */}
              <section className="rounded-2xl border border-rose-200 p-6 space-y-4" style={{ background: '#FFF5F5' }}>
                <div className="flex items-center gap-3">
                  <span className="material-icons-round text-rose-500">warning</span>
                  <h3 className="text-base font-black text-rose-700">Zona de Peligro</h3>
                </div>
                <div className="flex items-start justify-between gap-4 flex-col lg:flex-row">
                  <div>
                    <p className="text-sm font-bold text-rose-800">Eliminar mi cuenta</p>
                    <p className="text-xs text-rose-600 mt-1 leading-relaxed max-w-sm">
                      Esta acción es irreversible. Se eliminarán tu perfil, pacientes, citas y transacciones de forma permanente.
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); }}
                    className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-widest text-rose-600 border-2 border-rose-300 hover:bg-rose-100 transition-all active:scale-95"
                    style={{ background: 'white' }}
                  >
                    <span className="material-icons-round text-sm">delete_forever</span>
                    Eliminar cuenta
                  </button>
                </div>
              </section>
            </div>
          )}

          {/* ── Modal Eliminar Cuenta ── */}
          {showDeleteModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-rose-200 overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-5 border-b border-rose-100" style={{ background: '#FFF5F5' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-rose-500 text-xl">delete_forever</span>
                    </div>
                    <div>
                      <p className="text-sm font-black text-rose-700">Eliminar cuenta permanentemente</p>
                      <p className="text-xs text-rose-500">Esta acción no se puede deshacer</p>
                    </div>
                  </div>
                </div>
                {/* Body */}
                <div className="p-5 space-y-4">
                  <div className="rounded-xl bg-rose-50 border border-rose-100 p-4 space-y-1">
                    <p className="text-xs font-black text-rose-700 uppercase tracking-widest">Se eliminará permanentemente:</p>
                    {['Tu perfil profesional y foto', 'Todos tus pacientes y fichas clínicas', 'Historial de citas y transacciones', 'Acceso a MasLife'].map(item => (
                      <div key={item} className="flex items-center gap-2 text-xs text-rose-600">
                        <span className="material-icons-round text-sm">remove_circle_outline</span>
                        {item}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">
                      Escribe <span className="text-rose-600 font-black">ELIMINAR</span> para confirmar
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={e => setDeleteConfirmText(e.target.value)}
                      placeholder="ELIMINAR"
                      className="w-full border-2 border-slate-200 rounded-xl py-3 px-4 font-black text-sm focus:border-rose-400 focus:ring-4 focus:ring-rose-100 transition-all"
                    />
                  </div>
                </div>
                {/* Footer */}
                <div className="p-5 pt-0 flex gap-3">
                  <button
                    onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }}
                    className="flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmText !== 'ELIMINAR' || isDeleting}
                    className="flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ background: deleteConfirmText === 'ELIMINAR' && !isDeleting ? '#E11D48' : undefined }}
                  >
                    {isDeleting
                      ? <><span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Eliminando...</>
                      : <><span className="material-icons-round text-sm">delete_forever</span> Eliminar</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Editar Servicio */}
          {showEditServiceModal && editingService && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden border-2 border-slate-200">
                <div className="p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-black tracking-tight">Editar Servicio</h3>
                    <button onClick={() => setShowEditServiceModal(false)} className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all flex items-center justify-center">
                      <span className="material-icons-round">close</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Nombre del Servicio</label>
                      <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-4 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" value={editingService.name} onChange={e => setEditingService({ ...editingService, name: e.target.value })} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Precio ($)</label>
                        <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-4 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" type="text" inputMode="numeric" value={editingService.price || ''} onChange={e => setEditingService({ ...editingService, price: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Duración (Min)</label>
                        <select className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-4 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all appearance-none" value={editingService.duration} onChange={e => setEditingService({ ...editingService, duration: Number(e.target.value) })}>
                          <option value={15}>15 minutos</option>
                          <option value={30}>30 minutos</option>
                          <option value={45}>45 minutos</option>
                          <option value={60}>60 minutos</option>
                          <option value={90}>90 minutos</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Descripción</label>
                      <textarea className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-4 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all min-h-[90px]" value={editingService.description} onChange={e => setEditingService({ ...editingService, description: e.target.value })} />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Imagen del Servicio (opcional)</label>
                      {editingService.image && (
                        <img src={editingService.image} alt="preview" className="w-full h-28 object-cover rounded-xl mb-2 border-2 border-slate-200" />
                      )}
                      <label className="flex items-center gap-3 cursor-pointer w-full bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl py-3 px-4 hover:border-primary hover:bg-primary/5 transition-all">
                        <span className="material-icons-round text-slate-400">add_photo_alternate</span>
                        <span className="text-sm font-bold text-slate-500">{editingService.image ? 'Cambiar imagen' : 'Subir imagen (máx. 5MB)'}</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => handleServiceImageChange(e, true)} />
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-2">
                    <button onClick={() => setShowEditServiceModal(false)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
                    <button onClick={handleSaveEditService} className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2">
                      <span className="material-icons-round text-sm">save</span>
                      Guardar Cambios
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Settings;
