import React, { useState } from 'react';

// Piezas compartidas de las páginas de programas digitales: redes sociales y
// recuadro para proponer temas de próximas guías (se guardan en guide_suggestions).

const REDES = [
  { nombre: 'Instagram', usuario: '@clinicamaslife', href: 'https://www.instagram.com/clinicamaslife/',
    icono: <path d="M12 7.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4Zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM12 3.6c2.7 0 3 0 4.1.1 2.7.1 4 1.4 4.1 4.1.1 1.1.1 1.4.1 4.2s0 3-.1 4.1c-.1 2.7-1.4 4-4.1 4.1-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-2.7-.1-4-1.4-4.1-4.1-.1-1.1-.1-1.4-.1-4.1s0-3 .1-4.2C3.9 5.1 5.2 3.8 7.9 3.7c1.1-.1 1.4-.1 4.1-.1Z" /> },
  { nombre: 'Facebook', usuario: 'Clínica Mas Life', href: 'https://www.facebook.com/106841074135065',
    icono: <path d="M13.4 21v-7.6h2.6l.4-3h-3V8.5c0-.9.2-1.5 1.5-1.5h1.6V4.3a21 21 0 0 0-2.3-.1c-2.3 0-3.9 1.4-3.9 4v2.2H7.7v3h2.6V21h3.1Z" /> },
  { nombre: 'WhatsApp', usuario: '+56 9 6532 9974', href: 'https://wa.me/56965329974',
    icono: <path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2Zm0 16a7.2 7.2 0 0 1-3.7-1l-.3-.2-2.7.7.7-2.6-.2-.3A7.2 7.2 0 1 1 12 19.2Zm4-5.4c-.2-.1-1.3-.6-1.5-.7-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a5.9 5.9 0 0 1-2.9-2.5c-.2-.4.2-.4.6-1.2.1-.1 0-.3 0-.4l-.7-1.6c-.2-.4-.4-.4-.5-.4h-.4a.8.8 0 0 0-.6.3 2.5 2.5 0 0 0-.8 1.9 4.4 4.4 0 0 0 .9 2.3 10 10 0 0 0 3.9 3.4c1.4.6 2 .7 2.7.6.4-.1 1.3-.5 1.5-1.1.2-.5.2-1 .1-1.1l-.4-.3Z" /> },
];

export const RedesSociales: React.FC<{ color: string }> = ({ color }) => (
  <div>
    <h2 className="text-2xl font-extrabold">Síguenos</h2>
    <p className="mt-1 text-slate-600">Publicamos consejos de kinesiología cada semana.</p>
    <ul className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-3">
      {REDES.map(r => (
        <li key={r.nombre}>
          <a href={r.href} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ outlineColor: color }}>
            <svg viewBox="0 0 24 24" width="28" height="28" fill={color} aria-hidden>{r.icono}</svg>
            <span><span className="block font-bold">{r.nombre}</span><span className="block text-sm text-slate-500">{r.usuario}</span></span>
          </a>
        </li>
      ))}
    </ul>
  </div>
);

export const SugerenciaGuia: React.FC<{ slug: string; origen: 'pagina' | 'gracias'; color: string }> = ({ slug, origen, color }) => {
  const [tema, setTema] = useState('');
  const [email, setEmail] = useState('');
  const [estado, setEstado] = useState<'listo' | 'enviando' | 'enviado' | 'error'>('listo');
  const [error, setError] = useState('');

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tema.trim().length < 3) { setError('Cuéntanos el tema en unas palabras.'); setEstado('error'); return; }
    setEstado('enviando'); setError('');
    try {
      const r = await fetch('/api/book-appointment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'guide-suggestion', tema, email, slug, origen }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'No se pudo enviar');
      setEstado('enviado');
    } catch (err) {
      console.error('[sugerencia-guia]', (err as Error)?.message);
      setError('No se pudo enviar. Intenta de nuevo en un momento.'); setEstado('error');
    }
  };

  if (estado === 'enviado') {
    return (
      <div className="rounded-3xl bg-white border-2 p-6" style={{ borderColor: color }}>
        <p className="text-xl font-extrabold">¡Gracias!</p>
        <p className="mt-1 text-slate-600">Con lo que nos cuentan decidimos las próximas guías.{email ? ' Te avisaremos por correo cuando salga.' : ''}</p>
      </div>
    );
  }
  return (
    <form onSubmit={enviar} className="rounded-3xl bg-white border-2 p-6" style={{ borderColor: color }}>
      <h2 className="text-2xl font-extrabold">¿Sobre qué te gustaría una próxima guía?</h2>
      <p className="mt-1 text-slate-600">Cuéntanos qué tema o molestia te interesa. Con eso decidimos qué preparar.</p>
      <label htmlFor={`sug-tema-${origen}`} className="mt-5 block text-sm font-bold text-slate-700">Tema</label>
      <textarea id={`sug-tema-${origen}`} value={tema} onChange={e => setTema(e.target.value)} maxLength={400} rows={3}
        placeholder="Por ejemplo: dolor de rodilla, cuello por el computador, ejercicios para adultos mayores…"
        className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base focus:outline-none focus:ring-2" style={{ ['--tw-ring-color' as string]: color }} />
      <label htmlFor={`sug-email-${origen}`} className="mt-4 block text-sm font-bold text-slate-700">Tu correo <span className="font-normal text-slate-500">(opcional, para avisarte cuando salga)</span></label>
      <input id={`sug-email-${origen}`} type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={200} autoComplete="email"
        className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base focus:outline-none focus:ring-2" />
      {estado === 'error' && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">{error}</p>}
      <button type="submit" disabled={estado === 'enviando'} className="mt-5 w-full lg:w-auto rounded-full px-7 py-3 font-extrabold text-white disabled:opacity-60" style={{ background: color }}>
        {estado === 'enviando' ? 'Enviando…' : 'Enviar tema'}
      </button>
    </form>
  );
};
