import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Appointment, Service } from '../types';
import { useClinic } from '../ClinicContext';

const PatientProfile: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { professionals, appointments, addAppointment } = useClinic();
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Buscar el profesional real de la lista centralizada
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

  // Generar días disponibles basados en el horario real del profesional
  const availableDays = useMemo(() => {
    const daysArr = [];
    const today = new Date();

    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayIdx = d.getDay(); // 0: Sun, 1: Mon...

      // Horario por defecto si no existe (Lun-Vie 09-18)
      const defaultSched = { active: dayIdx !== 0 && dayIdx !== 6, start: '09:00', end: '18:00' };
      const sched = doctor.schedule?.[dayIdx] || defaultSched;

      if (sched.active) {
        const dateStr = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        const name = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-ES', { weekday: 'short' });

        // Generar slots cada 60 min
        const slots: string[] = [];
        const [startH] = sched.start.split(':').map(Number);
        const [endH] = sched.end.split(':').map(Number);

        for (let h = startH; h < endH; h++) {
          const timeStr = `${String(h).padStart(2, '0')}:00`;
          // Filtrar si ya está ocupado
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

  const handleConfirmBooking = async () => {
    if (!selectedService || !selectedSlot || availableDays.length === 0) return;
    
    setIsProcessing(true);
    
    // Simular guardado en DB
    const newApp: Appointment = {
      id: Math.random().toString(36).substr(2, 9),
      patientId: 'p-guest',
      patientName: 'Paciente Invitado',
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
      bookingSource: 'web'
    };

    try {
      await addAppointment(newApp);
      
      if (doctor.paymentEnabled && doctor.subscriptionLink) {
        // Redirigir al link de cobro del profesional
        window.open(doctor.subscriptionLink, '_blank');
      }

      setIsProcessing(false);
      setIsConfirmed(true);
      
      setTimeout(() => {
        setIsCheckoutOpen(false);
        navigate('/patient/search');
      }, 3000);
    } catch (error) {
      console.error("Error booking appointment:", error);
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full bg-[#f8fafc] overflow-y-auto animate-in fade-in duration-700">
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

            {/* Selección de Servicio */}
            <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-slate-100">
              <h3 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-3">
                <span className="material-icons-round text-primary">medical_services</span>
                ¿Qué atención necesitas?
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {doctor.services.length > 0 ? doctor.services.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedService(s); setSelectedSlot(null); }}
                    className={`p-6 rounded-[2rem] border-2 text-left transition-all ${selectedService?.id === s.id ? 'border-primary bg-primary/5 shadow-lg' : 'border-slate-50 bg-slate-50 hover:border-slate-200'}`}
                  >
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

            {/* Calendario (Solo visible si hay servicio seleccionado) */}
            {selectedService && (
              <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-slate-100 animate-in slide-in-from-top-10 duration-500">
                <h3 className="text-xl font-black text-slate-900 mb-8">Selecciona tu horario para {selectedService.name}</h3>
                <div className="flex gap-3 mb-8 overflow-x-auto pb-2">
                  {availableDays.length > 0 ? availableDays.map((day, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedDay(i)}
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
                disabled={!selectedSlot}
                onClick={handleConfirmBooking}
                className="w-full py-5 bg-primary text-white font-black rounded-[1.8rem] shadow-xl shadow-primary/20 disabled:opacity-30 transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-3"
              >
                {isProcessing ? 'Procesando...' : doctor.paymentEnabled ? 'PAGAR Y AGENDAR' : 'CONFIRMAR CITA'}
                <span className="material-icons-round text-sm">{doctor.paymentEnabled ? 'payment' : 'check_circle'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {isConfirmed && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-xl rounded-[3.5rem] p-12 shadow-2xl relative overflow-hidden text-center scale-in-center">
            <div className="w-24 h-24 bg-emerald-500 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-500/30 animate-bounce">
              <span className="material-icons-round text-6xl">check_circle</span>
            </div>
            <h3 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">¡Cita agendada!</h3>
            <p className="text-slate-500 font-bold mb-8 text-lg">
              {doctor.paymentEnabled 
                ? 'Te hemos redirigido al link de pago. Tu cita quedará confirmada una vez se procese el cobro.'
                : `El profesional ${doctor.name} te espera el ${availableDays[selectedDay]?.label} a las ${selectedSlot}.`}
            </p>
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 inline-block">
               <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Redirigiendo al inicio...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientProfile;
