import React, { useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { ProfessionalProfile, Service } from '../types';
import { useClinic } from '../ClinicContext';

const Settings: React.FC = () => {
  const { loggedPro, updateProfessional } = useClinic();
  const [profile, setProfile] = useState<ProfessionalProfile | null>(loggedPro);
  const [activeTab, setActiveTab] = useState<'general' | 'services' | 'subscription'>('general');
  const [saving, setSaving] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [serviceImage, setServiceImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  if (!loggedPro || !profile) return <Navigate to="/pro/login" />;

  const MP_SUBSCRIPTION_LINK = "https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=7e9fa964bb6d4ecd89058685ba8a5b34";
  const shareableLink = `https://clinicamaslife.cl/${profile.slug}`;

  const handleSave = async () => {
    setSaving(true);
    await new Promise(res => setTimeout(res, 800));
    if (profile) updateProfessional(profile);
    setSaving(false);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Permitir imágenes hasta 5MB (aumentado desde 500kb)
    if (file.size > 5 * 1024 * 1024) {
      alert('La imagen debe pesar menos de 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setProfile(prev => prev ? { ...prev, avatar: reader.result as string } : null);
    };
    reader.readAsDataURL(file);
  };

  const handleServiceImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      alert('La imagen debe pesar menos de 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setServiceImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveService = () => {
    if (!editingService) return;
    
    const updatedService = { ...editingService, image: serviceImage || editingService.image };
    
    setProfile(prev => {
      if (!prev) return null;
      const services = prev.services.map(s => s.id === updatedService.id ? updatedService : s);
      return { ...prev, services };
    });
    
    setShowServiceModal(false);
    setEditingService(null);
    setServiceImage(null);
  };

  const copyShareableLink = () => {
    navigator.clipboard.writeText(shareableLink);
    alert('¡Link copiado al portapapeles!');
  };

  return (
    <div className="flex-1 w-full h-full overflow-hidden bg-slate-50">
      <main className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="max-w-5xl mx-auto">
          <div className="mb-10">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Configuración</h1>
            <p className="text-slate-500 font-bold mt-2 text-sm">Gestiona tu perfil profesional y preferencias</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-8 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('general')}
              className={`px-6 py-3 font-black text-xs uppercase tracking-widest transition-all ${
                activeTab === 'general' 
                  ? 'border-b-4 border-teal-500 text-teal-600' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              General
            </button>
            <button
              onClick={() => setActiveTab('services')}
              className={`px-6 py-3 font-black text-xs uppercase tracking-widest transition-all ${
                activeTab === 'services' 
                  ? 'border-b-4 border-teal-500 text-teal-600' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Servicios
            </button>
            <button
              onClick={() => setActiveTab('subscription')}
              className={`px-6 py-3 font-black text-xs uppercase tracking-widest transition-all ${
                activeTab === 'subscription' 
                  ? 'border-b-4 border-teal-500 text-teal-600' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Suscripción
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'general' && (
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-lg space-y-8">
              {/* Avatar */}
              <div className="flex items-center gap-6">
                <div className="relative">
                  <img 
                    src={profile.avatar || 'https://picsum.photos/seed/placeholder/128/128'} 
                    alt="Avatar" 
                    className="w-28 h-28 rounded-3xl object-cover border-4 border-slate-100 shadow-xl"
                  />
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute -bottom-2 -right-2 w-10 h-10 bg-teal-500 text-white rounded-2xl flex items-center justify-center shadow-xl hover:bg-teal-600 transition-all"
                  >
                    <span className="material-icons-round text-lg">photo_camera</span>
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">{profile.name}</h3>
                  <p className="text-sm text-slate-500 font-bold">{profile.specialty}</p>
                  <p className="text-xs text-slate-400 mt-1">Máximo 5MB por imagen</p>
                </div>
              </div>

              {/* Link Compartible */}
              <div className="bg-gradient-to-br from-teal-50 to-blue-50 rounded-2xl p-6 border-2 border-teal-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <label className="text-xs font-black text-teal-700 uppercase tracking-wider mb-2 block">
                      <span className="material-icons-round text-sm align-middle mr-1">link</span>
                      Tu Link Único de Agenda
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={shareableLink}
                        readOnly
                        className="flex-1 bg-white border-2 border-teal-200 rounded-xl px-4 py-3 text-sm font-mono text-slate-700 focus:outline-none"
                      />
                      <button
                        onClick={copyShareableLink}
                        className="px-6 py-3 bg-teal-500 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-teal-600 transition-all shadow-lg"
                      >
                        <span className="material-icons-round text-sm">content_copy</span>
                      </button>
                    </div>
                    <p className="text-xs text-teal-600 font-bold mt-2">Comparte este link con tus pacientes para que agenden directamente contigo</p>
                  </div>
                </div>
              </div>

              {/* Otros campos generales */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Nombre</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={e => setProfile({ ...profile, name: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Email</label>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={e => setProfile({ ...profile, email: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Especialidad</label>
                  <input
                    type="text"
                    value={profile.specialty}
                    onChange={e => setProfile({ ...profile, specialty: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Ciudad</label>
                  <input
                    type="text"
                    value={profile.city}
                    onChange={e => setProfile({ ...profile, city: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Biografía</label>
                <textarea
                  value={profile.bio}
                  onChange={e => setProfile({ ...profile, bio: e.target.value })}
                  rows={4}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 focus:bg-white transition-all resize-none"
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-4 bg-teal-500 text-white rounded-2xl font-black text-sm hover:bg-teal-600 disabled:opacity-50 transition-all shadow-lg flex items-center justify-center gap-2"
              >
                {saving ? 'Guardando...' : 'Guardar Cambios'}
                <span className="material-icons-round text-sm">save</span>
              </button>
            </div>
          )}

          {activeTab === 'services' && (
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-lg">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-slate-900">Servicios y Tarifas</h2>
                <button className="px-6 py-3 bg-teal-500 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-teal-600 transition-all shadow-lg">
                  <span className="material-icons-round text-sm align-middle mr-1">add</span>
                  Agregar Servicio
                </button>
              </div>

              <div className="space-y-4">
                {profile.services.map(service => (
                  <div key={service.id} className="border-2 border-slate-100 rounded-2xl p-6 hover:border-teal-200 transition-all">
                    <div className="flex items-start gap-4">
                      {service.image && (
                        <img src={service.image} alt={service.name} className="w-20 h-20 rounded-xl object-cover border-2 border-slate-100" />
                      )}
                      <div className="flex-1">
                        <h3 className="text-lg font-black text-slate-900 mb-1">{service.name}</h3>
                        <p className="text-sm text-slate-600 mb-3">{service.description}</p>
                        <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
                          <span className="flex items-center gap-1">
                            <span className="material-icons-round text-sm">payments</span>
                            ${service.price.toLocaleString('es-CL')}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-icons-round text-sm">schedule</span>
                            {service.duration} min
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setEditingService(service);
                          setServiceImage(service.image || null);
                          setShowServiceModal(true);
                        }}
                        className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center hover:bg-teal-500 hover:text-white transition-all"
                      >
                        <span className="material-icons-round text-lg">edit</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'subscription' && (
            <div className="space-y-6">
              {/* Estado de Suscripción */}
              <div className="bg-gradient-to-br from-teal-500 to-blue-600 rounded-3xl p-8 text-white shadow-2xl">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <p className="text-sm font-bold text-white/80 uppercase tracking-wider mb-1">Estado de Cuenta</p>
                    <h2 className="text-3xl font-black">
                      {profile.subscriptionStatus === 'active' ? 'Suscripción Activa' :
                       profile.subscriptionStatus === 'trial' ? 'Prueba Gratuita' : 'Cuenta Pausada'}
                    </h2>
                  </div>
                  <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                    <span className="material-icons-round text-3xl">
                      {profile.subscriptionStatus === 'active' ? 'check_circle' : 
                       profile.subscriptionStatus === 'trial' ? 'event_available' : 'pause_circle'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Detalles */}
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-lg space-y-6">
                <h3 className="text-xl font-black text-slate-900 mb-4">Detalles de Facturación</h3>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Monto Mensual</p>
                    <p className="text-2xl font-black text-slate-900">$9.990 CLP</p>
                  </div>
                  
                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Próximo Pago</p>
                    <p className="text-2xl font-black text-slate-900">
                      {profile.nextBillingDate || '05 Mayo 2026'}
                    </p>
                  </div>

                  {profile.subscriptionStatus === 'trial' && profile.trialEndDate && (
                    <div className="md:col-span-2 bg-amber-50 rounded-2xl p-5 border-2 border-amber-200">
                      <p className="text-xs font-black text-amber-700 uppercase tracking-wider mb-2">Prueba Gratuita Finaliza</p>
                      <p className="text-2xl font-black text-amber-900">{profile.trialEndDate}</p>
                      <p className="text-sm text-amber-700 font-bold mt-2">Activa tu suscripción antes de esta fecha para no perder acceso</p>
                    </div>
                  )}
                </div>

                {/* Información Importante */}
                <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
                  <p className="text-xs font-black text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <span className="material-icons-round text-sm">info</span>
                    Información Importante
                  </p>
                  <p className="text-sm text-blue-900 font-bold leading-relaxed">
                    Si no se procesa el pago antes de la fecha indicada, tu cuenta quedará temporalmente deshabilitada. 
                    Podrás reactivarla regularizando tu suscripción.
                  </p>
                </div>

                {/* Botón de Pago */}
                <a
                  href={MP_SUBSCRIPTION_LINK}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full py-5 bg-teal-500 text-white rounded-2xl font-black text-sm hover:bg-teal-600 transition-all shadow-xl text-center"
                >
                  <span className="flex items-center justify-center gap-2">
                    <span className="material-icons-round">payment</span>
                    {profile.subscriptionStatus === 'active' ? 'Gestionar Suscripción' : 'Activar Suscripción Ahora'}
                  </span>
                </a>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal Editar Servicio */}
      {showServiceModal && editingService && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-900">Editar Servicio</h3>
              <button
                onClick={() => {
                  setShowServiceModal(false);
                  setEditingService(null);
                  setServiceImage(null);
                }}
                className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center hover:bg-rose-100 hover:text-rose-600 transition-all"
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Nombre del Servicio</label>
                <input
                  type="text"
                  value={editingService.name}
                  onChange={e => setEditingService({ ...editingService, name: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Descripción</label>
                <textarea
                  value={editingService.description}
                  onChange={e => setEditingService({ ...editingService, description: e.target.value })}
                  rows={3}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Precio (CLP)</label>
                  <input
                    type="number"
                    value={editingService.price}
                    onChange={e => setEditingService({ ...editingService, price: Number(e.target.value) })}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Duración (min)</label>
                  <input
                    type="number"
                    value={editingService.duration}
                    onChange={e => setEditingService({ ...editingService, duration: Number(e.target.value) })}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Imagen del Servicio (Opcional)</label>
                {serviceImage && (
                  <img src={serviceImage} alt="Preview" className="w-32 h-32 rounded-xl object-cover mb-3 border-2 border-slate-100" />
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleServiceImageChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
                >
                  <span className="material-icons-round text-sm align-middle mr-2">add_photo_alternate</span>
                  {serviceImage ? 'Cambiar Imagen' : 'Agregar Imagen'}
                </button>
                <p className="text-xs text-slate-400 mt-2">Máximo 5MB. JPG, PNG o WebP</p>
              </div>

              <button
                onClick={handleSaveService}
                className="w-full py-4 bg-teal-500 text-white rounded-2xl font-black text-sm hover:bg-teal-600 transition-all shadow-lg"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
