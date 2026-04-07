
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const MainHome: React.FC = () => {
  const navigate = useNavigate();
  const [showKinePlans, setShowKinePlans] = useState(false);
  const [showPlanForm, setShowPlanForm] = useState<{ isOpen: boolean; planName: string }>({ isOpen: false, planName: '' });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isGeneralFormOpen, setIsGeneralFormOpen] = useState(false);
  const [isContactFormOpen, setIsContactFormOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', condition: '' });
  const [contactData, setContactData] = useState({ name: '', phone: '', email: '', message: '' });

  const bgImages = [
    "https://images.unsplash.com/photo-1581056344415-3abb473d452c?q=80&w=2070",
    "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=80&w=2070",
    "https://images.unsplash.com/photo-1584515933487-779824d29309?q=80&w=2070",
    "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?q=80&w=2070"
  ];

  const [bgIndex, setBgIndex] = useState(0);
  const location = useLocation();

  useEffect(() => {
    if (location.state) {
      const state = location.state as { openContact?: boolean; openAgendar?: boolean };
      if (state.openContact) {
        setIsContactFormOpen(true);
      }
      if (state.openAgendar) {
        setIsGeneralFormOpen(true);
      }
      // Limpiamos el estado para que no se reabra al recargar o navegar atrás
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    const interval = setInterval(() => {
      setBgIndex((prev) => (prev + 1) % bgImages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [bgImages.length]);

  const services = [
    { name: 'Kinesiología', icon: 'accessibility_new', color: 'from-teal-400 to-teal-600', bg: 'bg-teal-50' },
    { name: 'Nutrición', icon: 'restaurant', color: 'from-orange-400 to-orange-600', bg: 'bg-orange-50' },
    { name: 'TENS', icon: 'medical_services', color: 'from-cyan-400 to-cyan-600', bg: 'bg-cyan-50' },
    { name: 'Psicología', icon: 'psychology', color: 'from-indigo-400 to-indigo-600', bg: 'bg-indigo-50' },
    { name: 'Terapeuta Ocupacional', icon: 'handyman', color: 'from-rose-400 to-rose-600', bg: 'bg-rose-50' },
    { name: 'Podología', icon: 'directions_walk', color: 'from-blue-400 to-blue-600', bg: 'bg-blue-50' },
    { name: 'Masoterapeuta', icon: 'spa', color: 'from-amber-400 to-amber-600', bg: 'bg-amber-50' },
  ];

  const kinePlans = [
    {
      name: 'PLAN ESENCIAL',
      price: '$120.500',
      desc: 'Para lesiones leves o mantenimiento preventivo.',
      color: 'border-slate-100',
      btnColor: 'border-slate-800 text-slate-800 hover:bg-slate-800 hover:text-white',
      features: ['5 Sesiones a Domicilio', 'Evaluación Kinesiológica', 'Diagnóstico Kinesiológico', 'Tratamiento Personalizado', 'Educación al paciente', 'Seguimiento 24/7 vía WhatsApp', 'Informe Kinesiológico Final']
    },
    {
      name: '+LIFE PRO',
      price: '$265.000',
      desc: 'Recuperación completa y asegurada con enfoque intensivo.',
      color: 'border-orange-500 ring-8 ring-orange-500/5 scale-105 z-10 shadow-2xl shadow-orange-500/20',
      btnColor: 'bg-orange-600 text-white hover:bg-orange-700',
      badge: 'PLAN MÁS SOLICITADO',
      features: ['10 Sesiones a Domicilio', 'Evaluación Kinesiológica Completa', 'Diagnóstico y Plan Avanzado', 'Tratamiento Personalizado', 'Seguimiento 24/7 vía WhatsApp', 'Material de Apoyo Digital', 'Informe Kinesiológico Final']
    },
    {
      name: 'PLAN PREMIUM',
      price: '$295.000',
      desc: 'Post-operatorios complejos y cuadros crónicos.',
      color: 'border-slate-100',
      btnColor: 'border-slate-800 text-slate-800 hover:bg-slate-800 hover:text-white',
      features: ['13 Sesiones a Domicilio', 'Evaluación Kinesiológica Completa', 'Tratamiento Intensivo', 'Seguimiento 24/7 vía WhatsApp', 'Evaluación Nutricional', 'Material de Apoyo Digital', 'Informe Kinesiológico Final Detallado']
    }
  ];

  const handleShowPlans = () => {
    setShowKinePlans(true);
    setTimeout(() => {
      document.getElementById('kine-plans')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleFormSubmit = (e: React.FormEvent, source: string) => {
    e.preventDefault();
    const message = `Hola Clínica Mas Life! Me interesa agendar una atención (${source}).\n\nMis datos:\nNombre: ${formData.name}\nWhatsApp: ${formData.phone}\nEmail: ${formData.email}\nCondición: ${formData.condition}`;
    window.open(`https://wa.me/56965329974?text=${encodeURIComponent(message)}`, '_blank');
    setShowPlanForm({ isOpen: false, planName: '' });
    setIsGeneralFormOpen(false);
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const message = `Hola Clínica Mas Life! Quiero que me contacten.\n\nMis datos:\nNombre: ${contactData.name}\nWhatsApp: ${contactData.phone}\nEmail: ${contactData.email}\nMensaje: ${contactData.message}`;
    window.open(`https://wa.me/56965329974?text=${encodeURIComponent(message)}`, '_blank');
    setIsContactFormOpen(false);
    setContactData({ name: '', phone: '', email: '', message: '' });
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-white font-sans scroll-smooth custom-scrollbar relative">
      
      {/* BOTÓN MENÚ HAMBURGUESA - REPOSICIONADO PARA NO INTERFERIR CON NAVBAR */}
      <button 
        onClick={() => setIsMenuOpen(true)}
        className="fixed top-24 right-8 z-[150] bg-slate-900/90 backdrop-blur-xl border border-white/20 w-16 h-16 rounded-[2rem] flex flex-col items-center justify-center gap-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] hover:scale-105 active:scale-95 transition-all group"
      >
        <div className="w-6 h-0.5 bg-white rounded-full group-hover:bg-[#ff6d00] transition-colors"></div>
        <div className="w-6 h-0.5 bg-white rounded-full group-hover:bg-[#ff6d00] transition-colors"></div>
        <div className="w-6 h-0.5 bg-white rounded-full group-hover:bg-[#ff6d00] transition-colors"></div>
      </button>

      {/* OVERLAY DEL MENÚ */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[200] flex justify-end animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)}></div>
          <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500 overflow-y-auto">
            
            {/* HEADER DEL MENÚ */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-8 pt-10 pb-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-[#ff6d00] w-10 h-10 rounded-[1rem] flex items-center justify-center shadow-lg shadow-orange-500/30">
                  <span className="material-icons-round text-white text-xl">medical_services</span>
                </div>
                <div>
                  <p className="text-white font-black text-sm leading-none">Clínica Mas Life</p>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">🧡 Portal Principal</p>
                </div>
              </div>
              <button 
                onClick={() => setIsMenuOpen(false)}
                className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
              >
                <span className="material-icons-round text-white text-xl">close</span>
              </button>
            </div>

            {/* SECCIÓN: PACIENTES */}
            <div className="px-6 pt-8 pb-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.35em] mb-4 ml-2">Para Pacientes</p>
              <div className="space-y-3">

                <button 
                  id="menu-buscar-profesionales"
                  onClick={() => { setIsMenuOpen(false); navigate('/patient/results'); }}
                  className="w-full text-left p-5 rounded-[1.5rem] bg-teal-50 border border-teal-100 hover:bg-teal-100 hover:border-teal-300 hover:shadow-lg transition-all group flex items-center gap-4"
                >
                  <div className="w-11 h-11 rounded-[1rem] bg-teal-500 flex items-center justify-center shadow-md shadow-teal-500/30 shrink-0 group-hover:rotate-6 transition-transform">
                    <span className="material-icons-round text-white text-xl">person_search</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 tracking-tight uppercase">Buscar Profesionales</p>
                    <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mt-0.5">Red verificada +Life</p>
                  </div>
                  <span className="material-icons-round text-teal-400 text-lg group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
                </button>

                <button 
                  id="menu-agendar"
                  onClick={() => { setIsMenuOpen(false); setIsGeneralFormOpen(true); }}
                  className="w-full text-left p-5 rounded-[1.5rem] bg-orange-50 border border-orange-100 hover:bg-orange-100 hover:border-orange-300 hover:shadow-lg transition-all group flex items-center gap-4"
                >
                  <div className="w-11 h-11 rounded-[1rem] bg-[#ff6d00] flex items-center justify-center shadow-md shadow-orange-500/30 shrink-0 group-hover:rotate-6 transition-transform">
                    <span className="material-icons-round text-white text-xl">calendar_month</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 tracking-tight uppercase">Agendar Atención</p>
                    <p className="text-xs font-bold text-orange-500 uppercase tracking-widest mt-0.5">Rápido vía WhatsApp</p>
                  </div>
                  <span className="material-icons-round text-orange-400 text-lg group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
                </button>

                <button 
                  id="menu-contactar"
                  onClick={() => { setIsMenuOpen(false); setIsContactFormOpen(true); }}
                  className="w-full text-left p-5 rounded-[1.5rem] bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-300 hover:shadow-lg transition-all group flex items-center gap-4"
                >
                  <div className="w-11 h-11 rounded-[1rem] bg-indigo-500 flex items-center justify-center shadow-md shadow-indigo-500/30 shrink-0 group-hover:rotate-6 transition-transform">
                    <span className="material-icons-round text-white text-xl">mark_email_unread</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 tracking-tight uppercase">Que me Contacten</p>
                    <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mt-0.5">Rellenar formulario</p>
                  </div>
                  <span className="material-icons-round text-indigo-400 text-lg group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
                </button>

              </div>
            </div>

            {/* DIVISOR */}
            <div className="mx-6 my-2 h-px bg-slate-100"></div>

            {/* SECCIÓN: ACCESO SISTEMA */}
            <div className="px-6 pt-4 pb-8">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.35em] mb-4 ml-2">Acceso al Sistema</p>
              <div className="space-y-3">

                <button 
                  id="menu-ingreso-profesional"
                  onClick={() => { setIsMenuOpen(false); navigate('/pro/login'); }}
                  className="w-full text-left p-5 rounded-[1.5rem] bg-slate-50 border border-slate-100 hover:bg-slate-100 hover:border-slate-300 hover:shadow-lg transition-all group flex items-center gap-4"
                >
                  <div className="w-11 h-11 rounded-[1rem] bg-slate-700 flex items-center justify-center shadow-md shadow-slate-700/30 shrink-0 group-hover:rotate-6 transition-transform">
                    <span className="material-icons-round text-white text-xl">badge</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 tracking-tight uppercase">Ingresar como Profesional</p>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Portal especialista</p>
                  </div>
                  <span className="material-icons-round text-slate-400 text-lg group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
                </button>

                <button 
                  id="menu-ingreso-admin"
                  onClick={() => { setIsMenuOpen(false); navigate('/admin/login'); }}
                  className="w-full text-left p-5 rounded-[1.5rem] bg-rose-50 border border-rose-100 hover:bg-rose-100 hover:border-rose-300 hover:shadow-lg transition-all group flex items-center gap-4"
                >
                  <div className="w-11 h-11 rounded-[1rem] bg-rose-600 flex items-center justify-center shadow-md shadow-rose-600/30 shrink-0 group-hover:rotate-6 transition-transform">
                    <span className="material-icons-round text-white text-xl">admin_panel_settings</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 tracking-tight uppercase">Ingresar como Admin</p>
                    <p className="text-xs font-bold text-rose-500 uppercase tracking-widest mt-0.5">Panel de administración</p>
                  </div>
                  <span className="material-icons-round text-rose-400 text-lg group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
                </button>

              </div>
            </div>

            {/* FOOTER DEL MENÚ */}
            <div className="mt-auto border-t border-slate-100 px-8 py-6">
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] text-center">© 2024 Clínica Mas Life 🧡 • Chile</p>
            </div>
          </div>
        </div>
      )}

      {/* HERO SECTION */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20 overflow-hidden">
        <div className="absolute inset-0 z-0">
          {bgImages.map((img, idx) => (
            <div key={idx} className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${idx === bgIndex ? 'opacity-100' : 'opacity-0'}`}>
              <img src={img} className="w-full h-full object-cover" alt="Background Gallery" />
            </div>
          ))}
          <div className="absolute inset-0 bg-[#0f172a]/75 backdrop-blur-[2px] bg-gradient-to-b from-[#0f172a]/90 via-[#1e293b]/70 to-white/5"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto flex flex-col items-center text-center space-y-10 px-4">
          <div className="bg-white/10 backdrop-blur-2xl text-white px-8 py-3 rounded-full border border-white/20 text-xs font-black uppercase tracking-[0.3em] flex items-center gap-3 animate-in slide-in-from-top-4 duration-1000">
            <span className="material-icons-round text-[#ff6d00] text-lg">verified_user</span>
            Servicios domiciliarios de alto estándar
          </div>

          <h1 className="text-6xl md:text-9xl font-black text-white leading-[0.95] tracking-tighter max-w-6xl animate-in zoom-in duration-1000">
            Profesionales con <br className="hidden md:block"/> 
            Sello <span className="text-[#ff6d00] drop-shadow-[0_0_30px_rgba(255,109,0,0.4)]">+LIFE</span>
          </h1>
          
          <p className="text-xl md:text-4xl text-slate-100 font-black max-w-4xl leading-snug animate-in fade-in duration-1000 delay-300 uppercase tracking-widest italic opacity-90">
            Mas empatía • Mas personalizado • Mas efectivo
          </p>
          
          <div className="flex flex-wrap justify-center gap-6 pt-10 animate-in slide-in-from-bottom-6 duration-1000 delay-500">
            <button 
              onClick={handleShowPlans} 
              className="bg-[#ff6d00] text-white px-14 py-6 rounded-full font-black text-xs uppercase tracking-[0.2em] shadow-[0_25px_60px_-15px_rgba(255,109,0,0.7)] hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
            >
              Ver mas planes
            </button>
            <button 
              onClick={() => navigate('/patient/results')} 
              className="bg-white/10 backdrop-blur-2xl text-white border-2 border-white/40 px-14 py-6 rounded-full font-black text-xs uppercase tracking-[0.2em] hover:bg-white hover:text-slate-900 transition-all active:scale-95 flex items-center gap-4"
            >
              <span className="material-icons-round text-base">search</span>
              buscar otros profesionales
            </button>
          </div>
        </div>
      </section>

      {/* SECCIÓN ¿CÓMO LO HACEMOS? */}
      <section className="px-6 py-40 md:px-24 bg-white relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-28 space-y-6">
            <h2 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tighter leading-none">¿Cómo lo hacemos?</h2>
            <p className="text-slate-500 font-bold text-xl md:text-2xl max-w-3xl mx-auto leading-relaxed italic opacity-80">Un camino diseñado para tu bienestar, sin fricciones.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {[
              { id: '1', title: 'Solicitud de Atención', desc: 'Recibimos tu solicitud, verificamos cobertura en tu ciudad y analizamos tus requerimientos clínicos.', icon: 'assignment_turned_in', color: 'from-teal-500 to-emerald-500' },
              { id: '2', title: 'Agendamiento Flexible', desc: 'Coordinamos la sesión en base a tu disponibilidad horaria y nuestra red de especialistas certificados.', icon: 'event_available', color: 'from-orange-500 to-amber-500' },
              { id: '3', title: 'Visita y Seguimiento', desc: 'El profesional asignado realiza la visita con equipamiento clínico y genera un plan de evolución continuo.', icon: 'medical_information', color: 'from-indigo-500 to-blue-500' }
            ].map((step) => (
              <div key={step.id} className="bg-slate-50/50 rounded-[4rem] p-12 border border-slate-100 relative group hover:bg-white hover:shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] transition-all duration-700 flex flex-col items-start overflow-hidden">
                <span className={`absolute -top-10 -right-4 text-[12rem] font-black opacity-[0.03] group-hover:opacity-10 transition-opacity bg-gradient-to-br ${step.color} bg-clip-text text-transparent`}>{step.id}</span>
                <div className={`w-20 h-20 bg-gradient-to-br ${step.color} text-white rounded-[1.8rem] flex items-center justify-center mb-10 shadow-2xl shadow-slate-200 group-hover:rotate-12 transition-transform`}>
                  <span className="material-icons-round text-4xl">{step.icon}</span>
                </div>
                <h4 className="text-2xl font-black text-slate-900 mb-6 uppercase tracking-tight leading-tight">{step.title}</h4>
                <p className="text-lg text-slate-600 leading-relaxed font-semibold">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLANES KINESIOLOGICOS - CONDICIONAL */}
      {showKinePlans && (
        <section id="kine-plans" className="px-6 py-40 md:px-24 bg-[#f8fafc] animate-in slide-in-from-bottom-10 duration-1000">
             <div className="max-w-7xl mx-auto">
                <div className="text-center mb-28 space-y-6">
                   <div className="bg-orange-600 text-white px-8 py-3 rounded-full inline-block text-xs font-black uppercase tracking-[0.3em] shadow-xl shadow-orange-600/20 mb-4">MÁXIMA EFECTIVIDAD</div>
                   <h2 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tighter leading-none">Planes Domiciliarios</h2>
                   <p className="text-slate-500 font-bold text-xl md:text-2xl max-w-3xl mx-auto leading-relaxed italic">Rehabilitación profesional en casa, reembolsable por seguros e Isapre.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-12 items-stretch">
                   {kinePlans.map((plan, i) => (
                     <div key={i} className={`bg-white rounded-[4rem] p-14 border-2 ${plan.color} flex flex-col h-full relative group hover:shadow-[0_50px_100px_-20px_rgba(0,0,0,0.12)] transition-all duration-700`}>
                        {plan.badge && (
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-10 py-3 rounded-full text-xs font-black uppercase tracking-[0.3em] shadow-2xl whitespace-nowrap">
                            {plan.badge}
                          </div>
                        )}
                        <div className="mb-14">
                          <h3 className="text-2xl font-black text-slate-900 mb-8 tracking-tight">{plan.name}</h3>
                          <div className="flex items-baseline gap-3 mb-6">
                             <span className="text-6xl font-black text-slate-900 tracking-tighter">{plan.price}</span>
                             <span className="text-sm font-black text-slate-500 uppercase tracking-widest">CLP</span>
                          </div>
                          <p className="text-lg text-slate-500 font-semibold leading-relaxed">{plan.desc}</p>
                        </div>

                        <ul className="space-y-6 mb-16 flex-1">
                           {plan.features.map((feat, idx) => (
                             <li key={idx} className="flex items-start gap-4 text-base font-bold text-slate-600 leading-relaxed">
                                <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center shrink-0 mt-0.5">
                                  <span className="material-icons-round text-sm">check</span>
                                </div>
                                {feat}
                             </li>
                           ))}
                        </ul>

                        <button 
                          onClick={() => setShowPlanForm({ isOpen: true, planName: plan.name })}
                          className={`w-full py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] border-2 transition-all active:scale-95 ${plan.btnColor} shadow-xl`}
                        >
                          {plan.badge ? 'Comenzar Rehabilitación' : `Solicitar ${plan.name.split(' ')[1]}`}
                        </button>
                     </div>
                   ))}
                </div>
             </div>
        </section>
      )}

      {/* ESPECIALIDADES MEJORADAS */}
      <section className="px-6 py-40 md:px-24 bg-white">
        <div className="max-w-7xl mx-auto space-y-28">
          <div className="text-center space-y-6">
            <h2 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tighter leading-none">Especialidades +Life</h2>
            <p className="text-slate-500 font-bold text-xl md:text-2xl max-w-3xl mx-auto opacity-80 italic">Profesionales certificados bajo estándares de calidad internacional.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-8">
            {services.map((s, i) => (
              <div key={i} className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-[0_15px_40px_-10px_rgba(0,0,0,0.05)] hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.12)] hover:-translate-y-4 transition-all flex flex-col items-center text-center group cursor-pointer relative overflow-hidden">
                <div className={`absolute inset-0 bg-gradient-to-br ${s.color} opacity-0 group-hover:opacity-[0.03] transition-opacity`}></div>
                <div className={`${s.bg} w-20 h-20 rounded-[1.8rem] flex items-center justify-center mb-8 group-hover:rotate-[15deg] transition-transform duration-500 shadow-inner`}>
                  <span className={`material-icons-round text-4xl bg-gradient-to-br ${s.color} bg-clip-text text-transparent`}>{s.icon}</span>
                </div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em] leading-tight group-hover:text-slate-900">{s.name}</h4>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIOS MARQUEE */}
      <section className="bg-slate-950 py-48 overflow-hidden relative">
         <div className="text-center mb-28 relative z-10 px-6 space-y-4">
            <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-[0.9]">
              Testimonios Reales <br/>
              <span className="text-[#ff6d00] drop-shadow-[0_0_20px_rgba(255,109,0,0.3)]">Resultados Efectivos</span>
            </h2>
         </div>
         
         <div className="flex gap-10 px-10 animate-marquee whitespace-nowrap">
            {[1,2,3,4,5,1,2,3,4,5].map((_, i) => (
              <div key={i} className="inline-block w-[450px] bg-white/5 backdrop-blur-3xl border border-white/10 p-16 rounded-[4rem] whitespace-normal flex-shrink-0 group hover:border-white/30 transition-colors">
                 <div className="flex gap-2 text-[#ff6d00] mb-10">
                    {[1,2,3,4,5].map(star => <span key={star} className="material-icons-round text-base">star</span>)}
                 </div>
                 <p className="text-slate-100 text-xl font-medium leading-relaxed italic mb-12 opacity-90">“Excelente atención, el profesional fue muy empático y puntual. Mi proceso de recuperación fue mucho más rápido de lo esperado.”</p>
                 <div className="space-y-2">
                    <p className="text-[#ff6d00] font-black text-sm uppercase tracking-[0.3em]">Ignacia Valenzuela</p>
                    <p className="text-slate-500 text-xs font-black uppercase tracking-[0.2em]">Rehabilitación de Rodilla</p>
                 </div>
              </div>
            ))}
         </div>
         <style>{`
           @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
           .animate-marquee { animation: marquee 50s linear infinite; }
         `}</style>
      </section>

      {/* FOOTER OFICIAL */}
      <footer className="bg-white border-t border-slate-100 pt-48 pb-16 px-6 md:px-24">
         <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-24 mb-32">
            <div className="space-y-12">
               <div className="flex items-center gap-4">
                  <div className="bg-teal-500 w-12 h-12 rounded-[1.2rem] flex items-center justify-center shadow-2xl shadow-teal-500/30">
                    <span className="material-icons-round text-white text-2xl">medical_services</span>
                  </div>
                  <span className="text-3xl font-black text-slate-900 tracking-tighter leading-none">Clínica Mas Life🧡</span>
               </div>
               <p className="text-slate-500 font-semibold text-lg leading-relaxed max-w-xs opacity-80">
                  Revolucionando el cuidado domiciliario con tecnología avanzada y calidez humana.
               </p>
               <div className="flex gap-5">
                  {['instagram', 'facebook', 'linkedin'].map(social => (
                    <div key={social} className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-500 hover:text-teal-500 hover:bg-teal-50 transition-all cursor-pointer shadow-sm">
                      <span className="material-icons-round text-xl">public</span>
                    </div>
                  ))}
               </div>
            </div>

            <div>
               <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.4em] mb-12 opacity-50">Navegación</h4>
               <ul className="space-y-6 text-slate-500 font-black text-xs uppercase tracking-[0.2em]">
                  <li className="hover:text-teal-600 cursor-pointer transition-colors" onClick={() => navigate('/patient/results')}>buscar otros profesionales</li>
                  <li className="hover:text-teal-600 cursor-pointer transition-colors">Convenios ISAPRE</li>
                  <li className="hover:text-teal-600 cursor-pointer transition-colors" onClick={() => navigate('/pro/login')}>Portal Profesional</li>
               </ul>
            </div>

            <div className="md:col-span-2">
               <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.4em] mb-12 opacity-50">Canales Directos</h4>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div className="bg-slate-50/50 p-10 rounded-[3rem] border border-slate-100 flex flex-col gap-6 hover:shadow-xl transition-all">
                     <span className="material-icons-round text-teal-500 text-4xl">chat</span>
                     <div>
                        <p className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-2">WhatsApp Oficial</p>
                        <p className="text-lg font-black text-slate-900">+56 9 6532 9974</p>
                     </div>
                  </div>
                  <div className="bg-slate-50/50 p-10 rounded-[3rem] border border-slate-100 flex flex-col gap-6 hover:shadow-xl transition-all">
                     <span className="material-icons-round text-orange-500 text-4xl">alternate_email</span>
                     <div>
                        <p className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Email Clínico</p>
                        <p className="text-lg font-black text-slate-900">clinicamaslife@gmail.com</p>
                     </div>
                  </div>
               </div>
            </div>
         </div>
         <div className="text-center pt-16 border-t border-slate-100">
            <p className="text-xs font-black text-slate-300 uppercase tracking-[0.6em]">© 2024 CLÍNICA MAS LIFE GLOBAL • CHILE</p>
         </div>
      </footer>

      {/* WHATSAPP FLOTANTE */}
      <a 
        href="https://wa.me/56965329974?text=Hola! Me gustaría hablar con un ejecutivo de Clínica Mas Life." 
        target="_blank" 
        rel="noreferrer"
        className="fixed bottom-10 right-10 z-[100] bg-[#25D366] text-white w-20 h-20 rounded-full shadow-[0_25px_60px_-10px_rgba(37,211,102,0.5)] hover:scale-110 active:scale-95 transition-all flex items-center justify-center group"
      >
        <div className="absolute inset-0 bg-[#25D366] animate-ping opacity-20 rounded-full"></div>
        <svg viewBox="0 0 24 24" className="w-10 h-10 fill-current" xmlns="http://www.w3.org/2000/svg">
          <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.767 5.767 0 1.267.408 2.438 1.103 3.394l-.717 2.63 2.7-.708c.846.541 1.847.851 2.923.851 3.181 0 5.767-2.586 5.767-5.767 0-3.181-2.586-5.767-5.767-5.767zm3.344 8.205c-.145.409-.838.74-1.164.786-.324.045-.72.079-2.315-.572-1.911-.781-3.142-2.723-3.238-2.85-.095-.126-.777-.963-.777-1.838s.454-1.306.616-1.467c.163-.162.355-.202.474-.202s.237.001.341.006c.108.005.253-.041.396.304.145.352.497 1.21.541 1.298.045.089.074.192.015.309-.059.117-.089.192-.178.297-.089.105-.187.234-.267.314s-.17.169-.074.335c.095.166.424.699.91 1.132.626.557 1.152.73 1.316.812.163.081.258.067.354-.044.095-.112.408-.48.517-.643.11-.163.22-.136.371-.081s.956.45 1.12.532c.164.081.274.121.314.192s.041.527-.104.935z"/>
          <path d="M19.057 4.298c-1.883-1.884-4.386-2.922-7.051-2.922-5.485 0-9.946 4.461-9.946 9.946 0 1.753.458 3.465 1.328 4.972l-1.41 5.148 5.268-1.381c1.458.794 3.097 1.213 4.76 1.213h.004c5.484 0 9.946-4.461 9.946-9.946 0-2.657-1.034-5.164-2.919-7.049l-.04-.04zm-7.051 15.352c-1.487 0-2.945-.399-4.216-1.155l-.302-.18-3.132.821.835-3.053-.198-.314c-.832-1.321-1.272-2.857-1.272-4.43 0-4.542 3.696-8.237 8.241-8.237 2.201 0 4.271.857 5.827 2.414s2.414 3.626 2.414 5.827c.001 4.542-3.695 8.237-8.238 8.237l-.059-.03z"/>
        </svg>
      </a>

      {/* MODAL FORMULARIO AGENDAR */}
      {(showPlanForm.isOpen || isGeneralFormOpen) && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[300] flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-xl rounded-[4rem] p-16 shadow-2xl animate-in zoom-in-95 duration-500">
              <div className="flex justify-between items-center mb-12">
                 <div className="flex items-center gap-4">
                   <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center">
                     <span className="material-icons-round text-[#ff6d00] text-2xl">calendar_month</span>
                   </div>
                   <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                      {showPlanForm.isOpen ? `Solicitud ${showPlanForm.planName}` : 'Agendar Atención'}
                   </h3>
                 </div>
                 <button 
                   onClick={() => { setShowPlanForm({ isOpen: false, planName: '' }); setIsGeneralFormOpen(false); }}
                   className="w-14 h-14 rounded-2xl hover:bg-slate-100 flex items-center justify-center transition-all"
                 >
                    <span className="material-icons-round">close</span>
                 </button>
              </div>
              
              <form onSubmit={(e) => handleFormSubmit(e, showPlanForm.isOpen ? showPlanForm.planName : 'Consulta General')} className="space-y-8">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Completo</label>
                       <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-5 px-6 font-bold text-sm" placeholder="Ej: Juan Pérez" />
                    </div>
                    <div className="space-y-3">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">WhatsApp</label>
                       <input required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-5 px-6 font-bold text-sm" placeholder="+56 9..." />
                    </div>
                    <div className="md:col-span-2 space-y-3">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Email</label>
                       <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-5 px-6 font-bold text-sm" placeholder="correo@ejemplo.com" />
                    </div>
                    <div className="md:col-span-2 space-y-3">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Condición o Motivo</label>
                       <textarea required value={formData.condition} onChange={e => setFormData({...formData, condition: e.target.value})} className="w-full bg-slate-50 border-none rounded-3xl py-6 px-8 font-medium text-sm h-40 resize-none" placeholder="Breve descripción de tu situación..." />
                    </div>
                 </div>
                 
                 <button type="submit" className="w-full py-7 bg-orange-600 text-white rounded-[2.5rem] font-black text-xs uppercase tracking-[0.3em] shadow-2xl shadow-orange-600/30 hover:scale-[1.02] transition-all">
                    VERIFICAR COBERTURA Y AGENDA
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* MODAL FORMULARIO CONTACTO */}
      {isContactFormOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[300] flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-xl rounded-[4rem] p-16 shadow-2xl animate-in zoom-in-95 duration-500">
              <div className="flex justify-between items-center mb-12">
                 <div className="flex items-center gap-4">
                   <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center">
                     <span className="material-icons-round text-indigo-600 text-2xl">mark_email_unread</span>
                   </div>
                   <div>
                     <h3 className="text-3xl font-black text-slate-900 tracking-tight">Contáctenos</h3>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Te llamamos a la brevedad</p>
                   </div>
                 </div>
                 <button 
                   onClick={() => setIsContactFormOpen(false)}
                   className="w-14 h-14 rounded-2xl hover:bg-slate-100 flex items-center justify-center transition-all"
                 >
                    <span className="material-icons-round">close</span>
                 </button>
              </div>
              
              <form onSubmit={handleContactSubmit} className="space-y-8">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Completo</label>
                       <input required value={contactData.name} onChange={e => setContactData({...contactData, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-5 px-6 font-bold text-sm" placeholder="Ej: María González" />
                    </div>
                    <div className="space-y-3">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">WhatsApp / Teléfono</label>
                       <input required value={contactData.phone} onChange={e => setContactData({...contactData, phone: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-5 px-6 font-bold text-sm" placeholder="+56 9..." />
                    </div>
                    <div className="md:col-span-2 space-y-3">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Email</label>
                       <input required type="email" value={contactData.email} onChange={e => setContactData({...contactData, email: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-5 px-6 font-bold text-sm" placeholder="correo@ejemplo.com" />
                    </div>
                    <div className="md:col-span-2 space-y-3">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">¿En qué te podemos ayudar?</label>
                       <textarea required value={contactData.message} onChange={e => setContactData({...contactData, message: e.target.value})} className="w-full bg-slate-50 border-none rounded-3xl py-6 px-8 font-medium text-sm h-40 resize-none" placeholder="Cuéntanos tu caso o consulta..." />
                    </div>
                 </div>
                 
                 <button type="submit" className="w-full py-7 bg-indigo-600 text-white rounded-[2.5rem] font-black text-xs uppercase tracking-[0.3em] shadow-2xl shadow-indigo-600/30 hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
                    <span className="material-icons-round text-base">send</span>
                    ENVIAR SOLICITUD DE CONTACTO
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default MainHome;
