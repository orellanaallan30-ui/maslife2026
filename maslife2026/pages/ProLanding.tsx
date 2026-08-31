import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import logoClinica from '../assets/logo-clinica.png';
import { trackSubscriptionClick } from '../analytics';
import { usePageMeta } from '../lib/seo';

// Landing "Agenda +Life" — estilo SaaS premium (Stripe/Linear/Calendly).
// Paleta del brief: azul #003366, naranjo CTA #FF6B00, cards #F8FAFC,
// texto #111827 / #6B7280, bordes #E5E7EB.
//
// Tipografía: Manrope. Es la fuente `sans` por defecto del proyecto
// (tailwind.config.js) y ya viene cargada en index.html con pesos 300-900, así
// que no agrega descargas. Tiene más cuerpo que Inter y llega a 900, lo que
// permite titulares realmente contundentes.

const BLUE = '#003366';
const ORANGE = '#FF6B00';
const TEXT = '#111827';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';
const CARD = '#F8FAFC';
const GREEN = '#059669';

const FONT = { fontFamily: "'Manrope', system-ui, sans-serif" };

// Sobre las bandas azules el texto secundario va en blanco translúcido: mantiene
// el contraste AA sin competir con los titulares.
const ON_BLUE_SOFT = 'rgba(255,255,255,.78)';

// Precio del plan Pro. Vive aquí y se reutiliza en la sección de tarifas y en el
// FAQ, para que no queden dos cifras distintas en la misma página.
const PLAN_MENSUAL = 24990;

// Comisión de la plataforma por cobro online. Debe coincidir con
// MP_MARKETPLACE_FEE_PCT en api/process-payment.ts: si cambia allá, cambia aquí.
// Se declara en la página porque MercadoPago no la desglosa en su comprobante y
// el profesional no la vería hasta revisar la aritmética de su liquidación.
const COMISION_PCT = 2;

const clp = (n: number) => `$${new Intl.NumberFormat('es-CL').format(n)}`;

// Fade-up estándar del brief: suave, 200-300ms, al entrar en viewport.
const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.3, ease: 'easeOut' as const },
};

// Check verde reutilizable de la tarjeta del plan.
const Check: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start gap-2.5">
    <span className="material-icons-round text-[18px] shrink-0 mt-0.5" style={{ color: GREEN }}>check</span>
    <span className="text-sm font-medium leading-relaxed" style={{ color: TEXT }}>{children}</span>
  </li>
);

