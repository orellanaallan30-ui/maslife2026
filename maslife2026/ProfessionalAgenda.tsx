import React, { useState, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Appointment, Patient } from '../types';
import { useClinic } from '../ClinicContext';

const ProfessionalAgenda: React.FC = () => {
  const navigate = useNavigate();
  const { appointments, patients, setAppointments, addPatient, loggedPro } = useClinic();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showModal, setShowModal] = useState(false);
  const [editingApp, setEditingApp] = useState<Appointment | null>(null);
  
  const [formData, setFormData] = useState({
    patientName: '',
    patientPhone: '',
    serviceName: '',
    time: '',
    duration: 45,
    type: 'Presencial' as 'Presencial' | 'Online' | 'Domicilio',
    notes: ''
  });

  if (!loggedPro) return <Navigate to="/pro/login" />;

  const todayAppointments = useMemo(() => 
    appointments
      .filter(a => a.professionalId === loggedPro.id && a.date === selectedDate)
      .sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, selectedDate, loggedPro.id]
  );

  const handleOpenModal = (app?: Appointment) => {
    if (app) {
      setEditingApp(app);
      setFormData({
        patientName: app.patientName,
        patientPhone: app.patientPhone || '',
        serviceName: app.serviceName,
        time: app.time,
        duration: app.duration,
        type: app.type as any,
        notes: app.notes || ''
      });
    } else {
      setEditingApp(null);
      setFormData({
        patientName: '',
        patientPhone: '',
        serviceName: loggedPro.services[0]?.name || '',
        time: '09:00',
        duration: 45,
        type: 'Presencial',
        notes: ''
      });
    }
    setShowModal(true);
  };

  const handleSaveAppointment = () => {
    if (!formData.patientName || !formData.time) {
      alert('Completa al menos el nombre del paciente y la hora');
      return;
    }

    const service = loggedPro.services.find(s => s.name === formData.serviceName) || loggedPro.services[0];

    if (editingApp) {
      // Editar cita existente
      setAppointments(prev => prev.map(a => 
        a.id === editingApp.id 
          ? { ...a, ...formData, date: selectedDate, price: service?.price || 0 }
          : a
      ));
    } else {
      // Nueva cita
      const newApp: Appointment = {
        id: `app-${Date.now()}`,
        patientId: undefined,
        patientName: formData.patientName,
        patientPhone: formData.patientPhone,
        doctorName: loggedPro.name,
        specialty: loggedPro.specialty,
        serviceName: formData.serviceName,
        date: selectedDate,
        time: formData.time,
        duration: formData.duration,
        type: formData.type,
        status: 'Confirmado',
        price: service?.price || 0,
        paymentStatus: 'Pendiente',
        category: 'Medical',
        professionalId: loggedPro.id,
        notes: formData.notes
      };
      setAppointments(prev => [...prev, newApp]);
    }

    setShowModal(false);
  };

  const handleDeleteAppointment = (id: string) => {
    if (confirm('¿Eliminar esta cita?')) {
      setAppointments(prev => prev.filter(a => a.id !== id));
    }
  };

  const getStatusColor = (status: Appointment['status']) => {
    const colors: Record<string, string> = {
      'Confirmado': 'bg-teal-100 text-teal-700 border-teal-200',
      'Pendiente': 'bg-amber-100 text-amber-700 border-amber-200',
      'Finalizado': 'bg-slate-100 text-slate-700 border-slate-200',
      'Cancelado': 'bg-rose-100 text-rose-700 border-rose-200',
      'En Sesión': 'bg-indigo-100 text-indigo-700 border-indigo-200',
      'Llegado': 'bg-emerald-100 text-emerald-700 border-emerald-200'
    };
    return colors[status] || colors['Confirmado'];
  };

  return (
    <div className="flex-1 w-full h-full overflow-hidden bg-slate-50">
      <main className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight">Agenda</h1>
              <p className="text-slate-500 font-bold mt-2 text-sm">Gestiona tus citas y horarios</p>
            </div>
            <button
              onClick={() => handleOpenModal()}
              className="px-6 py-3 bg-teal-500 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-teal-600 transition-all shadow-lg"
            >
              <span className="material-icons-round text-sm align-middle mr-2">add</span>
              Nueva Cita
            </button>
          </div>

          {/* Selector de Fecha */}
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-lg mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-black text-slate-900">Selecciona el Día</h2>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold focus:border-teal-500 transition-all"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map(offset => {
                const d = new Date();
                d.setDate(d.getDate() + offset);
                const dateStr = d.toISOString().split('T')[0];
                const isSelected = dateStr === selectedDate;
                const dayName = offset === 0 ? 'Hoy' : offset === 1 ? 'Mañana' : d.toLocaleDateString('es-ES', { weekday: 'short' });
                const dateLabel = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

                return (
                  <button
                    key={offset}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`p-6 rounded-2xl border-2 transition-all ${
                      isSelected 
                        ? 'bg-teal-500 border-teal-500 text-white shadow-xl' 
                        : 'bg-slate-50 border-slate-100 text-slate-700 hover:border-teal-300'
                    }`}
                  >
                    <p className="text-xs font-black uppercase mb-1">{dayName}</p>
                    <p className="text-2xl font-black">{dateLabel}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lista de Citas */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-2xl font-black text-slate-900">
                Citas del {new Date(selectedDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
              </h2>
              <span className="text-sm font-bold text-slate-500">{todayAppointments.length} citas</span>
            </div>

            <div className="divide-y divide-slate-100">
              {todayAppointments.length > 0 ? todayAppointments.map(app => (
                <div key={app.id} className="p-6 hover:bg-slate-50 transition-colors flex justify-between items-center group">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-14 h-14 bg-teal-500 text-white rounded-2xl flex items-center justify-center font-black text-xl">
                      {app.patientName.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="font-black text-slate-900 text-lg">{app.patientName}</p>
                      <p className="text-sm text-slate-600 font-medium">{app.serviceName} • {app.type}</p>
                      {app.patientPhone && (
                        <p className="text-xs text-slate-400 font-medium mt-1">📱 {app.patientPhone}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-slate-900">{app.time}</p>
                      <p className="text-xs text-slate-500 font-bold">{app.duration} min</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 ml-6">
                    <span className={`px-4 py-2 rounded-xl text-xs font-black uppercase border ${getStatusColor(app.status)}`}>
                      {app.status}
                    </span>
                    <button
                      onClick={() => handleOpenModal(app)}
                      className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center hover:bg-teal-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                    >
                      <span className="material-icons-round text-lg">edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteAppointment(app.id)}
                      className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                    >
                      <span className="material-icons-round text-lg">delete</span>
                    </button>
                  </div>
                </div>
              )) : (
                <div className="p-24 text-center">
                  <div className="w-24 h-24 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <span className="material-icons-round text-slate-300 text-5xl">event_busy</span>
                  </div>
                  <p className="text-slate-400 font-black text-sm uppercase tracking-widest">No hay citas para este día</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Modal Nueva/Editar Cita - POSICIONADO MÁS ARRIBA */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-start justify-center pt-20 overflow-y-auto pb-20">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-8 shadow-2xl mx-6 my-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-900">
                {editingApp ? 'Editar Cita' : 'Nueva Cita'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center hover:bg-rose-100 hover:text-rose-600 transition-all"
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">
                    Nombre del Paciente
                  </label>
                  <input
                    type="text"
                    value={formData.patientName}
                    onChange={e => setFormData({ ...formData, patientName: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                    placeholder="Juan Pérez"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={formData.patientPhone}
                    onChange={e => setFormData({ ...formData, patientPhone: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                    placeholder="+56 9 1234 5678"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">
                    Servicio
                  </label>
                  <select
                    value={formData.serviceName}
                    onChange={e => setFormData({ ...formData, serviceName: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                  >
                    {loggedPro.services.map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">
                    Hora
                  </label>
                  <input
                    type="time"
                    value={formData.time}
                    onChange={e => setFormData({ ...formData, time: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">
                    Duración (min)
                  </label>
                  <input
                    type="number"
                    value={formData.duration}
                    onChange={e => setFormData({ ...formData, duration: Number(e.target.value) })}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">
                    Modalidad
                  </label>
                  <select
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                  >
                    <option value="Presencial">Presencial</option>
                    <option value="Online">Online</option>
                    <option value="Domicilio">Domicilio</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">
                  Notas (opcional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all resize-none"
                  placeholder="Información adicional..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveAppointment}
                  className="flex-1 py-3 bg-teal-500 text-white rounded-xl font-black hover:bg-teal-600 transition-all shadow-lg"
                >
                  {editingApp ? 'Guardar Cambios' : 'Crear Cita'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfessionalAgenda;
