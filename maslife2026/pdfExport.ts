// pdfExport.ts — Exportación clínica conforme Fonasa/Isapre
// Usa jsPDF (CDN) + QR via qrcode.js
// Importar en index.html: <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js">

import { SOAPEntry, BolsetaGlosa } from './types_clinical';
import { ProfessionalProfile, Patient, Vitals, SessionLog } from './types';

declare const window: Window & {
  jspdf?: { jsPDF: new (opts: object) => jsPDFInstance };
};

interface jsPDFInstance {
  addImage(data: string, format: string, x: number, y: number, w: number, h: number): void;
  setFont(font: string, style?: string): void;
  setFontSize(size: number): void;
  setTextColor(r: number, g: number, b: number): void;
  setDrawColor(r: number, g: number, b: number): void;
  setFillColor(r: number, g: number, b: number): void;
  rect(x: number, y: number, w: number, h: number, style?: string): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  text(text: string | string[], x: number, y: number, opts?: object): void;
  splitTextToSize(text: string, maxWidth: number): string[];
  save(filename: string): string;
  output(type: string): string;
  getNumberOfPages(): number;
  setPage(page: number): void;
  addPage(): void;
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
}

/** Genera un SHA-256 del texto del documento para integridad */
export async function generateDocumentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Genera la URL de verificación pública del QR */
export function buildVerificationUrl(verificationCode: string): string {
  const base = window.location.origin + window.location.pathname.replace(/\/$/, '');
  return `${base}/#/verify/${verificationCode}`;
}

/** Genera la glosa SII para boleta de honorarios */
export function generateBoletaGlosa(
  soap: SOAPEntry,
  pro: ProfessionalProfile,
  patient: Patient
): BolsetaGlosa {
  const fecha = new Date(soap.date).toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });

  const prestacion = soap.prestacionCode
    ? ` [${soap.prestacionCode}]`
    : '';

  return {
    descripcion: `Sesión de ${pro.specialty}${prestacion} - ${fecha} - Paciente: ${patient.name}`,
    codigoPrestacion: soap.prestacionCode || '',
    monto: 0, // se completa desde la cita
    fecha: soap.date,
    rutProfesional: '', // se completa desde ProfessionalSignature
    rutPaciente: patient.rut,
  };
}

