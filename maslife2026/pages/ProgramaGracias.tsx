import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { usePageMeta } from '../lib/seo';
import { trackProgramPurchase } from '../analytics';

const PRECIO = 9990;
const EVALUACION_URL = '/p/rodrigo-orellana';

// Página a la que vuelve MercadoPago. NO confía en los parámetros de la URL: le
// pide al servidor que verifique el pago contra MercadoPago y entregue el correo.

type Estado = 'verificando' | 'pendiente' | 'entregado' | 'error';
const TEAL = '#00a89e';
const FONT = { fontFamily: "'Manrope', system-ui, sans-serif" };

const ProgramaGracias: React.FC = () => {
  const [params] = useSearchParams();
  const orderId = params.get('order') || '';
  const paymentId = params.get('payment_id') || params.get('collection_id') || undefined;
  const [estado, setEstado] = useState<Estado>('verificando');
  const intentos = useRef(0);

  usePageMeta({ title: 'Tu compra | Clínica Mas Life', description: 'Estado de tu compra.', canonicalPath: '/programas/gracias' });

  const verificar = async () => {
    try {
      const r = await fetch('/api/book-appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'order-confirm', orderId, paymentId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setEstado('error'); return false; }
      if (j.entregado) {
        // Una sola vez por pedido y navegador; además Meta deduplica por eventID.
        try {
          const clave = `programa_purchase_${orderId}`;
          if (!sessionStorage.getItem(clave)) { trackProgramPurchase(orderId, PRECIO); sessionStorage.setItem(clave, '1'); }
        } catch { trackProgramPurchase(orderId, PRECIO); }
        setEstado('entregado');
        return true;
      }
      setEstado('pendiente');
      return false;
    } catch (e) {
      console.error('[programa-gracias] error de red', e);
      setEstado('error');
      return false;
    }
  };

  useEffect(() => {
    if (!orderId) { setEstado('error'); return; }
    let vivo = true;
    const ciclo = async () => {
      const listo = await verificar();
      intentos.current += 1;
      if (vivo && !listo && intentos.current < 8) setTimeout(ciclo, 4000);
    };
    ciclo();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const caja = 'mx-auto max-w-xl rounded-3xl border border-slate-200 p-8 text-center shadow-lg shadow-slate-200/60';

  return (
    <div className="w-full bg-white px-5 py-16" style={FONT}>
      <div className={caja}>
        {estado === 'verificando' && (<><p className="text-2xl font-extrabold text-slate-900">Verificando tu pago…</p><p className="mt-3 text-slate-600">Un momento, no cierres esta página.</p></>)}
        {estado === 'pendiente' && (<>
          <p className="text-2xl font-extrabold text-slate-900">Tu pago aún se está procesando</p>
          <p className="mt-3 text-slate-600">Cuando MercadoPago lo apruebe, te enviamos el programa por correo. Esta página se actualiza sola.</p>
          <button onClick={() => { intentos.current = 0; setEstado('verificando'); verificar(); }} className="mt-6 rounded-xl px-6 py-3 font-extrabold text-white" style={{ background: TEAL }}>Verificar de nuevo</button>
        </>)}
        {estado === 'entregado' && (<>
          <p className="text-2xl font-extrabold text-slate-900">¡Gracias por tu compra!</p>
          <p className="mt-3 text-slate-600">Te enviamos el programa por correo. Revisa tu bandeja de entrada y también spam o promociones.</p>
          <p className="mt-3 text-sm text-slate-500">¿Algún problema? Escríbenos a maslife@clinicamaslife.cl</p>
          <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-5 text-left">
            <p className="font-extrabold text-slate-900">¿Quieres que un kinesiólogo adapte el plan a ti?</p>
            <p className="mt-1 text-sm text-slate-600">Agenda una evaluación en Clínica Mas Life.</p>
            <Link to={EVALUACION_URL} className="mt-3 inline-block rounded-xl px-5 py-3 font-extrabold text-white" style={{ background: TEAL }}>Agendar evaluación</Link>
          </div>
        </>)}
        {estado === 'error' && (<>
          <p className="text-2xl font-extrabold text-slate-900">No pudimos verificar tu compra</p>
          <p className="mt-3 text-slate-600">Si pagaste, no te preocupes: escríbenos a maslife@clinicamaslife.cl con el correo que usaste y te enviamos el programa.</p>
        </>)}
        <Link to="/" className="mt-8 inline-block text-sm font-bold underline text-slate-500">Volver al inicio</Link>
      </div>
    </div>
  );
};

export default ProgramaGracias;
