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

  useEffect(() => {
    if (!profile) navigate('/pro/login');
    setLocalProfile(profile);
  }, [profile, navigate]);

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
      // Marcar como público si tiene datos mínimos completos
      if (profileToSave.name && profileToSave.specialty && profileToSave.services.length > 0) {
        profileToSave.isPublic = true;
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
    <div className="flex-1 w-full overflow-hidden bg-slate-50">
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
            <div className="space-y-12 animate-in fade-in duration-500">
              <section className="bg-white rounded-[3rem] border border-slate-100 shadow-[0_32px_64px_-16px_rgba(19,91,236,0.05)] overflow-hidden p-8 md:p-14 flex flex-col lg:flex-row gap-12">
                <div className="relative group shrink-0 mx-auto lg:mx-0">
                  <img className="w-48 h-48 rounded-3xl object-cover border-8 border-slate-50 shadow-2xl" src={localProfile.avatar || "https://picsum.photos/seed/doc/400/400"} alt="Avatar" />
                  <label className="absolute -bottom-2 -right-2 w-14 h-14 bg-primary text-white rounded-2xl shadow-xl cursor-pointer hover:scale-110 transition-transform flex items-center justify-center border-4 border-white">
                    <span className="material-icons-round text-2xl">photo_camera</span>
                    <input type="file" onChange={handleFileChange} className="hidden" />
                  </label>
                </div>

                <div className="flex-1 space-y-10">
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
                  <div className="p-5 bg-teal-50 border-2 border-teal-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-4">
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
                    <div className="flex gap-2 shrink-0">
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
                          const link = `https://clinicamaslife.cl/pro/${localProfile.slug || localProfile.id}`;
                          if (navigator.share) {
                            navigator.share({ title: `Agenda con ${localProfile.name}`, url: link });
                          } else {
                            window.open(`https://wa.me/?text=${encodeURIComponent(`Agenda conmigo en Clínica MasLife: ${link}`)}`, '_blank');
                          }
                        }}
                        className="px-5 py-2.5 rounded-xl bg-slate-800 text-white font-black text-xs uppercase tracking-widest hover:bg-slate-700 transition-all flex items-center gap-2"
                      >
                        <span className="material-icons-round text-sm">share</span>
                        Compartir
                      </button>
                    </div>
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
                      <div key={idx} className={`flex items-center justify-between p-6 rounded-2xl border-2 transition-all ${daySchedule.active ? 'border-primary/20 bg-primary/5' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                        <div className="flex items-center gap-4 w-32">
                          <button
                            onClick={() => {
                              const newSchedule = { ...(localProfile.schedule || {}) };
                              newSchedule[idx] = { ...daySchedule, active: !daySchedule.active };
                              handleUpdate({ schedule: newSchedule });
                            }}
                            className={`w-12 h-6 rounded-full relative transition-colors ${daySchedule.active ? 'bg-primary' : 'bg-slate-300'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${daySchedule.active ? 'left-7' : 'left-1'}`}></div>
                          </button>
                          <span className="text-sm font-black text-slate-900 uppercase tracking-widest">{dayName}</span>
                        </div>

                        {daySchedule.active && (
                          <div className="flex items-center gap-4">
                            <input
                              type="time"
                              value={daySchedule.start}
                              onChange={e => {
                                const newSchedule = { ...(localProfile.schedule || {}) };
                                newSchedule[idx] = { ...daySchedule, start: e.target.value };
                                handleUpdate({ schedule: newSchedule });
                              }}
                              className="bg-white border text-sm font-bold rounded-lg p-2 focus:ring-primary"
                            />
                            <span className="text-slate-500 font-bold">a</span>
                            <input
                              type="time"
                              value={daySchedule.end}
                              onChange={e => {
                                const newSchedule = { ...(localProfile.schedule || {}) };
                                newSchedule[idx] = { ...daySchedule, end: e.target.value };
                                handleUpdate({ schedule: newSchedule });
                              }}
                              className="bg-white border text-sm font-bold rounded-lg p-2 focus:ring-primary"
                            />
                          </div>
                        )}
                        {!daySchedule.active && <span className="text-xs font-black text-slate-500 uppercase tracking-widest">No Laboral</span>}
                      </div>
                    );
                  })}
                </div>
              </section>

            </div>
          )}

          {activeTab === 'suscripcion' && (
            <div className="space-y-10 animate-in fade-in duration-500">
              <div className="bg-primary rounded-[3rem] p-8 md:p-14 shadow-[0_48px_100px_-20px_rgba(19,91,236,0.4)] relative overflow-hidden text-white">
                <div className="flex flex-col md:flex-row gap-10 items-center relative z-10">
                  <div className="w-24 h-24 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 shadow-xl border border-white/30">
                    <span className="material-icons-round text-6xl text-white">
                      {localProfile.subscriptionStatus === 'paused' ? 'pause_circle' : 'verified'}
                    </span>
                  </div>
                  <div className="flex-1 text-center md:text-left space-y-6">
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                      <h3 className="text-4xl font-black tracking-tight">Estatus de Agenda Maslife</h3>
                      <span className="px-6 py-2 rounded-full bg-white text-primary text-xs font-black uppercase tracking-[0.2em] shadow-lg">
                        {localProfile.subscriptionStatus === 'trial' ? 'Prueba Gratis' : localProfile.subscriptionStatus.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-white/90 font-black text-xl max-w-2xl leading-relaxed">
                      {localProfile.subscriptionStatus === 'trial'
                        ? `Tu acceso premium está activo. Periodo de regalo hasta el ${new Date(localProfile.trialEndDate!).toLocaleDateString()}.`
                        : localProfile.subscriptionStatus === 'paused'
                          ? 'Tu perfil se encuentra pausado y no eres visible en la red. Regulariza tu pago para volver a recibir pacientes.'
                          : 'Tu suscripción profesional se encuentra activa y tu agenda está visible en todo Chile.'}
                    </p>
                  </div>
                </div>

                <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-8 rounded-[2rem] bg-white/10 border border-white/20 backdrop-blur-md shadow-inner group hover:bg-white hover:text-primary transition-all text-center">
                    <h4 className="text-xs font-black uppercase tracking-widest mb-3 opacity-70 group-hover:opacity-100">Próximo Cobro</h4>
                    <p className="text-3xl font-black tracking-tighter">{localProfile.trialEndDate ? new Date(localProfile.trialEndDate).toLocaleDateString() : '---'}</p>
                  </div>
                  <div className="p-8 rounded-[2rem] bg-white/10 border border-white/20 backdrop-blur-md shadow-inner group hover:bg-white hover:text-primary transition-all text-center">
                    <h4 className="text-xs font-black uppercase tracking-widest mb-3 opacity-70 group-hover:opacity-100">Suscripción Mensual</h4>
                    <p className="text-3xl font-black tracking-tighter">$35.000 <span className="text-xs font-black uppercase tracking-widest ml-1 opacity-50">/ mes</span></p>
                  </div>
                </div>

                <div className="mt-14 pt-14 border-t border-white/20 flex flex-col sm:flex-row items-center justify-between gap-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                      <span className="material-icons-round text-white">security</span>
                    </div>
                    <p className="text-xs font-black text-white/70 max-w-[200px] leading-relaxed uppercase">Pago Seguro vía Mercado Pago Chile</p>
                  </div>
                  <a
                    href={MP_SUBSCRIPTION_LINK}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full sm:w-auto px-16 py-6 bg-white text-primary border-b-4 border-slate-200 rounded-[2rem] font-black text-[12px] uppercase tracking-[0.3em] shadow-2xl active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-4"
                  >
                    PAGAR SUSCRIPCIÓN
                    <span className="material-icons-round">payment</span>
                  </a>
                </div>
                <span className="material-icons absolute -bottom-12 -right-12 text-[250px] opacity-[0.07] rotate-12">card_membership</span>
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
                        <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-5 px-6 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" type="number" value={newService.price} onChange={e => setNewService({ ...newService, price: Number(e.target.value) })} placeholder="0" />
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
                        <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-5 px-6 font-black text-base text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" type="number" value={editingService.price} onChange={e => setEditingService({ ...editingService, price: Number(e.target.value) })} />
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
