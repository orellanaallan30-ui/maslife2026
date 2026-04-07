import React, { useState, useRef } from 'react';
import { SOAPEntry, AdditionalNote, ProfessionalProfile, Patient } from '../types_clinical';
import { auditService } from '../auditService';
import { exportSOAPtoPDF, generateDocumentHash } from '../pdfExport';
import { supabase } from '../supabaseClient';

// ── Utilidades ────────────────────────────────────────────────────────────────
function generateVerificationCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// ── Subcomponente: Campo SOAP ─────────────────────────────────────────────────
const SOAPField: React.FC<{
  label: string;
  letter: string;
  color: string;
  borderColor: string;
  value: string;
  onChange: (v: string) => void;
  locked: boolean;
  placeholder?: string;
}> = ({ label, letter, color, borderColor, value, onChange, locked, placeholder }) => (
  <div className={`rounded-2xl border-2 ${borderColor} ${color} overflow-hidden`}>
    <div className="px-4 py-2 flex items-center gap-3">
      <span className="w-8 h-8 rounded-xl bg-white/60 flex items-center justify-center text-sm font-black text-slate-800">
        {letter}
      </span>
      <span className="font-black text-sm text-slate-700 uppercase tracking-wider">{label}</span>
      {locked && (
        <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
          <span className="material-icons-round text-base">lock</span>Solo lectura
        </span>
      )}
    </div>
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={locked}
      placeholder={locked ? undefined : placeholder}
      rows={4}
      className={`w-full bg-transparent px-4 pb-4 text-sm text-slate-800 resize-none outline-none font-medium
        ${locked ? 'cursor-default opacity-80' : 'focus:ring-0'}`}
    />
  </div>
);

// ── Componente Principal: ClinicalSOAP ────────────────────────────────────────
interface ClinicalSOAPProps {
  patient: Patient;
  loggedPro: ProfessionalProfile;
  existingEntries: SOAPEntry[];
  onSave: (entry: SOAPEntry) => Promise<void>;
  signatureBase64?: string;
}

