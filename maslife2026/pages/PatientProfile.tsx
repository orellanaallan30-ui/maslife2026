import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Appointment, Service, Review } from '../types';
import { useClinic } from '../ClinicContext';
import { getProfessionalBySlugOrId, getAppointments, getProfessionalReviews, getProfessionalRating } from '../supabaseService';

// Clave de localStorage donde se guarda la reserva mientras el paciente paga en
// la página de MercadoPago (Checkout Pro). Se lee al volver por back_urls.
const PENDING_BOOKING_KEY = 'maslife_pending_booking';

const PatientProfile: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { professionals, appointments, addAppointment } = useClinic();

  const localDoctor = professionals.find(p => p.id === id || p.slug === id);
  const [fetchedDoctor, setFetchedDoctor] = useState(localDoctor ?? null);
  const [loadingDoctor, setLoadingDoctor] = useState(!localDoctor);
  // Citas reales del profesional desde Supabase (para bloquear cupos correctamente)
  const [proAppointments, setProAppointments] = useState<Appointment[]>([]);

  // Pasos y formulario — declarados ANTES de todos los useEffects para evitar TDZ
  const [step, setStep] = useState(1);
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedModality, setSelectedModality] = useState<'online' | 'inPerson' | 'home'>('inPerson');
  const [patientData, setPatientData] = useState({
    name: '', rut: '', reason: '', phone: '', email: '', city: '', address: '', houseNumber: ''
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState<{ avg: number; count: number }>({ avg: 0, count: 0 });
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRut, setReviewRut] = useState('');
  const [reviewName, setReviewName] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'idle'|'loading'|'success'|'error'>('idle');
  const [reviewError, setReviewError] = useState('');

  // MercadoPago — pago vía Checkout Pro (página segura de MP). Funciona con
  // cualquier cuenta conectada; el retorno se maneja en el handler mp_return.
  const [mpError, setMpError]       = useState('');
  const [bookingError, setBookingError] = useState('');

  const doctor = fetchedDoctor;
  const bookingFee = doctor?.bookingFee || 5000;
  const paymentAmount = (doctor?.chargeFullService && selectedService)
    ? selectedService.price
    : bookingFee;

  const isFormValid = patientData.name.trim() !== '' &&
                      patientData.rut.trim() !== '' &&
                      patientData.phone.trim() !== '' &&
                      patientData.email.trim() !== '' &&
                      patientData.city.trim() !== '' &&
                      patientData.reason.trim() !== '' &&
                      (selectedModality !== 'home' || (patientData.address.trim() !== '' && patientData.houseNumber.trim() !== ''));

  const availableDays = useMemo(() => {
    if (!doctor) return [];
    const allAppointments = [...appointments, ...proAppointments];
    const daysArr = [];
    const today = new Date();

    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayIdx = d.getDay();

      const defaultSched = { active: dayIdx !== 0 && dayIdx !== 6, start: '09:00', end: '18:00' };
      const raw = doctor.schedule?.[dayIdx];
      const sched = {
        active: raw ? (raw.active ?? false) : defaultSched.active,
        start: (raw?.start) || defaultSched.start,
        end: (raw?.end) || defaultSched.end,
      };

      if (sched.active) {
        const dateStr = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        const name = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-ES', { weekday: 'short' });

        const slots: { time: string; available: boolean }[] = [];
        const startParts = String(sched.start).split(':');
        const endParts   = String(sched.end).split(':');
        const [startH] = startParts.map(Number);
        const [endH]   = endParts.map(Number);

        for (let h = startH; h < endH; h++) {
          const timeStr = `${String(h).padStart(2, '0')}:00`;
          const isBusy = allAppointments.some(a => a.professionalId === doctor.id && a.date === dateStr && a.time === timeStr);
          slots.push({ time: timeStr, available: !isBusy });
        }

        if (slots.length > 0) {
          daysArr.push({ name, date: dateStr, label, slots,
            hasAvailable: slots.some(s => s.available) });
        }
      }
    }
    return daysArr;
  }, [doctor, appointments, proAppointments]);

  useEffect(() => {
    if (localDoctor) { setFetchedDoctor(localDoctor); setLoadingDoctor(false); return; }
    if (!id) { setLoadingDoctor(false); return; }
    getProfessionalBySlugOrId(id)
      .then(pro => setFetchedDoctor(pro))
      .finally(() => setLoadingDoctor(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar citas del profesional desde Supabase para bloquear cupos correctamente
  useEffect(() => {
    const proId = fetchedDoctor?.id;
    if (!proId) return;
    getAppointments(proId).then(setProAppointments).catch(() => {});
  }, [fetchedDoctor?.id]);

  useEffect(() => {
    if (!fetchedDoctor?.id || !fetchedDoctor.reviewsEnabled) return;
    getProfessionalReviews(fetchedDoctor.id).then(setReviews);
    getProfessionalRating(fetchedDoctor.id).then(setRating);
  }, [fetchedDoctor?.id, fetchedDoctor?.reviewsEnabled]);

  // Retorno desde Checkout Pro de MercadoPago. Al volver de la página de pago,
  // MP agrega ?mp_return=1&status=approved&external_reference=... a la back_url.
  // Si el pago se aprobó, registramos la cita que guardamos en localStorage antes
  // de redirigir. Funciona con cualquier cuenta MP conectada (no depende del brick).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mp_return') !== '1') return;

    const status = params.get('status') || params.get('collection_status') || '';
    const paymentId = params.get('payment_id') || params.get('collection_id') || undefined;

    // Limpiar la URL para no reprocesar el retorno al recargar la página.
    window.history.replaceState({}, '', window.location.origin + window.location.pathname);

    const raw = localStorage.getItem(PENDING_BOOKING_KEY);
    localStorage.removeItem(PENDING_BOOKING_KEY);

    setStep(4);

    if (status !== 'approved' && status !== 'authorized') {
      setMpError(
        status === 'pending' || status === 'in_process'
          ? 'Tu pago quedó pendiente de confirmación. Te avisaremos cuando se acredite.'
          : 'El pago no se completó. Puedes intentar nuevamente o reservar y pagar en la consulta.'
      );
      return;
    }

    if (!raw) { setIsConfirmed(true); return; }

    (async () => {
      try {
        const pending = JSON.parse(raw) as { app: Appointment; doctorEmail?: string; notify?: any };
        const app: Appointment = { ...pending.app, paymentStatus: 'Pagado', paidAt: new Date().toISOString() };
        // El pago YA fue aprobado: la reserva DEBE quedar registrada (reintento 1 vez).
        let saved = false;
        for (let attempt = 0; attempt < 2 && !saved; attempt++) {
          try { await addAppointment(app); saved = true; }
          catch (e) { console.error('[checkout-pro] guardado falló', e); }
        }
        // Notificamos al profesional siempre (respaldo si la BD falló).
        if (pending.doctorEmail) {
          fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...(pending.notify || {}), paymentId, needsManualEntry: !saved }),
          }).catch(() => {});
        }
        setIsConfirmed(true);
      } catch (e) {
        console.error('[checkout-pro] retorno', e);
        setIsConfirmed(true);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  if (loadingDoctor) {
    return (
      <div className="flex-1 w-full flex flex-col items-center justify-center p-20 gap-4 bg-[#f8fafc]">
        <span className="material-icons-round text-primary text-5xl animate-spin">sync</span>
        <p className="text-slate-500 font-bold">Cargando perfil...</p>
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="flex-1 w-full flex flex-col items-center justify-center p-20 bg-[#f8fafc]">
        <span className="material-icons-round text-slate-200 text-6xl mb-4">error_outline</span>
        <p className="text-slate-500 font-bold text-xl">Profesional no encontrado o no disponible.</p>
        <button onClick={() => navigate('/patient/results')} className="mt-6 text-primary font-black uppercase tracking-widest text-xs">Volver a la búsqueda</button>
      </div>
    );
  }

  const finalizeBooking = async () => {
    setIsProcessing(true);
    setBookingError('');
    
    const newApp: Appointment = {
      id: Math.random().toString(36).substr(2, 9).toUpperCase(),
      patientId: `p-${Date.now()}`,
      patientName: patientData.name,
      patientPhone: patientData.phone,
      doctorName: doctor.name,
      specialty: doctor.specialty,
      serviceName: selectedService!.name,
      notes: patientData.reason,
      date: availableDays[selectedDay].date,
      time: selectedSlot!,
      duration: selectedService!.duration,
      type: selectedModality === 'online' ? 'Online' : selectedModality === 'home' ? 'Domicilio' : 'Presencial',
      status: 'Confirmado',
      price: selectedService!.price,
      paymentStatus: 'Pendiente',
      paidAt: undefined,
      category: 'Medical',
      professionalId: doctor.id,
      bookingSource: 'web',
      patientEmail: patientData.email || undefined
    };

    try {
      await addAppointment(newApp);

      // Siempre enviar confirmación al profesional (y al paciente si dio email)
      if (doctor.email) {
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: doctor.email,
            professionalName: doctor.name,
            patientName: patientData.name,
            serviceName: selectedService!.name,
            date: availableDays[selectedDay].date,
            time: selectedSlot!,
            type: newApp.type,
            duration: selectedService!.duration,
            patientEmail: patientData.email || undefined,
            price: selectedService!.price
          })
        }).catch(() => {});
      }

      setIsProcessing(false);
      setIsConfirmed(true);
    } catch (error) {
      console.error("Error booking appointment:", error);
      setIsProcessing(false);
      setBookingError('Ocurrió un error al confirmar tu cita. Por favor intenta de nuevo.');
    }
  };

  // Inicia el pago con Checkout Pro: guarda la reserva en localStorage y redirige
  // a la página segura de MercadoPago. La cita se registra al volver (mp_return).
  const startCheckoutPro = async () => {
    setIsProcessing(true);
    setMpError('');
    setBookingError('');

    const externalRef = `mp-${Date.now()}`;
    const newApp: Appointment = {
      id: Math.random().toString(36).substr(2, 9).toUpperCase(),
      patientId: `p-${Date.now()}`,
      patientName: patientData.name,
      patientPhone: patientData.phone,
      doctorName: doctor.name,
      specialty: doctor.specialty,
      serviceName: selectedService!.name,
      notes: patientData.reason,
      date: availableDays[selectedDay].date,
      time: selectedSlot!,
      duration: selectedService!.duration,
      type: selectedModality === 'online' ? 'Online' : selectedModality === 'home' ? 'Domicilio' : 'Presencial',
      status: 'Confirmado',
      price: selectedService!.price,
      paymentStatus: 'Pagado',
      paidAt: new Date().toISOString(),
      category: 'Medical',
      professionalId: doctor.id,
      bookingSource: 'web',
      patientEmail: patientData.email || undefined,
      patientRut: patientData.rut || undefined,
    };
    const notify = {
      to: doctor.email,
      professionalName: doctor.name,
      patientName: newApp.patientName,
      serviceName: newApp.serviceName,
      date: newApp.date,
      time: newApp.time,
      type: newApp.type,
      duration: newApp.duration,
      patientEmail: newApp.patientEmail,
      price: newApp.price,
    };

    try {
      localStorage.setItem(
        PENDING_BOOKING_KEY,
        JSON.stringify({ app: newApp, doctorEmail: doctor.email, notify })
      );
      const res = await fetch('/api/process-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          createPreference: true,
          amount: paymentAmount,
          external_reference: externalRef,
          description: `Reserva — ${newApp.serviceName} con ${newApp.doctorName}`,
          professional_id: doctor.id,
          payer: { email: patientData.email || undefined, name: patientData.name },
          returnUrl: window.location.origin + window.location.pathname,
        }),
      });
      const data = await res.json();
      if (data?.init_point) {
        window.location.href = data.init_point;
        return; // se abandona la SPA; el retorno se maneja en mp_return
      }
      throw new Error(data?.error || 'sin init_point');
    } catch (e) {
      console.error('[checkout-pro] crear preferencia', e);
      localStorage.removeItem(PENDING_BOOKING_KEY);
      setIsProcessing(false);
      setMpError('No se pudo iniciar el pago online. Puedes reservar y pagar en la consulta, o coordinar por WhatsApp.');
    }
  };


  const generateGoogleCalendarLink = () => {
    if (!selectedService || !selectedSlot) return '#';
    const startDate = availableDays[selectedDay].date; 
    const [hh, mm] = selectedSlot.split(':');
    
    // Crear objeto Date considerando el inicio
    const startObj = new Date(`${startDate}T${hh}:${mm}:00`);
    const endObj = new Date(startObj.getTime() + selectedService.duration * 60000);

    const fmt = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');
    const dates = `${fmt(startObj)}/${fmt(endObj)}`;
    
    const text = encodeURIComponent(`Atención Médica: ${doctor.name} - ${doctor.specialty}`);
    const details = encodeURIComponent(`Servicio: ${selectedService.name}\nPaciente: ${patientData.name}\nMotivo: ${patientData.reason}\n\nAgendado vía Clínica Maslife.`);
    const location = encodeURIComponent(doctor.city || 'Consulta Presencial / Online');
    
    return `https://calendar.google.com/calendar/r/eventedit?text=${text}&dates=${dates}&details=${details}&location=${location}`;
  };

  const handleDownloadImage = async () => {
    setIsProcessing(true);
    try {
      const el = document.getElementById('receipt-ticket');
      if (!el) return;
      
      if (!(window as any).html2canvas) {
         await new Promise((resolve) => {
           const script = document.createElement('script');
           script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
           script.onload = resolve;
           document.head.appendChild(script);
         });
      }

      const actionsEl = document.getElementById('receipt-actions');
      if (actionsEl) actionsEl.style.display = 'none';

      const canvas = await (window as any).html2canvas(el, { scale: 2, backgroundColor: '#ffffff' });
      
      if (actionsEl) actionsEl.style.display = 'flex';

      const link = document.createElement('a');
      link.download = `Comprobante-Reserva-${patientData.name.replace(/\s+/g,'_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch(e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const currentStepName = ["Servicios", "Horarios", "Formulario", "Pago"][step - 1];

  // Si ya  está confirmado, mostramos directamente la pantalla de Ticket
  if (isConfirmed) {
    return (
      // RESPONSIVE: pantalla confirmación — base=mobile lg:=desktop
      <div className="w-full min-h-screen bg-gradient-to-br from-slate-100 to-emerald-50 flex flex-col items-center justify-start lg:justify-center py-8 px-4 lg:px-8 animate-in fade-in duration-500">

        <div className="w-full max-w-5xl">

          {/* Header centrado */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-5 border-4 border-white shadow-lg">
              <span className="material-icons-round text-5xl">check_circle</span>
            </div>
            <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight mb-2">¡Reserva Exitosa!</h2>
            <p className="text-slate-500 font-bold max-w-lg">Tu hora ha quedado agendada correctamente en el sistema del profesional.</p>
          </div>

          {/* ── RESPONSIVE: columna única mobile, dos columnas lg:desktop ── */}
          <div className="flex flex-col lg:flex-row gap-6 items-start">

            {/* Ticket (capturado por html2canvas) */}
            <div className="bg-white w-full lg:flex-1 rounded-[2rem] shadow-2xl relative overflow-hidden border border-slate-200" id="receipt-ticket">
              <div className="absolute top-0 left-0 w-full h-4 bg-emerald-500"></div>

              <div className="p-7 pt-10">
                <div className="bg-slate-50 border-2 border-slate-100 border-dashed rounded-3xl p-6 relative">
                  <div className="absolute -left-4 top-1/2 -mt-4 w-8 h-8 bg-white rounded-full border-r border-slate-200"></div>
                  <div className="absolute -right-4 top-1/2 -mt-4 w-8 h-8 bg-white rounded-full border-l border-slate-200"></div>

                  <div className="space-y-5 relative z-10">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Paciente</span>
                      <p className="text-lg font-black text-slate-900">{patientData.name}</p>
                      <p className="text-xs font-bold text-slate-500">RUT: {patientData.rut}</p>
                    </div>

                    <div className="h-px bg-slate-200/50 w-full"></div>

                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Fecha y Hora</span>
                        <p className="text-sm font-black text-slate-900">{availableDays[selectedDay]?.label}</p>
                        <p className="text-xl font-black text-primary">{selectedSlot}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Profesional</span>
                        <p className="text-sm font-black text-slate-900">{doctor.name}</p>
                        <p className="text-xs font-bold text-slate-500">{doctor.specialty}</p>
                      </div>
                    </div>

                    <div className="h-px bg-slate-200/50 w-full"></div>

                    <div className="flex justify-between items-end">
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Servicio</span>
                        <p className="text-sm font-black text-slate-900">{selectedService?.name}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Pagado</span>
                        <p className="text-2xl font-black text-slate-900">${doctor.paymentEnabled ? paymentAmount.toLocaleString('es-CL') : '0'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="w-full lg:flex-1 flex flex-col gap-4 no-print" id="receipt-actions">

              {/* Confirmación por correo */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex items-center gap-3">
                <span className="material-icons-round text-emerald-500 text-2xl flex-shrink-0">mark_email_read</span>
                <div>
                  <p className="text-emerald-800 font-black text-sm">¡Tu cita ha sido confirmada con éxito!</p>
                  <p className="text-emerald-600 text-xs font-bold mt-0.5">
                    {patientData.email
                      ? <>Te enviaremos un correo de confirmación a <span className="underline">{patientData.email}</span> con el archivo de calendario (.ics)</>
                      : 'Tu cita quedó registrada correctamente en el sistema.'}
                  </p>
                </div>
              </div>

              {/* WhatsApp */}
              {doctor.phone && (
                <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-5">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">En caso de consultas, comunícate con nosotros:</p>
                  <a
                    href={`https://wa.me/${doctor.phone.replace(/\D/g,'')}?text=${encodeURIComponent(
                      `Hola, tengo una consulta referente a mi cita realizada con el profesional ${doctor.name}. Mi nombre es ${patientData.name}.`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-4 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-black rounded-2xl transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-lg shadow-green-500/20"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current flex-shrink-0"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.767 5.767 0 1.267.408 2.438 1.103 3.394l-.717 2.63 2.7-.708c.846.541 1.847.851 2.923.851 3.181 0 5.767-2.586 5.767-5.767 0-3.181-2.586-5.767-5.767-5.767zm3.344 8.205c-.145.409-.838.74-1.164.786-.324.045-.72.079-2.315-.572-1.911-.781-3.142-2.723-3.238-2.85-.095-.126-.777-.963-.777-1.838s.454-1.306.616-1.467c.163-.162.355-.202.474-.202s.237.001.341.006c.108.005.253-.041.396.304.145.352.497 1.21.541 1.298.045.089.074.192.015.309-.059.117-.089.192-.178.297-.089.105-.187.234-.267.314s-.17.169-.074.335c.095.166.424.699.91 1.132.626.557 1.152.73 1.316.812.163.081.258.067.354-.044.095-.112.408-.48.517-.643.11-.163.22-.136.371-.081s.956.45 1.12.532c.164.081.274.121.314.192s.041.527-.104.935z"/><path d="M19.057 4.298c-1.883-1.884-4.386-2.922-7.051-2.922-5.485 0-9.946 4.461-9.946 9.946 0 1.753.458 3.465 1.328 4.972l-1.41 5.148 5.268-1.381c1.458.794 3.097 1.213 4.76 1.213h.004c5.484 0 9.946-4.461 9.946-9.946 0-2.657-1.034-5.164-2.919-7.049l-.04-.04zm-7.051 15.352c-1.487 0-2.945-.399-4.216-1.155l-.302-.18-3.132.821.835-3.053-.198-.314c-.832-1.321-1.272-2.857-1.272-4.43 0-4.542 3.696-8.237 8.241-8.237 2.201 0 4.271.857 5.827 2.414s2.414 3.626 2.414 5.827c.001 4.542-3.695 8.237-8.238 8.237l-.059-.03z"/></svg>
                    Consultar por mi cita vía WhatsApp
                  </a>
                </div>
              )}

              {/* Google Calendar */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex items-center gap-4">
                <span className="material-icons-round text-blue-500 text-3xl flex-shrink-0">event_available</span>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-blue-900 text-sm mb-0.5">¿Agregar a tu calendario?</p>
                  <p className="text-blue-700 text-xs font-bold">También puedes usar el .ics del correo</p>
                </div>
                <a
                  href={generateGoogleCalendarLink()}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 px-5 py-3 bg-[#4285F4] hover:bg-[#3367D6] text-white rounded-xl font-black text-xs tracking-widest shadow transition-all"
                >
                  Google Calendar
                </a>
              </div>

              {/* ── RESPONSIVE: botones recibo — stack mobile, fila lg:desktop ── */}
              <div className="flex flex-col lg:flex-row gap-3 mt-2">
                <button
                  onClick={handleDownloadImage}
                  disabled={isProcessing}
                  className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-2xl transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span className="material-icons-round text-sm">download</span>
                  {isProcessing ? 'Descargando...' : 'Guardar comprobante'}
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-900 text-white font-black rounded-2xl transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2"
                >
                  <span className="material-icons-round text-sm">home</span>
                  Finalizar
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // Interfaz por Pasos (Wizard)
  return (
    <div className="flex-1 w-full bg-[#f8fafc] flex flex-col items-center overflow-y-auto pb-28 lg:pb-10"> {/* RESPONSIVE: base=mobile lg:=desktop */}
      
      {/* Cabecera del Profesional (Fija) */}
      <div className="w-full bg-white border-b-2 border-slate-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => { if(step > 1) setStep(step - 1); else navigate(-1); }} className="w-11 h-11 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-primary transition-all">
              <span className="material-icons-round text-xl">arrow_back</span>
            </button>
            {/* ── RESPONSIVE: doctor info — hidden on mobile, visible lg:=desktop ── */}
            <div className="hidden lg:flex items-center gap-3">
                <img className="w-12 h-12 rounded-xl object-cover border border-slate-100 shadow-sm" src={doctor.avatar || 'https://picsum.photos/seed/doc/100/100'} alt="Doc" />
                <div>
                  <h1 className="text-sm font-black text-slate-900 leading-tight">{doctor.name}</h1>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-wider">{doctor.specialty}</p>
                </div>
            </div>
          </div>

          {/* Stepper Indicator */}
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1">
               {[1, 2, 3, 4].map(num => (
                 <div key={num} className="flex items-center group">
                    <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-black transition-all ${step === num ? 'bg-primary text-white scale-110 shadow-lg shadow-primary/30' : step > num ? 'bg-primary/20 text-primary' : 'bg-slate-100 text-slate-400'}`}>
                      {step > num ? <span className="material-icons-round text-xs sm:text-sm">check</span> : num}
                    </div>
                    {num < 4 && <div className={`w-4 sm:w-8 h-[2px] mx-1 transition-all ${step > num ? 'bg-primary/40' : 'bg-slate-100'}`}></div>}
                 </div>
               ))}
             </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-3xl mx-auto px-3 lg:px-6 py-6 lg:py-10 flex-1 flex flex-col">
          <div className="mb-10 text-center animate-in slide-in-from-bottom-4 duration-500">
            <span className="text-xs font-black text-primary uppercase tracking-widest bg-primary/10 px-4 py-1.5 rounded-full inline-block mb-4">Paso {step} de 4</span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              {step === 1 && 'Selecciona el Servicio'}
              {step === 2 && 'Elige Fecha y Hora'}
              {step === 3 && 'Tus Datos Personales'}
              {step === 4 && 'Pago y Confirmación'}
            </h2>
          </div>

          <div className="flex-1">
            {/* ------------ PASO 1: SERVICIOS ------------ */}
            {step === 1 && (
              <div className="animate-in fade-in duration-300 space-y-5">

              {/* Tarjeta del profesional */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
                <div className="relative shrink-0">
                  <img
                    className="w-16 h-16 rounded-xl object-cover border-2 border-white shadow"
                    src={doctor.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(doctor.name)}&background=0d9488&color=fff&size=200`}
                    alt={doctor.name}
                  />
                  <div className="absolute -bottom-1 -right-1 bg-emerald-500 border-2 border-white rounded-lg p-0.5 flex items-center justify-center">
                    <span className="material-icons-round text-white" style={{ fontSize: '10px' }}>verified</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-black text-slate-900 text-base leading-tight">{doctor.name}</h3>
                    <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-200">
                      <span className="material-icons-round" style={{ fontSize: '10px' }}>verified</span>
                      Verificado
                    </span>
                  </div>
                  <p className="text-xs font-bold text-primary mt-0.5">{doctor.specialty}</p>
                  {doctor.city && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="material-icons-round text-slate-400" style={{ fontSize: '12px' }}>location_on</span>
                      <span className="text-[11px] font-semibold text-slate-500">{doctor.city}</span>
                    </div>
                  )}
                  {doctor.instagram && (
                    <a
                      href={`https://instagram.com/${doctor.instagram.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1.5 hover:opacity-75 transition-opacity"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" style={{ fill: 'url(#igGradProfile)' }}>
                        <defs>
                          <linearGradient id="igGradProfile" x1="0%" y1="100%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#f09433" />
                            <stop offset="25%" stopColor="#e6683c" />
                            <stop offset="50%" stopColor="#dc2743" />
                            <stop offset="75%" stopColor="#cc2366" />
                            <stop offset="100%" stopColor="#bc1888" />
                          </linearGradient>
                        </defs>
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                      <span className="text-[11px] font-semibold" style={{ color: '#bc1888' }}>{doctor.instagram}</span>
                    </a>
                  )}
                </div>
              </div>

              {doctor.reviewsEnabled && (
                <div className="px-1 pb-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map(s => (
                        <span key={s} className="material-icons-round text-lg" style={{ color: s <= Math.round(rating.avg) ? '#f59e0b' : '#e2e8f0' }}>star</span>
                      ))}
                    </div>
                    <span className="text-xl font-black text-slate-900">{rating.avg > 0 ? rating.avg.toFixed(1) : '—'}</span>
                    <span className="text-xs text-slate-400 font-bold">({rating.count} {rating.count === 1 ? 'reseña' : 'reseñas'})</span>
                    <button
                      onClick={() => setShowReviewForm(true)}
                      className="ml-auto text-xs font-black text-primary hover:underline"
                    >
                      + Calificar
                    </button>
                  </div>

                  {reviews.slice(0, 5).map(r => (
                    <div key={r.id} className="mb-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex items-center gap-0.5">
                          {[1,2,3,4,5].map(s => (
                            <span key={s} className="material-icons-round text-sm" style={{ color: s <= r.rating ? '#f59e0b' : '#e2e8f0' }}>star</span>
                          ))}
                        </div>
                        <span className="text-xs font-black text-slate-700">{r.patientName}</span>
                        {r.isVerified && <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">✓ Paciente verificado</span>}
                        <span className="text-[10px] text-slate-400 ml-auto">{new Date(r.createdAt).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })}</span>
                      </div>
                      {r.comment && <p className="text-xs text-slate-600 leading-relaxed">{r.comment}</p>}
                    </div>
                  ))}

                  {showReviewForm && (
                    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={e => { if (e.target === e.currentTarget) setShowReviewForm(false); }}>
                      <div className="bg-white w-full max-w-lg rounded-t-3xl p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-black text-slate-900">Calificar atención</h3>
                          <button onClick={() => setShowReviewForm(false)} className="material-icons-round text-slate-400 text-2xl">close</button>
                        </div>

                        {reviewStatus === 'success' ? (
                          <div className="text-center py-8 space-y-3">
                            <span className="material-icons-round text-4xl text-emerald-500">check_circle</span>
                            <p className="font-black text-slate-900">¡Gracias por tu reseña!</p>
                            <button onClick={() => { setShowReviewForm(false); setReviewStatus('idle'); }} className="text-xs font-black text-primary hover:underline">Cerrar</button>
                          </div>
                        ) : (
                          <>
                            <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Tu calificación</label>
                              <div className="flex gap-1">
                                {[1,2,3,4,5].map(s => (
                                  <button key={s} onClick={() => setReviewRating(s)} className="p-0.5">
                                    <span className="material-icons-round text-3xl" style={{ color: s <= reviewRating ? '#f59e0b' : '#e2e8f0' }}>star</span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1 ml-1">Tu nombre</label>
                              <input
                                value={reviewName}
                                onChange={e => setReviewName(e.target.value)}
                                placeholder="Ej: María G."
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm font-bold text-slate-800 outline-none focus:border-primary"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1 ml-1">Tu RUT (para verificar que fuiste atendido/a)</label>
                              <input
                                value={reviewRut}
                                onChange={e => setReviewRut(e.target.value)}
                                placeholder="Ej: 12.345.678-9"
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm font-bold text-slate-800 outline-none focus:border-primary"
                              />
                              <p className="text-[10px] text-slate-400 mt-1 ml-1">Tu RUT solo se usa para verificar que fuiste atendido/a. No se publica.</p>
                            </div>

                            <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1 ml-1">Comentario (opcional)</label>
                              <textarea
                                value={reviewComment}
                                onChange={e => setReviewComment(e.target.value)}
                                placeholder="Cuéntanos tu experiencia..."
                                rows={3}
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm font-bold text-slate-800 outline-none focus:border-primary resize-none"
                              />
                            </div>

                            {reviewError && <p className="text-xs text-rose-600 font-bold text-center">{reviewError}</p>}

                            <button
                              disabled={!reviewName.trim() || !reviewRut.trim() || reviewStatus === 'loading'}
                              onClick={async () => {
                                setReviewStatus('loading');
                                setReviewError('');
                                try {
                                  const res = await fetch('/api/notify', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      action: 'submit-review',
                                      professional_id: fetchedDoctor!.id,
                                      patient_rut: reviewRut,
                                      patient_name: reviewName,
                                      rating: reviewRating,
                                      comment: reviewComment || undefined,
                                    }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) {
                                    setReviewError(data.error || 'No se pudo guardar la reseña.');
                                    setReviewStatus('error');
                                  } else {
                                    setReviewStatus('success');
                                    getProfessionalReviews(fetchedDoctor!.id).then(setReviews);
                                    getProfessionalRating(fetchedDoctor!.id).then(setRating);
                                  }
                                } catch {
                                  setReviewError('Error de conexión. Intenta de nuevo.');
                                  setReviewStatus('error');
                                }
                              }}
                              className="w-full py-4 bg-primary text-white font-black rounded-2xl shadow-md hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 transition-all uppercase text-xs tracking-widest border-b-4 border-primary/70 active:border-b-0"
                            >
                              {reviewStatus === 'loading' ? 'Enviando...' : 'Enviar calificación'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Array.isArray(doctor.services) && doctor.services.length > 0 ? doctor.services.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedService(s); setSelectedSlot(null); setStep(2); }}
                      className={`p-6 rounded-[2rem] border-2 text-left transition-all hover:border-primary hover:shadow-lg group ${selectedService?.id === s.id ? 'border-primary bg-primary/5 shadow-lg' : 'border-slate-100 bg-white'}`}
                    >
                      <h4 className="font-black text-slate-900 mb-2 group-hover:text-primary transition-colors">{s.name}</h4>
                      <p className="text-xs text-slate-500 font-bold mb-6 line-clamp-3">{s.description}</p>
                      <div className="flex justify-between items-end mt-auto">
                        <span className="text-xl font-black text-primary">${s.price.toLocaleString('es-CL')}</span>
                        <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1 rounded-lg uppercase tracking-widest">{s.duration} MIN</span>
                      </div>
                    </button>
                  )) : (
                    <div className="col-span-2 text-center p-12 bg-white rounded-3xl border-2 border-slate-100">
                       <span className="material-icons-round text-4xl text-slate-300 mb-3 block">event_busy</span>
                       <p className="text-slate-500 font-bold">El profesional aún no ha configurado sus servicios.</p>
                    </div>
                  )}
              </div>
              </div>
            )}

            {/* ------------ PASO 2: HORARIO ------------ */}
            {step === 2 && (
              <div className="bg-white rounded-[2.5rem] p-8 sm:p-10 shadow-sm border border-slate-100 animate-in slide-in-from-right-8 duration-300">
                <div className="flex items-center gap-3 mb-8 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                   <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                     <span className="material-icons-round text-primary text-lg">medical_services</span>
                   </div>
                   <div>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">Servicio Elegido</p>
                     <p className="text-sm font-bold text-slate-900">{selectedService?.name}</p>
                   </div>
                </div>

                <div className="flex gap-3 mb-8 overflow-x-auto pb-4 custom-scrollbar">
                  {availableDays.length > 0 ? availableDays.map((day, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedDay(i)}
                      className={`flex-none w-28 py-5 px-2 rounded-[1.5rem] flex flex-col items-center gap-2 border-2 transition-all relative ${selectedDay === i ? 'border-primary bg-primary shadow-lg shadow-primary/20 text-white' : 'border-slate-100 bg-white text-slate-500 hover:border-primary/50'}`}
                    >
                      <span className={`text-[10px] font-black uppercase tracking-widest ${selectedDay === i ? 'text-white/80' : 'text-slate-400'}`}>{day.name}</span>
                      <span className="text-lg font-black tracking-tighter">{day.label.split(' ')[0]} {day.label.split(' ')[1]}</span>
                      {!day.hasAvailable && (
                        <span className={`text-[8px] font-black uppercase tracking-wider ${selectedDay === i ? 'text-white/70' : 'text-rose-400'}`}>Completo</span>
                      )}
                    </button>
                  )) : (
                    <p className="text-slate-500 font-bold italic w-full text-center">No hay días disponibles.</p>
                  )}
                </div>
                
                <p className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4">Horarios del Día</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {availableDays[selectedDay]?.slots.map((slot) => (
                    <button
                      key={slot.time}
                      disabled={!slot.available}
                      onClick={() => { if (slot.available) { setSelectedSlot(slot.time); setStep(3); } }}
                      title={slot.available ? slot.time : 'Hora no disponible'}
                      className={`py-4 rounded-2xl text-sm font-black transition-all border-2 flex items-center justify-center gap-1.5 ${
                        !slot.available
                          ? 'bg-slate-100 border-slate-100 text-slate-300 cursor-not-allowed line-through'
                          : selectedSlot === slot.time
                            ? 'bg-primary border-primary text-white shadow-xl shadow-primary/20'
                            : 'bg-white border-slate-100 text-slate-700 hover:border-primary hover:-translate-y-1'
                      }`}
                    >
                      {!slot.available && <span className="material-icons-round text-xs">lock</span>}
                      {slot.time}
                    </button>
                  ))}
                  {(!availableDays[selectedDay] || availableDays[selectedDay].slots.length === 0) && (
                     <p className="col-span-full text-center text-slate-400 text-sm py-4">No hay horarios en este día.</p>
                  )}
                </div>
              </div>
            )}

            {/* ------------ PASO 3: DATOS PACIENTE ------------ */}
            {step === 3 && (
              <div className="bg-white rounded-[2.5rem] p-8 sm:p-10 shadow-sm border border-slate-100 animate-in slide-in-from-right-8 duration-300">
                {/* Selector Modalidad */}
                <div className="mb-8">
                  <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1 mb-3 block">Modalidad de Atención</label>
                  <div className="flex gap-4">
                    {doctor.modalities?.inPerson && (
                       <button onClick={() => setSelectedModality('inPerson')} className={`flex-1 py-4 border-2 rounded-2xl font-black text-sm transition-all flex flex-col items-center gap-2 ${selectedModality === 'inPerson' ? 'bg-primary border-primary text-white shadow-xl shadow-primary/20' : 'bg-white border-slate-100 text-slate-500 hover:border-primary/50'}`}>
                         <span className="material-icons-round">medical_information</span>
                         Presencial
                       </button>
                    )}
                    {doctor.modalities?.home && (
                       <button onClick={() => setSelectedModality('home')} className={`flex-1 py-4 border-2 rounded-2xl font-black text-sm transition-all flex flex-col items-center gap-2 ${selectedModality === 'home' ? 'bg-primary border-primary text-white shadow-xl shadow-primary/20' : 'bg-white border-slate-100 text-slate-500 hover:border-primary/50'}`}>
                         <span className="material-icons-round">home_work</span>
                         Domicilio
                       </button>
                    )}
                    {doctor.modalities?.online && (
                       <button onClick={() => setSelectedModality('online')} className={`flex-1 py-4 border-2 rounded-2xl font-black text-sm transition-all flex flex-col items-center gap-2 ${selectedModality === 'online' ? 'bg-primary border-primary text-white shadow-xl shadow-primary/20' : 'bg-white border-slate-100 text-slate-500 hover:border-primary/50'}`}>
                         <span className="material-icons-round">videocam</span>
                         Online
                       </button>
                    )}
                  </div>
                  
                  {/* Mensajes condicionales */}
                  <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-sm font-bold text-slate-600 flex items-start gap-3">
                     <span className="material-icons-round text-primary mt-0.5">info</span>
                     <div>
                       {selectedModality === 'inPerson' && <p>Serás atendido de forma presencial en la ciudad de: <span className="text-slate-900 border-b-2 border-primary">{doctor.city || 'No especificada'}</span>.</p>}
                       {selectedModality === 'home' && <p>Iremos a tu ubicación. Por favor, rellena tu dirección exacta debajo para que el profesional llegue sin problemas.</p>}
                       {selectedModality === 'online' && <p>Atención por videollamada. Nos contactaremos directamente a tu WhatsApp registrado con el enlace a la sesión.</p>}
                     </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Nombre Completo *</label>
                    <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-4 px-5 font-black text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" placeholder="Ej: Juan Pérez" value={patientData.name} onChange={e => setPatientData({ ...patientData, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">RUT *</label>
                    <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-4 px-5 font-black text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" placeholder="Ej: 12.345.678-9" value={patientData.rut} onChange={e => setPatientData({ ...patientData, rut: e.target.value })} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Motivo de consulta / Diagnóstico *</label>
                    <textarea className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-4 px-5 font-bold text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all min-h-[100px]" placeholder="Cuenta brevemente qué necesitas para que el profesional se prepare..." value={patientData.reason} onChange={e => setPatientData({ ...patientData, reason: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Celular *</label>
                    <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-4 px-5 font-black text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" placeholder="+56 9 1234 5678" value={patientData.phone} onChange={e => setPatientData({ ...patientData, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Correo Electrónico *</label>
                    <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-4 px-5 font-black text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" type="email" placeholder="correo@ejemplo.com" value={patientData.email} onChange={e => setPatientData({ ...patientData, email: e.target.value })} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Ciudad *</label>
                    <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-4 px-5 font-black text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" placeholder="Ej: Santiago" value={patientData.city} onChange={e => setPatientData({ ...patientData, city: e.target.value })} />
                  </div>
                  
                  {selectedModality === 'home' && (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Dirección (Calle) *</label>
                        <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-4 px-5 font-black text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" placeholder="Ej: Av. Principal 123" value={patientData.address} onChange={e => setPatientData({ ...patientData, address: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-800 uppercase tracking-widest ml-1">Número Ext / Depto *</label>
                        <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-4 px-5 font-black text-sm text-black focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all" placeholder="Ej: Depto 40" value={patientData.houseNumber} onChange={e => setPatientData({ ...patientData, houseNumber: e.target.value })} />
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-8 pt-8 border-t border-slate-100 flex items-center justify-end">
                   <button
                     disabled={!isFormValid}
                     onClick={() => setStep(4)}
                     className="py-5 px-10 bg-slate-900 text-white font-black rounded-2xl disabled:opacity-30 transition-all uppercase text-xs tracking-widest flex items-center gap-3 hover:-translate-y-1 shadow-xl"
                   >
                     Continuar al Pago
                     <span className="material-icons-round text-sm">arrow_forward</span>
                   </button>
                </div>
              </div>
            )}

            {/* ------------ PASO 4: PAGO / SIMULADOR ------------ */}
            {step === 4 && (
              <div className="bg-white rounded-3xl lg:rounded-[2.5rem] p-4 lg:p-8 shadow-2xl border border-slate-200 animate-in slide-in-from-right-8 duration-300">
                
                {/* Resumen Final Box */}
                <div className="bg-slate-50 rounded-2xl lg:rounded-3xl p-4 lg:p-8 mb-6 lg:mb-8 border-2 border-slate-100">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Resumen de tu Reserva</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-slate-600">Servicio</span>
                        <span className="text-sm font-black text-slate-900">{selectedService?.name}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-slate-600">Fecha y Hora</span>
                        <span className="text-sm font-black text-slate-900">{availableDays[selectedDay]?.label} a las {selectedSlot}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-slate-600">Paciente</span>
                        <span className="text-sm font-black text-slate-900 text-right">{patientData.name}<br/><span className="text-xs text-slate-400">{patientData.rut}</span></span>
                      </div>
                    </div>

                    <div className="my-6 border-b-2 border-dashed border-slate-200"></div>

                    <div className="flex justify-between items-end">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">A pagar ahora</span>
                        {doctor.paymentEnabled && (
                          <span className="text-xs font-bold text-slate-500">
                            {doctor.chargeFullService ? 'Precio del servicio' : 'Bono de Reserva de Cupo'}
                          </span>
                        )}
                      </div>
                      <span className="text-4xl font-black text-primary tracking-tighter">
                        {doctor.paymentEnabled ? `$${paymentAmount.toLocaleString('es-CL')}` : 'Gratis'}
                      </span>
                    </div>
                </div>

                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center mx-auto mb-4 scale-in-center">
                    <span className="material-icons-round text-3xl text-primary">{doctor.paymentEnabled ? 'account_balance_wallet' : 'verified'}</span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Confirmación de Cita</h3>
                  <p className="text-slate-500 font-bold text-sm">Estás a un paso de asegurar tu atención en nuestra plataforma.</p>
                </div>
                
                {doctor.paymentEnabled ? (
                  <div className="space-y-3 w-full">
                    {/* Encabezado MP */}
                    <div className="flex items-center gap-2 mb-1">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" style={{ fill: '#009ee3' }}>
                        <path d="M12 0C5.374 0 0 5.373 0 12c0 6.628 5.374 12 12 12 6.628 0 12-5.372 12-12C24 5.373 18.628 0 12 0zm5.49 8.444l-2.18 9.778a.42.42 0 01-.41.322h-1.638a.42.42 0 01-.418-.322l-1.084-4.626-1.083 4.626a.42.42 0 01-.418.322H8.62a.42.42 0 01-.41-.322L5.98 8.444a.42.42 0 01.41-.516h1.638c.2 0 .373.139.41.335l1.196 5.692 1.192-5.692a.42.42 0 01.41-.335h1.527c.2 0 .373.139.41.335l1.192 5.692 1.196-5.692a.42.42 0 01.41-.335h1.519a.42.42 0 01.41.516z"/>
                      </svg>
                      <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Pago Seguro con MercadoPago</p>
                    </div>

                    {/* Pago vía Checkout Pro: el paciente paga en la página segura
                        de MercadoPago y vuelve por back_urls (mp_return=1). Funciona
                        con CUALQUIER cuenta MP conectada, sin depender de la captura
                        directa de tarjeta (Checkout API) del vendedor. */}
                    <button
                      onClick={startCheckoutPro}
                      disabled={isProcessing}
                      className="w-full py-5 text-white font-black rounded-2xl shadow-md hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 transition-all uppercase text-xs tracking-widest flex items-center gap-2 justify-center border-b-4 active:border-b-0"
                      style={{ backgroundColor: '#009ee3', borderBottomColor: '#0079b3' }}
                    >
                      {isProcessing ? (
                        <>
                          <span className="material-icons-round animate-spin text-sm">sync</span>
                          Redirigiendo a MercadoPago...
                        </>
                      ) : (
                        <>
                          <span className="material-icons-round text-sm">lock</span>
                          Pagar ${paymentAmount.toLocaleString('es-CL')} con MercadoPago
                        </>
                      )}
                    </button>
                    <p className="text-[11px] text-slate-500 text-center font-bold px-2">
                      Pagas en la página segura de MercadoPago. No necesitas la app ni una cuenta.
                    </p>

                    {mpError && (
                      <p className="text-rose-600 text-xs font-bold text-center bg-rose-50 rounded-xl p-3">{mpError}</p>
                    )}
                    {bookingError && <p className="text-rose-600 text-xs font-bold text-center">{bookingError}</p>}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bookingError && (
                      <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm font-bold text-center">
                        {bookingError}
                      </div>
                    )}
                    <button
                        onClick={finalizeBooking}
                        disabled={isProcessing}
                        className="w-full py-6 mt-4 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/20 hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 transition-all uppercase text-xs tracking-widest flex items-center gap-3 justify-center"
                      >
                        {isProcessing ? 'PROCESANDO...' : 'CONFIRMAR CITA GRATUITAMENTE'}
                        <span className="material-icons-round text-sm">check_circle</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
      </div>
    </div>
  );
};

export default PatientProfile;
