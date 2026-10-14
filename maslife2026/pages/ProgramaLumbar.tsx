import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../lib/seo';
import { trackProgramView, trackProgramCheckout, getUtms } from '../analytics';

// Página de venta del "Programa de ejercicios para el dolor lumbar · 4 semanas".
// El precio mostrado es informativo: el cobro lo calcula el servidor desde su
// catálogo (api/_lib/products.ts). Si ambos difieren, manda el servidor.
// Diseño: misma identidad que el PDF (petróleo, círculo naranja, Fraunces).

const SLUG = 'programa-lumbar-4-semanas';
const PRECIO = 9990;
const C = {
  petroleo: '#0B4F5C',
  petroleoClaro: '#0E6B6F',
  turquesa: '#00A89E',
  naranja: '#E8731C',
  tinta: '#13262B',
};
const SANS = { fontFamily: "'Manrope', system-ui, sans-serif" };
const SERIF = { fontFamily: "'Fraunces', Georgia, serif", fontOpticalSizing: 'auto' as const };
const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;
const ACCION = `Comprar por ${clp(PRECIO)}`;

const INCLUYE = [
  'Una explicación clara de por qué duele la espalda y por qué no siempre hay un daño',
  'Un plan de 4 semanas, con progresión gradual y 13 ejercicios con fotos',
  'Cada ejercicio explicado paso a paso',
  'Escala de dolor, semáforo y registro de síntomas para seguir tu avance',
  'Señales de alarma: cuándo dejar de ejercitar y consultar',
];
const VISTA_PREVIA = [
  { src: '/programa-lumbar/preview-1.jpg', alt: 'Portada del programa de ejercicios para el dolor lumbar' },
  { src: '/programa-lumbar/preview-2.jpg', alt: 'Página que explica por qué duele la espalda y por qué no siempre hay un daño' },
  { src: '/programa-lumbar/preview-3.jpg', alt: 'Página sobre el círculo del dolor y lo que dicen las resonancias magnéticas' },
  { src: '/programa-lumbar/preview-4.jpg', alt: 'Página de señales de alarma y semáforo del dolor' },
];
const NO_PARA = [
  'Si te operaron hace poco o tuviste un golpe o caída reciente',
  'Si el dolor baja por la pierna con hormigueo o pérdida de fuerza',
  'Si hay fiebre, pérdida de peso sin causa o dolor que te despierta de noche',
  'Si no sabes qué tienes: primero conviene una evaluación profesional',
];
// Mismos datos que la tabla "Tu mes de un vistazo" del PDF.
const SEMANAS = [
  { foco: 'Movilidad suave y control', sesiones: '3 por semana', minutos: '15 min', ejercicios: 5 },
  { foco: 'Control del abdomen y los glúteos', sesiones: '3 por semana', minutos: '20 min', ejercicios: 5 },
  { foco: 'Fortalecimiento', sesiones: '3 a 4 por semana', minutos: '25 min', ejercicios: 6 },
  { foco: 'Consolidación', sesiones: '3 a 4 por semana', minutos: '30 min', ejercicios: 7 },
];
// Las seis perillas del capítulo 1 del PDF: qué sube y qué baja el volumen.
const PERILLAS = [
  { nombre: 'Tu cuerpo', baja: 'Moverte a menudo y ganar fuerza de forma gradual', sube: 'Poca fuerza o movilidad, mucho rato en la misma postura' },
  { nombre: 'Cuánto te mueves', baja: 'Actividad regular y progresiva, caminatas', sube: 'Sedentarismo, o sobrecarga repentina sin preparación' },
  { nombre: 'El sueño', baja: 'Dormir lo suficiente y con horarios regulares', sube: 'Dormir poco o mal' },
  { nombre: 'Estrés y ánimo', baja: 'Pausas, actividades que disfrutas, apoyo cuando lo necesitas', sube: 'Estrés sostenido, preocupación y cansancio mental' },
  { nombre: 'Lo que crees y temes', baja: 'Entender tu dolor y recuperar confianza en tu cuerpo', sube: 'Pensar «mi espalda está dañada» y evitar moverte por miedo' },
  { nombre: 'Trabajo y descanso', baja: 'Pausas activas y tiempo para descansar de verdad', sube: 'Cargas pesadas, jornadas largas sin pausas, poca recuperación' },
];

