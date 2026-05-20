import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useClinic } from '../ClinicContext';
import { supabase } from '../supabaseClient';

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


const STEPS = [
  { label: 'Código',    icon: 'shield' },
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
    needsPasswordReset: d.needs_password_reset ?? false, paymentEnabled: d.payment_enabled ?? false,
    subscriptionLink: d.subscription_link || '', createdAt: d.created_at || new Date().toISOString(),
  };
}

const ProfessionalRegistration: React.FC = () => {
  const navigate = useNavigate();
  const { setLoggedPro } = useClinic();
  const [step, setStep] = useState(1);
  const [authCode, setAuthCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirm: '',
    specialty: '', city: 'Ovalle', customCity: '',
    modalities: { online: true, inPerson: true, home: false },
    serviceName: 'Consulta Inicial', servicePrice: '45000',
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

  const handleCodeNext = async () => {
    setLoading(true);
    setCodeError('');
    try {
      const res = await fetch('/api/validate-clinic-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: authCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setCodeError(data.error || 'Código incorrecto. Solicítalo a la administración.');
        return;
      }
      setStep(2);
    } catch {
      setCodeError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileNext = () => {
    if (!form.name.trim())  { setError('Ingresa tu nombre.'); return; }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setError('Email inválido.'); return; }
    if (!pwChecks.length)   { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (!pwChecks.match)    { setError('Las contraseñas no coinciden.'); return; }
    if (!form.specialty.trim()) { setError('Ingresa tu especialidad.'); return; }
    if (form.city === 'Otra ciudad' && !form.customCity.trim()) { setError('Ingresa el nombre de tu ciudad.'); return; }
    setError(''); setStep(3);
  };

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    const finalCity = form.city === 'Otra ciudad' ? form.customCity.trim() : form.city;

    try {
      // Paso 1: crear cuenta en Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          data: { name: form.name.trim(), specialty: form.specialty.trim() },
          emailRedirectTo: 'https://www.clinicamaslife.cl/#/pro/login',
        },
      });

      if (authErr) {
        if (authErr.message.includes('already registered') || authErr.message.includes('already been registered')) {
          setError('Este email ya está registrado. Intenta iniciar sesión.');
        } else {
          setError(authErr.message);
        }
        setLoading(false); return;
      }

      // Paso 2: auto-confirmar (puede fallar silenciosamente para emails ya confirmados)
      if (authData.user) {
        try { await supabase.rpc('auto_confirm_new_user', { user_id: authData.user.id }); } catch { /* ignorar */ }
      }

      // Paso 3: login inmediato para obtener el ID REAL del usuario.
      // Supabase devuelve UUID falso en signUp cuando el email ya está confirmado
      // (protección anti-enumeración), así que no podemos confiar en authData.user.id.
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      if (signInErr || !signInData?.session) {
        navigate('/pro/login', { state: { registered: true, email: form.email.trim().toLowerCase() } });
        return;
      }

      const realUid = signInData.session.user.id;
      const slug = form.name.trim().toLowerCase().normalize('NFD')
        .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '')
        .replace(/\s+/g, '-') + '-' + realUid.slice(0, 6);

      // Paso 4: verificar si ya existe perfil con el ID real (email ya registrado)
      const { data: existingPro } = await supabase
        .from('professionals').select('*').eq('id', realUid).maybeSingle();

      if (existingPro) {
        setLoggedPro(mapDBtoPro(existingPro) as any);
        navigate('/pro/dashboard');
        return;
      }

      // Paso 5: insertar perfil con ID real y sesión autenticada activa
      const { error: saveErr } = await supabase.from('professionals').insert({
        id: realUid, slug, name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        specialty: form.specialty.trim(), city: finalCity,
        bio: '', avatar: form.avatar || '',
        working_hours: { start: '09:00', end: '18:00' },
        modalities: form.modalities,
        services: [{ id: 's1', name: form.serviceName,
          price: parseInt(form.servicePrice) || 45000, duration: 45, description: '' }],
        is_public: false, is_verified: true, is_approved: true,
        is_subscribed: false, subscription_status: 'trial',
        needs_password_reset: false, payment_enabled: false,
        created_at: new Date().toISOString(),
      });

      if (saveErr) {
        if (saveErr.code === '23505') {
          // Race condition: perfil ya existe, cargarlo y navegar
          const { data: proData } = await supabase.from('professionals').select('*').eq('id', realUid).maybeSingle();
          if (proData) { setLoggedPro(mapDBtoPro(proData) as any); navigate('/pro/dashboard'); return; }
          setError('Este email ya tiene un perfil. Intenta iniciar sesión.');
        } else {
          setError('Error al guardar el perfil: ' + saveErr.message);
        }
        setLoading(false); return;
      }

      // Paso 6: cargar perfil recién creado y navegar al dashboard
      const { data: proData } = await supabase.from('professionals').select('*').eq('id', realUid).maybeSingle();
      if (proData) { setLoggedPro(mapDBtoPro(proData) as any); navigate('/pro/dashboard'); }

    } catch (e: any) {
      setError('Error inesperado: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const tog = (k: keyof typeof form.modalities) =>
    setForm(f => ({...f, modalities: {...f.modalities, [k]: !f.modalities[k]}}));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start py-12 px-4">
      <div className="w-full max-w-xl relative z-10">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 cursor-pointer mb-3" onClick={() => navigate('/')}>
            <div className="bg-teal-500 w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl shadow-teal-500/30">
              <span className="material-icons-round text-white text-2xl">medical_services</span>
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black text-teal-600 uppercase tracking-widest">PLATAFORMA</p>
              <p className="text-xl font-black text-slate-900">Mas Life 🧡</p>
            </div>
          </div>
          <h1 className="text-2xl font-black text-slate-900">Registro de Especialista</h1>
          <p className="text-slate-500 text-sm mt-1">clinicamaslife.cl</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {STEPS.map((s,i) => {
            const n=i+1, active=step===n, done=step>n;
            return (
              <React.Fragment key={s.label}>
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all
                    ${done?'bg-emerald-500 text-white':active?'bg-teal-500 text-white scale-110':'bg-white text-slate-400 border-2 border-slate-200'}`}>
                    {done?<span className="material-icons-round text-sm">check</span>:<span className="material-icons-round text-sm">{s.icon}</span>}
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-widest hidden sm:block
                    ${active?'text-teal-600':done?'text-emerald-500':'text-slate-400'}`}>{s.label}</span>
                </div>
                {i<STEPS.length-1&&<div className={`h-0.5 w-16 mx-1 transition-all ${step>i+1?'bg-emerald-400':'bg-slate-200'}`}/>}
              </React.Fragment>
            );
          })}
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="h-1.5 bg-slate-100">
            <div className="h-full bg-teal-500 transition-all duration-700 rounded-full" style={{width:`${(step/3)*100}%`}}/>
          </div>
          <div className="p-8">

            {/* PASO 1 */}
            {step===1&&(
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-slate-900 rounded-2xl flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-teal-400 text-xl">vpn_key</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Código de autorización</h3>
                    <p className="text-xs text-slate-500">Proporcionado por la administración de la clínica</p>
                  </div>
                </div>
                <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4 text-sm text-teal-800">
                  Ingresa el código que te entregó el administrador de Clínica Mas Life para acceder al registro.
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Código de acceso</label>
                  <input value={authCode} onChange={e=>{setAuthCode(e.target.value.toUpperCase());setCodeError('');}}
                    onKeyDown={e=>e.key==='Enter'&&handleCodeNext()}
                    placeholder="••••••••••••"
                    className="w-full py-4 px-6 rounded-2xl bg-slate-950 border-2 border-slate-800
                      font-mono text-xl tracking-[0.3em] text-white text-center uppercase
                      focus:border-teal-500 outline-none placeholder:text-slate-700"/>
                  {codeError&&<p className="text-rose-500 text-xs font-bold mt-2 flex items-center gap-1"><span className="material-icons-round text-xs">error</span>{codeError}</p>}
                </div>
                <button onClick={handleCodeNext} disabled={authCode.length<4}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest
                    disabled:opacity-40 hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                  Validar y Continuar <span className="material-icons-round text-base">arrow_forward</span>
                </button>
                <p className="text-center text-sm text-slate-500">
                  ¿Ya tienes cuenta? <Link to="/pro/login" className="text-teal-600 font-bold hover:text-teal-800">Inicia sesión</Link>
                </p>
              </div>
            )}

            {/* PASO 2 */}
            {step===2&&(
              <div className="space-y-4">
                <h3 className="text-lg font-black text-slate-900">Tus datos profesionales</h3>
                {/* Avatar */}
                <div className="flex items-center gap-4 mb-2">
                  <div className="relative shrink-0">
                    <div className="w-20 h-20 rounded-2xl bg-slate-100 overflow-hidden border-2 border-white shadow-lg flex items-center justify-center">
                      {form.avatar?<img src={form.avatar} className="w-full h-full object-cover" alt=""/>:<span className="material-icons-round text-4xl text-slate-300">person</span>}
                    </div>
                    <label className="absolute -bottom-1.5 -right-1.5 w-8 h-8 bg-teal-500 text-white rounded-xl flex items-center justify-center cursor-pointer shadow-lg border-2 border-white hover:scale-110 transition-transform">
                      <span className="material-icons-round text-sm">photo_camera</span>
                      <input type="file" onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=ev=>setForm(fm=>({...fm,avatar:ev.target?.result as string}));r.readAsDataURL(f);}}} className="hidden" accept="image/*"/>
                    </label>
                  </div>
                  <div><p className="font-bold text-slate-700 text-sm">Foto de perfil</p><p className="text-xs text-slate-400">Opcional</p></div>
                </div>
                <div><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Nombre completo *</label>
                  <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className={inp} placeholder="Ej: María González"/></div>
                <div><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Email *</label>
                  <input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} className={inp} placeholder="correo@ejemplo.com" autoComplete="username"/></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Contraseña *</label>
                    <input type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} className={inp} placeholder="Mín. 8 car." autoComplete="new-password"/></div>
                  <div><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Confirmar *</label>
                    <input type="password" value={form.confirm} onChange={e=>setForm(f=>({...f,confirm:e.target.value}))} className={inp} placeholder="Repite" autoComplete="new-password"/></div>
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
                <div><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Especialidad *</label>
                  <input value={form.specialty} onChange={e=>setForm(f=>({...f,specialty:e.target.value}))} className={inp} placeholder="Ej: Kinesiología, Fonoaudiología..."/></div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Ciudad *</label>
                  <select value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))} className={inp}>
                    {CHILEAN_CITIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  {form.city==='Otra ciudad'&&(
                    <input value={form.customCity} onChange={e=>setForm(f=>({...f,customCity:e.target.value}))}
                      className={`${inp} mt-2`} placeholder="Escribe el nombre de tu ciudad"/>
                  )}
                </div>
                {error&&<div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <span className="material-icons-round text-rose-500 text-base shrink-0 mt-0.5">error</span>
                  <p className="text-sm text-rose-700 font-medium">{error}</p></div>}
                <div className="flex gap-3 pt-1">
                  <button onClick={()=>{setStep(1);setError('');}} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Atrás</button>
                  <button onClick={handleProfileNext} className="flex-[2] py-3.5 bg-teal-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-teal-600 transition-all shadow-lg shadow-teal-500/25">Siguiente</button>
                </div>
              </div>
            )}

            {/* PASO 3 */}
            {step===3&&(
              <form onSubmit={handleFinish} className="space-y-5">
                <h3 className="text-lg font-black text-slate-900">Modalidades y primer servicio</h3>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Tipo de atención</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[{k:'online',l:'Online',i:'videocam'},{k:'inPerson',l:'Presencial',i:'location_on'},{k:'home',l:'Domicilio',i:'home'}].map(m=>(
                       <button key={m.k} type="button" onClick={()=>tog(m.k as any)}
                        className={`p-4 rounded-2xl border-2 flex sm:flex-col items-center justify-center gap-3 transition-all
                          ${form.modalities[m.k as keyof typeof form.modalities]?'border-teal-500 bg-teal-50 text-teal-700':'border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300'}`}>
                        <span className="material-icons-round text-xl">{m.i}</span>
                        <span className="text-xs font-black uppercase tracking-widest">{m.l}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-2xl p-5 border-2 border-slate-100 space-y-4">
                  <h4 className="text-sm font-black text-slate-800">Tu primer servicio</h4>
                  <div><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Nombre</label>
                    <input value={form.serviceName} onChange={e=>setForm(f=>({...f,serviceName:e.target.value}))} className={inp} placeholder="Consulta Inicial"/></div>
                  <div><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Precio (CLP)</label>
                    <input type="text" inputMode="numeric" value={form.servicePrice} onChange={e=>setForm(f=>({...f,servicePrice:e.target.value.replace(/\D/g,'')}))} className={inp} placeholder="45000"/></div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
                  <span className="material-icons-round text-emerald-500 text-xl shrink-0 mt-0.5">verified</span>
                  <p className="text-sm text-emerald-800 font-medium">Al usar el código de la clínica tu cuenta queda <strong>activa inmediatamente</strong>. Podrás ingresar al panel ahora mismo.</p>
                </div>
                {error&&<div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <span className="material-icons-round text-rose-500 text-base shrink-0 mt-0.5">error</span>
                  <p className="text-sm text-rose-700 font-medium">{error}</p></div>}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={()=>{setStep(2);setError('');}} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Atrás</button>
                  <button type="submit" disabled={loading}
                    className="flex-[2] py-3.5 bg-teal-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-teal-600 transition-all shadow-lg shadow-teal-500/25 disabled:opacity-60 flex items-center justify-center gap-2">
                    {loading?<><span className="material-icons-round text-base animate-spin">sync</span>Creando...</>:<><span className="material-icons-round text-base">how_to_reg</span>Crear mi cuenta</>}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalRegistration;
