import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfessionalProfile, Appointment, Patient, Transaction, ClinicalTemplate, Notification } from './types';
import { supabase, getActiveSession, getPatients, getAppointments, getTransactions, savePatient, saveAppointment, deleteAppointment as deleteAppointmentDB, saveTransaction, deleteTransaction as deleteTransactionDB, batchInsertBlocks, deleteBlocksByRecurrence, getProNotifications, markProNotificationRead } from './supabaseService';
import { auditService } from './auditService';

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
  /** Devuelve `{ ok }` tras confirmar (o no) el guardado en Supabase. Nunca lanza. */
  addAppointment: (app: Appointment) => Promise<{ ok: boolean; error?: string }>;
  batchAddAppointments: (apps: Appointment[]) => Promise<void>;
  updateAppointment: (app: Appointment) => void;
  deleteAppointment: (id: string) => void;
  deleteAppointmentsByRecurrence: (recurrenceId: string, mode: 'single' | 'future' | 'all', blockId: string, blockDate: string) => Promise<void>;

  // Pacientes
  patients: Patient[];
  setPatients: (patients: Patient[] | ((prev: Patient[]) => Patient[])) => void;
  addPatient: (patient: Patient) => void;
  updatePatient: (patient: Patient) => Promise<boolean>;

  // Transacciones
  manualTransactions: Transaction[];
  addManualTransaction: (t: Transaction) => void;
  deleteManualTransaction: (id: string) => void;

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
  // Limpieza única de data semilla vieja (demo) que quedó cacheada en navegadores.
  // Supabase es la fuente de verdad: los datos reales se recargan en loadProData.
  if (localStorage.getItem('maslife_seed_v') !== '2') {
    localStorage.removeItem('maslife_professionals');
    localStorage.removeItem('maslife_appointments');
    localStorage.removeItem('maslife_patients');
    localStorage.setItem('maslife_seed_v', '2');
  }

  const [professionals, setProfessionals] = useState<ProfessionalProfile[]>(() => {
    const saved = localStorage.getItem('maslife_professionals');
    return saved ? JSON.parse(saved) : [];
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
    return saved ? JSON.parse(saved) : [];
  });

  const [patients, setPatients] = useState<Patient[]>(() => {
    const saved = localStorage.getItem('maslife_patients');
    return saved ? JSON.parse(saved) : [];
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
  const lastLoadRef = useRef(0);
  const isFetchingRef = useRef(false);
  useEffect(() => {
    if (!loggedPro) {
      // Al cerrar sesión: limpiar datos para no filtrar a la próxima sesión
      setPatients([]);
      setAppointments([]);
      setManualTransactions([]);
      return;
    }

    const loadProData = async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (isFetchingRef.current) return; // evita solicitudes superpuestas (sondeo lento / red lenta)
      isFetchingRef.current = true;
      if (!silent) setIsLoading(true);
      try {
        // Red de seguridad de pagos: antes de leer, le preguntamos a MercadoPago
        // si alguna reserva pendiente ya se pagó. Cubre el caso en que el paciente
        // pagó pero cerró la pestaña y MercadoPago tampoco avisó — así el
        // profesional ve la cita confirmada al abrir el panel, sin hacer nada.
        // Best-effort: si falla, la carga sigue igual.
        await fetch('/api/book-appointment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reconcile', professionalId: loggedPro.id }),
        }).catch(err => console.error('[reconcile]', err?.message));

        const [supaPatients, supaApps, supaTransactions, supaNotifs] = await Promise.all([
          getPatients(loggedPro.id),
          getAppointments(loggedPro.id),
          getTransactions(loggedPro.id),
          getProNotifications(loggedPro.id),
        ]);

        // Notificaciones del paciente (evidencia / sesión / mensaje) → campana.
        // Solo llegan las NO leídas; se agregan las nuevas sin duplicar.
        setNotifications(prev => {
          const have = new Set(prev.map(n => n.id));
          const fresh = supaNotifs
            .filter(r => !have.has(`db-${r.id}`))
            .map(r => ({
              id: `db-${r.id}`,
              title: r.body || 'Nueva actividad de un paciente',
              time: new Date(r.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
              type: 'patient' as const,
              read: false,
              patientId: r.patient_id || undefined,
            }));
          return fresh.length ? [...fresh, ...prev] : prev;
        });
        // Merge: Supabase es la fuente de verdad, pero si hay registros locales
        // con IDs que no están en Supabase (guardado fallido), los conservamos
        // en lugar de perderlos silenciosamente — y los RE-SINCRONIZAMOS (rescate).
        const proId = loggedPro.id;
        let patientsToSync: Patient[] = [];
        let appsToSync: Appointment[] = [];
        let txnsToSync: Transaction[] = [];

        setPatients(prev => {
          const supaIds = new Set(supaPatients.map(p => p.id));
          const localOnly = prev.filter(p => p.professionalId === proId && !supaIds.has(p.id));
          patientsToSync = localOnly;            // asignación (idempotente bajo StrictMode)
          return [...supaPatients, ...localOnly];
        });
        setAppointments(prev => {
          const supaIds = new Set(supaApps.map(a => a.id));
          const localOnly = prev.filter(a => a.professionalId === proId && !supaIds.has(a.id));
          appsToSync = localOnly;
          return [...supaApps, ...localOnly];
        });
        setManualTransactions(prev => {
          const supaIds = new Set(supaTransactions.map(t => t.id));
          const localOnly = prev.filter(t => t.professionalId === proId && !supaIds.has(t.id));
          txnsToSync = localOnly;
          return [...supaTransactions, ...localOnly];
        });

        // Rescate: sube a la nube lo que solo estaba en ESTE dispositivo (guardados
        // que antes fallaban). Idempotente (upsert por id) → seguro en cualquier
        // dispositivo y profesional. Si algo falla, se reintenta en la próxima carga;
        // no bloquea la app ni satura de notificaciones (solo log de consola).
        void (async () => {
          for (const p of patientsToSync) {
            try { await savePatient(p, proId); } catch (e) { console.warn('[rescate paciente]', (e as Error)?.message || e); }
          }
          for (const a of appsToSync) {
            try { await saveAppointment({ ...a, professionalId: proId }); } catch (e) { console.warn('[rescate cita]', (e as Error)?.message || e); }
          }
          for (const t of txnsToSync) {
            try { await saveTransaction(t, proId); } catch (e) { console.warn('[rescate transacción]', (e as Error)?.message || e); }
          }
        })();
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
        if (!silent) setIsLoading(false);
        isFetchingRef.current = false;
      }
    };

    loadProData();
    lastLoadRef.current = Date.now();

    // Refresco al volver a la app (móvil ↔ web): si la pestaña vuelve a ser
    // visible y pasaron ≥60s desde la última carga, recargar desde Supabase
    // para ver citas/transacciones creadas en otro dispositivo sin F5.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadRef.current < 60_000) return;
      lastLoadRef.current = Date.now();
      loadProData();
    };
    document.addEventListener('visibilitychange', onVisible);

    // Sondeo silencioso: mientras la pestaña esté en primer plano, refrescar
    // cada 25s para reflejar citas creadas por reservas online (u otro
    // dispositivo) sin necesidad de recargar la página ni mostrar pantallas
    // de carga intermedias (silent:true no toca isLoading).
    const pollInterval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      lastLoadRef.current = Date.now();
      loadProData({ silent: true });
    }, 25_000);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(pollInterval);
    };
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

  /**
   * Agrega una cita. Devuelve `{ ok }` para que quien lo necesite (p. ej. el
   * agente IA) pueda **esperar la confirmación real de Supabase** antes de
   * decirle al usuario que quedó agendada. Nunca lanza: los llamadores que no
   * la esperan (la agenda manual) siguen comportándose igual que antes.
   */
  const addAppointment = async (app: Appointment): Promise<{ ok: boolean; error?: string }> => {
    setAppointments(prev => [...prev, app]);
    addNotification(`Nueva cita: ${app.patientName} - ${app.serviceName} (${app.date} ${app.time})`, 'appointment');
    let saveOk = true;
    let saveError: string | undefined;
    // Persistir en Supabase — si falla, avisar en vez de ocultar el error.
    // Caso FK 23503: la cita apunta a un paciente que solo existe en este
    // dispositivo (ficha nunca sincronizada) → subir la ficha y reintentar una vez.
    await saveAppointment(app).catch(async err => {
      const msg = String(err?.message || err || '');
      const isPatientFk = (err?.code === '23503' || msg.includes('23503') || msg.includes('foreign key')) && app.patientId;
      if (isPatientFk) {
        const localPatient = patients.find(p => p.id === app.patientId);
        if (localPatient) {
          try {
            await savePatient(localPatient, app.professionalId);
            await saveAppointment(app);
            return; // reparado: ficha + cita quedaron en la nube
          } catch (retryErr) {
            err = retryErr;
          }
        }
      }
      console.error('[addAppointment] No se pudo guardar la cita en Supabase:', (err as any)?.message || err);
      saveOk = false;
      saveError = String((err as any)?.message || err || 'error desconocido');
      notifyWriteError(err, `⚠️ La cita de ${app.patientName} NO se guardó en el servidor: el horario seguirá visible como disponible para tus pacientes. Créala de nuevo.`);
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

    return { ok: saveOk, error: saveError };
  };

  const batchAddAppointments = async (apps: Appointment[]) => {
    setAppointments(prev => [...prev, ...apps]);
    try {
      await batchInsertBlocks(apps);
    } catch (err) {
      // Nunca silencioso: si los bloqueos no llegan a la nube, esos horarios
      // siguen visibles como disponibles para los pacientes.
      notifyWriteError(err, `⚠️ ${apps.length > 1 ? 'Los bloqueos NO se guardaron' : 'El bloqueo NO se guardó'} en el servidor: esos horarios siguen disponibles para tus pacientes. Intenta de nuevo.`);
      throw err;
    }
  };

  const updateAppointment = (updated: Appointment) => {
    setAppointments(prev => prev.map(a => a.id === updated.id ? updated : a));
    addNotification(`Cita actualizada: ${updated.patientName} (${updated.date} ${updated.time})`, 'appointment');
    saveAppointment(updated).catch(err => {
      console.error('[updateAppointment] No se pudo guardar en Supabase:', err?.message || err);
      notifyWriteError(err, `⚠️ Los cambios de la cita de ${updated.patientName} NO se guardaron. Intenta de nuevo.`);
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
      notifyWriteError(err, `⚠️ La cita NO se eliminó en el servidor. Recarga la página para verificar.`);
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
    // Nunca silencioso: si el borrado en la nube falla, los bloqueos reaparecen al
    // recargar → avisar al profesional en vez de fingir que se eliminaron.
    try {
      await deleteBlocksByRecurrence(recurrenceId, mode, blockId, blockDate);
    } catch (err) {
      notifyWriteError(err, '⚠️ Los bloqueos NO se eliminaron en el servidor: reaparecerán al recargar. Intenta de nuevo.');
    }
  };

  const addNotification = (title: string, type: 'appointment' | 'payment' | 'system') => {
    const now = Date.now();
    setNotifications(prev => {
      // De-dup: si ya existe una notificación idéntica sin leer creada hace <10s,
      // no agregamos otra (evita el flood de "NO se guardaron" al reintentar).
      const dup = prev.find(n => {
        if (n.title !== title || n.read) return false;
        const ts = parseInt(String(n.id).replace(/^notif-/, '').split('-')[0], 10);
        return Number.isFinite(ts) && (now - ts) < 10_000;
      });
      if (dup) return prev;
      const newNotif: Notification = {
        id: `notif-${now}-${Math.floor(Math.random() * 1e6)}`,
        title,
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        type,
        read: false
      };
      return [newNotif, ...prev];
    });
  };

  // Notifica un fallo de escritura. Si el error es de sesión expirada, muestra un
  // mensaje único y accionable (el de-dup de addNotification evita el flood).
  const notifyWriteError = (
    err: unknown,
    fallback: string,
    type: 'appointment' | 'payment' | 'system' = 'appointment',
  ) => {
    const authExpired = !!(err as { authExpired?: boolean })?.authExpired;
    addNotification(
      authExpired ? '🔒 Tu sesión expiró. Vuelve a iniciar sesión para guardar tus cambios.' : fallback,
      type,
    );
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    // Notificaciones de paciente (id 'db-…') → persistir leída en Supabase.
    if (id.startsWith('db-')) void markProNotificationRead(id.slice(3));
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
        notifyWriteError(err, `⚠️ El paciente ${patient.name} NO se guardó en el servidor. Revisa tu conexión y vuelve a crearlo.`);
      });
      // Trazabilidad Ley 21.719 — registrar creación de dato de salud
      void auditService.log({
        userId: loggedPro.id, userName: loggedPro.name,
        action: 'PATIENT_CREATE', resourceId: patient.id, resourceType: 'patient',
      });
    }
  };

  const updatePatient = async (patient: Patient): Promise<boolean> => {
    setPatients(prev => prev.map(old => old.id === patient.id ? patient : old));
    if (!loggedPro) return true;
    try {
      await savePatient(patient, loggedPro.id);
      return true;
    } catch (err) {
      console.error('[updatePatient] No se pudo guardar en Supabase:', (err as Error)?.message || err);
      notifyWriteError(err, `⚠️ Los cambios de ${patient.name} NO se guardaron en el servidor. Intenta de nuevo.`);
      return false;
    }
  };

  const addManualTransaction = (transaction: Transaction) => {
    const withPro = loggedPro ? { ...transaction, professionalId: loggedPro.id } : transaction;
    setManualTransactions(prev => [...prev, withPro]);
    if (loggedPro) saveTransaction(withPro, loggedPro.id).catch(err => {
      console.error('[addManualTransaction] No se pudo guardar en Supabase:', err?.message || err);
      notifyWriteError(err, `⚠️ La transacción NO se guardó en el servidor. Intenta de nuevo.`, 'payment');
    });
  };

  const deleteManualTransaction = (id: string) => {
    setManualTransactions(prev => prev.filter(t => t.id !== id));
    deleteTransactionDB(id).catch(err => {
      console.error('[deleteManualTransaction] No se pudo eliminar en Supabase:', err?.message || err);
      notifyWriteError(err, '⚠️ La transacción NO se eliminó del servidor. Intenta de nuevo.', 'payment');
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
    deleteManualTransaction,
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
