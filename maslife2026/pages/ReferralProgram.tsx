import React, { useState, useEffect } from 'react';
import { useClinic } from '../ClinicContext';
import { getReferralCount } from '../supabaseService';

const ReferralProgram: React.FC = () => {
  const { loggedPro } = useClinic();
  const [referralCount, setReferralCount] = useState(0);
  const [copied, setCopied] = useState(false);

  const referralCode = loggedPro?.referralCode || '';
  const referralLink = referralCode ? `https://clinicamaslife.cl/registro?ref=${referralCode}` : '';
  const creditClp = loggedPro?.referralCreditClp ?? 0;

  useEffect(() => {
    if (loggedPro?.id) getReferralCount(loggedPro.id).then(setReferralCount);
  }, [loggedPro?.id]);

  const handleCopy = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex-1 w-full overflow-y-auto bg-[#f8fafc] px-4 py-6 space-y-5 max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-1 pb-2">
        <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <span className="material-icons-round text-3xl text-primary">card_giftcard</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Invita y Gana</h1>
        <p className="text-sm text-slate-500">Comparte tu link con otros profesionales de salud</p>
      </div>

      {/* Benefits cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center space-y-1">
          <span className="material-icons-round text-2xl text-emerald-500">person_add</span>
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Tu referido obtiene</p>
          <p className="text-xl font-black text-slate-900">1 mes gratis</p>
          <p className="text-[10px] text-slate-400 leading-snug">Además del período de prueba estándar</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center space-y-1">
          <span className="material-icons-round text-2xl text-primary">savings</span>
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Tú ganas</p>
          <p className="text-xl font-black text-slate-900">$1.000</p>
          <p className="text-[10px] text-slate-400 leading-snug">De descuento en tu próxima renovación</p>
        </div>
      </div>

      {/* Referral link */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tu enlace de referido</p>
        <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200">
          <span className="text-xs font-bold text-slate-700 flex-1 truncate">{referralLink || 'Generando enlace...'}</span>
          <span className="text-[10px] font-black text-slate-400 uppercase shrink-0 bg-slate-100 px-2 py-0.5 rounded-lg">{referralCode}</span>
        </div>
        <button
          onClick={handleCopy}
          disabled={!referralLink}
          className="w-full py-3 bg-primary text-white font-black rounded-xl text-xs uppercase tracking-widest hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 flex items-center justify-center gap-2 border-b-4 border-primary/70 active:border-b-0"
        >
          <span className="material-icons-round text-sm">{copied ? 'check_circle' : 'content_copy'}</span>
          {copied ? '¡Copiado!' : 'Copiar enlace'}
        </button>
        <button
          onClick={() => {
            if (!referralLink) return;
            if (navigator.share) {
              navigator.share({ title: 'Únete a Clínica Mas Life', text: 'Regístrate con mi link y obtén tu primer mes gratis', url: referralLink });
            } else {
              handleCopy();
            }
          }}
          disabled={!referralLink}
          className="w-full py-3 bg-slate-100 text-slate-700 font-black rounded-xl text-xs uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <span className="material-icons-round text-sm">share</span>
          Compartir
        </button>
      </div>

      {/* Stats */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Tu actividad</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="text-3xl font-black text-slate-900">{referralCount}</p>
            <p className="text-xs text-slate-400 font-bold mt-0.5">{referralCount === 1 ? 'Profesional referido' : 'Profesionales referidos'}</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-black text-primary">${creditClp.toLocaleString('es-CL')}</p>
            <p className="text-xs text-slate-400 font-bold mt-0.5">Crédito acumulado</p>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">¿Cómo funciona?</p>
        {[
          { icon: 'link', text: 'Copia tu enlace único y compártelo con colegas de salud' },
          { icon: 'person_add', text: 'Tu colega se registra usando tu enlace' },
          { icon: 'check_circle', text: 'Ambos reciben sus beneficios automáticamente' },
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-icons-round text-sm text-primary">{step.icon}</span>
            </div>
            <p className="text-xs text-slate-600 font-bold leading-relaxed pt-1.5">{step.text}</p>
          </div>
        ))}
      </div>

      {/* T&C note */}
      <p className="text-center text-[10px] text-slate-400 pb-4">
        Sujeto a los{' '}
        <a href="/terminos" target="_blank" className="underline hover:text-slate-600">Términos y Condiciones</a>
        {' '}— Sección 11
      </p>
    </div>
  );
};

export default ReferralProgram;
