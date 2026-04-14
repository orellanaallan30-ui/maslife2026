// pdfExport.ts — Exportación clínica conforme Fonasa/Isapre
// Usa jsPDF (CDN) + QR via qrcode.js
// Importar en index.html: <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js">

import { SOAPEntry, BolsetaGlosa } from './types_clinical';
import { ProfessionalProfile, Patient } from './types';

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
