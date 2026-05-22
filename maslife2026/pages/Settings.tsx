import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfessionalProfile, Service } from '../types';
import { useClinic } from '../ClinicContext';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { loggedPro: profile, updatePro: onSave, logout } = useClinic();

  const onLogout = () => logout(navigate, 'PROFESSIONAL');
  const [activeTab, setActiveTab] = useState<'perfil' | 'suscripcion'>('perfil');
  const [localProfile, setLocalProfile] = useState<ProfessionalProfile | null>(profile);
  const [hasChanges, setHasChanges] = useState(false);
  const [showSavedMsg, setShowSavedMsg] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [newService, setNewService] = useState<Partial<Service>>({ name: '', price: 0, duration: 45, description: '' });
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showEditServiceModal, setShowEditServiceModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const MP_SUBSCRIPTION_LINK = import.meta.env.VITE_GLOBAL_SUBSCRIPTION_LINK || "https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=7e9fa964bb6d4ecd89058685ba8a5b34";
  const mpLinkWithBack = `${MP_SUBSCRIPTION_LINK}&back_url=${encodeURIComponent('https://www.clinicamaslife.cl/#/pro/settings?subscribed=1')}`;
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
    const hashParts = window.location.hash.split('?');
    const params = new URLSearchParams(hashParts[1] || '');
    if (params.get('subscribed') === '1') {
      setSubscribedMsg(true);
      setActiveTab('suscripcion');
      window.history.replaceState({}, '', window.location.pathname + hashParts[0]);
    }
  }, []);

  if (!localProfile) return null;

  const handleUpdate = (updates: Partial<ProfessionalProfile>) => {
    setLocalProfile(prev => prev ? { ...prev, ...updates } : null);
    setHasChanges(true);
  };

  const handleSave = () => {
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
    const base = window.location.origin + window.location.pathname;
    return `${base}#/patient/profile/${localProfile.slug || localProfile.id}`;
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
      if (file.size > 5 * 1024 * 1024) {
        alert('La imagen es demasiado grande. Por favor selecciona una imagen menor a 5 MB.');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        handleUpdate({ avatar: event.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex-1 w-full overflow-y-auto bg-slate-50">
      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10">
        <div className="max-w-5xl mx-auto space-y-10 pb-20">
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <p className="text-xs font-black text-primary uppercase tracking-[0.3em] mb-1">Configuración Maslife</p>
              <h1 className="text-4xl font-black tracking-tight text-black">Ajustes de Cuenta</h1>
              <div className="flex bg-slate-50 p-2 rounded-2xl mt-8 max-w-fit border border-slate-200 shadow-inner gap-2">
                <button onClick={() => setActiveTab('perfil')} className={`px-10 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'perfil' ? 'bg-white text-primary shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>Mi Perfil</button>
                <button onClick={() => setActiveTab('suscripcion')} className={`px-10 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'suscripcion' ? 'bg-white text-primary shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>Suscripción</button>
              </div>
            </div>
            {activeTab === 'perfil' && (
              <div className="flex items-center gap-4">
                {showSavedMsg && <span className="text-xs font-black text-emerald-500 uppercase tracking-widest animate-in fade-in slide-in-from-right-4">✓ Cambios guardados</span>}
                <button
                  disabled={!hasChanges}
                  onClick={handleSave}
                  className={`px-10 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${hasChanges ? 'bg-slate-900 text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] border-b-4 border-slate-800 active:border-b-0 active:translate-y-1' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}
                >
                  Guardar Cambios
                </button>
              </div>
            )}
          </header>

          {activeTab === 'perfil' && (
            <div className="space-y-6 md:space-y-12 animate-in fade-in duration-500">
              <section className="bg-white rounded-3xl md:rounded-[3rem] border border-slate-100 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] overflow-hidden p-5 md:p-14 flex flex-col lg:flex-row gap-6 md:gap-12">
                <div className="relative group shrink-0 mx-auto lg:mx-0">
                  <img className="w-48 h-48 rounded-3xl object-cover border-8 border-slate-50 shadow-2xl" src={localProfile.avatar || "https://picsum.photos/seed/doc/400/400"} alt="Avatar" />
                  <label className="absolute -bottom-2 -right-2 w-14 h-14 bg-primary text-white rounded-2xl shadow-xl cursor-pointer hover:scale-110 transition-transform flex items-center justify-center border-4 border-white">
                    <span className="material-icons-round text-2xl">photo_camera</span>
                    <input type="file" onChange={handleFileChange} className="hidden" />
                  </label>
                </div>

                <div className="flex-1 space-y-6 md:space-y-10">
                  <div className="p-6 bg-slate-100 rounded-2xl border-2 border-slate-200 shadow-inner">
                    <label className="text-xs font-black text-slate-800 uppercase tracking-widest block mb-3 ml-1">Slug Personalizado (URL)</label>
                    <div className="flex items-center bg-white border-2 border-slate-300 rounded-2xl px-6 py-4 shadow-sm group focus-within:ring-4 focus-within:ring-primary/10 transition-all">
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

                  {/* Visibilidad en búsqueda */}
                  <div className={`rounded-2xl p-5 border-2 flex items-center justify-between gap-4 ${localProfile.isPublic !== false ? 'bg-teal-50 border-teal-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`material-icons-round text-2xl shrink-0 ${localProfile.isPublic !== false ? 'text-teal-500' : 'text-slate-400'}`}>
                        {localProfile.isPublic !== false ? 'visibility' : 'visibility_off'}
                      </span>
                      <div className="min-w-0">
                        <p className="font-black text-slate-800 text-sm">Aparecer en búsqueda de pacientes</p>
                        <p className={`text-xs font-bold mt-0.5 ${localProfile.isPublic !== false ? 'text-teal-600' : 'text-slate-500'}`}>
                          {localProfile.isPublic !== false ? 'Tu perfil es visible para pacientes' : 'Tu perfil está oculto — los pacientes no pueden encontrarte'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUpdate({ isPublic: localProfile.isPublic === false ? true : false })}
                      className={`w-14 h-8 rounded-full relative transition-all shrink-0 ${localProfile.isPublic !== false ? 'bg-teal-500' : 'bg-slate-300'}`}
                    >
                      <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all ${localProfile.isPublic !== false ? 'left-7' : 'left-1'}`}></div>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Nombre Completo</label>
                      <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-5 px-6 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" type="text" value={localProfile.name} onChange={e => handleUpdate({ name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Especialidad</label>
                      <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-5 px-6 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" type="text" value={localProfile.specialty} onChange={e => handleUpdate({ specialty: e.target.value })} />
                    </div>
                  </div>

                  <div className="border-t-2 border-slate-100 pt-10">
                    <h3 className="text-2xl font-black text-black flex items-center gap-3 mb-6">
                      <span className="material-icons-round text-primary">payments</span>
                      Configuración de Pagos
                    </h3>
                    <div className="bg-slate-50 rounded-3xl p-8 border-2 border-slate-200 space-y-8">
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

                      {localProfile.paymentEnabled && (
                        <div className="space-y-6 animate-in slide-in-from-top-4 duration-300">
                          <div className="space-y-2">
                            <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Link de Cobro General / Servicios Completos</label>
                            <div className="flex items-center bg-white border-2 border-slate-300 rounded-2xl px-6 py-4 shadow-sm focus-within:ring-4 focus-within:ring-primary/10 transition-all">
                              <span className="material-icons-round text-slate-400 mr-3">link</span>
                              <input
                                className="flex-1 bg-transparent border-none p-0 font-bold text-black focus:ring-0 text-base"
                                placeholder="https://link.mercadopago.cl/tu-servicio-total"
                                value={localProfile.subscriptionLink || ''}
                                onChange={e => handleUpdate({ subscriptionLink: e.target.value })}
                              />
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Link de Bono de Reserva ($5.000)</label>
                            <div className="flex items-center bg-white border-2 border-slate-300 rounded-2xl px-6 py-4 shadow-sm focus-within:ring-4 focus-within:ring-primary/10 transition-all">
                              <span className="material-icons-round text-slate-400 mr-3">volunteer_activism</span>
                              <input
                                className="flex-1 bg-transparent border-none p-0 font-bold text-black focus:ring-0 text-base"
                                placeholder="https://www.flow.cl/app/pay.php?token=reserva5000"
                                value={localProfile.bookingPaymentLink || ''}
                                onChange={e => handleUpdate({ bookingPaymentLink: e.target.value })}
                              />
                            </div>
                            <p className="text-xs text-slate-500 font-bold ml-1">Este link será mostrado a los pacientes al momento de agendar para asegurar su cupo.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-[3rem] border border-slate-100 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] p-10 md:p-14 space-y-10">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-black text-black flex items-center gap-3">
                    <span className="material-icons-round text-primary">medical_services</span>
                    Mis Servicios y Tarifas
                  </h3>
                  <button
                    onClick={() => setShowServiceModal(true)}
                    className="bg-slate-900 text-white px-8 py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] border-b-4 border-slate-800 active:border-b-0 active:translate-y-1 transition-all flex items-center gap-2"
                  >
                    <span className="material-icons-round text-sm">add</span>
                    Nuevo Servicio
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {localProfile.services.map((service) => (
                    <div key={service.id} className="bg-slate-50 rounded-3xl p-8 border-2 border-slate-200 group hover:border-primary/30 transition-all flex flex-col justify-between relative overflow-hidden">
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
                      <div className="relative mt-8 flex items-end justify-between border-t-2 border-slate-100 pt-6">
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

              <section className="bg-white rounded-[3rem] border border-slate-100 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] p-10 md:p-14 space-y-10">
                <h3 className="text-2xl font-black text-black flex items-center gap-3">
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
            <div className="space-y-8 animate-in fade-in duration-500">

              {subscribedMsg && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex items-center gap-3">
                  <span className="material-icons-round text-emerald-500 text-xl shrink-0">check_circle</span>
                  <p className="text-sm text-emerald-800 font-semibold">¡Pago recibido! Tu suscripción se activará en los próximos minutos.</p>
                </div>
              )}

              {/* Hero card */}
              <div className={`rounded-[3rem] p-8 md:p-14 relative overflow-hidden text-white
                ${localProfile.subscriptionStatus === 'paused'
                  ? 'bg-rose-600 shadow-[0_48px_100px_-20px_rgba(220,38,38,0.4)]'
                  : localProfile.subscriptionStatus === 'trial' && daysLeft !== null && daysLeft <= 7
                  ? 'bg-amber-500 shadow-[0_48px_100px_-20px_rgba(245,158,11,0.4)]'
                  : 'bg-primary shadow-[0_48px_100px_-20px_rgba(19,91,236,0.4)]'}`}>

                <div className="flex flex-col md:flex-row gap-10 items-center relative z-10">
                  <div className="w-24 h-24 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 shadow-xl border border-white/30">
                    <span className="material-icons-round text-6xl text-white">
                      {localProfile.subscriptionStatus === 'paused' ? 'pause_circle' : localProfile.subscriptionStatus === 'trial' ? 'hourglass_top' : 'verified'}
                    </span>
                  </div>
                  <div className="flex-1 text-center md:text-left space-y-4">
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                      <h3 className="text-3xl md:text-4xl font-black tracking-tight">Estatus de Agenda Maslife</h3>
                      <span className="px-5 py-2 rounded-full bg-white/20 border border-white/30 text-white text-xs font-black uppercase tracking-[0.2em]">
                        {localProfile.subscriptionStatus === 'trial' ? 'Prueba Gratis'
                          : localProfile.subscriptionStatus === 'active' ? 'Activo'
                          : 'Pausado'}
                      </span>
                    </div>
                    <p className="text-white/90 font-semibold text-lg max-w-2xl leading-relaxed">
                      {localProfile.subscriptionStatus === 'trial'
                        ? `Tu acceso premium está activo hasta el ${localProfile.trialEndDate ? new Date(localProfile.trialEndDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : '---'}.`
                        : localProfile.subscriptionStatus === 'paused'
                          ? 'Tu perfil está pausado y no eres visible para nuevos pacientes. Regulariza tu pago para reactivarlo.'
                          : 'Tu suscripción está activa. Tu agenda es visible en toda la red MasLife.'}
                    </p>
                    {/* Countdown urgency banner */}
                    {localProfile.subscriptionStatus === 'trial' && daysLeft !== null && (
                      <div className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-black
                        ${daysLeft <= 3 ? 'bg-white text-red-600' : daysLeft <= 7 ? 'bg-white/20 text-white border border-white/30' : 'bg-white/10 text-white/80 border border-white/20'}`}>
                        <span className="material-icons-round text-base">timer</span>
                        {daysLeft === 0
                          ? '¡Tu período de prueba termina hoy!'
                          : daysLeft === 1
                          ? '¡Queda 1 día de prueba!'
                          : `Quedan ${daysLeft} días de prueba`}
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats grid */}
                <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-5 rounded-[1.5rem] bg-white/10 border border-white/20 backdrop-blur-md text-center">
                    <h4 className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">Próximo Cobro</h4>
                    <p className="text-xl font-black tracking-tight">
                      {localProfile.trialEndDate ? new Date(localProfile.trialEndDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '---'}
                    </p>
                  </div>
                  <div className="p-5 rounded-[1.5rem] bg-white/10 border border-white/20 backdrop-blur-md text-center">
                    <h4 className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">Días Restantes</h4>
                    <p className={`text-xl font-black tracking-tight ${daysLeft !== null && daysLeft <= 3 ? 'text-yellow-300' : ''}`}>
                      {daysLeft !== null ? `${daysLeft} días` : '---'}
                    </p>
                  </div>
                  <div className="p-5 rounded-[1.5rem] bg-white/10 border border-white/20 backdrop-blur-md text-center">
                    <h4 className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">Plan</h4>
                    <p className="text-xl font-black tracking-tight">Pro</p>
                  </div>
                  <div className="p-5 rounded-[1.5rem] bg-white/10 border border-white/20 backdrop-blur-md text-center">
                    <h4 className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">Mensual</h4>
                    <p className="text-xl font-black tracking-tight">$35.000</p>
                  </div>
                </div>

                {/* CTA footer */}
                <div className="mt-10 pt-10 border-t border-white/20 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-white text-base">security</span>
                    </div>
                    <p className="text-xs font-bold text-white/60 leading-relaxed uppercase">Pago Seguro vía<br/>Mercado Pago Chile</p>
                  </div>
                  <a
                    href={mpLinkWithBack}
                    className="w-full sm:w-auto px-12 py-5 bg-white text-primary border-b-4 border-slate-200 rounded-[2rem] font-black text-[12px] uppercase tracking-[0.3em] shadow-2xl active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-3"
                  >
                    <span className="material-icons-round">payment</span>
                    {localProfile.subscriptionStatus === 'paused' ? 'REACTIVAR SUSCRIPCIÓN' : 'PAGAR SUSCRIPCIÓN'}
                  </a>
                </div>

                <span className="material-icons absolute -bottom-12 -right-12 text-[250px] opacity-[0.07] rotate-12">card_membership</span>
              </div>

              {/* Incluido en tu plan */}
              <div className="bg-white rounded-[2rem] border border-slate-100 p-7 shadow-sm">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-5">Incluido en tu plan Pro</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { icon: 'calendar_month', label: 'Agenda inteligente ilimitada' },
                    { icon: 'group', label: 'Gestión de pacientes completa' },
                    { icon: 'payments', label: 'Control de finanzas y transacciones' },
                    { icon: 'notifications', label: 'Notificaciones automáticas' },
                    { icon: 'public', label: 'Perfil público en la red MasLife' },
                    { icon: 'support_agent', label: 'Soporte prioritario 24/7' },
                  ].map(f => (
                    <div key={f.icon} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                      <span className="material-icons-round text-primary text-lg">{f.icon}</span>
                      <span className="text-sm font-semibold text-slate-700">{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Soporte */}
              <div className="bg-white rounded-[2rem] border border-slate-100 p-7 shadow-sm">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-5">Soporte y Ayuda</h4>
                <div className="flex flex-col sm:flex-row gap-4">
                  <a
                    href={`https://wa.me/${SUPPORT_PHONE.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola MasLife! Soy ${localProfile.name} y necesito ayuda con mi cuenta.`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-3 p-5 rounded-[1.5rem] bg-[#25D366] text-white font-black text-sm hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-green-200"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current shrink-0">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Chatear con Soporte
                  </a>
                  <a
                    href={`mailto:soporte@maslife.cl?subject=Ayuda con mi cuenta - ${localProfile.name}`}
                    className="flex-1 flex items-center justify-center gap-3 p-5 rounded-[1.5rem] bg-slate-100 text-slate-700 font-black text-sm hover:bg-slate-200 active:scale-95 transition-all"
                  >
                    <span className="material-icons-round text-slate-500">mail</span>
                    Enviar Email
                  </a>
                </div>
                <p className="text-xs text-slate-400 text-center mt-4">Tiempo de respuesta: menos de 2 horas en horario hábil</p>
              </div>

            </div>
          )}
          {showServiceModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-[3rem] w-full max-w-xl shadow-2xl overflow-hidden border-2 border-slate-200">
                <div className="p-10 space-y-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-black text-black tracking-tight">Nuevo Servicio</h3>
                    <button onClick={() => setShowServiceModal(false)} className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all flex items-center justify-center">
                      <span className="material-icons-round">close</span>
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Nombre del Servicio</label>
                      <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-5 px-6 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" value={newService.name} onChange={e => setNewService({ ...newService, name: e.target.value })} placeholder="Ej: Consulta Médica General" />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Precio ($)</label>
                        <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-5 px-6 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" type="text" inputMode="numeric" value={newService.price || ''} onChange={e => setNewService({ ...newService, price: Number(e.target.value.replace(/\D/g, '')) || 0 })} placeholder="0" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Duración (Min)</label>
                        <select className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-5 px-6 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all appearance-none" value={newService.duration} onChange={e => setNewService({ ...newService, duration: Number(e.target.value) })}>
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
                      <textarea className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-5 px-6 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all min-h-[120px]" value={newService.description} onChange={e => setNewService({ ...newService, description: e.target.value })} placeholder="Describe brevemente de qué trata este servicio..." />
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

                  <div className="flex gap-4 pt-4">
                    <button onClick={() => setShowServiceModal(false)} className="flex-1 py-5 rounded-2xl bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
                    <button onClick={handleAddService} className="flex-1 py-5 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all">Crear Servicio</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal Editar Servicio */}
          {showEditServiceModal && editingService && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-[3rem] w-full max-w-xl shadow-2xl overflow-hidden border-2 border-slate-200">
                <div className="p-10 space-y-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-black text-black tracking-tight">Editar Servicio</h3>
                    <button onClick={() => setShowEditServiceModal(false)} className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all flex items-center justify-center">
                      <span className="material-icons-round">close</span>
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Nombre del Servicio</label>
                      <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-5 px-6 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" value={editingService.name} onChange={e => setEditingService({ ...editingService, name: e.target.value })} />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Precio ($)</label>
                        <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-5 px-6 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" type="text" inputMode="numeric" value={editingService.price || ''} onChange={e => setEditingService({ ...editingService, price: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Duración (Min)</label>
                        <select className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-5 px-6 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all appearance-none" value={editingService.duration} onChange={e => setEditingService({ ...editingService, duration: Number(e.target.value) })}>
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
                      <textarea className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-5 px-6 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all min-h-[100px]" value={editingService.description} onChange={e => setEditingService({ ...editingService, description: e.target.value })} />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Imagen del Servicio (opcional)</label>
                      {editingService.image && (
                        <img src={editingService.image} alt="preview" className="w-full h-32 object-cover rounded-2xl mb-2 border-2 border-slate-200" />
                      )}
                      <label className="flex items-center gap-3 cursor-pointer w-full bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl py-4 px-6 hover:border-primary hover:bg-primary/5 transition-all">
                        <span className="material-icons-round text-slate-400">add_photo_alternate</span>
                        <span className="text-sm font-bold text-slate-500">{editingService.image ? 'Cambiar imagen' : 'Subir imagen (máx. 5MB)'}</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => handleServiceImageChange(e, true)} />
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button onClick={() => setShowEditServiceModal(false)} className="flex-1 py-5 rounded-2xl bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
                    <button onClick={handleSaveEditService} className="flex-1 py-5 rounded-2xl bg-emerald-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2">
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
