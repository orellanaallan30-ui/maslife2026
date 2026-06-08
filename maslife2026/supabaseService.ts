// supabaseService.ts — v3: Supabase Auth + sin hardcodeos + rate-limiting
import { supabase } from './supabaseClient';
import { Patient, Appointment, Transaction, ProfessionalProfile, Review } from './types';

// ── SHA-256 para verificación de integridad de documentos clínicos únicamente ──
// NO usar para autenticar contraseñas de usuarios — SHA-256 sin salt es vulnerable
// a rainbow tables. La autenticación real usa Supabase Auth (bcrypt server-side).
export async function hashPassword(plain: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return (await hashPassword(plain)) === hashed;
}

// ── Rate limiting local (brute force) ────────────────────────
const RL_KEY = 'maslife_login_attempts';
const RL_MAX = 5;
const RL_WINDOW = 5 * 60 * 1000; // 5 min

interface RLEntry { count: number; ts: number; }

export function checkRateLimit(): { blocked: boolean; remainingMs: number } {
  const raw = localStorage.getItem(RL_KEY);
  if (!raw) return { blocked: false, remainingMs: 0 };
  const e: RLEntry = JSON.parse(raw);
  const age = Date.now() - e.ts;
  if (age > RL_WINDOW) { localStorage.removeItem(RL_KEY); return { blocked: false, remainingMs: 0 }; }
  if (e.count >= RL_MAX) return { blocked: true, remainingMs: RL_WINDOW - age };
  return { blocked: false, remainingMs: 0 };
}

export function recordFailedAttempt(): void {
  const raw = localStorage.getItem(RL_KEY);
  const e: RLEntry = raw ? JSON.parse(raw) : { count: 0, ts: Date.now() };
  if (Date.now() - e.ts > RL_WINDOW) { localStorage.setItem(RL_KEY, JSON.stringify({ count: 1, ts: Date.now() })); return; }
  e.count += 1;
  localStorage.setItem(RL_KEY, JSON.stringify(e));
}

export function clearRateLimit(): void { localStorage.removeItem(RL_KEY); }

// ── Auth: Login ──────────────────────────────────────────────
export async function loginProfessional(
  email: string,
  password: string
): Promise<{ pro: ProfessionalProfile; error?: never } | { pro?: never; error: string }> {
  const rl = checkRateLimit();
  if (rl.blocked) {
    const min = Math.ceil(rl.remainingMs / 60000);
    return { error: `Demasiados intentos fallidos. Espera ${min} minuto${min !== 1 ? 's' : ''}.` };
  }

  // 1. Login con Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !authData.user) {
    recordFailedAttempt();
    const msg = authError?.message?.toLowerCase() ?? '';
    if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
      return { error: 'Tu email aún no está confirmado. Revisa tu bandeja de entrada y haz clic en el enlace de verificación.' };
    }
    return { error: 'Email o contraseña incorrectos.' };
  }

  // 2. Cargar perfil desde tabla professionals
  const { data: proData, error: proError } = await supabase
    .from('professionals')
    .select('*')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (proError || !proData) {
    await supabase.auth.signOut();
    return { error: 'Perfil de profesional no encontrado. Contacta al administrador.' };
  }

  clearRateLimit();
  const pro = mapDBtoPro(proData);
  // Si el perfil existe pero no está aprobado, bloquear acceso
  if (!pro.isApproved) {
    await supabase.auth.signOut();
    return { error: 'Tu cuenta está pendiente de aprobación por el administrador. Te notificaremos cuando esté activa.' };
  }
  return { pro };
}