const ClinicalSOAP: React.FC<ClinicalSOAPProps> = ({
  patient, loggedPro, existingEntries, onSave, signatureBase64
}) => {
  const [activeEntry, setActiveEntry] = useState<SOAPEntry | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [showAddNote, setShowAddNote] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [confirmSign, setConfirmSign] = useState(false);
  const [draft, setDraft] = useState<Partial<SOAPEntry>>({
    subjective: '', objective: '', assessment: '', plan: '',
    diagnosis: '', icd10Code: '', prestacion_code: '', sessionDurationMinutes: 45
  });

  const sorted = [...existingEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // ── Crear nueva sesión ────────────────────────────────────
  const handleNewSession = () => {
    const sessionNum = (existingEntries.length > 0
      ? Math.max(...existingEntries.map(e => e.sessionNumber))
      : 0) + 1;

    const newEntry: SOAPEntry = {
      id: crypto.randomUUID(),
      patientId: patient.id,
      professionalId: loggedPro.id,
      sessionNumber: sessionNum,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      subjective: '',
      objective: '',
      assessment: '',
      plan: '',
      isLocked: false,
      verificationCode: generateVerificationCode(),
      additionalNotes: [],
    };
    setActiveEntry(newEntry);
    setDraft({ ...newEntry });
    setIsCreating(true);

    auditService.log({
      userId: loggedPro.id,
      userName: loggedPro.name,
      action: 'SOAP_CREATE',
      resourceId: newEntry.id,
      resourceType: 'soap',
    });
  };

  // ── Guardar borrador ──────────────────────────────────────
  const handleSaveDraft = async () => {
    if (!activeEntry) return;
    const updated = { ...activeEntry, ...draft, isLocked: false };
    setActiveEntry(updated);
    await onSave(updated);
  };

  // ── Firmar y bloquear ─────────────────────────────────────
  const handleSign = async () => {
    if (!activeEntry) return;
    setIsSigning(true);
    try {
      const content = `${activeEntry.id}|${draft.subjective}|${draft.objective}|${draft.assessment}|${draft.plan}`;
      const hash = await generateDocumentHash(content);
      const signed: SOAPEntry = {
        ...activeEntry,
        ...draft as SOAPEntry,
        isLocked: true,
        signedAt: new Date().toISOString(),
        signedByRut: loggedPro.email,
        signatureImageBase64: signatureBase64,
        documentHash: hash,
      };
      setActiveEntry(signed);
      await onSave(signed);
      setConfirmSign(false);

      auditService.log({
        userId: loggedPro.id,
        userName: loggedPro.name,
        action: 'SOAP_SIGN',
        resourceId: signed.id,
        resourceType: 'soap',
        details: { sessionNumber: signed.sessionNumber, hash },
      });
    } finally {
      setIsSigning(false);
    }
  };

  // ── Agregar nota adicional ────────────────────────────────
  const handleAddNote = async () => {
    if (!activeEntry || !noteText.trim()) return;
    const note: AdditionalNote = {
      id: crypto.randomUUID(),
      soapEntryId: activeEntry.id,
      authorId: loggedPro.id,
      authorName: loggedPro.name,
      content: noteText.trim(),
      createdAt: new Date().toISOString(),
    };
    const updated: SOAPEntry = {
      ...activeEntry,
      additionalNotes: [...(activeEntry.additionalNotes || []), note],
    };
    setActiveEntry(updated);
    await onSave(updated);
    setNoteText('');
    setShowAddNote(false);
  };

  // ── Exportar PDF ──────────────────────────────────────────
  const handleExportPDF = async (entry: SOAPEntry) => {
    if (!entry.isLocked) {
      alert('Solo se pueden exportar fichas firmadas.');
      return;
    }
    setIsExporting(true);
    try {
      const { pdfBase64 } = await exportSOAPtoPDF(entry, loggedPro, patient, undefined, signatureBase64);
      const link = document.createElement('a');
      link.href = pdfBase64;
      link.download = `SOAP_${patient.name.replace(/\s+/g, '_')}_Sesion${entry.sessionNumber}.pdf`;
      link.click();

      auditService.log({
        userId: loggedPro.id,
        userName: loggedPro.name,
        action: 'SOAP_EXPORT_PDF',
        resourceId: entry.id,
        resourceType: 'soap',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex gap-6 h-full">
      {/* ── Lista de sesiones ── */}
      <div className="w-72 shrink-0 flex flex-col gap-3">
        <button
          onClick={handleNewSession}
          className="w-full py-3 bg-teal-500 text-white rounded-2xl font-black text-sm
            flex items-center justify-center gap-2 hover:bg-teal-600 transition-all shadow-lg shadow-teal-500/20"
        >
          <span className="material-icons-round text-lg">add</span>
          Nueva Sesión
        </button>

        <div className="flex flex-col gap-2 overflow-y-auto">
          {sorted.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              <span className="material-icons-round text-3xl block mb-2">history_edu</span>
              Sin sesiones registradas
            </div>
          )}
          {sorted.map(entry => (
            <button
              key={entry.id}
              onClick={() => {
                setActiveEntry(entry);
                setDraft(entry);
                setIsCreating(false);
                auditService.log({
                  userId: loggedPro.id,
                  userName: loggedPro.name,
                  action: 'SOAP_VIEW',
                  resourceId: entry.id,
                  resourceType: 'soap',
                });
              }}
              className={`text-left p-4 rounded-2xl border-2 transition-all
                ${activeEntry?.id === entry.id
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-slate-100 bg-white hover:border-teal-200'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-black text-sm text-slate-800">
                  Sesión #{entry.sessionNumber}
                </span>
                {entry.isLocked ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50
                    px-2 py-0.5 rounded-full font-bold">
                    <span className="material-icons-round text-xs">verified</span>
                    Firmada
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-bold">
                    Borrador
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {new Date(entry.date).toLocaleDateString('es-CL', {
                  weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
                })}
              </p>
              {entry.diagnosis && (
                <p className="text-xs text-slate-400 truncate mt-1">{entry.diagnosis}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Editor de sesión ── */}
      <div className="flex-1 overflow-y-auto">
        {!activeEntry ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <span className="material-icons-round text-5xl mb-3">assignment</span>
            <p className="font-bold">Selecciona o crea una sesión</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Header de la sesión */}
            <div className="bg-white rounded-2xl border-2 border-slate-100 p-4 flex items-center justify-between">
              <div>
                <h3 className="font-black text-lg text-slate-800">
                  Sesión #{activeEntry.sessionNumber}
                  <span className={`ml-3 text-xs px-3 py-1 rounded-full font-bold
                    ${activeEntry.isLocked
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'}`}>
                    {activeEntry.isLocked ? '🔒 Firmada · Solo Lectura' : '✏️ Borrador'}
                  </span>
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  {new Date(activeEntry.date).toLocaleDateString('es-CL', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                  })}
                  {activeEntry.signedAt && (
                    <span className="ml-3 text-xs text-emerald-600">
                      Firmada: {new Date(activeEntry.signedAt).toLocaleString('es-CL')}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                {activeEntry.isLocked && (
                  <>
                    <button
                      onClick={() => handleExportPDF(activeEntry)}
                      disabled={isExporting}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700
                        rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
                    >
                      <span className="material-icons-round text-base">
                        {isExporting ? 'hourglass_empty' : 'picture_as_pdf'}
                      </span>
                      {isExporting ? 'Generando...' : 'Exportar PDF'}
                    </button>
                    <button
                      onClick={() => setShowAddNote(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700
                        rounded-xl text-sm font-bold hover:bg-blue-100 transition-all"
                    >
                      <span className="material-icons-round text-base">note_add</span>
                      Nota Adicional
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Metadatos clínicos */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-black text-slate-500 mb-1 uppercase">Diagnóstico</label>
                <input
                  disabled={activeEntry.isLocked}
                  value={draft.diagnosis || ''}
                  onChange={e => setDraft(d => ({ ...d, diagnosis: e.target.value }))}
                  placeholder="Ej: Lumbalgia crónica"
                  className="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm
                    focus:border-teal-400 outline-none disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 mb-1 uppercase">CIE-10</label>
                <input
                  disabled={activeEntry.isLocked}
                  value={draft.icd10Code || ''}
                  onChange={e => setDraft(d => ({ ...d, icd10Code: e.target.value }))}
                  placeholder="Ej: M54.5"
                  className="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm
                    focus:border-teal-400 outline-none disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 mb-1 uppercase">Código Fonasa</label>
                <input
                  disabled={activeEntry.isLocked}
                  value={draft.prestacion_code || ''}
                  onChange={e => setDraft(d => ({ ...d, prestacion_code: e.target.value }))}
                  placeholder="Ej: 01-0102"
                  className="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm
                    focus:border-teal-400 outline-none disabled:bg-slate-50"
                />
              </div>
            </div>

            {/* Campos SOAP */}
            <SOAPField
              label="Subjetivo — Lo que reporta el paciente"
              letter="S"
              color="bg-blue-50"
              borderColor="border-blue-200"
              value={draft.subjective || ''}
              onChange={v => setDraft(d => ({ ...d, subjective: v }))}
              locked={activeEntry.isLocked}
              placeholder="Ej: Paciente refiere dolor lumbar EVA 6/10, que se exacerba con la bipedestación prolongada..."
            />
            <SOAPField
              label="Objetivo — Hallazgos clínicos medibles"
              letter="O"
              color="bg-emerald-50"
              borderColor="border-emerald-200"
              value={draft.objective || ''}
              onChange={v => setDraft(d => ({ ...d, objective: v }))}
              locked={activeEntry.isLocked}
              placeholder="Ej: ROM lumbar: flexión 40°, extensión 15°. Fuerza muscular: 4/5 paravertebrales..."
            />
            <SOAPField
              label="Análisis — Evaluación clínica"
              letter="A"
              color="bg-yellow-50"
              borderColor="border-yellow-200"
              value={draft.assessment || ''}
              onChange={v => setDraft(d => ({ ...d, assessment: v }))}
              locked={activeEntry.isLocked}
              placeholder="Ej: Cuadro de lumbalgia crónica no específica con componente muscular. Evolución favorable..."
            />
            <SOAPField
              label="Plan — Intervención del día"
              letter="P"
              color="bg-rose-50"
              borderColor="border-rose-200"
              value={draft.plan || ''}
              onChange={v => setDraft(d => ({ ...d, plan: v }))}
              locked={activeEntry.isLocked}
              placeholder="Ej: Ultrasonido terapéutico 1MHz zona L4-L5, 5min. Ejercicios de estabilización lumbar..."
            />

            {/* Notas adicionales (post-firma) */}
            {(activeEntry.additionalNotes?.length ?? 0) > 0 && (
              <div className="bg-slate-50 rounded-2xl border-2 border-slate-200 p-4">
                <h4 className="font-black text-sm text-slate-700 mb-3 flex items-center gap-2">
                  <span className="material-icons-round text-base text-blue-500">sticky_note_2</span>
                  Notas Adicionales Post-Firma
                </h4>
                {activeEntry.additionalNotes!.map(note => (
                  <div key={note.id} className="bg-white rounded-xl border border-slate-200 p-3 mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-600">{note.authorName}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(note.createdAt).toLocaleString('es-CL')}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{note.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Formulario de nota adicional */}
            {showAddNote && activeEntry.isLocked && (
              <div className="bg-blue-50 rounded-2xl border-2 border-blue-200 p-4">
                <h4 className="font-black text-sm text-blue-800 mb-3">
                  ✍️ Agregar Nota Adicional
                  <span className="ml-2 text-xs font-normal text-blue-600">
                    (No modifica la ficha original firmada)
                  </span>
                </h4>
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Describe la corrección o aclaración necesaria..."
                  rows={3}
                  className="w-full border-2 border-blue-200 rounded-xl px-3 py-2 text-sm
                    bg-white outline-none focus:border-blue-400 resize-none"
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleAddNote}
                    disabled={!noteText.trim()}
                    className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-bold
                      hover:bg-blue-600 transition-all disabled:opacity-50"
                  >
                    Guardar Nota
                  </button>
                  <button
                    onClick={() => setShowAddNote(false)}
                    className="px-4 py-2 bg-white text-slate-600 rounded-xl text-sm font-bold
                      border border-slate-200 hover:bg-slate-50 transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Acciones de guardado/firma */}
            {!activeEntry.isLocked && (
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSaveDraft}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-700
                    rounded-2xl text-sm font-black hover:bg-slate-200 transition-all"
                >
                  <span className="material-icons-round text-base">save</span>
                  Guardar Borrador
                </button>
                <button
                  onClick={() => setConfirmSign(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-teal-500 text-white
                    rounded-2xl text-sm font-black hover:bg-teal-600 transition-all
                    shadow-lg shadow-teal-500/20"
                >
                  <span className="material-icons-round text-base">verified</span>
                  Firmar y Cerrar Sesión
                </button>
              </div>
            )}

            {/* Modal confirmación firma */}
            {confirmSign && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl mx-4">
                  <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <span className="material-icons-round text-3xl text-amber-600">lock</span>
                  </div>
                  <h3 className="font-black text-xl text-center text-slate-800 mb-2">
                    ¿Firmar esta sesión?
                  </h3>
                  <p className="text-sm text-slate-500 text-center mb-6">
                    Al firmar, la ficha quedará en <strong>modo Solo Lectura</strong> y no podrá
                    editarse. Cualquier corrección posterior deberá agregarse como Nota Adicional.
                    Esta acción queda registrada en el log de auditoría.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirmSign(false)}
                      className="flex-1 py-3 border-2 border-slate-200 rounded-2xl text-sm
                        font-black text-slate-600 hover:bg-slate-50 transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSign}
                      disabled={isSigning}
                      className="flex-1 py-3 bg-teal-500 text-white rounded-2xl text-sm
                        font-black hover:bg-teal-600 transition-all disabled:opacity-60
                        flex items-center justify-center gap-2"
                    >
                      {isSigning ? (
                        <><span className="material-icons-round text-base animate-spin">sync</span>Firmando...</>
                      ) : (
                        <><span className="material-icons-round text-base">verified</span>Confirmar Firma</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClinicalSOAP;
