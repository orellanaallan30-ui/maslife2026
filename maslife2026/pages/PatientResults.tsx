import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useClinic } from '../ClinicContext';
import { getAllPublicProfessionals } from '../supabaseService';
import { ProfessionalProfile } from '../types';
import logoAgenda from '../assets/logo-agenda.png';

// Normaliza texto para comparaciones sin acentos ni mayúsculas (ej: "Kinesiología" ≈ "kinesiologia").
const normalizeText = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const AREAS = [
  { value: '', label: 'Todas', icon: 'grid_view', grad: 'linear-gradient(135deg, #475569, #64748b)' },
  { value: 'Kinesiología', label: 'Kinesiología', icon: 'directions_run', grad: 'linear-gradient(135deg, #0284c7, #0ea5e9)' },
  { value: 'Psicología', label: 'Psicología', icon: 'psychology', grad: 'linear-gradient(135deg, #6366f1, #818cf8)' },
  { value: 'Nutrición', label: 'Nutrición', icon: 'restaurant', grad: 'linear-gradient(135deg, #059669, #10b981)' },
  { value: 'Fonoaudiología', label: 'Fonoaudiología', icon: 'record_voice_over', grad: 'linear-gradient(135deg, #0891b2, #22d3ee)' },
  { value: 'Terapia Ocupacional', label: 'T. Ocupacional', icon: 'accessibility_new', grad: 'linear-gradient(135deg, #d97706, #f59e0b)' },
  { value: 'Podología', label: 'Podología', icon: 'directions_walk', grad: 'linear-gradient(135deg, #db2777, #f472b6)' },
  { value: 'Técnico en Enfermería', label: 'TENS', icon: 'medical_services', grad: 'linear-gradient(135deg, #dc2626, #f87171)' },
  { value: 'Masoterapia', label: 'Masoterapia', icon: 'spa', grad: 'linear-gradient(135deg, #7c3aed, #a78bfa)' },
];

// Mapea el parámetro ?modalidad=online,presencial,domicilio a las etiquetas internas.
const MODALITY_MAP: Record<string, string> = {
  online: 'Online', presencial: 'Presencial', domicilio: 'Domicilio',
};