// ── Auth: Registro ───────────────────────────────────────────
export async function registerProfessional(
  data: {
    name: string; email: string; password: string;
    specialty: string; city: string; rut?: string;
  }
): Promise<{ pro: ProfessionalProfile; error?: never } | { pro?: never; error: string }> {
  // 1. Crear usuario en Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: { name: data.name, specialty: data.specialty, role: 'professional' },
      emailRedirectTo: 'https://www.clinicamaslife.cl/#/pro/email-verified',
    },
  });

  if (authError) {
    if (authError.message.includes('already registered')) return { error: 'Este email ya está registrado.' };
    return { error: authError.message };
  }
  if (!authData.user) return { error: 'No se pudo crear la cuenta. Intenta de nuevo.' };

  const proId = authData.user.id;
  const slug = data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + proId.slice(0, 6);

  // 2. Crear perfil en tabla professionals
  const newPro: Partial<ProfessionalProfile> = {
    id: proId, slug, name: data.name, email: data.email,
    specialty: data.specialty, city: data.city,
    bio: '', avatar: '',
    workingHours: { start: '09:00', end: '18:00' },
    modalities: { online: true, inPerson: true, home: false },
    services: [], isPublic: false, isVerified: false, isSubscribed: false,
    subscriptionStatus: 'trial', needsPasswordReset: false, paymentEnabled: false,
    createdAt: new Date().toISOString(),
  };

  const { error: saveError } = await supabase.from('professionals').insert(mapProToDB(newPro as ProfessionalProfile));
  if (saveError) {
    await supabase.auth.admin.deleteUser(proId).catch(() => null);
    return { error: 'Error al guardar el perfil. Intenta de nuevo.' };
  }

  return { pro: newPro as ProfessionalProfile };
}

// ── Auth: Recuperar contraseña ────────────────────────────────
export async function requestPasswordReset(email: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://www.clinicamaslife.cl/#/pro/reset-password',
  });
  if (error) return { error: 'No se encontró una cuenta con ese email.' };
  return {};
}

// ── Auth: Actualizar contraseña (desde link de reset) ─────────
export async function updatePassword(newPassword: string): Promise<{ error?: string }> {
  if (newPassword.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: 'No se pudo actualizar la contraseña. El link puede haber expirado.' };
  return {};
}

// ── Auth: Logout ─────────────────────────────────────────────
export async function signOutProfessional(): Promise<void> {
  await supabase.auth.signOut();
}

// ── Auth: Sesión activa ───────────────────────────────────────
export async function getActiveSession(): Promise<ProfessionalProfile | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const { data } = await supabase.from('professionals').select('*').eq('id', session.user.id).maybeSingle();
  return data ? mapDBtoPro(data) : null;
}

// ── Profesional ───────────────────────────────────────────────
export async function getProfessional(id: string): Promise<ProfessionalProfile | null> {
  const { data, error } = await supabase.from('professionals').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return mapDBtoPro(data);
}

export async function getProfessionalBySlugOrId(slugOrId: string): Promise<ProfessionalProfile | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
  const base = supabase.from('professionals').select('*');
  const { data, error } = isUuid
    ? await base.or(`slug.eq.${slugOrId},id.eq.${slugOrId}`).maybeSingle()
    : await base.eq('slug', slugOrId).maybeSingle();
  if (error || !data) return null;
  return mapDBtoPro(data);
}

export async function saveProfessional(pro: ProfessionalProfile): Promise<void> {
  const { error } = await supabase.from('professionals').upsert(mapProToDB(pro));
  if (error) throw error;
}

export async function getAllPublicProfessionals(): Promise<ProfessionalProfile[]> {
  const { data, error } = await supabase
    .from('professionals')
    .select('*')
    .eq('is_public', true)
    .order('name', { ascending: true });
  if (error || !data) return [];
  return data.map(mapDBtoPro);
}

// ── Pacientes — siempre requieren proId ──────────────────────
export async function getPatients(proId: string): Promise<Patient[]> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('professional_id', proId)
    .or(`deleted_at.is.null,deleted_at.gt.${cutoff}`);
  if (error) throw error;
  return (data || []).map(mapDBtoPatient);
}

