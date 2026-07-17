
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Plans: React.FC = () => {
  const navigate = useNavigate();
  const [modality, setModality] = useState<'domicilio' | 'online' | 'presencial'>('domicilio');

  const plans = [
    {
      id: 'p1',
      name: 'Plan Kinesiológico Domiciliario',
      desc: 'Recuperación integral en la comodidad de tu hogar.',
      price: '$350.000',
      period: '/ Mes',
      features: [
        'Evaluación Inicial Completa',
        '10 Sesiones Personalizadas',
        'Seguimiento por WhatsApp 24/7',
        'Equipamiento Incluido'
      ],
      icon: 'accessibility_new',
      color: 'bg-teal-50 text-teal-500'
    },
    {
      id: 'p2',
      name: 'Plan Nutrición Online',
      desc: 'Alcanza tus objetivos nutricionales con guía experta remota.',
      price: '$85.000',
      period: '/ Mes',
      features: [
        'Pauta Alimentaria Personalizada',
        '2 Controles Mensuales (Video)',
        'Acceso a App de Recetas',
        'Análisis de Composición Corporal'
      ],
      icon: 'restaurant',
      color: 'bg-cyan-50 text-cyan-500'
    },
    {
      id: 'p3',
      name: 'Plan Psicología Bienestar',
      desc: 'Cuidado emocional y mental para una vida plena.',
      price: '$120.000',
      period: '/ Mes',
      features: [
        '4 Sesiones Individuales',
        'Material de Apoyo Digital',
        'Tests de Ansiedad y Stress',
        'Soporte por Chat'
      ],
      icon: 'psychology',
      color: 'bg-indigo-50 text-indigo-500'
    },
    {
      id: 'p4',
      name: 'Plan TENS de Cuidados',
      desc: 'Asistencia técnica profesional en enfermería.',
      price: '$45.000',
      period: '/ Día',
      features: [
        'Control de Signos Vitales',
        'Administración de Fármacos',
        'Curaciones y Cuidados',
        'Asistencia 12h o 24h'
      ],
      icon: 'health_and_safety',
      color: 'bg-rose-50 text-rose-500'
    },
  ];

  return (
    <div className="w-full h-full overflow-y-auto bg-white custom-scrollbar">
      {/* HEADER DE PLANES */}
      {/* ── RESPONSIVE: base=mobile  lg:=desktop ── */}
      <section className="px-6 py-10 lg:px-24 lg:py-24 space-y-8 lg:space-y-12 animate-in fade-in duration-700">
        <div className="space-y-4 lg:space-y-6">
          <span className="text-xs font-black text-teal-600 bg-teal-50 px-5 py-2 rounded-full uppercase tracking-widest">Planes Personalizados</span>
          {/* ── RESPONSIVE: H1 — break-words evita overflow en 375px ── */}
          <h1 className="text-3xl lg:text-7xl font-extrabold text-slate-900 tracking-tight leading-none break-words hyphens-auto">
            Tu bienestar es nuestra <br className="hidden lg:block"/><span className="text-teal-500 italic">prioridad número uno</span>
          </h1>
          <p className="text-base lg:text-lg text-slate-500 font-medium max-w-2xl leading-relaxed">
            Selecciona la modalidad que mejor se adapte a tu ritmo de vida y accede a servicios de salud de alta calidad con nuestros especialistas.
          </p>
        </div>

        {/* SELECTOR DE MODALIDAD */}
        {/* ── RESPONSIVE: selector modalidad — centrado mobile, izquierda lg:desktop ── */}
        <div className="flex justify-center lg:justify-start">
           <div className="bg-white p-2 rounded-blob-lg border border-slate-100 shadow-xl flex gap-2">
              {[
                { id: 'domicilio', label: 'Domiciliaria', icon: 'home' },
                { id: 'online', label: 'Online', icon: 'videocam' },
                { id: 'presencial', label: 'Presencial', icon: 'location_on' }
              ].map((m) => (
                <button 
                  key={m.id}
                  onClick={() => setModality(m.id as any)}
                  className={`flex items-center gap-3 px-8 py-4 rounded-blob-sm text-xs font-black uppercase tracking-widest transition-all ${modality === m.id ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  <span className="material-icons-round text-lg">{m.icon}</span>
                  {m.label}
                </button>
              ))}
           </div>
        </div>

        {/* GRID DE PLANES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 pt-12">
           {plans.map((plan) => (
             <div key={plan.id} className="bg-white p-10 rounded-blob-xl border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all flex flex-col">
                <div className={`${plan.color} w-14 h-14 rounded-2xl flex items-center justify-center mb-8`}>
                   <span className="material-icons-round text-2xl">{plan.icon}</span>
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2 leading-tight">{plan.name}</h3>
                <p className="text-xs text-slate-500 font-bold mb-8 uppercase tracking-widest">{plan.desc}</p>
                
                <ul className="space-y-5 mb-12 flex-1">
                   {plan.features.map((feat, i) => (
                     <li key={i} className="flex items-center gap-3 text-slate-600 text-xs font-bold leading-relaxed">
                        <span className="material-icons-round text-teal-500 text-lg">check_circle</span>
                        {feat}
                     </li>
                   ))}
                </ul>

                <div className="space-y-6 pt-8 border-t border-slate-50">
                   <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-slate-900 tracking-tighter">{plan.price}</span>
                      <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{plan.period}</span>
                   </div>
                   <button 
                     onClick={() => navigate('/patient/search')}
                     className="w-full py-5 bg-teal-500 text-white rounded-blob-sm font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-teal-500/10 hover:brightness-110 active:scale-95 transition-all"
                   >
                     Seleccionar Plan
                   </button>
                </div>
             </div>
           ))}

           {/* PLAN A MEDIDA */}
           <div className="bg-teal-50/50 p-10 rounded-blob-xl border-2 border-dashed border-teal-200 flex flex-col items-center justify-center text-center space-y-8">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center text-teal-500">
                <span className="material-icons-round text-4xl">architecture</span>
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 mb-3">Plan a Medida</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  ¿No encuentras lo que buscas? Diseñamos un plan exclusivo para tus necesidades.
                </p>
              </div>
              <button className="w-full py-5 bg-white text-slate-900 border border-slate-200 rounded-blob-sm font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-slate-50 transition-all">
                Hablar con un Ejecutivo
              </button>
           </div>
        </div>
      </section>

      {/* POR QUÉ ELEGIRNOS */}
      {/* ── RESPONSIVE: por qué elegirnos — md: → lg: breakpoint principal ── */}
      <section className="px-6 py-16 lg:px-24 lg:py-24 bg-slate-50/30">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
           <div className="flex-1 space-y-12">
              <h2 className="text-3xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.1]">Por qué elegir Clínica Mas Life</h2>
              
              <div className="space-y-8">
                 <div className="flex gap-6">
                    <div className="w-14 h-14 bg-white text-teal-500 rounded-2xl flex items-center justify-center shadow-xl shrink-0">
                      <span className="material-icons-round text-2xl">groups</span>
                    </div>
                    <div>
                       <h4 className="text-lg font-black text-slate-900 mb-1">Expertos Latinos</h4>
                       <p className="text-slate-500 font-medium text-sm leading-relaxed uppercase tracking-widest">Atención empática y profesional con enfoque humano.</p>
                    </div>
                 </div>
                 <div className="flex gap-6">
                    <div className="w-14 h-14 bg-white text-teal-500 rounded-2xl flex items-center justify-center shadow-xl shrink-0">
                      <span className="material-icons-round text-2xl">verified</span>
                    </div>
                    <div>
                       <h4 className="text-lg font-black text-slate-900 mb-1">Calidad Certificada</h4>
                       <p className="text-slate-500 font-medium text-sm leading-relaxed uppercase tracking-widest">Cumplimos con los más altos estándares de salud.</p>
                    </div>
                 </div>
              </div>
           </div>

           <div className="flex-1 relative">
              <div className="absolute -inset-10 bg-teal-500/10 rounded-blob-4xl blur-3xl opacity-50"></div>
              <img 
                src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&q=80&w=800" 
                className="relative rounded-blob-3xl shadow-2xl border-[16px] border-white w-full object-cover aspect-video" 
                alt="Personal de salud"
              />
              <div className="absolute -bottom-10 -right-10 bg-white p-8 rounded-blob-lg shadow-2xl border border-slate-100 hidden lg:block">
                 <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Pacientes Felices</p>
                 <div className="flex items-center gap-3">
                    <span className="text-4xl font-black text-slate-900 tracking-tighter">15k+</span>
                    <div className="flex text-amber-400 text-sm">
                       {[1,2,3,4,5].map(s => <span key={s} className="material-icons">star</span>)}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </section>

      {/* FOOTER BASADO EN IMAGEN 2 */}
      {/* ── RESPONSIVE: footer — md: → lg: breakpoint principal ── */}
      <footer className="bg-white border-t border-slate-100 pt-16 pb-12 px-6 lg:px-24 lg:pt-24">
         <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-10 lg:gap-16 mb-16 lg:mb-24">
            <div className="space-y-6">
               <div className="flex items-center gap-3">
                  <span className="material-icons-round text-teal-500 text-4xl">medical_services</span>
                  <span className="text-2xl font-black text-slate-900 tracking-tighter">Clínica Mas Life</span>
               </div>
               <p className="text-slate-500 text-sm font-medium leading-relaxed">
                  Dedicados a transformar la salud domiciliaria y digital con tecnología y empatía humana.
               </p>
            </div>

            <div>
               <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-8">Servicios</h4>
               <ul className="space-y-4 text-slate-500 font-bold text-xs uppercase tracking-widest">
                  <li className="hover:text-teal-600 cursor-pointer">Kinesiología</li>
                  <li className="hover:text-teal-600 cursor-pointer">Nutrición</li>
                  <li className="hover:text-teal-600 cursor-pointer">Psicología</li>
                  <li className="hover:text-teal-600 cursor-pointer">Enfermería</li>
               </ul>
            </div>

            <div>
               <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-8">Compañía</h4>
               <ul className="space-y-4 text-slate-500 font-bold text-xs uppercase tracking-widest">
                  <li className="hover:text-teal-600 cursor-pointer">Sobre Nosotros</li>
                  <li className="hover:text-teal-600 cursor-pointer">Nuestros Profesionales</li>
                  <li className="hover:text-teal-600 cursor-pointer">Preguntas Frecuentes</li>
                  <li className="hover:text-teal-600 cursor-pointer">Contacto</li>
               </ul>
            </div>

            <div>
               <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-8">Suscríbete</h4>
               <p className="text-xs text-slate-500 font-medium mb-6">Recibe consejos de salud y ofertas.</p>
               <div className="flex gap-2">
                  <input className="flex-1 bg-slate-50 border-none rounded-xl px-4 text-xs font-bold" placeholder="Email" />
                  <button className="bg-teal-500 text-white p-4 rounded-xl shadow-lg shadow-teal-500/20">
                    <span className="material-icons-round text-sm">send</span>
                  </button>
               </div>
            </div>
         </div>
         <div className="text-center border-t border-slate-100 pt-12">
            <p className="text-xs font-black text-slate-300 uppercase tracking-[0.3em]">© 2024 Clínica Mas Life. Todos los derechos reservados.</p>
         </div>
      </footer>
    </div>
  );
};

export default Plans;
