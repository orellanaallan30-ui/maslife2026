import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useClinic } from '../ClinicContext';
import { supabase } from '../supabaseClient';
import { trackProRegistration, trackSubscriptionClick } from '../analytics';
import { resizeImageDataUrl } from '../lib/imageResize';

const CHILEAN_CITIES = [
  'Antofagasta','Arica','Calama','Castro','Chillán','Concepción',
  'Copiapó','Coquimbo','Coronel','Coyhaique','Curicó','Illapel',
  'Iquique','La Florida','La Serena','Las Condes','Linares','Los Ángeles',
  'Los Vilos','Maipú','Osorno','Ovalle','Padre Las Casas','Peñalolén',
  'Providencia','Pudahuel','Puerto Montt','Puente Alto','Punta Arenas',
  'Quilpué','Rancagua','San Antonio','San Bernardo','San Fernando',
  'Santiago','Talca','Talcahuano','Temuco','Valdivia','Valparaíso',
  'Villa Alemana','Viña del Mar','Ñuñoa','Otra ciudad'
].sort();


// Registro en 2 pasos: no depende de un código manual (escalable).
const STEPS = [
  { label: 'Perfil',   icon: 'person' },
  { label: 'Servicios',icon: 'medical_services' },
];

function mapDBtoPro(d: Record<string, any>) {
  return {
    id: d.id, slug: d.slug || '', name: d.name || '', email: d.email || '',
    specialty: d.specialty || '', city: d.city || '', bio: d.bio || '',
    avatar: d.avatar || '', workingHours: d.working_hours || { start: '09:00', end: '18:00' },
    modalities: d.modalities || { online: true, inPerson: true, home: false },
    services: d.services || [], isPublic: d.is_public ?? false,
    isVerified: d.is_verified ?? false, isApproved: d.is_approved ?? false,
    isSubscribed: d.is_subscribed ?? false, subscriptionStatus: d.subscription_status || 'trial',
    trialEndDate: d.trial_end_date || undefined,
    needsPasswordReset: d.needs_password_reset ?? false, paymentEnabled: d.payment_enabled ?? false,
    bookingPaymentLink: d.booking_payment_link || undefined,
    subscriptionLink: d.subscription_link || '', createdAt: d.created_at || new Date().toISOString(),
    rut: d.rut || undefined, schedule: d.schedule || undefined,
    sisCode: d.sis_code || undefined,
  };
}