export async function softDeletePatient(id: string): Promise<void> {
  const { error } = await supabase
    .from('patients')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function savePatient(patient: Patient, proId: string): Promise<void> {
  const { error } = await supabase.from('patients').upsert({ ...mapPatientToDB(patient), professional_id: proId });
  if (error) throw error;
}

export async function deletePatient(id: string): Promise<void> {
  const { error } = await supabase.from('patients').delete().eq('id', id);
  if (error) throw error;
}

// ── Citas ─────────────────────────────────────────────────────
export async function getAppointments(proId: string): Promise<Appointment[]> {
  const { data, error } = await supabase.from('appointments').select('*').eq('professional_id', proId);
  if (error) throw error;
  return (data || []).map(mapDBtoAppointment);
}

export async function saveAppointment(app: Appointment): Promise<void> {
  if (!app.professionalId) throw new Error('Appointment sin professionalId');
  const { error } = await supabase.from('appointments').upsert(mapAppointmentToDB(app));
  if (error) throw error;
  // Sync to Google Calendar (fire-and-forget, non-blocking)
  syncToGoogleCalendar('upsert', app).catch(() => null);
}

export async function deleteAppointment(id: string, googleEventId?: string): Promise<void> {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  if (error) throw error;
  // Sync deletion to Google Calendar (fire-and-forget)
  syncToGoogleCalendar('delete', { id, googleEventId } as any).catch(() => null);
}

async function syncToGoogleCalendar(action: 'upsert' | 'delete', appointment: Partial<Appointment> & { id: string }): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return;
  await fetch('/api/google-calendar-sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, appointment }),
  });
}

// ── Transacciones ─────────────────────────────────────────────
export async function getTransactions(proId: string): Promise<Transaction[]> {
  const { data, error } = await supabase.from('transactions').select('*').eq('professional_id', proId);
  if (error) throw error;
  return (data || []).map((t: Record<string, unknown>) => ({
    id: t.id as string, amount: t.amount as number,
    description: t.description as string, date: t.date as string, type: t.type as Transaction['type'],
  }));
}

