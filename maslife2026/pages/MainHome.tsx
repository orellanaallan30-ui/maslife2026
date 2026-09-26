
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import logoClinica from '../assets/logo-clinica.png';
import { supabase } from '../supabaseClient';

declare global {
  interface Window { gsap: any; ScrollTrigger: any; Lenis: any; }
}

const PROFESIONALES = [
  { id: 1, nombre: 'Kinesiología', especialidad: 'Rehabilitación · Movimiento', rol: 'SELLO MÁSLIFE',
    foto: 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?q=80&w=300&fit=crop',
    color: 'from-cyan-400 to-blue-500' },
  { id: 2, nombre: 'Psicología', especialidad: 'Salud Mental · Bienestar', rol: 'SELLO MÁSLIFE',
    foto: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?q=80&w=300&fit=crop',
    color: 'from-blue-400 to-indigo-500' },
  { id: 3, nombre: 'Nutrición', especialidad: 'Alimentación · Hábitos', rol: 'SELLO MÁSLIFE',
    foto: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=300&fit=crop',
    color: 'from-teal-400 to-emerald-500' },
];

// ── RESPONSIVE: posiciones mobile (base) y desktop (lg:) para tarjetas del hero
const CARD_POSITIONS = [
  'top-8 left-0 z-20',
  'top-40 left-[155px] lg:left-[185px] z-10',
  'top-4 left-[295px] lg:left-[355px] z-0',
];

