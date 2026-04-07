import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Appointment, Service } from '../types';
import { useClinic } from '../ClinicContext';

interface PatientFormData {
  fullName: string;
  rut: string;
  gender: string;
  age: string;
  address: string;
  city: string;
  reason: string;
  phone: string;
  email: string;
}

const PatientProfile: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { professionals, appointments, addAppointment } = useClinic();
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [formData, setFormData] = useState<PatientFormData>({
    fullName: '',
    rut: '',
    gender: '',
    age: '',
    address: '',
    city: '',
    reason: '',
    phone: '',
    email: ''
  });

  const doctor = professionals.find(p => p.id === id || p.slug === id);

  if (!doctor) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-20">
        <span className="material-icons-round text-slate-200 text-6xl mb-4">error_outline</span>
        <p className="text-slate-500 font-bold text-xl">Profesional no encontrado o no disponible.</p>
        <button onClick={() => navigate('/patient/results')} className="mt-6 text-primary font-black uppercase tracking-widest text-xs">Volver a la búsqueda</button>
      </div>
    );
  }

  const availableDays = useMemo(() => {
    const daysArr = [];
    const today = new Date();

    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayIdx = d.getDay();

      const defaultSched = { active: dayIdx !== 0 && dayIdx !== 6, start: '09:00', end: '18:00' };
      const sched = doctor.schedule?.[dayIdx] || defaultSched;

      if (sched.active) {
        const dateStr = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        const name = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-ES', { weekday: 'short' });

        const slots: string[] = [];
        const [startH] = sched.start.split(':').map(Number);
        const [endH] = sched.end.split(':').map(Number);

        for (let h = startH; h < endH; h++) {
          const timeStr = `${String(h).padStart(2, '0')}:00`;
          const isBusy = appointments.some(a => a.professionalId === doctor.id && a.date === dateStr && a.time === timeStr);
          if (!isBusy) slots.push(timeStr);
        }

        if (slots.length > 0) {
          daysArr.push({ name, date: dateStr, label, slots });
        }
      }
    }
    return daysArr;
  }, [doctor, appointments]);

  const handleProceedToForm = () => {
    if (!selectedSlot || !selectedService) return;
    setShowCheckoutForm(true);
  };

  const handleConfirmBooking = async () => {
    if (!selectedService || !selectedSlot || !formData.fullName || !formData.phone) {
      alert('Por favor completa al menos tu nombre y teléfono');
      return;
    }
    
    setIsProcessing(true);
    
    const newApp: Appointment = {
      id: Math.random().toString(36).substr(2, 9),
      patientId: 'p-guest',
      patientName: formData.fullName,
      patientPhone: formData.phone,
      doctorName: doctor.name,
      specialty: doctor.specialty,
      serviceName: selectedService.name,
      date: availableDays[selectedDay].date,
      time: selectedSlot!,
      duration: selectedService.duration,
      type: 'Online',
      status: doctor.paymentEnabled ? 'Pendiente' : 'Confirmado',
      price: selectedService.price,
      paymentStatus: doctor.paymentEnabled ? 'Pendiente' : 'Pagado',
      category: 'Medical',
      professionalId: doctor.id,
      bookingSource: 'web',
      notes: `RUT: ${formData.rut}, Edad: ${formData.age}, Género: ${formData.gender}, Ciudad: ${formData.city}, Motivo: ${formData.reason}`
    };

    try {
      await addAppointment(newApp);
      
      if (doctor.paymentEnabled && doctor.subscriptionLink) {
        window.open(doctor.subscriptionLink, '_blank');
      }

      setIsProcessing(false);
      setIsConfirmed(true);
      
      setTimeout(() => {
        setShowCheckoutForm(false);
        navigate('/patient/search');
      }, 3000);
    } catch (error) {
      console.error("Error booking appointment:", error);
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full bg-[#f8fafc] overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <header className="mb-12">
          <button onClick={() => navigate(-1)} className="flex items-center gap-3 text-slate-500 hover:text-primary font-black text-xs uppercase tracking-[0.2em] transition-all">
            <span className="material-icons-round text-sm">arrow_back</span>
            Volver a la búsqueda
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-8 space-y-8">
            {/* Cabecera Médico */}
            <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-slate-100 flex flex-col md:flex-row gap-10 items-center">
              <img className="w-40 h-40 rounded-[2.5rem] object-cover border-4 border-slate-50 shadow-xl" src={doctor.avatar || 'https://picsum.photos/seed/doc/400/400'} alt="Doctor" />
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">{doctor.name}</h1>
                <p className="text-lg font-bold text-primary mb-4">{doctor.specialty}</p>
                <div className="flex gap-4">
                  <span className="text-xs font-black text-emerald-500 uppercase bg-emerald-50 px-3 py-1 rounded-lg">Disponible Hoy</span>
                  <span className="text-xs font-black text-slate-500 uppercase border border-slate-100 px-3 py-1 rounded-lg">Agenda Sincronizada</span>
                </div>
              </div>
            </div>

            {/* PASO 1: Selección de Fecha y Hora (ARRIBA) */}
            <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-slate-100">
              <h3 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-3">
                <span className="w-8 h-8 bg-teal-500 text-white rounded-xl flex items-center justify-center text-sm font-black">1</span>
                Selecciona tu horario
              </h3>
              <div className="flex gap-3 mb-8 overflow-x-auto pb-2 hide-scrollbar">
                {availableDays.length > 0 ? availableDays.map((day, i) => (
                  <button
                    key={i}
                    onClick={() => { setSelectedDay(i); setSelectedSlot(null); }}
                    className={`flex-1 min-w-[120px] py-6 px-4 rounded-[2rem] flex flex-col items-center gap-2 border-2 transition-all ${selectedDay === i ? 'border-primary bg-primary/5 text-primary' : 'border-slate-50 bg-slate-50 text-slate-500'}`}
                  >
                    <span className="text-xs font-black uppercase">{day.name}</span>
                    <span className="text-xl font-black tracking-tighter">{day.label}</span>
                  </button>
                )) : (
                  <p className="text-slate-500 font-bold italic py-4">No hay días disponibles en las próximas 2 semanas.</p>
                )}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {availableDays[selectedDay]?.slots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => setSelectedSlot(slot)}
                    className={`py-4 rounded-2xl text-xs font-black transition-all border-2 ${selectedSlot === slot ? 'bg-primary border-primary text-white shadow-xl' : 'bg-white border-slate-100 text-slate-700 hover:border-primary'}`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>

            {/* PASO 2: Selección de Servicio */}
            {selectedSlot && (
              <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-slate-100 animate-in slide-in-from-top duration-500">
                <h3 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-3">
                  <span className="w-8 h-8 bg-teal-500 text-white rounded-xl flex items-center justify-center text-sm font-black">2</span>
                  ¿Qué atención necesitas?
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {doctor.services.length > 0 ? doctor.services.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedService(s)}
                      className={`p-6 rounded-[2rem] border-2 text-left transition-all ${selectedService?.id === s.id ? 'border-primary bg-primary/5 shadow-lg' : 'border-slate-50 bg-slate-50 hover:border-slate-200'}`}
                    >
                      {s.image && <img src={s.image} alt={s.name} className="w-full h-32 rounded-xl object-cover mb-4" />}
                      <h4 className="font-black text-slate-900 mb-1">{s.name}</h4>
                      <p className="text-xs text-slate-500 font-bold mb-4 line-clamp-2">{s.description}</p>
                      <div className="flex justify-between items-end">
                        <span className="text-lg font-black text-primary">${s.price.toLocaleString('es-CL')}</span>
                        <span className="text-xs font-black text-slate-500 uppercase">{s.duration} MIN</span>
                      </div>
                    </button>
                  )) : (
                    <p className="col-span-2 text-center text-slate-500 font-bold italic py-10">No hay servicios configurados actualmente.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Resumen Sidebar */}
          <div className="lg:col-span-4">
            <div className="bg-white rounded-[3rem] p-10 shadow-2xl border border-slate-200/50 sticky top-24">
              <h3 className="text-xl font-black text-slate-900 mb-8">Resumen Cita</h3>
              <div className="space-y-6 mb-10">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Servicio</span>
                  <span className="text-sm font-black text-slate-800">{selectedService?.name || '---'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Horario</span>
                  <span className="text-sm font-black text-slate-800">{selectedSlot ? `${availableDays[selectedDay]?.label} @ ${selectedSlot}` : '---'}</span>
                </div>
                <div className="h-px bg-slate-100"></div>
                <div className="flex justify-between items-end">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Total</span>
                  <span className="text-3xl font-black text-slate-900 tracking-tighter">${selectedService?.price.toLocaleString('es-CL') || '0'}</span>
                </div>
              </div>
              <button
                disabled={!selectedSlot || !selectedService}
                onClick={handleProceedToForm}
                className="w-full py-5 bg-primary text-white font-black rounded-[1.8rem] shadow-xl shadow-primary/20 disabled:opacity-30 transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-3"
              >
                CONTINUAR
                <span className="material-icons-round text-sm">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Formulario de Checkout */}
      {showCheckoutForm && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-[3.5rem] p-12 shadow-2xl my-8">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-3xl font-black text-slate-900">Completa tus datos</h3>
              <button onClick={() => setShowCheckoutForm(false)} className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center hover:bg-rose-100 hover:text-rose-600 transition-all">
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">
                  Nombre Completo <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Juan Pérez González"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">RUT</label>
                <input
                  type="text"
                  value={formData.rut}
                  onChange={e => setFormData({ ...formData, rut: e.target.value })}
                  placeholder="12.345.678-9"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Edad</label>
                <input
                  type="number"
                  value={formData.age}
                  onChange={e => setFormData({ ...formData, age: e.target.value })}
                  placeholder="30"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Género</label>
                <select
                  value={formData.gender}
                  onChange={e => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                >
                  <option value="">Seleccionar</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Ciudad</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={e => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Santiago"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Dirección</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Av. Libertador 1234, Depto 56"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">
                  Teléfono <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+56 9 1234 5678"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="correo@ejemplo.com"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">Motivo de Consulta</label>
                <textarea
                  value={formData.reason}
                  onChange={e => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Describe brevemente el motivo de tu consulta..."
                  rows={3}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-medium focus:border-teal-500 transition-all resize-none"
                />
              </div>
            </div>

            <div className="mt-8 flex gap-4">
              <button
                onClick={() => setShowCheckoutForm(false)}
                className="flex-1 py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-all"
              >
                Volver
              </button>
              <button
                onClick={handleConfirmBooking}
                disabled={isProcessing || !formData.fullName || !formData.phone}
                className="flex-1 py-4 bg-primary text-white rounded-2xl font-black hover:bg-teal-600 disabled:opacity-50 transition-all shadow-xl"
              >
                {isProcessing ? 'Procesando...' : doctor.paymentEnabled ? 'PAGAR Y AGENDAR' : 'CONFIRMAR CITA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isConfirmed && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-xl rounded-[3.5rem] p-12 shadow-2xl text-center">
            <div className="w-24 h-24 bg-emerald-500 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-500/30 animate-bounce">
              <span className="material-icons-round text-6xl">check_circle</span>
            </div>
            <h3 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">¡Cita agendada!</h3>
            <p className="text-slate-500 font-bold mb-8 text-lg">
              {doctor.paymentEnabled 
                ? 'Te hemos redirigido al link de pago. Tu cita quedará confirmada una vez se procese el cobro.'
                : `El profesional ${doctor.name} te espera el ${availableDays[selectedDay]?.label} a las ${selectedSlot}.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientProfile;