/** Exporta una sesión SOAP como PDF con firma y QR */
export async function exportSOAPtoPDF(
  soap: SOAPEntry,
  pro: ProfessionalProfile,
  patient: Patient,
  clinicLogoBase64?: string,
  signatureBase64?: string
): Promise<{ pdfBase64: string; hash: string }> {
  // Carga dinámica de jsPDF si no está disponible
  if (!window.jspdf) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar jsPDF'));
      document.head.appendChild(script);
    });
  }

  const { jsPDF } = window.jspdf!;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 18;
  const COL = W - MARGIN * 2;
  let y = MARGIN;

  // ── MEMBRETE ──────────────────────────────────────────────
  // Barra superior teal
  doc.setFillColor(0, 168, 158);
  doc.rect(0, 0, W, 28, 'F');

  if (clinicLogoBase64) {
    doc.addImage(clinicLogoBase64, 'PNG', MARGIN, 4, 22, 20);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('AgendaMaslife', clinicLogoBase64 ? MARGIN + 26 : MARGIN, 14);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Plataforma de Gestión Clínica', clinicLogoBase64 ? MARGIN + 26 : MARGIN, 21);

  // Número de verificación (esquina derecha)
  doc.setFontSize(7);
  doc.text(`VER: ${soap.verificationCode}`, W - MARGIN, 14, { align: 'right' });
  doc.text(new Date(soap.signedAt || soap.createdAt).toLocaleString('es-CL'), W - MARGIN, 20, { align: 'right' });

  y = 36;

  // ── TÍTULO ─────────────────────────────────────────────────
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`FICHA CLÍNICA EVOLUTIVA — SESIÓN Nº ${soap.sessionNumber}`, MARGIN, y);
  y += 6;

  doc.setDrawColor(0, 168, 158);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 6;

  // ── DATOS DEL PROFESIONAL ──────────────────────────────────
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('PROFESIONAL', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  y += 5;
  doc.text(`Nombre: ${pro.name}`, MARGIN, y); y += 4.5;
  doc.text(`Especialidad: ${pro.specialty}`, MARGIN, y); y += 4.5;
  doc.text(`Ciudad: ${pro.city}`, MARGIN, y); y += 4.5;

  // ── DATOS DEL PACIENTE ─────────────────────────────────────
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.text('PACIENTE', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  y += 5;
  doc.text(`Nombre: ${patient.name}`, MARGIN, y);
  doc.text(`RUT: ${patient.rut}`, MARGIN + COL / 2, y);
  y += 4.5;
  doc.text(`Fecha de atención: ${new Date(soap.date).toLocaleDateString('es-CL')}`, MARGIN, y);
  if (patient.prevision) doc.text(`Previsión: ${patient.prevision}`, MARGIN + COL / 2, y);
  y += 4.5;
  if (soap.icd10Code) {
    doc.text(`Diagnóstico CIE-10: ${soap.icd10Code} — ${soap.diagnosis || ''}`, MARGIN, y);
    y += 4.5;
  }
  if (soap.prestacionCode) {
    doc.text(`Código Fonasa: ${soap.prestacionCode}`, MARGIN, y);
    y += 4.5;
  }

  y += 3;
  doc.setDrawColor(226, 232, 240);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 6;

  // ── SECCIÓN SOAP ────────────────────────────────────────────
  const soapSections: { label: string; content: string; color: [number,number,number] }[] = [
    { label: 'S — SUBJETIVO', content: soap.subjective, color: [239, 246, 255] },
    { label: 'O — OBJETIVO', content: soap.objective, color: [240, 253, 244] },
    { label: 'A — ANÁLISIS', content: soap.assessment, color: [254, 249, 195] },
    { label: 'P — PLAN', content: soap.plan, color: [255, 241, 242] },
  ];

  for (const section of soapSections) {
    doc.setFillColor(...section.color);
    const lines = doc.splitTextToSize(section.content || '(Sin contenido)', COL - 10);
    const boxH = 9 + lines.length * 4.5;

    if (y + boxH > 270) { doc.addPage(); y = MARGIN; }

    doc.rect(MARGIN, y, COL, boxH, 'F');
    doc.setDrawColor(200, 210, 220);
    doc.rect(MARGIN, y, COL, boxH, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(section.label, MARGIN + 4, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(lines, MARGIN + 4, y + 11);
    y += boxH + 4;
  }

  // ── FIRMA DIGITAL ──────────────────────────────────────────
  y += 4;
  if (y + 35 > 270) { doc.addPage(); y = MARGIN; }

  doc.setDrawColor(0, 168, 158);
  doc.setFillColor(248, 250, 252);
  doc.rect(MARGIN, y, COL, 35, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text('FIRMA ELECTRÓNICA DEL PROFESIONAL', MARGIN + 4, y + 6);

  if (signatureBase64) {
    doc.addImage(signatureBase64, 'PNG', MARGIN + 4, y + 8, 50, 20);
  } else {
    doc.setDrawColor(180, 180, 180);
    doc.rect(MARGIN + 4, y + 9, 50, 18, 'S');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('(Firma no configurada)', MARGIN + 6, y + 20);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text(pro.name, MARGIN + 58, y + 14);
  doc.text(pro.specialty, MARGIN + 58, y + 19);
  doc.text(`Firmado: ${new Date(soap.signedAt || new Date()).toLocaleString('es-CL')}`, MARGIN + 58, y + 24);

  y += 40;

  // ── QR DE VERIFICACIÓN ────────────────────────────────────
  const verifyUrl = buildVerificationUrl(soap.verificationCode);

  // Generar QR como canvas y convertir
  try {
    const qrCanvas = document.createElement('canvas');
    qrCanvas.width = 100;
    qrCanvas.height = 100;
    // Si tienes qrcode.js disponible, usar aquí
    // QRCode.toCanvas(qrCanvas, verifyUrl, { width: 100 });
    // doc.addImage(qrCanvas.toDataURL('image/png'), 'PNG', W - MARGIN - 28, y - 38, 25, 25);

    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Verificar autenticidad: ${verifyUrl}`, MARGIN, y);
    y += 5;
  } catch {
    // QR opcional — no bloquea el PDF
  }

  // ── GLOSA SII ─────────────────────────────────────────────
  y += 2;
  doc.setFillColor(241, 245, 249);
  doc.rect(MARGIN, y, COL, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text('GLOSA PARA BOLETA DE HONORARIOS (SII)', MARGIN + 4, y + 5);
  doc.setFont('helvetica', 'normal');
  const glosa = generateBoletaGlosa(soap, pro, patient);
  doc.text(glosa.descripcion, MARGIN + 4, y + 10);

  // ── PIE DE PÁGINA ─────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `AgendaMaslife — Documento oficial. Página ${p} de ${totalPages}`,
      W / 2, 290, { align: 'center' }
    );
    doc.text(
      `Hash de integridad: ${soap.documentHash?.substring(0, 32) || 'pendiente'}...`,
      W / 2, 294, { align: 'center' }
    );
  }

  const pdfBase64 = doc.output('datauristring');
  const hashContent = `${soap.id}|${soap.subjective}|${soap.objective}|${soap.assessment}|${soap.plan}|${soap.signedAt}`;
  const hash = await generateDocumentHash(hashContent);

  return { pdfBase64, hash };
}

// ── HELPERS COMPARTIDOS ────────────────────────────────────────────────────────

async function ensureJsPDF(): Promise<void> {
  if (!window.jspdf) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar jsPDF'));
      document.head.appendChild(script);
    });
  }
}

function drawMembrete(doc: jsPDFInstance, W: number, MARGIN: number, rightText: string): void {
  doc.setFillColor(0, 168, 158);
  doc.rect(0, 0, W, 28, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('Clínica Mas Life', MARGIN, 14);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('clinicamaslife.cl · Plataforma de Gestión Clínica', MARGIN, 21);
  doc.setFontSize(7.5);
  doc.text(rightText, W - MARGIN, 17, { align: 'right' });
}

function drawFooters(doc: jsPDFInstance, W: number, pro: ProfessionalProfile): void {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Clínica Mas Life · ${pro.name} · ${pro.specialty}   Página ${p} de ${total}`,
      W / 2, 290, { align: 'center' }
    );
  }
}

// Bloque de trazabilidad bajo el membrete: registro de último cambio (fecha +
// profesional) y fecha de emisión del documento. Común a TODOS los PDF.
function fmtDateTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } as Intl.DateTimeFormatOptions);
}

function drawDocMeta(
  doc: jsPDFInstance,
  MARGIN: number,
  COL: number,
  y: number,
  opts: { updatedAt?: string; proName: string; proSpecialty?: string; docId?: string }
): number {
  const boxH = 12;
  doc.setFillColor(240, 253, 250);
  doc.setDrawColor(0, 168, 158);
  doc.rect(MARGIN, y, COL, boxH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(0, 126, 119);
  doc.text('ÚLTIMA MODIFICACIÓN', MARGIN + 3, y + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(`${fmtDateTime(opts.updatedAt)} · ${opts.proName}${opts.proSpecialty ? ` (${opts.proSpecialty})` : ''}`, MARGIN + 36, y + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 126, 119);
  doc.text('DOCUMENTO GENERADO', MARGIN + 3, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(`${fmtDateTime()}${opts.docId ? ` · Ficha N° ${String(opts.docId).slice(0, 8).toUpperCase()}` : ''}`, MARGIN + 36, y + 9.5);
  return y + boxH + 5;
}

function drawAutoSignature(
  doc: jsPDFInstance,
  pro: ProfessionalProfile,
  margin: number,
  colW: number,
  y: number,
  signatureBase64?: string
): number {
  const boxH = 36;
  doc.setDrawColor(0, 168, 158);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, colW, boxH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text('FIRMA ELECTRÓNICA DEL PROFESIONAL', margin + 4, y + 6);

  if (signatureBase64) {
    doc.addImage(signatureBase64, 'PNG', margin + 4, y + 9, 50, 20);
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(pro.name, margin + 6, y + 23);
    doc.setDrawColor(15, 23, 42);
    doc.line(margin + 4, y + 26, margin + 72, y + 26);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  const emitDate = new Date().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } as Intl.DateTimeFormatOptions);
  doc.text(pro.name, margin + 76, y + 14);
  doc.text(pro.specialty, margin + 76, y + 19);
  doc.text(`Emitido: ${emitDate}`, margin + 76, y + 24);

  return y + boxH + 4;
}

function drawSectionHeader(doc: jsPDFInstance, label: string, margin: number, y: number, colW: number): number {
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, colW, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(label, margin + 4, y + 5.5);
  return y + 10;
}

function drawField(doc: jsPDFInstance, label: string, value: string, x: number, y: number): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(label + ':', x, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(value || '—', x + 28, y);
}

// ── FICHA CLÍNICA DEL PACIENTE ────────────────────────────────────────────────

interface TherapeuticGoalPDF {
  name: string;
  description: string;
  progress: number;
  status: string;
}

export async function exportPatientFichaToPDF(
  patient: Patient,
  professional: ProfessionalProfile,
  vitals: Vitals,
  goals: TherapeuticGoalPDF[],
  sessionLogs: SessionLog[],
  anamnesis: string,
  soap: { subjective: string; objective: string; assessment: string; plan: string },
  specialtyKey: string,
  specialtyData?: Record<string, unknown>
): Promise<void> {
  await ensureJsPDF();

  const { jsPDF } = window.jspdf!;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 18;
  const COL = W - MARGIN * 2;
  let y = MARGIN;

  const dateStr = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  drawMembrete(doc, W, MARGIN, `Ficha Clínica · ${dateStr}`);
  y = 36;

  // Título
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('FICHA CLÍNICA DEL PACIENTE', MARGIN, y);
  y += 5;
  doc.setDrawColor(0, 168, 158);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 6;

  // Registro de cambios: quién y cuándo modificó la ficha por última vez
  y = drawDocMeta(doc, MARGIN, COL, y, {
    updatedAt: patient.updatedAt,
    proName: professional.name,
    proSpecialty: professional.specialty,
    docId: patient.id,
  });

  // Datos Personales
  y = drawSectionHeader(doc, 'DATOS PERSONALES', MARGIN, y, COL);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const half = COL / 2;
  const fields1 = [
    ['Nombre', patient.name],
    ['RUT', patient.rut],
    ['Edad', patient.age ? `${patient.age} años` : '—'],
    ['Género', patient.gender || '—'],
    ['F. Nacimiento', patient.birthDate || '—'],
    ['Previsión', patient.prevision || '—'],
    ['Teléfono', patient.phone || '—'],
    ['Email', patient.email || '—'],
    ['Dirección', patient.address || '—'],
    ['Contacto emergencia', patient.emergencyContact || '—'],
  ];
  for (let i = 0; i < fields1.length; i += 2) {
    drawField(doc, fields1[i][0], fields1[i][1], MARGIN + 2, y);
    if (fields1[i + 1]) drawField(doc, fields1[i + 1][0], fields1[i + 1][1], MARGIN + 2 + half, y);
    y += 5.5;
  }
  y += 2;

  // Campos adicionales que el profesional agregó en Datos Personales
  const extraFields = ((patient.customFields || []) as Array<{ label?: string; value?: string }>)
    .filter(f => (f.label || '').trim() || (f.value || '').trim());
  if (extraFields.length) {
    if (y + 12 > 265) { doc.addPage(); y = MARGIN; }
    y = drawSectionHeader(doc, 'CAMPOS ADICIONALES', MARGIN, y, COL);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    for (let i = 0; i < extraFields.length; i += 2) {
      drawField(doc, extraFields[i].label || '—', extraFields[i].value || '—', MARGIN + 2, y);
      if (extraFields[i + 1]) drawField(doc, extraFields[i + 1].label || '—', extraFields[i + 1].value || '—', MARGIN + 2 + half, y);
      y += 5.5;
    }
    y += 2;
  }

  // Datos Clínicos
  if (y + 30 > 265) { doc.addPage(); y = MARGIN; }
  y = drawSectionHeader(doc, 'DATOS CLÍNICOS', MARGIN, y, COL);
  const clinFields = [
    ['Diagnóstico', patient.diagnoses || '—'],
    ['Riesgo', patient.risk || '—'],
    ['Alergias', (patient.allergies || []).join(', ') || 'Sin registro'],
  ];
  for (const [lbl, val] of clinFields) {
    drawField(doc, lbl, val, MARGIN + 2, y);
    y += 5.5;
  }
  if (anamnesis?.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Historia médica:', MARGIN + 2, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    // Texto completo (sin truncar), paginado línea a línea
    const lines: string[] = doc.splitTextToSize(anamnesis, COL - 4);
    for (const ln of lines) {
      if (y + 4.5 > 265) { doc.addPage(); y = MARGIN; }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text(ln, MARGIN + 2, y);
      y += 4.5;
    }
    y += 2;
  }
  y += 2;

  // Signos Vitales
  if (y + 25 > 265) { doc.addPage(); y = MARGIN; }
  y = drawSectionHeader(doc, 'SIGNOS VITALES', MARGIN, y, COL);
  const vitCols = COL / 5;
  const fmtVit = (v?: number) => (v && v !== 0) ? String(v) : '—';
  const vitalsRows: [string, string][][] = [
    [
      ['FC (LPM)', fmtVit(vitals.heartRate)],
      ['PA SIS', fmtVit(vitals.systolic)],
      ['PA DIA', fmtVit(vitals.diastolic)],
      ['SAT O2 %', fmtVit(vitals.oxygenSaturation)],
      ['TEMP °C', fmtVit(vitals.temperature)],
    ],
    [
      ['FR (RPM)', fmtVit(vitals.respiratoryRate)],
      ['PESO KG', fmtVit(vitals.weight)],
      ['TALLA CM', fmtVit(vitals.height)],
      ['IMC', fmtVit(vitals.bmi)],
      ['GLUCOSA', fmtVit(vitals.glucose)],
    ],
  ];
  for (const row of vitalsRows) {
    // Fila solo si tiene algún dato (la primera siempre se muestra como referencia)
    const hasData = row.some(([, v]) => v !== '—');
    if (row === vitalsRows[1] && !hasData) break;
    doc.setFillColor(248, 250, 252);
    doc.rect(MARGIN, y, COL, 16, 'F');
    row.forEach(([label, val], i) => {
      const cx = MARGIN + i * vitCols + vitCols / 2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(label, cx, y + 5, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0, 168, 158);
      doc.text(val, cx, y + 13, { align: 'center' });
    });
    y += 18;
  }
  y += 2;

  // SOAP
  const soapHasContent = Object.values(soap).some(v => v?.trim());
  if (soapHasContent) {
    if (y + 15 > 265) { doc.addPage(); y = MARGIN; }
    y = drawSectionHeader(doc, 'ÚLTIMA EVOLUCIÓN (SOAP)', MARGIN, y, COL);
    const soapSections: { label: string; content: string; color: [number, number, number] }[] = [
      { label: 'S — SUBJETIVO', content: soap.subjective, color: [239, 246, 255] },
      { label: 'O — OBJETIVO', content: soap.objective, color: [240, 253, 244] },
      { label: 'A — ANÁLISIS', content: soap.assessment, color: [254, 249, 195] },
      { label: 'P — PLAN', content: soap.plan, color: [255, 241, 242] },
    ];
    for (const sec of soapSections) {
      if (!sec.content?.trim()) continue;
      const lines = doc.splitTextToSize(sec.content, COL - 8);
      const bh = 9 + lines.length * 4.5;
      if (y + bh > 265) { doc.addPage(); y = MARGIN; }
      doc.setFillColor(...sec.color);
      doc.rect(MARGIN, y, COL, bh, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text(sec.label, MARGIN + 4, y + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      doc.text(lines, MARGIN + 4, y + 11);
      y += bh + 3;
    }
    y += 2;
  }

  // Objetivos Terapéuticos
  if (goals.length > 0) {
    if (y + 20 > 265) { doc.addPage(); y = MARGIN; }
    y = drawSectionHeader(doc, 'OBJETIVOS TERAPÉUTICOS', MARGIN, y, COL);
    const gCols = [COL * 0.45, COL * 0.3, COL * 0.15, COL * 0.1];
    const gHeaders = ['Objetivo', 'Descripción', 'Progreso', 'Estado'];
    doc.setFillColor(226, 232, 240);
    doc.rect(MARGIN, y, COL, 7, 'F');
    let gx = MARGIN + 2;
    gHeaders.forEach((h, i) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59);
      doc.text(h, gx, y + 5);
      gx += gCols[i];
    });
    y += 8;
    for (const g of goals) {
      if (y + 7 > 265) { doc.addPage(); y = MARGIN; }
      gx = MARGIN + 2;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text(g.name.substring(0, 30), gx, y + 4.5); gx += gCols[0];
      doc.text((g.description || '').substring(0, 40), gx, y + 4.5); gx += gCols[1];
      doc.text(`${g.progress}%`, gx, y + 4.5); gx += gCols[2];
      doc.text(g.status, gx, y + 4.5);
      y += 6;
    }
    y += 3;
  }

  // Historial de Sesiones
  if (sessionLogs.length > 0) {
    if (y + 20 > 265) { doc.addPage(); y = MARGIN; }
    y = drawSectionHeader(doc, 'HISTORIAL DE SESIONES', MARGIN, y, COL);
    const allSessions = [...sessionLogs].reverse(); // todas, más recientes primero
    doc.setFillColor(226, 232, 240);
    doc.rect(MARGIN, y, COL, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    doc.text('Fecha', MARGIN + 2, y + 5);
    doc.text('Nota', MARGIN + 30, y + 5);
    doc.text('Código', MARGIN + COL - 25, y + 5);
    y += 8;
    for (const s of allSessions) {
      const noteLines = doc.splitTextToSize(s.note || '—', COL - 60);
      const rh = Math.max(6, noteLines.length * 4.5);
      if (y + rh > 265) { doc.addPage(); y = MARGIN; }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text(s.date || '—', MARGIN + 2, y + 4.5);
      doc.text(noteLines, MARGIN + 30, y + 4.5);
      doc.text(s.codigoAtencion || '—', MARGIN + COL - 25, y + 4.5);
      y += rh + 2;
    }
    y += 3;
  }

  // Datos de especialidad: nutrición
  if (specialtyKey === 'nutricion' && specialtyData) {
    if (y + 20 > 265) { doc.addPage(); y = MARGIN; }
    y = drawSectionHeader(doc, 'EVALUACIÓN NUTRICIONAL', MARGIN, y, COL);
    const sd = specialtyData as Record<string, any>;
    const nm = sd.nutMetrics as { bmi?: number; bmr?: number; totalCalories?: number; whr?: number } | undefined;
    const nutFields = [
      ['Peso', sd.nutPeso ? `${sd.nutPeso} kg` : '—'],
      ['Talla', sd.nutTalla ? `${sd.nutTalla} cm` : '—'],
      ['Cintura', sd.nutCintura ? `${sd.nutCintura} cm` : '—'],
      ['Cadera', sd.nutCadera ? `${sd.nutCadera} cm` : '—'],
      ['Género', String(sd.nutGender || '—')],
      ['Actividad', String(sd.nutActivity || '—')],
      ['IMC', nm?.bmi ? String(nm.bmi) : '—'],
      ['TMB / GET', nm?.bmr ? `${nm.bmr} / ${nm.totalCalories || '—'} kcal` : '—'],
      ['Rel. cintura/cadera', nm?.whr ? String(nm.whr) : '—'],
      ['Objetivos', String(sd.nutGoals || '—')],
      ['Suplementos', String(sd.nutSupplements || '—')],
    ];
    for (let i = 0; i < nutFields.length; i += 2) {
      drawField(doc, nutFields[i][0], String(nutFields[i][1]), MARGIN + 2, y);
      if (nutFields[i + 1]) drawField(doc, nutFields[i + 1][0], String(nutFields[i + 1][1]), MARGIN + 2 + COL / 2, y);
      y += 5.5;
    }
    y += 2;

    // Composición corporal (si hay datos)
    const hasComp = (sd.nutMasaGrasaPct || 0) > 0 || (sd.nutMasaMuscularPct || 0) > 0 || (sd.nutSum6Pliegues || 0) > 0;
    if (hasComp) {
      if (y + 18 > 265) { doc.addPage(); y = MARGIN; }
      y = drawSectionHeader(doc, 'COMPOSICIÓN CORPORAL', MARGIN, y, COL);
      const compFields = [
        ['% Masa grasa', sd.nutMasaGrasaPct ? `${sd.nutMasaGrasaPct}%` : '—'],
        ['% Masa adiposa', sd.nutMasaAdiposaPct ? `${sd.nutMasaAdiposaPct}%` : '—'],
        ['% Masa muscular', sd.nutMasaMuscularPct ? `${sd.nutMasaMuscularPct}%` : '—'],
        ['Σ 6 pliegues', sd.nutSum6Pliegues ? `${sd.nutSum6Pliegues} mm` : '—'],
        ['Σ 8 pliegues', sd.nutSum8Pliegues ? `${sd.nutSum8Pliegues} mm` : '—'],
      ];
      for (let i = 0; i < compFields.length; i += 2) {
        drawField(doc, compFields[i][0], String(compFields[i][1]), MARGIN + 2, y);
        if (compFields[i + 1]) drawField(doc, compFields[i + 1][0], String(compFields[i + 1][1]), MARGIN + 2 + COL / 2, y);
        y += 5.5;
      }
      y += 2;
    }

    // Plan alimentario (tabla comida / detalle)
    const mealPlan = (sd.mealPlan as Array<{ meal?: string; time?: string; detail?: string; foods?: string }>) || [];
    const mealRows = mealPlan.filter(m => (m.detail || m.foods || '').toString().trim());
    if (mealRows.length) {
      if (y + 20 > 265) { doc.addPage(); y = MARGIN; }
      y = drawSectionHeader(doc, 'PLAN ALIMENTARIO', MARGIN, y, COL);
      doc.setFillColor(226, 232, 240);
      doc.rect(MARGIN, y, COL, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59);
      doc.text('Comida', MARGIN + 2, y + 5);
      doc.text('Detalle', MARGIN + 45, y + 5);
      y += 8;
      for (const m of mealRows) {
        const detail = String(m.detail || m.foods || '—');
        const dl = doc.splitTextToSize(detail, COL - 50);
        const rh = Math.max(6, dl.length * 4.5);
        if (y + rh > 265) { doc.addPage(); y = MARGIN; }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);
        doc.text(String(m.meal || m.time || '—'), MARGIN + 2, y + 4.5);
        doc.text(dl, MARGIN + 45, y + 4.5);
        y += rh + 2;
      }
      y += 2;
    }

    // Evolución de composición (historial EV por fecha)
    const compHist = (sd.compositionHistory as Array<Record<string, number | string>>) || [];
    if (compHist.length > 1) {
      if (y + 20 > 265) { doc.addPage(); y = MARGIN; }
      y = drawSectionHeader(doc, 'EVOLUCIÓN COMPOSICIÓN CORPORAL', MARGIN, y, COL);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      ['Fecha', 'Peso', 'IMC', '% Grasa', '% Músculo'].forEach((h, i) => doc.text(h, MARGIN + 2 + i * (COL / 5), y + 4));
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      for (const h of compHist.slice(-10)) {
        if (y + 5.5 > 265) { doc.addPage(); y = MARGIN; }
        [String(h.date || '—'), h.peso ? `${h.peso} kg` : '—', String(h.imc || '—'),
         h.masaGrasaPct ? `${h.masaGrasaPct}%` : '—', h.masaMuscularPct ? `${h.masaMuscularPct}%` : '—']
          .forEach((v, i) => doc.text(v, MARGIN + 2 + i * (COL / 5), y + 4));
        y += 5.5;
      }
      y += 3;
    }
  }

  // Datos de especialidad: psicología
  if (specialtyKey === 'psicologia' && specialtyData) {
    if (y + 20 > 265) { doc.addPage(); y = MARGIN; }
    y = drawSectionHeader(doc, 'EVALUACIÓN PSICOLÓGICA', MARGIN, y, COL);
    const psychFields: [string, string][] = [
      ['Escala de ánimo', specialtyData.psychMood !== undefined ? `${specialtyData.psychMood}/10` : '—'],
      ['Historial psicológico', String((specialtyData as Record<string, any>).psychPsychHistory || '—')],
      ['Intervención', String(specialtyData.psychIntervention || '—')],
      ['Objetivo próx. sesión', String(specialtyData.psychNextObjective || '—')],
    ];
    for (const [lbl, val] of psychFields) {
      const lines = doc.splitTextToSize(val, COL - 32);
      if (y + lines.length * 4.5 > 265) { doc.addPage(); y = MARGIN; }
      drawField(doc, lbl, lines[0], MARGIN + 2, y);
      if (lines.length > 1) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);
        doc.text(lines.slice(1), MARGIN + 30, y + 4.5);
        y += (lines.length - 1) * 4.5;
      }
      y += 5.5;
    }
    y += 3;
  }

  // ── Antecedentes mórbidos / quirúrgicos (checkeados) ──
  const morbidosPdf = ((specialtyData as Record<string, any>)?.morbidos as Array<{ label: string; checked: boolean }>) || [];
  const quirurgicosPdf = ((specialtyData as Record<string, any>)?.quirurgicos as Array<{ label: string; checked: boolean }>) || [];
  const morbChecked = morbidosPdf.filter(a => a.checked).map(a => a.label);
  const quirChecked = quirurgicosPdf.filter(a => a.checked).map(a => a.label);
  if (morbChecked.length || quirChecked.length) {
    if (y + 18 > 265) { doc.addPage(); y = MARGIN; }
    y = drawSectionHeader(doc, 'ANTECEDENTES', MARGIN, y, COL);
    if (morbChecked.length) {
      drawField(doc, 'Mórbidos', morbChecked.join(', '), MARGIN + 2, y);
      y += 5.5;
    }
    if (quirChecked.length) {
      drawField(doc, 'Quirúrgicos', quirChecked.join(', '), MARGIN + 2, y);
      y += 5.5;
    }
    y += 2;
  }

  // ── Kinesiología: antropometría y evaluación postural (EV1 / EV2) ──
  const kinesioFull = specialtyData?.kinesio as {
    initial?: { anthro?: Record<string, string | number>; postural?: Record<string, string>; images?: string[] };
    final?: { anthro?: Record<string, string | number>; postural?: Record<string, string>; images?: string[] };
  } | undefined;
  if (specialtyKey === 'kinesiologia' && kinesioFull) {
    const ANTHRO_LABELS: [string, string, string][] = [
      ['weight', 'Peso', 'kg'], ['height', 'Talla', 'cm'], ['reach', 'Envergadura', 'cm'],
      ['legR', 'EID derecha', 'cm'], ['legL', 'EID izquierda', 'cm'],
    ];
    const anthroRows = ANTHRO_LABELS
      .map(([k, label, unit]) => ({
        label, unit,
        ev1: kinesioFull.initial?.anthro?.[k] ?? '',
        ev2: kinesioFull.final?.anthro?.[k] ?? '',
      }))
      .filter(r => String(r.ev1) !== '' || String(r.ev2) !== '');
    if (anthroRows.length) {
      if (y + 24 > 265) { doc.addPage(); y = MARGIN; }
      y = drawSectionHeader(doc, 'DATOS ANTROPOMÉTRICOS (KINESIOLOGÍA)', MARGIN, y, COL);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Medida', MARGIN + 2, y + 4);
      doc.text('EV1', MARGIN + COL - 40, y + 4);
      doc.text('EV2', MARGIN + COL - 20, y + 4);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      for (const r of anthroRows) {
        if (y + 6 > 265) { doc.addPage(); y = MARGIN; }
        doc.text(r.label, MARGIN + 2, y + 4);
        doc.text(String(r.ev1) !== '' ? `${r.ev1} ${r.unit}` : '—', MARGIN + COL - 40, y + 4);
        doc.text(String(r.ev2) !== '' ? `${r.ev2} ${r.unit}` : '—', MARGIN + COL - 20, y + 4);
        y += 5.5;
      }
      y += 3;
    }

    const POSTURAL_LABELS: [string, string][] = [
      ['plomadaSag', 'Plomada sagital'], ['plomadaFront', 'Plomada frontal'],
      ['shoulders', 'Hombros'], ['scapulas', 'Escápulas'], ['pelvis', 'Pelvis'],
      ['knees', 'Rodillas'], ['feet', 'Pies'], ['observations', 'Observaciones'],
    ];
    const posturalRows = POSTURAL_LABELS
      .map(([k, label]) => ({
        label,
        ev1: kinesioFull.initial?.postural?.[k] ?? '',
        ev2: kinesioFull.final?.postural?.[k] ?? '',
      }))
      .filter(r => String(r.ev1).trim() !== '' || String(r.ev2).trim() !== '');
    if (posturalRows.length) {
      if (y + 24 > 265) { doc.addPage(); y = MARGIN; }
      y = drawSectionHeader(doc, 'EVALUACIÓN POSTURAL (KINESIOLOGÍA)', MARGIN, y, COL);
      for (const r of posturalRows) {
        const txt = [r.ev1 && `EV1: ${r.ev1}`, r.ev2 && `EV2: ${r.ev2}`].filter(Boolean).join('  ·  ');
        const lines = doc.splitTextToSize(txt, COL - 40);
        if (y + lines.length * 4.5 + 2 > 265) { doc.addPage(); y = MARGIN; }
        drawField(doc, r.label, lines[0], MARGIN + 2, y);
        if (lines.length > 1) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(30, 41, 59);
          doc.text(lines.slice(1), MARGIN + 30, y + 4.5);
          y += (lines.length - 1) * 4.5;
        }
        y += 5.5;
      }
      y += 2;
    }

    const nImgs = (kinesioFull.initial?.images?.length || 0) + (kinesioFull.final?.images?.length || 0);
    if (nImgs > 0) {
      if (y + 8 > 265) { doc.addPage(); y = MARGIN; }
      drawField(doc, 'Fotos posturales', `${nImgs} imagen(es) registradas en la ficha digital`, MARGIN + 2, y);
      y += 7;
    }
  }

  // ── ROM personalizado (labels/normales editados por el profesional) ──
  const romDefsPdf = (specialtyData?.romDefs as Array<{ id: string; label: string; normal: string }>) || [];
  const kinesioPdf = specialtyData?.kinesio as {
    initial?: { rom?: Record<string, string>; tests?: Record<string, string> };
    final?: { rom?: Record<string, string>; tests?: Record<string, string> };
  } | undefined;
  const romRows = romDefsPdf
    .map(d => ({
      label: d.label || '—',
      normal: d.normal,
      ev1: kinesioPdf?.initial?.rom?.[d.id] ?? '',
      ev2: kinesioPdf?.final?.rom?.[d.id] ?? '',
    }))
    .filter(r => r.ev1 !== '' || r.ev2 !== '');
  if (romRows.length) {
    if (y + 24 > 265) { doc.addPage(); y = MARGIN; }
    y = drawSectionHeader(doc, 'RANGO DE MOVIMIENTO (ROM)', MARGIN, y, COL);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Articulación / Campo', MARGIN + 2, y + 4);
    doc.text('Normal', MARGIN + COL - 62, y + 4);
    doc.text('EV1', MARGIN + COL - 40, y + 4);
    doc.text('EV2', MARGIN + COL - 20, y + 4);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    for (const r of romRows) {
      if (y + 6 > 265) { doc.addPage(); y = MARGIN; }
      doc.text(String(r.label).slice(0, 45), MARGIN + 2, y + 4);
      doc.text(r.normal !== '' && r.normal !== undefined ? `${r.normal}°` : '—', MARGIN + COL - 62, y + 4);
      doc.text(r.ev1 !== '' ? `${r.ev1}°` : '—', MARGIN + COL - 40, y + 4);
      doc.text(r.ev2 !== '' ? `${r.ev2}°` : '—', MARGIN + COL - 20, y + 4);
      y += 5.5;
    }
    y += 3;
  }

  // ── Tests especiales escogidos por el profesional ──
  const testDefsPdf = (specialtyData?.testDefs as string[]) || [];
  const fmtTest = (v?: string) => v === 'pos' ? 'POSITIVO' : v === 'neg' ? 'Negativo' : v === 'ne' ? 'N/E' : '—';
  if (testDefsPdf.length) {
    if (y + 24 > 265) { doc.addPage(); y = MARGIN; }
    y = drawSectionHeader(doc, 'TESTS ESPECIALES', MARGIN, y, COL);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Test', MARGIN + 2, y + 4);
    doc.text('EV1', MARGIN + COL - 48, y + 4);
    doc.text('EV2', MARGIN + COL - 22, y + 4);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    for (const t of testDefsPdf) {
      if (y + 6 > 265) { doc.addPage(); y = MARGIN; }
      doc.text(String(t).slice(0, 50), MARGIN + 2, y + 4);
      doc.text(fmtTest(kinesioPdf?.initial?.tests?.[t]), MARGIN + COL - 48, y + 4);
      doc.text(fmtTest(kinesioPdf?.final?.tests?.[t]), MARGIN + COL - 22, y + 4);
      y += 5.5;
    }
    y += 3;
  }

  // ── Campos personalizados agregados por el profesional en cada sección ──
  const sectionFieldsPdf = specialtyData?.sectionFields as Record<string, Array<{ label: string; value: string }>> | undefined;
  const SECTION_TITLES: Record<string, string> = {
    'ki-antropometria': 'Datos Antropométricos', 'ki-postural': 'Evaluación Postural',
    'ki-rom': 'Rango de Movimiento', 'ki-tests': 'Tests Especiales',
    biomecanica: 'Análisis Biomecánico', comparacion: 'Comparación EV1 vs EV2',
    nutricion: 'Evaluación Nutricional', psicologia: 'Evaluación Psicológica',
    soap: 'Nota Clínica', objetivos: 'Objetivos del Tratamiento',
    documentos: 'Documentos', bitacora: 'Bitácora de Evolución',
  };
  const sectionsWithFields = Object.entries(sectionFieldsPdf || {})
    .map(([sec, list]) => [sec, (list || []).filter(f => (f.label || '').trim() || (f.value || '').trim())] as const)
    .filter(([, list]) => list.length > 0);
  if (sectionsWithFields.length) {
    if (y + 24 > 265) { doc.addPage(); y = MARGIN; }
    y = drawSectionHeader(doc, 'CAMPOS PERSONALIZADOS', MARGIN, y, COL);
    for (const [sec, list] of sectionsWithFields) {
      if (y + 10 > 265) { doc.addPage(); y = MARGIN; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text((SECTION_TITLES[sec] || sec).toUpperCase(), MARGIN + 2, y + 4);
      y += 6;
      for (const f of list) {
        const val = String(f.value || '—');
        const lines = doc.splitTextToSize(val, COL - 60);
        if (y + lines.length * 4.5 + 2 > 265) { doc.addPage(); y = MARGIN; }
        drawField(doc, String(f.label || '—').slice(0, 28), lines[0], MARGIN + 4, y);
        if (lines.length > 1) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(30, 41, 59);
          doc.text(lines.slice(1), MARGIN + 34, y + 4.5);
          y += (lines.length - 1) * 4.5;
        }
        y += 5.5;
      }
      y += 2;
    }
    y += 3;
  }

  // ── Documentos adjuntos (lista) ──
  const attachList = ((patient.attachments || []) as Array<{ name?: string; date?: string; type?: string }>)
    .filter(f => (f.name || '').trim());
  if (attachList.length) {
    if (y + 18 > 265) { doc.addPage(); y = MARGIN; }
    y = drawSectionHeader(doc, 'DOCUMENTOS ADJUNTOS', MARGIN, y, COL);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    for (const f of attachList) {
      if (y + 5.5 > 265) { doc.addPage(); y = MARGIN; }
      doc.text(`• ${f.name}${f.date ? `  (${f.date})` : ''}`, MARGIN + 2, y + 4);
      y += 5.5;
    }
    y += 3;
  }

  // ── Consentimiento informado ──
  if ((specialtyData as Record<string, any>)?.consentAccepted !== undefined) {
    if (y + 8 > 265) { doc.addPage(); y = MARGIN; }
    const ok = (specialtyData as Record<string, any>).consentAccepted === true;
    drawField(doc, 'Consentimiento', ok ? 'Aceptado por el paciente' : 'PENDIENTE de aceptación', MARGIN + 2, y);
    y += 8;
  }

  // Firma auto-generada
  if (y + 42 > 265) { doc.addPage(); y = MARGIN; }
  drawAutoSignature(doc, professional, MARGIN, COL, y);

  drawFooters(doc, W, professional);

  const safeName = patient.name.replace(/\s+/g, '_');
  doc.save(`Ficha_${safeName}_${dateStr.replace(/\//g, '-')}.pdf`);
}

