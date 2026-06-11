import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Debe ir antes de cualquier import que cargue supabaseClient
vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      admin: {
        deleteUser: vi.fn().mockResolvedValue({}),
      },
    },
  },
  APP_URL: 'https://www.clinicamaslife.cl',
}));

import { supabase } from '../supabaseClient';
import {
  hashPassword,
  verifyPassword,
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  loginProfessional,
  updatePassword,
  getPatients,
  savePatient,
  deletePatient,
  getAppointments,
  saveAppointment,
  deleteAppointment,
  getTransactions,
  saveTransaction,
  deleteTransaction,
} from '../supabaseService';
import type { Patient, Appointment, Transaction } from '../types';

// ── Helper: crea un query-builder encadenable y awaitable ────────────────────
function makeBuilder(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const builder: any = {};
  Object.assign(builder, {
    select: vi.fn().mockReturnValue(builder),
    eq: vi.fn().mockReturnValue(builder),
    neq: vi.fn().mockReturnValue(builder),
    gte: vi.fn().mockReturnValue(builder),
    lte: vi.fn().mockReturnValue(builder),
    lt: vi.fn().mockReturnValue(builder),
    gt: vi.fn().mockReturnValue(builder),
    or: vi.fn().mockReturnValue(builder),
    order: vi.fn().mockReturnValue(builder),
    limit: vi.fn().mockReturnValue(builder),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    insert: vi.fn().mockResolvedValue(result),
    upsert: vi.fn().mockResolvedValue(result),
    update: vi.fn().mockReturnValue(builder),
    delete: vi.fn().mockReturnValue(builder),
    // Hace el builder awaitable (simulando el PostgrestFilterBuilder de Supabase)
    then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
    catch: (fn: any) => Promise.resolve(result).catch(fn),
    finally: (fn: any) => Promise.resolve(result).finally(fn),
  });
  return builder;
}

// ── Datos de muestra en formato BD (snake_case) ──────────────────────────────
const sampleDBProfessional = {
  id: 'pro-1', slug: 'dr-test-pro-1', name: 'Dr. Profesional',
  email: 'pro@test.com', specialty: 'Psicología', city: 'Santiago',
  bio: 'Psicólogo clínico', avatar: '',
  working_hours: { start: '09:00', end: '18:00' },
  modalities: { online: true, inPerson: true, home: false },
  services: [], is_public: true, is_verified: true, is_approved: true,
  is_subscribed: true, subscription_status: 'active',
  needs_password_reset: false, payment_enabled: true,
  subscription_link: '', created_at: '2025-01-01T00:00:00Z',
  rut: null, schedule: null,
};

const sampleDBPatient = {
  id: 'pat-1', name: 'Ana González', rut: '12.345.678-9',
  email: 'ana@test.com', phone: '+56912345678',
  risk: 'Bajo', status: 'Nuevo', archived: false,
  custom_fields: [{ label: 'Obs', value: 'Sin observaciones' }],
  attachments: [], allergies: ['Penicilina'],
  medical_history: 'Hipertensión controlada', age: 45,
  prevision: 'Fonasa', gender: 'Femenino',
  birth_date: '1979-03-15', address: 'Av. Libertad 100',
  vitals: null, soap: null, goals: [],
  session_logs: [{ id: 's1', date: '2025-01-01', note: 'Sesión inicial' }],
  last_visit: '2025-01-01', emergency_contact: 'Pedro González',
};

const sampleDBAppointment = {
  id: 'apt-1', patient_id: 'pat-1', patient_name: 'Ana González',
  patient_phone: '+56912345678', doctor_name: 'Dr. Médico',
  specialty: 'Psicología', service_name: 'Terapia Individual',
  date: '2025-06-01', time: '10:00', duration: 60,
  type: 'Presencial', status: 'Confirmado', price: 50000,
  payment_status: 'Pendiente', notes: 'Primera sesión',
  color: '#4CAF50', category: 'Medical', professional_id: 'pro-1',
  booking_source: 'manual', paid_at: null, payment_amount: null,
};

