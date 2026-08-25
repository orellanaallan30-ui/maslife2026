import React, { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Appointment, Patient } from '../types';
import { useClinic } from '../ClinicContext';
import { esCupoEnEspera } from '../lib/holds';

const ProfessionalAgenda: React.FC = () => {
   const navigate = useNavigate();
   const location = useLocation();
   const { appointments: allAppointments, patients, addPatient, addAppointment, batchAddAppointments, updateAppointment, deleteAppointment: onRemoveApp, deleteAppointmentsByRecurrence, setPatients: setContextPatients, loggedPro, logout, isLoading } = useClinic();

   // Solo citas de este profesional
   const appointments = useMemo(
     () => allAppointments.filter(a => !a.professionalId || a.professionalId === loggedPro?.id),
     [allAppointments, loggedPro?.id]
   );

   const onAddPatient = (p: Patient) => setContextPatients(prev => [...prev, p]);
   const onLogout = () => logout(navigate, 'PROFESSIONAL');

   const [viewMode, setViewMode] = useState<'day' | 'week' | 'year'>('day');
   const [currentDate, setCurrentDate] = useState(() => {
     const d = (location.state as { date?: string } | null)?.date;
     return d ? new Date(d + 'T12:00:00') : new Date();
   });
   const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
   const [activeTab, setActiveTab] = useState<'existing' | 'new' | 'block'>('existing');
   const [selectedSlot, setSelectedSlot] = useState<{ time: string, date: string } | null>(null);
   const [editingApp, setEditingApp] = useState<Appointment | null>(null);
   const [creandoFicha, setCreandoFicha] = useState(false);
   const [searchQuery, setSearchQuery] = useState('');
   const [newPatientForm, setNewPatientForm] = useState({ name: '', rut: '', phone: '', email: '' });
   const [blockNote, setBlockNote] = useState('');
   const [blockDate, setBlockDate] = useState('');
   const [blockTimes, setBlockTimes] = useState<string[]>([]);
   const [blockMode, setBlockMode] = useState<'blocked' | 'remote_only' | 'presential_only'>('blocked');
   const [blockRecurrence, setBlockRecurrence] = useState<'none' | 'weekly' | 'monthly' | 'permanent'>('none');
   const [blockDaysOfWeek, setBlockDaysOfWeek] = useState<number[]>([]);
   const [blockDuration, setBlockDuration] = useState<number>(60);
   const [blockEndsAt, setBlockEndsAt] = useState<string>('');
   const [blockApplying, setBlockApplying] = useState(false);
   const [deleteRecurrenceOpen, setDeleteRecurrenceOpen] = useState(false);
   const [deleteRecurrenceMode, setDeleteRecurrenceMode] = useState<'single' | 'future' | 'all'>('single');
   const [selectedColor, setSelectedColor] = useState('bg-primary');
   const [selectedServiceId, setSelectedServiceId] = useState<string>('');
   const [appointmentNotes, setAppointmentNotes] = useState('');

   const selectedService = loggedPro?.services.find(s => s.id === selectedServiceId) || loggedPro?.services[0] || null;

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

   // Days the professional works, for the block date picker (next 14 days)
   const blockableDays = useMemo(() => {
      if (!loggedPro) return [];
      const days: { date: string; label: string }[] = [];
      const today = new Date();
      for (let i = 0; i < 14; i++) {
         const d = new Date(today);
         d.setDate(today.getDate() + i);
         const dayIdx = d.getDay();
         const raw = loggedPro.schedule?.[dayIdx];
         const isActive = raw ? (raw.active ?? false) : (dayIdx !== 0 && dayIdx !== 6);
         if (isActive) {
            const dateStr = d.toISOString().split('T')[0];
            const label = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
            days.push({ date: dateStr, label });
         }
      }
      return days;
   }, [loggedPro]);

   const blockColor = (mode: 'blocked' | 'remote_only' | 'presential_only') =>
      mode === 'blocked' ? 'bg-slate-800' : mode === 'remote_only' ? 'bg-blue-600' : 'bg-emerald-700';

   const buildBlock = (date: string, time: string, recurrenceId?: string): Appointment => ({
      id: crypto.randomUUID(),
      patientName: blockNote || 'Bloqueo Administrativo',
      doctorName: loggedPro?.name || '',
      specialty: loggedPro?.specialty || '',
      serviceName: 'Bloqueo',
      date, time,
      duration: blockDuration,
      type: 'Personal',
      status: 'Bloqueado',
      price: 0,
      paymentStatus: 'Pagado',
      category: 'Personal',
      color: blockColor(blockMode),
      professionalId: loggedPro?.id,
      bookingSource: 'presencial',
      recurrenceId,
      recurrenceType: blockRecurrence,
      blockMode,
   });

   const handleApplySmartBlock = async () => {
      if (blockTimes.length === 0) return;
      setBlockApplying(true);
      const recId = (blockRecurrence !== 'none') ? crypto.randomUUID() : undefined;
      const blocks: Appointment[] = [];
      const today = new Date(); today.setHours(0,0,0,0);
      const endDate = blockEndsAt ? new Date(blockEndsAt) : null;

      const addDayBlocks = (date: string) =>
         blockTimes.forEach(t => blocks.push(buildBlock(date, t, recId)));

      if (blockRecurrence === 'none') {
         if (blockDate) addDayBlocks(blockDate);
      } else if (blockRecurrence === 'weekly' || blockRecurrence === 'permanent') {
         const weeks = blockRecurrence === 'permanent' ? 52 : 12;
         const days = blockDaysOfWeek.length > 0 ? blockDaysOfWeek : (blockDate ? [new Date(blockDate).getDay()] : []);
         for (let w = 0; w < weeks; w++) {
            days.forEach(dayIdx => {
               const d = new Date(today);
               let diff = dayIdx - d.getDay(); if (diff < 0) diff += 7;
               d.setDate(d.getDate() + diff + w * 7);
               if (endDate && d > endDate) return;
               addDayBlocks(d.toISOString().split('T')[0]);
            });
         }
      } else if (blockRecurrence === 'monthly') {
         if (blockDate) {
            const base = new Date(blockDate);
            for (let m = 0; m < 6; m++) {
               const d = new Date(base); d.setMonth(d.getMonth() + m);
               if (endDate && d > endDate) break;
               addDayBlocks(d.toISOString().split('T')[0]);
            }
         }
      }

      try {
         await batchAddAppointments(blocks);
      } catch (err) {
         // batchAddAppointments ya notificó al usuario (notifyWriteError);
         // aquí solo dejamos rastro para diagnóstico.
         console.error('[SmartBlock] Bloqueos no guardados:', (err as Error)?.message || err);
      }

      setBlockApplying(false);
      setIsCreateModalOpen(false);
      setSelectedSlot(null);
      setBlockNote(''); setBlockTimes([]); setBlockRecurrence('none');
      setBlockDaysOfWeek([]); setBlockMode('blocked'); setBlockEndsAt('');
   };

   const handleSlotClick = (time: string, date: string) => {
      setSelectedSlot({ time, date });
      setNewPatientForm({ name: '', rut: '', phone: '', email: '' });
      setSelectedColor('bg-primary');
      setBlockNote('');
      setBlockDate(date);
      setBlockTimes([time]);
      setActiveTab('existing');
      setSelectedServiceId('');
      setAppointmentNotes('');
      setIsCreateModalOpen(true);
   };

   const handleAppClick = (app: Appointment) => {
      setEditingApp(app);
      setSelectedColor(app.color || 'bg-primary'); // Set selected color for editing
      setIsEditModalOpen(true);
   };

   /**
    * Abre el alta de cita con los datos del paciente ya puestos, para agendarle
    * la siguiente sesión sin tener que teclearlos de nuevo. Deja al profesional
    * eligiendo solo fecha y hora.
    */
   const agendarProximaSesion = () => {
      if (!editingApp) return;
      const app = editingApp;
      setIsEditModalOpen(false);
      setEditingApp(null);

      // Por defecto, la misma hora dentro de una semana: es la pauta más común en
      // tratamientos, y de todas formas el profesional puede cambiarla.
      const proxima = new Date(`${app.date}T00:00:00`);
      proxima.setDate(proxima.getDate() + 7);
      const fecha = formatDate(proxima);

      setSelectedSlot({ time: app.time, date: fecha });
      setNewPatientForm({
         name: app.patientName || '',
         rut: app.patientRut || '',
         phone: app.patientPhone || '',
         email: app.patientEmail || '',
      });
      setSelectedColor(app.color || 'bg-primary');
      setBlockNote('');
      setBlockDate(fecha);
      setBlockTimes([app.time]);
      // Si ya tiene ficha se elige de la lista; si vino de una reserva web, se
      // crea con los datos que la propia cita trae.
      setActiveTab(app.patientId ? 'existing' : 'new');
      setSelectedServiceId('');
      setAppointmentNotes('');
      setCurrentDate(proxima);
      setIsCreateModalOpen(true);
   };

   const handleAddAppointment = (patient: Partial<Patient> | null, isBlock: boolean = false) => {
      if (!selectedSlot) return;
      const newApp: Appointment = {
         id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9),
         patientId: patient?.id,
         patientName: isBlock ? (blockNote || 'Bloqueo Administrativo') : (patient?.name || 'Nuevo Paciente'),
         patientPhone: patient?.phone,
         patientEmail: isBlock ? undefined : (patient?.email || undefined),
         doctorName: loggedPro?.name || '',
         specialty: loggedPro?.specialty || '',
         serviceName: isBlock ? 'Bloqueo' : (selectedService?.name || loggedPro?.services[0]?.name || 'Consulta'),
         date: selectedSlot.date,
         time: selectedSlot.time,
         duration: isBlock ? blockDuration : (selectedService?.duration || 60),
         type: isBlock ? 'Personal' : 'Presencial',
         status: isBlock ? 'Bloqueado' : 'Confirmado',
         price: isBlock ? 0 : (selectedService?.price || loggedPro?.services[0]?.price || 0),
         notes: isBlock ? undefined : appointmentNotes || undefined,
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

      // Enviar email de calificación solo la primera vez que se marca Finalizado
      if (
        newStatus === 'Finalizado' &&
        editingApp.status !== 'Finalizado' &&
        editingApp.patientEmail &&
        loggedPro?.reviewsEnabled
      ) {
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'rating-request',
            patientEmail: editingApp.patientEmail,
            patientName: editingApp.patientName,
            professionalName: loggedPro.name,
            professionalId: loggedPro.id,
            proSlug: loggedPro.slug,
            serviceName: editingApp.serviceName,
            date: editingApp.date,
          }),
        }).catch(() => {});
      }

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

   const getStatusStyles = (status: Appointment['status'], appColor?: string, bMode?: Appointment['blockMode']) => {
      if (status === 'Bloqueado') {
         const bg = bMode === 'remote_only' ? 'bg-blue-600' : bMode === 'presential_only' ? 'bg-emerald-700' : 'bg-slate-800';
         const border = bMode === 'remote_only' ? 'border-blue-800' : bMode === 'presential_only' ? 'border-emerald-900' : 'border-slate-900';
         const icon = bMode === 'remote_only' ? 'videocam_off' : bMode === 'presential_only' ? 'location_off' : 'block';
         return { bg, border, text: 'text-white', iconBg: 'bg-white/20', icon };
      }

      if (status === 'Cancelado') {
         return {
            bg: 'bg-rose-50',
            border: 'border-rose-200',
            text: 'text-rose-700 font-bold',
            iconBg: 'bg-rose-500',
            icon: 'cancel'
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

   // Da de alta al paciente de una reserva web, que llega sin ficha (patientId
   // nulo), usando los datos que la propia cita ya trae, y enlaza ambos.
   const crearFichaDesdeCita = async () => {
      if (!editingApp || creandoFicha) return;
      setCreandoFicha(true);
      try {
         // Misma forma que crea el panel de pacientes (PatientList.handleSubmit).
         const nuevo: any = {
            id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9),
            name: editingApp.patientName,
            rut: '',
            phone: editingApp.patientPhone || '',
            email: editingApp.patientEmail || '',
            age: 0,
            gender: 'No especificado',
            status: 'Nuevo',
            prevision: 'Fonasa',
            birthDate: '',
            address: '',
            allergies: [],
            medicalHistory: '',
            attachments: [],
            customFields: [],
            archived: false,
            professionalId: loggedPro?.id,
         };
         addPatient(nuevo);
         updateAppointment({ ...editingApp, patientId: nuevo.id });
         setEditingApp({ ...editingApp, patientId: nuevo.id });
         navigate(`/pro/record/${nuevo.id}`);
      } finally {
         setCreandoFicha(false);
      }
   };

   const monthName = currentDate.toLocaleDateString('es-ES', { month: 'long' });
   const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

   if (isLoading) {
     return (
       <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-[#f8fafc]">
         <span className="material-icons-round animate-spin text-primary text-5xl">sync</span>
         <p className="text-slate-500 font-bold text-sm">Cargando agenda...</p>
       </div>
     );
   }

   return (
      <div className="flex-1 flex flex-col min-h-0 w-full bg-[#f8fafc]">
         <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 md:p-12 pb-24 md:pb-12">
            <div className="max-w-7xl mx-auto space-y-3 md:space-y-10">

                {/* Barra compacta: título + navegación + tabs — todo en una fila en mobile */}
                <div className="flex items-center gap-2">
                  {/* Navegación de fecha */}
                  <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-100 shadow-sm px-1 py-1 shrink-0">
                    <button onClick={() => {
                      const d = new Date(currentDate);
                      if (viewMode === 'year') d.setFullYear(d.getFullYear() - 1);
                      else d.setDate(d.getDate() - (viewMode === 'day' ? 1 : 7));
                      setCurrentDate(d);
                    }} className="p-1.5 hover:bg-slate-100 text-slate-500 rounded-lg transition-all active:scale-95">
                      <span className="material-icons-round text-lg">chevron_left</span>
                    </button>
                    <div className="px-1 text-center min-w-[80px]">
                      <p className="text-[11px] font-black text-primary uppercase tracking-widest leading-none">{capitalizedMonth}</p>
                      <p className="text-sm font-black text-slate-900 leading-tight">
                        {viewMode === 'day' ? currentDate.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }) : viewMode === 'week' ? `Sem. ${weekDays[0].getDate()}` : currentDate.getFullYear()}
                      </p>
                    </div>
                    <button onClick={() => {
                      const d = new Date(currentDate);
                      if (viewMode === 'year') d.setFullYear(d.getFullYear() + 1);
                      else d.setDate(d.getDate() + (viewMode === 'day' ? 1 : 7));
                      setCurrentDate(d);
                    }} className="p-1.5 hover:bg-slate-100 text-slate-500 rounded-lg transition-all active:scale-95">
                      <span className="material-icons-round text-lg">chevron_right</span>
                    </button>
                  </div>
                  <button onClick={() => setCurrentDate(new Date())} className="px-3 py-2 bg-white rounded-xl border border-slate-100 shadow-sm text-[11px] font-black uppercase text-slate-500 hover:text-primary transition-all shrink-0">HOY</button>
                  {/* Tabs vista */}
                  <div className="flex-1 flex justify-end">
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm flex p-1 gap-1">
                      {([['day','DÍA'],['week','SEM'],['year','AÑO']] as const).map(([mode, label]) => (
                        <button key={mode} onClick={() => setViewMode(mode)} className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide transition-all ${viewMode === mode ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{label}</button>
                      ))}
                    </div>
                  </div>
                </div>

               {/* Stat chips — fila horizontal scrollable */}
               <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-4">
                  {[
                    { icon: 'event', label: 'Citas hoy', value: appointments.filter(a => a.date === formatDate(currentDate) && a.status !== 'Cancelado' && a.status !== 'Bloqueado' && !esCupoEnEspera(a)).length },
                    { icon: 'check_circle', label: 'Confirmadas', value: appointments.filter(a => a.date === formatDate(currentDate) && a.status === 'Confirmado').length },
                    { icon: 'payments', label: 'Ingreso hoy', value: '$' + appointments.filter(a => a.date === formatDate(currentDate) && a.status !== 'Cancelado' && a.status !== 'Bloqueado' && !esCupoEnEspera(a)).reduce((sum, a) => sum + (a.price || 0), 0).toLocaleString('es-CL') },
                    { icon: 'date_range', label: 'Esta semana', value: appointments.filter(a => weekDays.some(d => formatDate(d) === a.date) && a.status !== 'Cancelado' && !esCupoEnEspera(a)).length },
                  ].map(({ icon, label, value }) => (
                    <div key={label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex items-center gap-2 shrink-0 min-w-[130px] md:min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="material-icons-round text-primary text-base">{icon}</span>
                      </div>
                      <div>
                        <p className="text-base font-black text-slate-900 leading-none">{value}</p>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-wide mt-0.5">{label}</p>
                      </div>
                    </div>
                  ))}
               </div>

               <div className={`bg-white rounded-2xl md:rounded-blob-xl shadow-sm md:shadow-[0_48px_100px_-20px_rgba(19,91,236,0.1)] border border-slate-100 ${viewMode === 'week' ? 'overflow-x-auto' : 'overflow-hidden'}`}>
                  {viewMode === 'day' ? (
                     <div className="grid grid-cols-1 divide-y-2 divide-slate-100">
                        {hours.map(hour => {
                           // Las finalizadas ya no ocupan: atendido el paciente, la casilla
                           // vuelve a quedar libre para agendar la siguiente. Coincide con
                           // citasQueOcupan y con el índice uq_slot_active (migración 0016).
                           const appsInSlot = appointments.filter(a => a.time === hour && a.date === formatDate(currentDate) && a.status !== 'Finalizado');
                           return (
                               <div key={hour} className="flex min-h-[52px] sm:min-h-[70px] group">
                                  <div className="w-24 shrink-0 flex items-center justify-center border-r-2 border-slate-100 bg-slate-50/50">
                                     <span className="text-sm font-bold text-slate-900 uppercase">{hour}</span>
                                  </div>
                                  <div className="flex-1 p-2 flex flex-col gap-1.5">
                                    {appsInSlot.length > 0 ? (
                                       appsInSlot.map(app => {
                                          const styles = getStatusStyles(app.status, app.color, app.blockMode);
                                          return (
                                             <div key={app.id} onClick={() => handleAppClick(app)} className={`flex-1 rounded-2xl p-5 flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01] shadow-sm border-2 ${styles.bg} ${styles.border} ${styles.text}`}>
                                                <div className="flex items-center gap-3">
                                                   <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-base shadow-md ${styles.iconBg} text-white`}>
                                                       <span className="material-icons-round text-lg">{styles.icon}</span>
                                                    </div>
                                                    <div>
                                                       <p className={`font-black text-base tracking-tight mb-0 ${app.status === 'Bloqueado' ? 'text-white' : esCupoEnEspera(app) ? 'text-slate-400' : 'text-slate-900'}`}>{app.patientName}</p>
                                                       {/* Un cupo retenido durante el pago no es una cita: se muestra
                                                           apagado y con su propia etiqueta, para que no se confunda
                                                           con una reserva confirmada. */}
                                                       {/* Lo primero que necesita ver el profesional es si el dinero
                                                           está: por eso el pago manda sobre el estado de la cita. */}
                                                       <p className={`text-[11px] font-black uppercase tracking-widest ${app.status === 'Bloqueado' ? 'text-white/70' : esCupoEnEspera(app) ? 'text-slate-400' : 'opacity-70'}`}>
                                                          {esCupoEnEspera(app)
                                                             ? 'Esperando pago'
                                                             : app.status === 'Bloqueado'
                                                                ? app.status
                                                                : <>
                                                                     {app.paymentStatus === 'Pagado' && (
                                                                        <span className="text-emerald-600 mr-1.5">● Pagado</span>
                                                                     )}
                                                                     {app.serviceName} • {app.status}
                                                                  </>}
                                                       </p>
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
                     <div className="flex flex-col min-w-[800px]">
                        {/* Encabezados de Día */}
                        <div className="flex border-b-2 border-slate-100 bg-slate-50/50">
                           <div className="w-24 shrink-0 border-r-2 border-slate-100 p-4"></div>
                           {weekDays.map(day => (
                               <div key={day.toISOString()} className={`flex-1 min-w-[150px] p-2.5 text-center border-r-2 border-slate-100 ${day.toDateString() === new Date().toDateString() ? 'bg-primary/5' : ''}`}>
                                  <p className="text-[11px] font-black uppercase tracking-[0.05em] text-slate-500">{day.toLocaleDateString('es-ES', { weekday: 'short' })}</p>
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
                                     const appsInSlot = appointments.filter(a => a.time === hour && a.date === dateStr && a.status !== 'Finalizado');
                                     return (
                                        <div key={`${hour}-${idx}`} className={`flex-1 min-w-[150px] p-1 flex flex-col gap-1 border-r-2 border-slate-50 ${day.toDateString() === new Date().toDateString() ? 'bg-primary/5' : ''}`}>
                                           {appsInSlot.length > 0 ? (
                                              appsInSlot.map(app => {
                                                const styles = getStatusStyles(app.status, app.color, app.blockMode);
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
                     <div className="p-8 grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-10">
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
                                       <div key={d} className="text-[11px] font-bold text-slate-400 text-center py-1">{d}</div>
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
                  <div className="bg-white w-full max-w-lg rounded-blob-lg shadow-modal border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-300">
                     <div className="p-8 md:p-10 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
                        <div>
                           <h3 className="text-2xl font-black text-slate-900 tracking-tight">Agendar Atención</h3>
                           <p className="text-[11px] font-black text-slate-500 uppercase mt-1.5 tracking-widest shadow-sm inline-block px-3 py-1 bg-white rounded-lg border border-slate-200 flex items-center gap-2"><span className="material-icons-round text-sm">schedule</span> {selectedSlot?.time} • {selectedSlot?.date}</p>
                        </div>
                        <button onClick={() => setIsCreateModalOpen(false)} className="w-12 h-12 rounded-2xl hover:bg-rose-50 text-slate-400 hover:text-rose-500 flex items-center justify-center transition-all active:scale-95">
                           <span className="material-icons-round text-2xl">close</span>
                        </button>
                     </div>

                     <div className="px-8 md:px-10 pt-8 flex items-center gap-4">
                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Etiqueta:</label>
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
                           <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === t ? 'bg-white text-primary shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>{t === 'existing' ? 'Paciente Red' : t === 'new' ? 'Registrar' : 'Bloquear'}</button>
                        ))}
                     </div>

                     {activeTab !== 'block' && loggedPro?.services && loggedPro.services.length > 1 && (
                        <div className="px-8 md:px-10 pb-2 mt-6">
                           <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2">Servicio</label>
                           <div className="flex flex-wrap gap-2">
                              {loggedPro.services.map(s => (
                                 <button
                                    key={s.id}
                                    onClick={() => setSelectedServiceId(s.id)}
                                    className={`px-4 py-2.5 rounded-xl text-xs font-black border transition-all ${
                                       (selectedServiceId || loggedPro.services[0]?.id) === s.id
                                          ? 'bg-primary text-white border-primary shadow-md'
                                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-primary hover:text-primary'
                                    }`}
                                 >
                                    {s.name} <span className="opacity-60 font-semibold">${s.price.toLocaleString('es-CL')}</span>
                                 </button>
                              ))}
                           </div>
                        </div>
                     )}

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
                                             <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{p.rut}</p>
                                          </div>
                                       </div>
                                       <span className="material-icons-round text-slate-300 group-hover:text-primary transition-colors">arrow_forward</span>
                                    </button>
                                 ))}
                              </div>
                              <div className="mt-4">
                                 <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Observaciones (opcional)</label>
                                 <textarea
                                    value={appointmentNotes}
                                    onChange={e => setAppointmentNotes(e.target.value)}
                                    placeholder="Notas para la cita..."
                                    rows={2}
                                    className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-3 px-5 font-medium text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner placeholder:text-slate-400 resize-none"
                                 />
                              </div>
                           </div>
                        )}

                        {activeTab === 'new' && (
                           <div className="space-y-6">
                              <div>
                                 <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Nombre Completo</label>
                                 <input value={newPatientForm.name} onChange={e => setNewPatientForm({ ...newPatientForm, name: e.target.value })} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner placeholder:text-slate-400" placeholder="Ej: Maria Lopez" />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                 <div>
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">RUT / ID</label>
                                    <input value={newPatientForm.rut} onChange={e => setNewPatientForm({ ...newPatientForm, rut: e.target.value })} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner placeholder:text-slate-400" placeholder="12.345.678-9" />
                                 </div>
                                 <div>
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Teléfono</label>
                                    <input value={newPatientForm.phone} onChange={e => setNewPatientForm({ ...newPatientForm, phone: e.target.value })} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner placeholder:text-slate-400" placeholder="+56 9..." />
                                 </div>
                              </div>
                              <div>
                                 <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Correo del paciente <span className="normal-case text-slate-300">(opcional — recibe confirmación)</span></label>
                                 <input type="email" value={newPatientForm.email} onChange={e => setNewPatientForm({ ...newPatientForm, email: e.target.value })} className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner placeholder:text-slate-400" placeholder="paciente@correo.cl" />
                              </div>
                              <div className="mt-4">
                                 <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Observaciones (opcional)</label>
                                 <textarea
                                    value={appointmentNotes}
                                    onChange={e => setAppointmentNotes(e.target.value)}
                                    placeholder="Notas para la cita..."
                                    rows={2}
                                    className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-3 px-5 font-medium text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner placeholder:text-slate-400 resize-none"
                                 />
                              </div>
                              <button onClick={() => {
                                 if (!newPatientForm.name) return;
                                 const newPat: Patient = {
                                    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9),
                                    name: newPatientForm.name,
                                    rut: newPatientForm.rut || '',
                                    phone: newPatientForm.phone || '',
                                    email: newPatientForm.email || '',
                                    age: 0,
                                    gender: '',
                                    prevision: '',
                                    birthDate: '',
                                    address: '',
                                    allergies: [],
                                    medicalHistory: '',
                                    customFields: [],
                                    attachments: [],
                                    archived: false,
                                    risk: 'Bajo',
                                    status: 'Nuevo',
                                    professionalId: loggedPro?.id,
                                 };
                                 onAddPatient(newPat);
                                 handleAddAppointment(newPat);
                              }} className="w-full py-5 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-[0.05em] shadow-cta border-b-4 border-blue-700 active:border-b-0 active:translate-y-1 mt-6 transition-all flex items-center justify-center gap-3"><span className="material-icons-round text-lg">schedule</span> Agendar Cita</button>
                           </div>
                        )}

                        {activeTab === 'block' && (
                           <div className="space-y-5">

                              {/* ── 1. HORAS ── */}
                              <div>
                                 <div className="flex items-center justify-between mb-2">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Horas a bloquear</label>
                                    <div className="flex gap-2">
                                       {[['08:00','13:00','Mañana'],['14:00','20:00','Tarde'],['08:00','20:00','Todo']].map(([s,e,lbl]) => (
                                          <button key={lbl} onClick={() => setBlockTimes(hours.filter(h => h >= s && h <= e && !appointments.some(a => a.date === blockDate && a.time === h)))}
                                             className="text-[11px] font-black text-primary uppercase tracking-widest hover:underline">{lbl}</button>
                                       ))}
                                       <button onClick={() => { const f = hours.filter(h => !appointments.some(a => a.date === blockDate && a.time === h)); setBlockTimes(f.length === blockTimes.length ? [] : f); }}
                                          className="text-[11px] font-black text-slate-400 uppercase tracking-widest hover:underline">
                                          {hours.filter(h => !appointments.some(a => a.date === blockDate && a.time === h)).length === blockTimes.length ? '✕' : 'Todo'}
                                       </button>
                                    </div>
                                 </div>
                                 <div className="grid grid-cols-4 gap-1.5">
                                    {hours.map(h => {
                                       const isOccupied = appointments.some(a => a.date === blockDate && a.time === h && a.status !== 'Cancelado');
                                       const isSelected = blockTimes.includes(h);
                                       return (
                                          <button key={h} disabled={isOccupied}
                                             onClick={() => setBlockTimes(prev => isSelected ? prev.filter(t => t !== h) : [...prev, h])}
                                             className={`py-2.5 rounded-xl text-xs font-black transition-all border-2 ${
                                                isOccupied ? 'bg-rose-50 border-rose-100 text-rose-300 cursor-not-allowed' :
                                                isSelected ? 'bg-slate-900 border-slate-900 text-white shadow-md' :
                                                'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-400'
                                             }`}>
                                             {isOccupied ? <span className="material-icons-round text-xs">block</span> : h}
                                          </button>
                                       );
                                    })}
                                 </div>
                                 {blockTimes.length > 0 && (
                                    <p className="text-[11px] font-black text-primary uppercase tracking-widest mt-2 ml-1">
                                       {blockTimes.length} hora{blockTimes.length > 1 ? 's' : ''} seleccionada{blockTimes.length > 1 ? 's' : ''}
                                    </p>
                                 )}
                              </div>

                              {/* ── 2. TIPO DE BLOQUE ── */}
                              <div>
                                 <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 ml-1">Tipo</label>
                                 <div className="grid grid-cols-3 gap-2">
                                    {([
                                       { v: 'blocked', icon: 'block', label: 'Bloqueado', bg: 'bg-slate-800', sel: 'border-slate-900' },
                                       { v: 'remote_only', icon: 'videocam_off', label: 'Solo Remoto', bg: 'bg-blue-600', sel: 'border-blue-700' },
                                       { v: 'presential_only', icon: 'location_off', label: 'Solo Presencial', bg: 'bg-emerald-700', sel: 'border-emerald-800' },
                                    ] as const).map(opt => (
                                       <button key={opt.v} onClick={() => setBlockMode(opt.v)}
                                          className={`py-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${blockMode === opt.v ? `${opt.bg} ${opt.sel} text-white scale-[1.02] shadow-md` : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                          <span className="material-icons-round text-base">{opt.icon}</span>
                                          <span className="text-[11px] font-black uppercase tracking-widest leading-tight text-center">{opt.label}</span>
                                       </button>
                                    ))}
                                 </div>
                              </div>

                              {/* ── 3. RECURRENCIA ── */}
                              <div>
                                 <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 ml-1">Repetir</label>
                                 <div className="grid grid-cols-2 gap-2">
                                    {([
                                       { v: 'none', label: 'Una vez' },
                                       { v: 'weekly', label: 'Semanal' },
                                       { v: 'monthly', label: 'Mensual' },
                                       { v: 'permanent', label: 'Permanente' },
                                    ] as const).map(opt => (
                                       <button key={opt.v} onClick={() => setBlockRecurrence(opt.v)}
                                          className={`py-2.5 rounded-xl border-2 text-xs font-black uppercase tracking-widest transition-all ${blockRecurrence === opt.v ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                                          {opt.label}
                                       </button>
                                    ))}
                                 </div>

                                 {/* Días de la semana (solo weekly/permanent) */}
                                 {(blockRecurrence === 'weekly' || blockRecurrence === 'permanent') && (
                                    <div className="mt-3">
                                       <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Días</label>
                                       <div className="flex gap-1.5">
                                          {['D','L','M','X','J','V','S'].map((d, i) => (
                                             <button key={i} onClick={() => setBlockDaysOfWeek(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                                                className={`w-9 h-9 rounded-xl text-xs font-black border-2 transition-all ${blockDaysOfWeek.includes(i) ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                                                {d}
                                             </button>
                                          ))}
                                       </div>
                                    </div>
                                 )}

                                 {/* Fecha de fin (no en permanente) */}
                                 {blockRecurrence !== 'none' && blockRecurrence !== 'permanent' && (
                                    <div className="mt-3">
                                       <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Hasta (opcional)</label>
                                       <input type="date" value={blockEndsAt} onChange={e => setBlockEndsAt(e.target.value)}
                                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-all" />
                                    </div>
                                 )}
                              </div>

                              {/* ── 4. DETALLE ── */}
                              <div className="grid grid-cols-2 gap-3">
                                 <div>
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Duración</label>
                                    <div className="flex gap-1.5">
                                       {[30,45,60,90].map(d => (
                                          <button key={d} onClick={() => setBlockDuration(d)}
                                             className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all ${blockDuration === d ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                                             {d}m
                                          </button>
                                       ))}
                                    </div>
                                 </div>
                                 <div>
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Motivo</label>
                                    <input value={blockNote} onChange={e => setBlockNote(e.target.value)}
                                       className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 font-bold text-xs text-black focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-all placeholder:text-slate-400"
                                       placeholder="Ej: Reunión..." />
                                 </div>
                              </div>

                              {/* Resumen dinámico */}
                              {blockTimes.length > 0 && (
                                 <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Resumen</p>
                                    <p className="text-xs font-bold text-slate-800">
                                       {blockTimes.length} hora{blockTimes.length > 1 ? 's' : ''}
                                       {blockRecurrence === 'none' && blockDate ? ` el ${blockDate}` : ''}
                                       {blockRecurrence === 'weekly' && ` cada ${blockDaysOfWeek.length > 0 ? blockDaysOfWeek.map(d => ['D','L','M','X','J','V','S'][d]).join('/') : 'día seleccionado'} por 12 semanas`}
                                       {blockRecurrence === 'monthly' && ` el mismo día por 6 meses`}
                                       {blockRecurrence === 'permanent' && ` cada semana durante 1 año`}
                                       {blockMode === 'remote_only' ? ' · Solo Remoto' : blockMode === 'presential_only' ? ' · Solo Presencial' : ''}
                                    </p>
                                 </div>
                              )}

                              <button onClick={handleApplySmartBlock} disabled={blockTimes.length === 0 || blockApplying}
                                 className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-[0.05em] border-b-4 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-3 ${blockTimes.length > 0 && !blockApplying ? 'bg-slate-900 text-white border-slate-800 shadow-pop' : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'}`}>
                                 {blockApplying
                                    ? <><span className="inline-block w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" /> Aplicando...</>
                                    : <><span className="material-icons-round text-lg text-rose-400">block</span>
                                       Bloquear {blockTimes.length > 0 ? `${blockTimes.length} hora${blockTimes.length > 1 ? 's' : ''}` : 'horarios'}</>
                                 }
                              </button>
                           </div>
                        )}
                     </div>
                  </div>
               </div>
            )}

            {/* MODAL EDICIÓN */}
            {isEditModalOpen && editingApp && (
               <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[100] flex items-start lg:items-center justify-center p-3 pt-6 lg:p-6">
                  {/* Altura acotada y desplazamiento DENTRO de la tarjeta: antes el que
                      se desplazaba era el fondo, y en el teléfono el final del contenido
                      —contacto, crear ficha, agendar próxima sesión— quedaba tapado por
                      la barra de navegación inferior y era inalcanzable.
                      El alto descuenta la barra inferior (~76px) para que el borde de la
                      tarjeta no quede por detrás de ella; dvh en vez de vh porque el
                      navegador móvil oculta y muestra su propia barra. */}
                  <div className="bg-white w-full max-w-lg rounded-blob-lg shadow-modal border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[calc(100dvh-8rem)] lg:max-h-[92vh]">
                     <div className={`shrink-0 p-5 lg:p-10 ${editingApp.status === 'Bloqueado' ? 'bg-slate-800' : (editingApp.color || 'bg-primary')} text-white relative flex flex-col items-center text-center`}>
                        <button onClick={() => setIsEditModalOpen(false)} className="absolute top-4 right-4 lg:top-6 lg:right-6 w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all active:scale-95"><span className="material-icons-round text-2xl">close</span></button>
                        <div className="w-14 h-14 lg:w-20 lg:h-20 rounded-blob-2xs bg-white/20 flex items-center justify-center font-black text-2xl lg:text-4xl mb-3 lg:mb-6 shadow-xl backdrop-blur-md border border-white/20">{editingApp.patientName.charAt(0)}</div>
                        <h3 className="text-xl lg:text-3xl font-black tracking-tight mb-2 lg:mb-3">{editingApp.patientName}</h3>
                        <div className="flex items-center gap-2 lg:gap-3 opacity-90 border border-white/20 px-3 lg:px-4 py-1.5 lg:py-2 rounded-xl bg-white/10 backdrop-blur-sm shadow-sm">
                           <span className="material-icons-round text-sm">schedule</span>
                           <p className="text-[11px] font-black uppercase tracking-widest">{editingApp.time} • {editingApp.date}</p>
                        </div>
                     </div>

                     <div className="flex-1 overflow-y-auto p-5 lg:p-10 pb-24 lg:pb-10 space-y-5 lg:space-y-8">
                        <div className="grid grid-cols-2 gap-4">
                           {(['Confirmado', 'Llegado', 'En Sesión', 'Finalizado'] as const).map(s => (
                              <button key={s} onClick={() => handleStatusChange(s)} className={`py-3 lg:py-4 rounded-xl text-[11px] font-black uppercase tracking-widest border-b-[3px] active:border-b-0 active:translate-y-[3px] transition-all shadow-sm flex items-center justify-center gap-2 ${editingApp.status === s ? 'bg-emerald-500 border-emerald-700 text-white scale-[1.02]' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 hover:text-black hover:bg-slate-100'}`}>
                                 {editingApp.status === s && <span className="material-icons-round text-sm">check_circle</span>}
                                 {s}
                              </button>
                           ))}
                           <button
                              onClick={() => handleStatusChange('Cancelado')}
                              className={`col-span-2 py-4 rounded-xl text-[11px] font-black uppercase tracking-widest border-b-[3px] active:border-b-0 active:translate-y-[3px] transition-all shadow-sm flex items-center justify-center gap-2 ${
                                 editingApp.status === 'Cancelado'
                                    ? 'bg-rose-500 border-rose-700 text-white scale-[1.02]'
                                    : 'bg-rose-50 border-rose-200 text-rose-400 hover:bg-rose-500 hover:border-rose-600 hover:text-white'
                              }`}
                           >
                              {editingApp.status === 'Cancelado' && <span className="material-icons-round text-sm">check_circle</span>}
                              <span className="material-icons-round text-sm">cancel</span>
                              Cancelar Cita
                           </button>
                        </div>

                        {editingApp.status !== 'Bloqueado' && (
                           <div className={`rounded-2xl border-2 p-5 flex items-center justify-between transition-all
                              ${editingApp.paymentStatus === 'Pagado' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                              <div className="flex items-center gap-3">
                                 <span className={`material-icons-round text-2xl ${editingApp.paymentStatus === 'Pagado' ? 'text-emerald-500' : 'text-amber-500'}`}>
                                    {editingApp.paymentStatus === 'Pagado' ? 'check_circle' : 'pending'}
                                 </span>
                                 <div>
                                    <p className={`text-sm font-black ${editingApp.paymentStatus === 'Pagado' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                       {editingApp.paymentStatus === 'Pagado' ? 'Pago Recibido' : 'Pago Pendiente'}
                                    </p>
                                    <p className="text-xs font-semibold text-slate-500">${editingApp.price?.toLocaleString('es-CL') || '0'}</p>
                                 </div>
                              </div>
                              <button
                                 onClick={() => {
                                    const markingAsPaid = editingApp.paymentStatus !== 'Pagado';
                                    const updatedApp = {
                                       ...editingApp,
                                       paymentStatus: markingAsPaid ? 'Pagado' : 'Pendiente',
                                       paidAt: markingAsPaid ? new Date().toISOString() : undefined
                                    } as Appointment;
                                    setEditingApp(updatedApp);
                                    updateAppointment(updatedApp);

                                    // Enviar comprobante de pago al paciente al marcar como Pagado
                                    if (markingAsPaid && loggedPro?.email) {
                                       const pat = patients.find(p => p.id === editingApp.patientId);
                                       if (pat?.email) {
                                          fetch('/api/notify', {
                                             method: 'POST',
                                             headers: { 'Content-Type': 'application/json' },
                                             body: JSON.stringify({
                                                to: loggedPro.email,
                                                professionalName: loggedPro.name,
                                                patientName: editingApp.patientName,
                                                serviceName: editingApp.serviceName,
                                                date: editingApp.date,
                                                time: editingApp.time,
                                                type: editingApp.type,
                                                patientEmail: pat.email,
                                                isReceipt: true,
                                                price: editingApp.price
                                             })
                                          }).catch(() => {});
                                       }
                                    }
                                 }}
                                 className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 border-b-2
                                    ${editingApp.paymentStatus === 'Pagado'
                                       ? 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                                       : 'bg-emerald-500 text-white border-emerald-700 hover:bg-emerald-600 shadow-md'}`}
                              >
                                 {editingApp.paymentStatus === 'Pagado' ? 'Revertir' : 'Marcar Pagado'}
                              </button>
                           </div>
                        )}

                        <div className="mt-8 flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                           <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest pl-2">Color:</label>
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

                        {/* Datos de contacto del paciente. Una reserva hecha desde la web
                            no trae patientId (el paciente aún no existe como ficha), así que
                            antes este bloque entero desaparecía y el profesional se quedaba
                            sin forma de contactarlo pese a tener el pago cobrado. */}
                        {editingApp.status !== 'Bloqueado' && (editingApp.patientEmail || editingApp.patientPhone) && (
                           <div className="pt-4 space-y-2">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block ml-1">Contacto del paciente</label>
                              {editingApp.patientEmail && (
                                 <a href={`mailto:${editingApp.patientEmail}`} className="flex items-center gap-2 px-4 py-3 bg-slate-50 rounded-xl text-sm font-semibold text-slate-700 break-all hover:bg-slate-100 transition-colors">
                                    <span className="material-icons-round text-base text-slate-400 shrink-0">mail</span>
                                    {editingApp.patientEmail}
                                 </a>
                              )}
                              {editingApp.patientPhone && (
                                 <a href={`tel:${editingApp.patientPhone}`} className="flex items-center gap-2 px-4 py-3 bg-slate-50 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
                                    <span className="material-icons-round text-base text-slate-400 shrink-0">call</span>
                                    {editingApp.patientPhone}
                                 </a>
                              )}
                           </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                           {editingApp.status !== 'Bloqueado' && editingApp.patientId && (
                              <button onClick={() => navigate(`/pro/record/${editingApp.patientId}`)} className="py-5 bg-slate-50 text-slate-600 border-b-[3px] border-slate-200 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:bg-slate-900 hover:border-slate-800 hover:text-white active:border-b-0 active:translate-y-[3px] shadow-sm"><span className="material-icons-round text-lg">description</span> Ficha Médica</button>
                           )}
                           {editingApp.status !== 'Bloqueado' && (
                              <button onClick={agendarProximaSesion}
                                 className="py-5 bg-slate-50 text-slate-600 border-b-[3px] border-slate-200 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:bg-slate-900 hover:border-slate-800 hover:text-white active:border-b-0 active:translate-y-[3px] shadow-sm">
                                 <span className="material-icons-round text-lg">event_repeat</span> Agendar próxima sesión
                              </button>
                           )}
                           {editingApp.status !== 'Bloqueado' && !editingApp.patientId && (
                              <button onClick={crearFichaDesdeCita} disabled={creandoFicha}
                                 className="py-5 bg-primary/10 text-primary border-b-[3px] border-primary/30 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:bg-primary hover:border-primary hover:text-white active:border-b-0 active:translate-y-[3px] shadow-sm disabled:opacity-60">
                                 <span className="material-icons-round text-lg">person_add</span>
                                 {creandoFicha ? 'Creando…' : 'Crear ficha'}
                              </button>
                           )}
                           {editingApp.status === 'Bloqueado' && editingApp.recurrenceId ? (
                              <div className="col-span-2 space-y-3">
                                 <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block ml-1">Eliminar bloqueo</label>
                                 <div className="flex flex-col gap-2">
                                    {([
                                       { v: 'single', label: 'Solo este bloque', icon: 'event_busy' },
                                       { v: 'future', label: 'Este y los siguientes', icon: 'date_range' },
                                       { v: 'all', label: 'Toda la serie', icon: 'delete_sweep' },
                                    ] as const).map(opt => (
                                       <button key={opt.v} onClick={() => setDeleteRecurrenceMode(opt.v)}
                                          className={`py-3 px-4 rounded-xl text-[11px] font-black uppercase tracking-widest border-2 transition-all flex items-center gap-2 ${deleteRecurrenceMode === opt.v ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                                          <span className="material-icons-round text-sm">{opt.icon}</span>
                                          {opt.label}
                                       </button>
                                    ))}
                                 </div>
                                 <button onClick={async () => {
                                    if (!editingApp.recurrenceId) return;
                                    if (!window.confirm('¿Confirmas eliminar el/los bloqueo(s) seleccionados?')) return;
                                    await deleteAppointmentsByRecurrence(editingApp.recurrenceId, deleteRecurrenceMode, editingApp.id, editingApp.date);
                                    setIsEditModalOpen(false); setEditingApp(null);
                                 }} className="w-full py-4 bg-rose-500 text-white border-b-[3px] border-rose-700 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:brightness-110 active:border-b-0 active:translate-y-[3px] shadow-sm">
                                    <span className="material-icons-round text-lg">delete</span>
                                    Eliminar bloqueo{deleteRecurrenceMode === 'all' ? 's' : ''}
                                 </button>
                              </div>
                           ) : (
                              <button onClick={deleteAppointment} className="py-5 bg-rose-50 text-rose-500 border-b-[3px] border-rose-200 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:bg-rose-500 hover:border-rose-600 hover:text-white active:border-b-0 active:translate-y-[3px] shadow-sm"><span className="material-icons-round text-lg">delete</span> Anular Evento</button>
                           )}
                           {editingApp.patientPhone && editingApp.status !== 'Bloqueado' && (
                              <a
                                 href={`https://wa.me/${editingApp.patientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${editingApp.patientName}, te recordamos tu cita el ${editingApp.date} a las ${editingApp.time}. ¡Te esperamos!`)}`}
                                 target="_blank"
                                 rel="noreferrer"
                                 className="py-5 bg-[#25D366] text-white border-b-[3px] border-green-700 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:brightness-110 active:border-b-0 active:translate-y-[3px] shadow-sm"
                              >
                                 <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                 </svg>
                                 Recordatorio WA
                              </a>
                           )}
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
