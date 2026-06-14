
export type AppView = 'PATIENT' | 'PROFESSIONAL' | 'ADMIN';

export interface Service {
  id: string;
  name: string;
  price: number;
  duration: number; // en minutos
  description: string;
  image?: string;
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  type: 'Ingreso' | 'Gasto';
  professionalId?: string;
}

export type SubscriptionStatus = 'active' | 'paused' | 'trial';

// Added missing Vitals interface
export interface Vitals {
  heartRate: number;
  systolic: number;
  diastolic: number;
  temperature: number;
  oxygenSaturation: number;
  respiratoryRate?: number;
  weight?: number;
  height?: number;
  bmi?: number;
  glucose?: number;
}

// Added missing SessionLog interface
export interface SessionLog {
  id: string;
  date: string;
  note: string;
  codigoAtencion?: string; // Código de atención editable por sesión (ej: "06 01 105")
}

// Added missing CustomField interface
export interface CustomField {
  label: string;
  value: string;
}

export interface ProfessionalProfile {
  id: string;
  slug: string; 
  name: string;
  email: string;
  password?: string;
  tempCode?: string;
  needsPasswordReset: boolean;
  isVerified: boolean;
  isSubscribed: boolean;
  subscriptionStatus: SubscriptionStatus; // Nuevo: Control de estado
  trialEndDate?: string; // Nuevo: Fin de 30 días gratis
  subscriptionExempt?: boolean; // Admin free pass — exento de pago
  pausedAt?: string; // Timestamp cuando se pausó la suscripción
  nextBillingDate?: string; // Nuevo: Fecha de cobro
  subscriptionLink?: string; // Link de pago personalizado
  bookingPaymentLink?: string; // Link de pago para reservas ($5.000)
  phone?: string;
  specialty: string;
  city: string; 
  bio: string;
  avatar?: string;
  workingHours: {
    start: string; 
    end: string;   
  };
  modalities: {
    online: boolean;
    inPerson: boolean;
    home: boolean;
  };
  services: Service[];
  isPublic: boolean;
  createdAt: string;
  schedule?: any;
  isApproved?: boolean;
  paymentEnabled?: boolean;
  bookingFee?: number;
  chargeFullService?: boolean;
  mpConnected?: boolean;
  mpPublicKey?: string;
  instagram?: string;
  googleCalendarConnected?: boolean;
  reviewsEnabled?: boolean;
  referralCode?:      string;
  referredBy?:        string;
  referralCreditClp?: number;
  termsAcceptedAt?:   string;
  rut?:               string;
}

export interface Appointment {
  id: string;
  patientId?: string;
  patientName: string;
  patientPhone?: string; 
  doctorName: string;
  specialty: string;
  serviceName: string; 
  date: string; 
  time: string; 
  duration: number; 
  type: 'Presencial' | 'Online' | 'Domicilio' | 'Personal';
  status: 'Confirmado' | 'Pendiente' | 'Finalizado' | 'Cancelado' | 'En Sesión' | 'Bloqueado' | 'Llegado';
  price: number;
  paymentStatus: 'Pagado' | 'Pendiente';
  notes?: string;
  color?: string;
  category: 'Medical' | 'Personal';
  professionalId?: string;
  bookingSource?: string;
  paidAt?: string;
  paymentAmount?: number;
  patientEmail?: string;
  recurrenceId?:   string;
  recurrenceType?: 'none' | 'weekly' | 'monthly' | 'permanent';
  blockMode?:      'blocked' | 'remote_only' | 'presential_only';
  patientRut?:     string;
}

export interface Notification {
  id: string;
  title: string;
  time: string;
  type: 'appointment' | 'payment' | 'system';
  read: boolean;
}

export interface Patient {
  id: string;
  name: string;
  rut: string;
  age: number;
  gender: string;
  email: string;
  phone: string;
  status: 'Confirmado' | 'Pendiente' | 'En Sesión' | 'Llegado' | 'Archivado' | 'En Tratamiento' | 'Alta Médica' | 'Nuevo';
  prevision: string;
  birthDate: string;
  address: string;
  allergies: string[];
  medicalHistory: string;
  // Updated from any to Vitals
  vitals?: Vitals;
  attachments: any[];
  // Updated from any to SessionLog[]
  sessionLogs?: SessionLog[];
  // Updated from any to CustomField[]
  customFields: CustomField[];
  archived: boolean;
  risk: 'Bajo' | 'Medio' | 'Alto';
  avatar?: string;
  diagnoses?: string;
  lastVisit?: string;
  emergencyContact?: string;
  goals?: any[];
  soap?: any;
  specialtyData?: Record<string, unknown>;
  professionalId?: string;
  deletedAt?: string;
}

export interface ClinicalTemplate {
  id: string;
  name: string;
  fields: string[];
}

// Archivo adjunto en ficha clínica
export interface ClinicalFile {
  id: string;
  name: string;
  size: string;
  date: string;
  type: 'pdf' | 'image';
  url: string;
  base64?: string;
}

// Fila de plan alimentario (ficha nutricional)
export interface Review {
  id: string;
  professionalId: string;
  patientName: string;
  rating: number;
  comment?: string;
  createdAt: string;
  isVerified: boolean;
}

export interface MealPlanRow {
  id: string;
  meal: string;       // Desayuno, Almuerzo, etc.
  food: string;       // Preparación / alimento
  quantity: string;   // Cantidad (g, ml, unidades)
  kcal: string;       // Kcal estimadas
  notes: string;      // Observaciones
}
