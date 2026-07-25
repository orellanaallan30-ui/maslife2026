import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import logoClinica from '../assets/logo-clinica.png';
import { trackSubscriptionClick } from '../analytics';
import { usePageMeta } from '../lib/seo';

// Landing "Agenda +Life" — estilo SaaS premium (Stripe/Linear/Calendly).
// Paleta del brief: azul #003366, naranjo CTA #FF6B00, cards #F8FAFC,
// texto #111827 / #6B7280, bordes #E5E7EB. Tipografía Inter (ya cargada).

const BLUE = '#003366';
const ORANGE = '#FF6B00';
const TEXT = '#111827';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';
const CARD = '#F8FAFC';

const INTER = { fontFamily: "'Inter', system-ui, sans-serif" };

// Fade-up estándar del brief: suave, 200-300ms, al entrar en viewport.
const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.3, ease: 'easeOut' as const },
};

const ProLanding: React.FC = () => {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  usePageMeta({
    title: 'Agenda +Life — Agenda inteligente con IA para profesionales de salud | 1 mes gratis',
    description: 'La agenda impulsada por IA que automatiza tu consulta: reservas online 24/7, pagos, fichas clínicas y recordatorios. Para kinesiólogos, nutricionistas, psicólogos y más. Primer mes gratis, sin tarjeta.',
    canonicalPath: '/unete',
  });

  const goRegister = () => { trackSubscriptionClick(); navigate('/pro/register'); };

  const benefits = [
    { icon: 'person_add', title: 'Consigue más pacientes', desc: 'Apareces en el buscador de Clínica +Life y tus pacientes reservan solos, 24/7.' },
    { icon: 'event_available', title: 'Agenda inteligente', desc: 'Bloqueos, citas recurrentes y disponibilidad en tiempo real, sin dobles reservas.' },
    { icon: 'notifications_active', title: 'Recordatorios automáticos', desc: 'Confirmaciones y recordatorios por email con invitación a calendario incluida.' },
    { icon: 'payments', title: 'Cobros online', desc: 'Cobra por adelantado con MercadoPago y reduce las inasistencias.' },
    { icon: 'clinical_notes', title: 'Historial clínico', desc: 'Fichas por especialidad, informes PDF, consentimientos y rutinas enviables.' },
    { icon: 'auto_awesome', title: 'IA integrada', desc: 'Asistente que redacta informes, resume fichas y te ayuda en cada sesión.' },
  ];

  const steps = [
    { n: '1', title: 'Regístrate', desc: 'Crea tu cuenta en minutos. Sin tarjeta.' },
    { n: '2', title: 'Configura tu agenda', desc: 'Servicios, precios y horarios disponibles.' },
    { n: '3', title: 'La IA trabaja por ti', desc: 'Reservas, recordatorios e informes automáticos.' },
    { n: '4', title: 'Atiende más pacientes', desc: 'Tu agenda se llena mientras tú te enfocas en atender.' },
  ];

  const features = [
    { icon: 'calendar_month', label: 'Agenda online' },
    { icon: 'event_repeat', label: 'Citas recurrentes' },
    { icon: 'chat', label: 'Envíos por WhatsApp' },
    { icon: 'mark_email_read', label: 'Confirmaciones automáticas' },
    { icon: 'credit_card', label: 'Pagos online' },
    { icon: 'auto_awesome', label: 'Asistente IA' },
    { icon: 'monitoring', label: 'Reportes e ingresos' },
    { icon: 'videocam', label: 'Videollamadas', soon: true },
    { icon: 'clinical_notes', label: 'Ficha clínica digital' },
    { icon: 'draw', label: 'Firma electrónica' },
    { icon: 'prescriptions', label: 'Recetas', soon: true },
    { icon: 'folder_shared', label: 'Documentos y PDF' },
  ];

  const testimonials = [
    { initials: 'RO', name: 'Rodrigo O.', role: 'Kinesiólogo', quote: 'Mis pacientes reservan solos y las rutinas les llegan por WhatsApp con imágenes. Me ahorro horas de administración a la semana.' },
    { initials: 'CM', name: 'Carla M.', role: 'Nutricionista', quote: 'El plan alimentario se envía en un clic y la ficha calcula todo automáticamente. Se ve profesional y a los pacientes les encanta.' },
    { initials: 'JS', name: 'Javiera S.', role: 'Psicóloga', quote: 'Agenda, pagos y ficha en un solo lugar. Lo que antes hacía en tres aplicaciones distintas ahora está todo integrado.' },
  ];

  const integrations = ['Google Calendar', 'Google Meet', 'WhatsApp Business', 'Mercado Pago', 'WebPay', 'Zoom', 'Google Drive', 'Gmail'];

  const faqs = [
    { q: '¿Cuánto cuesta Agenda +Life?', a: 'El plan Pro cuesta $24.990/mes. Todos los profesionales nuevos tienen el primer mes completamente gratis, con acceso a todas las funciones.' },
    { q: '¿Necesito tarjeta de crédito para probar?', a: 'No. Te registras, activas tu cuenta y usas la plataforma completa durante 30 días sin ingresar ningún medio de pago.' },
    { q: '¿Hay permanencia mínima o contrato?', a: 'No. Puedes cancelar cuando quieras, sin costos de salida ni letra chica.' },
    { q: '¿Cómo se protegen los datos de mis pacientes?', a: 'Los datos clínicos se almacenan cifrados con acceso restringido por profesional, en cumplimiento de la Ley 21.719 de protección de datos personales de Chile.' },
    { q: '¿Cómo recibo los pagos de mis pacientes?', a: 'Conectas tu cuenta de MercadoPago y los pagos de las reservas llegan directo a ti. La plataforma no retiene tu dinero.' },
    { q: '¿Sirve para mi especialidad?', a: 'Sí. Hay fichas específicas para kinesiología, nutrición, psicología y terapia ocupacional, y una ficha configurable con campos personalizados para cualquier otra especialidad.' },
  ];

  const orangeBtn = 'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0';

  return (
    <div className="landing-page w-full h-full overflow-y-auto scroll-smooth relative bg-white" style={{ ...INTER, color: TEXT }}>

      {/* ═══════════ NAVBAR ═══════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 lg:px-[6vw]"
        style={{ height: 72, background: 'rgba(255,255,255,.9)', backdropFilter: 'blur(14px)', borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-2 cursor-pointer shrink-0" onClick={() => navigate('/')}>
          <img src={logoClinica} alt="Clínica +Life" className="w-auto object-contain h-20 lg:h-24"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span className="hidden lg:inline text-sm font-bold" style={{ color: BLUE }}>Agenda +Life</span>
        </div>
        <div className="flex items-center gap-2 lg:gap-4">
          <button onClick={() => navigate('/pro/login')}
            className="text-sm font-medium px-3 py-2 rounded-xl transition-colors hover:bg-slate-50" style={{ color: MUTED }}>
            Iniciar sesión
          </button>
          <button onClick={goRegister}
            className={`${orangeBtn} text-sm px-5 py-2.5`}
            style={{ background: ORANGE, boxShadow: '0 8px 24px -10px rgba(255,107,0,.55)' }}>
            Quiero mi mes gratis
          </button>
        </div>
      </nav>

      {/* ═══════════ HERO ═══════════ */}
      <section className="relative min-h-screen flex items-center px-5 lg:px-[6vw] pt-28 pb-16 lg:py-0 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true"
          style={{ background: 'radial-gradient(ellipse 70% 50% at 85% 20%, rgba(0,51,102,.05), transparent 60%)' }} />
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center relative z-10">

          {/* Izquierda: mensaje */}
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
            <span className="inline-block text-[11px] font-semibold px-3 py-1.5 rounded-full mb-6"
              style={{ background: CARD, border: `1px solid ${BORDER}`, color: BLUE }}>
              Un subproducto de Clínica +Life
            </span>
            <h1 className="text-[clamp(2.3rem,7vw,3.6rem)] font-extrabold leading-[1.05] tracking-tight mb-6" style={{ color: TEXT }}>
              Haz crecer tus servicios con <span style={{ color: BLUE }}>Agenda +Life</span>
            </h1>
            <p className="text-base lg:text-lg font-normal leading-relaxed mb-8 max-w-lg" style={{ color: MUTED }}>
              La agenda inteligente impulsada por IA que automatiza tu consulta, organiza tus pacientes y te ayuda a conseguir más reservas.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mb-9">
              <button onClick={goRegister}
                className={`${orangeBtn} text-base px-7 py-4`}
                style={{ background: ORANGE, boxShadow: '0 16px 40px -14px rgba(255,107,0,.6)' }}>
                Quiero mi mes gratis
                <span className="material-icons-round text-lg">arrow_forward</span>
              </button>
              <a href="#funciones"
                className="inline-flex items-center justify-center gap-2 rounded-2xl font-semibold text-base px-7 py-4 transition-all duration-200 hover:-translate-y-0.5"
                style={{ background: '#fff', color: BLUE, border: `1.5px solid ${BORDER}` }}>
                Ver demostración
              </a>
            </div>
            {/* Prueba social */}
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {['RO', 'CM', 'JS', 'MP'].map((ini, i) => (
                  <div key={i} className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white border-2 border-white"
                    style={{ background: `hsl(${210 + i * 14}, 55%, ${38 + i * 6}%)` }}>{ini}</div>
                ))}
              </div>
              <div>
                <div className="text-sm" style={{ color: '#f59e0b' }}>★★★★★</div>
                <p className="text-xs font-medium" style={{ color: MUTED }}>Más de 30 profesionales ya utilizan Agenda +Life</p>
              </div>
            </div>
          </motion.div>

          {/* Derecha: mockup del dashboard */}
          <motion.div initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1, ease: 'easeOut' }}
            className="relative">
            <div className="rounded-3xl overflow-hidden shadow-2xl" style={{ border: `1px solid ${BORDER}`, background: '#fff' }}>
              {/* Barra superior del mockup */}
              <div className="flex items-center gap-1.5 px-4 py-3" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-300" /><span className="w-2.5 h-2.5 rounded-full bg-amber-300" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
                <span className="ml-3 text-[11px] font-medium" style={{ color: MUTED }}>agenda.maslife — Panel</span>
              </div>
              <div className="p-4 lg:p-5 grid grid-cols-5 gap-3">
                {/* Mini stats */}
                <div className="col-span-5 grid grid-cols-3 gap-3">
                  {[
                    { l: 'Citas hoy', v: '8', c: BLUE },
                    { l: 'Ingresos', v: '$185.000', c: '#059669' },
                    { l: 'Ocupación', v: '92%', c: ORANGE },
                  ].map(s => (
                    <div key={s.l} className="rounded-2xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>{s.l}</p>
                      <p className="text-lg font-extrabold" style={{ color: s.c }}>{s.v}</p>
                    </div>
                  ))}
                </div>
                {/* Mini calendario */}
                <div className="col-span-2 rounded-2xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: MUTED }}>Julio</p>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 28 }, (_, i) => (
                      <span key={i} className="w-full aspect-square rounded-md text-[10px] flex items-center justify-center font-medium"
                        style={i === 19 ? { background: BLUE, color: '#fff' } : i % 6 === 2 ? { background: 'rgba(255,107,0,.15)', color: ORANGE } : { color: MUTED }}>
                        {i + 1}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Reservas del día */}
                <div className="col-span-3 rounded-2xl p-3 space-y-2" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>Próximas reservas</p>
                  {[
                    { t: '09:00', n: 'María P.', tag: 'Pagado', tc: '#059669' },
                    { t: '10:00', n: 'Jorge L.', tag: 'Online', tc: BLUE },
                    { t: '11:30', n: 'Sofía R.', tag: 'Recordado', tc: ORANGE },
                  ].map(r => (
                    <div key={r.t} className="flex items-center justify-between bg-white rounded-xl px-2.5 py-2" style={{ border: `1px solid ${BORDER}` }}>
                      <span className="text-[11px] font-bold" style={{ color: TEXT }}>{r.t} · {r.n}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${r.tc}15`, color: r.tc }}>{r.tag}</span>
                    </div>
                  ))}
                </div>
                {/* Chips inferiores */}
                <div className="col-span-5 flex flex-wrap gap-1.5">
                  {['Agenda', 'Pagos', 'Recordatorios', 'IA', 'Estadísticas', 'Chat IA'].map(c => (
                    <span key={c} className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(0,51,102,.06)', color: BLUE }}>{c}</span>
                  ))}
                </div>
              </div>
            </div>
            {/* Tarjeta flotante IA */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -bottom-6 -left-3 lg:-left-10 max-w-[240px] rounded-2xl bg-white p-4 shadow-2xl"
              style={{ border: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,107,0,.12)' }}>
                  <span className="material-icons-round text-base" style={{ color: ORANGE }}>auto_awesome</span>
                </span>
                <p className="text-xs font-bold" style={{ color: TEXT }}>Incluye Asistente IA</p>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: MUTED }}>
                La IA responde consultas frecuentes, agenda pacientes, envía recordatorios y optimiza tu tiempo.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════ BENEFICIOS ═══════════ */}
      <section className="px-5 lg:px-[6vw] py-20 lg:py-28">
        <div className="max-w-6xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-extrabold tracking-tight mb-3" style={{ color: TEXT }}>
              Todo lo que tu consulta necesita
            </h2>
            <p className="max-w-xl mx-auto" style={{ color: MUTED }}>Menos administración, más pacientes. Tú atiendes; la plataforma hace el resto.</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {benefits.map((b, i) => (
              <motion.div key={b.title} {...fadeUp} transition={{ duration: 0.3, delay: i * 0.05 }}
                className="rounded-3xl p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4 bg-white" style={{ border: `1px solid ${BORDER}` }}>
                  <span className="material-icons-round" style={{ color: BLUE }}>{b.icon}</span>
                </div>
                <h3 className="font-bold text-base mb-1.5" style={{ color: TEXT }}>{b.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{b.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ CÓMO FUNCIONA ═══════════ */}
      <section className="px-5 lg:px-[6vw] py-20 lg:py-24" style={{ background: CARD }}>
        <div className="max-w-5xl mx-auto">
          <motion.h2 {...fadeUp} className="text-3xl lg:text-4xl font-extrabold tracking-tight text-center mb-14" style={{ color: TEXT }}>
            Empieza en 4 pasos
          </motion.h2>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 lg:gap-4 relative">
            <div className="hidden lg:block absolute top-6 left-[12%] right-[12%] h-px" style={{ background: BORDER }} aria-hidden="true" />
            {steps.map((s, i) => (
              <motion.div key={s.n} {...fadeUp} transition={{ duration: 0.3, delay: i * 0.08 }} className="text-center relative">
                <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center text-lg font-extrabold text-white mb-4 relative z-10"
                  style={{ background: BLUE, boxShadow: '0 10px 24px -10px rgba(0,51,102,.5)' }}>{s.n}</div>
                <h3 className="font-bold text-base mb-1.5" style={{ color: TEXT }}>{s.title}</h3>
                <p className="text-sm leading-relaxed max-w-[230px] mx-auto" style={{ color: MUTED }}>{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ FUNCIONES ═══════════ */}
      <section id="funciones" className="px-5 lg:px-[6vw] py-20 lg:py-28">
        <div className="max-w-6xl mx-auto">
          <motion.h2 {...fadeUp} className="text-3xl lg:text-4xl font-extrabold tracking-tight text-center mb-12" style={{ color: TEXT }}>
            Funciones pensadas para salud
          </motion.h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <motion.div key={f.label} {...fadeUp} transition={{ duration: 0.25, delay: (i % 4) * 0.04 }}
                className="rounded-2xl p-4 lg:p-5 flex items-center gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md bg-white"
                style={{ border: `1px solid ${BORDER}` }}>
                <span className="material-icons-round shrink-0" style={{ color: BLUE }}>{f.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight" style={{ color: TEXT }}>{f.label}</p>
                  {f.soon && <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: ORANGE }}>Próximamente</span>}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ BANNER 1 MES GRATIS ═══════════ */}
      <section className="px-5 lg:px-[6vw] py-14" style={{ background: BLUE }}>
        <motion.div {...fadeUp} className="max-w-4xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-6 text-center lg:text-left">
          <div className="flex items-center gap-4">
            <span className="material-icons-round text-4xl text-white/90 shrink-0">redeem</span>
            <div>
              <p className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">🎁 1 MES GRATIS</p>
              <p className="text-sm text-white/80 mt-1">Todos los profesionales nuevos obtienen acceso completo durante su primer mes.</p>
            </div>
          </div>
          <button onClick={goRegister}
            className={`${orangeBtn} text-base px-7 py-4 shrink-0`}
            style={{ background: ORANGE, boxShadow: '0 16px 40px -14px rgba(255,107,0,.5)' }}>
            Comenzar ahora
          </button>
        </motion.div>
      </section>

      {/* ═══════════ TESTIMONIOS ═══════════ */}
      <section className="px-5 lg:px-[6vw] py-20 lg:py-28">
        <div className="max-w-6xl mx-auto">
          <motion.h2 {...fadeUp} className="text-3xl lg:text-4xl font-extrabold tracking-tight text-center mb-12" style={{ color: TEXT }}>
            Profesionales que ya crecieron
          </motion.h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} {...fadeUp} transition={{ duration: 0.3, delay: i * 0.07 }}
                className="rounded-3xl p-6 flex flex-col gap-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <div className="text-sm" style={{ color: '#f59e0b' }}>★★★★★</div>
                <p className="text-sm leading-relaxed flex-1" style={{ color: TEXT }}>"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: BLUE }}>{t.initials}</div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: TEXT }}>{t.name}</p>
                    <p className="text-xs" style={{ color: MUTED }}>{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ INTEGRACIONES ═══════════ */}
      <section className="px-5 lg:px-[6vw] py-14" style={{ background: CARD }}>
        <motion.div {...fadeUp} className="max-w-5xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest mb-6" style={{ color: MUTED }}>Se integra con las herramientas que ya usas</p>
          <div className="flex flex-wrap justify-center gap-3">
            {integrations.map(name => (
              <span key={name} className="px-5 py-2.5 rounded-2xl bg-white text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{ border: `1px solid ${BORDER}`, color: TEXT }}>
                {name}
              </span>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ═══════════ FAQ ═══════════ */}
      <section className="px-5 lg:px-[6vw] py-20 lg:py-28">
        <div className="max-w-2xl mx-auto">
          <motion.h2 {...fadeUp} className="text-3xl lg:text-4xl font-extrabold tracking-tight text-center mb-10" style={{ color: TEXT }}>
            Preguntas frecuentes
          </motion.h2>
          <div className="space-y-3">
            {faqs.map((f, i) => {
              const open = openFaq === i;
              return (
                <motion.div key={f.q} {...fadeUp} transition={{ duration: 0.25, delay: i * 0.03 }}
                  className="rounded-2xl overflow-hidden bg-white" style={{ border: `1px solid ${open ? BLUE : BORDER}` }}>
                  <button onClick={() => setOpenFaq(open ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left" aria-expanded={open}>
                    <span className="text-sm font-semibold" style={{ color: TEXT }}>{f.q}</span>
                    <span className="material-icons-round transition-transform duration-200 shrink-0"
                      style={{ color: MUTED, transform: open ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                  </button>
                  {open && (
                    <p className="px-5 pb-5 text-sm leading-relaxed" style={{ color: MUTED }}>{f.a}</p>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════ CTA FINAL ═══════════ */}
      <section className="px-5 lg:px-[6vw] py-20 lg:py-28 text-center" style={{ background: BLUE }}>
        <motion.div {...fadeUp} className="max-w-2xl mx-auto">
          <h2 className="text-3xl lg:text-5xl font-extrabold tracking-tight text-white mb-4">
            Empieza hoy y deja que la IA gestione tu consulta.
          </h2>
          <p className="text-white/80 mb-9">Más tiempo para tus pacientes. Menos tiempo organizando tu agenda.</p>
          <button onClick={goRegister}
            className={`${orangeBtn} text-base px-9 py-4`}
            style={{ background: ORANGE, boxShadow: '0 20px 48px -16px rgba(255,107,0,.55)' }}>
            Comenzar gratis
            <span className="material-icons-round text-lg">arrow_forward</span>
          </button>
          <p className="text-xs text-white/60 mt-4">No necesitas tarjeta de crédito.</p>
          <div className="mt-12">
            <button onClick={() => navigate('/')} className="text-sm text-white/50 hover:text-white transition-colors">
              ← Volver a Clínica +Life
            </button>
          </div>
        </motion.div>
      </section>
    </div>
  );
};

export default ProLanding;
