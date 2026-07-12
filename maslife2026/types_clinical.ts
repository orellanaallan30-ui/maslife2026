// ============================================================
// TIPOS CLÍNICOS — AgendaMaslife v2
// Cumplimiento: Ley 20.584 (Chile), Fonasa/Isapre, SII
// ============================================================

// ── SOAP ─────────────────────────────────────────────────────

export interface SOAPEntry {
  id: string;
  patientId: string;
  professionalId: string;
  sessionNumber: number;            // Número de sesión correlativo
  date: string;                     // ISO 8601
  createdAt: string;                // Timestamp exacto de creación
  signedAt?: string;                // Timestamp de firma — bloquea edición
  signedByRut?: string;             // RUT del profesional firmante
  signatureImageBase64?: string;    // Rúbrica PNG en base64

  // Campos SOAP
  subjective: string;               // S: Lo que reporta el paciente
  objective: string;                // O: Hallazgos clínicos medibles
  assessment: string;               // A: Análisis/diagnóstico clínico
  plan: string;                     // P: Plan de tratamiento del día

  // Campos complementarios
  diagnosis?: string;               // Diagnóstico CIE-10
  icd10Code?: string;               // Código CIE-10 (ej: M54.5)
  prestacionCode?: string;          // Código Fonasa (ej: 01-0102)
  sessionDurationMinutes?: number;
  vitalSigns?: {
    heartRate?: number;
    bloodPressure?: string;
    temperature?: number;
    oxygenSat?: number;
    weight?: number;
    height?: number;
  };

  isLocked: boolean;                // true = Solo Lectura (firmado)
  additionalNotes?: AdditionalNote[]; // Correcciones post-firma
  documentHash?: string;            // SHA-256 del contenido para integridad
  verificationCode: string;         // UUID corto para QR público
}

export interface AdditionalNote {
  id: string;
  soapEntryId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;   // Inmutable
  ipAddress?: string;
}

// ── AUDIT LOG ────────────────────────────────────────────────

export type AuditAction =
  | 'SOAP_CREATE'
  | 'SOAP_VIEW'
  | 'SOAP_SIGN'
  | 'SOAP_PRINT'
  | 'SOAP_EXPORT_PDF'
  | 'CONSENT_SEND'
  | 'CONSENT_ACCEPT'
  | 'CONSENT_REVOKE'
  | 'PATIENT_CREATE'
  | 'PATIENT_UPDATE'
  | 'PATIENT_VIEW'
  | 'DOCUMENT_VERIFY';

export interface AuditLog {
  id: string;
  userId: string;           // ID del profesional o 'patient:{id}'
  userName: string;
  action: AuditAction;
  resourceId: string;       // ID del recurso afectado
  resourceType: 'soap' | 'patient' | 'consent' | 'document';
  timestamp: string;        // ISO 8601 exacto
  ipAddress: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

// ── FIRMA ELECTRÓNICA ────────────────────────────────────────

export interface ProfessionalSignature {
  professionalId: string;
  rut: string;                      // RUT formato 12.345.678-9
  superintendenciaRegNumber: string; // Nº Registro Superint. de Salud
  signatureImageBase64: string;     // Rúbrica PNG base64
  uploadedAt: string;
  isValidated: boolean;             // Validado por admin
}

// ── CONSENTIMIENTO INFORMADO ─────────────────────────────────

export type ConsentStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';

export interface InformedConsent {
  id: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  professionalId: string;
  templateVersion: string;          // Versión del texto de consentimiento
  sentAt: string;
  expiresAt: string;                 // 72 horas típicamente
  status: ConsentStatus;
  acceptedAt?: string;
  ipAddress?: string;               // IP desde donde se aceptó
  deviceInfo?: string;              // User-agent del paciente
  patientSignatureBase64?: string;  // Firma del paciente desde touch/mouse
  checkboxChecked: boolean;
  consentText: string;              // Texto exacto que firmó (inmutable)
  verificationCode: string;         // Para auditoría
}

// ── DOCUMENTO FIRMADO / EXPORTABLE ───────────────────────────

export interface SignedDocument {
  id: string;
  type: 'SOAP_SESSION' | 'CONSENT' | 'CLINICAL_SUMMARY';
  patientId: string;
  professionalId: string;
  soapEntryId?: string;
  consentId?: string;
  generatedAt: string;
  pdfBase64?: string;               // PDF generado
  verificationCode: string;         // Apunta a /verify/:code (público)
  documentHash: string;             // SHA-256 del PDF para integridad
  boleta?: BolsetaGlosa;
}

export interface BolsetaGlosa {
  descripcion: string;              // Glosa SII
  codigoPrestacion: string;         // Código Fonasa
  monto: number;
  fecha: string;
  rutProfesional: string;
  rutPaciente?: string;
}

// ── VERIFICACIÓN PÚBLICA (QR) ─────────────────────────────────

export interface PublicVerificationResult {
  isValid: boolean;
  documentType: string;
  issuerName: string;               // Nombre profesional (sin RUT)
  issuerSpecialty: string;
  patientInitials: string;          // "A.M." — nunca nombre completo
  sessionDate: string;
  generatedAt: string;
  hashMatch: boolean;
}
