import React from 'react';
import { useNavigate } from 'react-router-dom';
import logoClinica from '../assets/logo-clinica.png';
import { trackSubscriptionClick } from '../analytics';
import { usePageMeta } from '../lib/seo';

// Landing "Para profesionales" — destino de la campaña de suscripción.
// Reutiliza la estética de la landing de pacientes (MainHome): celeste #0284c7→#0ea5e9,
// tipografías Fraunces (font-display) + Outfit (font-outfit), tarjetas y blobs.
const GRAD = 'linear-gradient(135deg, #0284c7, #0ea5e9)';

const ProLanding: React.FC = () => {
  const navigate = useNavigate();

  usePageMeta({
    title: 'Agenda online para profesionales de salud — 30 días gratis | Clínica Mas Life',
    description: 'Agenda online 24/7, pagos con MercadoPago y fichas clínicas digitales para kinesiólogos, nutricionistas y psicólogos en Chile. Prueba 30 días gratis, sin tarjeta y sin permanencia.',
    canonicalPath: '/unete',
  });

  const goRegister = () => { trackSubscriptionClick(); navigate('/pro/register'); };

  const benefits = [
    { icon: 'event_available', title: 'Agenda online 24/7', desc: 'Tus pacientes reservan solos, a cualquier hora, sin llamadas ni WhatsApp de ida y vuelta.' },
    { icon: 'payments', title: 'Pagos con MercadoPago', desc: 'Cobra por adelantado y evita las inasistencias. El dinero llega directo a tu cuenta.' },
    { icon: 'assignment', title: 'Fichas clínicas digitales', desc: 'Evaluaciones, informes y consentimientos en un solo lugar, con respaldo seguro.' },
    { icon: 'travel_explore', title: 'Te enviamos pacientes', desc: 'Apareces en el buscador de Clínica Mas Life para quienes buscan tu especialidad en tu zona.' },
  ];

  const steps = [
    { n: '1', title: 'Regístrate gratis', desc: 'Crea tu cuenta en minutos. 30 días de prueba, sin tarjeta.' },
    { n: '2', title: 'Configura tu perfil', desc: 'Agrega tus servicios, precios y horarios disponibles.' },
    { n: '3', title: 'Recibe reservas y pagos', desc: 'Tu agenda empieza a llenarse y cobras online, automático.' },
  ];

  const planFeatures = [
    'Agenda online 24/7 para tus pacientes',
    'Pagos con MercadoPago integrados',
    'Fichas clínicas digitales e informes PDF',
    'Tu perfil público en el buscador',
    'Recordatorios y notificaciones por email',
    'Sin permanencia — cancela cuando quieras',
  ];

  return (
    <div className="landing-page w-full h-full overflow-y-auto font-outfit scroll-smooth relative" style={{ background: '#ffffff', color: '#0f172a' }}>

      {/* ═══════════ NAVBAR ═══════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-[6vw]"
        style={{ height: '76px', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(14,165,233,0.1)' }}>
        <div className="flex items-center cursor-pointer shrink-0" onClick={() => navigate('/')}>
          <img src={logoClinica} alt="Clínica Mas Life" className="w-auto object-contain h-28 lg:h-32"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
        <div className="flex items-center gap-3 lg:gap-6">
          <button onClick={() => navigate('/pro/login')}
            className="text-[.8rem] font-medium uppercase tracking-[1.5px] opacity-80 hover:opacity-100 transition-opacity">
            Iniciar sesión
          </button>
          <button onClick={goRegister}
            className="text-[.8rem] font-semibold px-5 py-2.5 rounded-full text-white transition-all hover:shadow-lg hover:-translate-y-px"
            style={{ background: GRAD, boxShadow: '0 6px 20px -6px rgba(2,132,199,.5)' }}>
            Comenzar gratis
          </button>
        </div>
      </nav>

      {/* ═══════════ HERO ═══════════ */}
      <section className="relative min-h-screen flex items-center overflow-hidden" style={{ background: '#ffffff' }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse 90% 70% at 60% 100%, rgba(14,165,233,.18), transparent 65%),
                       radial-gradient(ellipse 50% 60% at 90% 10%, rgba(6,182,212,.14), transparent 55%),
                       #ffffff`
        }} />
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
          <div className="absolute -top-16 -left-16 w-[380px] h-[380px] rounded-full"
            style={{ background: '#bae6fd', filter: 'blur(72px)', opacity: .5, animation: 'blobFloat 8s ease-in-out infinite' }} />
          <div className="absolute bottom-[4%] -right-[4%] w-[300px] h-[300px] rounded-full"
            style={{ background: '#a5f3fc', filter: 'blur(60px)', opacity: .4, animation: 'blobFloat 11s ease-in-out infinite reverse' }} />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-[6vw] pt-32 pb-20 lg:py-28 w-full text-center">
          <span className="inline-block text-[.6rem] lg:text-xs font-outfit font-bold uppercase tracking-[.5px] mb-7 px-3 py-1 rounded-full text-white"
            style={{ background: GRAD, boxShadow: '0 8px 24px -8px rgba(2,132,199,.5)' }}>
            Para profesionales de salud
          </span>

          <h1 className="font-display text-[clamp(2.6rem,9vw,5rem)] lg:text-[clamp(3.4rem,6vw,6rem)] leading-[.98] tracking-tight mb-8" style={{ color: '#0f172a' }}>
            Llena tu agenda.<br />Nosotros te traemos<br /><em style={{ color: '#0284c7', fontStyle: 'italic' }}>los pacientes.</em>
          </h1>

          <p className="font-outfit font-light text-base sm:text-lg lg:text-xl max-w-2xl mx-auto leading-relaxed mb-10" style={{ color: '#475569' }}>
            Agenda online, pagos con MercadoPago y fichas clínicas en un solo lugar — hecho para kinesiólogos,
            nutricionistas y psicólogos en Chile. <strong className="font-semibold" style={{ color: '#0f172a' }}>Primeros 30 días gratis.</strong>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={goRegister}
              className="group inline-flex items-center justify-center gap-3 px-8 py-4 rounded-full text-base font-outfit font-semibold text-white transition-all duration-300 hover:-translate-y-1"
              style={{ background: GRAD, boxShadow: '0 20px 50px -16px rgba(2,132,199,.55)' }}>
              Comenzar gratis — 30 días
              <span className="material-icons-round text-base group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
            <button onClick={() => navigate('/pro/login')}
              className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-full text-base font-outfit font-semibold border transition-all duration-300 hover:-translate-y-1"
              style={{ background: 'rgba(14,165,233,.07)', color: '#0284c7', borderColor: 'rgba(14,165,233,.3)' }}>
              Ya tengo cuenta
            </button>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 justify-center">
            {[
              { icon: 'schedule', label: 'Sin permanencia' },
              { icon: 'lock', label: 'Datos protegidos (Ley 21.719)' },
              { icon: 'bolt', label: 'Activación inmediata' },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs lg:text-sm font-medium" style={{ color: '#475569' }}>
                <span className="material-icons-round text-base" style={{ color: '#0ea5e9' }}>{icon}</span>{label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ BENEFICIOS ═══════════ */}
      <section className="relative px-[6vw] py-[9vh]" style={{ background: 'linear-gradient(180deg,#ffffff, #f0f9ff)' }}>
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display text-[clamp(2rem,5vw,3.2rem)] tracking-tight text-center mb-3" style={{ color: '#0f172a' }}>
            Todo lo que necesitas para <em style={{ color: '#0284c7', fontStyle: 'italic' }}>crecer</em>
          </h2>
          <p className="font-outfit text-center text-slate-500 mb-12 max-w-xl mx-auto">Menos administración, más pacientes. Tú te enfocas en atender; la plataforma hace el resto.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {benefits.map(b => (
              <div key={b.title} className="bg-white rounded-3xl border border-sky-100 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(14,165,233,.1)' }}>
                  <span className="material-icons-round" style={{ color: '#0284c7' }}>{b.icon}</span>
                </div>
                <h3 className="font-outfit font-bold text-slate-900 text-base mb-1.5">{b.title}</h3>
                <p className="font-outfit text-sm text-slate-500 leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ CÓMO FUNCIONA ═══════════ */}
      <section className="relative px-[6vw] py-[9vh]" style={{ background: '#ffffff' }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-[clamp(2rem,5vw,3.2rem)] tracking-tight text-center mb-12" style={{ color: '#0f172a' }}>
            Empieza en <em style={{ color: '#0284c7', fontStyle: 'italic' }}>3 pasos</em>
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {steps.map(s => (
              <div key={s.n} className="text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center font-display text-2xl text-white mb-4"
                  style={{ background: GRAD, boxShadow: '0 12px 28px -12px rgba(2,132,199,.6)' }}>{s.n}</div>
                <h3 className="font-outfit font-bold text-slate-900 text-lg mb-2">{s.title}</h3>
                <p className="font-outfit text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ PRECIO ═══════════ */}
      <section className="relative px-[6vw] py-[9vh]" style={{ background: 'linear-gradient(180deg,#f0f9ff,#ffffff)' }}>
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-[2rem] border-2 border-sky-200 shadow-xl overflow-hidden">
            <div className="p-8 text-white text-center" style={{ background: GRAD }}>
              <p className="font-outfit font-bold uppercase tracking-widest text-xs opacity-90 mb-2">Plan Pro</p>
              <div className="flex items-baseline justify-center gap-1">
                <span className="font-display text-5xl">$24.990</span>
                <span className="font-outfit text-white/80">/mes</span>
              </div>
              <p className="font-outfit text-sm text-white/90 mt-2">Primeros 30 días gratis · sin permanencia</p>
            </div>
            <div className="p-8">
              <ul className="space-y-3 mb-7">
                {planFeatures.map(f => (
                  <li key={f} className="flex items-start gap-3 font-outfit text-sm text-slate-700">
                    <span className="material-icons-round text-lg shrink-0" style={{ color: '#0ea5e9' }}>check_circle</span>{f}
                  </li>
                ))}
              </ul>
              <button onClick={goRegister}
                className="w-full py-4 rounded-2xl text-white font-outfit font-bold text-sm uppercase tracking-widest transition-all hover:-translate-y-0.5"
                style={{ background: GRAD, boxShadow: '0 16px 40px -16px rgba(2,132,199,.6)' }}>
                Comenzar gratis
              </button>
              <p className="text-center text-xs text-slate-400 font-outfit mt-3">No pedimos tarjeta para la prueba.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ CTA FINAL ═══════════ */}
      <section className="relative px-[6vw] py-[10vh] text-center" style={{ background: '#0b1220' }}>
        <h2 className="font-display text-[clamp(2rem,5vw,3.4rem)] tracking-tight text-white mb-5">
          Tu próxima reserva te está <em style={{ color: '#38bdf8', fontStyle: 'italic' }}>esperando</em>
        </h2>
        <p className="font-outfit text-slate-300 max-w-xl mx-auto mb-9">Únete a los profesionales de salud que ya llenan su agenda con Clínica Mas Life.</p>
        <button onClick={goRegister}
          className="inline-flex items-center gap-3 px-9 py-4 rounded-full text-base font-outfit font-semibold text-white transition-all hover:-translate-y-1"
          style={{ background: GRAD, boxShadow: '0 20px 50px -16px rgba(2,132,199,.6)' }}>
          Comenzar gratis — 30 días
          <span className="material-icons-round text-base">arrow_forward</span>
        </button>
        <div className="mt-10">
          <button onClick={() => navigate('/')} className="font-outfit text-sm text-slate-400 hover:text-white transition-colors">
            ← Volver al inicio
          </button>
        </div>
      </section>
    </div>
  );
};

export default ProLanding;
