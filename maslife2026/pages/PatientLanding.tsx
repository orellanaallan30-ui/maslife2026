
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PatientLanding: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showAgendar, setShowAgendar] = useState(false);
  const [form, setForm] = useState({ name: '', rut: '', address: '', city: '', details: '' });

  const handleWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();
    const text = `Hola, quiero agendar con Agenda Maslife.\n\n*Nombre:* ${form.name}\n*RUT:* ${form.rut}\n*Dirección:* ${form.address}, ${form.city}\n*Detalles de Consulta:* ${form.details}`;
    window.open(`https://wa.me/56912345678?text=${encodeURIComponent(text)}`, '_blank');
    setShowAgendar(false);
  };

  return (
    <div className="w-full bg-white flex flex-col overflow-y-auto custom-scrollbar">
      <section className="relative pt-40 pb-56 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none">
           <div className="absolute top-20 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl opacity-60"></div>
           <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-teal-500/5 rounded-full blur-3xl opacity-60"></div>
        </div>

        <div className="max-w-7xl mx-auto px-8 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24 mb-20 animate-in fade-in slide-in-from-bottom-10 duration-1000">
             <div className="flex-1 text-center lg:text-left">
                <span className="inline-block py-3 px-8 rounded-full bg-primary/10 text-primary text-xs font-black uppercase tracking-[0.3em] mb-8">Ecosistema Agenda Maslife Premium</span>
                <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-black text-slate-900 leading-[1.05] mb-8 tracking-tight">
                    Encuentra al profesional ideal <br className="hidden md:block"/> para tu <span className="text-primary inline-flex items-center gap-4 relative">bienestar <span className="absolute -bottom-2 left-0 w-full h-3 bg-teal-400/30 -rotate-1 skew-x-12 animate-pulse"></span></span>
                </h1>
                <p className="text-xl md:text-2xl text-slate-500 leading-relaxed font-medium mb-12 max-w-2xl mx-auto lg:mx-0">
                    Reserva citas médicas en segundos. Agenda tu visita o contacta a un ejecutivo clínico directamente. 100% online y seguro.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-6">
                   <button onClick={() => setShowAgendar(true)} className="group relative w-full sm:w-auto px-10 py-5 rounded-2xl bg-slate-900 text-white font-black text-xs md:text-sm uppercase tracking-[0.15em] shadow-pop border-b-4 border-slate-700 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-4">
                      <span>Agendar Atención</span>
                      <span className="material-icons-round text-lg group-hover:rotate-12 transition-transform">event_available</span>
                   </button>
                   <button onClick={() => navigate('/patient/results')} className="group relative w-full sm:w-auto px-10 py-5 rounded-2xl bg-white border-2 border-slate-100 text-slate-600 font-black text-xs md:text-sm uppercase tracking-[0.15em] hover:border-primary hover:text-primary shadow-sm hover:shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3">
                      <span>Buscar Médico</span>
                      <span className="material-icons-round text-lg group-hover:translate-x-1 transition-transform">search</span>
                   </button>
                </div>
             </div>
             
             <div className="flex-1 w-full max-w-lg mx-auto relative perspective-1000 group">
               <div className="absolute inset-0 bg-gradient-to-tr from-primary to-teal-200 rounded-blob-xl transform rotate-3 scale-105 blur-2xl opacity-40 group-hover:opacity-60 transition-opacity duration-700 animate-pulse"></div>
               <div className="relative bg-white p-4 rounded-blob-xl shadow-card-ambient-dark border border-slate-100 overflow-hidden transform transition-all group-hover:-translate-y-4 hover:rotate-1 duration-700">
                 <img src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=800" alt="Médico Especialista" className="w-full aspect-[4/5] object-cover rounded-blob-lg group-hover:scale-105 transition-transform duration-1000" />

                 <div className="absolute bottom-8 -left-6 bg-white p-5 rounded-blob-md shadow-2xl border border-slate-100 animate-bounce [animation-duration:3s]">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/30">
                        <span className="material-icons-round">volunteer_activism</span>
                      </div>
                      <div className="pr-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Atención Inmediata</p>
                        <p className="font-black text-slate-900 text-sm">Reserva 100% Segura</p>
                      </div>
                    </div>
                 </div>

                 <div className="absolute top-10 -right-6 bg-white p-5 rounded-blob-md shadow-2xl border border-slate-100 hidden sm:block animate-bounce [animation-delay:1.5s] [animation-duration:4s]">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
                        <span className="material-icons-round">health_and_safety</span>
                      </div>
                      <div className="pr-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Garantía Agenda Maslife</p>
                        <p className="font-black text-slate-900 text-sm">Clínica Certificada</p>
                      </div>
                    </div>
                 </div>
               </div>
             </div>
          </div>
        </div>
      </section>

      <section className="py-40 bg-slate-50/50 relative">
        <div className="max-w-7xl mx-auto px-8">
           <div className="grid grid-cols-1 lg:grid-cols-4 gap-14">
              {[
                { val: '5.000+', label: 'Médicos Verificados', icon: 'verified_user', color: 'text-emerald-500' },
                { val: '250k+', label: 'Pacientes Felices', icon: 'sentiment_very_satisfied', color: 'text-primary' },
                { val: '24/7', label: 'Reserva Inmediata', icon: 'schedule', color: 'text-amber-500' },
                { val: '4.9/5', label: 'Calificación Media', icon: 'stars', color: 'text-indigo-500' },
              ].map((s, i) => (
                <div key={i} className="bg-white p-12 rounded-blob-2xl border border-slate-100 shadow-sm text-center group hover:shadow-2xl transition-all">
                  <div className={`w-16 h-16 mx-auto mb-8 rounded-blob-sm bg-slate-50 flex items-center justify-center ${s.color} group-hover:scale-110 transition-transform`}>
                     <span className="material-icons-round text-4xl">{s.icon}</span>
                  </div>
                  <div className="text-5xl font-black text-slate-900 mb-3 tracking-tighter">{s.val}</div>
                  <div className="text-xs font-black text-slate-500 uppercase tracking-widest leading-loose">{s.label}</div>
                </div>
              ))}
           </div>
        </div>
      </section>

      <section className="py-48">
          <div className="max-w-7xl mx-auto px-8">
              <div className="flex flex-col lg:flex-row items-center gap-32">
                  <div className="flex-1 space-y-12">
                      <div className="space-y-6">
                        <h2 className="text-5xl md:text-6xl font-black text-slate-900 leading-[1.1] tracking-tight">Tu salud, bajo tus <br/><span className="text-primary italic underline decoration-teal-400/30">propios</span> términos.</h2>
                        <p className="text-2xl text-slate-500 leading-relaxed font-medium">Gestionar tus citas nunca fue tan simple. Accede a tu historial médico, descarga recetas y agenda con un clic.</p>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                          {[
                              { title: 'Telemedicina HD', desc: 'Atiéndete desde casa con video de alta definición.', icon: 'videocam' },
                              { title: 'Recordatorios', desc: 'Avisos por WhatsApp para que nunca olvides una cita.', icon: 'notifications_active' },
                              { title: 'Pago Seguro', desc: 'Transacciones cifradas con Webpay y tarjetas.', icon: 'lock' },
                              { title: 'Historial', desc: 'Toda tu evolución clínica en un solo lugar.', icon: 'folder_shared' }
                          ].map((item, i) => (
                              <div key={i} className="space-y-4">
                                  <div className="w-12 h-12 bg-primary/5 rounded-2xl flex items-center justify-center text-primary">
                                      <span className="material-icons-round text-2xl">{item.icon}</span>
                                  </div>
                                  <h4 className="font-black text-slate-900 text-base uppercase tracking-widest">{item.title}</h4>
                                  <p className="text-base text-slate-500 leading-relaxed font-medium">{item.desc}</p>
                              </div>
                          ))}
                      </div>

                      <button className="bg-slate-900 text-white px-14 py-8 rounded-blob-lg font-black text-sm uppercase tracking-[0.2em] shadow-2xl hover:bg-slate-800 transition-all flex items-center gap-5">
                          COMENZAR AHORA
                          <span className="material-icons-round text-xl">rocket_launch</span>
                      </button>
                  </div>
                  <div className="flex-1 relative">
                      <div className="absolute -inset-6 bg-primary/10 rounded-blob-4xl blur-3xl opacity-30 animate-pulse"></div>
                      <img className="relative rounded-blob-3xl shadow-2xl border-[16px] border-white object-cover aspect-[4/5] w-full" src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&q=80&w=800" alt="Health App" />
                      <div className="absolute -bottom-12 -left-12 bg-white p-10 rounded-blob-xl shadow-2xl border border-slate-100 hidden md:block animate-bounce">
                         <div className="flex items-center gap-5">
                            <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-white">
                               <span className="material-icons-round text-3xl">check_circle</span>
                            </div>
                            <div>
                               <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Cita confirmada</p>
                               <p className="font-black text-slate-900 text-lg">Dr. Ricardo Silva</p>
                            </div>
                         </div>
                      </div>
                  </div>
              </div>
          </div>
      </section>

      <footer className="bg-slate-900 pt-40 pb-20 text-white mt-auto">
          <div className="max-w-7xl mx-auto px-8 grid grid-cols-1 lg:grid-cols-4 gap-24">
              <div className="col-span-1 md:col-span-1 space-y-10">
                  <div className="flex items-center gap-4">
                      <div className="bg-primary p-3 rounded-2xl">
                          <span className="material-icons-round text-white text-3xl">medical_services</span>
                      </div>
                      <span className="text-3xl font-black tracking-tighter">Agenda Maslife</span>
                  </div>
                  <p className="text-slate-500 text-base leading-relaxed font-medium">Liderando la transformación digital de la salud en Latinoamérica con tecnología y empatía.</p>
                  <div className="flex gap-5">
                     {['facebook', 'instagram', 'linkedin'].map(i => (
                       <div key={i} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-primary transition-all cursor-pointer">
                         <span className={`material-icons text-base`}>public</span>
                       </div>
                     ))}
                  </div>
              </div>
              <div>
                  <h4 className="font-black text-xs uppercase tracking-[0.3em] mb-12 text-primary">Ecosistema</h4>
                  <ul className="space-y-6 text-slate-500 text-base font-bold">
                      <li className="hover:text-white transition-colors cursor-pointer flex items-center gap-2">Portal de Pacientes</li>
                      <li className="hover:text-white transition-colors cursor-pointer flex items-center gap-2">Módulo para Médicos</li>
                      <li className="hover:text-white transition-colors cursor-pointer flex items-center gap-2">Administración Central</li>
                      <li className="hover:text-white transition-colors cursor-pointer flex items-center gap-2">API para Clínicas</li>
                  </ul>
              </div>
              <div>
                  <h4 className="font-black text-xs uppercase tracking-[0.3em] mb-12 text-primary">Soporte</h4>
                  <ul className="space-y-6 text-slate-500 text-base font-bold">
                      <li className="hover:text-white transition-colors cursor-pointer">Centro de Ayuda</li>
                      <li className="hover:text-white transition-colors cursor-pointer">Seguridad de Datos</li>
                      <li className="hover:text-white transition-colors cursor-pointer">Términos de Servicio</li>
                      <li className="hover:text-white transition-colors cursor-pointer">Política de Privacidad</li>
                  </ul>
              </div>
              <div>
                  <h4 className="font-black text-xs uppercase tracking-[0.3em] mb-12 text-primary">Contacto</h4>
                  <ul className="space-y-8 text-slate-500 text-base font-bold">
                      <li className="flex items-center gap-5">
                        <span className="w-12 h-12 rounded-blob-xs bg-white/5 flex items-center justify-center text-primary">
                          <span className="material-icons-round text-xl">email</span>
                        </span>
                        hola@agendamaslife.com
                      </li>
                      <li className="flex items-center gap-5">
                        <span className="w-12 h-12 rounded-blob-xs bg-white/5 flex items-center justify-center text-primary">
                          <span className="material-icons-round text-xl">phone</span>
                        </span>
                        +56 9 1234 5678
                      </li>
                  </ul>
              </div>
          </div>
          <div className="max-w-7xl mx-auto px-8 mt-40 pt-12 border-t border-white/5 flex flex-col lg:flex-row justify-between items-center gap-8 text-xs font-black text-slate-500 uppercase tracking-[0.3em]">
              <p>© 2024 AGENDA MASLIFE • SANTIAGO, CHILE</p>
              <div className="flex items-center gap-10">
                  <span className="flex items-center gap-3 text-emerald-500"><span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> SERVIDORES ONLINE</span>
                  <span>VERSION 4.2.0-STABLE</span>
              </div>
          </div>
      </footer>

      {showAgendar && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 sm:p-10 no-print">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowAgendar(false)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-blob-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
             <div className="px-10 py-8 bg-slate-900 text-white flex justify-between items-center shrink-0 relative overflow-hidden flex-wrap gap-4">
               <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
               <div className="relative z-10 flex-1">
                 <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">
                    <span className="material-icons-round text-emerald-400">whatsapp</span> 
                    Agendar Atención
                 </h3>
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Contacto Directo Asesor Clínico</p>
               </div>
               <button onClick={() => setShowAgendar(false)} className="relative z-10 w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/20 transition-all">
                 <span className="material-icons-round text-lg">close</span>
               </button>
             </div>
             
             <form onSubmit={handleWhatsApp} className="p-8 sm:p-10 flex flex-col gap-6 overflow-y-auto custom-scrollbar max-h-[70vh]">
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Completo</label>
                 <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all" placeholder="Ej: Juan Pérez" />
               </div>
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">RUT</label>
                 <input required value={form.rut} onChange={e => setForm({...form, rut: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all" placeholder="Ej: 12.345.678-9" />
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                 <div className="space-y-2">
                   <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Dirección</label>
                   <input required value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all" placeholder="Calle, Número" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Ciudad</label>
                   <input required value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all" placeholder="Ej: Santiago" />
                 </div>
               </div>
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Detalle de Consulta o Especialidad</label>
                 <textarea required value={form.details} onChange={e => setForm({...form, details: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all resize-none h-28" placeholder="Cuéntanos brevemente qué necesitas..." />
               </div>
               
               <button type="submit" className="mt-4 w-full py-5 rounded-2xl bg-emerald-500 text-white font-black text-sm uppercase tracking-[0.2em] shadow-success-pop border-b-4 border-emerald-700 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-3">
                 <span className="material-icons-round">send</span>
                 Solicitar por WhatsApp
               </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientLanding;