const nivelDe = (v: number) => (v < 3.5 ? 'bajo' : v < 6.5 ? 'medio' : 'alto');

/** Medidor semicircular: 0 (bajo) a 10 (alto). */
const Medidor: React.FC<{ valor: number }> = ({ valor }) => {
  const r = 80;
  const largo = Math.PI * r;
  const t = Math.max(0, Math.min(1, valor / 10));
  const angulo = -90 + 180 * t;
  const nivel = nivelDe(valor);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 116" className="w-full max-w-[320px]" role="img" aria-label={`Volumen del dolor del ejemplo: ${nivel}`}>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="16" strokeLinecap="round" />
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke={C.naranja} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={largo} strokeDashoffset={largo * (1 - t)}
          className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none" />
        <g className="transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `rotate(${angulo}deg)`, transformOrigin: '100px 100px', transformBox: 'view-box' }}>
          <line x1="100" y1="100" x2="100" y2="34" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="100" r="9" fill="#fff" />
      </svg>
      <p className="mt-2 text-white/70 text-sm">Volumen</p>
      <p className="text-white text-4xl lg:text-5xl" style={{ ...SERIF, fontWeight: 600 }} aria-live="polite">{nivel}</p>
    </div>
  );
};

const VolumenDelDolor: React.FC = () => {
  const [valores, setValores] = useState<number[]>(() => PERILLAS.map(() => 6));
  const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
  const cambiar = (i: number, v: number) => setValores(prev => prev.map((x, j) => (j === i ? v : x)));

  return (
    <section aria-labelledby="volumen-titulo" className="px-5 py-14 lg:py-20" style={{ background: C.petroleo }}>
      <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 lg:gap-16">
        <div className="lg:sticky lg:top-8 h-fit">
          <h2 id="volumen-titulo" className="text-white text-3xl lg:text-5xl leading-[1.05]" style={{ ...SERIF, fontWeight: 400 }}>
            El dolor que dura meses tiene un control de volumen
          </h2>
          <p className="mt-4 text-white/80 text-base lg:text-lg max-w-[46ch]">
            Rara vez depende de una sola cosa. Mueve las perillas y mira cómo cambia: así lo explica el primer capítulo del programa, y por eso el plan trabaja varias a la vez.
          </p>
          <div className="mt-8"><Medidor valor={promedio} /></div>
          <p className="mt-6 text-xs text-white/60 text-center lg:text-left">Ejemplo ilustrativo: no mide ni diagnostica tu dolor.</p>
        </div>

        <div>
        <div className="lg:hidden sticky top-0 z-10 -mx-5 px-5 py-3 mb-4 flex items-center gap-4" style={{ background: C.petroleo }} aria-hidden>
          <span className="text-white/70 text-sm">Volumen</span>
          <span className="flex-1 h-2 rounded-full bg-white/20 overflow-hidden"><span className="block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${promedio * 10}%`, background: C.naranja }} /></span>
          <span className="text-white text-xl w-16 text-right" style={{ ...SERIF, fontWeight: 600 }}>{nivelDe(promedio)}</span>
        </div>
        <ul className="space-y-3 lg:space-y-5">
          {PERILLAS.map((p, i) => {
            const id = `perilla-${i}`;
            const v = valores[i];
            return (
              <li key={p.nombre} className="rounded-2xl px-4 py-3 lg:px-5 lg:py-4" style={{ background: 'rgba(255,255,255,.06)' }}>
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={id} className="text-white text-lg font-bold">{p.nombre}</label>
                  <span className="text-sm" style={{ color: v > 5 ? '#FFB27A' : '#7FE0D6' }}>{v > 5 ? 'lo sube' : v < 5 ? 'lo baja' : 'neutro'}</span>
                </div>
                <input
                  id={id} type="range" min={0} max={10} step={1} value={v}
                  onChange={e => cambiar(i, Number(e.target.value))}
                  aria-valuetext={v > 5 ? `Sube el volumen: ${p.sube}` : v < 5 ? `Baja el volumen: ${p.baja}` : 'Neutro'}
                  className="perilla mt-3 w-full"
                />
                <p className="mt-2 text-sm text-white/75 min-h-[2.5rem]">{v >= 5 ? p.sube : p.baja}</p>
              </li>
            );
          })}
        </ul>
        </div>
      </div>
    </section>
  );
};

