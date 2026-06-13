import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfessionalProfile, Appointment, Patient, Transaction, ClinicalTemplate } from './types';
import { supabase, getActiveSession, getPatients, getAppointments, getTransactions, savePatient, saveAppointment, deleteAppointment as deleteAppointmentDB, saveTransaction, batchInsertBlocks, deleteBlocksByRecurrence } from './supabaseService';

interface ClinicContextType {
  // Estado de carga
  isLoading: boolean;

  // Admin
  isAdmin: boolean;
  setIsAdmin: (v: boolean) => void;

  // Profesionales
  professionals: ProfessionalProfile[];
  setProfessionals: (pros: ProfessionalProfile[] | ((prev: ProfessionalProfile[]) => ProfessionalProfile[])) => void;
  loggedPro: ProfessionalProfile | null;
  setLoggedPro: (pro: ProfessionalProfile | null) => void;
  updateProfessional: (pro: ProfessionalProfile) => void;
  updatePro: (pro: ProfessionalProfile) => void; // alias
  registerPro: (pro: ProfessionalProfile) => void;

  // Citas
  appointments: Appointment[];
  setAppointments: (apps: Appointment[] | ((prev: Appointment[]) => Appointment[])) => void;
  addAppointment: (app: Appointment) => Promise<void>;
  batchAddAppointments: (apps: Appointment[]) => Promise<void>;
  updateAppointment: (app: Appointment) => void;
  deleteAppointment: (id: string) => void;
  deleteAppointmentsByRecurrence: (recurrenceId: string, mode: 'single' | 'future' | 'all', blockId: string, blockDate: string) => Promise<void>;

  // Pacientes
  patients: Patient[];
  setPatients: (patients: Patient[] | ((prev: Patient[]) => Patient[])) => void;
  addPatient: (patient: Patient) => void;
  updatePatient: (patient: Patient) => void;

  // Transacciones
  manualTransactions: Transaction[];
  addManualTransaction: (t: Transaction) => void;

  // Templates
  templates: ClinicalTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<ClinicalTemplate[]>>;

  // Notifications
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  addNotification: (title: string, type: 'appointment' | 'payment' | 'system') => void;
  markNotificationRead: (id: string) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Métodos
  logout: (navigate: any, view: string) => void;
}

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

