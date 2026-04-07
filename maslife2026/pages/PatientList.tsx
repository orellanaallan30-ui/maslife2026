import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Patient } from '../types';
import { useClinic } from '../ClinicContext';

const PatientList: React.FC = () => {
  const navigate = useNavigate();
  const { patients, setPatients: setContextPatients, loggedPro, logout, addPatient } = useClinic();
  const onLogout = () => logout(navigate, 'PROFESSIONAL');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterArchived, setFilterArchived] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPatient, setNewPatient] = useState<Partial<Patient>>({
    name: '',
    rut: '',
    email: '',
    phone: '',
    prevision: 'Fonasa',
    status: 'Evaluación'
  });

  const filteredPatients = patients.filter(p => {
    const matchesArchive = p.archived === filterArchived;
    const matchesSearch = 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.rut.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.email && p.email.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesArchive && matchesSearch;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatient.name || !newPatient.rut) return;

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

    // Simulación de notificación al administrador
    console.log("Notificando al administrador Central: Nuevo paciente registrado para base de datos global.");

    setIsModalOpen(false);
    setNewPatient({ name: '', rut: '', email: '', phone: '', prevision: 'Fonasa', status: 'Evaluación' });
  };

  return (
    <div className="flex-1 w-full overflow-hidden">
      <main className="flex-1 overflow-y-auto bg-slate-50 custom-scrollbar p-10">
        <div className="max-w-6xl mx-auto space-y-8">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Gestión de Pacientes</h1>
              <p className="text-sm text-slate-500 font-medium">Sincronización automática con Red Central AgendaMaslife</p>
            </div>
            <div className="flex gap-4">
              <div className="flex bg-white p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => setFilterArchived(false)}
                  className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${!filterArchived ? 'bg-teal-500 text-white' : 'text-slate-500'}`}
                >
                  ACTIVOS
                </button>
                <button
                  onClick={() => setFilterArchived(true)}
                  className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${filterArchived ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
                >
                  ARCHIVADOS
                </button>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="group bg-primary text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-[0_10px_30px_-10px_rgba(19,91,236,0.6)] border-b-4 border-blue-700 active:border-b-0 active:translate-y-1 transition-all flex items-center gap-3"
              >
                <span className="material-icons-round text-sm group-hover:rotate-12 transition-transform">person_add</span>
                NUEVO PACIENTE
              </button>
            </div>
          </header>

          <div className="bg-white rounded-[3rem] border border-slate-100 shadow-[0_48px_100px_-20px_rgba(19,91,236,0.1)] overflow-hidden flex flex-col">
            <div className="p-6 md:p-8 border-b border-slate-50 flex items-center gap-6 bg-slate-50/30 shrink-0">
              <div className="relative flex-1">
                <span className="material-icons absolute left-6 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input 
                  className="w-full pl-14 pr-6 py-4 md:py-5 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm font-bold focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-inner placeholder:text-slate-400"
                  placeholder="Buscar por nombre, RUT o email..." 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar w-full">
              <table className="w-full text-left whitespace-nowrap lg:whitespace-normal">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-[0.15em]">
                  <tr>
                    <th className="px-6 py-5">Paciente</th>
                    <th className="px-6 py-5">RUT / ID</th>
                    <th className="px-6 py-5">Contacto</th>
                    <th className="px-6 py-5 text-center">Estado Clínico</th>
                    <th className="px-6 py-5 text-right">Acciones</th>
                  </tr>
                </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPatients.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group border-b border-slate-100 last:border-0">
                    <td className="px-6 py-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-xl ${p.archived ? 'bg-slate-100 text-slate-500' : 'bg-primary/10 text-primary'} flex items-center justify-center font-bold text-sm uppercase shadow-sm shrink-0`}>
                          {p.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-950 truncate mb-0.5">{p.name}</p>
                          <p className="text-xs font-medium text-slate-500 truncate opacity-80">{p.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6 text-sm text-slate-700 font-bold tracking-tight">{p.rut}</td>
                    <td className="px-6 py-6">
                      <div className="text-xs font-semibold text-slate-600 flex flex-col gap-1.5 whitespace-normal">
                        {p.phone && <span className="flex items-center gap-2"><span className="material-icons-round text-sm opacity-60">phone</span> {p.phone}</span>}
                        {p.email && <span className="flex items-center gap-2"><span className="material-icons-round text-sm opacity-60">email</span> <span className="truncate max-w-[180px]">{p.email}</span></span>}
                        {!p.phone && !p.email && <span className="italic opacity-50 font-medium">Sin datos de contacto</span>}
                      </div>
                    </td>
                    <td className="px-6 py-6 text-center">
                      <select 
                        value={p.status || 'Evaluación'} 
                        onChange={(e) => {
                          const newStatus = e.target.value;
                          setContextPatients(prev => prev.map(pat => pat.id === p.id ? { ...pat, status: newStatus } : pat));
                        }}
                        className={`text-[10px] font-bold uppercase tracking-wider border-none px-4 py-2.5 rounded-xl cursor-pointer transition-colors shadow-inner focus:ring-2 focus:ring-primary/20 whitespace-nowrap outline-none ${
                          p.status === 'De alta' ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' :
                          p.status === 'En sesiones' ? 'bg-primary/10 text-primary hover:bg-primary/20' :
                          'bg-amber-50 text-amber-600 hover:bg-amber-100'
                        }`}
                      >
                        <option value="Evaluación">Evaluación</option>
                        <option value="En sesiones">En sesiones</option>
                        <option value="De alta">De alta</option>
                      </select>
                    </td>
                    <td className="px-6 py-6 text-right">
                      <div className="flex items-center justify-end gap-3 transition-all">
                        <button onClick={() => navigate(`/pro/record/${p.id}`)} className="h-11 px-5 flex items-center justify-center gap-2 rounded-xl bg-slate-100 text-slate-600 border-b-4 border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-800 active:border-b-0 active:translate-y-1 transition-all font-black text-[10px] uppercase tracking-widest shadow-sm shrink-0" title="Abrir Ficha Clínica">
                          <span className="material-icons-round text-lg">description</span>
                          <span className="hidden xl:inline">Fichas</span>
                        </button>
                        {!p.archived && (
                          <>
                            {p.phone && (
                              <>
                                <button
                                  onClick={() => {
                                    const msgText = `Hola ${p.name}, le saluda el/la profesional ${loggedPro?.name || ''} de Maslife. Por este medio le recuerdo y confirmo su próxima sesión. Quedo atento/a.`;
                                    const msg = encodeURIComponent(msgText);
                                    window.open(`https://wa.me/${p.phone.replace(/\D/g, '')}?text=${msg}`, '_blank');
                                  }}
                                  className="w-11 h-11 flex items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border-b-4 border-emerald-200 hover:bg-emerald-500 hover:text-white hover:border-emerald-600 active:border-b-0 active:translate-y-1 transition-all shadow-sm shrink-0"
                                  title="Enviar WhatsApp (Recordatorio)"
                                >
                                  <span className="material-icons-round text-lg">whatsapp</span>
                                </button>
                                <button
                                  onClick={() => window.open(`https://wa.me/${p.phone.replace(/\D/g, '')}`, '_blank')}
                                  className="w-11 h-11 flex items-center justify-center rounded-xl bg-teal-50 text-teal-600 border-b-4 border-teal-200 hover:bg-teal-500 hover:text-white hover:border-teal-600 active:border-b-0 active:translate-y-1 transition-all shadow-sm shrink-0"
                                  title="Videollamada por WhatsApp"
                                >
                                  <span className="material-icons-round text-lg">video_camera_front</span>
                                </button>
                              </>
                            )}
                            <button 
                              onClick={() => {
                                if (window.confirm(`¿Está seguro/a de que desea eliminar la ficha clínica de ${p.name} permanentemente?`)) {
                                  setContextPatients(prev => prev.filter(pat => pat.id !== p.id));
                                }
                              }}
                              className="w-11 h-11 flex items-center justify-center rounded-xl bg-rose-50 text-rose-500 border-b-4 border-rose-200 hover:bg-rose-500 hover:text-white hover:border-rose-600 active:border-b-0 active:translate-y-1 transition-all shadow-sm shrink-0 ml-1" 
                              title="Eliminar Paciente"
                            >
                              <span className="material-icons-round text-lg">delete_sweep</span>
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
        </div>

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