export async function saveTransaction(t: Transaction, proId: string): Promise<void> {
  const { error } = await supabase.from('transactions').upsert({
    id: t.id, amount: t.amount, description: t.description, date: t.date, type: t.type, professional_id: proId,
  });
  if (error) throw error;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

// ── Migración desde localStorage ─────────────────────────────
export async function migrateFromLocalStorage(proId: string): Promise<void> {
  const patients = JSON.parse(localStorage.getItem('maslife_patients') || '[]') as Patient[];
  const apps     = JSON.parse(localStorage.getItem('maslife_appointments') || '[]') as Appointment[];
  const txs      = JSON.parse(localStorage.getItem('maslife_manual_transactions') || '[]') as Transaction[];
  for (const p of patients) await savePatient(p, proId).catch(() => null);
  for (const a of apps) { a.professionalId = proId; await saveAppointment(a).catch(() => null); }
  for (const t of txs) await saveTransaction(t, proId).catch(() => null);
}

// ── Mappers DB ↔ App ─────────────────────────────────────────
function mapDBtoPro(d: Record<string, unknown>): ProfessionalProfile {
  return {
    id: d.id as string, slug: d.slug as string, name: d.name as string,
    email: d.email as string, specialty: d.specialty as string, city: d.city as string,
    bio: (d.bio as string) || '', avatar: (d.avatar as string) || '',
    workingHours: (d.working_hours as ProfessionalProfile['workingHours']) || { start: '09:00', end: '18:00' },
    modalities: (d.modalities as ProfessionalProfile['modalities']) || { online: true, inPerson: true, home: false },
    services: (d.services as ProfessionalProfile['services']) || [],
    isPublic: (d.is_public as boolean) ?? false,
    isVerified: (d.is_verified as boolean) ?? false,
    isApproved: (d.is_approved as boolean) ?? false,
    isSubscribed: (d.is_subscribed as boolean) ?? false,
    subscriptionStatus: (d.subscription_status as ProfessionalProfile['subscriptionStatus']) || 'trial',
    trialEndDate: (d.trial_end_date as string) || undefined,
    needsPasswordReset: (d.needs_password_reset as boolean) ?? false,
    paymentEnabled: (d.payment_enabled as boolean) ?? false,
    bookingFee: (d.booking_fee as number) || undefined,
    chargeFullService: (d.charge_full_service as boolean) ?? false,
    bookingPaymentLink: (d.booking_payment_link as string) || undefined,
    subscriptionLink: (d.subscription_link as string) || '',
    createdAt: (d.created_at as string) || new Date().toISOString(),
    rut: d.rut as string | undefined,
    schedule: d.schedule as ProfessionalProfile['schedule'],
    mpConnected: (d.mp_connected as boolean) ?? false,
    mpPublicKey: (d.mp_public_key as string) || undefined,
    instagram: (d.instagram as string) || undefined,
    googleCalendarConnected: (d.google_calendar_connected as boolean) ?? false,
    reviewsEnabled: (d.reviews_enabled as boolean) ?? true,
  } as ProfessionalProfile;
}

function mapProToDB(pro: ProfessionalProfile): Record<string, unknown> {
  return {
    id: pro.id, slug: pro.slug, name: pro.name, email: pro.email,
    specialty: pro.specialty, city: pro.city, bio: pro.bio, avatar: pro.avatar,
    working_hours: pro.workingHours, modalities: pro.modalities, services: pro.services,
    is_public: pro.isPublic, is_verified: pro.isVerified, is_approved: (pro as any).isApproved ?? false, is_subscribed: pro.isSubscribed,
    subscription_status: pro.subscriptionStatus,
    trial_end_date: (pro as any).trialEndDate || null,
    needs_password_reset: pro.needsPasswordReset,
    payment_enabled: pro.paymentEnabled,
    booking_fee: pro.bookingFee || null,
    charge_full_service: pro.chargeFullService ?? false,
    booking_payment_link: (pro as any).bookingPaymentLink || null,
    subscription_link: pro.subscriptionLink,
    rut: (pro as any).rut || null, schedule: pro.schedule || null,
    mp_public_key: (pro as any).mpPublicKey || null,
    instagram: pro.instagram || null,
    reviews_enabled: pro.reviewsEnabled ?? true,
  };
}

function mapDBtoPatient(p: Record<string, unknown>): Patient {
  return {
    id: p.id as string, name: p.name as string, rut: p.rut as string,
    email: (p.email as string) || '', phone: (p.phone as string) || '',
    risk: (p.risk as Patient['risk']) || 'Bajo', status: (p.status as Patient['status']) || 'Nuevo',
    archived: (p.archived as boolean) ?? false, customFields: (p.custom_fields as Patient['customFields']) || [],
    attachments: (p.attachments as Patient['attachments']) || [], allergies: (p.allergies as string[]) || [],
    medicalHistory: (p.medical_history as string) || '', age: (p.age as number) || 0,
    prevision: (p.prevision as string) || '', gender: (p.gender as string) || '',
    birthDate: (p.birth_date as string) || '', address: (p.address as string) || '',
    vitals: p.vitals as Patient['vitals'], soap: p.soap as Patient['soap'],
    goals: (p.goals as Patient['goals']) || [], sessionLogs: (p.session_logs as Patient['sessionLogs']) || [],
    lastVisit: (p.last_visit as string) || '', emergencyContact: (p.emergency_contact as string) || '',
    professionalId: (p.professional_id as string) || undefined,
    diagnoses: (p.diagnoses as string) || '',
    specialtyData: (p.specialty_data as Record<string, unknown>) || undefined,
    deletedAt: (p.deleted_at as string) || undefined,
  };
}

function mapPatientToDB(p: Patient): Record<string, unknown> {
  return {
    id: p.id, name: p.name, rut: p.rut, email: p.email, phone: p.phone,
    risk: p.risk, status: p.status, archived: p.archived,
    custom_fields: p.customFields || [], attachments: p.attachments || [],
    allergies: p.allergies || [], medical_history: p.medicalHistory || '',
    age: p.age || 0, prevision: p.prevision || '', gender: p.gender || '',
    birth_date: p.birthDate || '', address: p.address || '',
    vitals: p.vitals || null, soap: p.soap || null,
    goals: p.goals || [], session_logs: p.sessionLogs || [],
    last_visit: p.lastVisit || '', emergency_contact: p.emergencyContact || '',
    professional_id: p.professionalId || null,
    diagnoses: p.diagnoses || '',
    specialty_data: p.specialtyData || null,
    deleted_at: p.deletedAt || null,
  };
}

function mapDBtoAppointment(a: Record<string, unknown>): Appointment {
  return {
    id: a.id as string, patientId: a.patient_id as string, patientName: a.patient_name as string,
    patientPhone: a.patient_phone as string, doctorName: a.doctor_name as string,
    specialty: a.specialty as string, serviceName: a.service_name as string,
    date: a.date as string, time: a.time as string, duration: a.duration as number,
    type: a.type as Appointment['type'], status: a.status as Appointment['status'],
    price: a.price as number, paymentStatus: a.payment_status as Appointment['paymentStatus'],
    notes: a.notes as string, color: a.color as string,
    category: (a.category as Appointment['category']) || 'Medical',
    professionalId: a.professional_id as string,
    bookingSource: a.booking_source as Appointment['bookingSource'],
    paidAt: a.paid_at as string, paymentAmount: a.payment_amount as number,
    patientEmail: a.patient_email as string,
    recurrenceId: a.recurrence_id as string | undefined,
    recurrenceType: a.recurrence_type as Appointment['recurrenceType'] | undefined,
    blockMode: a.block_mode as Appointment['blockMode'] | undefined,
    patientRut: a.patient_rut as string | undefined,
  };
}

function mapAppointmentToDB(a: Appointment): Record<string, unknown> {
  return {
    id: a.id, patient_id: a.patientId, patient_name: a.patientName, patient_phone: a.patientPhone,
    doctor_name: a.doctorName, specialty: a.specialty, service_name: a.serviceName,
    date: a.date, time: a.time, duration: a.duration, type: a.type, status: a.status,
    price: a.price, payment_status: a.paymentStatus, notes: a.notes, color: a.color,
    category: a.category, professional_id: a.professionalId,
    booking_source: a.bookingSource, paid_at: a.paidAt, payment_amount: a.paymentAmount,
    patient_email: a.patientEmail,
    recurrence_id: a.recurrenceId ?? null,
    recurrence_type: a.recurrenceType ?? null,
    block_mode: a.blockMode ?? null,
    patient_rut: a.patientRut || null,
  };
}

export async function batchInsertBlocks(blocks: Appointment[]): Promise<void> {
  if (blocks.length === 0) return;
  const { error } = await supabase.from('appointments').insert(blocks.map(mapAppointmentToDB));
  if (error) throw error;
}

export async function deleteBlocksByRecurrence(
  recurrenceId: string,
  mode: 'single' | 'future' | 'all',
  blockId: string,
  blockDate: string
): Promise<void> {
  if (mode === 'single') {
    const { error } = await supabase.from('appointments').delete().eq('id', blockId);
    if (error) throw error;
  } else if (mode === 'future') {
    const { error } = await supabase.from('appointments').delete()
      .eq('recurrence_id', recurrenceId).gte('date', blockDate);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('appointments').delete()
      .eq('recurrence_id', recurrenceId);
    if (error) throw error;
  }
}

// ── Reseñas ───────────────────────────────────────────────────
export async function getProfessionalReviews(professionalId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('professional_reviews')
    .select('id, professional_id, patient_name, rating, comment, created_at, is_verified')
    .eq('professional_id', professionalId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.map(r => ({
    id: r.id,
    professionalId: r.professional_id,
    patientName: r.patient_name,
    rating: r.rating,
    comment: r.comment || undefined,
    createdAt: r.created_at,
    isVerified: r.is_verified,
  }));
}

export async function getProfessionalRating(professionalId: string): Promise<{ avg: number; count: number }> {
  const { data, error } = await supabase
    .from('professional_reviews')
    .select('rating')
    .eq('professional_id', professionalId);
  if (error || !data || data.length === 0) return { avg: 0, count: 0 };
  const avg = data.reduce((s, r) => s + r.rating, 0) / data.length;
  return { avg: Math.round(avg * 10) / 10, count: data.length };
}

// ── Re-exporta supabase para componentes que lo necesiten ─────
export { supabase };

// ── Export por defecto (compatibilidad con imports antiguos) ──
const supabaseService = {
  loginProfessional,
  registerProfessional,
  requestPasswordReset,
  updatePassword,
  signOutProfessional,
  getActiveSession,
  getProfessional,
  saveProfessional,
  getAllPublicProfessionals,
  getPatients,
  savePatient,
  deletePatient,
  softDeletePatient,
  getAppointments,
  saveAppointment,
  deleteAppointment,
  getTransactions,
  saveTransaction,
  deleteTransaction,
  migrateFromLocalStorage,
  hashPassword,
  verifyPassword,
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
};

export default supabaseService;
