import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClinic } from '../ClinicContext';
import { getAllPublicProfessionals } from '../supabaseService';
import { ProfessionalProfile } from '../types';
import logoAgenda from '../assets/logo-agenda.png';

const PatientResults: React.FC = () => {
  const navigate = useNavigate();
  const { professionals } = useClinic();
  const [publicPros, setPublicPros] = useState<ProfessionalProfile[]>([]);
  const [citySearch, setCitySearch] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedModality, setSelectedModality] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    getAllPublicProfessionals()
      .then(setPublicPros)
      .catch(() => setPublicPros(professionals.filter(p => p.isPublic)));
  }, []);

  const areas = [
    { value: '', label: 'Todas las áreas' },
    { value: 'Kinesiología', label: 'Kinesiología' },
    { value: 'Psicología', label: 'Psicología' },
    { value: 'Nutrición', label: 'Nutrición' },
    { value: 'Fonoaudiología', label: 'Fonoaudiología' },
    { value: 'Terapia Ocupacional', label: 'Terapia Ocupacional' },
    { value: 'Podología', label: 'Podología' },
    { value: 'Técnico en Enfermería', label: 'Téc. Enfermería (TENS)' },
    { value: 'Masoterapia', label: 'Masoterapia' },
  ];

  const toggleModality = (mode: string) => {
    setSelectedModality(prev =>
      prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]
    );
  };

  const visibleDoctors = publicPros.filter(p => {
    if (citySearch && !(p.city && p.city.toLowerCase().includes(citySearch.toLowerCase().trim()))) return false;
    if (selectedArea && !p.specialty?.toLowerCase().includes(selectedArea.toLowerCase())) return false;
    if (selectedModality.length > 0) {
      const hasModality = selectedModality.some(m => {
        if (m === 'Online') return p.modalities?.online;
        if (m === 'Presencial') return p.modalities?.inPerson;
        if (m === 'Domicilio') return p.modalities?.home;
        return false;
      });
      if (!hasModality) return false;
    }
    return true;
  });

  const clearFilters = () => {
    setCitySearch('');
    setSelectedArea('');
    setSelectedModality([]);
  };

  const hasActiveFilters = citySearch || selectedArea || selectedModality.length > 0;

  return (
    <div className="w-full bg-slate-50 overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 80px)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* Header con logo Agenda Online */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-4">
            <img src={logoAgenda} alt="Agenda Online ClinicaMaslife" className="h-10 w-auto object-contain" />
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Especialistas Disponibles</h2>
              <p className="text-sm font-medium text-slate-500">{visibleDoctors.length} profesionales encontrados</p>
            </div>
          </div>
          {/* Mobile filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 text-sm font-bold text-slate-700 shadow-sm"
          >
            <span className="material-icons-round text-base">tune</span>
            Filtros
            {hasActiveFilters && <span className="w-2 h-2 bg-blue-600 rounded-full"></span>}
          </button>
        </div>

        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-5">

          {/* ── Filtros ── */}
          <aside className={`lg:col-span-3 space-y-4 ${showFilters ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Filtros de Búsqueda</h3>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-[10px] font-bold text-blue-600 uppercase tracking-wider hover:underline">
                    Limpiar
                  </button>
                )}
              </div>

              <div className="space-y-5">
                {/* Área */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Área profesional</label>
                  <select
                    value={selectedArea}
                    onChange={(e) => setSelectedArea(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {areas.map(a => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>

                {/* Ciudad */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Ciudad</label>
                  <div className="relative">
                    <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">location_on</span>
                    <input
                      type="text"
                      value={citySearch}
                      onChange={(e) => setCitySearch(e.target.value)}
                      placeholder="Buscar ciudad..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-9 text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {citySearch && (
                      <button onClick={() => setCitySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500">
                        <span className="material-icons-round text-sm">close</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Modalidad */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Modalidad</label>
                  <div className="flex flex-wrap gap-2">
                    {['Online', 'Presencial', 'Domicilio'].map(mode => (
                      <button
                        key={mode}
                        onClick={() => toggleModality(mode)}
                        className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                          selectedModality.includes(mode)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* ── Resultados ── */}
          <div className="lg:col-span-9 space-y-4">
            {/* Chips de filtros activos */}
            {hasActiveFilters && (
              <div className="flex flex-wrap gap-2">
                {selectedArea && (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold">
                    {selectedArea}
                    <button onClick={() => setSelectedArea('')}><span className="material-icons-round text-xs">close</span></button>
                  </span>
                )}
                {citySearch && (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold">
                    {citySearch}
                    <button onClick={() => setCitySearch('')}><span className="material-icons-round text-xs">close</span></button>
                  </span>
                )}
                {selectedModality.map(m => (
                  <span key={m} className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold">
                    {m}
                    <button onClick={() => toggleModality(m)}><span className="material-icons-round text-xs">close</span></button>
                  </span>
                ))}
              </div>
            )}

            {/* Cards de profesionales */}
            <div className="grid grid-cols-1 gap-4">
              {visibleDoctors.length > 0 ? visibleDoctors.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => navigate(`/patient/profile/${doc.id}`)}
                  className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group flex flex-col sm:flex-row gap-4 sm:gap-6 items-center cursor-pointer"
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <img
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover group-hover:scale-105 transition-transform duration-300"
                      src={doc.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(doc.name)}&background=0284c7&color=fff&size=200`}
                      onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(doc.name)}&background=0284c7&color=fff&size=200`; }}
                      alt={doc.name}
                    />
                    <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white p-1 rounded-lg border-2 border-white">
                      <span className="material-icons-round text-[10px]">verified</span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 text-center sm:text-left min-w-0">
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors truncate">{doc.name}</h3>
                    <p className="text-sm font-medium text-slate-500 mb-2">{doc.specialty}</p>
                    <div className="flex items-center justify-center sm:justify-start gap-1.5 mb-3">
                      <span className="material-icons-round text-blue-500 text-sm">location_on</span>
                      <span className="text-xs font-bold text-slate-500">{doc.city || 'Chile'}</span>
                    </div>
                    <div className="flex flex-wrap justify-center sm:justify-start gap-1.5">
                      {doc.modalities?.online && <span className="px-2.5 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-md">Online</span>}
                      {doc.modalities?.inPerson && <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md">Presencial</span>}
                      {doc.modalities?.home && <span className="px-2.5 py-1 bg-teal-50 text-teal-600 text-[10px] font-bold rounded-md">Domicilio</span>}
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="w-full sm:w-auto shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/patient/profile/${doc.id}`); }}
                      className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95">
                      Agendar Ahora
                    </button>
                  </div>
                </div>
              )) : (
                <div className="py-16 text-center bg-white rounded-2xl border border-slate-100">
                  <span className="material-icons-round text-slate-200 text-5xl mb-4 block">person_search</span>
                  <p className="text-slate-500 font-bold text-base mb-2">No hay especialistas que coincidan.</p>
                  <p className="text-sm text-slate-400 mb-6">Intenta cambiar los filtros de búsqueda</p>
                  <button onClick={clearFilters} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/20">
                    Ver todos
                  </button>
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
