
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import logoClinica from '../assets/logo-clinica.png';

const HERO_IMAGES = [
  { src: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=900', alt: 'Kinesiólogo atendiendo paciente en rehabilitación física' },
  { src: 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?q=80&w=900', alt: 'Profesional de salud guiando ejercicio terapéutico' },
  { src: 'https://images.unsplash.com/photo-1573497019236-17f8177b81e8?q=80&w=900', alt: 'Psicóloga en consulta con paciente' },
  { src: 'https://images.unsplash.com/photo-1576671285-d9df3bc08e01?q=80&w=900', alt: 'Terapeuta ocupacional con paciente adulto mayor' },
];

const MainHome: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showKinePlans, setShowKinePlans] = useState(false);
  const [showPlanForm, setShowPlanForm] = useState<{ isOpen: boolean; planName: string }>({ isOpen: false, planName: '' });
  const [isGeneralFormOpen, setIsGeneralFormOpen] = useState(false);
  const [isContactFormOpen, setIsContactFormOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', condition: '' });
  const [contactData, setContactData] = useState({ name: '', phone: '', email: '', message: '' });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedNeed, setSelectedNeed] = useState('');
  const [activeSpecFilter, setActiveSpecFilter] = useState<'destacados' | 'todos'>('destacados');
  const [assignFormData, setAssignFormData] = useState({ name: '', contact: '', symptoms: '' });
  const [scrollY, setScrollY] = useState(0);
  const [heroPath, setHeroPath] = useState<'browse' | 'assign' | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const heroRef = useRef<HTMLElement>(null);

  // Scroll tracking for navbar
  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY || document.documentElement.scrollTop);
    const container = document.getElementById('main-home-scroll');
    if (container) {
      container.addEventListener('scroll', () => setScrollY(container.scrollTop));
    }
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (container) container.removeEventListener('scroll', () => {});
    };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset.reveal;
            if (id) setRevealed(prev => new Set([...prev, id]));
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    );
    setTimeout(() => {
      const cont = document.getElementById('main-home-scroll') || document.documentElement;
      cont.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
    }, 150);
    return () => observer.disconnect();
  }, []);

  const rv = (id: string, extra = '') =>
    `transition-all duration-700 ease-out ${extra} ${revealed.has(id) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`;

  useEffect(() => {
    if (location.state) {
      const state = location.state as { openContact?: boolean; openAgendar?: boolean };
      if (state.openContact) setIsContactFormOpen(true);
      if (state.openAgendar) setIsGeneralFormOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const services = [
    { name: 'Kinesiología', icon: 'accessibility_new', color: 'from-teal-400 to-teal-600', bg: 'bg-teal-50' },
    { name: 'Nutrición', icon: 'restaurant', color: 'from-orange-400 to-orange-600', bg: 'bg-orange-50' },
    { name: 'Téc. Enfermería', icon: 'medical_services', color: 'from-cyan-400 to-cyan-600', bg: 'bg-cyan-50' },
    { name: 'Psicología', icon: 'psychology', color: 'from-indigo-400 to-indigo-600', bg: 'bg-indigo-50' },
    { name: 'Terapeuta Ocupacional', icon: 'handyman', color: 'from-rose-400 to-rose-600', bg: 'bg-rose-50' },
    { name: 'Podología', icon: 'directions_walk', color: 'from-blue-400 to-blue-600', bg: 'bg-blue-50' },
    { name: 'Masoterapeuta', icon: 'spa', color: 'from-amber-400 to-amber-600', bg: 'bg-amber-50' },
  ];

  const specialtyCards = [
    {
      name: 'Kinesiología Integral',
      desc: 'Especialistas capacitados para rehabilitación integral y física.',
      img: 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?q=80&w=600',
      alt: 'Kinesiólogo guiando ejercicio de rehabilitación en Ovalle y Coquimbo',
      cta: 'Buscar Profesional'
    },
    {
      name: 'Psicología',
      desc: 'Especialistas en salud psicoemocional y bienestar mental.',
      img: 'https://images.unsplash.com/photo-1573497019236-17f8177b81e8?q=80&w=600',
      alt: 'Psicóloga escuchando a paciente en consulta presencial y online en La Serena',
      cta: 'Buscar profesional'
    },
    {
      name: 'Nutrición',
      desc: 'Planificación nutricional personalizada para hábitos saludables.',
      img: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?q=80&w=600',
      alt: 'Nutricionista consulta presencial y online en Región de Coquimbo',
      cta: 'Buscar Profesional'
    },
    {
      name: 'Fonoaudiología',
      desc: 'Especialistas en comunicación, habla y deglución.',
      img: 'https://images.unsplash.com/photo-1581056344415-3abb473d452c?q=80&w=600',
      alt: 'Fonoaudiólogo atendiendo paciente niño y adulto',
      cta: 'Ver Especialistas'
    }
  ];

  const kinePlans = [
    {
      name: 'PLAN ESENCIAL',
      price: '$120.500',
      desc: 'Para lesiones leves o mantenimiento preventivo.',
      color: 'border-slate-200',
      btnColor: 'border-slate-800 text-slate-800 hover:bg-slate-800 hover:text-white',
      features: ['5 Sesiones a Domicilio', 'Evaluación Kinesiológica', 'Diagnóstico Kinesiológico', 'Tratamiento Personalizado', 'Educación al paciente', 'Seguimiento 24/7 vía WhatsApp', 'Informe Kinesiológico Final']
    },
    {
      name: '+LIFE PRO',
      price: '$265.000',
      desc: 'Recuperación completa y asegurada con enfoque intensivo.',
      color: 'border-blue-500 ring-4 ring-blue-100 scale-[1.02] z-10 shadow-xl shadow-blue-500/10',
      btnColor: 'bg-blue-600 text-white hover:bg-blue-700',
      badge: 'MÁS SOLICITADO',
      features: ['10 Sesiones a Domicilio', 'Evaluación Kinesiológica Completa', 'Diagnóstico y Plan Avanzado', 'Tratamiento Personalizado', 'Seguimiento 24/7 vía WhatsApp', 'Material de Apoyo Digital', 'Informe Kinesiológico Final']
    },
    {
      name: 'PLAN PREMIUM',
      price: '$295.000',
      desc: 'Post-operatorios complejos y cuadros crónicos.',
      color: 'border-slate-200',
      btnColor: 'border-slate-800 text-slate-800 hover:bg-slate-800 hover:text-white',
      features: ['13 Sesiones a Domicilio', 'Evaluación Kinesiológica Completa', 'Tratamiento Intensivo', 'Seguimiento 24/7 vía WhatsApp', 'Evaluación Nutricional', 'Material de Apoyo Digital', 'Informe Kinesiológico Final Detallado']
    }
  ];

  const testimonials = [
    { text: 'Buscaba algo que no solo me diera una dieta, sino que entendiera mi relación con la comida. El equipo de nutrición ha sido mi mejor aliado este año.', name: 'Ricardo P.', role: 'PACIENTE DE NUTRICIÓN', stars: 5 },
    { text: 'Después de meses de ansiedad, encontré en mi psicóloga de +Life un espacio seguro y profesional. La asignación guiada fue increíblemente acertada.', name: 'Elena S.', role: 'PACIENTE PSICOLOGÍA', stars: 5 },
    { text: 'Siempre nos costó encontrar la especialista adecuada para su terapia de fonoaudiología y ha sido un alivio para toda la familia.', name: 'Javier M.', role: 'FAMILIAR DE PACIENTE', stars: 5 },
    { text: 'La atención domiciliaria de kinesiología fue increíble. Puntualidad, profesionalismo y sobre todo mucha empatía durante todo mi proceso de rehabilitación.', name: 'Carolina V.', role: 'PACIENTE KINESIOLOGÍA', stars: 5 },
    { text: 'Recomiendo a cualquiera que necesite atención de salud en casa. El sistema de asignación es muy eficiente y los profesionales son de primer nivel.', name: 'Miguel A.', role: 'PACIENTE GENERAL', stars: 5 },
    { text: 'Mi terapeuta ocupacional me ayudó a recuperar la independencia después de mi accidente. Eternamente agradecida con Mas Life.', name: 'Patricia L.', role: 'PACIENTE TERAPIA OCUPACIONAL', stars: 5 },
    { text: 'La consulta online fue tan profesional como una presencial. Muy cómodo para quienes trabajamos todo el día y no tenemos tiempo de ir a una clínica.', name: 'Andrés F.', role: 'PACIENTE ONLINE', stars: 5 },
    { text: 'Mi hijo de 4 años avanzó mucho más rápido con la fonoaudióloga de Mas Life. La paciencia y dedicación fueron extraordinarias.', name: 'Camila R.', role: 'MADRE DE PACIENTE', stars: 5 },
    { text: 'El seguimiento por WhatsApp después de cada sesión es un detalle que marca la diferencia. Te sientes acompañado todo el proceso.', name: 'Fernando G.', role: 'PACIENTE KINESIOLOGÍA', stars: 5 },
    { text: 'Probé con varios nutricionistas antes y ninguno entendió mis necesidades como la profesional que me asignaron aquí.', name: 'Valentina M.', role: 'PACIENTE DE NUTRICIÓN', stars: 5 },
    { text: 'La podóloga que me atendió fue muy profesional. Resolvió un problema que arrastraba hace meses en solo 3 sesiones.', name: 'Roberto C.', role: 'PACIENTE PODOLOGÍA', stars: 5 },
    { text: 'Excelente plataforma. Reservé en minutos y el profesional llegó puntual a mi domicilio. Así debería ser la salud siempre.', name: 'Isidora P.', role: 'PACIENTE DOMICILIO', stars: 5 },
    { text: 'Mi psicólogo de Mas Life me ayudó a manejar el estrés laboral de una forma que nunca imaginé posible. Gracias por existir.', name: 'Diego T.', role: 'PACIENTE PSICOLOGÍA', stars: 5 },
    { text: 'Después de la cirugía de rodilla, la rehabilitación domiciliaria fue clave. Los kinesiólogos de +Life son de otro nivel.', name: 'Marcela H.', role: 'PACIENTE POST-QUIRÚRGICO', stars: 5 },
    { text: 'Como persona mayor, valoro mucho que vengan a mi casa. El masajista fue muy respetuoso y profesional con mi tratamiento.', name: 'Jorge V.', role: 'PACIENTE MASOTERAPIA', stars: 5 },
  ];

  // Carrusel hero
  const [heroImageIdx, setHeroImageIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setHeroImageIdx(i => (i + 1) % HERO_IMAGES.length), 4000);
    return () => clearInterval(t);
  }, []);

  // Carrusel automático de testimonios
  const [testimonialIndex, setTestimonialIndex] = useState(0);
  const testimonialsPerView = typeof window !== 'undefined' && window.innerWidth < 768 ? 1 : 3;
  const maxIndex = Math.ceil(testimonials.length / testimonialsPerView) - 1;

  useEffect(() => {
    const timer = setInterval(() => {
      setTestimonialIndex(prev => prev >= maxIndex ? 0 : prev + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, [maxIndex]);

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

  const handleAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const need = selectedNeed || 'Consulta General';
    const message = `Hola Clínica Mas Life! Quiero que me asignen un profesional.\n\nÁrea: ${need}\nNombre: ${assignFormData.name}\nContacto: ${assignFormData.contact}\nSíntomas: ${assignFormData.symptoms}`;
    window.open(`https://wa.me/56965329974?text=${encodeURIComponent(message)}`, '_blank');
    setAssignFormData({ name: '', contact: '', symptoms: '' });
  };

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const needOptions = [
    { label: 'Salud Mental y Emocional', icon: 'psychology', value: 'Salud Mental y Emocional' },
    { label: 'Recuperación Física', icon: 'fitness_center', value: 'Recuperación Física' },
    { label: 'Hábitos y Nutrición', icon: 'restaurant', value: 'Hábitos y Nutrición' },
    { label: 'Consulta General', icon: 'local_hospital', value: 'Consulta General' },
  ];

  return (
    <div id="main-home-scroll" className="w-full h-full overflow-y-auto bg-white font-sans scroll-smooth relative">

      {/* ═══════════════════ NAVBAR ═══════════════════ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrollY > 50 ? 'bg-white/95 backdrop-blur-xl shadow-sm border-b border-slate-100' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 flex items-center justify-between h-20 sm:h-28">
          {/* Logo Clínica Mas Life */}
          <div className="flex items-center cursor-pointer shrink-0" onClick={() => scrollToSection('hero')}>
            <img
              src={logoClinica}
              alt="Clínica Mas Life"
              className="h-20 sm:h-28 w-auto object-contain"
              onError={(e) => {
                // Fallback si no carga la imagen
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
              }}
            />
            <span className={`hidden text-xl sm:text-2xl font-extrabold tracking-tight transition-colors text-slate-900`}>
              Mas<span className="text-blue-600">life</span>
            </span>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-10">
            <button onClick={() => scrollToSection('como-funciona')} className={`text-sm font-semibold transition-colors ${scrollY > 50 ? 'text-slate-600 hover:text-blue-600' : 'text-slate-700 hover:text-blue-600'}`}>
              Cómo funciona
            </button>
            <button onClick={() => scrollToSection('especialidades')} className={`text-sm font-semibold transition-colors ${scrollY > 50 ? 'text-slate-600 hover:text-blue-600' : 'text-slate-700 hover:text-blue-600'}`}>
              Profesionales
            </button>
            <button onClick={handleShowPlans} className={`text-sm font-semibold transition-colors ${scrollY > 50 ? 'text-slate-600 hover:text-blue-600' : 'text-slate-700 hover:text-blue-600'}`}>
              Planes
            </button>
            <button onClick={() => navigate('/pro/login')} className="bg-blue-600 text-white px-6 py-2.5 rounded-full text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30">
              Portal Profesional
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors">
            <span className="material-icons-round text-slate-700">{mobileMenuOpen ? 'close' : 'menu'}</span>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 shadow-xl animate-in slide-in-from-top-2 duration-200">
            <div className="px-6 py-4 space-y-1">
              <button onClick={() => scrollToSection('como-funciona')} className="w-full text-left py-3 text-sm font-semibold text-slate-700 hover:text-blue-600">Cómo funciona</button>
              <button onClick={() => scrollToSection('especialidades')} className="w-full text-left py-3 text-sm font-semibold text-slate-700 hover:text-blue-600">Profesionales</button>
              <button onClick={() => { handleShowPlans(); setMobileMenuOpen(false); }} className="w-full text-left py-3 text-sm font-semibold text-slate-700 hover:text-blue-600">Planes</button>
              <button onClick={() => { navigate('/pro/login'); setMobileMenuOpen(false); }} className="w-full mt-2 bg-blue-600 text-white py-3 rounded-xl text-sm font-bold text-center">Portal Profesional</button>
            </div>
          </div>
        )}
      </nav>

      {/* ═══════════════════ HERO SECTION ═══════════════════ */}
      <section ref={heroRef} id="hero" className="relative min-h-screen flex items-center overflow-hidden">
        {/* Carrusel de imágenes de fondo */}
        {HERO_IMAGES.map((img, idx) => (
          <img
            key={idx}
            src={img.src}
            alt={img.alt}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out ${idx === heroImageIdx ? 'opacity-100' : 'opacity-0'}`}
          />
        ))}
        {/* Overlays para legibilidad del texto */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/85 via-slate-900/55 to-slate-900/15 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/40 via-transparent to-slate-900/25 pointer-events-none" />

        {/* Contenido */}
        <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 pt-28 sm:pt-36 pb-20 sm:pb-28 w-full">
          <div className="max-w-2xl space-y-8">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm text-white border border-white/25 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider">
              <span className="material-icons-round text-sm">verified</span>
              Tu salud nos importa
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] tracking-tight">
              Kinesiología &amp; Salud<br />
              Con Profesionales<br />
              Más cercanos &amp;<br />
              <span className="text-blue-400">empáticos.</span>
            </h1>

            <p className="text-white/75 text-sm leading-relaxed max-w-sm">
              Kinesiólogos, psicólogos, nutricionistas y quiroprácticos en{' '}
              <strong className="text-white">Ovalle, Coquimbo y La Serena</strong>.
              Atención presencial, online y a domicilio.
            </p>

            {/* 2-Path Choice */}
            <div className="space-y-4 max-w-lg">
              <p className="text-sm font-bold text-white/70">¿Cómo prefieres comenzar?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Path A: Browse */}
                <button
                  onClick={() => navigate('/patient/results')}
                  className="group p-6 bg-white/10 backdrop-blur-sm rounded-3xl border border-white/20 hover:bg-white/20 hover:border-white/40 shadow-lg transition-all duration-300 text-left"
                >
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <span className="material-icons-round text-white text-2xl">search</span>
                  </div>
                  <h3 className="font-extrabold text-white text-sm mb-1 leading-tight">Explorar Especialistas</h3>
                  <p className="text-white/60 text-xs font-medium leading-relaxed mb-4">Filtra por área, ciudad y modalidad. Tú eliges a tu profesional.</p>
                  <div className="flex items-center gap-1.5 text-blue-300 text-xs font-bold group-hover:gap-3 transition-all">
                    Ver especialistas <span className="material-icons-round text-sm">arrow_forward</span>
                  </div>
                </button>

                {/* Path B: Agent assignment */}
                <button
                  onClick={() => setHeroPath(heroPath === 'assign' ? null : 'assign')}
                  className={`group p-6 rounded-3xl border shadow-lg transition-all duration-300 text-left ${
                    heroPath === 'assign'
                      ? 'bg-blue-600 border-blue-500 shadow-blue-600/40'
                      : 'bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/20 hover:border-white/40'
                  }`}
                >
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <span className="material-icons-round text-white text-2xl">auto_awesome</span>
                  </div>
                  <h3 className="font-extrabold text-white text-sm mb-1 leading-tight">Ser Asignado</h3>
                  <p className="text-white/60 text-xs font-medium leading-relaxed mb-4">
                    Cuéntanos tu situación y te asignamos al profesional ideal.
                  </p>
                  <div className="flex items-center gap-1.5 text-blue-300 text-xs font-bold group-hover:gap-3 transition-all">
                    {heroPath === 'assign' ? 'Cerrar formulario' : 'Comenzar'}
                    <span className="material-icons-round text-sm">{heroPath === 'assign' ? 'keyboard_arrow_up' : 'arrow_forward'}</span>
                  </div>
                </button>
              </div>

              {/* Inline assignment form */}
              {heroPath === 'assign' && (
                <div className="animate-in slide-in-from-top-4 duration-300">
                  <form onSubmit={handleAssignSubmit} className="bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 shadow-xl p-6 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
                        <span className="material-icons-round text-white text-xs">auto_awesome</span>
                      </div>
                      <p className="text-sm font-bold text-white">Te asignamos al profesional ideal</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {needOptions.map(opt => (
                        <button type="button" key={opt.value} onClick={() => setSelectedNeed(opt.value)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                            selectedNeed === opt.value
                              ? 'border-blue-400 bg-blue-600/60 text-white'
                              : 'border-white/20 bg-white/10 text-white/70 hover:border-white/40'
                          }`}
                        >
                          <span className={`material-icons-round text-sm ${selectedNeed === opt.value ? 'text-blue-300' : 'text-white/50'}`}>{opt.icon}</span>
                          <span className="leading-tight">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                    <input required value={assignFormData.name} onChange={e => setAssignFormData({ ...assignFormData, name: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-2xl py-3 px-4 text-sm font-medium text-white placeholder:text-white/40 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                      placeholder="Tu nombre..." />
                    <input required value={assignFormData.contact} onChange={e => setAssignFormData({ ...assignFormData, contact: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-2xl py-3 px-4 text-sm font-medium text-white placeholder:text-white/40 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                      placeholder="WhatsApp o email de contacto..." />
                    <textarea required value={assignFormData.symptoms} onChange={e => setAssignFormData({ ...assignFormData, symptoms: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-2xl py-3 px-4 text-sm font-medium text-white placeholder:text-white/40 focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none h-20"
                      placeholder="¿Qué necesitas? Describe brevemente tu situación..." />
                    <button type="submit" className="w-full py-3.5 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2">
                      <span className="material-icons-round text-base">send</span>
                      Enviar y ser contactado por WhatsApp
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dots del carrusel */}
        <div className="absolute bottom-8 right-8 z-10 flex gap-2">
          {HERO_IMAGES.map((_, idx) => (
            <button key={idx} onClick={() => setHeroImageIdx(idx)}
              className={`rounded-full transition-all duration-300 ${idx === heroImageIdx ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/50 hover:bg-white/80'}`}
            />
          ))}
        </div>
      </section>

      {/* ═══════════════════ STATS BAR ═══════════════════ */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 py-10 px-5 sm:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { num: '500+', label: 'Sesiones Realizadas', icon: 'event_available' },
            { num: '8', label: 'Especialidades Médicas', icon: 'medical_services' },
            { num: '4.9★', label: 'Satisfacción Promedio', icon: 'star' },
            { num: 'Chile', label: 'Online · Presencial · Domicilio', icon: 'location_on' },
          ].map((stat, i) => (
            <div key={i} data-reveal={`stat-${i}`} className={`text-center text-white ${rv(`stat-${i}`, `delay-${i*100}`)}`} style={{ transitionDelay: `${i * 100}ms` }}>
              <span className="material-icons-round text-blue-200 text-2xl mb-2 block">{stat.icon}</span>
              <p className="text-3xl sm:text-4xl font-black tracking-tight">{stat.num}</p>
              <p className="text-xs font-bold text-blue-100 uppercase tracking-wider mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════ COMO FUNCIONA ═══════════════════ */}
      <section id="como-funciona" className="px-5 sm:px-8 py-20 sm:py-28 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-4">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em] mb-3">PROCESO SIMPLE</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">¿CÓMO FUNCIONA?</h2>
            <p className="text-slate-500 font-medium text-base sm:text-lg max-w-2xl mx-auto mt-4 leading-relaxed">
              Contamos con distintas modalidades para que puedas recibir atención desde la comodidad de tu hogar o en tu ciudad.
            </p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.15em] mt-2">MODALIDAD DOMICILIARIA · ONLINE · PRESENCIAL</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 mt-14">
            {[
              { icon: 'assignment', title: 'RELLENAS FORMULARIO', desc: 'Rellenas el formulario con tu información y requerimiento.', color: 'bg-violet-100 text-violet-600' },
              { icon: 'groups', title: 'ASIGNACIÓN PROFESIONAL', desc: 'Un agente revisa tu información y te asigna un profesional apto a tus requerimientos.', color: 'bg-blue-100 text-blue-600' },
              { icon: 'event_available', title: 'CITA PROFESIONAL', desc: 'El profesional asignado te contacta y coordina con una primera cita.', color: 'bg-rose-100 text-rose-600' }
            ].map((step, i) => (
              <div key={i} data-reveal={`step-${i}`} className={`bg-white rounded-2xl sm:rounded-3xl p-8 sm:p-10 border border-slate-100 hover:border-slate-200 hover:shadow-lg text-center group ${rv(`step-${i}`)}`} style={{ transitionDelay: `${i * 150}ms` }}>
                <div className={`w-14 h-14 sm:w-16 sm:h-16 ${step.color} rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform`}>
                  <span className="material-icons-round text-2xl sm:text-3xl">{step.icon}</span>
                </div>
                <h4 className="text-sm sm:text-base font-extrabold text-slate-900 mb-3 tracking-tight">{step.title}</h4>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ ÁREAS PROFESIONALES ═══════════════════ */}
      <section id="especialidades" className="px-5 sm:px-8 py-20 sm:py-28 bg-slate-50/50">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-12 gap-4">
            <div>
              <p className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em] mb-2">NUESTRO EQUIPO</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Selecciona un área y agenda</h2>
              <p className="text-sm text-slate-500 font-medium mt-1">con un profesional directamente</p>
              <p className="text-xs text-slate-400 mt-1">Rehabilitación · Dolor lumbar · Tendinitis · Salud mental · Nutrición · Región de Coquimbo</p>
            </div>
            <div className="flex bg-white rounded-full p-1 border border-slate-200 shadow-sm">
              <button
                onClick={() => setActiveSpecFilter('destacados')}
                className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${activeSpecFilter === 'destacados' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Destacados
              </button>
              <button
                onClick={() => setActiveSpecFilter('todos')}
                className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${activeSpecFilter === 'todos' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Todos
              </button>
            </div>
          </div>

          {/* Specialty Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {(activeSpecFilter === 'destacados' ? specialtyCards : specialtyCards.concat([
              { name: 'Terapia Ocupacional', desc: 'Rehabilitación funcional para actividades diarias.', img: 'https://images.unsplash.com/photo-1576671285-d9df3bc08e01?q=80&w=600', alt: 'Terapeuta ocupacional con paciente adulto mayor en rehabilitación', cta: 'Buscar Profesional' },
              { name: 'Podología', desc: 'Cuidado especializado de pies y extremidades.', img: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=80&w=600', alt: 'Podólogo cuidado especializado de pies en Ovalle', cta: 'Buscar Profesional' },
              { name: 'Téc. Enfermería (TENS)', desc: 'Técnicos en enfermería para cuidados especializados.', img: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?q=80&w=600', alt: 'Enfermera tomando signos vitales atención a domicilio', cta: 'Buscar Profesional' },
            ])).map((card, i) => (
              <div key={i} className="group bg-white rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-100 hover:shadow-xl hover:border-slate-200 transition-all duration-300 cursor-pointer" onClick={() => navigate('/patient/results')}>
                <div className="aspect-[4/3] overflow-hidden">
                  <img src={card.img} alt={card.alt || card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-4 sm:p-5">
                  <h4 className="text-sm sm:text-base font-extrabold text-slate-900 mb-1 tracking-tight">{card.name}</h4>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed mb-3 line-clamp-2">{card.desc}</p>
                  <button className="flex items-center gap-1.5 text-blue-600 text-xs font-bold hover:gap-2.5 transition-all">
                    {card.cta}
                    <span className="material-icons-round text-sm">arrow_forward</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* All Services Grid (compact) */}
          {activeSpecFilter === 'todos' && (
            <div className="mt-10 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-4">
              {services.map((s, i) => (
                <div key={i} className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 hover:shadow-md hover:-translate-y-1 transition-all flex flex-col items-center text-center cursor-pointer group" onClick={() => navigate('/patient/results')}>
                  <div className={`${s.bg} w-12 h-12 rounded-xl flex items-center justify-center mb-3 group-hover:rotate-12 transition-transform`}>
                    <span className={`material-icons-round text-2xl bg-gradient-to-br ${s.color} bg-clip-text text-transparent`}>{s.icon}</span>
                  </div>
                  <h4 className="text-[10px] sm:text-xs font-bold text-slate-700 leading-tight">{s.name}</h4>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════ ASIGNACIÓN PROFESIONAL ═══════════════════ */}
      <section className="px-5 sm:px-8 py-20 sm:py-28 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-3xl sm:rounded-[2rem] border border-slate-200 p-8 sm:p-12 shadow-xl shadow-slate-200/30 relative overflow-hidden">
            {/* Decorative */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-blue-50 rounded-full blur-2xl opacity-60 translate-x-1/3 -translate-y-1/3"></div>

            <div className="text-center mb-8 relative z-10">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-2">¿Te asignamos un profesional?</h2>
              <p className="text-sm text-slate-500 font-medium max-w-md mx-auto">Deja tus datos y un curador clínico analizará tu consulta guiada para asignarte al profesional ideal en menos de 24 horas.</p>
            </div>

            <form onSubmit={handleAssignSubmit} className="space-y-4 relative z-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5 ml-1">Tu nombre</label>
                  <input
                    required
                    value={assignFormData.name}
                    onChange={e => setAssignFormData({ ...assignFormData, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="Ej. Sofía Martínez"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5 ml-1">Tu contacto</label>
                  <input
                    required
                    value={assignFormData.contact}
                    onChange={e => setAssignFormData({ ...assignFormData, contact: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="hola@ejemplo.com"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5 ml-1">Comparte tus inquietudes o síntomas actuales</label>
                <textarea
                  required
                  value={assignFormData.symptoms}
                  onChange={e => setAssignFormData({ ...assignFormData, symptoms: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent h-24 resize-none transition-all"
                  placeholder="¿Qué te gustaría cambiar o controlar en tu salud?"
                />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2">
                Confirmar Asignación Profesional
              </button>
              <p className="text-center text-[11px] text-slate-400 font-medium">Atención: nuestros agentes y tu expediente médico base para la mejor recomendación posible.</p>
            </form>
          </div>
        </div>
      </section>

      {/* ═══════════════════ PLANES KINESIOLÓGICOS (CONDICIONAL) ═══════════════════ */}
      {showKinePlans && (
        <section id="kine-plans" className="px-5 sm:px-8 py-20 sm:py-28 bg-slate-50 animate-in slide-in-from-bottom-8 duration-700">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider mb-4 shadow-lg shadow-blue-600/20">
                <span className="material-icons-round text-sm">star</span>
                Máxima Efectividad
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">Planes Domiciliarios</h2>
              <p className="text-slate-500 font-medium text-base sm:text-lg max-w-2xl mx-auto mt-4">Rehabilitación profesional en casa, reembolsable por seguros e Isapre.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-stretch">
              {kinePlans.map((plan, i) => (
                <div key={i} className={`bg-white rounded-3xl p-8 sm:p-10 border-2 ${plan.color} flex flex-col h-full relative group hover:shadow-xl transition-all duration-300`}>
                  {plan.badge && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-lg whitespace-nowrap">
                      {plan.badge}
                    </div>
                  )}
                  <div className="mb-8">
                    <h3 className="text-lg font-extrabold text-slate-900 mb-4 tracking-tight">{plan.name}</h3>
                    <p className="text-sm text-slate-500 font-medium">{plan.desc}</p>
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-center gap-3 text-sm font-medium text-slate-600">
                        <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                          <span className="material-icons-round text-xs">check</span>
                        </div>
                        {feat}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => setShowPlanForm({ isOpen: true, planName: plan.name })}
                    className={`w-full py-4 rounded-2xl font-bold text-sm border-2 transition-all active:scale-95 ${plan.btnColor}`}
                  >
                    {plan.badge ? 'Comenzar Rehabilitación' : `Solicitar Plan`}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════ TESTIMONIOS CARRUSEL ═══════════════════ */}
      <section className="px-5 sm:px-8 py-20 sm:py-28 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em] mb-2">TESTIMONIOS REALES</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Lo que dicen nuestros pacientes</h2>
          </div>

          {/* Carrusel */}
          <div className="relative">
            <div className="overflow-hidden">
              <div
                className="flex transition-transform duration-700 ease-in-out"
                style={{ transform: `translateX(-${testimonialIndex * 100}%)` }}
              >
                {Array.from({ length: maxIndex + 1 }).map((_, pageIdx) => (
                  <div key={pageIdx} className="w-full flex-shrink-0 grid grid-cols-1 md:grid-cols-3 gap-5 px-1">
                    {testimonials.slice(pageIdx * testimonialsPerView, pageIdx * testimonialsPerView + testimonialsPerView).map((t, i) => (
                      <div key={i} className="bg-slate-50 rounded-2xl p-6 sm:p-7 border border-slate-100">
                        <div className="flex gap-0.5 text-amber-400 mb-4">
                          {Array.from({ length: t.stars }).map((_, s) => (
                            <span key={s} className="material-icons-round text-sm">star</span>
                          ))}
                        </div>
                        <p className="text-sm text-slate-700 font-medium leading-relaxed mb-5 italic line-clamp-4">"{t.text}"</p>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-blue-600 font-bold text-xs">{t.name.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{t.name}</p>
                            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{t.role}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Indicadores */}
            <div className="flex justify-center gap-2 mt-8">
              {Array.from({ length: maxIndex + 1 }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setTestimonialIndex(i)}
                  className={`h-2 rounded-full transition-all duration-300 ${i === testimonialIndex ? 'w-8 bg-blue-600' : 'w-2 bg-slate-300 hover:bg-slate-400'}`}
                />
              ))}
            </div>

            {/* Flechas */}
            <button
              onClick={() => setTestimonialIndex(prev => prev > 0 ? prev - 1 : maxIndex)}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-10 h-10 bg-white rounded-full shadow-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all hidden sm:flex"
            >
              <span className="material-icons-round text-slate-600 text-lg">chevron_left</span>
            </button>
            <button
              onClick={() => setTestimonialIndex(prev => prev < maxIndex ? prev + 1 : 0)}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 w-10 h-10 bg-white rounded-full shadow-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all hidden sm:flex"
            >
              <span className="material-icons-round text-slate-600 text-lg">chevron_right</span>
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════ CTA FINAL ═══════════════════ */}
      <section className="px-5 sm:px-8 py-20 bg-blue-600 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-5">¿Listo para sentirte mejor?</h2>
          <p className="text-blue-100 text-base sm:text-lg font-medium max-w-2xl mx-auto mb-10">Nuestros profesionales certificados están listos para atenderte. Agenda tu primera consulta hoy.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={() => setIsGeneralFormOpen(true)}
              className="bg-white text-blue-700 px-8 py-4 rounded-2xl font-bold text-sm hover:bg-blue-50 transition-all shadow-xl shadow-blue-900/20"
            >
              Agendar Atención
            </button>
            <button
              onClick={() => navigate('/patient/results')}
              className="bg-white/10 backdrop-blur text-white border-2 border-white/30 px-8 py-4 rounded-2xl font-bold text-sm hover:bg-white/20 transition-all"
            >
              Buscar Profesional
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════ FOOTER ═══════════════════ */}
      <footer className="bg-slate-900 text-white pt-16 sm:pt-20 pb-8 px-5 sm:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 sm:gap-12 mb-14">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1 space-y-5">
              <div className="flex items-center">
                <img src={logoClinica} alt="Clínica Mas Life" className="h-14 w-auto object-contain brightness-0 invert opacity-90" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }} />
                <span className="hidden text-xl font-extrabold tracking-tight">Mas<span className="text-blue-400">life</span></span>
              </div>
              <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-xs">
                Rediseñando la experiencia de salud a través de la calidez clínica y el compromiso humano.
              </p>
            </div>

            {/* Servicios */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-5">Servicios</h4>
              <ul className="space-y-3">
                <li className="text-sm text-slate-400 hover:text-white cursor-pointer transition-colors font-medium" onClick={() => setIsGeneralFormOpen(true)}>Consulta Guiada</li>
                <li className="text-sm text-slate-400 hover:text-white cursor-pointer transition-colors font-medium" onClick={() => navigate('/patient/results')}>Especialistas</li>
                <li className="text-sm text-slate-400 hover:text-white cursor-pointer transition-colors font-medium" onClick={handleShowPlans}>Planes</li>
              </ul>
            </div>

            {/* Compañía */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-5">Compañía</h4>
              <ul className="space-y-3">
                <li className="text-sm text-slate-400 hover:text-white cursor-pointer transition-colors font-medium">Método Life</li>
                <li className="text-sm text-slate-400 hover:text-white cursor-pointer transition-colors font-medium" onClick={() => setIsContactFormOpen(true)}>Nosotros</li>
                <li className="text-sm text-slate-400 hover:text-white cursor-pointer transition-colors font-medium" onClick={() => navigate('/pro/login')}>Portal Profesional</li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-5">Legal</h4>
              <ul className="space-y-3">
                <li className="text-sm text-slate-400 hover:text-white cursor-pointer transition-colors font-medium">Privacidad</li>
                <li className="text-sm text-slate-400 hover:text-white cursor-pointer transition-colors font-medium">Términos</li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500 font-medium">© 2026 Clínica Mas Life · Santiago, Chile</p>
            <div className="flex gap-3">
              <a href="https://wa.me/56965329974" target="_blank" rel="noreferrer" className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors">
                <svg className="w-4 h-4 fill-current text-slate-400" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.767 5.767 0 1.267.408 2.438 1.103 3.394l-.717 2.63 2.7-.708c.846.541 1.847.851 2.923.851 3.181 0 5.767-2.586 5.767-5.767 0-3.181-2.586-5.767-5.767-5.767zm3.344 8.205c-.145.409-.838.74-1.164.786-.324.045-.72.079-2.315-.572-1.911-.781-3.142-2.723-3.238-2.85-.095-.126-.777-.963-.777-1.838s.454-1.306.616-1.467c.163-.162.355-.202.474-.202s.237.001.341.006c.108.005.253-.041.396.304.145.352.497 1.21.541 1.298.045.089.074.192.015.309-.059.117-.089.192-.178.297-.089.105-.187.234-.267.314s-.17.169-.074.335c.095.166.424.699.91 1.132.626.557 1.152.73 1.316.812.163.081.258.067.354-.044.095-.112.408-.48.517-.643.11-.163.22-.136.371-.081s.956.45 1.12.532c.164.081.274.121.314.192s.041.527-.104.935z"/></svg>
              </a>
              <div className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center cursor-pointer transition-colors">
                <span className="material-icons-round text-slate-400 text-base">public</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* ═══════════════════ WHATSAPP FLOTANTE ═══════════════════ */}
      <a
        href="https://wa.me/56965329974?text=Hola! Me gustaría que me asignen un profesional de Clínica Mas Life o hacer una consulta."
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-6 right-6 z-[100] group"
      >
        {/* Pulse animation */}
        <div className="absolute inset-0 bg-[#25D366] rounded-full animate-ping opacity-20"></div>
        {/* Button */}
        <div className="relative bg-[#25D366] text-white w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-xl shadow-green-600/30 hover:shadow-green-600/50 hover:scale-110 active:scale-95 transition-all flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-7 h-7 sm:w-8 sm:h-8 fill-current" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.767 5.767 0 1.267.408 2.438 1.103 3.394l-.717 2.63 2.7-.708c.846.541 1.847.851 2.923.851 3.181 0 5.767-2.586 5.767-5.767 0-3.181-2.586-5.767-5.767-5.767zm3.344 8.205c-.145.409-.838.74-1.164.786-.324.045-.72.079-2.315-.572-1.911-.781-3.142-2.723-3.238-2.85-.095-.126-.777-.963-.777-1.838s.454-1.306.616-1.467c.163-.162.355-.202.474-.202s.237.001.341.006c.108.005.253-.041.396.304.145.352.497 1.21.541 1.298.045.089.074.192.015.309-.059.117-.089.192-.178.297-.089.105-.187.234-.267.314s-.17.169-.074.335c.095.166.424.699.91 1.132.626.557 1.152.73 1.316.812.163.081.258.067.354-.044.095-.112.408-.48.517-.643.11-.163.22-.136.371-.081s.956.45 1.12.532c.164.081.274.121.314.192s.041.527-.104.935z"/>
            <path d="M19.057 4.298c-1.883-1.884-4.386-2.922-7.051-2.922-5.485 0-9.946 4.461-9.946 9.946 0 1.753.458 3.465 1.328 4.972l-1.41 5.148 5.268-1.381c1.458.794 3.097 1.213 4.76 1.213h.004c5.484 0 9.946-4.461 9.946-9.946 0-2.657-1.034-5.164-2.919-7.049l-.04-.04zm-7.051 15.352c-1.487 0-2.945-.399-4.216-1.155l-.302-.18-3.132.821.835-3.053-.198-.314c-.832-1.321-1.272-2.857-1.272-4.43 0-4.542 3.696-8.237 8.241-8.237 2.201 0 4.271.857 5.827 2.414s2.414 3.626 2.414 5.827c.001 4.542-3.695 8.237-8.238 8.237l-.059-.03z"/>
          </svg>
        </div>
        {/* Tooltip */}
        <div className="absolute bottom-full right-0 mb-3 bg-white text-slate-800 px-4 py-2 rounded-xl shadow-xl border border-slate-100 text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Escríbenos por WhatsApp
          <div className="absolute top-full right-6 w-2 h-2 bg-white border-r border-b border-slate-100 transform rotate-45 -translate-y-1"></div>
        </div>
      </a>

      {/* ═══════════════════ MODAL: FORMULARIO AGENDAR ═══════════════════ */}
      {(showPlanForm.isOpen || isGeneralFormOpen) && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 sm:p-6" onClick={(e) => { if (e.target === e.currentTarget) { setShowPlanForm({ isOpen: false, planName: '' }); setIsGeneralFormOpen(false); } }}>
          <div className="bg-white w-full max-w-lg rounded-3xl p-8 sm:p-10 shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
                  <span className="material-icons-round text-blue-600 text-xl">calendar_month</span>
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                    {showPlanForm.isOpen ? `Solicitud ${showPlanForm.planName}` : 'Agendar Atención'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Completa tus datos para continuar</p>
                </div>
              </div>
              <button
                onClick={() => { setShowPlanForm({ isOpen: false, planName: '' }); setIsGeneralFormOpen(false); }}
                className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center transition-all flex-shrink-0"
              >
                <span className="material-icons-round text-slate-400">close</span>
              </button>
            </div>

            <form onSubmit={(e) => handleFormSubmit(e, showPlanForm.isOpen ? showPlanForm.planName : 'Consulta General')} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5 ml-1">Nombre</label>
                  <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 font-medium text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Juan Pérez" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5 ml-1">WhatsApp</label>
                  <input required value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 font-medium text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="+56 9..." />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5 ml-1">Email</label>
                <input required type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 font-medium text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="correo@ejemplo.com" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5 ml-1">Condición o Motivo</label>
                <textarea required value={formData.condition} onChange={e => setFormData({ ...formData, condition: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 font-medium text-sm h-28 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Describe brevemente tu situación..." />
              </div>
              <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                <span className="material-icons-round text-base">send</span>
                Verificar Cobertura y Agenda
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════ MODAL: FORMULARIO CONTACTO ═══════════════════ */}
      {isContactFormOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 sm:p-6" onClick={(e) => { if (e.target === e.currentTarget) setIsContactFormOpen(false); }}>
          <div className="bg-white w-full max-w-lg rounded-3xl p-8 sm:p-10 shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center">
                  <span className="material-icons-round text-violet-600 text-xl">mark_email_unread</span>
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Contáctenos</h3>
                  <p className="text-xs text-slate-500 font-medium">Te llamamos a la brevedad</p>
                </div>
              </div>
              <button
                onClick={() => setIsContactFormOpen(false)}
                className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center transition-all flex-shrink-0"
              >
                <span className="material-icons-round text-slate-400">close</span>
              </button>
            </div>

            <form onSubmit={handleContactSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5 ml-1">Nombre</label>
                  <input required value={contactData.name} onChange={e => setContactData({ ...contactData, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 font-medium text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="María González" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5 ml-1">WhatsApp / Teléfono</label>
                  <input required value={contactData.phone} onChange={e => setContactData({ ...contactData, phone: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 font-medium text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="+56 9..." />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5 ml-1">Email</label>
                <input required type="email" value={contactData.email} onChange={e => setContactData({ ...contactData, email: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 font-medium text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="correo@ejemplo.com" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5 ml-1">¿En qué te podemos ayudar?</label>
                <textarea required value={contactData.message} onChange={e => setContactData({ ...contactData, message: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 font-medium text-sm h-28 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Cuéntanos tu caso o consulta..." />
              </div>
              <button type="submit" className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-violet-600/20 hover:bg-violet-700 transition-all flex items-center justify-center gap-2">
                <span className="material-icons-round text-base">send</span>
                Enviar Solicitud de Contacto
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainHome;