export const ClinicProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  // isAdmin nunca se persiste en localStorage — su validez la garantiza el JWT en sessionStorage
  const [isAdmin, setIsAdminState] = useState<boolean>(false);

  const setIsAdmin = (v: boolean) => {
    setIsAdminState(v);
    if (!v) sessionStorage.removeItem('maslife_admin_token');
    // Limpiar la clave legacy por si existía
    localStorage.removeItem('maslife_admin_auth');
  };
  // Estado inicial con profesional de prueba
  const [professionals, setProfessionals] = useState<ProfessionalProfile[]>(() => {
    const saved = localStorage.getItem('maslife_professionals');
    if (saved) return JSON.parse(saved);

    return [{
      id: 'pro-rodrigo',
      slug: 'rodrigo-orellana',
      name: 'Rodrigo Orellana',
      email: 'orellanaallan30@gmail.com',
      needsPasswordReset: false,
      isVerified: true,
      isSubscribed: true,
      subscriptionStatus: 'active',
      specialty: 'Kinesiología y Rehabilitación',
      city: 'Santiago',
      bio: 'Especialista en rehabilitación avanzada y gestión clínica.',
      workingHours: { start: "08:00", end: "20:00" },
      modalities: { online: true, inPerson: true, home: true },
      isPublic: true,
      paymentEnabled: true,
      bookingPaymentLink: 'https://www.flow.cl/app/pay.php?token=reserva5000',
      phone: '+56965329974',
      createdAt: new Date().toISOString(),
      avatar: 'https://picsum.photos/seed/rodrigo/400/400',
      services: [
        { id: 's-1', name: 'Consulta Integral', price: 45000, duration: 45, description: 'Sesión completa de evaluación.' },
        { id: 's-2', name: 'Terapia Manual', price: 35000, duration: 30, description: 'Tratamiento manual especializado.' }
      ]
    }];
  });

  const [loggedPro, setLoggedPro] = useState<ProfessionalProfile | null>(() => {
    const saved = localStorage.getItem('maslife_logged_pro');
    return saved ? JSON.parse(saved) : null;
  });

  // Al montar: verificar si hay sesión Supabase activa y restaurar perfil fresco desde la BD
  useEffect(() => {
    const restoreSession = async () => {
      const pro = await getActiveSession();
      if (pro) {
        setLoggedPro(pro);
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session && loggedPro !== null) setLoggedPro(null);
      }
    };
    restoreSession();

    // Escuchar cambios de sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        setLoggedPro(null);
      } else if (event === 'PASSWORD_RECOVERY') {
        window.location.replace(window.location.origin + '/pro/reset-password');
      }
    });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [appointments, setAppointments] = useState<Appointment[]>(() => {
    const saved = localStorage.getItem('maslife_appointments');
    return saved ? JSON.parse(saved) : [
      {
        id: 'app-1',
        patientId: 'p1',
        patientName: 'Ana Martínez',
        patientPhone: '+56 9 1234 5678',
        doctorName: 'Rodrigo Orellana',
        specialty: 'Kinesiología',
        serviceName: 'Consulta Integral',
        date: new Date().toISOString().split('T')[0],
        time: '09:00',
        duration: 45,
        type: 'Online',
        status: 'Confirmado',
        price: 45000,
        paymentStatus: 'Pendiente',
        category: 'Medical',
        professionalId: 'pro-rodrigo'
      }
    ];
  });

  const [patients, setPatients] = useState<Patient[]>(() => {
    const saved = localStorage.getItem('maslife_patients');
    return saved ? JSON.parse(saved) : [
      {
        id: 'p1',
        name: 'Ana Martínez',
        rut: '12.345.678-9',
        email: 'ana@email.com',
        phone: '+56 9 1234 5678',
        risk: 'Bajo',
        status: 'Confirmado',
        archived: false,
        customFields: [],
        attachments: [],
        allergies: [],
        medicalHistory: '',
        age: 34,
        prevision: 'Fonasa',
        gender: 'Femenino',
        birthDate: '1990-01-01',
        address: 'Av. Libertador 1234, Santiago'
      }
    ];
  });

  const [manualTransactions, setManualTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('maslife_manual_transactions');
    return saved ? JSON.parse(saved) : [];
  });

  const [templates, setTemplates] = useState<ClinicalTemplate[]>([]);

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const saved = localStorage.getItem('maslife_notifications');
    return saved ? JSON.parse(saved) : [
      { id: '1', title: 'Sistema MasLife activo', time: 'Ahora', type: 'system', read: false }
    ];
  });

  // Persistencia automática
  useEffect(() => {
    // Nunca persistir contraseñas en localStorage
    const safePros = professionals.map(({ password: _pw, ...rest }) => rest);
    localStorage.setItem('maslife_professionals', JSON.stringify(safePros));
  }, [professionals]);

  useEffect(() => {
    localStorage.setItem('maslife_appointments', JSON.stringify(appointments));
  }, [appointments]);

  useEffect(() => {
    localStorage.setItem('maslife_patients', JSON.stringify(patients));
  }, [patients]);

  useEffect(() => {
    localStorage.setItem('maslife_manual_transactions', JSON.stringify(manualTransactions));
  }, [manualTransactions]);

  useEffect(() => {
    if (loggedPro) {
      localStorage.setItem('maslife_logged_pro', JSON.stringify(loggedPro));
      setProfessionals(prev => prev.map(p => p.id === loggedPro.id ? loggedPro : p));
    } else {
      localStorage.removeItem('maslife_logged_pro');
    }
  }, [loggedPro]);

  // Cargar datos del profesional desde Supabase al iniciar sesión
  useEffect(() => {
    if (!loggedPro) {
      // Al cerrar sesión: limpiar datos para no filtrar a la próxima sesión
      setPatients([]);
      setAppointments([]);
      setManualTransactions([]);
      return;
    }

    const loadProData = async () => {
      setIsLoading(true);
      try {
        const [supaPatients, supaApps, supaTransactions] = await Promise.all([
          getPatients(loggedPro.id),
          getAppointments(loggedPro.id),
          getTransactions(loggedPro.id),
        ]);
        // Merge: Supabase es la fuente de verdad, pero si hay registros locales
        // con IDs que no están en Supabase (guardado fallido), los conservamos
        // en lugar de perderlos silenciosamente.
        setPatients(prev => {
          const supaIds = new Set(supaPatients.map(p => p.id));
          const localOnly = prev.filter(p => p.professionalId === loggedPro.id && !supaIds.has(p.id));
          return [...supaPatients, ...localOnly];
        });
        setAppointments(prev => {
          const supaIds = new Set(supaApps.map(a => a.id));
          const localOnly = prev.filter(a => a.professionalId === loggedPro.id && !supaIds.has(a.id));
          return [...supaApps, ...localOnly];
        });
        if (supaTransactions.length > 0) setManualTransactions(supaTransactions);
      } catch {
        setAppointments(prev =>
          prev.filter(a => !a.professionalId || a.professionalId === loggedPro.id)
        );
        setPatients(prev =>
          prev.filter(p => !p.professionalId || p.professionalId === loggedPro.id)
        );
        setManualTransactions(prev =>
          prev.filter(t => !t.professionalId || t.professionalId === loggedPro.id)
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadProData();
  }, [loggedPro?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem('maslife_notifications', JSON.stringify(notifications));
  }, [notifications]);

  // Recordatorios Automáticos
  useEffect(() => {
    if (!loggedPro) return;
    const interval = setInterval(() => {
      const now = new Date();
      appointments.forEach(app => {
        if (app.professionalId === loggedPro.id && app.status === 'Confirmado') {
          const appDateTime = new Date(`${app.date}T${app.time}`);
          const diffMs = appDateTime.getTime() - now.getTime();
          const diffMins = Math.floor(diffMs / 60000);

          if (diffMins === 30) {
            addNotification(`Recordatorio: Cita en 30 minutos con ${app.patientName}`, 'system');
          }
        }
      });
    }, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [appointments, loggedPro]);

  // Métodos
  const updateProfessional = (updated: ProfessionalProfile) => {
    setProfessionals(prev => prev.map(p => p.id === updated.id ? updated : p));
    if (loggedPro && loggedPro.id === updated.id) {
      setLoggedPro(updated);
    }
  };

  const registerPro = (pro: ProfessionalProfile) => {
    setProfessionals(prev => [...prev, pro]);
  };

  const addAppointment = async (app: Appointment) => {
    setAppointments(prev => [...prev, app]);
    addNotification(`Nueva cita: ${app.patientName} - ${app.serviceName} (${app.date} ${app.time})`, 'appointment');
    // Persistir en Supabase — si falla, avisar en vez de ocultar el error
    saveAppointment(app).catch(err => {
      console.error('[addAppointment] No se pudo guardar la cita en Supabase:', err?.message || err);
      addNotification(`⚠️ La cita de ${app.patientName} NO se guardó en el servidor. Revisa tu conexión y créala de nuevo.`, 'appointment');
    });

    // Notificación por email — solo citas reales con paciente, nunca bloqueos de horario
    if (app.status !== 'Bloqueado') {
      const proEmail = loggedPro?.id === app.professionalId ? loggedPro?.email : professionals.find(p => p.id === app.professionalId)?.email;
      if (proEmail && loggedPro) {
        try {
          await fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: proEmail,
              professionalName: app.doctorName,
              patientName: app.patientName,
              serviceName: app.serviceName,
              date: app.date,
              time: app.time,
              type: app.type,
              patientEmail: app.patientEmail,
              price: app.price,
              duration: app.duration
            })
          }).catch(() => {});
        } catch { /* silencioso */ }
      }
    }

    // Preparar notificación WhatsApp al profesional (abre enlace si está en el navegador del pro)
    if (loggedPro?.email) {
      const waMsg = `Nueva cita agendada:\nPaciente: ${app.patientName}\nServicio: ${app.serviceName}\nFecha: ${app.date}\nHora: ${app.time}\nModalidad: ${app.type}`;
      console.log(`[Notif] WhatsApp para ${loggedPro.name}: ${waMsg}`);
    }
  };

  const batchAddAppointments = async (apps: Appointment[]) => {
    setAppointments(prev => [...prev, ...apps]);
    await batchInsertBlocks(apps);
  };

  const updateAppointment = (updated: Appointment) => {
    setAppointments(prev => prev.map(a => a.id === updated.id ? updated : a));
    addNotification(`Cita actualizada: ${updated.patientName} (${updated.date} ${updated.time})`, 'appointment');
    saveAppointment(updated).catch(err => {
      console.error('[updateAppointment] No se pudo guardar en Supabase:', err?.message || err);
      addNotification(`⚠️ Los cambios de la cita de ${updated.patientName} NO se guardaron. Intenta de nuevo.`, 'appointment');
    });
  };

  const deleteAppointment = (id: string) => {
    const appointmentToDelete = appointments.find(a => a.id === id);
    setAppointments(prev => prev.filter(a => a.id !== id));
    if (appointmentToDelete) {
      addNotification(`Cita cancelada: ${appointmentToDelete.patientName}`, 'appointment');
    }
    deleteAppointmentDB(id).catch(err => {
      console.error('[deleteAppointment] No se pudo eliminar en Supabase:', err?.message || err);
      addNotification(`⚠️ La cita NO se eliminó en el servidor. Recarga la página para verificar.`, 'appointment');
    });
  };

  const deleteAppointmentsByRecurrence = async (recurrenceId: string, mode: 'single' | 'future' | 'all', blockId: string, blockDate: string) => {
    if (mode === 'single') {
      setAppointments(prev => prev.filter(a => a.id !== blockId));
    } else if (mode === 'future') {
      setAppointments(prev => prev.filter(a => !(a.recurrenceId === recurrenceId && a.date >= blockDate)));
    } else {
      setAppointments(prev => prev.filter(a => a.recurrenceId !== recurrenceId));
    }
    await deleteBlocksByRecurrence(recurrenceId, mode, blockId, blockDate);
  };

  const addNotification = (title: string, type: 'appointment' | 'payment' | 'system') => {
    const newNotif: Notification = {
      id: `notif-${Date.now()}`,
      title,
      time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      type,
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const addPatient = (patient: Patient) => {
    const withPro = loggedPro ? { ...patient, professionalId: loggedPro.id } : patient;
    setPatients(prev => [...prev, withPro]);
    if (loggedPro) {
      savePatient(withPro, loggedPro.id).catch(err => {
        console.error('[addPatient] No se pudo guardar en Supabase:', err?.message || err);
        addNotification(`⚠️ El paciente ${patient.name} NO se guardó en el servidor. Revisa tu conexión y vuelve a crearlo.`, 'appointment');
      });
    }
  };

  const updatePatient = (patient: Patient) => {
    setPatients(prev => prev.map(old => old.id === patient.id ? patient : old));
    if (loggedPro) {
      savePatient(patient, loggedPro.id).catch(err => {
        console.error('[updatePatient] No se pudo guardar en Supabase:', err?.message || err);
        addNotification(`⚠️ Los cambios de ${patient.name} NO se guardaron en el servidor. Intenta de nuevo.`, 'appointment');
      });
    }
  };

  const addManualTransaction = (transaction: Transaction) => {
    const withPro = loggedPro ? { ...transaction, professionalId: loggedPro.id } : transaction;
    setManualTransactions(prev => [...prev, withPro]);
    if (loggedPro) saveTransaction(withPro, loggedPro.id).catch(err => {
      console.error('[addManualTransaction] No se pudo guardar en Supabase:', err?.message || err);
      addNotification(`⚠️ La transacción NO se guardó en el servidor. Intenta de nuevo.`, 'payment');
    });
  };

  const logout = (navigate: any, view: string) => {
    supabase.auth.signOut().catch(() => {});
    setLoggedPro(null);
    setIsAdmin(false);
    // Limpiar datos clínicos sensibles del localStorage al cerrar sesión
    localStorage.removeItem('maslife_patients');
    localStorage.removeItem('maslife_appointments');
    localStorage.removeItem('maslife_manual_transactions');
    localStorage.removeItem('maslife_logged_pro');
    localStorage.removeItem('maslife_notifications');
    if (view === 'PROFESSIONAL') navigate('/pro/login');
    else if (view === 'ADMIN') navigate('/admin/login');
    else navigate('/');
  };

  const value: ClinicContextType = {
    isLoading,
    isAdmin,
    setIsAdmin,
    professionals,
    setProfessionals,
    loggedPro,
    setLoggedPro,
    updateProfessional,
    updatePro: updateProfessional, // alias
    registerPro,
    appointments,
    setAppointments,
    addAppointment,
    batchAddAppointments,
    updateAppointment,
    deleteAppointment,
    deleteAppointmentsByRecurrence,
    patients,
    setPatients,
    addPatient,
    updatePatient,
    manualTransactions,
    addManualTransaction,
    templates,
    setTemplates,
    notifications,
    setNotifications,
    addNotification,
    markNotificationRead,
    removeNotification,
    clearNotifications,
    logout
  };

  return <ClinicContext.Provider value={value}>{children}</ClinicContext.Provider>;
};

export const useClinic = () => {
  const context = useContext(ClinicContext);
  if (context === undefined) {
    throw new Error('useClinic must be used within a ClinicProvider');
  }
  return context;
};
