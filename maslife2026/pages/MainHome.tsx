
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import logoClinica from '../assets/logo-clinica.png';

declare global {
  interface Window { gsap: any; ScrollTrigger: any; Lenis: any; }
}

const PROFESIONALES = [
  { id: 1, nombre: 'Dra. Ana Gómez', especialidad: 'Kinesióloga', rol: 'ESPECIALISTA',
    foto: 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?q=80&w=300&fit=crop',
    color: 'from-cyan-400 to-blue-500' },
  { id: 2, nombre: 'Dr. Luis Pérez', especialidad: 'Psicólogo', rol: 'ESPECIALISTA',
    foto: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?q=80&w=300&fit=crop',
    color: 'from-blue-400 to-indigo-500' },
  { id: 3, nombre: 'Dra. Carla Díaz', especialidad: 'Nutricionista', rol: 'COORDINADORA',
    foto: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=300&fit=crop',
    color: 'from-teal-400 to-emerald-500' },
];

const CARD_POSITIONS = [
  'top-8 left-0 z-20',
  'top-40 left-[155px] z-10',
  'top-4 left-[295px] z-0',
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
  const [activeSpecFilter, setActiveSpecFilter] = useState<'destacados' | 'todos'>('destacados');
  const [scrollY, setScrollY] = useState(0);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const heroRef        = useRef<HTMLElement>(null);
  const heroTitleRef   = useRef<HTMLDivElement>(null);
  const manifestoRef   = useRef<HTMLDivElement>(null);
  const featuresRef    = useRef<HTMLDivElement>(null);
  const expansionRef   = useRef<HTMLDivElement>(null);
  const expansionWrap  = useRef<HTMLDivElement>(null);
  const cursorDotRef   = useRef<HTMLDivElement>(null);
  const cursorRingRef  = useRef<HTMLDivElement>(null);
  const lenisRef       = useRef<any>(null);

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

  // GSAP + Lenis cinematic animations
  useEffect(() => {
    if (typeof window.gsap === 'undefined') return;
    const { gsap, ScrollTrigger, Lenis } = window;
    gsap.registerPlugin(ScrollTrigger);

    // Smooth scroll via Lenis, scoped to #main-home-scroll div
    const scrollEl = document.getElementById('main-home-scroll');
    if (scrollEl && Lenis) {
      const lenis = new Lenis({
        wrapper: scrollEl,
        content: scrollEl,
        duration: 1.2,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        touchMultiplier: 2,
      });
      lenisRef.current = lenis;
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time: number) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
      ScrollTrigger.defaults({ scroller: scrollEl });
    }

    // Hero title word entrance
    if (heroTitleRef.current) {
      gsap.fromTo(
        heroTitleRef.current.querySelectorAll('.hero-word'),
        { yPercent: 110, opacity: 0 },
        { yPercent: 0, opacity: 1, stagger: 0.1, duration: 1.0, ease: 'power4.out', delay: 0.35 }
      );
    }

    // Manifesto word-by-word scroll reveal
    if (manifestoRef.current) {
      gsap.to(manifestoRef.current.querySelectorAll('.word-reveal'), {
        opacity: 1,
        stagger: 0.035,
        scrollTrigger: {
          trigger: manifestoRef.current,
          start: 'top 75%',
          end: 'bottom 50%',
          scrub: true,
        },
      });
    }

    // Image expansion scrub — desktop only
    if (expansionRef.current && expansionWrap.current && window.innerWidth >= 768) {
      gsap.to(expansionRef.current, {
        width: '100vw',
        height: '100vh',
        borderRadius: 0,
        ease: 'none',
        scrollTrigger: {
          trigger: expansionWrap.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true,
        },
      });
    }

    // "Cómo Funciona" cards stagger on enter
    if (featuresRef.current) {
      gsap.fromTo(
        featuresRef.current.querySelectorAll('.feature-card'),
        { opacity: 0, y: 60 },
        {
          opacity: 1, y: 0, stagger: 0.15, duration: 0.9, ease: 'power3.out',
          scrollTrigger: { trigger: featuresRef.current, start: 'top 82%' },
        }
      );
    }

    // Custom cursor (desktop)
    const dot = cursorDotRef.current;
    const ring = cursorRingRef.current;
    let mx = 0, my = 0, rx = 0, ry = 0;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      if (dot) { dot.style.left = mx + 'px'; dot.style.top = my + 'px'; }
    };
    let rafId: number;
    const tick = () => {
      rx += (mx - rx) * 0.12; ry += (my - ry) * 0.12;
      if (ring) { ring.style.left = rx + 'px'; ring.style.top = ry + 'px'; }
      rafId = requestAnimationFrame(tick);
    };
    window.addEventListener('mousemove', onMove);
    rafId = requestAnimationFrame(tick);
    document.querySelectorAll('a, button').forEach(el => {
      el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
      el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
    });

    return () => {
      lenisRef.current?.destroy();
      ScrollTrigger.getAll().forEach((t: any) => t.kill());
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(rafId);
      document.body.classList.remove('cursor-hover');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      cta: 'Buscar profesional'
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
      cta: 'Buscar profesional'
    },
    {
      name: 'Fonoaudiología',
      desc: 'Especialistas en comunicación, habla y deglución.',
      img: 'https://images.unsplash.com/photo-1581056344415-3abb473d452c?q=80&w=600',
      alt: 'Fonoaudiólogo atendiendo paciente niño y adulto',
      cta: 'Buscar profesional'
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
    { text: 'Nos costó encontrar la especialista adecuada para su terapia de fonoaudiología. Ha sido un gran alivio para toda la familia, aunque tardamos un poco en coordinarnos al inicio.', name: 'Javier M.', role: 'FAMILIAR DE PACIENTE', stars: 4 },
    { text: 'La atención domiciliaria de kinesiología fue increíble. Puntualidad, profesionalismo y sobre todo mucha empatía durante todo mi proceso de rehabilitación.', name: 'Carolina V.', role: 'PACIENTE KINESIOLOGÍA', stars: 5 },
    { text: 'Recomiendo a cualquiera que necesite atención de salud en casa. El sistema de asignación es muy eficiente y los profesionales son de primer nivel.', name: 'Miguel A.', role: 'PACIENTE GENERAL', stars: 5 },
    { text: 'Mi terapeuta ocupacional me ayudó a recuperar la independencia después de mi accidente. Eternamente agradecida con Mas Life.', name: 'Patricia L.', role: 'PACIENTE TERAPIA OCUPACIONAL', stars: 5 },
    { text: 'La consulta online fue muy profesional. Cómodo para quienes trabajamos todo el día. Me habría gustado más opciones de horario, pero en general excelente.', name: 'Andrés F.', role: 'PACIENTE ONLINE', stars: 4 },
    { text: 'Mi hijo de 4 años avanzó mucho más rápido con la fonoaudióloga de Mas Life. La paciencia y dedicación fueron extraordinarias.', name: 'Camila R.', role: 'MADRE DE PACIENTE', stars: 5 },
    { text: 'El seguimiento por WhatsApp después de cada sesión es un detalle que marca la diferencia. Te sientes acompañado todo el proceso.', name: 'Fernando G.', role: 'PACIENTE KINESIOLOGÍA', stars: 5 },
    { text: 'Probé con varios nutricionistas antes y ninguno entendió mis necesidades como la profesional que me asignaron aquí.', name: 'Valentina M.', role: 'PACIENTE DE NUTRICIÓN', stars: 5 },
    { text: 'La podóloga que me atendió fue muy profesional. Resolvió un problema que arrastraba hace meses en solo 3 sesiones.', name: 'Roberto C.', role: 'PACIENTE PODOLOGÍA', stars: 5 },
    { text: 'Buena plataforma. Reservé en minutos y el profesional llegó puntual a mi domicilio. Quizás falta un poco más de variedad de especialistas en Ovalle.', name: 'Isidora P.', role: 'PACIENTE DOMICILIO', stars: 4 },
    { text: 'Mi psicólogo de Mas Life me ayudó a manejar el estrés laboral de una forma que nunca imaginé posible. Gracias por existir.', name: 'Diego T.', role: 'PACIENTE PSICOLOGÍA', stars: 5 },
    { text: 'Después de la cirugía de rodilla, la rehabilitación domiciliaria fue clave. Los kinesiólogos de +Life son de otro nivel.', name: 'Marcela H.', role: 'PACIENTE POST-QUIRÚRGICO', stars: 5 },
    { text: 'Como persona mayor, valoro mucho que vengan a mi casa. El masajista fue muy respetuoso y profesional con mi tratamiento.', name: 'Jorge V.', role: 'PACIENTE MASOTERAPIA', stars: 5 },
  ];

  // Carrusel automático de testimonios
  const [testimonialIndex, setTestimonialIndex] = useState(0);
  const [testimonialsPerView, setTestimonialsPerView] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 1 : 3
  );
  useEffect(() => {
    const handleResize = () => setTestimonialsPerView(window.innerWidth < 768 ? 1 : 3);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
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

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div id="main-home-scroll" className="landing-page w-full h-full overflow-y-auto font-outfit scroll-smooth relative" style={{ background: '#ffffff', color: '#0f172a' }}>

      {/* ═══════════════════ NAVBAR ═══════════════════ */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-[6vw]"
        style={{
          height: '76px',
          color: scrollY > 80 ? '#0f172a' : '#0f172a',
          background: scrollY > 80 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(14,165,233,0.1)',
          transition: 'background .35s',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center cursor-pointer shrink-0"
          onClick={() => scrollToSection('hero')}
          style={{ color: scrollY > 80 ? '#0f172a' : 'inherit' }}
        >
          <img src={logoClinica} alt="Clínica Mas Life"
            className="w-auto object-contain"
            style={{ height: '150px' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="hidden font-display text-lg font-light tracking-wide ml-2">AgendaMás<span style={{ opacity:.6 }}>Life</span></span>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-9">
          {[
            { label: 'Cómo funciona', id: 'como-funciona' },
            { label: 'Especialidades', id: 'especialidades' },
          ].map(({ label, id }) => (
            <button key={id} onClick={() => scrollToSection(id)}
              className="text-[.8rem] font-medium uppercase tracking-[1.8px] opacity-80 hover:opacity-100 transition-opacity"
              style={{ color: 'inherit' }}>
              {label}
            </button>
          ))}
          <button onClick={handleShowPlans}
            className="text-[.8rem] font-medium uppercase tracking-[1.8px] opacity-80 hover:opacity-100 transition-opacity"
            style={{ color: 'inherit' }}>
            Planes
          </button>
          <button onClick={() => navigate('/pro/login')}
            className="text-[.8rem] font-semibold uppercase tracking-[1.8px] px-5 py-2 rounded-full border border-current opacity-80 hover:opacity-100 transition-opacity"
            style={{ color: 'inherit' }}>
            Portal Pro
          </button>
        </div>

        {/* Mobile Button */}
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden w-10 h-10 flex items-center justify-center" style={{ color: 'inherit' }}>
          <span className="material-icons-round text-xl">{mobileMenuOpen ? 'close' : 'menu'}</span>
        </button>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 pt-[76px] flex flex-col" style={{ background: '#ffffff' }}>
          <div className="px-8 py-8 space-y-6">
            {[
              { label: 'Cómo funciona', id: 'como-funciona' },
              { label: 'Especialidades', id: 'especialidades' },
              { label: 'Planes', id: 'planes' },
            ].map(({ label, id }) => (
              <button key={id} onClick={() => { scrollToSection(id); setMobileMenuOpen(false); }}
                className="w-full text-left font-display text-3xl font-light tracking-tight" style={{ color: '#0f172a' }}>
                {label}
              </button>
            ))}
            <div className="pt-4 border-t" style={{ borderColor: 'rgba(15,23,42,0.12)' }}>
              <button onClick={() => { navigate('/pro/login'); setMobileMenuOpen(false); }}
                className="w-full py-4 rounded-2xl text-sm font-semibold text-white text-center"
                style={{ background: '#0284c7' }}>
                Portal Profesional
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ HERO SECTION ═══════════════════ */}
      <section ref={heroRef} id="hero" className="relative min-h-screen flex items-center overflow-hidden"
               style={{ background: '#ffffff' }}>
        {/* Gradiente de fondo — blanco → celeste suave */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse 90% 70% at 60% 100%, rgba(14,165,233,.18), transparent 65%),
                       radial-gradient(ellipse 50% 60% at 90% 10%, rgba(6,182,212,.14), transparent 55%),
                       radial-gradient(ellipse 70% 50% at 10% 80%, rgba(56,189,248,.10), transparent 60%),
                       #ffffff`
        }} />
        {/* Blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
          <div className="absolute -top-16 -left-16 w-[380px] h-[380px] rounded-full"
               style={{ background: '#bae6fd', filter: 'blur(72px)', opacity: .5, animation: 'blobFloat 8s ease-in-out infinite' }} />
          <div className="absolute bottom-[4%] -right-[4%] w-[300px] h-[300px] rounded-full"
               style={{ background: '#a5f3fc', filter: 'blur(60px)', opacity: .4, animation: 'blobFloat 11s ease-in-out infinite reverse' }} />
        </div>

        {/* Contenido */}
        <div className="relative z-10 max-w-7xl mx-auto px-[6vw] pt-32 sm:pt-40 pb-28 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            {/* Columna izquierda — texto */}
            <div className="max-w-xl">
              <p className="text-[.88rem] font-outfit font-medium uppercase tracking-[4px] mb-7" style={{ color: '#0284c7' }}>
                Agenda clínica inteligente · Región de Coquimbo
              </p>

              {/* Título Fraunces */}
              <div ref={heroTitleRef} className="mb-8" style={{ overflow: 'hidden' }}>
                <div className="font-display text-[clamp(3.8rem,9.5vw,7.5rem)] leading-[.96] tracking-tight" style={{ color: '#0f172a' }}>
                  {[
                    { text: 'Tu salud,', italic: false },
                    { text: 'en buenas', italic: false },
                    { text: 'manos.', italic: true },
                  ].map((line, li) => (
                    <div key={li} className="overflow-hidden">
                      <span className="hero-word inline-block">
                        {line.italic
                          ? <em style={{ color: '#0284c7', fontStyle: 'italic' }}>manos.</em>
                          : line.text
                        }
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="font-outfit font-light text-xl sm:text-2xl max-w-lg leading-relaxed mb-10" style={{ color: '#475569' }}>
                Kinesiología, psicología, nutrición y más — con profesionales verificados en{' '}
                <strong className="font-semibold" style={{ color: '#0f172a' }}>Ovalle, Coquimbo y La Serena</strong>.
                Presencial, online o a domicilio.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => navigate('/patient/results')}
                  className="group inline-flex items-center gap-3 px-8 py-4 rounded-full text-base font-outfit font-semibold transition-all duration-300 hover:-translate-y-1"
                  style={{ background: 'linear-gradient(135deg, #0284c7, #0ea5e9)', color: '#fff', boxShadow: '0 20px 50px -16px rgba(2,132,199,.55)' }}>
                  Buscar especialista
                  <span className="material-icons-round text-base group-hover:translate-x-1 transition-transform">search</span>
                </button>
                <button
                  onClick={() => setIsGeneralFormOpen(true)}
                  className="inline-flex items-center gap-3 px-8 py-4 rounded-full text-base font-outfit font-semibold border transition-all duration-300 hover:-translate-y-1"
                  style={{
                    background: 'rgba(14,165,233,.07)',
                    color: '#0284c7',
                    borderColor: 'rgba(14,165,233,.3)',
                  }}>
                  <span className="material-icons-round text-base">calendar_month</span>
                  Agendar atención
                </button>
              </div>

              {/* Trust badges */}
              <div className="mt-10 flex flex-wrap gap-4">
                {[
                  { icon: 'verified', label: 'Profesionales verificados' },
                  { icon: 'home', label: 'Atención a domicilio' },
                  { icon: 'videocam', label: 'Consulta online' },
                ].map(({ icon, label }) => (
                  <div key={label} className="flex items-center gap-2 text-sm font-medium" style={{ color: '#475569' }}>
                    <span className="material-icons-round text-base" style={{ color: '#0ea5e9' }}>{icon}</span>
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Columna derecha — tarjetas arrastrables */}
            <div className="relative hidden lg:flex items-center justify-end mt-10 lg:mt-0">
              <p className="absolute top-0 right-0 text-sm font-bold text-right leading-tight z-30"
                 style={{ color: '#475569' }}>
                Nuestro Equipo<br />Multi-Área en Ovalle
              </p>
              <p className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap z-30"
                 style={{ color: '#94a3b8' }}>
                ✦ Arrastra las tarjetas
              </p>
              <div className="relative w-full max-w-[500px] h-[420px] mt-10">
                {PROFESIONALES.map((prof, index) => (
                  <motion.div
                    key={prof.id}
                    drag
                    dragConstraints={{ left: -80, right: 80, top: -40, bottom: 120 }}
                    whileDrag={{ scale: 1.06, zIndex: 50 }}
                    whileHover={{ y: -8, scale: 1.02 }}
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 60, delay: index * 0.2 }}
                    className={`absolute cursor-grab active:cursor-grabbing w-[190px] ${CARD_POSITIONS[index]}`}
                    style={{
                      background: 'rgba(255,255,255,0.88)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(14,165,233,0.15)',
                      borderRadius: '2.5rem',
                      padding: '1.25rem',
                      boxShadow: '0 10px 32px rgba(2,132,199,0.12)',
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                      {prof.rol}
                    </span>
                    <div style={{ width: '100%', aspectRatio: '1', borderRadius: '50%', overflow: 'hidden', border: '4px solid white', marginBottom: 14, position: 'relative', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                      <img src={prof.foto} alt={prof.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <h4 style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, marginBottom: 2 }}>{prof.nombre}</h4>
                      <p style={{ fontSize: 11, fontWeight: 600, color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{prof.especialidad}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 pointer-events-none">
          <span className="font-outfit text-[.7rem] uppercase tracking-[3px]" style={{ color: '#475569', opacity: .6 }}>Desliza</span>
          <div style={{ width: 1, height: 44, background: '#0ea5e9', opacity: .45, animation: 'scrollBounce 2.4s ease-in-out infinite', transformOrigin: 'top' }} />
        </div>
      </section>

      {/* ═══════════════════ STATS BAR ═══════════════════ */}
      <div className="py-12 px-5 sm:px-8" style={{ background: 'linear-gradient(135deg, #0369a1 0%, #0284c7 50%, #0ea5e9 100%)' }}>
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { num: '500+', label: 'Sesiones Realizadas' },
            { num: '8', label: 'Especialidades' },
            { num: '4.9', label: 'Satisfacción' },
            { num: '3', label: 'Ciudades + Online' },
          ].map((stat, i) => (
            <div key={i} data-reveal={`stat-${i}`} className={`text-center ${rv(`stat-${i}`)}`} style={{ transitionDelay: `${i * 100}ms` }}>
              <p className="font-display font-light text-3xl sm:text-4xl tracking-tight text-white">{stat.num}</p>
              <p className="font-outfit text-[.72rem] uppercase tracking-[2px] mt-1" style={{ color: 'rgba(186,230,253,.85)' }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════ MANIFESTO ═══════════════════ */}
      <section className="overflow-hidden" style={{ minHeight: '85vh', display: 'flex', alignItems: 'center', padding: '18vh 6vw', background: '#ffffff' }}>
        <div className="max-w-5xl">
          <p className="font-outfit text-[.78rem] uppercase tracking-[3px] mb-7" style={{ color: '#0ea5e9' }}>Filosofía</p>
          <div
            ref={manifestoRef}
            className="font-display font-light leading-[1.3]"
            style={{ fontSize: 'clamp(1.65rem,4.2vw,3.2rem)', letterSpacing: '-.4px', color: '#0f172a' }}
          >
            {"AgendaMasLife conecta pacientes con los mejores especialistas de salud en Chile, entregando acceso rápido, profesional y sin barreras a la atención que necesitas, cuando más lo necesitas.".split(' ').map((word, i) => (
              <span key={i} className="word-reveal"> {word}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ IMAGE EXPANSION ═══════════════════ */}
      <div ref={expansionWrap} className="relative hidden md:block" style={{ height: '200vh' }}>
        <div className="sticky top-0 h-screen flex items-center justify-center overflow-hidden" style={{ background: '#0f172a' }}>
          <p className="absolute top-10 left-1/2 -translate-x-1/2 font-outfit text-[.72rem] uppercase tracking-[3px] z-20 whitespace-nowrap"
             style={{ color: 'rgba(6,182,212,.45)' }}>
            Una sola pantalla
          </p>
          <div
            ref={expansionRef}
            className="relative overflow-hidden"
            style={{ width: '42vw', height: '54vh', borderRadius: '18px', boxShadow: '0 40px 90px -30px rgba(15,23,42,.6)' }}
          >
            {/* Header mockup */}
            <div className="px-5 py-3.5 flex items-center justify-between shrink-0" style={{ background: '#0284c7' }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,.2)' }}>
                  <span className="material-icons-round text-white text-xs">event_available</span>
                </div>
                <span className="font-display font-light text-white text-sm">AgendaMasLife</span>
              </div>
              <div className="flex gap-1.5">
                {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full" style={{ background: 'rgba(255,255,255,.3)' }} />)}
              </div>
            </div>
            {/* Body mockup */}
            <div className="p-5 overflow-hidden" style={{ height: 'calc(100% - 48px)', background: '#f0f9ff' }}>
              <p className="font-outfit text-[.65rem] uppercase tracking-[2px] mb-3" style={{ color: '#475569' }}>Especialidades</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  ['Kinesiología', '#0ea5e9', 'accessibility_new'],
                  ['Psicología', '#0284c7', 'psychology'],
                  ['Nutrición', '#06b6d4', 'restaurant'],
                  ['Fonoaudiología', '#475569', 'record_voice_over'],
                ].map(([s, c, icon], i) => (
                  <div key={i} className="bg-white rounded-xl p-3 flex items-center gap-2" style={{ border: '1px solid rgba(15,23,42,.1)' }}>
                    <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center" style={{ background: c as string }}>
                      <span className="material-icons-round text-white text-sm">{icon as string}</span>
                    </div>
                    <p className="font-outfit text-[.68rem] font-medium" style={{ color: '#0f172a' }}>{s as string}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(14,165,233,.1)', border: '1px solid rgba(14,165,233,.25)' }}>
                <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center" style={{ background: '#0ea5e9' }}>
                  <span className="material-icons-round text-white text-base">bolt</span>
                </div>
                <div>
                  <p className="font-outfit text-xs font-medium" style={{ color: '#0f172a' }}>Reserva en 3 pasos</p>
                  <p className="font-outfit text-[.65rem]" style={{ color: '#475569' }}>Especialidad → Horario → Confirmación</p>
                </div>
              </div>
            </div>
          </div>
          {/* Caption */}
          <div className="absolute left-[6vw] bottom-[8vh] z-10 max-w-xs">
            <p className="font-outfit text-[.72rem] uppercase tracking-[3px] mb-2" style={{ color: 'rgba(6,182,212,.65)' }}>Tu consulta</p>
            <h3 className="font-display font-light text-white leading-[1.05]" style={{ fontSize: 'clamp(1.6rem,2.5vw,2.4rem)' }}>Toda en calma.</h3>
          </div>
        </div>
      </div>

      {/* ═══════════════════ COMO FUNCIONA ═══════════════════ */}
      <section id="como-funciona" style={{ padding: '16vh 6vw', background: '#ffffff' }}>
        <div className="max-w-7xl mx-auto">
          <div className="max-w-xl mb-[9vh]">
            <p className="font-outfit text-[.78rem] uppercase tracking-[3px] mb-5" style={{ color: '#0ea5e9' }}>Proceso simple</p>
            <h2 className="font-display font-light leading-[1.05]" style={{ fontSize: 'clamp(2rem,5vw,3.6rem)', letterSpacing: '-1px', color: '#0f172a' }}>
              Menos administración.<br /><em style={{ color: '#0ea5e9', fontStyle: 'italic' }}>Más presencia.</em>
            </h2>
            <p className="font-outfit font-light text-base mt-5 leading-relaxed" style={{ color: '#475569' }}>
              Domicilio · Online · Presencial — en Ovalle, Coquimbo y La Serena.
            </p>
          </div>

          <div ref={featuresRef} className="grid grid-cols-1 md:grid-cols-3 gap-7 sm:gap-8">
            {[
              { icon: 'assignment', step: '01', title: 'Rellenas el formulario', desc: 'Tu información y requerimiento, en segundos.' },
              { icon: 'groups', step: '02', title: 'Asignación profesional', desc: 'Un agente revisa y te asigna el especialista ideal.' },
              { icon: 'event_available', step: '03', title: 'Primera cita', desc: 'El profesional te contacta y coordinan juntos el primer encuentro.' },
            ].map((step, i) => (
              <div key={i} data-reveal={`step-${i}`}
                className={`feature-card relative overflow-hidden rounded-[18px] p-10 transition-all duration-500 ${rv(`step-${i}`)}`}
                style={{
                  background: 'linear-gradient(145deg, #ffffff 0%, #f0f9ff 100%)',
                  border: '1.5px solid rgba(14,165,233,.18)',
                  boxShadow: '0 1px 2px rgba(0,168,158,.06), 0 4px 12px rgba(2,132,199,.1), 0 20px 40px -12px rgba(15,23,42,.12)',
                  transitionDelay: `${i * 150}ms`,
                  cursor: 'default',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = 'perspective(800px) rotateX(-4deg) translateY(-10px) scale(1.02)';
                  el.style.boxShadow = '0 2px 4px rgba(0,168,158,.08), 0 16px 40px rgba(2,132,199,.2), 0 40px 64px -20px rgba(15,23,42,.2)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = '';
                  el.style.boxShadow = '0 1px 2px rgba(0,168,158,.06), 0 4px 12px rgba(2,132,199,.1), 0 20px 40px -12px rgba(15,23,42,.12)';
                }}
              >
                {/* Franja acento superior */}
                <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg, #06b6d4, #0284c7)' }} />
                {/* Número decorativo */}
                <span className="absolute top-5 right-6 font-display font-light select-none" style={{ fontSize: '3.5rem', color: 'rgba(14,165,233,.14)', lineHeight: 1 }}>{step.step}</span>
                {/* Icono */}
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-2"
                  style={{ background: 'linear-gradient(135deg, #e0f2fe, #bae6fd)', boxShadow: '0 4px 12px rgba(2,132,199,.2)' }}>
                  <span className="material-icons-round text-xl" style={{ color: '#0284c7' }}>{step.icon}</span>
                </div>
                <p className="font-outfit text-[.78rem] tracking-[2px] uppercase mb-4 font-bold" style={{ color: '#06b6d4' }}>{step.step}</p>
                <h4 className="font-display font-light text-xl mb-3 leading-tight" style={{ color: '#0f172a' }}>{step.title}</h4>
                <p className="font-outfit font-light text-[.93rem] leading-[1.65]" style={{ color: '#475569' }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ ÁREAS PROFESIONALES ═══════════════════ */}
      <section id="especialidades" className="px-5 sm:px-8 py-20 sm:py-28" style={{ background: '#ffffff' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-12 gap-4">
            <div>
              <p className="font-outfit text-[.78rem] uppercase tracking-[3px] mb-3" style={{ color: '#0ea5e9' }}>Nuestro equipo</p>
              <h2 className="font-display font-light leading-[1.05]" style={{ fontSize: 'clamp(1.8rem,4vw,3rem)', letterSpacing: '-1px', color: '#0f172a' }}>Selecciona un área y agenda</h2>
              <p className="font-outfit text-sm font-light mt-1" style={{ color: '#475569' }}>con un profesional directamente</p>
            </div>
            <div className="flex rounded-full p-1 border" style={{ background: 'rgba(255,255,255,.5)', borderColor: 'rgba(15,23,42,.12)' }}>
              <button
                onClick={() => setActiveSpecFilter('destacados')}
                className="px-5 py-2 rounded-full text-xs font-medium transition-all"
                style={{
                  background: activeSpecFilter === 'destacados' ? '#0284c7' : 'transparent',
                  color: activeSpecFilter === 'destacados' ? '#fff' : '#475569',
                }}
              >Destacados</button>
              <button
                onClick={() => setActiveSpecFilter('todos')}
                className="px-5 py-2 rounded-full text-xs font-medium transition-all"
                style={{
                  background: activeSpecFilter === 'todos' ? '#0284c7' : 'transparent',
                  color: activeSpecFilter === 'todos' ? '#fff' : '#475569',
                }}
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
              <div key={i} className="group bg-white rounded-2xl sm:rounded-3xl overflow-hidden transition-all duration-300 cursor-pointer"
                   style={{ border: '1px solid rgba(15,23,42,.1)', boxShadow: 'none' }}
                   onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 24px 48px -18px rgba(15,23,42,.22)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; }}
                   onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.transform = ''; }}
                   onClick={() => navigate('/patient/results')}>
                <div className="aspect-[4/3] overflow-hidden">
                  <img src={card.img} alt={card.alt || card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-4 sm:p-5">
                  <h4 className="font-display font-light text-sm sm:text-base mb-1 leading-snug" style={{ color: '#0f172a' }}>{card.name}</h4>
                  <p className="font-outfit text-xs sm:text-sm font-light leading-relaxed mb-3 line-clamp-2" style={{ color: '#475569' }}>{card.desc}</p>
                  <button className="flex items-center gap-1.5 text-xs font-medium transition-all group-hover:gap-2.5" style={{ color: '#0ea5e9' }}>
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
                <div key={i} className="bg-white p-4 sm:p-5 rounded-2xl flex flex-col items-center text-center cursor-pointer group transition-all duration-300"
                     style={{ border: '1px solid rgba(15,23,42,.1)' }}
                     onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 16px 32px -12px rgba(15,23,42,.18)'; }}
                     onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
                     onClick={() => navigate('/patient/results')}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 group-hover:rotate-12 transition-transform" style={{ background: '#e0f2fe' }}>
                    <span className="material-icons-round text-2xl" style={{ color: '#0284c7' }}>{s.icon}</span>
                  </div>
                  <h4 className="font-outfit text-[10px] sm:text-xs font-medium leading-tight" style={{ color: '#0f172a' }}>{s.name}</h4>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════ PLANES KINESIOLÓGICOS (CONDICIONAL) ═══════════════════ */}
      {showKinePlans && (
        <section id="kine-plans" className="px-5 sm:px-8 py-20 sm:py-28" style={{ background: '#f8faff', animation: 'fadeIn .5s ease-out' }}>
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-14">
              <p className="font-outfit text-[.78rem] uppercase tracking-[3px] mb-5" style={{ color: '#0ea5e9' }}>Atención a domicilio</p>
              <h2 className="font-display font-light leading-[1.05]" style={{ fontSize: 'clamp(2rem,5vw,3.4rem)', letterSpacing: '-1px', color: '#0f172a' }}>
                Planes Kinesiológicos a Domicilio
              </h2>
              <p className="font-outfit font-light text-base sm:text-lg max-w-2xl mx-auto mt-4" style={{ color: '#475569' }}>Rehabilitación kinesiológica profesional en casa, reembolsable por seguros e Isapre.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-stretch">
              {kinePlans.map((plan, i) => {
                const isFeatured = !!plan.badge;
                return (
                  <div key={i} className="bg-white rounded-3xl p-8 sm:p-10 flex flex-col h-full relative group transition-all duration-300"
                       style={{
                         border: isFeatured ? '2px solid #0284c7' : '1px solid rgba(15,23,42,.12)',
                         boxShadow: isFeatured ? '0 32px 64px -24px rgba(2,132,199,.35)' : 'none',
                         transform: isFeatured ? 'scale(1.02)' : 'scale(1)',
                       }}
                       onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 32px 64px -24px rgba(15,23,42,.28)'; }}
                       onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = isFeatured ? '0 32px 64px -24px rgba(2,132,199,.35)' : 'none'; }}
                  >
                    {plan.badge && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-white px-6 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-lg whitespace-nowrap"
                           style={{ background: '#0284c7' }}>
                        {plan.badge}
                      </div>
                    )}
                    <div className="mb-8">
                      <h3 className="font-display font-light text-xl mb-3" style={{ color: '#0f172a' }}>{plan.name}</h3>
                      <p className="font-outfit text-sm font-light" style={{ color: '#475569' }}>{plan.desc}</p>
                    </div>

                    <ul className="space-y-3 mb-8 flex-1">
                      {plan.features.map((feat, idx) => (
                        <li key={idx} className="flex items-center gap-3 font-outfit text-sm" style={{ color: '#475569' }}>
                          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(14,165,233,.15)', color: '#0284c7' }}>
                            <span className="material-icons-round text-xs">check</span>
                          </div>
                          {feat}
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => setShowPlanForm({ isOpen: true, planName: plan.name })}
                      className="w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-95"
                      style={isFeatured
                        ? { background: '#0284c7', color: '#fff', border: 'none' }
                        : { background: 'transparent', color: '#0f172a', border: '2px solid rgba(15,23,42,.25)' }
                      }
                      onMouseEnter={e => { if (!isFeatured) { (e.currentTarget as HTMLButtonElement).style.background = '#0f172a'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; } }}
                      onMouseLeave={e => { if (!isFeatured) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#0f172a'; } }}
                    >
                      {plan.badge ? 'Comenzar Rehabilitación' : 'Solicitar Plan'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════ TESTIMONIOS CARRUSEL ═══════════════════ */}
      <section className="px-5 sm:px-8 py-20 sm:py-28 overflow-hidden" style={{ background: '#f0f9ff' }}>
        <div className="max-w-7xl mx-auto">
          <div className="mb-12">
            <p className="font-outfit text-[.78rem] uppercase tracking-[3px] mb-5" style={{ color: '#0ea5e9' }}>Testimonios reales</p>
            <h2 className="font-display font-light leading-[1.05]" style={{ fontSize: 'clamp(1.8rem,4vw,3rem)', letterSpacing: '-1px', color: '#0f172a' }}>Lo que dicen nuestros pacientes</h2>
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
                      <div key={i} className="bg-white rounded-2xl p-6 sm:p-7" style={{ border: '1px solid rgba(15,23,42,.09)' }}>
                        <div className="flex gap-0.5 mb-4" style={{ color: '#06b6d4' }}>
                          {Array.from({ length: t.stars }).map((_, s) => (
                            <span key={s} className="material-icons-round text-sm">star</span>
                          ))}
                        </div>
                        <p className="font-outfit font-light text-sm leading-relaxed mb-5 italic line-clamp-4" style={{ color: '#475569' }}>"{t.text}"</p>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(14,165,233,.15)' }}>
                            <span className="font-bold text-xs" style={{ color: '#0284c7' }}>{t.name.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="font-outfit text-sm font-semibold" style={{ color: '#0f172a' }}>{t.name}</p>
                            <p className="font-outfit text-[10px] font-medium uppercase tracking-wider" style={{ color: '#0ea5e9' }}>{t.role}</p>
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
                  className="h-2 rounded-full transition-all duration-300"
                  style={{ width: i === testimonialIndex ? '2rem' : '.5rem', background: i === testimonialIndex ? '#0284c7' : 'rgba(15,23,42,.2)' }}
                />
              ))}
            </div>

            {/* Flechas */}
            <button
              onClick={() => setTestimonialIndex(prev => prev > 0 ? prev - 1 : maxIndex)}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-10 h-10 rounded-full flex items-center justify-center transition-all hidden sm:flex"
              style={{ background: '#fff', border: '1px solid rgba(15,23,42,.12)', boxShadow: '0 4px 16px -4px rgba(15,23,42,.15)' }}
            >
              <span className="material-icons-round text-lg" style={{ color: '#0f172a' }}>chevron_left</span>
            </button>
            <button
              onClick={() => setTestimonialIndex(prev => prev < maxIndex ? prev + 1 : 0)}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 w-10 h-10 rounded-full flex items-center justify-center transition-all hidden sm:flex"
              style={{ background: '#fff', border: '1px solid rgba(15,23,42,.12)', boxShadow: '0 4px 16px -4px rgba(15,23,42,.15)' }}
            >
              <span className="material-icons-round text-lg" style={{ color: '#0f172a' }}>chevron_right</span>
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════ CTA FINAL ═══════════════════ */}
      <section className="px-5 sm:px-8 py-24 relative overflow-hidden"
               style={{ background: 'linear-gradient(135deg, #0369a1 0%, #0284c7 45%, #0ea5e9 100%)' }}>
        {/* Glow blobs celestes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
               style={{ background: 'rgba(186,230,253,.25)', filter: 'blur(100px)', animation: 'blobPulse 4s ease-in-out infinite' }} />
          <div className="absolute -bottom-20 -right-20 w-[350px] h-[350px] rounded-full"
               style={{ background: 'rgba(224,242,254,.2)', filter: 'blur(70px)', animation: 'blobFloat 9s ease-in-out infinite' }} />
        </div>
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <p className="font-outfit text-[.78rem] uppercase tracking-[3px] mb-6" style={{ color: 'rgba(186,230,253,.85)' }}>Comienza hoy</p>
          <h2 className="font-display font-light leading-[1.0] mb-6" style={{ fontSize: 'clamp(2.2rem,6vw,4.5rem)', color: '#ffffff', letterSpacing: '-1.5px' }}>
            ¿Listo para<br /><em style={{ color: '#bae6fd', fontStyle: 'italic' }}>sentirte mejor?</em>
          </h2>
          <p className="font-outfit font-light text-base sm:text-lg max-w-xl mx-auto mb-10" style={{ color: 'rgba(255,255,255,.75)' }}>
            Profesionales verificados listos para atenderte. Agenda tu primera consulta hoy.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={() => setIsGeneralFormOpen(true)}
              className="px-8 py-4 rounded-full font-outfit font-semibold text-sm transition-all hover:-translate-y-1"
              style={{ background: '#ffffff', color: '#0284c7', boxShadow: '0 20px 50px -16px rgba(3,105,161,.6)' }}
            >
              Agendar Atención
            </button>
            <button
              onClick={() => navigate('/patient/results')}
              className="px-8 py-4 rounded-full font-outfit font-semibold text-sm border transition-all hover:-translate-y-1"
              style={{ background: 'rgba(255,255,255,.12)', color: '#ffffff', borderColor: 'rgba(255,255,255,.4)' }}
            >
              Explorar Especialistas
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════ FOOTER ═══════════════════ */}
      <footer className="pt-16 sm:pt-20 pb-8 px-5 sm:px-8" style={{ background: '#0f172a', color: '#f0f9ff' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 sm:gap-12 mb-14">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1 space-y-5">
              <div className="flex items-center">
                <img src={logoClinica} alt="Clínica Mas Life" className="h-14 w-auto object-contain" style={{ filter: 'brightness(0) invert(1)', opacity: .85 }} onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
              </div>
              <p className="font-outfit font-light text-sm leading-relaxed max-w-xs" style={{ color: 'rgba(255,255,255,.55)' }}>
                Rediseñando la experiencia de salud a través de la calidez clínica y el compromiso humano.
              </p>
            </div>

            {/* Servicios */}
            <div>
              <h4 className="font-outfit text-[.72rem] uppercase tracking-[2.5px] mb-5" style={{ color: '#0ea5e9' }}>Servicios</h4>
              <ul className="space-y-3">
                {[
                  { label: 'Consulta Guiada', action: () => setIsGeneralFormOpen(true) },
                  { label: 'Especialistas', action: () => navigate('/patient/results') },
                  { label: 'Planes', action: handleShowPlans },
                ].map(({ label, action }) => (
                  <li key={label} className="font-outfit text-sm font-light cursor-pointer transition-colors"
                      style={{ color: 'rgba(255,255,255,.55)' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#ffffff'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.55)'}
                      onClick={action}>{label}</li>
                ))}
              </ul>
            </div>

            {/* Compañía */}
            <div>
              <h4 className="font-outfit text-[.72rem] uppercase tracking-[2.5px] mb-5" style={{ color: '#0ea5e9' }}>Compañía</h4>
              <ul className="space-y-3">
                {[
                  { label: 'Método Life', action: () => {} },
                  { label: 'Nosotros', action: () => setIsContactFormOpen(true) },
                  { label: 'Portal Profesional', action: () => navigate('/pro/login') },
                ].map(({ label, action }) => (
                  <li key={label} className="font-outfit text-sm font-light cursor-pointer transition-colors"
                      style={{ color: 'rgba(255,255,255,.55)' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#ffffff'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.55)'}
                      onClick={action}>{label}</li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-outfit text-[.72rem] uppercase tracking-[2.5px] mb-5" style={{ color: '#0ea5e9' }}>Legal</h4>
              <ul className="space-y-3">
                {['Privacidad', 'Términos'].map(label => (
                  <li key={label} className="font-outfit text-sm font-light cursor-pointer transition-colors"
                      style={{ color: 'rgba(255,255,255,.55)' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#ffffff'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.55)'}>{label}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8" style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
            <p className="font-outfit text-xs" style={{ color: 'rgba(255,255,255,.35)' }}>© 2026 Clínica Mas Life · Ovalle, Coquimbo y La Serena, Chile</p>
            <div className="flex gap-3">
              <a href="https://wa.me/56965329974" target="_blank" rel="noreferrer"
                 className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
                 style={{ background: 'rgba(255,255,255,.08)' }}
                 onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.15)'}
                 onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.08)'}>
                <svg className="w-4 h-4 fill-current" style={{ color: 'rgba(255,255,255,.55)' }} viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.767 5.767 0 1.267.408 2.438 1.103 3.394l-.717 2.63 2.7-.708c.846.541 1.847.851 2.923.851 3.181 0 5.767-2.586 5.767-5.767 0-3.181-2.586-5.767-5.767-5.767zm3.344 8.205c-.145.409-.838.74-1.164.786-.324.045-.72.079-2.315-.572-1.911-.781-3.142-2.723-3.238-2.85-.095-.126-.777-.963-.777-1.838s.454-1.306.616-1.467c.163-.162.355-.202.474-.202s.237.001.341.006c.108.005.253-.041.396.304.145.352.497 1.21.541 1.298.045.089.074.192.015.309-.059.117-.089.192-.178.297-.089.105-.187.234-.267.314s-.17.169-.074.335c.095.166.424.699.91 1.132.626.557 1.152.73 1.316.812.163.081.258.067.354-.044.095-.112.408-.48.517-.643.11-.163.22-.136.371-.081s.956.45 1.12.532c.164.081.274.121.314.192s.041.527-.104.935z"/></svg>
              </a>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
                   style={{ background: 'rgba(255,255,255,.08)' }}
                   onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.15)'}
                   onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.08)'}>
                <span className="material-icons-round text-base" style={{ color: 'rgba(255,255,255,.55)' }}>public</span>
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
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(14,165,233,.12)' }}>
                  <span className="material-icons-round text-xl" style={{ color: '#0284c7' }}>calendar_month</span>
                </div>
                <div>
                  <h3 className="font-display font-light text-xl sm:text-2xl" style={{ color: '#0f172a' }}>
                    {showPlanForm.isOpen ? `Solicitud ${showPlanForm.planName}` : 'Agendar Atención'}
                  </h3>
                  <p className="font-outfit text-xs" style={{ color: '#475569' }}>Completa tus datos para continuar</p>
                </div>
              </div>
              <button
                onClick={() => { setShowPlanForm({ isOpen: false, planName: '' }); setIsGeneralFormOpen(false); }}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
                style={{ background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(15,23,42,.06)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <span className="material-icons-round" style={{ color: '#475569' }}>close</span>
              </button>
            </div>

            <form onSubmit={(e) => handleFormSubmit(e, showPlanForm.isOpen ? showPlanForm.planName : 'Consulta General')} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-outfit text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#0ea5e9' }}>Nombre</label>
                  <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border" style={{ background: '#f0f9ff', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="Juan Pérez" />
                </div>
                <div>
                  <label className="font-outfit text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#0ea5e9' }}>WhatsApp</label>
                  <input required value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border" style={{ background: '#f0f9ff', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="+56 9..." />
                </div>
              </div>
              <div>
                <label className="font-outfit text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#0ea5e9' }}>Email</label>
                <input required type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border" style={{ background: '#f0f9ff', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="correo@ejemplo.com" />
              </div>
              <div>
                <label className="font-outfit text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#0ea5e9' }}>Condición o Motivo</label>
                <textarea required value={formData.condition} onChange={e => setFormData({ ...formData, condition: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border h-28 resize-none" style={{ background: '#f0f9ff', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="Describe brevemente tu situación..." />
              </div>
              <button type="submit" className="w-full py-4 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                      style={{ background: '#0284c7', boxShadow: '0 12px 30px -10px rgba(2,132,199,.45)' }}>
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
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(14,165,233,.12)' }}>
                  <span className="material-icons-round text-xl" style={{ color: '#0284c7' }}>mark_email_unread</span>
                </div>
                <div>
                  <h3 className="font-display font-light text-xl sm:text-2xl" style={{ color: '#0f172a' }}>Contáctenos</h3>
                  <p className="font-outfit text-xs" style={{ color: '#475569' }}>Te llamamos a la brevedad</p>
                </div>
              </div>
              <button
                onClick={() => setIsContactFormOpen(false)}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
                style={{ background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(15,23,42,.06)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <span className="material-icons-round" style={{ color: '#475569' }}>close</span>
              </button>
            </div>

            <form onSubmit={handleContactSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-outfit text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#0ea5e9' }}>Nombre</label>
                  <input required value={contactData.name} onChange={e => setContactData({ ...contactData, name: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border" style={{ background: '#f0f9ff', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="María González" />
                </div>
                <div>
                  <label className="font-outfit text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#0ea5e9' }}>WhatsApp / Teléfono</label>
                  <input required value={contactData.phone} onChange={e => setContactData({ ...contactData, phone: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border" style={{ background: '#f0f9ff', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="+56 9..." />
                </div>
              </div>
              <div>
                <label className="font-outfit text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#0ea5e9' }}>Email</label>
                <input required type="email" value={contactData.email} onChange={e => setContactData({ ...contactData, email: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border" style={{ background: '#f0f9ff', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="correo@ejemplo.com" />
              </div>
              <div>
                <label className="font-outfit text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#0ea5e9' }}>¿En qué te podemos ayudar?</label>
                <textarea required value={contactData.message} onChange={e => setContactData({ ...contactData, message: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border h-28 resize-none" style={{ background: '#f0f9ff', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="Cuéntanos tu caso o consulta..." />
              </div>
              <button type="submit" className="w-full py-4 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                      style={{ background: '#0284c7', boxShadow: '0 12px 30px -10px rgba(2,132,199,.45)' }}>
                <span className="material-icons-round text-base">send</span>
                Enviar Solicitud de Contacto
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Custom cursor — visible solo en desktop */}
      <div ref={cursorDotRef} className="cursor-dot" />
      <div ref={cursorRingRef} className="cursor-ring" />
    </div>
  );
};

export default MainHome;
