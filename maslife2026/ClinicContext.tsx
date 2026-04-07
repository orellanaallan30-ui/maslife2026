import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfessionalProfile, Appointment, Patient, Transaction, ClinicalTemplate } from './types';

interface ClinicContextType {
  // Profesionales
  professionals: ProfessionalProfile[];
  loggedPro: ProfessionalProfile | null;
  setLoggedPro: (pro: ProfessionalProfile | null) => void;
  updateProfessional: (pro: ProfessionalProfile) => void;
  
  // Citas
  appointments: Appointment[];
  setAppointments: (apps: Appointment[] | ((prev: Appointment[]) => Appointment[])) => void;
  addAppointment: (app: Appointment) => Promise<void>;
  
  // Pacientes
  patients: Patient[];
  setPatients: (patients: Patient[] | ((prev: Patient[]) => Patient[])) => void;
  addPatient: (patient: Patient) => void;
  
  // Transacciones
  manualTransactions: Transaction[];
  addManualTransaction: (t: Transaction) => void;
  
  // Templates
  templates: ClinicalTemplate[];
  setTemplates: (t: ClinicalTemplate[] | ((prev: ClinicalTemplate[]) => ClinicalTemplate[])) => void;
  
  // Métodos
  logout: (navigate: any, view: string) => void;
}

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

export const ClinicProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Estado inicial con profesional de prueba
  const [professionals, setProfessionals] = useState<ProfessionalProfile[]>(() => {
    const saved = localStorage.getItem('maslife_professionals');
    if (saved) return JSON.parse(saved);
    
    return [{
      id: 'pro-rodrigo',
      slug: 'rodrigo-orellana',
      name: 'Rodrigo Orellana',
      email: 'orellanaallan30@gmail.com',
      password: 'Roo1998.',
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

  // Persistencia automática
  useEffect(() => {
    localStorage.setItem('maslife_professionals', JSON.stringify(professionals));
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

  // Métodos
  const updateProfessional = (updated: ProfessionalProfile) => {
    setProfessionals(prev => prev.map(p => p.id === updated.id ? updated : p));
    if (loggedPro && loggedPro.id === updated.id) {
      setLoggedPro(updated);
    }
  };

  const addAppointment = async (app: Appointment) => {
    setAppointments(prev => [...prev, app]);
  };

  const addPatient = (patient: Patient) => {
    setPatients(prev => [...prev, patient]);
  };

  const addManualTransaction = (transaction: Transaction) => {
    setManualTransactions(prev => [...prev, transaction]);
  };

  const logout = (navigate: any, view: string) => {
    setLoggedPro(null);
    if (view === 'PROFESSIONAL') navigate('/pro/login');
    else if (view === 'ADMIN') navigate('/admin/login');
    else navigate('/');
  };

  const value: ClinicContextType = {
    professionals,
    loggedPro,
    setLoggedPro,
    updateProfessional,
    appointments,
    setAppointments,
    addAppointment,
    patients,
    setPatients,
    addPatient,
    manualTransactions,
    addManualTransaction,
    templates,
    setTemplates,
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
