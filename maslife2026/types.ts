
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
  nextBillingDate?: string; // Nuevo: Fecha de cobro
  subscriptionLink?: string; // Link de pago personalizado
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
  // Added diagnoses to satisfy ClinicalRecord usage
  diagnoses?: string;
  lastVisit?: string;
  emergencyContact?: string;
}

export interface ClinicalTemplate {
  id: string;
  name: string;
  fields: string[]; 
}