const ProgramaLumbar: React.FC = () => {
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { trackProgramView(); }, []);

  usePageMeta({
    title: 'Programa de ejercicios para el dolor lumbar · 4 semanas | Clínica Mas Life',
    description: 'Programa de 4 semanas con 13 ejercicios explicados paso a paso, una explicación clara de por qué duele, escala de dolor y señales de alarma. Te llega por correo.',
    canonicalPath: '/programas/lumbar',
  });

  const comprar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!acepta) { setError('Debes aceptar los términos para comprar.'); return; }
    setCargando(true);
    trackProgramCheckout(PRECIO);
    try {
      const r = await fetch('/api/process-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-order', slug: SLUG, name: nombre, email: correo, acceptedTerms: true, utm: getUtms() }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.init_point) { window.location.href = j.init_point; return; }
      setError(j.error || 'No pudimos iniciar el pago. Intenta de nuevo.');
    } catch (err) {
      console.error('[programa-lumbar] error de red', err);
      setError('No pudimos conectar. Revisa tu internet e intenta de nuevo.');
    }
    setCargando(false);
  };

  const campo = 'w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-[#00A89E] focus-visible:ring-2 focus-visible:ring-[#00A89E]/30';
  const boton = 'inline-flex items-center justify-center rounded-full px-7 py-4 text-base font-extrabold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60';

  return (
    <div className="w-full bg-white" style={{ ...SANS, color: C.tinta }}>
      <style>{`
        .perilla { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 999px; background: linear-gradient(90deg, #7FE0D6, rgba(255,255,255,.25) 50%, #FFB27A); cursor: pointer; }
        .perilla::-webkit-slider-thumb { -webkit-appearance: none; width: 26px; height: 26px; border-radius: 50%; background: #fff; border: 4px solid ${C.naranja}; }
        .perilla::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: #fff; border: 4px solid ${C.naranja}; }
        .perilla:focus-visible { outline: 2px solid #fff; outline-offset: 6px; }
      `}</style>

      {/* Portada */}
      <section className="relative overflow-hidden px-5 pt-8 pb-14 lg:pt-20 lg:pb-24" style={{ background: `linear-gradient(160deg, ${C.petroleo}, ${C.petroleoClaro})` }}>
        <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-10 lg:gap-12 items-center">
          <div className="order-2 lg:order-1">
            <h1 className="text-white text-[2.25rem] leading-[1.04] lg:text-[5rem] lg:leading-[0.98] max-w-[14ch]" style={{ ...SERIF, fontWeight: 600 }}>
              Entiende tu espalda y vuelve a moverte, a tu ritmo
            </h1>
            <p className="mt-5 text-white/85 text-lg lg:text-xl max-w-[44ch]">
              Una guía de 4 semanas con 13 ejercicios explicados paso a paso y una explicación clara de por qué duele. Para hacer en casa.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <a href="#comprar" className={boton} style={{ background: C.naranja }}>{ACCION}</a>
              <p className="text-white/75 text-sm max-w-[24ch]">Pago único. Te llega por correo apenas se aprueba el pago.</p>
            </div>
          </div>

          <div className="order-1 lg:order-2 relative flex justify-center lg:justify-end">
            <div aria-hidden className="absolute rounded-full" style={{ background: C.naranja, width: '62%', aspectRatio: '1', right: '4%', top: '-10%' }} />
            <img
              src={VISTA_PREVIA[0].src} alt={VISTA_PREVIA[0].alt}
              className="relative w-[40%] max-w-[180px] lg:w-[80%] lg:max-w-[360px] rounded-md -rotate-3"
              style={{ boxShadow: '0 30px 60px -20px rgba(0,0,0,.55)' }}
            />
          </div>
        </div>
      </section>

      {/* Momento interactivo */}
      <VolumenDelDolor />

      {/* Hojeo */}
      <section aria-labelledby="dentro-titulo" className="py-14 lg:py-20">
        <div className="px-5 mx-auto max-w-6xl">
          <h2 id="dentro-titulo" className="text-3xl lg:text-4xl" style={{ ...SERIF, fontWeight: 600 }}>Así es por dentro</h2>
          <p className="mt-2 text-slate-600 max-w-[60ch]">Diseñado como una revista: capítulos cortos, cuadros claros y cada ejercicio con fotos de inicio y final.</p>
        </div>
        <div className="mt-8 flex lg:grid lg:grid-cols-4 gap-4 lg:gap-6 overflow-x-auto lg:overflow-visible snap-x snap-mandatory px-5 pb-4 mx-auto max-w-6xl hide-scrollbar">
          {VISTA_PREVIA.map((v, i) => (
            <figure key={v.src} className={`snap-start flex-none w-[70%] sm:w-[45%] lg:w-auto ${i % 2 ? 'lg:translate-y-8' : ''}`}>
              <img src={v.src} alt={v.alt} loading="lazy" className="w-full h-auto block rounded-md border border-slate-200" style={{ boxShadow: '0 18px 40px -24px rgba(11,79,92,.45)' }} />
            </figure>
          ))}
        </div>
      </section>

      {/* El mes */}
      <section aria-labelledby="mes-titulo" className="px-5 pb-14 lg:pb-20 lg:pt-6">
        <div className="mx-auto max-w-6xl">
          <h2 id="mes-titulo" className="text-3xl lg:text-4xl" style={{ ...SERIF, fontWeight: 600 }}>Tu mes, semana a semana</h2>
          <p className="mt-2 text-slate-600 max-w-[60ch]">Avanzas a la semana siguiente solo si la anterior te resultó cómoda. Si no, la repites. No hay apuro.</p>
          <ol className="mt-8 grid grid-cols-1 lg:grid-cols-4 border-t-2" style={{ borderColor: C.petroleo }}>
            {SEMANAS.map((s, i) => (
              <li key={s.foco} className="py-6 lg:pr-6 border-b lg:border-b-0 border-slate-200 flex lg:block gap-5">
                <span className="text-6xl lg:text-7xl leading-none" style={{ ...SERIF, fontWeight: 600, color: i === 3 ? C.naranja : C.petroleoClaro }}>{i + 1}</span>
                <div className="lg:mt-4">
                  <p className="text-lg font-extrabold">{s.foco}</p>
                  <p className="mt-1 text-slate-600 text-sm">{s.sesiones}, unos {s.minutos} por sesión, {s.ejercicios} ejercicios</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Compra */}
      <section className="px-5 py-14 lg:py-20 bg-slate-50">
        <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
          <div>
            <h2 className="text-3xl lg:text-4xl" style={{ ...SERIF, fontWeight: 600 }}>Lo que recibes</h2>
            <ul className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
              {INCLUYE.map(t => (
                <li key={t} className="py-3 flex gap-3">
                  <span aria-hidden className="mt-2 h-2 w-2 flex-none rounded-full" style={{ background: C.turquesa }} />
                  <span>{t}</span>
                </li>
              ))}
            </ul>

            <div className="mt-10 rounded-2xl border-l-4 bg-white p-5" style={{ borderColor: '#DC2626' }}>
              <h3 className="text-lg font-extrabold">Antes de empezar: no es para ti si…</h3>
              <ul className="mt-3 space-y-2 text-slate-700">
                {NO_PARA.map(t => <li key={t} className="flex gap-2"><span aria-hidden className="text-rose-600 font-extrabold">!</span><span>{t}</span></li>)}
              </ul>
              <p className="mt-4 text-sm text-slate-500">
                Este programa es educativo y no reemplaza una evaluación profesional. No promete curar el dolor ni sustituye el tratamiento de un kinesiólogo o médico.
              </p>
            </div>
          </div>

          <form id="comprar" onSubmit={comprar} className="rounded-3xl bg-white p-6 lg:p-8 h-fit scroll-mt-4 border-2" style={{ borderColor: C.petroleo }}>
            <div className="flex items-center gap-4">
              <img src={VISTA_PREVIA[0].src} alt="" aria-hidden className="w-16 rounded-sm -rotate-3 shadow-md" />
              <div>
                <p className="font-bold">Programa lumbar de 4 semanas</p>
                <p className="text-4xl" style={{ ...SERIF, fontWeight: 600, color: C.petroleo }}>{clp(PRECIO)}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-500">Pago único. Te llega por correo apenas se aprueba el pago.</p>

            <label className="mt-6 block text-sm font-bold text-slate-700" htmlFor="pl-nombre">Tu nombre</label>
            <input id="pl-nombre" className={campo} value={nombre} onChange={e => setNombre(e.target.value)} autoComplete="name" required minLength={2} maxLength={120} />

            <label className="mt-4 block text-sm font-bold text-slate-700" htmlFor="pl-correo">Tu correo (aquí llega el programa)</label>
            <input id="pl-correo" type="email" className={campo} value={correo} onChange={e => setCorreo(e.target.value)} autoComplete="email" required />

            <label className="mt-5 flex gap-3 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[#0B4F5C]" checked={acepta} onChange={e => setAcepta(e.target.checked)} />
              <span>
                Leí y acepto los <Link to="/terminos" className="underline font-bold">términos</Link> y la <Link to="/privacidad" className="underline font-bold">política de privacidad</Link>, y entiendo que este programa no reemplaza una evaluación profesional.
              </span>
            </label>

            {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}

            <button type="submit" disabled={cargando} className={`${boton} mt-6 w-full focus-visible:outline-[#0B4F5C]`} style={{ background: C.petroleo }}>
              {cargando ? 'Redirigiendo al pago…' : ACCION}
            </button>
            <p className="mt-3 text-center text-xs text-slate-500">Pago seguro con MercadoPago. Aceptamos tarjetas y saldo MercadoPago.</p>
          </form>
        </div>
      </section>

      {/* Preguntas */}
      <section aria-labelledby="faq-titulo" className="px-5 pt-14 pb-28 lg:pb-20 mx-auto max-w-3xl">
        <h2 id="faq-titulo" className="text-3xl" style={{ ...SERIF, fontWeight: 600 }}>Preguntas frecuentes</h2>
        <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
          {[
            ['¿Cómo lo recibo?', 'Por correo, con un enlace de descarga personal. El enlace vence a los 7 días y permite hasta 5 descargas.'],
            ['¿No me llegó el correo?', 'Revisa la carpeta de spam o promociones. Si no aparece, escríbenos a maslife@clinicamaslife.cl con el correo que usaste.'],
            ['¿Sirve si tengo un diagnóstico?', 'Consulta primero con tu kinesiólogo o médico. Este programa es general y no está adaptado a una condición en particular.'],
          ].map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="cursor-pointer list-none flex justify-between gap-4 font-bold text-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00A89E] rounded">
                {q}<span aria-hidden className="transition-transform group-open:rotate-45 motion-reduce:transition-none" style={{ color: C.turquesa }}>+</span>
              </summary>
              <p className="mt-2 text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3">
        <div><p className="text-xs text-slate-500 leading-none">Pago único</p><p className="text-xl font-extrabold leading-tight" style={{ color: C.petroleo }}>{clp(PRECIO)}</p></div>
        <a href="#comprar" className="rounded-full px-6 py-3 font-extrabold text-white" style={{ background: C.petroleo }}>{ACCION}</a>
      </div>
    </div>
  );
};

export default ProgramaLumbar;