// ── INFORME IA A PDF ───────────────────────────────────────────────────────────

export async function exportReportToPDF(
  content: string,
  patient: Patient,
  professional: ProfessionalProfile
): Promise<void> {
  await ensureJsPDF();

  const { jsPDF } = window.jspdf!;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 18;
  const COL = W - MARGIN * 2;
  let y = MARGIN;

  const dateStr = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  drawMembrete(doc, W, MARGIN, dateStr);
  y = 36;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('INFORME CLÍNICO', MARGIN, y);
  y += 5;
  doc.setDrawColor(0, 168, 158);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 6;

  // Registro de cambios (plantilla unificada)
  y = drawDocMeta(doc, MARGIN, COL, y, {
    updatedAt: patient.updatedAt,
    proName: professional.name,
    proSpecialty: professional.specialty,
    docId: patient.id,
  });

  // Identificación del paciente
  y = drawSectionHeader(doc, 'IDENTIFICACIÓN DEL PACIENTE', MARGIN, y, COL);
  const half = COL / 2;
  const idFields: [string, string][] = [
    ['Nombre', patient.name || '—'],
    ['RUT', patient.rut || '—'],
    ['Edad', patient.age ? `${patient.age} años` : '—'],
    ['Previsión', patient.prevision || '—'],
    ['Diagnóstico', patient.diagnoses || '—'],
    ['Fecha informe', dateStr],
  ];
  for (let i = 0; i < idFields.length; i += 2) {
    drawField(doc, idFields[i][0], idFields[i][1], MARGIN + 2, y);
    if (idFields[i + 1]) drawField(doc, idFields[i + 1][0], idFields[i + 1][1], MARGIN + 2 + half, y);
    y += 5.5;
  }
  y += 4;

  const allLines = doc.splitTextToSize(content, COL);
  for (const line of allLines) {
    if (y + 5 > 268) {
      doc.addPage();
      y = MARGIN;
    }
    const isHeader = /^[0-9]+\./.test(line.trim()) || line.trim().toUpperCase() === line.trim() && line.trim().length > 4;
    if (isHeader) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
    }
    doc.text(line, MARGIN, y);
    y += isHeader ? 5.5 : 4.8;
  }

  y += 6;
  if (y + 42 > 268) { doc.addPage(); y = MARGIN; }
  drawAutoSignature(doc, professional, MARGIN, COL, y);

  drawFooters(doc, W, professional);

  const safeName = patient.name.replace(/\s+/g, '_');
  doc.save(`Informe_${safeName}_${dateStr.replace(/\//g, '-')}.pdf`);
}