const ProLanding: React.FC = () => {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Calculadora de retorno: el profesional escribe cuánto cobra por sesión y ve
  // cuántas sesiones cubren el plan. Se guarda como string para poder dejar el
  // campo vacío sin que aparezca un 0 pegado.
  const [precioSesion, setPrecioSesion] = useState('25000');
  const precioNum = Number(precioSesion) || 0;
  // Sobre el neto, no sobre el bruto: de cada cobro online se descuenta la
  // comisión, así que hacen falta algo más de sesiones de las que parecería.
  const netoPorSesion = precioNum * (1 - COMISION_PCT / 100);
  const sesionesParaCubrir = netoPorSesion > 0 ? Math.ceil(PLAN_MENSUAL / netoPorSesion) : null;

  const onPrecioChange = (v: string) => {
    const soloDigitos = v.replace(/\D/g, '').slice(0, 7); // tope 9.999.999
    setPrecioSesion(soloDigitos);
  };

  usePageMeta({
    title: 'Agenda +Life — Agenda inteligente con IA para profesionales de salud | 30 días gratis',
    description: 'La agenda impulsada por IA que automatiza tu consulta: reservas online 24/7, pagos con MercadoPago, fichas clínicas y confirmaciones automáticas. Para kinesiólogos, nutricionistas, psicólogos y más. 30 días gratis, sin tarjeta.',
    canonicalPath: '/unete',
  });

  const goRegister = () => { trackSubscriptionClick(); navigate('/pro/register'); };

  const steps = [
    { n: '1', title: 'Regístrate', desc: 'Creas tu cuenta en minutos. Sin tarjeta.' },
    { n: '2', title: 'Configura tu agenda', desc: 'Tus servicios, precios y horarios disponibles.' },
    { n: '3', title: 'La IA trabaja por ti', desc: 'Reservas, confirmaciones e informes automáticos.' },
    { n: '4', title: 'Atiende más pacientes', desc: 'Tu agenda se llena mientras tú te enfocas en atender.' },
  ];

  // Lo que trae el plan (sección de tarifas).
  const incluye = [
    'Agenda online 24/7 y perfil en el buscador',
    'Cobros con MercadoPago directo a tu cuenta',
    'Fichas clínicas por especialidad e informes PDF',
    'Asistente IA: informes, resúmenes y agenda por chat',
    'Confirmaciones automáticas y sincronización con Google Calendar',
    'Rutinas de ejercicio y planes enviables al paciente',
  ];

  // Las tres dudas de dinero que frenan una suscripción. Aparecen una sola vez
  // en la página, dentro de tarifas.
  const dudasDinero = [
    { icon: 'account_balance_wallet', title: 'El dinero de tus pacientes es tuyo', desc: `Conectas tu propia cuenta de MercadoPago y el dinero entra ahí, no a una cuenta nuestra. De cada cobro online se descuenta la comisión de MercadoPago y un ${COMISION_PCT}% de la plataforma; lo que cobras en consulta no paga comisión.` },
    { icon: 'lock_open', title: 'Sin permanencia ni letra chica', desc: 'Cancelas desde tu panel cuando quieras. No hay costo de salida ni cláusulas escondidas.' },
    { icon: 'shield', title: 'Tus fichas te pertenecen', desc: 'Datos cifrados y separados por profesional, según la Ley 21.719. Puedes exportar tus fichas en PDF cuando quieras.' },
  ];

  // Solo integraciones que existen de verdad en la plataforma.
  const integrations = [
    { icon: 'calendar_month', name: 'Google Calendar', desc: 'Tus citas se sincronizan con tu calendario en ambos sentidos.' },
    { icon: 'credit_card', name: 'Mercado Pago', desc: 'Conectas tu cuenta y cobras las reservas por adelantado.' },
  ];

  const faqs = [
    { q: '¿Cuánto cuesta Agenda +Life?', a: `El plan Pro cuesta ${clp(PLAN_MENSUAL)}/mes. Todos los profesionales nuevos tienen 30 días completamente gratis, con acceso a todas las funciones.` },
    { q: '¿Necesito tarjeta de crédito para probar?', a: 'No. Te registras, activas tu cuenta y usas la plataforma completa durante 30 días sin ingresar ningún medio de pago.' },
    { q: '¿Hay permanencia mínima o contrato?', a: 'No. Puedes cancelar cuando quieras, sin costos de salida ni letra chica.' },
    { q: '¿Cómo se protegen los datos de mis pacientes?', a: 'Los datos clínicos se almacenan cifrados con acceso restringido por profesional, en cumplimiento de la Ley 21.719 de protección de datos personales de Chile.' },
    { q: '¿Cómo recibo los pagos de mis pacientes?', a: `Conectas tu cuenta de MercadoPago y el dinero de las reservas entra directamente ahí. Sobre cada cobro online se descuentan dos comisiones: la de MercadoPago y un ${COMISION_PCT}% de la plataforma. Por ejemplo, de una sesión de $25.000 recibes alrededor de $23.500. Los pagos que cobras presencialmente no pagan nada.` },
    { q: '¿Sirve para mi especialidad?', a: 'Sí. Hay fichas específicas para kinesiología, nutrición, psicología y terapia ocupacional, y una ficha configurable con campos personalizados para cualquier otra especialidad.' },
  ];

  const orangeBtn = 'inline-flex items-center justify-center gap-2 rounded-2xl font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0';

  return (
    <div className="pro-landing w-full h-full overflow-y-auto scroll-smooth relative bg-white" style={{ ...FONT, color: TEXT }}>

      {/* ═══════════ NAVBAR ═══════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 lg:px-[6vw]"
        style={{ height: 72, background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(14px)', borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-2 cursor-pointer shrink-0" onClick={() => navigate('/')}>
          <img src={logoClinica} alt="Clínica +Life" className="w-auto object-contain h-11 lg:h-16"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span className="text-sm lg:text-base font-extrabold whitespace-nowrap" style={{ color: BLUE }}>Agenda +Life</span>
        </div>
        <div className="flex items-center gap-2 lg:gap-4">
          <a href="#tarifas" className="hidden lg:inline text-sm font-semibold px-3 py-2 rounded-xl transition-colors hover:bg-slate-50" style={{ color: MUTED }}>
            Tarifas
          </a>
          <button onClick={() => navigate('/pro/login')}
            className="text-sm font-semibold px-2 lg:px-3 py-2 rounded-xl whitespace-nowrap transition-colors hover:bg-slate-50" style={{ color: MUTED }}>
            Entrar
          </button>
          <button onClick={goRegister}
            className={`${orangeBtn} text-sm px-4 lg:px-5 py-2.5 whitespace-nowrap`}
            style={{ background: ORANGE, boxShadow: '0 8px 24px -10px rgba(255,107,0,.55)' }}>
            <span className="lg:hidden">30 días gratis</span>
            <span className="hidden lg:inline">Quiero mis 30 días gratis</span>
          </button>
        </div>
      </nav>

      {/* ═══════════ HERO — banda blanca ═══════════ */}
      <section className="relative flex items-center px-5 lg:px-[6vw] pt-24 pb-16 lg:pt-28 lg:pb-24 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true"
          style={{ background: 'radial-gradient(ellipse 70% 50% at 85% 20%, rgba(0,51,102,.06), transparent 60%)' }} />
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center relative z-10">

          {/* Izquierda: mensaje */}
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
            <span className="inline-block text-xs font-bold px-3.5 py-1.5 rounded-full mb-6"
              style={{ background: CARD, border: `1px solid ${BORDER}`, color: BLUE }}>
              Un subproducto de Clínica +Life
            </span>
            <h1 className="text-[clamp(2.4rem,7.2vw,3.9rem)] font-black leading-[1.03] tracking-tight mb-6" style={{ color: TEXT }}>
              Tu agenda, cobros y fichas en <span style={{ color: BLUE }}>un solo lugar</span>
            </h1>
            <p className="text-base lg:text-lg font-medium leading-relaxed mb-8 max-w-lg" style={{ color: MUTED }}>
              Reservas 24/7, pagos online, fichas clínicas y confirmaciones automáticas. Tú atiendes; el resto se ocupa solo.
            </p>

            {/* CTA con el precio al lado: quien llega a ver cuánto cuesta lo ve aquí */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-8">
              <button onClick={goRegister}
                className={`${orangeBtn} text-base px-7 py-4 shrink-0`}
                style={{ background: ORANGE, boxShadow: '0 16px 40px -14px rgba(255,107,0,.6)' }}>
                Crear mi cuenta gratis
                <span className="material-icons-round text-lg">arrow_forward</span>
              </button>
              <div>
                <p className="text-sm font-extrabold" style={{ color: TEXT }}>30 días gratis, después {clp(PLAN_MENSUAL)}/mes</p>
                <p className="text-[13px] font-medium" style={{ color: MUTED }}>Sin tarjeta, sin permanencia.</p>
              </div>
            </div>

            {/* Tres garantías verificables */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-x-5 gap-y-2">
              {['Tus pagos van directo a tu MercadoPago', 'Sincronizado con Google Calendar', 'Fichas cifradas, Ley 21.719'].map(t => (
                <span key={t} className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: MUTED }}>
                  <span className="material-icons-round text-[16px]" style={{ color: GREEN }}>check</span>
                  {t}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Derecha: mockup del dashboard */}
          <motion.div initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1, ease: 'easeOut' }}
            className="relative mb-16 lg:mb-6">
            <div className="rounded-3xl overflow-hidden shadow-2xl" style={{ border: `1px solid ${BORDER}`, background: '#fff' }}>
              {/* Barra superior del mockup */}
              <div className="flex items-center gap-1.5 px-4 py-3" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-300" /><span className="w-2.5 h-2.5 rounded-full bg-amber-300" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
                <span className="ml-3 text-[11px] font-bold" style={{ color: MUTED }}>agenda.maslife — Panel</span>
              </div>
              <div className="p-4 lg:p-5 grid grid-cols-5 gap-3">
                {/* Mini stats */}
                <div className="col-span-5 grid grid-cols-3 gap-3">
                  {[
                    { l: 'Citas hoy', v: '8', c: BLUE },
                    { l: 'Ingresos', v: '$185.000', c: GREEN },
                    { l: 'Ocupación', v: '92%', c: ORANGE },
                  ].map(s => (
                    <div key={s.l} className="rounded-2xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>{s.l}</p>
                      <p className="text-lg font-black" style={{ color: s.c }}>{s.v}</p>
                    </div>
                  ))}
                </div>
                {/* Mini calendario */}
                <div className="col-span-2 rounded-2xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: MUTED }}>Julio</p>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 28 }, (_, i) => (
                      <span key={i} className="w-full aspect-square rounded-md text-[10px] flex items-center justify-center font-semibold"
                        style={i === 19 ? { background: BLUE, color: '#fff' } : i % 6 === 2 ? { background: 'rgba(255,107,0,.15)', color: ORANGE } : { color: MUTED }}>
                        {i + 1}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Reservas del día */}
                <div className="col-span-3 rounded-2xl p-3 space-y-2" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Próximas reservas</p>
                  {[
                    { t: '09:00', n: 'María P.', tag: 'Pagado', tc: GREEN },
                    { t: '10:00', n: 'Jorge L.', tag: 'Online', tc: BLUE },
                    { t: '11:30', n: 'Sofía R.', tag: 'Confirmado', tc: ORANGE },
                  ].map(r => (
                    <div key={r.t} className="flex items-center justify-between bg-white rounded-xl px-2.5 py-2" style={{ border: `1px solid ${BORDER}` }}>
                      <span className="text-[11px] font-extrabold" style={{ color: TEXT }}>{r.t} · {r.n}</span>
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full" style={{ background: `${r.tc}15`, color: r.tc }}>{r.tag}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Tarjeta flotante IA */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -bottom-14 -left-2 lg:-left-12 max-w-[240px] rounded-2xl bg-white p-4 shadow-2xl"
              style={{ border: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,107,0,.12)' }}>
                  <span className="material-icons-round text-base" style={{ color: ORANGE }}>auto_awesome</span>
                </span>
                <p className="text-xs font-extrabold" style={{ color: TEXT }}>Incluye Asistente IA</p>
              </div>
              <p className="text-[11px] font-medium leading-relaxed" style={{ color: MUTED }}>
                La IA responde consultas frecuentes, agenda pacientes, redacta informes y optimiza tu tiempo.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════ CÓMO FUNCIONA — banda azul ═══════════ */}
      <section className="px-5 lg:px-[6vw] py-20 lg:py-28" style={{ background: BLUE }}>
        <div className="max-w-6xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-12">
            <h2 className="text-3xl lg:text-[2.6rem] font-black tracking-tight text-white mb-3">
              Empieza en 4 pasos
            </h2>
            <p className="max-w-lg mx-auto font-medium" style={{ color: ON_BLUE_SOFT }}>
              Partir toma menos de lo que dura una sesión.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((s, i) => {
              const ultimo = i === steps.length - 1;
              return (
                <motion.div key={s.n} {...fadeUp} transition={{ duration: 0.3, delay: i * 0.08 }}
                  className="h-full rounded-3xl p-6 flex flex-col"
                  style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.16)' }}>
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-black mb-5"
                    style={ultimo ? { background: ORANGE, color: '#fff' } : { background: '#fff', color: BLUE }}>
                    {s.n}
                  </div>
                  <h3 className="font-extrabold text-base mb-2 text-white">{s.title}</h3>
                  <p className="text-sm font-medium leading-relaxed" style={{ color: ON_BLUE_SOFT }}>{s.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════ TARIFAS — banda gris ═══════════ */}
      <section id="tarifas" className="px-5 lg:px-[6vw] py-20 lg:py-28"
        style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, scrollMarginTop: 80 }}>
        <div className="max-w-6xl mx-auto">

          <motion.div {...fadeUp} className="text-center mb-12">
            <span className="inline-block text-xs font-bold px-3.5 py-1.5 rounded-full mb-4 bg-white"
              style={{ border: `1px solid ${BORDER}`, color: BLUE }}>
              Tarifas
            </span>
            <h2 className="text-3xl lg:text-[2.6rem] font-black tracking-tight mb-3" style={{ color: TEXT }}>
              Un solo plan. Todo incluido.
            </h2>
            <p className="max-w-lg mx-auto font-medium" style={{ color: MUTED }}>
              Sin módulos que se cobran aparte ni sorpresas. Los primeros 30 días son gratis y no necesitas tarjeta para empezar.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">

            {/* Tarjeta del plan */}
            <motion.div {...fadeUp} className="rounded-3xl overflow-hidden bg-white flex flex-col"
              style={{ border: `2px solid ${BLUE}`, boxShadow: '0 28px 64px -28px rgba(0,51,102,.3)' }}>
              <div className="flex items-center justify-between px-7 py-3.5" style={{ background: BLUE }}>
                <span className="text-xs font-extrabold tracking-wide text-white">PLAN PRO</span>
                <span className="text-[11px] font-extrabold text-white px-2.5 py-1 rounded-full" style={{ background: ORANGE }}>30 días gratis</span>
              </div>

              <div className="p-7 flex flex-col flex-1">
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-[2.8rem] leading-none font-black tracking-tight" style={{ color: TEXT }}>{clp(PLAN_MENSUAL)}</span>
                  <span className="text-base font-semibold" style={{ color: MUTED }}>/ mes</span>
                </div>
                <p className="text-[13px] font-medium mb-2" style={{ color: MUTED }}>IVA incluido · Cancelas cuando quieras</p>
                {/* La comisión por transacción se declara junto al precio, no escondida
                    en el FAQ: es parte de lo que el profesional paga y decide con ella. */}
                <p className="text-[13px] font-semibold mb-6" style={{ color: TEXT }}>
                  + {COMISION_PCT}% por cobro online
                  <span className="font-medium" style={{ color: MUTED }}> — lo que cobras en consulta no paga comisión.</span>
                </p>

                <div className="rounded-2xl p-4 mb-6 flex items-start gap-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <span className="material-icons-round text-[19px] shrink-0" style={{ color: ORANGE }}>schedule</span>
                  <div>
                    <p className="text-[13px] font-extrabold mb-0.5" style={{ color: TEXT }}>Empiezas pagando $0</p>
                    <p className="text-xs font-medium leading-relaxed" style={{ color: MUTED }}>30 días con todas las funciones. Recién al día 31 decides si continúas.</p>
                  </div>
                </div>

                <ul className="flex flex-col gap-3 mb-7">
                  {incluye.map(item => <Check key={item}>{item}</Check>)}
                </ul>

                <div className="mt-auto">
                  <button onClick={goRegister}
                    className={`${orangeBtn} w-full text-base px-6 py-4`}
                    style={{ background: ORANGE, boxShadow: '0 16px 40px -14px rgba(255,107,0,.6)' }}>
                    Empezar mis 30 días gratis
                  </button>
                  <p className="text-xs font-medium text-center mt-3" style={{ color: '#9CA3AF' }}>No pedimos tarjeta de crédito para registrarte.</p>
                </div>
              </div>
            </motion.div>

            {/* Calculadora de retorno + las tres dudas de dinero */}
            <div className="flex flex-col gap-5">

              <motion.div {...fadeUp} transition={{ duration: 0.3, delay: 0.06 }}
                className="rounded-3xl p-7 bg-white" style={{ border: `1px solid ${BORDER}` }}>
                <h3 className="font-extrabold text-lg mb-2" style={{ color: TEXT }}>¿Cuánto tiene que rendir para pagarse?</h3>
                <p className="text-sm font-medium leading-relaxed mb-5" style={{ color: MUTED }}>
                  Escribe cuánto cobras por sesión y calculamos con cuántas reservas del mes queda cubierto el plan. Lo que agendes de ahí en adelante es ganancia.
                </p>

                <label htmlFor="precio-sesion" className="block text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: MUTED }}>
                  Tu precio por sesión
                </label>
                <div className="flex items-center rounded-2xl px-4 mb-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <span className="text-lg font-extrabold mr-1" style={{ color: MUTED }}>$</span>
                  <input
                    id="precio-sesion"
                    type="text"
                    inputMode="numeric"
                    value={precioSesion}
                    onChange={e => onPrecioChange(e.target.value)}
                    placeholder="25000"
                    aria-label="Tu precio por sesión en pesos"
                    className="w-full bg-transparent py-3.5 text-lg font-extrabold outline-none"
                    style={{ color: TEXT }}
                  />
                </div>

                <div className="flex items-center gap-3 rounded-2xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: MUTED }}>Costo del plan</p>
                    <p className="text-xl font-black" style={{ color: TEXT }}>{clp(PLAN_MENSUAL)}</p>
                  </div>
                  <span className="material-icons-round shrink-0" style={{ color: '#9CA3AF' }}>arrow_forward</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: MUTED }}>Se cubre con</p>
                    <p className="text-xl font-black" style={{ color: GREEN }}>
                      {sesionesParaCubrir === null
                        ? '—'
                        : `${sesionesParaCubrir} ${sesionesParaCubrir === 1 ? 'sesión' : 'sesiones'}`}
                    </p>
                  </div>
                </div>
              </motion.div>

              <motion.div {...fadeUp} transition={{ duration: 0.3, delay: 0.12 }}
                className="rounded-3xl p-7 bg-white flex flex-col gap-5 flex-1" style={{ border: `1px solid ${BORDER}` }}>
                {dudasDinero.map(d => (
                  <div key={d.title} className="flex items-start gap-3.5">
                    <span className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,51,102,.07)' }}>
                      <span className="material-icons-round text-[20px]" style={{ color: BLUE }}>{d.icon}</span>
                    </span>
                    <div>
                      <p className="text-sm font-extrabold mb-1" style={{ color: TEXT }}>{d.title}</p>
                      <p className="text-[13px] font-medium leading-relaxed" style={{ color: MUTED }}>{d.desc}</p>
                    </div>
                  </div>
                ))}
              </motion.div>

            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ INTEGRACIONES — banda blanca ═══════════ */}
      <section className="px-5 lg:px-[6vw] py-16 lg:py-20">
        <motion.div {...fadeUp} className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-bold uppercase tracking-widest mb-8" style={{ color: MUTED }}>Se conecta con las herramientas que ya usas</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-left">
            {integrations.map(it => (
              <div key={it.name} className="h-full rounded-3xl p-6 flex items-start gap-4 bg-white transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{ border: `1px solid ${BORDER}` }}>
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,51,102,.07)' }}>
                  <span className="material-icons-round" style={{ color: BLUE }}>{it.icon}</span>
                </span>
                <div>
                  <p className="text-sm font-extrabold mb-1" style={{ color: TEXT }}>{it.name}</p>
                  <p className="text-[13px] font-medium leading-relaxed" style={{ color: MUTED }}>{it.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ═══════════ FAQ — banda gris ═══════════ */}
      <section className="px-5 lg:px-[6vw] py-20 lg:py-28" style={{ background: CARD, borderTop: `1px solid ${BORDER}` }}>
        <div className="max-w-2xl mx-auto">
          <motion.h2 {...fadeUp} className="text-3xl lg:text-[2.6rem] font-black tracking-tight text-center mb-10" style={{ color: TEXT }}>
            Preguntas frecuentes
          </motion.h2>
          <div className="flex flex-col gap-3">
            {faqs.map((f, i) => {
              const open = openFaq === i;
              return (
                <motion.div key={f.q} {...fadeUp} transition={{ duration: 0.25, delay: i * 0.03 }}
                  className="rounded-2xl overflow-hidden bg-white" style={{ border: `1px solid ${open ? BLUE : BORDER}` }}>
                  <button onClick={() => setOpenFaq(open ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left" aria-expanded={open}>
                    <span className="text-sm font-extrabold" style={{ color: TEXT }}>{f.q}</span>
                    <span className="material-icons-round transition-transform duration-200 shrink-0"
                      style={{ color: MUTED, transform: open ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                  </button>
                  {open && (
                    <p className="px-5 pb-5 text-sm font-medium leading-relaxed" style={{ color: MUTED }}>{f.a}</p>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════ CIERRE — banda azul ═══════════ */}
      <section className="px-5 lg:px-[6vw] py-20 lg:py-28 text-center" style={{ background: BLUE }}>
        <motion.div {...fadeUp} className="max-w-2xl mx-auto">
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-white mb-4">
            Partir toma menos que una sesión.
          </h2>
          <p className="font-medium mb-9" style={{ color: ON_BLUE_SOFT }}>
            Creas tu cuenta, configuras horarios y precios, y tu agenda queda publicada. 30 días gratis.
          </p>
          <button onClick={goRegister}
            className={`${orangeBtn} text-base px-9 py-4`}
            style={{ background: ORANGE, boxShadow: '0 20px 48px -16px rgba(255,107,0,.55)' }}>
            Crear mi cuenta gratis
            <span className="material-icons-round text-lg">arrow_forward</span>
          </button>
          <p className="text-xs font-medium text-white/60 mt-4">No necesitas tarjeta de crédito.</p>
          <div className="mt-12">
            <button onClick={() => navigate('/')} className="text-sm font-semibold text-white/50 hover:text-white transition-colors">
              ← Volver a Clínica +Life
            </button>
          </div>
        </motion.div>
      </section>
    </div>
  );
};

export default ProLanding;
