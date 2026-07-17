import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Appointment } from '../types';
import { useClinic } from '../ClinicContext';
import { supabase } from '../supabaseClient';


const ProfessionalDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { appointments, manualTransactions, loggedPro } = useClinic();
  // Nota: NO retornar temprano aquí. Todos los hooks deben ejecutarse siempre
  // (si la sesión expira, loggedPro pasa a null en un re-render; un return antes
  // de los hooks rompería las reglas de Hooks → pantalla en blanco). El guard va
  // DESPUÉS de todos los hooks, justo antes del render.

  // Verificar estado de suscripción desde el servidor (no confiar solo en localStorage)
  const [serverSubStatus, setServerSubStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!loggedPro) return;
    void Promise.resolve(
      supabase
        .from('professionals')
        .select('subscription_status')
        .eq('id', loggedPro.id)
        .single()
        .then(({ data }) => {
          if (data?.subscription_status) setServerSubStatus(data.subscription_status);
        })
    ).catch(() => {
      // Sin conexión: usar estado local como fallback
      setServerSubStatus(loggedPro.subscriptionStatus);
    });
  }, [loggedPro?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // El estado del servidor tiene precedencia; fallback al local mientras carga
  const isPaused = (serverSubStatus ?? loggedPro?.subscriptionStatus) === 'paused';

  const [linkCopied, setLinkCopied] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Bienvenida (solo primer ingreso, por profesional)
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (!loggedPro) return;
    if (!localStorage.getItem(`maslife_welcome_seen_${loggedPro.id}`)) setShowWelcome(true);
  }, [loggedPro?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dismissWelcome = () => {
    if (loggedPro) localStorage.setItem(`maslife_welcome_seen_${loggedPro.id}`, '1');
    setShowWelcome(false);
  };

  const bookingLink = `${window.location.origin}/p/${loggedPro?.slug || loggedPro?.id || ''}`;

  const handleCopyBookingLink = useCallback(() => {
    navigator.clipboard.writeText(bookingLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    }).catch(() => {
      const el = document.createElement('textarea');
      el.value = bookingLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  }, [bookingLink]);

  const handleShareBookingLink = useCallback(() => {
    if (navigator.share) {
      navigator.share({ title: `Agenda con ${loggedPro?.name || ''}`, text: '¡Agenda tu hora conmigo!', url: bookingLink });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`¡Hola! Puedes agendar una cita conmigo directamente aquí: ${bookingLink}`)}`, '_blank');
    }
  }, [bookingLink, loggedPro?.name]);

  // Guard tras TODOS los hooks: si la sesión expiró, redirigir limpio al login.
  if (!loggedPro) return <Navigate to="/pro/login" />;

  const profileComplete = !!(loggedPro.slug && loggedPro.specialty && loggedPro.services?.length > 0);
  const MP_SUBSCRIPTION_LINK = import.meta.env.VITE_GLOBAL_SUBSCRIPTION_LINK || "https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=e7c9a9a7adc24dee8c1f7fb78bdbdc67";
  const mpLinkWithBack = MP_SUBSCRIPTION_LINK;

  // Estado de prueba gratis (para el banner de suscripción)
  const subStatus = serverSubStatus ?? loggedPro.subscriptionStatus;
  const isTrial = subStatus === 'trial';
  const trialDaysLeft = loggedPro.trialEndDate
    ? Math.ceil((new Date(loggedPro.trialEndDate).getTime() - currentTime.getTime()) / 86400000)
    : null;

  const SPECIALTY_TITLES: Record<string, string> = {
    'Kinesiología': 'Kinesiólogo',
    'Psicología': 'Psicólogo',
    'Nutrición': 'Nutricionista',
    'Nutrición y Dietética': 'Nutricionista',
    'Medicina General': 'Médico',
    'Medicina Familiar': 'Médico',
    'Cardiología': 'Cardiólogo',
    'Dermatología': 'Dermatólogo',
    'Pediatría': 'Pediatra',
    'Traumatología': 'Traumatólogo',
    'Fonoaudiología': 'Fonoaudiólogo',
    'Terapia Ocupacional': 'Terapeuta Ocupacional',
    'Enfermería': 'Enfermero',
    'Matrona': 'Matrona',
    'Odontología': 'Odontólogo',
    'Oftalmología': 'Oftalmólogo',
    'Neurología': 'Neurólogo',
    'Gastroenterología': 'Gastroenterólogo',
    'Reumatología': 'Reumatólogo',
    'Endocrinología': 'Endocrinólogo',
    'Psiquiatría': 'Psiquiatra',
    'Urología': 'Urólogo',
    'Ginecología': 'Ginecólogo',
    'Fisioterapia': 'Fisioterapeuta',
  };

  const specialtyTitle = loggedPro.specialty
    ? (SPECIALTY_TITLES[loggedPro.specialty] ?? loggedPro.specialty)
    : null;

  const firstName = loggedPro.name.split(' ')[0];

  const dayLabel = currentTime.toLocaleDateString('es-CL', { weekday: 'long' });
  const dayCapitalized = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
  const dateLabel = currentTime.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeHM = currentTime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  const timeSec = currentTime.toLocaleTimeString('es-CL', { second: '2-digit', hour12: false }).slice(-2);

  const today = new Date().toISOString().split('T')[0];
  const myTodayApps = React.useMemo(() =>
    appointments.filter(a => a.date === today && a.professionalId === loggedPro.id && a.status !== 'Cancelado'),
    [appointments, today, loggedPro.id]
  );

  const totalIncomeToday = React.useMemo(() => {
    const appsIncome = myTodayApps
      .filter(a => a.paymentStatus === 'Pagado')
      .reduce((acc, curr) => acc + (curr.price || 0), 0);
    const manualIncome = manualTransactions
      .filter(t => t.date === today && t.type === 'Ingreso')
      .reduce((acc, curr) => acc + curr.amount, 0);
    return appsIncome + manualIncome;
  }, [myTodayApps, manualTransactions, today]);

  const proximasCitas = React.useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toTimeString().slice(0, 5);
    return appointments
      .filter(a =>
        (!a.professionalId || a.professionalId === loggedPro.id) &&
        a.status !== 'Cancelado' && a.status !== 'Finalizado' && a.status !== 'Bloqueado' &&
        (a.date > todayStr || (a.date === todayStr && a.time >= nowTime))
      )
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .slice(0, 3);
  }, [appointments, loggedPro.id]);

  const formatAppDate = (dateStr: string): string => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    if (dateStr === today) return 'HOY';
    if (dateStr === tomorrow) return 'MAÑANA';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' }).toUpperCase();
  };

  const getStatusStyles = (status: Appointment['status'], appColor?: string) => {
    const baseColor = appColor || 'bg-primary';

    const colorMap: Record<string, { bg: string, border: string, text: string, icon: string }> = {
      'bg-primary': { bg: 'bg-primary/10', border: 'border-primary/20', text: 'text-primary', icon: 'check_circle' },
      'bg-emerald-500': { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-700', icon: 'check_circle' },
      'bg-indigo-500': { bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-700', icon: 'psychology' },
      'bg-rose-500': { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-700', icon: 'cancel' },
      'bg-amber-500': { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-700', icon: 'warning' },
      'bg-slate-700': { bg: 'bg-slate-700/10', border: 'border-slate-700/20', text: 'text-slate-700', icon: 'block' },
    };

    const baseStyles = colorMap[baseColor] || colorMap['bg-primary'];

    const statusIcons: any = {
      'Confirmado': 'check_circle',
      'Llegado': 'hail',
      'En Sesión': 'psychology',
      'Finalizado': 'task_alt',
      'Cancelado': 'cancel',
      'Bloqueado': 'block'
    };

    return {
      bg: baseStyles.bg,
      border: baseStyles.border,
      text: baseStyles.text,
      icon: statusIcons[status] || baseStyles.icon
    };
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full relative" style={{background:'#F5F8FC', fontFamily:"'Inter','Manrope',sans-serif"}}>

      {/* Modal suscripción pausada */}
      {isPaused && (
        <div className="absolute inset-0 z-[200] bg-[#0B1736]/70 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-3xl p-7 shadow-2xl text-center">
            <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <span className="material-icons-round text-4xl">lock_person</span>
            </div>
            <h2 className="text-xl font-bold text-[#0B1736] tracking-tight mb-2">Agenda Suspendida</h2>
            <p className="text-[#7A859F] text-sm mb-6 leading-relaxed">Regulariza tu suscripción para recibir pacientes.</p>
            <a href={mpLinkWithBack} className="w-full py-3.5 bg-[#00B3A4] text-white rounded-2xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-[#00B3A4]/30 flex items-center justify-center gap-2 transition-all hover:bg-[#00a093]">
              Pagar Suscripción <span className="material-icons-round text-base">payment</span>
            </a>
          </div>
        </div>
      )}

      {/* Bienvenida — solo primer ingreso */}
      {showWelcome && (
        <div className="absolute inset-0 z-[210] bg-[#0B1736]/70 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-md rounded-3xl p-7 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{background:'#00B3A415'}}>
                <span className="material-icons-round" style={{color:'#00B3A4'}}>waving_hand</span>
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight" style={{color:'#0B1736'}}>¡Bienvenido/a a Agenda Maslife! 🧡</h2>
                <p className="text-xs" style={{color:'#7A859F'}}>Tu agenda profesional en 4 pasos</p>
              </div>
            </div>
            <div className="space-y-3 mb-5">
              {[
                { t: 'Completa tu perfil', d: 'Foto, especialidad y ciudad para que te encuentren.' },
                { t: 'Agrega tus servicios', d: 'Nombre, precio y duración de cada atención.' },
                { t: 'Comparte tu link', d: 'Envía tu enlace de reservas por WhatsApp o redes.' },
                { t: 'Recibe reservas', d: 'Tus pacientes agendan y pagan online, 24/7.' },
              ].map((s, idx) => (
                <div key={s.t} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs text-white" style={{background:'#00B3A4'}}>{idx + 1}</div>
                  <div>
                    <p className="font-bold text-sm" style={{color:'#0B1736'}}>{s.t}</p>
                    <p className="text-xs leading-relaxed" style={{color:'#7A859F'}}>{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 mb-5 text-xs text-teal-700 flex items-center gap-2">
              <span className="material-icons-round text-sm">card_giftcard</span>
              Tienes <b>30 días gratis</b> para probar todo, sin permanencia.
            </div>
            <button onClick={dismissWelcome}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-sm uppercase tracking-widest transition-all hover:brightness-110"
              style={{background:'#00B3A4'}}>
              Empezar
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 min-h-0 overflow-y-auto px-4 pt-5 pb-24 md:px-10 md:pt-10 md:pb-10 custom-scrollbar">
        <div className="max-w-6xl mx-auto">

          {/* Banner de prueba gratis. El CTA de pago (Suscribirme) aparece solo en los
              últimos 7 días o al vencer; antes es solo un aviso amistoso, sin presión. */}
          {isTrial && (() => {
            const ended = !(trialDaysLeft !== null && trialDaysLeft > 0);   // vencida o sin fecha
            const showSub = ended || (trialDaysLeft ?? 99) <= 7;            // botón solo cerca del final
            const urgent = (trialDaysLeft ?? 99) <= 5;                      // tono ámbar
            return (
            <div className={`mb-5 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between ${urgent ? 'bg-amber-50 border border-amber-200' : 'bg-teal-50 border border-teal-200'}`}>
              <div className="flex items-center gap-3">
                <span className={`material-icons-round ${urgent ? 'text-amber-500' : 'text-teal-500'}`}>
                  {urgent ? 'schedule' : 'card_giftcard'}
                </span>
                <div>
                  <p className="font-bold text-sm" style={{color:'#0B1736'}}>
                    {!ended
                      ? `Te quedan ${trialDaysLeft} día${trialDaysLeft === 1 ? '' : 's'} de prueba gratis`
                      : 'Tu prueba gratis terminó'}
                  </p>
                  <p className="text-xs" style={{color:'#7A859F'}}>
                    {ended
                      ? 'Suscríbete para seguir recibiendo pacientes.'
                      : showSub
                        ? 'Suscríbete para no perder tu agenda — sin permanencia.'
                        : 'Disfruta todas las funciones, sin costo.'}
                  </p>
                </div>
              </div>
              {showSub && (
                <a href={mpLinkWithBack}
                  className="shrink-0 px-5 py-2.5 rounded-xl text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:brightness-110"
                  style={{background:'#00B3A4'}}>
                  <span className="material-icons-round text-sm">workspace_premium</span> Suscribirme
                </a>
              )}
            </div>
            );
          })()}

          {/* ── Header ── */}
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {loggedPro.specialty && (
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] mb-1" style={{color:'#00B3A4'}}>
                  {loggedPro.specialty}
                </p>
              )}
              <h1 className="text-[1.6rem] font-bold leading-tight" style={{color:'#0B1736'}}>
                Hola, {firstName} 👋
              </h1>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="material-icons-round text-xs" style={{color:'#7A859F'}}>calendar_today</span>
                <p className="text-xs font-medium capitalize" style={{color:'#7A859F'}}>{dayCapitalized}, {dateLabel}</p>
              </div>
            </div>

            {/* Reloj flotante glassmorphism */}
            <div className="text-center shrink-0 min-w-[78px] px-3.5 py-2.5 rounded-2xl"
              style={{
                background:'rgba(255,255,255,0.85)',
                backdropFilter:'blur(16px)',
                WebkitBackdropFilter:'blur(16px)',
                border:'1px solid rgba(255,255,255,0.9)',
                boxShadow:'0 10px 30px rgba(15,94,247,0.10), 0 4px 12px rgba(0,0,0,0.05)'
              }}>
              <p className="text-[22px] font-bold tabular-nums leading-none tracking-tight" style={{color:'#0B1736'}}>{timeHM}</p>
              <p className="text-[10px] font-semibold tabular-nums mt-0.5 tracking-widest" style={{color:'#00B3A4'}}>:{timeSec}</p>
            </div>
          </div>

          {/* ── Invita y Gana ── */}
          <div
            onClick={() => navigate('/pro/referral')}
            className="mb-3 rounded-2xl p-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-all group"
            style={{
              background:'white',
              border:'1px solid rgba(229,231,235,0.8)',
              boxShadow:'0 4px 12px rgba(0,0,0,0.05)'
            }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow='0 10px 30px rgba(0,179,164,0.12)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.05)')}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
              style={{background:'linear-gradient(135deg,#00B3A4,#0F5EF7)',boxShadow:'0 4px 12px rgba(0,179,164,0.30)'}}>
              <span className="material-icons-round text-white text-lg">card_giftcard</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-widest" style={{color:'#7A859F'}}>Programa de Referidos</p>
              <p className="text-sm font-bold leading-tight" style={{color:'#0B1736'}}>Invita y Gana</p>
            </div>
            <span className="material-icons-round text-lg group-hover:translate-x-0.5 transition-transform" style={{color:'#7A859F'}}>chevron_right</span>
          </div>

          {/* ── Link de Reservas ── */}
          <div className={`mb-3 rounded-2xl p-3.5 flex items-center gap-3 overflow-hidden transition-all ${
            profileComplete ? '' : 'bg-amber-50 border border-amber-200'
          }`}
            style={profileComplete ? {
              background:'white',
              border:'1px solid rgba(229,231,235,0.8)',
              boxShadow:'0 4px 12px rgba(0,0,0,0.05)'
            } : {}}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${profileComplete ? '' : 'bg-amber-100'}`}
              style={profileComplete ? {background:'rgba(15,94,247,0.10)'} : {}}>
              <span className="material-icons-round text-lg" style={profileComplete ? {color:'#0F5EF7'} : {color:'#d97706'}}>
                {profileComplete ? 'link' : 'warning'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.2em]" style={{color:'#7A859F'}}>Link de Reservas</p>
                {profileComplete
                  ? <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest" style={{background:'rgba(34,197,94,0.12)',color:'#16a34a'}}>✓ Activo</span>
                  : <span className="px-1.5 py-0.5 bg-amber-200 text-amber-800 text-[9px] font-bold rounded-md uppercase">Incompleto</span>}
              </div>
              <p className="text-xs font-semibold truncate" style={{color:'#0F5EF7'}}>{bookingLink}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => window.open(bookingLink, '_blank')} className="hidden md:flex px-3 py-1.5 rounded-xl text-[10px] font-semibold uppercase tracking-widest hover:opacity-80 transition-all items-center gap-1" style={{background:'#F5F8FC',color:'#7A859F'}}>
                <span className="material-icons-round text-sm">visibility</span>Ver
              </button>
              <button onClick={handleCopyBookingLink} className="px-3 py-1.5 rounded-xl text-[10px] font-semibold uppercase tracking-widest transition-all flex items-center gap-1"
                style={linkCopied ? {background:'#22C55E',color:'white'} : {background:'#0F5EF7',color:'white'}}>
                <span className="material-icons-round text-sm">{linkCopied ? 'check_circle' : 'content_copy'}</span>
                <span className="hidden sm:inline">{linkCopied ? '¡Copiado!' : 'Copiar'}</span>
              </button>
              <button onClick={handleShareBookingLink} className="w-8 h-8 rounded-xl bg-[#25D366] text-white hover:bg-[#1ebe5d] transition-all flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.767 5.767 0 1.267.408 2.438 1.103 3.394l-.717 2.63 2.7-.708c.846.541 1.847.851 2.923.851 3.181 0 5.767-2.586 5.767-5.767 0-3.181-2.586-5.767-5.767-5.767zm3.344 8.205c-.145.409-.838.74-1.164.786-.324.045-.72.079-2.315-.572-1.911-.781-3.142-2.723-3.238-2.85-.095-.126-.777-.963-.777-1.838s.454-1.306.616-1.467c.163-.162.355-.202.474-.202s.237.001.341.006c.108.005.253-.041.396.304.145.352.497 1.21.541 1.298.045.089.074.192.015.309-.059.117-.089.192-.178.297-.089.105-.187.234-.267.314s-.17.169-.074.335c.095.166.424.699.91 1.132.626.557 1.152.73 1.316.812.163.081.258.067.354-.044.095-.112.408-.48.517-.643.11-.163.22-.136.371-.081s.956.45 1.12.532c.164.081.274.121.314.192s.041.527-.104.935z"/><path d="M19.057 4.298c-1.883-1.884-4.386-2.922-7.051-2.922-5.485 0-9.946 4.461-9.946 9.946 0 1.753.458 3.465 1.328 4.972l-1.41 5.148 5.268-1.381c1.458.794 3.097 1.213 4.76 1.213h.004c5.484 0 9.946-4.461 9.946-9.946 0-2.657-1.034-5.164-2.919-7.049l-.04-.04zm-7.051 15.352c-1.487 0-2.945-.399-4.216-1.155l-.302-.18-3.132.821.835-3.053-.198-.314c-.832-1.321-1.272-2.857-1.272-4.43 0-4.542 3.696-8.237 8.241-8.237 2.201 0 4.271.857 5.827 2.414s2.414 3.626 2.414 5.827c.001 4.542-3.695 8.237-8.238 8.237l-.059-.03z"/></svg>
              </button>
            </div>
          </div>

          {/* ── Stats Grid ── */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">

            {/* Pacientes Hoy */}
            <div className="rounded-2xl p-4 flex flex-col justify-between transition-all hover:-translate-y-0.5 group cursor-default"
              style={{background:'white',border:'1px solid rgba(229,231,235,0.8)',boxShadow:'0 4px 12px rgba(0,0,0,0.05)'}}
              onMouseEnter={e => (e.currentTarget.style.boxShadow='0 10px 30px rgba(15,94,247,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.05)')}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] font-semibold uppercase tracking-[0.2em]" style={{color:'#7A859F'}}>Pacientes Hoy</span>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors group-hover:bg-[rgba(0,179,164,0.10)]" style={{background:'#F5F8FC'}}>
                  <span className="material-icons-round text-lg transition-colors group-hover:text-[#00B3A4]" style={{color:'#7A859F'}}>groups</span>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tight" style={{color:'#0B1736'}}>{myTodayApps.length}</span>
                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-lg" style={{background:'rgba(34,197,94,0.12)',color:'#16a34a'}}>En cola</span>
              </div>
            </div>

            {/* Ingresos Hoy */}
            <div className="rounded-2xl p-4 flex flex-col justify-between transition-all hover:-translate-y-0.5 group cursor-default"
              style={{background:'white',border:'1px solid rgba(229,231,235,0.8)',boxShadow:'0 4px 12px rgba(0,0,0,0.05)'}}
              onMouseEnter={e => (e.currentTarget.style.boxShadow='0 10px 30px rgba(15,94,247,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.05)')}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] font-semibold uppercase tracking-[0.2em]" style={{color:'#7A859F'}}>Ingresos Hoy</span>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors group-hover:bg-[rgba(15,94,247,0.10)]" style={{background:'#F5F8FC'}}>
                  <span className="material-icons-round text-lg transition-colors group-hover:text-[#0F5EF7]" style={{color:'#7A859F'}}>payments</span>
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-bold tracking-tight" style={{color:'#0B1736'}}>${totalIncomeToday.toLocaleString('es-CL')}</h3>
                <p className="text-[9px] font-medium uppercase tracking-widest mt-1" style={{color:'#7A859F'}}>Total parcial</p>
              </div>
            </div>

            {/* Agenda MasLife */}
            <div
              className="rounded-2xl p-4 text-white cursor-pointer group relative overflow-hidden transition-all hover:-translate-y-0.5 col-span-2 md:col-span-1"
              style={{
                background:'linear-gradient(135deg,#00B3A4 0%,#0F5EF7 100%)',
                boxShadow:'0 10px 30px rgba(0,179,164,0.30)'
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow='0 16px 40px rgba(0,179,164,0.40)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow='0 10px 30px rgba(0,179,164,0.30)')}
              onClick={() => navigate('/pro/settings')}
            >
              <div className="relative z-10 flex items-center justify-between h-full">
                <div>
                  <span className="block text-[9px] font-medium uppercase tracking-[0.25em] mb-1" style={{color:'rgba(255,255,255,0.70)'}}>Sistema de Agenda</span>
                  <h3 className="text-lg font-bold tracking-tight uppercase mb-2">Agenda Maslife</h3>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{background:'rgba(255,255,255,0.20)',border:'1px solid rgba(255,255,255,0.25)'}}>
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:'#22C55E'}}></div>
                    <span className="text-[9px] font-semibold uppercase tracking-[0.2em]">ACTIVO</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl transition-all group-hover:bg-white shrink-0" style={{background:'rgba(255,255,255,0.20)',border:'1px solid rgba(255,255,255,0.25)'}}>
                  <span className="material-icons-round text-xl group-hover:text-[#00B3A4] transition-colors">settings</span>
                </div>
              </div>
              {/* Orbe decorativo */}
              <div className="absolute -bottom-8 -right-8 w-28 h-28 rounded-full" style={{background:'rgba(255,255,255,0.10)',filter:'blur(16px)'}} />
            </div>
          </div>

          {/* ── Próximas Citas ── */}
          <div className="rounded-2xl overflow-hidden mb-3"
            style={{background:'white',border:'1px solid rgba(229,231,235,0.8)',boxShadow:'0 4px 12px rgba(0,0,0,0.05)'}}>
            <div className="px-4 py-3 flex items-center justify-between" style={{borderBottom:'1px solid rgba(229,231,235,0.6)'}}>
              <h2 className="font-bold text-sm flex items-center gap-2" style={{color:'#0B1736'}}>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{background:'#22C55E'}}></span>
                Próximas Citas
              </h2>
              <button onClick={() => navigate('/pro/agenda', { state: { date: today } })} className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest hover:opacity-70 transition-opacity" style={{color:'#0F5EF7'}}>
                Ver agenda <span className="material-icons-round text-sm">arrow_forward</span>
              </button>
            </div>
            <div className="divide-y" style={{borderColor:'rgba(229,231,235,0.4)'}}>
              {proximasCitas.length > 0 ? proximasCitas.map((p, i) => {
                const styles = getStatusStyles(p.status, p.color);
                return (
                  <div key={i} className="px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer group hover:bg-[#F5F8FC]"
                    onClick={() => p.patientId ? navigate(`/pro/record/${p.patientId}`) : navigate('/pro/agenda')}>
                    <div className="w-9 h-9 rounded-xl text-white flex items-center justify-center font-bold text-sm shrink-0" style={{background:'#0B1736'}}>{p.patientName.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{color:'#0B1736'}}>{p.patientName}</p>
                      <p className="text-[10px] font-medium" style={{color:'#7A859F'}}>{formatAppDate(p.date)} · {p.time} · {p.type}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide border shrink-0 ${styles.bg} ${styles.text} ${styles.border}`}>{p.status}</span>
                    <div className="w-8 h-8 text-white rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
                      style={{background:'#00B3A4',boxShadow:'0 4px 8px rgba(0,179,164,0.30)'}}>
                      <span className="material-icons-round text-base">play_arrow</span>
                    </div>
                  </div>
                );
              }) : (
                <div className="px-4 py-8 text-center">
                  <span className="material-icons-round text-4xl block mb-2" style={{color:'#e2e8f0'}}>event_available</span>
                  <p className="text-[10px] font-medium uppercase tracking-widest" style={{color:'#7A859F'}}>No hay citas próximas agendadas</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Citas de Hoy ── */}
          <div className="rounded-2xl overflow-hidden mb-4"
            style={{background:'white',border:'1px solid rgba(229,231,235,0.8)',boxShadow:'0 4px 12px rgba(0,0,0,0.05)'}}>
            <div className="px-4 py-3 flex items-center justify-between" style={{borderBottom:'1px solid rgba(229,231,235,0.6)'}}>
              <h2 className="font-bold text-sm" style={{color:'#0B1736'}}>Citas de Hoy</h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-lg" style={{background:'rgba(0,179,164,0.10)',color:'#00B3A4'}}>{myTodayApps.length}</span>
            </div>
            <div className="divide-y" style={{borderColor:'rgba(229,231,235,0.4)'}}>
              {myTodayApps.length > 0 ? myTodayApps.map((p, i) => {
                const styles = getStatusStyles(p.status, p.color);
                return (
                  <div key={i} className="px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer group hover:bg-[#F5F8FC]"
                    onClick={() => p.patientId ? navigate(`/pro/record/${p.patientId}`) : alert('Cita sin paciente asociado')}>
                    <div className="w-9 h-9 rounded-xl text-white flex items-center justify-center font-bold text-sm shrink-0" style={{background:'#0B1736'}}>{p.patientName.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{color:'#0B1736'}}>{p.patientName}</p>
                      <p className="text-[10px] font-medium" style={{color:'#7A859F'}}>{p.time} · {p.type}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide border shrink-0 ${styles.bg} ${styles.text} ${styles.border}`}>{p.status}</span>
                    <div className="w-8 h-8 text-white rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
                      style={{background:'#00B3A4',boxShadow:'0 4px 8px rgba(0,179,164,0.30)'}}>
                      <span className="material-icons-round text-base">play_arrow</span>
                    </div>
                  </div>
                );
              }) : (
                <div className="px-4 py-8 text-center">
                  <span className="material-icons-round text-4xl block mb-2" style={{color:'#e2e8f0'}}>event_busy</span>
                  <p className="text-[10px] font-medium uppercase tracking-widest" style={{color:'#7A859F'}}>Sin citas para hoy</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default ProfessionalDashboard;
