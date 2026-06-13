import React, { useState, useEffect } from 'react';
import { useClinic } from '../ClinicContext';
import { getReferralCount } from '../supabaseService';
import { supabase } from '../supabaseClient';

const ReferralProgram: React.FC = () => {
  const { loggedPro, setLoggedPro } = useClinic();
  const [referralCount, setReferralCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const referralCode = loggedPro?.referralCode || '';
  const referralLink = referralCode ? `https://clinicamaslife.cl/pro/register?ref=${referralCode}` : '';
  const creditClp = loggedPro?.referralCreditClp ?? 0;

  useEffect(() => {
    if (loggedPro?.id) getReferralCount(loggedPro.id).then(setReferralCount);
  }, [loggedPro?.id]);

  const handleCopy = () => {
    if (!referralLink) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(referralLink)
        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
        .catch(() => fallbackCopy());
    } else {
      fallbackCopy();
    }
  };

  const fallbackCopy = () => {
    const el = document.createElement('textarea');
    el.value = referralLink;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (!referralLink) return;
    const text = `Regístrate en Clínica Mas Life y obtén tu primer mes gratis: ${referralLink}`;
    if (navigator.share) {
      navigator.share({ title: 'Únete a Clínica Mas Life', text, url: referralLink });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const handleGenerateCode = async () => {
    if (!loggedPro?.id) return;
    setIsGenerating(true);
    try {
      const namePrefix = (loggedPro.name || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padEnd(4, 'X');
      const code = namePrefix + loggedPro.id.replace(/-/g, '').slice(0, 4).toUpperCase();
      const { error } = await supabase
        .from('professionals')
        .update({ referral_code: code })
        .eq('id', loggedPro.id);
      if (!error) setLoggedPro({ ...loggedPro, referralCode: code });
    } finally {
      setIsGenerating(false);
    }
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

      {/* Benefits */}
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

      {/* Enlace de referido */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tu enlace de referido</p>

        {referralCode ? (
          <>
            <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200">
              <span className="text-xs font-bold text-slate-700 flex-1 truncate">{referralLink}</span>
              <span className="text-[10px] font-black text-slate-400 uppercase shrink-0 bg-slate-100 px-2 py-0.5 rounded-lg">{referralCode}</span>
            </div>
            <button
              onClick={handleCopy}
              className="w-full py-3 bg-primary text-white font-black rounded-xl text-xs uppercase tracking-widest hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 border-b-4 border-primary/70 active:border-b-0"
            >
              <span className="material-icons-round text-sm">{copied ? 'check_circle' : 'content_copy'}</span>
              {copied ? '¡Copiado!' : 'Copiar enlace'}
            </button>
            <button
              onClick={handleShare}
              className="w-full py-3 bg-[#25D366] text-white font-black rounded-xl text-xs uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              <span className="material-icons-round text-sm">share</span>
              Compartir por WhatsApp
            </button>
          </>
        ) : (
          <div className="text-center space-y-3 py-2">
            <p className="text-sm text-slate-500">Aún no tienes un código de referido</p>
            <button
              onClick={handleGenerateCode}
              disabled={isGenerating}
              className="w-full py-3 bg-primary text-white font-black rounded-xl text-xs uppercase tracking-widest hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isGenerating
                ? <><span className="material-icons-round text-sm animate-spin">sync</span>Generando...</>
                : <><span className="material-icons-round text-sm">auto_awesome</span>Generar mi código</>
              }
            </button>
          </div>
        )}
      </div>

      {/* Estadísticas */}
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
        {referralCount === 0 && creditClp === 0 && (
          <p className="text-center text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
            Comparte tu enlace para empezar a acumular créditos
          </p>
        )}
      </div>

      {/* Cómo funciona */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">¿Cómo funciona?</p>
        {[
          { icon: 'link', text: 'Copia tu enlace único y compártelo con colegas de salud' },
          { icon: 'person_add', text: 'Tu colega se registra usando tu enlace y obtiene 1 mes extra gratis' },
          { icon: 'check_circle', text: 'Ambos reciben sus beneficios automáticamente' },
        ].map((s, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-icons-round text-sm text-primary">{s.icon}</span>
            </div>
            <p className="text-xs text-slate-600 font-bold leading-relaxed pt-1.5">{s.text}</p>
          </div>
        ))}
      </div>

      <p className="text-center text-[10px] text-slate-400 pb-4">
        Sujeto a los{' '}
        <a href="/terminos" target="_blank" className="underline hover:text-slate-600">Términos y Condiciones</a>
        {' '}— Sección 11
      </p>
    </div>
  );
};

export default ReferralProgram;
