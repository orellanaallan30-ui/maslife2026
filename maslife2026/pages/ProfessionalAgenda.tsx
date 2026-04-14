import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Appointment, Patient } from '../types';
import { useClinic } from '../ClinicContext';

const ProfessionalAgenda: React.FC = () => {
   const navigate = useNavigate();
   const { appointments, patients, addAppointment, updateAppointment, deleteAppointment: onRemoveApp, setPatients: setContextPatients, loggedPro, logout } = useClinic();

   const onAddPatient = (p: Patient) => setContextPatients(prev => [...prev, p]);
   const onLogout = () => logout(navigate, 'PROFESSIONAL');

   const [viewMode, setViewMode] = useState<'day' | 'week' | 'year'>('day');
   const [currentDate, setCurrentDate] = useState(new Date());
   const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
   const [activeTab, setActiveTab] = useState<'existing' | 'new' | 'block'>('existing');
   const [selectedSlot, setSelectedSlot] = useState<{ time: string, date: string } | null>(null);
   const [editingApp, setEditingApp] = useState<Appointment | null>(null);
   const [searchQuery, setSearchQuery] = useState('');
   const [newPatientForm, setNewPatientForm] = useState({ name: '', rut: '', phone: '' });
   const [blockNote, setBlockNote] = useState('');
   const [blockDuration, setBlockDuration] = useState(60);
   const [selectedColor, setSelectedColor] = useState('bg-primary');

   const chileanHolidays = useMemo(() => {
      const year = currentDate.getFullYear();
      
      // Helper para fechas móviles (Viernes Santo)
      // 2024: 03-29, 2025: 04-18, 2026: 04-03, 2027: 03-26, 2028: 04-14, 2029: 03-30, 2030: 04-19
      const goodFridayMap: Record<number, string> = {
         2024: '03-29', 2025: '04-18', 2026: '04-03', 2027: '03-26', 2028: '04-14', 2029: '03-30', 2030: '04-19'
      };
      const goodFriday = goodFridayMap[year] || '04-03';
      const holySaturday = goodFriday.replace(/(\d+)$/, (m) => String(parseInt(m) + 1).padStart(2, '0'));

      return [
         { date: `${year}-01-01`, name: 'Año Nuevo' },
         { date: `${year}-${goodFriday}`, name: 'Viernes Santo' },
         { date: `${year}-${holySaturday}`, name: 'Sábado Santo' },
         { date: `${year}-05-01`, name: 'Día del Trabajo' },
         { date: `${year}-05-21`, name: 'Glorias Navales' },
         { date: `${year}-06-29`, name: 'San Pedro y San Pablo' },
         { date: `${year}-07-16`, name: 'Virgen del Carmen' },
         { date: `${year}-08-15`, name: 'Asunción de la Virgen' },
         { date: `${year}-09-18`, name: 'Fiestas Patrias' },
         { date: `${year}-09-19`, name: 'Glorias del Ejército' },
         { date: `${year}-10-12`, name: 'Encuentro de Dos Mundos' },
         { date: `${year}-10-31`, name: 'Iglesias Evangélicas' },
         { date: `${year}-11-01`, name: 'Todos los Santos' },
         { date: `${year}-12-08`, name: 'Inmaculada Concepción' },
         { date: `${year}-12-25`, name: 'Navidad' },
      ];
   }, [currentDate]);

   const colors = [
      { name: 'Azul Maslife', class: 'bg-primary' },
      { name: 'Esmeralda', class: 'bg-emerald-500' },
      { name: 'Índigo', class: 'bg-indigo-500' },
      { name: 'Rosa', class: 'bg-rose-500' },
      { name: 'Ambar', class: 'bg-amber-500' },
      { name: 'Slate', class: 'bg-slate-700' }
   ];

   const workingHours = loggedPro?.workingHours || { start: "08:00", end: "20:00" };
   const startHour = parseInt(workingHours.start.split(':')[0]);
   const endHour = parseInt(workingHours.end.split(':')[0]);
   const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => `${String(startHour + i).padStart(2, '0')}:00`);

   const formatDate = (date: Date) => date.toISOString().split('T')[0];

   const weekDays = useMemo(() => {
      const startOfWeek = new Date(currentDate);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      return Array.from({ length: 7 }, (_, i) => {
         const d = new Date(startOfWeek);
         d.setDate(startOfWeek.getDate() + i);
         return d;
      });
   }, [currentDate]);

   const handleSlotClick = (time: string, date: string) => {
      setSelectedSlot({ time, date });
      setNewPatientForm({ name: '', rut: '', phone: '' });
      setSelectedColor('bg-primary');
      setBlockNote('');
      setActiveTab('existing');
      setIsCreateModalOpen(true);
   };

   const handleAppClick = (app: Appointment) => {
      setEditingApp(app);
      setSelectedColor(app.color || 'bg-primary'); // Set selected color for editing
      setIsEditModalOpen(true);
   };

   const handleAddAppointment = (patient: Partial<Patient> | null, isBlock: boolean = false) => {
      if (!selectedSlot) return;
      const newApp: Appointment = {
         id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9),
         patientId: patient?.id,
         patientName: isBlock ? (blockNote || 'Bloqueo Administrativo') : (patient?.name || 'Nuevo Paciente'),
         patientPhone: patient?.phone,
         doctorName: loggedPro?.name || '',
         specialty: loggedPro?.specialty || '',
         serviceName: isBlock ? 'Bloqueo' : (loggedPro?.services[0]?.name || 'Consulta'),
         date: selectedSlot.date,
         time: selectedSlot.time,
         duration: isBlock ? blockDuration : 60,
         type: isBlock ? 'Personal' : 'Presencial',
         status: isBlock ? 'Bloqueado' : 'Confirmado',
         price: isBlock ? 0 : (loggedPro?.services[0]?.price || 0),
         paymentStatus: isBlock ? 'Pagado' : 'Pendiente',
         category: isBlock ? 'Personal' : 'Medical',
         color: isBlock ? 'bg-slate-800' : selectedColor,
         professionalId: loggedPro?.id,
         bookingSource: 'presencial'
      };
      addAppointment(newApp);
      setIsCreateModalOpen(false);
      setSelectedSlot(null);
   };

   const handleStatusChange = (newStatus: Appointment['status']) => {
      if (!editingApp) return;
      const updatedApp = { ...editingApp, status: newStatus };
      setEditingApp(updatedApp);
      updateAppointment(updatedApp);
   };

   const handleColorChange = (newColor: string) => {
      if (!editingApp) return;
      const updatedApp = { ...editingApp, color: newColor };
      setEditingApp(updatedApp);
      updateAppointment(updatedApp);
      setSelectedColor(newColor);
   };

   const getStatusStyles = (status: Appointment['status'], appColor?: string) => {
      if (status === 'Bloqueado') {
         return {
            bg: 'bg-slate-800',
            border: 'border-slate-900',
            text: 'text-white',
            iconBg: 'bg-white/20',
            icon: 'block'
         };
      }

      const baseColor = appColor || 'bg-primary';

      // Mapping for reliable Tailwind classes
      const colorMap: Record<string, { bg: string, border: string, text: string }> = {
         'bg-primary': { bg: 'bg-primary/10', border: 'border-primary/20', text: 'text-primary font-bold' },
         'bg-emerald-500': { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-700 font-bold' },
         'bg-indigo-500': { bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-700 font-bold' },
         'bg-rose-500': { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-700 font-bold' },
         'bg-amber-500': { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-700 font-bold' },
         'bg-slate-700': { bg: 'bg-slate-700/10', border: 'border-slate-700/20', text: 'text-slate-700 font-bold' },
      };

      const styles = colorMap[baseColor] || colorMap['bg-primary'];

      return {
         ...styles,
         iconBg: baseColor,
         icon: status === 'Confirmado' ? 'check_circle' :
            status === 'Llegado' ? 'hail' :
               status === 'En Sesión' ? 'psychology' :
                  status === 'Finalizado' ? 'task_alt' :
                     status === 'Cancelado' ? 'cancel' :
                        'help_outline'
      };
   };

   const deleteAppointment = () => {
      if (!editingApp) return;
      if (window.confirm('¿Confirmas que deseas eliminar esta cita o bloqueo? El horario se habilitará.')) {
         onRemoveApp(editingApp.id);
         setIsEditModalOpen(false);
         setEditingApp(null);
      }
   };

   const monthName = currentDate.toLocaleDateString('es-ES', { month: 'long' });
   const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

   return (
      <div className="flex-1 w-full h-screen bg-[#f8fafc] overflow-hidden">
         <main className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12">
            <div className="max-w-7xl mx-auto space-y-10">
                <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                   <div>
                      <p className="text-[12px] font-black text-primary uppercase tracking-[0.3em] mb-2">{viewMode === 'year' ? 'Calendario Anual' : `${capitalizedMonth} ${currentDate.getFullYear()}`}</p>
                      <h1 className="text-4xl font-black text-black tracking-tight flex items-center gap-3">
                         {viewMode === 'day' ? currentDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' }) : viewMode === 'week' ? `Semana del ${weekDays[0].getDate()}` : `${currentDate.getFullYear()}`}
                      </h1>
                   </div>
                   <div className="flex flex-wrap items-center gap-4">
                      <div className="bg-slate-50/80 p-2 rounded-2xl shadow-inner border border-slate-200 flex gap-2">
                         <button onClick={() => setViewMode('day')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'day' ? 'bg-white text-primary shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>Día</button>
                         <button onClick={() => setViewMode('week')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'week' ? 'bg-white text-primary shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>Semana</button>
                         <button onClick={() => setViewMode('year')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'year' ? 'bg-white text-primary shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>Año</button>
                      </div>
                      <div className="flex items-center gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                         <button onClick={() => { 
                           const d = new Date(currentDate); 
                           if (viewMode === 'year') d.setFullYear(d.getFullYear() - 1);
                           else d.setDate(d.getDate() - (viewMode === 'day' ? 1 : 7)); 
                           setCurrentDate(d); 
                         }} className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition-all active:scale-95"><span className="material-icons-round text-xl">chevron_left</span></button>
                         <button onClick={() => setCurrentDate(new Date())} className="px-6 text-[10px] font-black uppercase text-slate-500 hover:text-primary transition-all">Hoy</button>
                         <button onClick={() => { 
                           const d = new Date(currentDate); 
                           if (viewMode === 'year') d.setFullYear(d.getFullYear() + 1);
                           else d.setDate(d.getDate() + (viewMode === 'day' ? 1 : 7)); 
                           setCurrentDate(d); 
                         }} className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition-all active:scale-95"><span className="material-icons-round text-xl">chevron_right</span></button>
                      </div>
                   </div>
                </header>

               <div className="bg-white rounded-[3rem] shadow-[0_48px_100px_-20px_rgba(19,91,236,0.1)] border border-slate-100 overflow-hidden">
                  {viewMode === 'day' ? (
                     <div className="grid grid-cols-1 divide-y-2 divide-slate-100">
                        {hours.map(hour => {
                           const appsInSlot = appointments.filter(a => a.time === hour && a.date === formatDate(currentDate));
                           return (
                               <div key={hour} className="flex min-h-[70px] group">
                                  <div className="w-24 shrink-0 flex items-center justify-center border-r-2 border-slate-100 bg-slate-50/50">
                                     <span className="text-sm font-bold text-slate-900 uppercase">{hour}</span>
                                  </div>
                                  <div className="flex-1 p-2 flex flex-col gap-1.5">
                                    {appsInSlot.length > 0 ? (
                                       appsInSlot.map(app => {
                                          const styles = getStatusStyles(app.status, app.color);
                                          return (
                                             <div key={app.id} onClick={() => handleAppClick(app)} className={`flex-1 rounded-2xl p-5 flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01] shadow-sm border-2 ${styles.bg} ${styles.border} ${styles.text}`}>
                                                <div className="flex items-center gap-3">
                                                   <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-base shadow-md ${styles.iconBg} text-white`}>
                                                       <span className="material-icons-round text-lg">{styles.icon}</span>
                                                    </div>
                                                    <div>
                                                       <p className={`font-black text-base tracking-tight mb-0 ${app.status === 'Bloqueado' ? 'text-white' : 'text-slate-900'}`}>{app.patientName}</p>
                                                       <p className={`text-[10px] font-black uppercase tracking-widest ${app.status === 'Bloqueado' ? 'text-white/70' : 'opacity-70'}`}>{app.serviceName} • {app.status}</p>
                                                    </div>
                                                </div>
                                                <span className="material-icons-round text-2xl opacity-30">more_vert</span>
                                             </div>
                                          );
                                       })
                                    ) : (
                                       <button onClick={() => handleSlotClick(hour, formatDate(currentDate))} className="flex-1 rounded-2xl border-2 border-dashed border-slate-200 hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-3 text-slate-400 hover:text-primary group active:scale-[0.98]">
                                          <span className="material-icons-round text-2xl group-hover:scale-110 transition-transform">add_circle_outline</span>
                                          <span className="text-[12px] font-black uppercase tracking-widest">Disponible</span>
                                       </button>
                                    )}
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  ) : viewMode === 'week' ? (
                     <div className="flex flex-col overflow-x-auto min-w-[800px]">
                        {/* Encabezados de Día */}
                        <div className="flex border-b-2 border-slate-100 bg-slate-50/50">
                           <div className="w-24 shrink-0 border-r-2 border-slate-100 p-4"></div>
                           {weekDays.map(day => (
                               <div key={day.toISOString()} className={`flex-1 min-w-[150px] p-2.5 text-center border-r-2 border-slate-100 ${day.toDateString() === new Date().toDateString() ? 'bg-primary/5' : ''}`}>
                                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{day.toLocaleDateString('es-ES', { weekday: 'short' })}</p>
                                  <p className="text-lg font-black text-slate-900 mt-0.5">{day.getDate()}</p>
                               </div>
                           ))}
                        </div>
                        {/* Grilla Semanal */}
                        <div className="divide-y-2 divide-slate-100">
                           {hours.map(hour => (
                               <div key={hour} className="flex min-h-[65px] group">
                                  <div className="w-20 shrink-0 flex items-center justify-center border-r-2 border-slate-100 bg-slate-50/50">
                                     <span className="text-xs font-bold text-slate-600 uppercase">{hour}</span>
                                  </div>
                                  {weekDays.map((day, idx) => {
                                     const dateStr = formatDate(day);
                                     const appsInSlot = appointments.filter(a => a.time === hour && a.date === dateStr);
                                     return (
                                        <div key={`${hour}-${idx}`} className={`flex-1 min-w-[150px] p-1 flex flex-col gap-1 border-r-2 border-slate-50 ${day.toDateString() === new Date().toDateString() ? 'bg-primary/5' : ''}`}>
                                           {appsInSlot.length > 0 ? (
                                              appsInSlot.map(app => {
                                                const styles = getStatusStyles(app.status, app.color);
                                                return (
                                                   <div key={app.id} onClick={() => handleAppClick(app)} className={`w-full rounded-xl p-2.5 cursor-pointer transition-all hover:scale-[1.02] shadow-sm flex flex-col justify-between border-2 ${styles.bg} ${styles.border} ${styles.text}`}>
                                                      <div className="flex items-center gap-2 mb-1">
                                                         <span className="material-icons-round text-[14px]">{styles.icon}</span>
                                                         <p className={`font-black text-xs truncate leading-tight ${app.status === 'Bloqueado' ? 'text-white' : 'text-slate-900'}`}>{app.patientName}</p>
                                                      </div>
                                                      <p className={`text-xs font-black uppercase tracking-widest truncate ${app.status === 'Bloqueado' ? 'text-white/70' : 'opacity-70'}`}>{app.status}</p>
                                                   </div>
                                                );
                                              })
                                           ) : (
                                              <button onClick={() => handleSlotClick(hour, dateStr)} className="w-full min-h-[40px] rounded-lg opacity-0 group-hover:opacity-100 bg-slate-50 hover:bg-primary/10 hover:text-primary transition-all flex items-center justify-center text-slate-400">
                                                 <span className="material-icons-round text-lg">add</span>
                                              </button>
                                           )}
                                        </div>
                                     );
                                  })}
                               </div>
                            ))}
                         </div>
                     </div>
                  ) : (
                     <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
                        {Array.from({ length: 12 }, (_, monthIdx) => {
                           const monthDate = new Date(currentDate.getFullYear(), monthIdx, 1);
                           const lastDayOfMonth = new Date(currentDate.getFullYear(), monthIdx + 1, 0).getDate();
                           const startDay = monthDate.getDay();
                           const adjustedStartDay = startDay === 0 ? 6 : startDay - 1; // Ajustar para Lunes
                           const days = Array.from({ length: lastDayOfMonth }, (_, i) => i + 1);
                           
                           return (
                              <div key={monthIdx} className="space-y-4">
                                 <h3 className="text-sm font-black uppercase tracking-widest text-primary text-center">
                                    {monthDate.toLocaleDateString('es-ES', { month: 'long' })}
                                 </h3>
                                 <div className="grid grid-cols-7 gap-1">
                                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                                       <div key={d} className="text-[10px] font-bold text-slate-400 text-center py-1">{d}</div>
                                    ))}
                                    {Array.from({ length: adjustedStartDay }).map((_, i) => <div key={`empty-${i}`} />)}
                                    {days.map(day => {
                                       const dStr = `${currentDate.getFullYear()}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                       const holiday = chileanHolidays.find(h => h.date === dStr);
                                       const hasApps = appointments.some(a => a.date === dStr);
                                       
                                       return (
                                          <div 
                                             key={day} 
                                             className={`relative aspect-square flex items-center justify-center text-[11px] font-bold rounded-lg transition-all cursor-pointer
                                                ${holiday ? 'bg-rose-50 text-rose-600' : hasApps ? 'bg-primary/10 text-primary' : 'hover:bg-slate-100 text-slate-600'}
                                             `}
                                             title={holiday?.name}
                                             onClick={() => {
                                                const newDate = new Date(currentDate.getFullYear(), monthIdx, day);
                                                setCurrentDate(newDate);
                                                setViewMode('day');
                                             }}
                                          >
                                             {day}
                                             {holiday && <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-rose-500 rounded-full border-2 border-white" />}
                                             {hasApps && !holiday && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />}
                                          </div>
                                       );
                                    })}
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  )}
               </div>
            </div>

            {isCreateModalOpen && (
               <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[100] flex items-start justify-center p-6 pt-16 overflow-y-auto">
                  <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-300">
                     <div className="p-8 md:p-10 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
                        <div>
                           <h3 className="text-2xl font-black text-slate-900 tracking-tight">Agendar Atención</h3>
                           <p className="text-[10px] font-black text-slate-500 uppercase mt-1.5 tracking-widest shadow-sm inline-block px-3 py-1 bg-white rounded-lg border border-slate-200 flex items-center gap-2"><span className="material-icons-round text-sm">schedule</span> {selectedSlot?.time} • {selectedSlot?.date}</p>
                        </div>
                        <button onClick={() => setIsCreateModalOpen(false)} className="w-12 h-12 rounded-2xl hover:bg-rose-50 text-slate-400 hover:text-rose-500 flex items-center justify-center transition-all active:scale-95">
                           <span className="material-icons-round text-2xl">close</span>
                        </button>
                     </div>

                     <div className="px-8 md:px-10 pt-8 flex items-center gap-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Etiqueta:</label>
                        <div className="flex gap-3">
                           {colors.map(c => (
                              <button
                                 key={c.class}
                                 onClick={() => setSelectedColor(c.class)}
                                 className={`w-8 h-8 rounded-full ${c.class} border-2 ${selectedColor === c.class ? 'border-white ring-2 ring-primary transition-all scale-110 shadow-lg' : 'border-slate-100 hover:opacity-80 transition-all'}`}
                                 title={c.name}
                              />
                           ))}
                        </div>
                     </div>

                     <div className="p-2 bg-slate-50/80 flex gap-2 mx-8 md:mx-10 mt-6 rounded-2xl shadow-inner border border-slate-200">
                        {['existing', 'new', 'block'].map(t => (
                           <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === t ? 'bg-white text-primary shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>{t === 'existing' ? 'Paciente Red' : t === 'new' ? 'Registrar' : 'Bloquear'}</button>
                        ))}
                     </div>

                     <div className="p-8 md:p-10">
                        {activeTab === 'existing' && (
                           <div className="space-y-6">
                              <div className="relative">
                                 <span className="material-icons-round absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                                 <input placeholder="Buscar por nombre o RUT..." className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-4 pl-14 pr-5 font-bold text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner placeholder:text-slate-400" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                              </div>
                              <div className="space-y-3 max-h-[30vh] overflow-y-auto custom-scrollbar pr-2">
                                 {patients.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5).map(p => (
                                    <button key={p.id} onClick={() => handleAddAppointment(p)} className="w-full p-5 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:border-primary hover:bg-primary/5 transition-all shadow-[0_10px_20px_-10px_rgba(0,0,0,0.05)] active:scale-95 group">
                                       <div className="flex items-center gap-5">
                                          <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center font-black text-base shadow-sm group-hover:bg-primary/10 group-hover:text-primary transition-colors">{p.name.charAt(0)}</div>
                                          <div className="text-left">
                                             <p className="text-sm font-black text-slate-900">{p.name}</p>
                                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{p.rut}</p>
                                          </div>
                                       </div>
                                       <span className="material-icons-round text-slate-300 group-hover:text-primary transition-colors">arrow_forward</span>
                                    </button>
                                 ))}
                              </div>
                           </div>
                        )}

                        {activeTab === 'new' && (
                           <div className="space-y-6">
                              <div>
                                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Nombre Completo</label>
                                 <input value={newPatientForm.name} onChange={e => setNewPatientForm({ ...newPatientForm, name: e.target.value })} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner placeholder:text-slate-400" placeholder="Ej: Maria Lopez" />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                 <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">RUT / ID</label>
                                    <input value={newPatientForm.rut} onChange={e => setNewPatientForm({ ...newPatientForm, rut: e.target.value })} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner placeholder:text-slate-400" placeholder="12.345.678-9" />
                                 </div>
                                 <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Teléfono</label>
                                    <input value={newPatientForm.phone} onChange={e => setNewPatientForm({ ...newPatientForm, phone: e.target.value })} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner placeholder:text-slate-400" placeholder="+56 9..." />
                                 </div>
                              </div>
                              <button onClick={() => { if (!newPatientForm.name) return; const p = { id: Math.random().toString(), ...newPatientForm } as any; onAddPatient(p); handleAddAppointment(p); }} className="w-full py-5 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-[0_10px_30px_-10px_rgba(19,91,236,0.6)] border-b-4 border-blue-700 active:border-b-0 active:translate-y-1 mt-6 transition-all flex items-center justify-center gap-3"><span className="material-icons-round text-lg">schedule</span> Agendar Cita</button>
                           </div>
                        )}

                        {activeTab === 'block' && (
                           <div className="space-y-8">
                              <div className="p-5 bg-slate-900 border border-slate-800 text-white rounded-2xl flex items-start gap-4 shadow-inner">
                                 <span className="material-icons-round text-2xl text-rose-400">info</span>
                                 <p className="text-[10px] font-black leading-relaxed uppercase tracking-widest text-slate-300">El horario seleccionado quedará <span className="text-rose-400">bloqueado</span> para recepción pública.</p>
                              </div>
                              <div>
                                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Motivo del Bloqueo</label>
                                 <input value={blockNote} onChange={e => setBlockNote(e.target.value)} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm text-black focus:bg-white focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 transition-all shadow-inner placeholder:text-slate-400" placeholder="Ej: Trámite Personal..." />
                              </div>
                              <div>
                                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Duración (minutos)</label>
                                 <select value={blockDuration} onChange={e => setBlockDuration(Number(e.target.value))} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm text-black focus:bg-white focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 transition-all shadow-inner mt-1">
                                    <option value={15}>15 minutos</option>
                                    <option value={30}>30 minutos</option>
                                    <option value={45}>45 minutos</option>
                                    <option value={60}>1 hora</option>
                                    <option value={90}>1 hora 30m</option>
                                    <option value={120}>2 horas</option>
                                 </select>
                              </div>
                              <button onClick={() => handleAddAppointment(null, true)} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] border-b-4 border-slate-800 active:border-b-0 active:translate-y-1 mt-6 transition-all flex items-center justify-center gap-3"><span className="material-icons-round text-lg text-rose-400">block</span> Aplicar Bloqueo</button>
                           </div>
                        )}
                     </div>
                  </div>
               </div>
            )}

            {/* MODAL EDICIÓN */}
            {isEditModalOpen && editingApp && (
               <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[100] flex items-start justify-center p-6 pt-12 overflow-y-auto">
                  <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-300">
                     <div className={`p-8 md:p-10 ${editingApp.status === 'Bloqueado' ? 'bg-slate-800' : (editingApp.color || 'bg-primary')} text-white relative flex flex-col items-center text-center`}>
                        <button onClick={() => setIsEditModalOpen(false)} className="absolute top-6 right-6 w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all active:scale-95"><span className="material-icons-round text-2xl">close</span></button>
                        <div className="w-20 h-20 rounded-[1.5rem] bg-white/20 flex items-center justify-center font-black text-4xl mb-6 shadow-xl backdrop-blur-md border border-white/20">{editingApp.patientName.charAt(0)}</div>
                        <h3 className="text-3xl font-black tracking-tight mb-3">{editingApp.patientName}</h3>
                        <div className="flex items-center gap-3 opacity-90 border border-white/20 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm shadow-sm">
                           <span className="material-icons-round text-sm">schedule</span>
                           <p className="text-[10px] font-black uppercase tracking-widest">{editingApp.time} • {editingApp.date}</p>
                        </div>
                     </div>

                     <div className="p-8 md:p-10 space-y-8">
                        <div className="grid grid-cols-2 gap-4">
                           {(['Confirmado', 'Llegado', 'En Sesión', 'Finalizado'] as const).map(s => (
                              <button key={s} onClick={() => handleStatusChange(s)} className={`py-4 rounded-xl text-[10px] font-black uppercase tracking-widest border-b-[3px] active:border-b-0 active:translate-y-[3px] transition-all shadow-sm flex items-center justify-center gap-2 ${editingApp.status === s ? 'bg-emerald-500 border-emerald-700 text-white scale-[1.02]' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 hover:text-black hover:bg-slate-100'}`}>
                                 {editingApp.status === s && <span className="material-icons-round text-sm">check_circle</span>}
                                 {s}
                              </button>
                           ))}
                        </div>

                        <div className="mt-8 flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                           <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Color:</label>
                           <div className="flex gap-3">
                              {colors.map(c => (
                                 <button
                                    key={c.class}
                                    onClick={() => handleColorChange(c.class)}
                                    className={`w-8 h-8 rounded-full ${c.class} border-2 ${editingApp.color === c.class ? 'border-white ring-4 ring-slate-200 scale-110 shadow-lg' : 'border-slate-200 hover:opacity-80 transition-all shadow-sm'}`}
                                    title={c.name}
                                 />
                              ))}
                           </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                           {editingApp.status !== 'Bloqueado' && editingApp.patientId && (
                              <button onClick={() => navigate(`/pro/record/${editingApp.patientId}`)} className="py-5 bg-slate-50 text-slate-600 border-b-[3px] border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:bg-slate-900 hover:border-slate-800 hover:text-white active:border-b-0 active:translate-y-[3px] shadow-sm"><span className="material-icons-round text-lg">description</span> Ficha Médica</button>
                           )}
                           <button onClick={deleteAppointment} className="py-5 bg-rose-50 text-rose-500 border-b-[3px] border-rose-200 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:bg-rose-500 hover:border-rose-600 hover:text-white active:border-b-0 active:translate-y-[3px] shadow-sm"><span className="material-icons-round text-lg">delete</span> Anular Evento</button>
                        </div>
                     </div>
                  </div>
               </div>
            )}
         </main>
      </div>
   );
};

export default ProfessionalAgenda;