const ProfessionalRegistration: React.FC = () => {
  const navigate = useNavigate();
  const { setLoggedPro } = useClinic();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registrationDone, setRegistrationDone] = useState(false); // sesión activa → pantalla de pago
  const [emailSent, setEmailSent] = useState<string | null>(null);  // confirmación por email → "revisa tu correo"
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirm: '',
    specialty: '', city: 'Ovalle', customCity: '',
    sisCode: '', referralCode: searchParams.get('ref') ?? '',
    modalities: { online: true, inPerson: true, home: false },
    serviceName: 'Consulta Inicial', servicePrice: '',
    avatar: null as string | null,
  });

  const inp = `w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-3.5 px-4
    font-medium text-slate-800 text-sm focus:bg-white focus:border-teal-500
    focus:ring-4 focus:ring-teal-500/10 transition-all outline-none placeholder:text-slate-400`;

  const pwChecks = {
    length: form.password.length >= 8,
    upper:  /[A-Z]/.test(form.password),
    number: /[0-9]/.test(form.password),
    match:  form.password === form.confirm && form.confirm !== '',
  };

  const handleProfileNext = () => {
    if (!form.name.trim())  { setError('Ingresa tu nombre.'); return; }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setError('Email inválido.'); return; }
    if (!pwChecks.length)   { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (!pwChecks.upper)    { setError('La contraseña debe incluir al menos una mayúscula.'); return; }
    if (!pwChecks.number)   { setError('La contraseña debe incluir al menos un número.'); return; }
    if (!pwChecks.match)    { setError('Las contraseñas no coinciden.'); return; }
    if (!form.specialty.trim()) { setError('Ingresa tu especialidad.'); return; }
    if (form.city === 'Otra ciudad' && !form.customCity.trim()) { setError('Ingresa el nombre de tu ciudad.'); return; }
    setError(''); setStep(2);
  };

  // Valida un código de referido (opcional). Nunca bloquea el registro:
  // si es inválido o hay error de red, se ignora y se continúa sin referido.
  const resolveReferrer = async (code: string): Promise<string | null> => {
    const trimmed = code.trim();
    if (!trimmed) return null;
    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate-code', code: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.valid && data.referrerId) return data.referrerId as string;
    } catch { /* referido opcional — se ignora si falla */ }
    return null;
  };

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedTerms) { setError('Debes aceptar los Términos y Condiciones para continuar.'); return; }
    setLoading(true); setError('');
    const finalCity = form.city === 'Otra ciudad' ? form.customCity.trim() : form.city;
    const emailLower = form.email.trim().toLowerCase();

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setLoading(false);
      setError('La operación tardó demasiado. Verifica tu conexión e intenta de nuevo.');
    }, 25000);

    try {
      const referrerId = await resolveReferrer(form.referralCode);
      if (timedOut) return;

      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: emailLower,
        password: form.password,
        options: {
          data: { name: form.name.trim(), specialty: form.specialty.trim() },
          emailRedirectTo: 'https://clinicamaslife.cl/pro/login',
        },
      });
      if (timedOut) return;
      if (authErr) {
        setError(authErr.message.includes('already registered') || authErr.message.includes('already been registered')
          ? 'Este email ya está registrado. Intenta iniciar sesión.'
          : authErr.message);
        return;
      }

      // Con confirmación por email activada, signUp NO devuelve sesión: usamos el
      // user.id que sí entrega, y la fila se inserta vía la política pro_insert_anon.
      let realUid = authData?.session?.user?.id ?? authData?.user?.id;
      if (!realUid) {
        setError('No se pudo crear la cuenta. Intenta de nuevo.');
        return;
      }
      // Auto-confirmamos la cuenta y entramos de inmediato — NO depende del SMTP de
      // Supabase (que requiere el dashboard). El correo de bienvenida se envía por
      // nuestro Resend, y la verificación real de profesional la hace el admin (SIS + RUT).
      let hasSession = !!authData?.session;
      if (!hasSession && authData?.user) {
        try {
          await supabase.rpc('auto_confirm_new_user', { user_id: authData.user.id });
          const { data: signInData } = await supabase.auth.signInWithPassword({ email: emailLower, password: form.password });
          if (signInData?.session) {
            hasSession = true;
            // CLAVE: usar el id REAL de la sesión. Si el correo ya tenía una cuenta,
            // signUp devuelve un id ofuscado; el perfil DEBE llevar el id del login,
            // o el profesional nunca encontrará su perfil al iniciar sesión.
            realUid = signInData.session.user.id;
          }
        } catch { /* si falla, la fila igual se inserta vía pro_insert_anon */ }
        if (timedOut) return;
      }

      // Generar código de referido único (4 letras del nombre + 4 del UUID)
      const namePrefix = form.name.trim()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padEnd(4, 'X');
      const referralCode = namePrefix + realUid.replace(/-/g, '').slice(0, 4).toUpperCase();

      // Avatar: sin sesión no se puede subir a Storage (requiere auth), así que se
      // guarda como base64 en la fila. Es una sola imagen por registro.
      const avatarValue = form.avatar?.startsWith('data:') ? form.avatar : '';

      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 30);
      const services = [{ id: 's1', name: form.serviceName,
        price: parseInt(form.servicePrice) || 25000, duration: 45, description: '' }];
      const slug = form.name.trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-')
        + '-' + realUid.slice(0, 6);

      const { data: existingPro } = await supabase
        .from('professionals').select('*').eq('id', realUid).maybeSingle();
      if (timedOut) return;
      if (existingPro) {
        if (hasSession) { setLoggedPro(mapDBtoPro(existingPro) as any); navigate('/pro/dashboard'); return; }
        clearTimeout(timeoutId);
        setEmailSent(emailLower);
        return;
      }

      const { error: saveErr } = await supabase.from('professionals').insert({
        id: realUid, slug, name: form.name.trim(),
        email: emailLower,
        specialty: form.specialty.trim(), city: finalCity,
        bio: '', avatar: avatarValue,
        working_hours: { start: '09:00', end: '18:00' },
        modalities: form.modalities, services,
        // Cuenta usable tras confirmar el correo; la insignia "Verificado" la otorga
        // el admin tras revisar el código SIS + RUT (is_verified arranca en false).
        is_public: true, is_verified: false, is_approved: true,
        is_subscribed: false, subscription_status: 'trial',
        trial_end_date: trialEnd.toISOString(),
        needs_password_reset: false, payment_enabled: false,
        created_at: new Date().toISOString(),
        terms_accepted_at: new Date().toISOString(),
        referral_code: referralCode,
        referred_by: referrerId || null,
        sis_code: form.sisCode.trim() || null,
      });
      if (timedOut) return;

      if (saveErr) {
        if (saveErr.code === '23505') {
          const { data: proData } = await supabase.from('professionals').select('*').eq('id', realUid).maybeSingle();
          if (proData && hasSession) { setLoggedPro(mapDBtoPro(proData) as any); navigate('/pro/dashboard'); return; }
          if (proData) { clearTimeout(timeoutId); setEmailSent(emailLower); return; }
          setError('Este email ya tiene un perfil. Intenta iniciar sesión.');
        } else {
          console.error('[registro:guardar perfil]', saveErr?.message || saveErr);
          setError('No pudimos completar tu registro. Revisa tu conexión e intenta de nuevo.');
        }
        return;
      }

      // Activar recompensas del referido (fire-and-forget)
      if (referrerId) {
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reward-referral', referrer_id: referrerId, referred_id: realUid }),
        }).catch(() => {});
      }

      clearTimeout(timeoutId);
      trackProRegistration(); // conversión: profesional registrado (campaña de suscripción)

      // Correo de bienvenida propio (Resend) — confirma que su correo es válido y
      // le da la bienvenida. Fire-and-forget, no bloquea el ingreso.
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pro-welcome', to: emailLower, professionalName: form.name.trim() }),
      }).catch(() => {});

      // Fallback muy raro: si el auto-confirm + login fallaron, guiar al login.
      if (!hasSession) {
        setEmailSent(emailLower);
        return;
      }

      // Con sesión activa (confirmación desactivada en Supabase): entrar directo.
      setLoggedPro({
        id: realUid, slug, name: form.name.trim(),
        email: emailLower,
        specialty: form.specialty.trim(), city: finalCity,
        bio: '', avatar: avatarValue,
        workingHours: { start: '09:00', end: '18:00' },
        modalities: form.modalities, services,
        isPublic: true, isVerified: false, isApproved: true,
        isSubscribed: false, subscriptionStatus: 'trial',
        trialEndDate: trialEnd.toISOString(),
        needsPasswordReset: false, paymentEnabled: false,
        subscriptionLink: '', createdAt: new Date().toISOString(),
        referralCode,
        referralCreditClp: 0,
      } as any);
      setRegistrationDone(true);

    } catch (err: any) {
      console.error('[registro]', err?.message || err);
      if (!timedOut) setError('No pudimos completar tu registro. Revisa tu conexión e intenta de nuevo.');
    } finally {
      clearTimeout(timeoutId);
      if (!timedOut) setLoading(false);
    }
  };

  const tog = (k: keyof typeof form.modalities) =>
    setForm(f => ({...f, modalities: {...f.modalities, [k]: !f.modalities[k]}}));

  const MP_SUBSCRIPTION_LINK = import.meta.env.VITE_GLOBAL_SUBSCRIPTION_LINK ||
    'https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=e7c9a9a7adc24dee8c1f7fb78bdbdc67';

  // ── Pantalla "revisa tu correo" (confirmación por email) ──
  if (emailSent) {
    return (
      <div className="flex-1 overflow-y-auto w-full bg-slate-50">
        <div className="flex flex-col items-center justify-center min-h-full py-10 px-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center space-y-5">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-teal-100 flex items-center justify-center">
                <span className="material-icons-round text-teal-500" style={{fontSize:'3rem'}}>mark_email_read</span>
              </div>
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">¡Revisa tu correo!</h3>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                Enviamos un enlace de confirmación a<br/>
                <strong className="text-slate-800">{emailSent}</strong>
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left">
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong className="text-slate-800">1.</strong> Abre el correo de Agenda Maslife.<br/>
                <strong className="text-slate-800">2.</strong> Haz clic en <strong>"Confirmar cuenta"</strong>.<br/>
                <strong className="text-slate-800">3.</strong> Inicia sesión y completa tu perfil.
              </p>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              ¿No lo ves? Revisa tu carpeta de spam o correo no deseado. El enlace puede tardar unos minutos.
            </p>
            <button
              onClick={() => navigate('/pro/login')}
              className="w-full py-4 bg-teal-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-teal-600 transition-all shadow-lg shadow-teal-500/25 flex items-center justify-center gap-2"
            >
              <span className="material-icons-round text-base">login</span>
              Ir a iniciar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto w-full bg-slate-50">
    <div className="flex flex-col items-center justify-start min-h-full py-6 lg:py-12 px-4 pb-10">
      <div className="w-full max-w-xl relative z-10">

        {/* Logo */}
        <div className="text-center mb-5 lg:mb-8">
          <div className="inline-flex items-center gap-3 cursor-pointer mb-2" onClick={() => navigate('/')}>
            <div className="bg-teal-500 w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center shadow-xl shadow-teal-500/30">
              <span className="material-icons-round text-white text-xl lg:text-2xl">medical_services</span>
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black text-teal-600 uppercase tracking-widest">PLATAFORMA</p>
              <p className="text-lg lg:text-xl font-black text-slate-900">Agenda Maslife 🧡</p>
            </div>
          </div>
          <h1 className="text-xl lg:text-2xl font-black text-slate-900">Registro de Especialista</h1>
          <p className="text-slate-500 text-xs mt-1">clinicamaslife.cl</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-0 mb-5 lg:mb-8">
          {STEPS.map((s,i) => {
            const n=i+1, active=step===n, done=step>n;
            return (
              <React.Fragment key={s.label}>
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-9 h-9 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center transition-all
                    ${done?'bg-emerald-500 text-white':active?'bg-teal-500 text-white scale-110':'bg-white text-slate-400 border-2 border-slate-200'}`}>
                    {done?<span className="material-icons-round text-sm">check</span>:<span className="material-icons-round text-sm">{s.icon}</span>}
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-widest
                    ${active?'text-teal-600':done?'text-emerald-500':'text-slate-400'}`}>{s.label}</span>
                </div>
                {i<STEPS.length-1&&<div className={`h-0.5 w-12 lg:w-16 mx-1 mb-4 transition-all ${step>i+1?'bg-emerald-400':'bg-slate-200'}`}/>}
              </React.Fragment>
            );
          })}
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="h-1.5 bg-slate-100">
            <div className="h-full bg-teal-500 transition-all duration-700 rounded-full" style={{width:`${(step/2)*100}%`}}/>
          </div>
          <div className="p-5 sm:p-8">

            {/* PASO 1 — Perfil */}
            {step===1&&(
              <div className="space-y-4">
                <h3 className="text-lg font-black text-slate-900">Tus datos profesionales</h3>
                {searchParams.get('ref') && (
                  <div className="bg-teal-50 border-2 border-teal-300 rounded-2xl p-4 flex items-start gap-3">
                    <span className="material-icons-round text-teal-500 text-2xl shrink-0">card_giftcard</span>
                    <div>
                      <p className="font-black text-teal-800 text-sm">¡Un colega te invitó a Clínica Mas Life!</p>
                      <p className="text-teal-700 text-xs mt-1 leading-relaxed">Tu código de referido ya está aplicado. Completa tu registro para unirte.</p>
                    </div>
                  </div>
                )}
                {/* Avatar */}
                <div className="flex items-center gap-4 mb-2">
                  <div className="relative shrink-0">
                    <div className="w-20 h-20 rounded-2xl bg-slate-100 overflow-hidden border-2 border-white shadow-lg flex items-center justify-center">
                      {form.avatar?<img src={form.avatar} className="w-full h-full object-cover" alt=""/>:<span className="material-icons-round text-4xl text-slate-300">person</span>}
                    </div>
                    <label className="absolute -bottom-1.5 -right-1.5 w-8 h-8 bg-teal-500 text-white rounded-xl flex items-center justify-center cursor-pointer shadow-lg border-2 border-white hover:scale-110 transition-transform">
                      <span className="material-icons-round text-sm">photo_camera</span>
                      <input type="file" onChange={e=>{const f=e.target.files?.[0];if(f){resizeImageDataUrl(f,300,0.85).then(url=>setForm(fm=>({...fm,avatar:url}))).catch(()=>setError('No se pudo procesar la imagen. Prueba con otra.'));}}} className="hidden" accept="image/*"/>
                    </label>
                  </div>
                  <div><p className="font-bold text-slate-700 text-sm">Foto de perfil</p><p className="text-xs text-slate-400">Opcional</p></div>
                </div>
                <div><label htmlFor="reg-name" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Nombre completo *</label>
                  <input id="reg-name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className={inp} placeholder="Ej: María González"/></div>
                <div><label htmlFor="reg-email" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Email *</label>
                  <input id="reg-email" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} className={inp} placeholder="correo@ejemplo.com" autoComplete="username"/></div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div><label htmlFor="reg-password" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Contraseña *</label>
                    <input id="reg-password" type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} className={inp} placeholder="Mín. 8 caracteres" autoComplete="new-password"/></div>
                  <div><label htmlFor="reg-confirm" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Confirmar contraseña *</label>
                    <input id="reg-confirm" type="password" value={form.confirm} onChange={e=>setForm(f=>({...f,confirm:e.target.value}))} className={inp} placeholder="Repite la contraseña" autoComplete="new-password"/></div>
                </div>
                {form.password&&(
                  <div className="grid grid-cols-2 gap-1.5">
                    {[{ok:pwChecks.length,l:'8+ caracteres'},{ok:pwChecks.upper,l:'Mayúscula'},{ok:pwChecks.number,l:'Número'},{ok:pwChecks.match,l:'Coinciden'}].map(c=>(
                      <p key={c.l} className={`text-xs flex items-center gap-1 font-bold ${c.ok?'text-emerald-600':'text-slate-400'}`}>
                        <span className="material-icons-round text-xs">{c.ok?'check_circle':'radio_button_unchecked'}</span>{c.l}
                      </p>
                    ))}
                  </div>
                )}
                <div><label htmlFor="reg-specialty" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Especialidad *</label>
                  <select id="reg-specialty" value={form.specialty} onChange={e=>setForm(f=>({...f,specialty:e.target.value}))} className={inp}>
                    <option value="">— Selecciona tu especialidad —</option>
                    <option value="Kinesiología y Rehabilitación">Kinesiología y Rehabilitación</option>
                    <option value="Nutrición y Dietética">Nutrición y Dietética</option>
                    <option value="Psicología Clínica">Psicología Clínica</option>
                    <option value="Fonoaudiología">Fonoaudiología</option>
                    <option value="Terapia Ocupacional">Terapia Ocupacional</option>
                    <option value="Quiropráctica">Quiropráctica</option>
                    <option value="Podología">Podología</option>
                    <option value="Enfermería a Domicilio">Enfermería a Domicilio</option>
                    <option value="Medicina General">Medicina General</option>
                    <option value="Fisioterapia">Fisioterapia</option>
                    <option value="Otra Especialidad">Otra Especialidad</option>
                  </select></div>
                <div>
                  <label htmlFor="reg-city" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Ciudad *</label>
                  <select id="reg-city" value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))} className={inp}>
                    {CHILEAN_CITIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  {form.city==='Otra ciudad'&&(
                    <input value={form.customCity} onChange={e=>setForm(f=>({...f,customCity:e.target.value}))}
                      className={`${inp} mt-2`} placeholder="Escribe el nombre de tu ciudad"/>
                  )}
                </div>
                {/* Código SIS (opcional) — habilita la insignia de verificado */}
                <div>
                  <label htmlFor="reg-sis-code" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">N° registro Superintendencia de Salud (SIS)</label>
                  <input id="reg-sis-code" value={form.sisCode} onChange={e=>setForm(f=>({...f,sisCode:e.target.value}))} className={inp} placeholder="Opcional — para tu insignia de verificado"/>
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed flex items-start gap-1">
                    <span className="material-icons-round text-xs mt-0.5 text-teal-500">verified</span>
                    El administrador revisa tu SIS + RUT para otorgarte la insignia de <strong className="text-slate-500">Profesional Verificado</strong> que aparece junto a tu foto.
                  </p>
                </div>
                {/* Código promocional / referido (opcional) */}
                <div>
                  <label htmlFor="reg-referral-code" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Código promocional (opcional)</label>
                  <input id="reg-referral-code" value={form.referralCode} onChange={e=>setForm(f=>({...f,referralCode:e.target.value.toUpperCase()}))} className={`${inp} font-mono tracking-widest`} placeholder="Si un colega te invitó, ingrésalo aquí"/>
                  <p className="text-[11px] text-slate-400 mt-1.5">Puedes registrarte sin código. Si tienes uno de referido, ambos reciben beneficios.</p>
                </div>
                {error&&<div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <span className="material-icons-round text-rose-500 text-base shrink-0 mt-0.5">error</span>
                  <p className="text-sm text-rose-700 font-medium">{error}</p></div>}
                <div className="pt-1">
                  <button onClick={handleProfileNext} className="w-full py-3.5 bg-teal-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-teal-600 transition-all shadow-lg shadow-teal-500/25">Siguiente</button>
                </div>
                <p className="text-center text-sm text-slate-500">
                  ¿Ya tienes cuenta? <Link to="/pro/login" className="text-teal-600 font-bold hover:text-teal-800">Inicia sesión</Link>
                </p>
              </div>
            )}

            {/* PASO 2 — Servicios y términos */}
            {step===2 && !registrationDone && (
              <form onSubmit={handleFinish} className="space-y-5">
                <h3 className="text-lg font-black text-slate-900">Modalidades y primer servicio</h3>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Tipo de atención</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[{k:'online',l:'Online',i:'videocam'},{k:'inPerson',l:'Presencial',i:'location_on'},{k:'home',l:'Domicilio',i:'home'}].map(m=>(
                       <button key={m.k} type="button" onClick={()=>tog(m.k as any)}
                        className={`py-3 px-2 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all
                          ${form.modalities[m.k as keyof typeof form.modalities]?'border-teal-500 bg-teal-50 text-teal-700':'border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300'}`}>
                        <span className="material-icons-round text-xl">{m.i}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-center leading-tight">{m.l}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-2xl p-5 border-2 border-slate-100 space-y-4">
                  <h4 className="text-sm font-black text-slate-800">Tu primer servicio</h4>
                  <div><label htmlFor="reg-service-name" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Nombre</label>
                    <input id="reg-service-name" value={form.serviceName} onChange={e=>setForm(f=>({...f,serviceName:e.target.value}))} className={inp} placeholder="Consulta Inicial"/></div>
                  <div><label htmlFor="reg-service-price" className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Precio (CLP)</label>
                    <input id="reg-service-price" type="text" inputMode="numeric" value={form.servicePrice} onChange={e=>setForm(f=>({...f,servicePrice:e.target.value.replace(/\D/g,'')}))} className={inp} placeholder="45000"/></div>
                </div>
                <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex items-start gap-3">
                  <span className="material-icons-round text-teal-500 text-xl shrink-0 mt-0.5">verified</span>
                  <p className="text-sm text-teal-800 font-medium">Tu cuenta se activa <strong>al instante</strong> con <strong>30 días gratis</strong>, sin permanencia. Te enviaremos un correo de bienvenida y entrarás directo a tu panel.</p>
                </div>
                {error&&<div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <span className="material-icons-round text-rose-500 text-base shrink-0 mt-0.5">error</span>
                  <p className="text-sm text-rose-700 font-medium">{error}</p></div>}
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={e => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-teal-500 shrink-0 cursor-pointer"
                  />
                  <span className="text-xs text-slate-600 leading-relaxed">
                    He leído y acepto los{' '}
                    <a href="/terminos" target="_blank" rel="noopener noreferrer" className="text-teal-600 font-black hover:underline">Términos y Condiciones</a>
                    {' '}y la{' '}
                    <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="text-teal-600 font-black hover:underline">Política de Privacidad</a>.
                  </span>
                </label>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={()=>{setStep(1);setError('');}} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Atrás</button>
                  <button type="submit" disabled={loading || !acceptedTerms}
                    className="flex-[2] py-3.5 bg-teal-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-teal-600 transition-all shadow-lg shadow-teal-500/25 disabled:opacity-60 flex items-center justify-center gap-2">
                    {loading?<><span className="material-icons-round text-base animate-spin">sync</span>Creando...</>:<><span className="material-icons-round text-base">how_to_reg</span>Crear mi cuenta</>}
                  </button>
                </div>
              </form>
            )}

            {/* Sesión activa (confirmación desactivada) — Configurar método de pago */}
            {step===2 && registrationDone && (
              <div className="space-y-6 text-center">
                <div className="flex justify-center">
                  <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
                    <span className="material-icons-round text-emerald-500" style={{fontSize:'3rem'}}>check_circle</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">¡Cuenta creada con éxito!</h3>
                  <p className="text-sm text-slate-500 mt-1">Tu período de prueba de 30 días ya comenzó.</p>
                </div>
                <div className="bg-primary rounded-2xl p-5 text-white text-left">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="material-icons-round text-2xl">workspace_premium</span>
                    <div>
                      <p className="font-black text-base">Plan Pro</p>
                      <p className="text-white/80 text-xs">Activa tu suscripción ahora</p>
                    </div>
                  </div>
                  <ul className="space-y-1.5 text-sm text-white/90 mb-4">
                    <li className="flex items-center gap-2"><span className="material-icons-round text-sm">check</span>Agenda online 24/7 para tus pacientes</li>
                    <li className="flex items-center gap-2"><span className="material-icons-round text-sm">check</span>Pagos con MercadoPago integrados</li>
                    <li className="flex items-center gap-2"><span className="material-icons-round text-sm">check</span>Fichas clínicas digitales</li>
                    <li className="flex items-center gap-2"><span className="material-icons-round text-sm">check</span>Primeros 30 días gratis — cancela cuando quieras</li>
                  </ul>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black">$24.990</span>
                    <span className="text-white/70 text-sm">/mes</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <a
                    href={MP_SUBSCRIPTION_LINK}
                    onClick={trackSubscriptionClick}
                    className="w-full py-4 bg-teal-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-teal-600 transition-all shadow-lg shadow-teal-500/25 flex items-center justify-center gap-2"
                  >
                    <span className="material-icons-round text-base">payment</span>
                    Configurar método de pago
                  </a>
                  <button
                    type="button"
                    onClick={() => navigate('/pro/dashboard')}
                    className="w-full py-3 text-slate-500 text-xs font-bold hover:text-slate-700 transition-colors"
                  >
                    Ahora no — continuar con período de prueba
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default ProfessionalRegistration;
