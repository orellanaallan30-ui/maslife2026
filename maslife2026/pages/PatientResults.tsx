import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClinic } from '../ClinicContext';

const PatientResults: React.FC = () => {
  const navigate = useNavigate();
  const { professionals } = useClinic();
  const [citySearch, setCitySearch] = useState('');

  const visibleDoctors = professionals.filter(p => {
    const isPublic = p.isPublic;
    const matchesCity = !citySearch ||
      (p.city && p.city.toLowerCase().includes(citySearch.toLowerCase().trim()));
    return isPublic && matchesCity;
  });

  const clearCityFilter = () => setCitySearch('');

  return (
    <div className="w-full bg-[#f8fafc] overflow-y-auto animate-in fade-in duration-700">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-8">
          <aside className="lg:col-span-3 space-y-6">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
              <h3 className="font-black text-slate-800 text-xs uppercase tracking-[0.2em] mb-8">Filtros de Búsqueda</h3>

              <div className="space-y-8">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Ubicación</label>
                  <div className="relative group">
                    <span className="material-icons-round absolute left-4 top-1/2 -translate-y-1/2 text-primary/40 group-focus-within:text-primary transition-colors text-lg">location_on</span>
                    <input
                      type="text"
                      value={citySearch}
                      onChange={(e) => setCitySearch(e.target.value)}
                      placeholder="Ciudad..."
                      className="w-full bg-slate-50 border-slate-100 rounded-2xl py-4 pl-12 pr-10 text-sm font-bold text-slate-700 placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all"
                    />
                    {citySearch && (
                      <button onClick={clearCityFilter} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-500">
                        <span className="material-icons-round text-sm">close</span>
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Modalidad</label>
                  <div className="space-y-3">
                    {['Online', 'Presencial', 'Domicilio'].map(mode => (
                      <label key={mode} className="flex items-center gap-3 cursor-pointer group">
                        <input type="checkbox" className="rounded-lg text-primary focus:ring-primary/20 border-slate-200 w-5 h-5" defaultChecked={mode === 'Online'} />
                        <span className="text-sm font-bold text-slate-600 group-hover:text-primary transition-colors">{mode}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-primary rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl shadow-primary/20">
              <div className="relative z-10">
                <h4 className="font-black text-lg mb-2">¿Necesitas ayuda?</h4>
                <p className="text-xs text-teal-50 leading-relaxed mb-6 opacity-80">Nuestro equipo te ayuda a encontrar al especialista ideal para tu caso.</p>
                <button className="w-full py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl text-xs font-black uppercase tracking-widest transition-all">Hablar con Asesor</button>
              </div>
              <span className="material-icons absolute -bottom-8 -right-8 text-[120px] opacity-10 rotate-12">support_agent</span>
            </div>
          </aside>

          <div className="lg:col-span-9 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Especialistas Disponibles</h2>
                <p className="text-sm font-bold text-slate-500">{visibleDoctors.length} profesionales encontrados</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {visibleDoctors.length > 0 ? visibleDoctors.map((doc) => {
                const mainService = doc.services[0];
                return (
                  <div
                    key={doc.id}
                    onClick={() => navigate(`/patient/profile/${doc.id}`)}
                    className="bg-white p-6 sm:p-8 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-primary/5 transition-all group flex flex-col md:flex-row gap-8 items-center cursor-pointer"
                  >
                    <div className="relative shrink-0">
                      <img className="w-32 h-32 rounded-[2rem] object-cover shadow-xl group-hover:scale-105 transition-transform duration-500" src={doc.avatar || 'https://picsum.photos/seed/doctor/200/200'} alt={doc.name} />
                      <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white p-1.5 rounded-xl border-4 border-white shadow-lg">
                        <span className="material-icons-round text-xs">verified</span>
                      </div>
                    </div>

                    <div className="flex-1 text-center md:text-left">
                      <h3 className="text-xl font-black text-slate-900 group-hover:text-primary transition-colors">{doc.name}</h3>
                      <p className="text-sm font-bold text-slate-500 mb-2">{doc.specialty}</p>
                      <div className="flex items-center justify-center md:justify-start gap-1.5 mb-6 text-primary">
                        <span className="material-icons-round text-sm">location_on</span>
                        <span className="text-xs font-black uppercase tracking-widest">{doc.city || 'Chile'}</span>
                      </div>
                      <div className="flex flex-wrap justify-center md:justify-start gap-2">
                        {doc.modalities.online && <span className="px-4 py-1.5 bg-primary/5 text-primary text-xs font-black rounded-full uppercase tracking-widest border border-primary/10">Telemedicina</span>}
                        {doc.modalities.inPerson && <span className="px-4 py-1.5 bg-slate-50 text-slate-500 text-xs font-black rounded-full uppercase tracking-widest border border-slate-100">Presencial</span>}
                      </div>
                    </div>

                    <div className="w-full md:w-64 bg-slate-50 rounded-[2.5rem] p-8 flex flex-col items-center justify-center gap-4 border border-slate-100">
                      <div className="text-center">
                        <p className="text-2xl font-black text-slate-900 tracking-tighter">${mainService?.price.toLocaleString('es-CL') || '---'}</p>
                        <p className="text-xs font-bold text-slate-500 uppercase">Valor consulta</p>
                      </div>
                      <button className="w-full py-4 bg-primary text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-primary/20 hover:brightness-110 transition-all active:scale-95">
                        AGENDAR AHORA
                      </button>
                    </div>
                  </div>
                );
              }) : (
                <div className="py-24 text-center bg-white rounded-[4rem] border border-slate-100">
                  <span className="material-icons-round text-slate-200 text-6xl mb-6">person_search</span>
                  <p className="text-slate-500 font-bold text-lg">No hay especialistas que coincidan con tu búsqueda.</p>
                  <button onClick={clearCityFilter} className="mt-8 px-10 py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Ver todos</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientResults;
