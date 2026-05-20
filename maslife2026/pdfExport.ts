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
  doc.text('AgendaMaslife', MARGIN, 14);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Plataforma de Gestión Clínica', MARGIN, 21);
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
      `AgendaMaslife · ${pro.name} · ${pro.specialty}   Página ${p} de ${total}`,
      W / 2, 290, { align: 'center' }
    );
  }
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
  y += 8;

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
    const lines = doc.splitTextToSize(anamnesis.substring(0, 500), COL - 4);
    if (y + lines.length * 4.5 > 265) { doc.addPage(); y = MARGIN; }
    doc.text(lines, MARGIN + 2, y);
    y += lines.length * 4.5 + 2;
  }
  y += 2;

  // Signos Vitales
  if (y + 25 > 265) { doc.addPage(); y = MARGIN; }
  y = drawSectionHeader(doc, 'SIGNOS VITALES', MARGIN, y, COL);
  const vitCols = COL / 5;
  const vitalsData = [
    ['FC (LPM)', String(vitals.heartRate)],
    ['PA SIS', String(vitals.systolic)],
    ['PA DIA', String(vitals.diastolic)],
    ['SAT O2 %', String(vitals.oxygenSaturation)],
    ['TEMP °C', String(vitals.temperature)],
  ];
  doc.setFillColor(248, 250, 252);
  doc.rect(MARGIN, y, COL, 16, 'F');
  vitalsData.forEach(([label, val], i) => {
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
  y += 20;

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
    const last8 = sessionLogs.slice(-8).reverse();
    doc.setFillColor(226, 232, 240);
    doc.rect(MARGIN, y, COL, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    doc.text('Fecha', MARGIN + 2, y + 5);
    doc.text('Nota', MARGIN + 30, y + 5);
    doc.text('Código', MARGIN + COL - 25, y + 5);
    y += 8;
    for (const s of last8) {
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
    const nutFields = [
      ['Peso', specialtyData.nutPeso ? `${specialtyData.nutPeso} kg` : '—'],
      ['Talla', specialtyData.nutTalla ? `${specialtyData.nutTalla} cm` : '—'],
      ['Cintura', specialtyData.nutCintura ? `${specialtyData.nutCintura} cm` : '—'],
      ['Cadera', specialtyData.nutCadera ? `${specialtyData.nutCadera} cm` : '—'],
      ['Objetivos', String(specialtyData.nutGoals || '—')],
    ];
    for (let i = 0; i < nutFields.length; i += 2) {
      drawField(doc, nutFields[i][0], String(nutFields[i][1]), MARGIN + 2, y);
      if (nutFields[i + 1]) drawField(doc, nutFields[i + 1][0], String(nutFields[i + 1][1]), MARGIN + 2 + COL / 2, y);
      y += 5.5;
    }
    y += 3;
  }

  // Datos de especialidad: psicología
  if (specialtyKey === 'psicologia' && specialtyData) {
    if (y + 20 > 265) { doc.addPage(); y = MARGIN; }
    y = drawSectionHeader(doc, 'EVALUACIÓN PSICOLÓGICA', MARGIN, y, COL);
    const psychFields: [string, string][] = [
      ['Escala de ánimo', specialtyData.psychMood !== undefined ? `${specialtyData.psychMood}/10` : '—'],
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
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Paciente: ${patient.name}  ·  RUT: ${patient.rut}  ·  Fecha: ${dateStr}`, MARGIN, y);
  y += 8;

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
