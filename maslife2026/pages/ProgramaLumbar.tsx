import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../lib/seo';

// Página de venta del "Programa de ejercicios para el dolor lumbar · 4 semanas".
// El precio mostrado es informativo: el cobro lo calcula el servidor desde su
// catálogo (api/_lib/products.ts). Si ambos difieren, manda el servidor.

const SLUG = 'programa-lumbar-4-semanas';
const PRECIO = 9990;
const TEAL = '#00a89e';
const INK = '#0f172a';
const FONT = { fontFamily: "'Manrope', system-ui, sans-serif" };
const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;

const INCLUYE = [
  'Una explicación clara de por qué duele la espalda y por qué no siempre hay un daño',
  'Un plan de 4 semanas, con progresión gradual y 13 ejercicios con fotos',
  'Cada ejercicio explicado paso a paso',
  'Escala de dolor, semáforo y registro de síntomas para seguir tu avance',
  'Señales de alarma: cuándo dejar de ejercitar y consultar',
];
const NO_PARA = [
  'Si te operaron hace poco o tuviste un golpe o caída reciente',
  'Si el dolor baja por la pierna con hormigueo o pérdida de fuerza',
  'Si hay fiebre, pérdida de peso sin causa o dolor que te despierta de noche',
  'Si no sabes qué tienes: primero conviene una evaluación profesional',
];

const ProgramaLumbar: React.FC = () => {
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  usePageMeta({
    title: 'Programa de ejercicios para el dolor lumbar · 4 semanas | Clínica Mas Life',
    description: 'Programa de 4 semanas con ejercicios explicados paso a paso, escala de dolor y señales de alarma. Descarga inmediata por correo.',
    canonicalPath: '/programas/lumbar',
  });

  const comprar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!acepta) { setError('Debes aceptar los términos para comprar.'); return; }
    setCargando(true);
    try {
      const r = await fetch('/api/process-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-order', slug: SLUG, name: nombre, email: correo, acceptedTerms: true }),
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

  const campo = 'w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none focus:border-[#00a89e] focus:ring-2 focus:ring-[#00a89e]/20';

  return (
    <div className="w-full bg-white" style={FONT}>
      <section className="px-5 py-12 lg:py-16 text-center" style={{ background: 'linear-gradient(180deg,#e6f7f5,#ffffff)' }}>
        <p className="text-xs font-extrabold tracking-[0.2em]" style={{ color: TEAL }}>CLÍNICA MAS LIFE</p>
        <h1 className="mt-3 text-3xl lg:text-5xl font-extrabold leading-tight mx-auto max-w-3xl" style={{ color: INK }}>
          Programa de ejercicios para el dolor lumbar
        </h1>
        <p className="mt-4 text-base lg:text-lg text-slate-600 mx-auto max-w-2xl">
          4 semanas de ejercicio guiado, con progresión gradual. Lo recibes por correo apenas se aprueba tu pago.
        </p>
      </section>

      <section className="px-5 pb-10 mx-auto max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        <div>
          <h2 className="text-xl font-extrabold" style={{ color: INK }}>Qué incluye</h2>
          <ul className="mt-4 space-y-3">
            {INCLUYE.map(t => (
              <li key={t} className="flex gap-3 text-slate-700">
                <span className="mt-0.5 h-6 w-6 flex-none rounded-full text-white text-sm font-extrabold flex items-center justify-center" style={{ background: TEAL }}>✓</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>

          <h2 className="mt-10 text-xl font-extrabold" style={{ color: INK }}>No es para ti si…</h2>
          <ul className="mt-4 space-y-3">
            {NO_PARA.map(t => (
              <li key={t} className="flex gap-3 text-slate-700">
                <span className="mt-0.5 h-6 w-6 flex-none rounded-full bg-amber-100 text-amber-700 text-sm font-extrabold flex items-center justify-center">!</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-slate-500">
            Este programa es educativo y no reemplaza una evaluación profesional. No promete curar el dolor ni sustituye el tratamiento de un kinesiólogo o médico.
          </p>
        </div>

        <form onSubmit={comprar} className="rounded-3xl border border-slate-200 p-6 shadow-lg shadow-slate-200/60 h-fit">
          <p className="text-sm font-bold text-slate-500">Precio</p>
          <p className="text-4xl font-extrabold" style={{ color: INK }}>{clp(PRECIO)}</p>
          <p className="text-sm text-slate-500">Pago único · descarga inmediata</p>

          <label className="mt-6 block text-sm font-bold text-slate-700" htmlFor="pl-nombre">Tu nombre</label>
          <input id="pl-nombre" className={campo} value={nombre} onChange={e => setNombre(e.target.value)} autoComplete="name" required minLength={2} maxLength={120} />

          <label className="mt-4 block text-sm font-bold text-slate-700" htmlFor="pl-correo">Tu correo (aquí llega el programa)</label>
          <input id="pl-correo" type="email" className={campo} value={correo} onChange={e => setCorreo(e.target.value)} autoComplete="email" required />

          <label className="mt-5 flex gap-3 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={acepta} onChange={e => setAcepta(e.target.checked)} />
            <span>
              Leí y acepto los <Link to="/terminos" className="underline font-bold">términos</Link> y la <Link to="/privacidad" className="underline font-bold">política de privacidad</Link>, y entiendo que este programa no reemplaza una evaluación profesional.
            </span>
          </label>

          {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}

          <button type="submit" disabled={cargando}
            className="mt-6 w-full rounded-xl py-4 text-base font-extrabold text-white disabled:opacity-60"
            style={{ background: TEAL }}>
            {cargando ? 'Redirigiendo al pago…' : `Comprar por ${clp(PRECIO)}`}
          </button>
          <p className="mt-3 text-center text-xs text-slate-500">Pago seguro con MercadoPago. Aceptamos tarjetas y saldo MercadoPago.</p>
        </form>
      </section>

      <section className="px-5 pb-16 mx-auto max-w-3xl">
        <h2 className="text-xl font-extrabold" style={{ color: INK }}>Preguntas frecuentes</h2>
        <div className="mt-4 space-y-4 text-slate-700">
          <div><p className="font-bold">¿Cómo lo recibo?</p><p>Por correo, con un enlace de descarga personal. El enlace vence a los 7 días y permite hasta 5 descargas.</p></div>
          <div><p className="font-bold">¿No me llegó el correo?</p><p>Revisa la carpeta de spam o promociones. Si no aparece, escríbenos a maslife@clinicamaslife.cl con el correo que usaste.</p></div>
          <div><p className="font-bold">¿Sirve si tengo un diagnóstico?</p><p>Consulta primero con tu kinesiólogo o médico. Este programa es general y no está adaptado a una condición en particular.</p></div>
        </div>
      </section>
    </div>
  );
};

export default ProgramaLumbar;
