import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Patient } from '../types';
import { useClinic } from '../ClinicContext';
import { softDeletePatient } from '../supabaseService';

type ViewMode = 'activos' | 'archivados' | 'fichas';

function daysUntilPermanentDeletion(deletedAt: string): number {
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(90 - elapsed));
}

const PatientList: React.FC = () => {
  const navigate = useNavigate();
  const { patients, setPatients: setContextPatients, loggedPro, logout, addPatient } = useClinic();
  const onLogout = () => logout(navigate, 'PROFESSIONAL');

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('activos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [newPatient, setNewPatient] = useState<Partial<Patient>>({
    name: '',
    rut: '',
    email: '',
    phone: '',
    prevision: 'Fonasa',
    status: 'Evaluación'
  });

  const proPatients = patients.filter(p =>
    !p.professionalId || p.professionalId === loggedPro?.id
  );

  const filteredPatients = proPatients.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      p.rut.toLowerCase().includes(q) ||
      (p.email && p.email.toLowerCase().includes(q));

    if (viewMode === 'activos') return !p.archived && !p.deletedAt && matchesSearch;
    if (viewMode === 'archivados') return p.archived && !p.deletedAt && matchesSearch;
    // fichas: all (active + archived + soft-deleted) — already filtered by 90-day cutoff in getPatients
    return matchesSearch;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatient.name || !newPatient.rut) return;

    // Prevención de RUT duplicado (CENS RCE)
    const normalizedRut = newPatient.rut.trim().replace(/\s/g, '').toLowerCase();
    const duplicate = patients.find(
      p => !p.deletedAt && p.rut.trim().replace(/\s/g, '').toLowerCase() === normalizedRut
    );
    if (duplicate) {
      alert(`Ya existe un paciente con RUT ${newPatient.rut}: ${duplicate.name}`);
      return;
    }

    const patientToAdd: Patient = {
      ...newPatient,
      id: Math.random().toString(36).substr(2, 9),
      age: 0,
      gender: 'No especificado',
      archived: false,
      attachments: [],
      customFields: [],
      allergies: [],
      medicalHistory: '',
      birthDate: '',
      address: ''
    } as Patient;

    addPatient(patientToAdd);
    setIsModalOpen(false);
    setNewPatient({ name: '', rut: '', email: '', phone: '', prevision: 'Fonasa', status: 'Evaluación' });
  };

  const handleSoftDelete = async (id: string) => {
    const now = new Date().toISOString();
    try {
      await softDeletePatient(id);
      setContextPatients(prev => prev.map(p => p.id === id ? { ...p, deletedAt: now } : p));
    } catch {
      // silent — local state still shows deletion pending
      setContextPatients(prev => prev.map(p => p.id === id ? { ...p, deletedAt: now } : p));
    }
    setDeleteConfirm(null);
  };

  const handleRestorePatient = async (id: string) => {
    try {
      const { supabase } = await import('../supabaseClient');
      await supabase.from('patients').update({ deleted_at: null }).eq('id', id);
    } catch { /* ignore */ }
    setContextPatients(prev => prev.map(p => p.id === id ? { ...p, deletedAt: undefined } : p));
  };

  const deletingPatient = patients.find(p => p.id === deleteConfirm);

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full">
      <main className="flex-1 min-h-0 overflow-y-auto bg-slate-50 custom-scrollbar p-4 sm:p-6 lg:p-10 pb-24 md:pb-10">
        <div className="max-w-6xl mx-auto space-y-5 sm:space-y-8">
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Gestión de Pacientes</h1>
              <p className="text-xs sm:text-sm font-medium text-slate-500">
                {viewMode === 'fichas'
                  ? `${filteredPatients.length} fichas clínicas`
                  : `${filteredPatients.length} pacientes ${viewMode}`}
              </p>
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
              {/* Tab switcher */}
              <div className="flex bg-white p-1 rounded-xl border border-slate-200 flex-1 sm:flex-initial">
                <button
                  onClick={() => setViewMode('activos')}
                  className={`flex-1 sm:flex-initial px-3 sm:px-5 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${viewMode === 'activos' ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-500'}`}
                >
                  ACTIVOS
                </button>
                <button
                  onClick={() => setViewMode('archivados')}
                  className={`flex-1 sm:flex-initial px-3 sm:px-5 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${viewMode === 'archivados' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500'}`}
                >
                  ARCHIVADOS
                </button>
                <button
                  onClick={() => setViewMode('fichas')}
                  className={`flex-1 sm:flex-initial px-3 sm:px-5 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${viewMode === 'fichas' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}
                >
                  FICHAS
                </button>
              </div>
              {viewMode !== 'fichas' && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="group bg-blue-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2 shrink-0"
                >
                  <span className="material-icons-round text-sm">person_add</span>
                  <span className="hidden sm:inline">Nuevo</span>
                </button>
              )}
            </div>
          </header>

          {/* Buscador */}
          <div className="relative">
            <span className="material-icons-round absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
            <input
              className="w-full pl-11 pr-4 py-3 sm:py-4 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400"
              placeholder={viewMode === 'fichas' ? 'Buscar ficha por nombre o RUT...' : 'Buscar por nombre, RUT o email...'}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500">
                <span className="material-icons-round text-sm">close</span>
              </button>
            )}
          </div>

          {/* ── FICHAS view ── */}
          {viewMode === 'fichas' && (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4">Paciente</th>
                        <th className="px-6 py-4">RUT</th>
                        <th className="px-6 py-4">Última visita</th>
                        <th className="px-6 py-4 text-center">Estado</th>
                        <th className="px-6 py-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPatients.map((p) => {
                        const daysLeft = p.deletedAt ? daysUntilPermanentDeletion(p.deletedAt) : null;
                        return (
                          <tr key={p.id} className={`hover:bg-slate-50/50 transition-colors ${p.deletedAt ? 'opacity-60' : ''}`}>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl ${p.deletedAt ? 'bg-rose-50 text-rose-400' : 'bg-indigo-50 text-indigo-600'} flex items-center justify-center font-bold text-sm uppercase shrink-0`}>
                                  {p.name.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-slate-900 truncate">{p.name}</p>
                                  {daysLeft !== null && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full mt-0.5">
                                      <span className="material-icons-round text-[10px]">schedule</span>
                                      Eliminación en {daysLeft}d
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600 font-semibold">{p.rut}</td>
                            <td className="px-6 py-4 text-sm text-slate-500">
                              {p.lastVisit ? new Date(p.lastVisit).toLocaleDateString('es-CL') : <span className="italic text-slate-300">Sin visitas</span>}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg ${
                                p.archived ? 'bg-slate-100 text-slate-500' :
                                p.deletedAt ? 'bg-rose-50 text-rose-500' :
                                'bg-indigo-50 text-indigo-600'
                              }`}>
                                {p.deletedAt ? 'Pendiente eliminación' : p.archived ? 'Archivado' : 'Activo'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => navigate(`/pro/record/${p.id}`)}
                                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all"
                                  title="Ver Ficha Clínica"
                                >
                                  <span className="material-icons-round text-base">description</span>
                                </button>
                                {p.deletedAt ? (
                                  <button
                                    onClick={() => handleRestorePatient(p.id)}
                                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all"
                                    title="Restaurar paciente"
                                  >
                                    <span className="material-icons-round text-base">restore</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirm(p.id)}
                                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white transition-all"
                                    title="Eliminar ficha"
                                  >
                                    <span className="material-icons-round text-base">delete</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards — fichas */}
              <div className="lg:hidden space-y-3">
                {filteredPatients.map((p) => {
                  const daysLeft = p.deletedAt ? daysUntilPermanentDeletion(p.deletedAt) : null;
                  return (
                    <div key={p.id} className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3 ${p.deletedAt ? 'opacity-70' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-xl ${p.deletedAt ? 'bg-rose-50 text-rose-400' : 'bg-indigo-50 text-indigo-600'} flex items-center justify-center font-bold text-sm uppercase shrink-0`}>
                          {p.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{p.name}</p>
                          <p className="text-xs text-slate-400">{p.rut}</p>
                        </div>
                        {daysLeft !== null ? (
                          <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full shrink-0">
                            {daysLeft}d restantes
                          </span>
                        ) : (
                          <span className={`text-[9px] font-bold px-2 py-1 rounded-full shrink-0 ${p.archived ? 'bg-slate-100 text-slate-500' : 'bg-indigo-50 text-indigo-600'}`}>
                            {p.archived ? 'Archivado' : 'Activo'}
                          </span>
                        )}
                      </div>

                      {p.lastVisit && (
                        <p className="text-xs text-slate-400 flex items-center gap-1.5">
                          <span className="material-icons-round text-xs">event</span>
                          Última visita: {new Date(p.lastVisit).toLocaleDateString('es-CL')}
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                        <button
                          onClick={() => navigate(`/pro/record/${p.id}`)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all"
                        >
                          <span className="material-icons-round text-sm">description</span>
                          Ver Ficha
                        </button>
                        {p.deletedAt ? (
                          <button
                            onClick={() => handleRestorePatient(p.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-50 text-emerald-600 text-xs font-bold hover:bg-emerald-500 hover:text-white transition-all"
                          >
                            <span className="material-icons-round text-sm">restore</span>
                            Restaurar
                          </button>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(p.id)}
                            className="w-10 h-10 flex items-center justify-center rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white transition-all shrink-0"
                          >
                            <span className="material-icons-round text-sm">delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── ACTIVOS / ARCHIVADOS views ── */}
          {viewMode !== 'fichas' && (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4">Paciente</th>
                        <th className="px-6 py-4">RUT</th>
                        <th className="px-6 py-4">Contacto</th>
                        <th className="px-6 py-4 text-center">Estado</th>
                        <th className="px-6 py-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPatients.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl ${p.archived ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600'} flex items-center justify-center font-bold text-sm uppercase shrink-0`}>
                                {p.name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-900 truncate">{p.name}</p>
                                <p className="text-xs text-slate-400 truncate">{p.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 font-semibold">{p.rut}</td>
                          <td className="px-6 py-4">
                            <div className="text-xs text-slate-500 flex flex-col gap-1">
                              {p.phone && <span className="flex items-center gap-1.5"><span className="material-icons-round text-xs opacity-50">phone</span>{p.phone}</span>}
                              {p.email && <span className="flex items-center gap-1.5"><span className="material-icons-round text-xs opacity-50">email</span><span className="truncate max-w-[160px]">{p.email}</span></span>}
                              {!p.phone && !p.email && <span className="italic opacity-50">Sin contacto</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <select
                              value={p.status || 'Evaluación'}
                              onChange={(e) => {
                                const newStatus = e.target.value;
                                setContextPatients(prev => prev.map(pat => pat.id === p.id ? { ...pat, status: newStatus } : pat));
                              }}
                              className={`text-[10px] font-bold uppercase tracking-wider border-none px-3 py-2 rounded-lg cursor-pointer transition-colors outline-none ${
                                p.status === 'De alta' ? 'bg-emerald-50 text-emerald-600' :
                                p.status === 'En sesiones' ? 'bg-blue-50 text-blue-600' :
                                'bg-amber-50 text-amber-600'
                              }`}
                            >
                              <option value="Evaluación">Evaluación</option>
                              <option value="En sesiones">En sesiones</option>
                              <option value="De alta">De alta</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={(e) => { e.stopPropagation(); navigate(`/pro/record/${p.id}`); }} className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-800 hover:text-white transition-all" title="Ficha Clínica">
                                <span className="material-icons-round text-base">description</span>
                              </button>
                              {!p.archived && (
                                <>
                                  {p.phone && (
                                    <>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const msgText = `Hola ${p.name}, le saluda el/la profesional ${loggedPro?.name || ''} de Maslife. Le recuerdo y confirmo su próxima sesión. Quedo atento/a.`;
                                          window.open(`https://wa.me/${p.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msgText)}`, '_blank');
                                        }}
                                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all"
                                        title="WhatsApp Recordatorio"
                                      >
                                        <span className="material-icons-round text-base">chat</span>
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${p.phone.replace(/\D/g, '')}`, '_blank'); }}
                                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-500 hover:text-white transition-all"
                                        title="Videollamada"
                                      >
                                        <span className="material-icons-round text-base">video_camera_front</span>
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(p.id); }}
                                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white transition-all"
                                    title="Eliminar"
                                  >
                                    <span className="material-icons-round text-base">delete</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="lg:hidden space-y-3">
                {filteredPatients.map((p) => (
                  <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl ${p.archived ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600'} flex items-center justify-center font-bold text-sm uppercase shrink-0`}>
                        {p.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.rut}</p>
                      </div>
                      <select
                        value={p.status || 'Evaluación'}
                        onChange={(e) => {
                          const newStatus = e.target.value;
                          setContextPatients(prev => prev.map(pat => pat.id === p.id ? { ...pat, status: newStatus } : pat));
                        }}
                        className={`text-[9px] font-bold uppercase tracking-wider border-none px-2.5 py-1.5 rounded-lg cursor-pointer outline-none shrink-0 ${
                          p.status === 'De alta' ? 'bg-emerald-50 text-emerald-600' :
                          p.status === 'En sesiones' ? 'bg-blue-50 text-blue-600' :
                          'bg-amber-50 text-amber-600'
                        }`}
                      >
                        <option value="Evaluación">Evaluación</option>
                        <option value="En sesiones">En sesiones</option>
                        <option value="De alta">De alta</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {p.phone && <span className="flex items-center gap-1"><span className="material-icons-round text-xs opacity-50">phone</span>{p.phone}</span>}
                      {p.email && <span className="flex items-center gap-1"><span className="material-icons-round text-xs opacity-50">email</span>{p.email}</span>}
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                      <button onClick={() => navigate(`/pro/record/${p.id}`)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-800 hover:text-white transition-all">
                        <span className="material-icons-round text-sm">description</span>
                        Ficha
                      </button>
                      {!p.archived && p.phone && (
                        <button
                          onClick={() => {
                            const msgText = `Hola ${p.name}, le saluda ${loggedPro?.name || ''} de Maslife. Le recuerdo su próxima sesión. Quedo atento/a.`;
                            window.open(`https://wa.me/${p.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msgText)}`, '_blank');
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-50 text-emerald-600 text-xs font-bold hover:bg-emerald-500 hover:text-white transition-all"
                        >
                          <span className="material-icons-round text-sm">chat</span>
                          WhatsApp
                        </button>
                      )}
                      {!p.archived && p.phone && (
                        <button
                          onClick={() => window.open(`https://wa.me/${p.phone.replace(/\D/g, '')}`, '_blank')}
                          className="w-10 h-10 flex items-center justify-center rounded-xl bg-teal-50 text-teal-600 hover:bg-teal-500 hover:text-white transition-all shrink-0"
                        >
                          <span className="material-icons-round text-sm">video_camera_front</span>
                        </button>
                      )}
                      {!p.archived && (
                        <button
                          onClick={() => setDeleteConfirm(p.id)}
                          className="w-10 h-10 flex items-center justify-center rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white transition-all shrink-0"
                        >
                          <span className="material-icons-round text-sm">delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {filteredPatients.length === 0 && (
            <div className="py-16 text-center bg-white rounded-2xl border border-slate-100">
              <span className="material-icons-round text-slate-200 text-5xl mb-4 block">
                {viewMode === 'fichas' ? 'folder_open' : 'person_search'}
              </span>
              <p className="text-slate-500 font-bold text-base mb-2">
                {viewMode === 'fichas' ? 'No hay fichas clínicas.' : `No hay pacientes ${viewMode}.`}
              </p>
              <p className="text-sm text-slate-400">
                {searchQuery ? 'Intenta cambiar la búsqueda' : viewMode === 'fichas' ? 'Las fichas aparecerán aquí' : 'Agrega tu primer paciente'}
              </p>
            </div>
          )}
        </div>

        {/* Modal de confirmación de eliminación */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-6">
            <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="material-icons-round text-rose-500 text-2xl">warning</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  {viewMode === 'fichas' ? 'Marcar para eliminación' : 'Eliminar paciente'}
                </h3>
                <p className="text-sm text-slate-500">
                  {viewMode === 'fichas'
                    ? <>La ficha de <strong>{deletingPatient?.name}</strong> quedará disponible 90 días más antes de eliminarse definitivamente. Puedes restaurarla desde esta misma vista.</>
                    : <>¿Estás seguro? Esta acción eliminará la ficha de <strong>{deletingPatient?.name}</strong> permanentemente.</>}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (viewMode === 'fichas') {
                      handleSoftDelete(deleteConfirm);
                    } else {
                      setContextPatients(prev => prev.filter(pat => pat.id !== deleteConfirm));
                      setDeleteConfirm(null);
                    }
                  }}
                  className="flex-1 py-3 bg-rose-500 text-white rounded-xl font-bold text-sm hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
                >
                  {viewMode === 'fichas' ? 'Eliminar ficha' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6 overflow-y-auto">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 md:p-10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] border border-slate-100 animate-in zoom-in-95 duration-300">
              <div className="flex justify-between items-start mb-8">
                <div>
                   <h3 className="text-2xl font-black text-slate-900 tracking-tight">Nuevo Paciente</h3>
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Sincronización de Base de Datos</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="w-12 h-12 bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-2xl flex items-center justify-center transition-all active:scale-95">
                  <span className="material-icons-round">close</span>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Nombre Completo</label>
                    <input
                      required
                      type="text"
                      value={newPatient.name}
                      onChange={e => setNewPatient({ ...newPatient, name: e.target.value })}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-slate-800 focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner"
                      placeholder="Ej: Juan Pérez Galdames"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">RUT / ID</label>
                    <input
                      required
                      type="text"
                      value={newPatient.rut}
                      onChange={e => setNewPatient({ ...newPatient, rut: e.target.value })}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-slate-800 focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner"
                      placeholder="12.345.678-9"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Previsión</label>
                    <select
                      value={newPatient.prevision}
                      onChange={e => setNewPatient({ ...newPatient, prevision: e.target.value })}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-slate-800 focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner"
                    >
                      <option value="Fonasa">Fonasa</option>
                      <option value="Isapre">Isapre</option>
                      <option value="Particular">Particular</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Correo Electrónico</label>
                    <input
                      type="email"
                      value={newPatient.email}
                      onChange={e => setNewPatient({ ...newPatient, email: e.target.value })}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-slate-800 focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner"
                      placeholder="juan@email.com"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Teléfono</label>
                    <input
                      type="tel"
                      value={newPatient.phone}
                      onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-slate-800 focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner"
                      placeholder="+56 9 ..."
                    />
                  </div>
                </div>

                <div className="pt-6 flex flex-col sm:flex-row gap-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="w-full sm:w-auto px-8 py-5 bg-slate-100 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 active:scale-95 transition-all hidden sm:block">Cancelar</button>
                  <button type="submit" className="w-full sm:flex-1 py-5 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-[0_10px_30px_-10px_rgba(19,91,236,0.6)] border-b-4 border-blue-700 active:border-b-0 active:translate-y-1 transition-all">Crear Paciente Central</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default PatientList;