const MainHome: React.FC<{ etiqueta?: string }> = ({ etiqueta }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showKinePlans, setShowKinePlans] = useState(false);
  const [showPlanForm, setShowPlanForm] = useState<{ isOpen: boolean; planName: string }>({ isOpen: false, planName: '' });
  const [isGeneralFormOpen, setIsGeneralFormOpen] = useState(false);
  const [isContactFormOpen, setIsContactFormOpen] = useState(false);
  const [showVideoTestimonio, setShowVideoTestimonio] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', condition: '' });
  const [contactData, setContactData] = useState({ name: '', phone: '', email: '', message: '' });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [charlaFormOpen, setCharlaFormOpen] = useState(false);
  const [charlaForm, setCharlaForm] = useState({ nombre: '', email: '', celular: '' });
  const [charlaSubmitting, setCharlaSubmitting] = useState(false);
  const [charlaSuccess, setCharlaSuccess] = useState(false);
  const [charlaError, setCharlaError] = useState('');

  const handleCharlaSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setCharlaError('');
    if (!charlaForm.nombre.trim()) return setCharlaError('Ingresa tu nombre.');
    if (!charlaForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(charlaForm.email)) return setCharlaError('Ingresa un email válido.');
    setCharlaSubmitting(true);
    const { error } = await supabase.from('charla_registrations').insert({
      charla_id: null,
      charla_titulo: 'Suscripción general — notificaciones de charlas',
      nombre: charlaForm.nombre.trim(),
      email: charlaForm.email.trim().toLowerCase(),
      celular: charlaForm.celular.trim() || null,
      acepta_comunicaciones: true,
    });
    setCharlaSubmitting(false);
    if (error) { setCharlaError('Ocurrió un error. Intenta de nuevo.'); }
    else { setCharlaSuccess(true); }
  };
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
      gsap.fromTo(manifestoRef.current.querySelectorAll('.word-reveal'), { opacity: 0.15 }, {
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
      img: 'https://qhtfjbbdxtmqhstzkyrw.supabase.co/storage/v1/object/public/assets/kine.jpg',
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
      img: 'https://qhtfjbbdxtmqhstzkyrw.supabase.co/storage/v1/object/public/assets/nuti.jpg',
      alt: 'Nutricionista realizando evaluación nutricional en Clínica Mas Life',
      cta: 'Buscar profesional'
    },
    {
      name: 'Fonoaudiología',
      desc: 'Especialistas en comunicación, habla y deglución.',
      img: 'https://qhtfjbbdxtmqhstzkyrw.supabase.co/storage/v1/object/public/assets/fono.png',
      alt: 'Fonoaudiólogo atendiendo paciente en Clínica Mas Life',
      cta: 'Buscar profesional'
    },
    {
      name: 'Podología',
      desc: 'Cuidado profesional del pie y tratamiento de patologías podológicas.',
      img: 'https://qhtfjbbdxtmqhstzkyrw.supabase.co/storage/v1/object/public/assets/podo.jpg',
      alt: 'Podóloga realizando tratamiento de pie en Clínica Mas Life',
      cta: 'Buscar profesional'
    },
    {
      name: 'Terapia Ocupacional',
      desc: 'Rehabilitación funcional para mejorar autonomía y calidad de vida.',
      img: 'https://qhtfjbbdxtmqhstzkyrw.supabase.co/storage/v1/object/public/assets/ocupacional.jpg',
      alt: 'Terapeuta ocupacional trabajando con niño en Clínica Mas Life',
      cta: 'Buscar profesional'
    },
    {
      name: 'Téc. en Enfermería',
      desc: 'Atención domiciliaria y procedimientos de enfermería certificados.',
      img: 'https://qhtfjbbdxtmqhstzkyrw.supabase.co/storage/v1/object/public/assets/tens.jpg',
      alt: 'Técnico en enfermería atendiendo paciente a domicilio en Clínica Mas Life',
      cta: 'Buscar profesional'
    },
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
      color: 'border-[#00a89e] ring-4 ring-[#e3f3f1] scale-[1.02] z-10 shadow-md',
      btnColor: 'bg-[#007a73] text-white hover:bg-[#0f3d3a]',
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
    { text: 'Mi terapeuta ocupacional me ayudó a recuperar la independencia después de mi accidente. Eternamente agradecida con Clínica Mas Life.', name: 'Patricia L.', role: 'PACIENTE TERAPIA OCUPACIONAL', stars: 5 },
    { text: 'La consulta online fue muy profesional. Cómodo para quienes trabajamos todo el día. Me habría gustado más opciones de horario, pero en general excelente.', name: 'Andrés F.', role: 'PACIENTE ONLINE', stars: 4 },
    { text: 'Mi hijo de 4 años avanzó mucho más rápido con la fonoaudióloga de Clínica Mas Life. La paciencia y dedicación fueron extraordinarias.', name: 'Camila R.', role: 'MADRE DE PACIENTE', stars: 5 },
    { text: 'El seguimiento por WhatsApp después de cada sesión es un detalle que marca la diferencia. Te sientes acompañado todo el proceso.', name: 'Fernando G.', role: 'PACIENTE KINESIOLOGÍA', stars: 5 },
    { text: 'Probé con varios nutricionistas antes y ninguno entendió mis necesidades como la profesional que me asignaron aquí.', name: 'Valentina M.', role: 'PACIENTE DE NUTRICIÓN', stars: 5 },
    { text: 'La podóloga que me atendió fue muy profesional. Resolvió un problema que arrastraba hace meses en solo 3 sesiones.', name: 'Roberto C.', role: 'PACIENTE PODOLOGÍA', stars: 5 },
    { text: 'Buena plataforma. Reservé en minutos y el profesional llegó puntual a mi domicilio. Quizás falta un poco más de variedad de especialistas en Ovalle.', name: 'Isidora P.', role: 'PACIENTE DOMICILIO', stars: 4 },
    { text: 'Mi psicólogo de Clínica Mas Life me ayudó a manejar el estrés laboral de una forma que nunca imaginé posible. Gracias por existir.', name: 'Diego T.', role: 'PACIENTE PSICOLOGÍA', stars: 5 },
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

  useEffect(() => {
    const target = sessionStorage.getItem('maslife_scrollTo');
    if (target) {
      sessionStorage.removeItem('maslife_scrollTo');
      setTimeout(() => {
        document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
  }, []);

  return (
    <div id="main-home-scroll" className="landing-page w-full h-full overflow-y-auto font-sans scroll-smooth relative" style={{ background: '#ffffff', color: '#0f172a' }}>

      {/* ═══════════════════ NAVBAR ═══════════════════ */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-[6vw]"
        style={{
          height: '76px',
          color: scrollY > 80 ? '#0f172a' : '#0f172a',
          background: scrollY > 80 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(0,168,158,0.1)',
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
            className="w-auto object-contain h-28 lg:h-32"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="hidden font-display text-lg font-light tracking-wide ml-2">AgendaMás<span style={{ opacity:.6 }}>Life</span></span>
        </div>

        {/* ── RESPONSIVE: Desktop Nav — oculto mobile, visible lg:desktop ── */}
        <div className="hidden lg:flex items-center gap-7">
          {[
            { label: 'Cómo funciona', id: 'como-funciona' },
            { label: 'Especialidades', id: 'especialidades' },
            { label: 'Testimonios', id: 'testimonios' },
            { label: 'Filosofía', id: 'filosofia' },
          ].map(({ label, id }) => (
            <button key={id} onClick={() => scrollToSection(id)}
              className="text-[.8rem] font-medium uppercase tracking-[0.04em] opacity-80 hover:opacity-100 transition-opacity"
              style={{ color: 'inherit' }}>
              {label}
            </button>
          ))}
          <button onClick={() => navigate('/patient/results')}
            className="text-[.8rem] font-medium uppercase tracking-[0.04em] opacity-80 hover:opacity-100 transition-opacity"
            style={{ color: 'inherit' }}>
            Buscar profesionales
          </button>
          <button onClick={() => setIsGeneralFormOpen(true)}
            className="text-[.8rem] font-semibold px-5 py-2.5 rounded-full text-white transition-all hover:shadow-lg hover:-translate-y-px"
            style={{ background: '#007a73' }}>
            Agendar
          </button>
        </div>

        {/* Mobile Button — oculto en lg:desktop, touch target 44px mínimo ── */}
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden w-11 h-11 flex items-center justify-center" style={{ color: 'inherit' }}>
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
              { label: 'Testimonios', id: 'testimonios' },
              { label: 'Filosofía', id: 'filosofia' },
            ].map(({ label, id }) => (
              <button key={id} onClick={() => { scrollToSection(id); setMobileMenuOpen(false); }}
                className="w-full text-left font-display text-3xl font-light tracking-tight" style={{ color: '#0f172a' }}>
                {label}
              </button>
            ))}
            <button
              onClick={() => { navigate('/patient/results'); setMobileMenuOpen(false); }}
              className="w-full text-left font-display text-3xl font-light tracking-tight" style={{ color: '#0f172a' }}>
              Buscar profesionales
            </button>
            <button
              onClick={() => { setIsGeneralFormOpen(true); setMobileMenuOpen(false); }}
              className="w-full text-left font-display text-3xl font-semibold tracking-tight"
              style={{ color: '#007a73' }}>
              Agendar →
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════ HERO SECTION ═══════════════════ */}
      <section ref={heroRef} id="hero" className="relative min-h-screen flex items-center overflow-hidden"
               style={{ background: '#f4f8f7' }}>

        {/* Imagen hero — solo mobile, acento superior derecho con degradé */}
        <div className="absolute top-0 right-0 w-[64%] max-w-[380px] lg:hidden pointer-events-none" style={{ height: '58%' }}>

          <img
            src="/hero-profesional.jpg"
            alt=""
            className="w-full h-full object-cover object-[center_top]"
            draggable={false}
          />
          {/* Degradé izquierda — solo blanco en el borde, deja ver más la imagen */}
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(to right, #f4f8f7 0%, rgba(244,248,247,0.85) 14%, rgba(244,248,247,0.35) 34%, transparent 58%)'
          }} />
          {/* Degradé abajo — funde con el contenido */}
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(to top, #f4f8f7 0%, rgba(244,248,247,0.8) 24%, transparent 55%)'
          }} />
        </div>

        {/* Contenido — RESPONSIVE: mobile usa padding top para librar nav; desktop centra vertical */}
        <div className="relative z-10 max-w-7xl mx-auto px-[6vw] pt-28 pb-20 lg:py-28 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* Columna izquierda — texto */}
            <div className="max-w-xl lg:max-w-2xl relative z-10">
              {/* ── RESPONSIVE: badge — base=mobile  lg:=desktop ── */}
              <span className="inline-block text-[.6rem] lg:text-xs font-sans font-bold uppercase tracking-[.5px] mb-7 px-3 py-1 rounded-full text-white"
                    style={{ background: '#007a73' }}>
                {etiqueta ?? 'Profesionales de salud cerca de ti'}
              </span>

              {/* Título Fraunces */}
              <div ref={heroTitleRef} className="mb-8" style={{ overflow: 'hidden' }}>
                {/* ── RESPONSIVE: título — mobile escala agresivo con vw angosto, desktop empieza desde 4rem ── */}
                <div className="font-display text-[clamp(2.9rem,10vw,5.5rem)] lg:text-[clamp(4rem,6vw,7.5rem)] leading-[.96] tracking-tight" style={{ color: '#0f172a' }}>
                  {[
                    { text: 'Tu salud,' },
                    { text: 'en buenas' },
                    { text: 'manos.' },
                  ].map((line, li) => (
                    <div key={li} className="overflow-hidden">
                      <span className="hero-word inline-block">
                        {line.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── RESPONSIVE: subtítulo — base=mobile sm:intermedio lg:desktop ── */}
              <p className="font-sans font-light text-base sm:text-lg lg:text-xl max-w-lg leading-relaxed mb-10" style={{ color: '#475569' }}>
                Kinesiología, psicología, nutrición y más — con profesionales verificados en{' '}
                <strong className="font-semibold" style={{ color: '#0f172a' }}>Ovalle, Coquimbo y La Serena</strong>.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => navigate('/patient/results')}
                  className="group inline-flex items-center gap-3 px-8 py-4 rounded-full text-base font-sans font-semibold transition-all duration-300 hover:-translate-y-1"
                  style={{ background: '#007a73', color: '#fff', boxShadow: '0 1px 2px rgba(15,23,42,.08)' }}>
                  Buscar especialista
                  <span className="material-icons-round text-base group-hover:translate-x-1 transition-transform">search</span>
                </button>
                <button
                  onClick={() => setIsGeneralFormOpen(true)}
                  className="inline-flex items-center gap-3 px-8 py-4 rounded-full text-base font-sans font-semibold border transition-all duration-300 hover:-translate-y-1"
                  style={{
                    background: 'rgba(0,168,158,.07)',
                    color: '#007a73',
                    borderColor: 'rgba(0,168,158,.3)',
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
                  <div key={label} className="flex items-center gap-2 text-xs lg:text-sm font-medium" style={{ color: '#475569' }}>
                    <span className="material-icons-round text-base" style={{ color: '#00a89e' }}>{icon}</span>
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Columna derecha — imagen hero (desktop) */}
            <div className="relative hidden lg:flex items-center justify-end mt-10 lg:mt-0">
              <div className="relative w-full max-w-[520px] h-[clamp(440px,68vh,580px)] rounded-3xl overflow-hidden shadow-2xl">
                <img
                  src="/hero-profesional.jpg"
                  alt="Profesional de salud Clínica Mas Life"
                  className="w-full h-full object-cover object-[center_top]"
                  draggable={false}
                />
                <div className="absolute inset-0" style={{
                  background: 'linear-gradient(to left, transparent 60%, rgba(255,255,255,0.18) 100%)'
                }} />
              </div>
            </div>

          </div>
        </div>

      </section>

      {/* ═══════════════════ STATS BAR ═══════════════════ */}
      {/* ── RESPONSIVE: stats bar — px base=mobile lg:=desktop ── */}
      <div className="py-12 px-[6vw]" style={{ background: '#0f3d3a' }}>
        {/* ── RESPONSIVE: stats — base=2col mobile, lg:=4col desktop ── */}
        <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { num: '500+', label: 'Sesiones Realizadas' },
            { num: '8', label: 'Especialidades' },
            { num: '4.9', label: 'Satisfacción' },
            { num: '3', label: 'Ciudades + Online' },
          ].map((stat, i) => (
            <div key={i} data-reveal={`stat-${i}`} className={`text-center ${rv(`stat-${i}`)}`} style={{ transitionDelay: `${i * 100}ms` }}>
              <p className="font-display font-normal text-2xl lg:text-4xl tracking-tight text-white">{stat.num}</p>
              <p className="font-sans text-[.72rem] uppercase tracking-[0.04em] mt-1" style={{ color: 'rgba(201,236,232,.85)' }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════ MANIFESTO ═══════════════════ */}
      {/* ── RESPONSIVE: filosofía — py base=mobile (10vh) lg:=desktop (18vh) ── */}
      <section id="filosofia" className="relative overflow-hidden flex items-center px-[6vw] py-[7vh] lg:py-[11vh]" style={{ minHeight: '60vh', background: '#ffffff' }}>

        <div className="max-w-5xl mx-auto flex gap-8 items-stretch">
          {/* Borde izquierdo acento */}
          <div style={{ width: '4px', borderRadius: '4px', background: '#00a89e', flexShrink: 0 }} />

          <div>
            {/* Badge Filosofía */}
            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-white font-bold uppercase mb-8"
              style={{ fontSize: '.78rem', letterSpacing: '3px', background: '#007a73' }}>
              Filosofía
            </span>

            {/* Texto manifesto */}
            <div
              ref={manifestoRef}
              className="font-display font-normal leading-[1.3]"
              style={{ fontSize: 'clamp(1.65rem,4.2vw,3.2rem)', letterSpacing: '-.4px', color: '#0f172a' }}
            >
              {"Agenda Maslife conecta pacientes con los mejores especialistas de salud en Chile, entregando acceso rápido, profesional y sin barreras a la atención que necesitas, cuando más lo necesitas.".split(' ').map((word, i) => (
                <span key={i} className="word-reveal"> {word}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ COMO FUNCIONA ═══════════════════ */}
      {/* ── RESPONSIVE: padding — base=mobile (menos vh) lg:=desktop ── */}
      <section id="como-funciona" className="px-[6vw] py-[7vh] lg:py-[11vh]" style={{ background: '#ffffff' }}>
        <div className="max-w-7xl mx-auto">
          <div className="max-w-xl mb-[6vh]">
            <p className="font-sans text-[.78rem] uppercase tracking-[0.05em] mb-5" style={{ color: '#007a73' }}>Proceso simple</p>
            <h2 className="font-display font-normal leading-[1.05]" style={{ fontSize: 'clamp(2rem,5vw,3.6rem)', letterSpacing: '-1px', color: '#0f172a' }}>
              Menos administración.<br />Más presencia.
            </h2>
            <p className="font-sans font-light text-base mt-5 leading-relaxed" style={{ color: '#475569' }}>
              Domicilio · Online · Presencial — en Ovalle, Coquimbo y La Serena.
            </p>
          </div>

          <div ref={featuresRef} className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-8">
            {[
              { icon: 'assignment', step: '01', title: 'Rellenas el formulario', desc: 'Tu información y requerimiento, en segundos.' },
              { icon: 'groups', step: '02', title: 'Asignación profesional', desc: 'Un agente revisa y te asigna el especialista ideal.' },
              { icon: 'event_available', step: '03', title: 'Primera cita', desc: 'El profesional te contacta y coordinan juntos el primer encuentro.' },
            ].map((step, i) => (
              <div key={i} data-reveal={`step-${i}`}
                className={`feature-card relative overflow-hidden rounded-[18px] p-10 transition-all duration-500 ${rv(`step-${i}`)}`}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  transitionDelay: `${i * 150}ms`,
                  cursor: 'default',
                }}
              >
                {/* Icono */}
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-2"
                  style={{ background: '#e3f3f1' }}>
                  <span className="material-icons-round text-xl" style={{ color: '#007a73' }}>{step.icon}</span>
                </div>
                <p className="font-sans text-[.78rem] tracking-[0.04em] uppercase mb-4 font-bold" style={{ color: '#007a73' }}>{step.step}</p>
                <h4 className="font-display font-normal text-xl mb-3 leading-tight" style={{ color: '#0f172a' }}>{step.title}</h4>
                <p className="font-sans font-light text-[.93rem] leading-[1.65]" style={{ color: '#475569' }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ CHARLAS GRATUITAS ═══════════════════ */}
      <section id="charlas" className="px-[6vw] py-14 lg:py-20" style={{ background: '#f0fdfa' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 items-center">

            {/* Texto izquierda */}
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 bg-teal-100 text-teal-700 text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
                <span className="material-icons-round text-sm">videocam</span>
                Google Meet · Sin costo
              </div>
              <h2 className="text-3xl lg:text-4xl font-black text-slate-900 leading-tight mb-4">
                Charlas gratuitas<br className="hidden lg:block" /> de salud en vivo
              </h2>
              <p className="text-slate-600 text-base lg:text-lg leading-relaxed mb-6">
                Aprende con los profesionales de Clínica Mas Life sobre nutrición, kinesiología, dolor crónico, salud mental y más. Charlas prácticas, en vivo, sin costo.
              </p>
              <div className="flex flex-wrap gap-3 mb-6">
                {['Nutrición', 'Kinesiología', 'Dolor crónico', 'Salud mental', 'Deporte'].map(tag => (
                  <span key={tag} className="bg-white border border-teal-200 text-teal-700 text-xs font-black px-3 py-1.5 rounded-full shadow-sm">
                    {tag}
                  </span>
                ))}
              </div>
              <button onClick={() => navigate('/charlas')}
                className="inline-flex items-center gap-2 text-[#007a73] hover:text-[#0f3d3a] font-black text-sm transition-colors underline underline-offset-2">
                <span className="material-icons-round text-base">arrow_forward</span>
                Ver todas las charlas disponibles
              </button>
            </div>

            {/* Formulario derecha */}
            <div className="w-full lg:w-[420px] shrink-0">
              <div className="bg-white rounded-3xl border border-teal-100 shadow-xl p-6 lg:p-8">
                {charlaSuccess ? (
                  <div className="text-center py-6">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="material-icons-round text-emerald-500 text-3xl">check_circle</span>
                    </div>
                    <h4 className="text-lg font-black text-slate-900 mb-2">¡Gracias por inscribirte!</h4>
                    <p className="text-slate-500 text-sm">Te avisaremos por email cada vez que haya una nueva charla gratuita.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div>
                      <p className="text-xs font-black text-[#007a73] uppercase tracking-widest mb-1">Únete a la comunidad</p>
                      <h3 className="text-xl font-black text-slate-900 leading-snug">Recibe notificaciones de próximas charlas</h3>
                    </div>

                    {/* Campos — se revelan al hacer click en "Quiero enterarme" */}
                    {charlaFormOpen && (
                      <form onSubmit={handleCharlaSubscribe} className="flex flex-col gap-3">
                        <div>
                          <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Nombre *</label>
                          <input value={charlaForm.nombre} onChange={e => setCharlaForm(f => ({ ...f, nombre: e.target.value }))}
                            placeholder="Tu nombre" autoFocus
                            className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white transition-all" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Email *</label>
                          <input type="email" value={charlaForm.email} onChange={e => setCharlaForm(f => ({ ...f, email: e.target.value }))}
                            placeholder="tu@email.com"
                            className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white transition-all" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Celular <span className="text-slate-400 font-medium normal-case tracking-normal">(opcional)</span></label>
                          <input value={charlaForm.celular} onChange={e => setCharlaForm(f => ({ ...f, celular: e.target.value }))}
                            placeholder="+56 9 ..."
                            className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white transition-all" />
                        </div>
                        {charlaError && (
                          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2">
                            <span className="material-icons-round text-rose-500 text-base shrink-0 mt-0.5">error</span>
                            <p className="text-sm text-rose-700 font-medium">{charlaError}</p>
                          </div>
                        )}
                        <button type="submit" disabled={charlaSubmitting}
                          className="w-full py-3.5 bg-[#007a73] text-white rounded-2xl font-black text-sm hover:bg-[#0f3d3a] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                          {charlaSubmitting ? (
                            <><span className="material-icons-round text-base animate-spin">sync</span>Enviando...</>
                          ) : (
                            <><span className="material-icons-round text-base">send</span>Enviar</>
                          )}
                        </button>
                      </form>
                    )}

                    {!charlaFormOpen && (
                      <button onClick={() => setCharlaFormOpen(true)}
                        className="w-full py-3.5 bg-[#007a73] text-white rounded-2xl font-black text-sm hover:bg-[#0f3d3a] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                        <span className="material-icons-round text-base">notifications</span>
                        Quiero enterarme
                      </button>
                    )}

                    <p className="text-[11px] text-slate-500 text-center">Sin spam · Solo charlas de salud · Puedes darte de baja cuando quieras</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════════════ ÁREAS PROFESIONALES ═══════════════════ */}
      {/* ═══════════════════ ESPECIALIDADES ═══════════════════ */}
      {/* ── RESPONSIVE: especialidades — padding unificado con hero (6vw), py mobile/desktop separados ── */}
      <section id="especialidades" className="px-[6vw] py-14 lg:py-28" style={{ background: '#ffffff' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-12 gap-4">
            <div>
              <p className="font-sans text-[.78rem] uppercase tracking-[0.05em] mb-3" style={{ color: '#007a73' }}>Nuestro equipo</p>
              <h2 className="font-display font-normal leading-[1.05]" style={{ fontSize: 'clamp(1.8rem,4vw,3rem)', letterSpacing: '-1px', color: '#0f172a' }}>Selecciona un área y agenda</h2>
              <p className="font-sans text-sm font-light mt-1" style={{ color: '#475569' }}>con un profesional directamente</p>
            </div>
            <div className="flex rounded-full p-1 border" style={{ background: 'rgba(255,255,255,.5)', borderColor: 'rgba(15,23,42,.12)' }}>
              <button
                onClick={() => setActiveSpecFilter('destacados')}
                className="px-5 py-2 rounded-full text-xs font-medium transition-all"
                style={{ background: activeSpecFilter === 'destacados' ? '#007a73' : 'transparent', color: activeSpecFilter === 'destacados' ? '#fff' : '#475569' }}
              >Destacados</button>
              <button
                onClick={() => setActiveSpecFilter('todos')}
                className="px-5 py-2 rounded-full text-xs font-medium transition-all"
                style={{ background: activeSpecFilter === 'todos' ? '#007a73' : 'transparent', color: activeSpecFilter === 'todos' ? '#fff' : '#475569' }}
              >Todos</button>
            </div>
          </div>

          {/* Specialty Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {(activeSpecFilter === 'destacados' ? specialtyCards.slice(0, 4) : specialtyCards).map((card, i) => (
              <div key={i} className="group bg-white rounded-2xl sm:rounded-3xl overflow-hidden transition-all duration-300 cursor-pointer"
                   style={{ border: '1px solid rgba(15,23,42,.1)', boxShadow: 'none' }}
                   onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 24px 48px -18px rgba(15,23,42,.22)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; }}
                   onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.transform = ''; }}
                   onClick={() => navigate('/patient/results')}>
                <div className="aspect-[4/3] overflow-hidden">
                  <img src={card.img} alt={card.alt || card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-4 sm:p-5">
                  <h4 className="font-display font-normal text-sm sm:text-base mb-1 leading-snug" style={{ color: '#0f172a' }}>{card.name}</h4>
                  <p className="font-sans text-xs sm:text-sm font-light leading-relaxed mb-3 line-clamp-2" style={{ color: '#475569' }}>{card.desc}</p>
                  <button className="flex items-center gap-1.5 text-xs font-medium transition-all group-hover:gap-2.5" style={{ color: '#007a73' }}>
                    {card.cta}
                    <span className="material-icons-round text-sm">arrow_forward</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ PLANES KINESIOLÓGICOS (CONDICIONAL) ═══════════════════ */}
      {/* ── RESPONSIVE: planes kiné — padding base=mobile lg:=desktop ── */}
      {showKinePlans && (
        <section id="kine-plans" className="px-[6vw] py-14 lg:py-28" style={{ background: '#f4f8f7', animation: 'fadeIn .5s ease-out' }}>
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-14">
              <p className="font-sans text-[.78rem] uppercase tracking-[0.05em] mb-5" style={{ color: '#007a73' }}>Atención a domicilio</p>
              <h2 className="font-display font-normal leading-[1.05]" style={{ fontSize: 'clamp(2rem,5vw,3.4rem)', letterSpacing: '-1px', color: '#0f172a' }}>
                Planes Kinesiológicos a Domicilio
              </h2>
              <p className="font-sans font-light text-base sm:text-lg max-w-2xl mx-auto mt-4" style={{ color: '#475569' }}>Rehabilitación kinesiológica profesional en casa, reembolsable por seguros e Isapre.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-stretch">
              {kinePlans.map((plan, i) => {
                const isFeatured = !!plan.badge;
                return (
                  <div key={i} className="bg-white rounded-3xl p-8 sm:p-10 flex flex-col h-full relative group transition-all duration-300"
                       style={{
                         border: isFeatured ? '2px solid #007a73' : '1px solid rgba(15,23,42,.12)',
                         boxShadow: isFeatured ? '0 32px 64px -24px rgba(0,122,115,.35)' : 'none',
                         transform: isFeatured ? 'scale(1.02)' : 'scale(1)',
                       }}
                       onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 32px 64px -24px rgba(15,23,42,.28)'; }}
                       onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = isFeatured ? '0 32px 64px -24px rgba(0,122,115,.35)' : 'none'; }}
                  >
                    {plan.badge && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-white px-6 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-lg whitespace-nowrap"
                           style={{ background: '#007a73' }}>
                        {plan.badge}
                      </div>
                    )}
                    <div className="mb-8">
                      <h3 className="font-display font-normal text-xl mb-3" style={{ color: '#0f172a' }}>{plan.name}</h3>
                      <p className="font-sans text-sm font-light" style={{ color: '#475569' }}>{plan.desc}</p>
                    </div>

                    <ul className="space-y-3 mb-8 flex-1">
                      {plan.features.map((feat, idx) => (
                        <li key={idx} className="flex items-center gap-3 font-sans text-sm" style={{ color: '#475569' }}>
                          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,168,158,.15)', color: '#007a73' }}>
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
                        ? { background: '#007a73', color: '#fff', border: 'none' }
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
      {/* ── RESPONSIVE: testimonios — padding base=mobile lg:=desktop ── */}
      <section id="testimonios" className="px-[6vw] py-14 lg:py-28 overflow-hidden" style={{ background: '#f4f8f7' }}>
        <div className="max-w-7xl mx-auto">
          <div className="mb-12 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <p className="font-sans text-[.78rem] uppercase tracking-[0.05em] mb-5" style={{ color: '#007a73' }}>Testimonios reales</p>
              <h2 className="font-display font-normal leading-[1.05]" style={{ fontSize: 'clamp(1.8rem,4vw,3rem)', letterSpacing: '-1px', color: '#0f172a' }}>Lo que dicen nuestros pacientes</h2>
            </div>
            <button
              onClick={() => setShowVideoTestimonio(true)}
              className="group flex items-center gap-4 text-left rounded-2xl bg-white border border-slate-200 p-3 pr-5 w-full sm:w-auto hover:border-[#00a89e] transition-colors"
            >
              <span className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#007a73' }}>
                <span className="material-icons-round text-white text-3xl">play_arrow</span>
              </span>
              <span>
                <span className="block font-sans text-sm font-semibold" style={{ color: '#0f172a' }}>Testimonio en video</span>
                <span className="block font-sans text-xs" style={{ color: '#475569' }}>Paciente real · ver en Instagram</span>
              </span>
            </button>
          </div>

          {/* Carrusel */}
          <div className="relative">
            <div className="overflow-hidden">
              <div
                className="flex transition-transform duration-700 ease-in-out"
                style={{ transform: `translateX(-${testimonialIndex * 100}%)` }}
              >
                {Array.from({ length: maxIndex + 1 }).map((_, pageIdx) => (
                  <div key={pageIdx} className="w-full flex-shrink-0 grid grid-cols-1 lg:grid-cols-3 gap-5 px-1">
                    {testimonials.slice(pageIdx * testimonialsPerView, pageIdx * testimonialsPerView + testimonialsPerView).map((t, i) => (
                      <div key={i} className="bg-white rounded-2xl p-6 sm:p-7" style={{ border: '1px solid rgba(15,23,42,.09)' }}>
                        <div className="flex gap-0.5 mb-4" style={{ color: '#007a73' }}>
                          {Array.from({ length: t.stars }).map((_, s) => (
                            <span key={s} className="material-icons-round text-sm">star</span>
                          ))}
                        </div>
                        <p className="font-sans font-light text-sm leading-relaxed mb-5 italic line-clamp-4" style={{ color: '#475569' }}>"{t.text}"</p>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,168,158,.15)' }}>
                            <span className="font-bold text-xs" style={{ color: '#0f3d3a' }}>{t.name.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="font-sans text-sm font-semibold" style={{ color: '#0f172a' }}>{t.name}</p>
                            <p className="font-sans text-[11px] font-medium uppercase tracking-wider" style={{ color: '#007a73' }}>{t.role}</p>
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
                  style={{ width: i === testimonialIndex ? '2rem' : '.5rem', background: i === testimonialIndex ? '#007a73' : 'rgba(15,23,42,.2)' }}
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
      {/* ── RESPONSIVE: CTA final — padding base=mobile lg:=desktop ── */}
      <section className="px-[6vw] py-16 lg:py-24 relative overflow-hidden"
               style={{ background: '#0f3d3a' }}>
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <p className="font-sans text-[.78rem] uppercase tracking-[0.05em] mb-6" style={{ color: 'rgba(201,236,232,.85)' }}>Comienza hoy</p>
          <h2 className="font-display font-normal leading-[1.0] mb-6" style={{ fontSize: 'clamp(2.2rem,6vw,4.5rem)', color: '#ffffff', letterSpacing: '-1.5px' }}>
            ¿Listo para<br />sentirte mejor?
          </h2>
          <p className="font-sans font-light text-base sm:text-lg max-w-xl mx-auto mb-10" style={{ color: 'rgba(255,255,255,.75)' }}>
            Profesionales verificados listos para atenderte. Agenda tu primera consulta hoy.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={() => setIsGeneralFormOpen(true)}
              className="px-8 py-4 rounded-full font-sans font-semibold text-sm transition-all hover:-translate-y-1"
              style={{ background: '#ffffff', color: '#007a73' }}
            >
              Agendar Atención
            </button>
            <button
              onClick={() => navigate('/patient/results')}
              className="px-8 py-4 rounded-full font-sans font-semibold text-sm border transition-all hover:-translate-y-1"
              style={{ background: 'rgba(255,255,255,.12)', color: '#ffffff', borderColor: 'rgba(255,255,255,.4)' }}
            >
              Explorar Especialistas
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════ FOOTER ═══════════════════ */}
      {/* ── RESPONSIVE: footer — base=mobile lg:=desktop ── */}
      <footer className="pt-12 lg:pt-20 pb-8 px-[6vw]" style={{ background: '#0f172a', color: '#f4f8f7' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-10 mb-10 lg:mb-14">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1 space-y-5">
              <div className="flex items-center">
                <img src={logoClinica} alt="Clínica Mas Life" className="h-14 w-auto object-contain" style={{ filter: 'brightness(0) invert(1)', opacity: .85 }} onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
              </div>
              <p className="font-sans font-light text-sm leading-relaxed max-w-xs" style={{ color: 'rgba(255,255,255,.55)' }}>
                Rediseñando la experiencia de salud a través de la calidez clínica y el compromiso humano.
              </p>
            </div>

            {/* Servicios */}
            <div>
              <h4 className="font-sans text-[.72rem] uppercase tracking-[0.05em] mb-5" style={{ color: '#00a89e' }}>Servicios</h4>
              <ul className="space-y-3">
                {[
                  { label: 'Consulta Guiada', action: () => setIsGeneralFormOpen(true) },
                  { label: 'Especialistas', action: () => navigate('/patient/results') },
                  { label: 'Planes', action: handleShowPlans },
                ].map(({ label, action }) => (
                  <li key={label} className="font-sans text-sm font-light cursor-pointer transition-colors"
                      style={{ color: 'rgba(255,255,255,.55)' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#ffffff'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.55)'}
                      onClick={action}>{label}</li>
                ))}
              </ul>
            </div>

            {/* Compañía */}
            <div>
              <h4 className="font-sans text-[.72rem] uppercase tracking-[0.05em] mb-5" style={{ color: '#00a89e' }}>Compañía</h4>
              <ul className="space-y-3">
                {[
                  { label: 'Método Life', action: () => {} },
                  { label: 'Nosotros', action: () => setIsContactFormOpen(true) },
                ].map(({ label, action }) => (
                  <li key={label} className="font-sans text-sm font-light cursor-pointer transition-colors"
                      style={{ color: 'rgba(255,255,255,.55)' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#ffffff'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.55)'}
                      onClick={action}>{label}</li>
                ))}
              </ul>
              <button onClick={() => navigate('/pro/login')}
                className="mt-4 font-sans text-sm font-semibold px-4 py-2 rounded-full border transition-all"
                style={{ borderColor: '#00a89e', color: '#00a89e' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#00a89e'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#00a89e'; }}>
                Ingresar como profesional
              </button>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-sans text-[.72rem] uppercase tracking-[0.05em] mb-5" style={{ color: '#00a89e' }}>Legal</h4>
              <ul className="space-y-3">
                {[{ label: 'Privacidad', href: '/privacidad' }, { label: 'Términos', href: '/terminos' }].map(({ label, href }) => (
                  <li key={label}>
                    <a href={href} className="font-sans text-sm font-light cursor-pointer transition-colors"
                       style={{ color: 'rgba(255,255,255,.55)', textDecoration: 'none' }}
                       onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#ffffff'}
                       onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.55)'}>{label}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8" style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
            <p className="font-sans text-xs" style={{ color: 'rgba(255,255,255,.6)' }}>© 2026 Clínica Mas Life · Ovalle, Coquimbo y La Serena, Chile</p>
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
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
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
          <div className="bg-white w-full max-w-lg rounded-3xl p-8 sm:p-10 shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90dvh] overflow-y-auto">
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,168,158,.12)' }}>
                  <span className="material-icons-round text-xl" style={{ color: '#007a73' }}>calendar_month</span>
                </div>
                <div>
                  <h3 className="font-display font-normal text-xl sm:text-2xl" style={{ color: '#0f172a' }}>
                    {showPlanForm.isOpen ? `Solicitud ${showPlanForm.planName}` : 'Agendar Atención'}
                  </h3>
                  <p className="font-sans text-xs" style={{ color: '#475569' }}>Completa tus datos para continuar</p>
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
                  <label className="font-sans text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#007a73' }}>Nombre</label>
                  <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border" style={{ background: '#f4f8f7', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="Juan Pérez" />
                </div>
                <div>
                  <label className="font-sans text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#007a73' }}>WhatsApp</label>
                  <input required value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border" style={{ background: '#f4f8f7', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="+56 9..." />
                </div>
              </div>
              <div>
                <label className="font-sans text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#007a73' }}>Email</label>
                <input required type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border" style={{ background: '#f4f8f7', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="correo@ejemplo.com" />
              </div>
              <div>
                <label className="font-sans text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#007a73' }}>Condición o Motivo</label>
                <textarea required value={formData.condition} onChange={e => setFormData({ ...formData, condition: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border h-28 resize-none" style={{ background: '#f4f8f7', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="Describe brevemente tu situación..." />
              </div>
              <button type="submit" className="w-full py-4 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                      style={{ background: '#007a73', boxShadow: '0 12px 30px -10px rgba(0,122,115,.45)' }}>
                <span className="material-icons-round text-base">send</span>
                Verificar Cobertura y Agenda
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════ MODAL: FORMULARIO CONTACTO ═══════════════════ */}
      {showVideoTestimonio && (
        <div className="fixed inset-0 bg-slate-950/80 z-[300] flex items-center justify-center p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setShowVideoTestimonio(false); }}>
          <div className="bg-white w-full max-w-[400px] rounded-2xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="font-sans text-sm font-semibold" style={{ color: '#0f172a' }}>Testimonio de un paciente</p>
              <button onClick={() => setShowVideoTestimonio(false)} aria-label="Cerrar" className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-100">
                <span className="material-icons-round text-slate-500">close</span>
              </button>
            </div>
            <iframe
              src="https://www.instagram.com/reel/DQC7GVYkWuM/embed"
              title="Testimonio en video de un paciente de Clínica Mas Life"
              className="w-full block"
              style={{ height: 'min(640px, calc(100dvh - 140px))', border: 0 }}
              allow="encrypted-media; picture-in-picture"
              allowFullScreen
            />
            <a href="https://www.instagram.com/reel/DQC7GVYkWuM/" target="_blank" rel="noopener noreferrer"
               className="block text-center py-3 font-sans text-xs font-semibold border-t border-slate-100" style={{ color: '#007a73' }}>
              Ver en Instagram
            </a>
          </div>
        </div>
      )}

      {isContactFormOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 sm:p-6" onClick={(e) => { if (e.target === e.currentTarget) setIsContactFormOpen(false); }}>
          <div className="bg-white w-full max-w-lg rounded-3xl p-8 sm:p-10 shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90dvh] overflow-y-auto">
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,168,158,.12)' }}>
                  <span className="material-icons-round text-xl" style={{ color: '#007a73' }}>mark_email_unread</span>
                </div>
                <div>
                  <h3 className="font-display font-normal text-xl sm:text-2xl" style={{ color: '#0f172a' }}>Contáctenos</h3>
                  <p className="font-sans text-xs" style={{ color: '#475569' }}>Te llamamos a la brevedad</p>
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
                  <label className="font-sans text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#007a73' }}>Nombre</label>
                  <input required value={contactData.name} onChange={e => setContactData({ ...contactData, name: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border" style={{ background: '#f4f8f7', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="María González" />
                </div>
                <div>
                  <label className="font-sans text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#007a73' }}>WhatsApp / Teléfono</label>
                  <input required value={contactData.phone} onChange={e => setContactData({ ...contactData, phone: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border" style={{ background: '#f4f8f7', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="+56 9..." />
                </div>
              </div>
              <div>
                <label className="font-sans text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#007a73' }}>Email</label>
                <input required type="email" value={contactData.email} onChange={e => setContactData({ ...contactData, email: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border" style={{ background: '#f4f8f7', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="correo@ejemplo.com" />
              </div>
              <div>
                <label className="font-sans text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1" style={{ color: '#007a73' }}>¿En qué te podemos ayudar?</label>
                <textarea required value={contactData.message} onChange={e => setContactData({ ...contactData, message: e.target.value })} className="w-full rounded-xl py-3 px-4 text-sm outline-none border h-28 resize-none" style={{ background: '#f4f8f7', borderColor: 'rgba(15,23,42,.12)', color: '#0f172a' }} placeholder="Cuéntanos tu caso o consulta..." />
              </div>
              <button type="submit" className="w-full py-4 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                      style={{ background: '#007a73', boxShadow: '0 12px 30px -10px rgba(0,122,115,.45)' }}>
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