// ── Datos de muestra en formato app (camelCase) ───────────────────────────────
const samplePatient: Patient = {
  id: 'pat-1', name: 'Ana González', rut: '12.345.678-9',
  email: 'ana@test.com', phone: '+56912345678',
  risk: 'Bajo', status: 'Nuevo', archived: false,
  customFields: [], attachments: [], allergies: [],
  medicalHistory: 'Hipertensión controlada', age: 45,
  prevision: 'Fonasa', gender: 'Femenino',
  birthDate: '1979-03-15', address: 'Av. Libertad 100',
};

const sampleAppointment: Appointment = {
  id: 'apt-1', patientId: 'pat-1', patientName: 'Ana González',
  patientPhone: '+56912345678', doctorName: 'Dr. Médico',
  specialty: 'Psicología', serviceName: 'Terapia Individual',
  date: '2025-06-01', time: '10:00', duration: 60,
  type: 'Presencial', status: 'Confirmado', price: 50000,
  paymentStatus: 'Pendiente', category: 'Medical', professionalId: 'pro-1',
};

const sampleTransaction: Transaction = {
  id: 'tx-1', amount: 50000, description: 'Pago terapia',
  date: '2025-06-01', type: 'Ingreso',
};

// ═════════════════════════════════════════════════════════════════════════════
// hashPassword / verifyPassword
// ═════════════════════════════════════════════════════════════════════════════
describe('hashPassword / verifyPassword', () => {
  it('produce un hash hexadecimal de 64 caracteres', async () => {
    const hash = await hashPassword('miContraseña123');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('es determinístico — misma entrada produce mismo hash', async () => {
    const hash1 = await hashPassword('abc123');
    const hash2 = await hashPassword('abc123');
    expect(hash1).toBe(hash2);
  });

  it('verifyPassword retorna true para la contraseña correcta', async () => {
    const hash = await hashPassword('segura$2025');
    expect(await verifyPassword('segura$2025', hash)).toBe(true);
  });

  it('verifyPassword retorna false para contraseña incorrecta', async () => {
    const hash = await hashPassword('correcta');
    expect(await verifyPassword('incorrecta', hash)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// checkRateLimit
// ═════════════════════════════════════════════════════════════════════════════
describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('no bloquea cuando no hay intentos registrados', () => {
    const result = checkRateLimit();
    expect(result.blocked).toBe(false);
    expect(result.remainingMs).toBe(0);
  });

  it('no bloquea con 4 intentos fallidos (máximo es 5)', () => {
    localStorage.setItem('maslife_login_attempts', JSON.stringify({ count: 4, ts: Date.now() }));
    expect(checkRateLimit().blocked).toBe(false);
  });

  it('bloquea al alcanzar 5 intentos fallidos dentro de la ventana', () => {
    localStorage.setItem('maslife_login_attempts', JSON.stringify({ count: 5, ts: Date.now() }));
    const result = checkRateLimit();
    expect(result.blocked).toBe(true);
    expect(result.remainingMs).toBeGreaterThan(0);
  });

  it('desbloquea y limpia localStorage tras expirar la ventana de 15 min', () => {
    const sixteenMinAgo = Date.now() - 16 * 60 * 1000;
    localStorage.setItem('maslife_login_attempts', JSON.stringify({ count: 5, ts: sixteenMinAgo }));
    const result = checkRateLimit();
    expect(result.blocked).toBe(false);
    expect(localStorage.getItem('maslife_login_attempts')).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// recordFailedAttempt
// ═════════════════════════════════════════════════════════════════════════════
describe('recordFailedAttempt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('crea entrada con count 1 en el primer intento fallido', () => {
    recordFailedAttempt();
    const entry = JSON.parse(localStorage.getItem('maslife_login_attempts')!);
    expect(entry.count).toBe(1);
    expect(entry.ts).toBeGreaterThan(0);
  });

  it('incrementa el contador en intentos consecutivos', () => {
    recordFailedAttempt();
    recordFailedAttempt();
    recordFailedAttempt();
    const entry = JSON.parse(localStorage.getItem('maslife_login_attempts')!);
    expect(entry.count).toBe(3);
  });

  it('reinicia el contador si la ventana de tiempo expiró', () => {
    const old = { count: 4, ts: Date.now() - 16 * 60 * 1000 };
    localStorage.setItem('maslife_login_attempts', JSON.stringify(old));
    recordFailedAttempt();
    const entry = JSON.parse(localStorage.getItem('maslife_login_attempts')!);
    expect(entry.count).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// clearRateLimit
// ═════════════════════════════════════════════════════════════════════════════
describe('clearRateLimit', () => {
  it('elimina la entrada de intentos del localStorage', () => {
    localStorage.setItem('maslife_login_attempts', JSON.stringify({ count: 3, ts: Date.now() }));
    clearRateLimit();
    expect(localStorage.getItem('maslife_login_attempts')).toBeNull();
  });

  it('no lanza error si no había entrada previa', () => {
    expect(() => clearRateLimit()).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// loginProfessional
// ═════════════════════════════════════════════════════════════════════════════
describe('loginProfessional', () => {
  it('retorna error sin llamar a Supabase si el rate limit está activo', async () => {
    localStorage.setItem('maslife_login_attempts', JSON.stringify({ count: 5, ts: Date.now() }));
    const result = await loginProfessional('user@test.com', 'pass');
    expect(result.error).toMatch(/Demasiados intentos/);
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('retorna error y registra el intento si Supabase Auth falla', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid credentials' },
    } as any);

    const result = await loginProfessional('user@test.com', 'wrongpass');

    expect(result.error).toBe('Email o contraseña incorrectos.');
    const entry = JSON.parse(localStorage.getItem('maslife_login_attempts')!);
    expect(entry.count).toBe(1);
  });

  it('retorna error y cierra sesión si el perfil profesional no existe en BD', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: { id: 'user-1' }, session: {} },
      error: null,
    } as any);
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ data: null, error: null }));

    const result = await loginProfessional('user@test.com', 'pass');

    expect(result.error).toMatch(/Perfil de profesional no encontrado/);
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('retorna error y cierra sesión si el profesional no está aprobado', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: { id: 'pro-1' }, session: {} },
      error: null,
    } as any);
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeBuilder({ data: { ...sampleDBProfessional, is_approved: false }, error: null })
    );

    const result = await loginProfessional('pro@test.com', 'pass');

    expect(result.error).toMatch(/pendiente de aprobación/);
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('retorna el perfil mapeado y limpia el rate limit en login exitoso', async () => {
    localStorage.setItem('maslife_login_attempts', JSON.stringify({ count: 2, ts: Date.now() }));
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: { id: 'pro-1' }, session: {} },
      error: null,
    } as any);
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ data: sampleDBProfessional, error: null }));

    const result = await loginProfessional('pro@test.com', 'pass');

    expect(result.pro).toMatchObject({
      id: 'pro-1',
      name: 'Dr. Profesional',
      isApproved: true,
      workingHours: { start: '09:00', end: '18:00' },
    });
    expect(localStorage.getItem('maslife_login_attempts')).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// updatePassword
// ═════════════════════════════════════════════════════════════════════════════
describe('updatePassword', () => {
  it('retorna error sin llamar a Supabase si la contraseña tiene menos de 8 caracteres', async () => {
    const result = await updatePassword('corta');
    expect(result.error).toMatch(/al menos 8 caracteres/);
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('llama a updateUser y retorna sin error si la contraseña es válida', async () => {
    vi.mocked(supabase.auth.updateUser).mockResolvedValueOnce({
      data: { user: {} as any },
      error: null,
    } as any);

    const result = await updatePassword('contraseñaSegura123');

    expect(result.error).toBeUndefined();
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'contraseñaSegura123' });
  });

  it('retorna error descriptivo si Supabase falla al actualizar', async () => {
    vi.mocked(supabase.auth.updateUser).mockResolvedValueOnce({
      data: { user: null as any },
      error: { message: 'Token expired' },
    } as any);

    const result = await updatePassword('contraseñaValida123');
    expect(result.error).toMatch(/link puede haber expirado/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getPatients — incluye prueba del mapper mapDBtoPatient
// ═════════════════════════════════════════════════════════════════════════════
describe('getPatients', () => {
  it('mapea correctamente snake_case de BD a camelCase en la app', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ data: [sampleDBPatient], error: null }));

    const patients = await getPatients('pro-1');

    expect(patients).toHaveLength(1);
    expect(patients[0]).toMatchObject({
      id: 'pat-1',
      medicalHistory: 'Hipertensión controlada',
      customFields: [{ label: 'Obs', value: 'Sin observaciones' }],
      birthDate: '1979-03-15',
      lastVisit: '2025-01-01',
      emergencyContact: 'Pedro González',
      allergies: ['Penicilina'],
      sessionLogs: [{ id: 's1', date: '2025-01-01', note: 'Sesión inicial' }],
    });
  });

  it('retorna array vacío cuando Supabase devuelve null', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ data: null, error: null }));

    const patients = await getPatients('pro-1');
    expect(patients).toEqual([]);
  });

  it('aplica valores por defecto en campos opcionales ausentes', async () => {
    const minimalDBPatient = {
      id: 'pat-2', name: 'Carlos Mínimo', rut: '11.111.111-1',
      // Sin campos opcionales
    };
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ data: [minimalDBPatient], error: null }));

    const patients = await getPatients('pro-1');

    expect(patients[0].email).toBe('');
    expect(patients[0].allergies).toEqual([]);
    expect(patients[0].customFields).toEqual([]);
    expect(patients[0].risk).toBe('Bajo');
    expect(patients[0].status).toBe('Nuevo');
  });

  it('lanza el error de Supabase si la consulta falla', async () => {
    const dbError = { message: 'DB connection error', code: '500' };
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ data: null, error: dbError }));

    await expect(getPatients('pro-1')).rejects.toEqual(dbError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// savePatient — incluye prueba del mapper mapPatientToDB
// ═════════════════════════════════════════════════════════════════════════════
describe('savePatient', () => {
  it('llama a upsert con datos en snake_case incluyendo professional_id', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: null }));

    await savePatient(samplePatient, 'pro-1');

    const builder = vi.mocked(supabase.from).mock.results[0].value;
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pat-1',
        professional_id: 'pro-1',
        medical_history: 'Hipertensión controlada',
        birth_date: '1979-03-15',
        custom_fields: [],
      })
    );
  });

  it('lanza el error de Supabase si upsert falla', async () => {
    const dbError = { message: 'Upsert failed' };
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: dbError }));

    await expect(savePatient(samplePatient, 'pro-1')).rejects.toEqual(dbError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// deletePatient
// ═════════════════════════════════════════════════════════════════════════════
describe('deletePatient', () => {
  it('llama a delete en la tabla patients con el id correcto', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: null }));

    await deletePatient('pat-1');

    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith('patients');
    const builder = vi.mocked(supabase.from).mock.results[0].value;
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 'pat-1');
  });

  it('lanza el error de Supabase si delete falla', async () => {
    const dbError = { message: 'Delete failed' };
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: dbError }));

    await expect(deletePatient('pat-1')).rejects.toEqual(dbError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getAppointments — incluye prueba del mapper mapDBtoAppointment
// ═════════════════════════════════════════════════════════════════════════════
describe('getAppointments', () => {
  it('mapea correctamente snake_case de BD a camelCase', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ data: [sampleDBAppointment], error: null }));

    const appointments = await getAppointments('pro-1');

    expect(appointments).toHaveLength(1);
    expect(appointments[0]).toMatchObject({
      id: 'apt-1',
      patientId: 'pat-1',
      patientName: 'Ana González',
      serviceName: 'Terapia Individual',
      paymentStatus: 'Pendiente',
      professionalId: 'pro-1',
      bookingSource: 'manual',
    });
  });

  it('retorna array vacío cuando Supabase devuelve null', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ data: null, error: null }));

    expect(await getAppointments('pro-1')).toEqual([]);
  });

  it('lanza el error de Supabase si la consulta falla', async () => {
    const dbError = { message: 'DB error' };
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ data: null, error: dbError }));

    await expect(getAppointments('pro-1')).rejects.toEqual(dbError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// saveAppointment — incluye prueba del mapper mapAppointmentToDB
// ═════════════════════════════════════════════════════════════════════════════
describe('saveAppointment', () => {
  it('lanza error si la cita no tiene professionalId', async () => {
    const appSinPro = { ...sampleAppointment, professionalId: undefined };

    await expect(saveAppointment(appSinPro as Appointment)).rejects.toThrow('Appointment sin professionalId');
  });

  it('llama a upsert con mapeo camelCase → snake_case correcto', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: null }));

    await saveAppointment(sampleAppointment);

    const builder = vi.mocked(supabase.from).mock.results[0].value;
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'apt-1',
        patient_id: 'pat-1',
        patient_name: 'Ana González',
        service_name: 'Terapia Individual',
        payment_status: 'Pendiente',
        professional_id: 'pro-1',
      })
    );
  });

  it('lanza el error de Supabase si upsert falla', async () => {
    const dbError = { message: 'Upsert failed' };
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: dbError }));

    await expect(saveAppointment(sampleAppointment)).rejects.toEqual(dbError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// deleteAppointment
// ═════════════════════════════════════════════════════════════════════════════
describe('deleteAppointment', () => {
  it('llama a delete en la tabla appointments con el id correcto', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: null }));

    await deleteAppointment('apt-1');

    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith('appointments');
    const builder = vi.mocked(supabase.from).mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith('id', 'apt-1');
  });

  it('lanza el error de Supabase si delete falla', async () => {
    const dbError = { message: 'Delete failed' };
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: dbError }));

    await expect(deleteAppointment('apt-1')).rejects.toEqual(dbError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getTransactions
// ═════════════════════════════════════════════════════════════════════════════
describe('getTransactions', () => {
  it('retorna transacciones mapeadas correctamente desde BD', async () => {
    const dbTx = { id: 'tx-1', amount: 50000, description: 'Pago terapia', date: '2025-06-01', type: 'Ingreso' };
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ data: [dbTx], error: null }));

    const transactions = await getTransactions('pro-1');

    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ id: 'tx-1', amount: 50000, type: 'Ingreso' });
  });

  it('retorna array vacío cuando Supabase devuelve null', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ data: null, error: null }));

    expect(await getTransactions('pro-1')).toEqual([]);
  });

  it('lanza el error de Supabase si la consulta falla', async () => {
    const dbError = { message: 'DB error' };
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ data: null, error: dbError }));

    await expect(getTransactions('pro-1')).rejects.toEqual(dbError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// saveTransaction
// ═════════════════════════════════════════════════════════════════════════════
describe('saveTransaction', () => {
  it('llama a upsert con los campos correctos incluyendo professional_id', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: null }));

    await saveTransaction(sampleTransaction, 'pro-1');

    const builder = vi.mocked(supabase.from).mock.results[0].value;
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tx-1',
        amount: 50000,
        description: 'Pago terapia',
        type: 'Ingreso',
        professional_id: 'pro-1',
      })
    );
  });

  it('lanza el error de Supabase si upsert falla', async () => {
    const dbError = { message: 'Save failed' };
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: dbError }));

    await expect(saveTransaction(sampleTransaction, 'pro-1')).rejects.toEqual(dbError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// deleteTransaction
// ═════════════════════════════════════════════════════════════════════════════
describe('deleteTransaction', () => {
  it('llama a delete en la tabla transactions con el id correcto', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: null }));

    await deleteTransaction('tx-1');

    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith('transactions');
    const builder = vi.mocked(supabase.from).mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith('id', 'tx-1');
  });

  it('lanza el error de Supabase si delete falla', async () => {
    const dbError = { message: 'Delete failed' };
    vi.mocked(supabase.from).mockReturnValueOnce(makeBuilder({ error: dbError }));

    await expect(deleteTransaction('tx-1')).rejects.toEqual(dbError);
  });
});