// ── ORDEN PROFESIONAL ─────────────────────────────────────────────────────────

const ORDEN_TITLES: Record<string, string> = {
  kinesiologia: 'ORDEN KINESIOLÓGICA',
  nutricion: 'ORDEN NUTRICIONAL',
  psicologia: 'ORDEN PSICOLÓGICA',
};

export async function exportOrdenPDF(
  patient: Patient,
  professional: ProfessionalProfile,
  indicaciones: string,
  specialtyKey: string,
  signatureBase64?: string
): Promise<void> {
  await ensureJsPDF();

  const { jsPDF } = window.jspdf!;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 18;
  const COL = W - MARGIN * 2;
  let y = MARGIN;

  const dateStr = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const titulo = ORDEN_TITLES[specialtyKey] || 'ORDEN MÉDICA';

  drawMembrete(doc, W, MARGIN, dateStr);
  y = 36;

  // Registro de cambios (plantilla unificada)
  y = drawDocMeta(doc, MARGIN, COL, y, {
    updatedAt: patient.updatedAt,
    proName: professional.name,
    proSpecialty: professional.specialty,
    docId: patient.id,
  });

  // Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(titulo, MARGIN, y);
  y += 5;
  doc.setDrawColor(0, 168, 158);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 8;

  // Fecha de emisión
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Fecha de emisión: ${dateStr}`, MARGIN, y);
  y += 8;

  // Datos del profesional
  y = drawSectionHeader(doc, 'PROFESIONAL', MARGIN, y, COL);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`${professional.name}  ·  ${professional.specialty}  ·  ${professional.city || ''}`, MARGIN + 2, y);
  y += 8;

  // Datos del paciente
  y = drawSectionHeader(doc, 'PACIENTE', MARGIN, y, COL);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`${patient.name}  ·  RUT: ${patient.rut}  ·  Previsión: ${patient.prevision || '—'}`, MARGIN + 2, y);
  y += 10;

  // Indicaciones
  y = drawSectionHeader(doc, 'INDICACIONES', MARGIN, y, COL);
  const indLines = doc.splitTextToSize(indicaciones || '(Sin indicaciones registradas)', COL - 6);
  const indBoxH = 10 + indLines.length * 5;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.rect(MARGIN, y, COL, indBoxH, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(indLines, MARGIN + 4, y + 8);
  y += indBoxH + 10;

  // Firma
  if (y + 42 > 265) { doc.addPage(); y = MARGIN; }
  drawAutoSignature(doc, professional, MARGIN, COL, y, signatureBase64);

  // Nota de validez
  y += 42;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Documento emitido por AgendaMaslife. Válido con firma electrónica del profesional.', W / 2, y, { align: 'center' });

  drawFooters(doc, W, professional);

  const safeName = patient.name.replace(/\s+/g, '_');
  doc.save(`Orden_${safeName}_${dateStr.replace(/\//g, '-')}.pdf`);
}
