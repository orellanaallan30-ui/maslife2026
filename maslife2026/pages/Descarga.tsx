import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePageMeta } from '../lib/seo';

// La descarga NO arranca al abrir la página: los antivirus y las vistas previas
// de los correos abren los enlaces solos y gastarían las descargas del comprador.
// Cada clic pide una URL firmada de 60 segundos al servidor.

const TEAL = '#00a89e';
const FONT = { fontFamily: "'Manrope', system-ui, sans-serif" };

const Descarga: React.FC = () => {
  const { token = '' } = useParams();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [restantes, setRestantes] = useState<number | null>(null);

  usePageMeta({ title: 'Descargar tu programa | Clínica Mas Life', description: 'Descarga tu programa.', canonicalPath: '/descarga' });

  const descargar = async () => {
    setCargando(true);
    setError('');
    try {
      const r = await fetch('/api/book-appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'download', token }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.url) {
        setRestantes(typeof j.restantes === 'number' ? j.restantes : null);
        window.location.href = j.url;
      } else {
        setError(j.error || 'No se pudo iniciar la descarga.');
      }
    } catch (e) {
      console.error('[descarga] error de red', e);
      setError('No pudimos conectar. Revisa tu internet e intenta de nuevo.');
    }
    setCargando(false);
  };

  return (
    <div className="w-full bg-white px-5 py-16" style={FONT}>
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 p-8 text-center shadow-lg shadow-slate-200/60">
        <p className="text-2xl font-extrabold text-slate-900">Tu programa está listo</p>
        <p className="mt-3 text-slate-600">Pulsa el botón para descargar el PDF. Guárdalo en tu teléfono o computador.</p>
        <button onClick={descargar} disabled={cargando} className="mt-6 w-full rounded-xl py-4 text-base font-extrabold text-white disabled:opacity-60" style={{ background: TEAL }}>
          {cargando ? 'Preparando descarga…' : 'Descargar mi programa'}
        </button>
        {restantes !== null && <p className="mt-3 text-sm text-slate-500">Te quedan {restantes} {restantes === 1 ? 'descarga' : 'descargas'} con este enlace.</p>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}
        <p className="mt-6 text-xs text-slate-500">Este programa no reemplaza una evaluación profesional.</p>
      </div>
    </div>
  );
};

export default Descarga;