const PatientResults: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { professionals } = useClinic();
  // Mostrar inmediatamente los profesionales públicos del caché local mientras Supabase responde
  const [publicPros, setPublicPros] = useState<ProfessionalProfile[]>(() => professionals.filter(p => p.isPublic));
  const [loading, setLoading] = useState(true);
  // Estado inicial desde la URL → permite anuncios que abren el buscador ya filtrado
  // (ej: /patient/results?ciudad=ovalle&area=kinesiologia&modalidad=domicilio).
  const [citySearch, setCitySearch] = useState(() => searchParams.get('ciudad') || '');
  const [selectedArea, setSelectedArea] = useState(() => {
    const a = searchParams.get('area');
    if (!a) return '';
    const match = AREAS.find(x => x.value && normalizeText(x.value).includes(normalizeText(a)));
    return match ? match.value : '';
  });
  const [selectedModality, setSelectedModality] = useState<string[]>(() => {
    const m = searchParams.get('modalidad');
    if (!m) return [];
    return m.split(',').map(x => MODALITY_MAP[normalizeText(x)]).filter(Boolean);
  });
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    setLoading(true);
    getAllPublicProfessionals()
      .then(data => { if (data.length > 0) setPublicPros(data); })
      .catch(() => { /* mantener caché local */ })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sincroniza los filtros activos de vuelta a la URL (para compartir/retargeting).
  useEffect(() => {
    const next: Record<string, string> = {};
    if (citySearch.trim()) next.ciudad = citySearch.trim();
    if (selectedArea) next.area = normalizeText(selectedArea);
    if (selectedModality.length) next.modalidad = selectedModality.map(m => normalizeText(m)).join(',');
    setSearchParams(next, { replace: true });
  }, [citySearch, selectedArea, selectedModality]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleModality = (mode: string) => {
    setSelectedModality(prev =>
      prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]
    );
  };

  const visibleDoctors = publicPros.filter(p => {
    if (citySearch && !(p.city && normalizeText(p.city).includes(normalizeText(citySearch)))) return false;
    if (selectedArea && !(p.specialty && normalizeText(p.specialty).includes(normalizeText(selectedArea)))) return false;
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
    setVisibleCount(12);
  };

  const pagedDoctors = visibleDoctors.slice(0, visibleCount);

  const hasActiveFilters = citySearch || selectedArea || selectedModality.length > 0;

  return (
    <div className="w-full h-full bg-slate-50 overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 80px)' }}>
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6 lg:py-8">

        {/* Header con logo Agenda Online */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-4">
            <img src={logoAgenda} alt="Agenda Online ClinicaMaslife" className="h-10 w-auto object-contain" />
            <div>
              {/* ── RESPONSIVE: base=mobile  lg:=desktop ── */}
              <h2 className="text-lg lg:text-2xl font-extrabold text-slate-900 tracking-tight">Especialistas Disponibles</h2>
              <p className="text-sm font-medium text-slate-500">
                {loading && publicPros.length === 0 ? 'Cargando profesionales...' : `${visibleDoctors.length} profesionales encontrados`}
              </p>
            </div>
          </div>
          {/* Mobile filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="lg:hidden flex items-center gap-2 px-4 py-3 bg-white rounded-xl border border-slate-200 text-sm font-bold text-slate-700 shadow-sm active:scale-95 transition-all"
          >
            <span className="material-icons-round text-base">tune</span>
            Filtros
            {hasActiveFilters && <span className="w-2 h-2 bg-blue-600 rounded-full"></span>}
          </button>
        </div>

        {/* ── Selector de área — círculos horizontales ── */}
        <div className="mb-6">
          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-3">Selecciona un área</h3>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0" style={{ scrollbarWidth: 'none' }}>
            {AREAS.map(a => {
              const active = selectedArea === a.value;
              return (
                <button
                  key={a.value || 'todas'}
                  onClick={() => setSelectedArea(a.value)}
                  className="flex flex-col items-center gap-2 shrink-0 group focus:outline-none"
                  style={{ width: 76 }}
                >
                  <div
                    className="flex items-center justify-center rounded-full transition-all duration-300 group-active:scale-95"
                    style={{
                      width: 64,
                      height: 64,
                      background: active ? a.grad : '#f1f5f9',
                      boxShadow: active ? '0 8px 22px -6px rgba(2,132,199,.45)' : 'none',
                      border: active ? '2px solid white' : '2px solid transparent',
                      transform: active ? 'scale(1.06)' : 'scale(1)',
                    }}
                  >
                    <span className="material-icons-round" style={{ fontSize: 28, color: active ? '#fff' : '#64748b' }}>
                      {a.icon}
                    </span>
                  </div>
                  <span
                    className="text-[11px] font-bold text-center leading-tight"
                    style={{ color: active ? '#0284c7' : '#64748b' }}
                  >
                    {a.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-5">

          {/* ── Filtros ── */}
          <aside className={`lg:col-span-3 space-y-4 ${showFilters ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white p-5 lg:p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Filtros de Búsqueda</h3>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-[10px] font-bold text-blue-600 uppercase tracking-wider hover:underline">
                    Limpiar
                  </button>
                )}
              </div>

              <div className="space-y-5">
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

            {/* Skeleton mientras Supabase carga y no hay datos locales */}
            {loading && publicPros.length === 0 && (
              <div className="grid grid-cols-1 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col lg:flex-row gap-4 lg:gap-6 items-center animate-pulse">
                    <div className="w-16 h-16 lg:w-24 lg:h-24 rounded-2xl bg-slate-200 shrink-0" />
                    <div className="flex-1 w-full space-y-3">
                      <div className="h-4 bg-slate-200 rounded-lg w-1/2 mx-auto lg:mx-0" />
                      <div className="h-3 bg-slate-100 rounded-lg w-1/3 mx-auto lg:mx-0" />
                      <div className="flex gap-2 justify-center lg:justify-start">
                        <div className="h-5 w-16 bg-slate-100 rounded-md" />
                        <div className="h-5 w-20 bg-slate-100 rounded-md" />
                      </div>
                    </div>
                    <div className="w-full lg:w-32 h-10 bg-slate-200 rounded-xl shrink-0" />
                  </div>
                ))}
              </div>
            )}

            {/* Cards de profesionales */}
            <div className="grid grid-cols-1 gap-4">
              {visibleDoctors.length > 0 ? pagedDoctors.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => navigate(`/p/${doc.slug || doc.id}`)}
                  className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group flex flex-col lg:flex-row gap-4 lg:gap-6 items-center cursor-pointer"
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <img
                      className="w-16 h-16 lg:w-24 lg:h-24 rounded-2xl object-cover group-hover:scale-105 transition-transform duration-300"
                      src={doc.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(doc.name)}&background=0284c7&color=fff&size=200`}
                      onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(doc.name)}&background=0284c7&color=fff&size=200`; }}
                      alt={doc.name}
                    />
                    {doc.isVerified && (
                      <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white p-1 rounded-lg border-2 border-white">
                        <span className="material-icons-round text-[10px]">verified</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  {/* ── RESPONSIVE: info — base=mobile(center) lg:=desktop(left) ── */}
                  <div className="flex-1 text-center lg:text-left min-w-0">
                    <h3 className="text-base lg:text-lg font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors truncate">{doc.name}</h3>
                    <p className="text-sm font-medium text-slate-500 mb-2">{doc.specialty}</p>
                    <div className="flex items-center justify-center lg:justify-start gap-1.5 mb-3">
                      <span className="material-icons-round text-blue-500 text-sm">location_on</span>
                      <span className="text-xs font-bold text-slate-500">{doc.city || 'Chile'}</span>
                    </div>
                    <div className="flex flex-wrap justify-center lg:justify-start gap-1.5">
                      {doc.modalities?.online && <span className="px-2.5 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-md">Online</span>}
                      {doc.modalities?.inPerson && <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md">Presencial</span>}
                      {doc.modalities?.home && <span className="px-2.5 py-1 bg-teal-50 text-teal-600 text-[10px] font-bold rounded-md">Domicilio</span>}
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="w-full lg:w-auto shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/p/${doc.slug || doc.id}`); }}
                      className="w-full lg:w-auto px-6 py-3 bg-blue-600 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95">
                      Agendar Ahora
                    </button>
                  </div>
                </div>
              )) : !loading && (
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

            {/* Mostrar más */}
            {visibleCount < visibleDoctors.length && (
              <div className="flex justify-center mt-4">
                <button
                  onClick={() => setVisibleCount(c => c + 12)}
                  className="px-8 py-3 bg-white border border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl shadow-sm hover:bg-slate-50 active:scale-95 transition-all"
                >
                  Mostrar más ({visibleDoctors.length - visibleCount} restantes)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientResults;
