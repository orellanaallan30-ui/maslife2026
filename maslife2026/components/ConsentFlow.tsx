import React, { useState, useRef, useEffect } from 'react';
import { InformedConsent } from '../types_clinical';
import { ProfessionalProfile, Patient } from '../types';
import { supabase } from '../supabaseClient';
import { auditService } from '../auditService';

// ── Texto del consentimiento por especialidad ─────────────────────────────────
const CONSENT_TEMPLATES: Record<string, string> = {
  'Kinesiología y Rehabilitación': `
CONSENTIMIENTO INFORMADO — ATENCIÓN KINESIOLÓGICA

Yo, el/la abajo firmante, en mi calidad de paciente o representante legal, declaro que:

1. He sido informado/a sobre el diagnóstico, el procedimiento kinesiológico propuesto y sus objetivos terapéuticos.

2. Comprendo que la kinesiología incluye técnicas como: movilización articular, ejercicio terapéutico, electroterapia, ultrasonido, masoterapia y otras modalidades físicas que serán aplicadas según evaluación profesional.

3. He sido informado/a de los posibles riesgos y beneficios del tratamiento, incluyendo la posibilidad de molestias transitorias durante el proceso de rehabilitación.

4. Tengo derecho a retirar este consentimiento en cualquier momento sin expresión de causa y sin que ello afecte la calidad de mi atención.

5. Autorizo al profesional a registrar mis datos clínicos en el sistema de gestión AgendaMaslife para fines terapéuticos, de acuerdo con la Ley 20.584 sobre Derechos y Deberes del Paciente.

6. He podido formular preguntas sobre mi tratamiento y estas han sido respondidas satisfactoriamente.
  `.trim(),

  'Fonoaudiología': `
CONSENTIMIENTO INFORMADO — ATENCIÓN FONOAUDIOLÓGICA

Yo, el/la abajo firmante, declaro que:

1. He sido informado/a sobre la evaluación y terapia fonoaudiológica propuesta y sus objetivos.

2. Comprendo que la fonoaudiología abarca: terapia del lenguaje, habla, deglución, voz y comunicación.

3. Entiendo los posibles beneficios y limitaciones del tratamiento fonoaudiológico.

4. Tengo derecho a retirar este consentimiento en cualquier momento.

5. Autorizo el registro de mis datos clínicos conforme a la Ley 20.584.
  `.trim(),
};

const DEFAULT_TEMPLATE = `
CONSENTIMIENTO INFORMADO — ATENCIÓN DE SALUD

Yo, el/la abajo firmante, declaro que he sido informado/a sobre el tratamiento propuesto,
sus objetivos, riesgos y beneficios. Tengo derecho a retirar este consentimiento en cualquier
momento sin que afecte la calidad de mi atención. Autorizo el registro de mis datos conforme
a la Ley 20.584 sobre Derechos y Deberes del Paciente.
`.trim();

// ── Componente: Canvas para firma del paciente ────────────────────────────────
const SignatureCanvas: React.FC<{ onCapture: (base64: string) => void }> = ({ onCapture }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    isDrawing.current = true;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    setHasSignature(true);
  };

  const endDraw = () => {
    isDrawing.current = false;
    const canvas = canvasRef.current; if (!canvas) return;
    onCapture(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onCapture('');
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        className="w-full border-2 border-dashed border-slate-300 rounded-xl bg-slate-50
          touch-none cursor-crosshair"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={e => { e.preventDefault(); startDraw(e); }}
        onTouchMove={e => { e.preventDefault(); draw(e); }}
        onTouchEnd={endDraw}
      />
      {hasSignature && (
        <button onClick={clear} className="mt-2 text-xs text-slate-500 hover:text-rose-500 transition-colors">
          ↺ Limpiar firma
        </button>
      )}
    </div>
  );
};

// ── Componente: Panel de Envío (lado profesional) ─────────────────────────────
export const ConsentSendPanel: React.FC<{
  patient: Patient;
  loggedPro: ProfessionalProfile;
  existingConsent?: InformedConsent | null;
  onSent: (consent: InformedConsent) => void;
}> = ({ patient, loggedPro, existingConsent, onSent }) => {
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [revokedLocal, setRevokedLocal] = useState(false);
  const [createdConsent, setCreatedConsent] = useState<InformedConsent | null>(null);
  const [copied, setCopied] = useState(false);

  // Plantilla breve y clara (la aprobada). Se arma con el nombre y especialidad del
  // profesional. Las versiones largas por especialidad siguen en CONSENT_TEMPLATES
  // por si se necesitan a futuro.
  const consentText = `Yo autorizo a ${loggedPro.name} (${loggedPro.specialty}) a atenderme y a registrar mis datos de salud en Agenda Maslife para mi tratamiento.\n\n• Entiendo en qué consiste mi atención y pude hacer preguntas.\n• Puedo retirar esta autorización cuando quiera.\n• Mis datos se protegen según la Ley 20.584 y la Ley 21.719.`;

  // Enlace para compartir con el paciente (disponible apenas se crea el consentimiento).
  const activeConsent = createdConsent || (existingConsent?.status === 'PENDING' ? existingConsent : null);
  const consentLink = activeConsent ? `${window.location.origin}/consent/${activeConsent.id}` : '';
  const shareWhatsApp = () => {
    const msg = `Hola ${patient.name || ''} 👋 Soy ${loggedPro.name} de Agenda Maslife. Antes de tu atención necesito tu autorización para atenderte y guardar tu ficha de salud. Es rápido (1 minuto) y firmas desde tu teléfono aquí: ${consentLink}  ¡Gracias!`;
    const phone = (patient.phone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };
  const copyLink = () => { try { navigator.clipboard.writeText(consentLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* noop */ } };

  // Retiro del consentimiento (Ley 21.719: el titular puede retirarlo en cualquier
  // momento). Lo registra el profesional a solicitud del paciente. La lectura de
  // consentimiento solo cuenta 'ACCEPTED', así que REVOKED reactiva el aviso.
  const handleRevoke = async () => {
    if (!existingConsent?.id) return;
    if (!window.confirm('¿Registrar el retiro del consentimiento de este paciente? La ficha volverá a marcar "sin consentimiento".')) return;
    const { error } = await supabase.from('informed_consents')
      .update({ status: 'REVOKED' }).eq('id', existingConsent.id);
    if (error) { alert('No se pudo registrar el retiro. Intenta de nuevo.'); return; }
    void auditService.log({
      userId: loggedPro.id, userName: loggedPro.name,
      action: 'CONSENT_REVOKE', resourceId: existingConsent.id, resourceType: 'consent',
    });
    setRevokedLocal(true);
  };

  const handleSend = async () => {
    setIsSending(true);
    try {
      const consent: InformedConsent = {
        id: crypto.randomUUID(),
        patientId: patient.id,
        patientName: patient.name,
        patientEmail: patient.email,
        professionalId: loggedPro.id,
        templateVersion: 'v1.0',
        sentAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING',
        checkboxChecked: false,
        consentText,
        verificationCode: crypto.randomUUID().substring(0, 16).toUpperCase(),
      };

      const { error } = await supabase.from('informed_consents').insert({
        id: consent.id,
        patient_id: consent.patientId,
        patient_name: consent.patientName,
        patient_email: consent.patientEmail,
        professional_id: consent.professionalId,
        template_version: consent.templateVersion,
        expires_at: consent.expiresAt,
        status: 'PENDING',
        checkbox_checked: false,
        consent_text: consent.consentText,
        verification_code: consent.verificationCode,
      });

      if (error) throw error;

      auditService.log({
        userId: loggedPro.id,
        userName: loggedPro.name,
        action: 'CONSENT_SEND',
        resourceId: consent.id,
        resourceType: 'consent',
        details: { patientEmail: patient.email },
      });

      setCreatedConsent(consent);
      onSent(consent);
      setSent(true);
    } catch (e) {
      alert('No se pudo generar el consentimiento. Intenta de nuevo.');
      console.error('[consent] crear', e);
    } finally {
      setIsSending(false);
    }
  };

  if (revokedLocal || existingConsent?.status === 'REVOKED') {
    return (
      <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 flex items-center gap-3">
        <span className="material-icons-round text-slate-400 text-2xl">block</span>
        <div>
          <p className="font-black text-slate-700">Consentimiento retirado</p>
          <p className="text-xs text-slate-500">El paciente retiró su consentimiento. Puedes enviar uno nuevo si lo requiere.</p>
        </div>
      </div>
    );
  }

  if (existingConsent?.status === 'ACCEPTED') {
    return (
      <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="material-icons-round text-emerald-500 text-2xl">task_alt</span>
          <div>
            <p className="font-black text-emerald-800">Consentimiento Aceptado</p>
            <p className="text-xs text-emerald-600">
              {new Date(existingConsent.acceptedAt!).toLocaleString('es-CL')}
              {existingConsent.ipAddress && ` · IP: ${existingConsent.ipAddress}`}
            </p>
          </div>
        </div>
        <button onClick={handleRevoke}
          className="text-[11px] font-bold text-slate-400 hover:text-rose-500 underline transition-colors">
          Registrar retiro
        </button>
      </div>
    );
  }

  if (sent || existingConsent?.status === 'PENDING') {
    return (
      <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-icons-round text-amber-500 text-2xl">schedule_send</span>
          <div>
            <p className="font-black text-amber-800">Consentimiento pendiente de firma</p>
            <p className="text-xs text-amber-600">
              Comparte el enlace con {patient.name || 'el paciente'} · Expira en 72 horas
            </p>
          </div>
        </div>
        {consentLink && (
          <>
            <div className="bg-white rounded-xl border border-amber-200 px-3 py-2 mb-3 text-xs text-slate-500 break-all">
              {consentLink}
            </div>
            <div className="flex gap-2">
              <button onClick={shareWhatsApp}
                className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl font-black text-xs
                  hover:bg-emerald-600 transition-all flex items-center justify-center gap-1.5">
                <span className="material-icons-round text-base">chat</span>
                Enviar por WhatsApp
              </button>
              <button onClick={copyLink}
                className="py-2.5 px-4 bg-white border-2 border-amber-200 text-amber-700 rounded-xl font-black text-xs
                  hover:bg-amber-100 transition-all flex items-center justify-center gap-1.5">
                <span className="material-icons-round text-base">{copied ? 'check' : 'content_copy'}</span>
                {copied ? 'Copiado ✓' : 'Copiar link'}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
          <span className="material-icons-round text-blue-600">article</span>
        </div>
        <div>
          <p className="font-black text-slate-800">Consentimiento Informado</p>
          <p className="text-xs text-slate-500">
            Genera un enlace para que {patient.name || 'el paciente'} firme desde su teléfono
          </p>
        </div>
      </div>
      <div className="bg-slate-50 rounded-xl p-3 max-h-32 overflow-y-auto mb-4">
        <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{consentText}</p>
      </div>
      <button
        onClick={handleSend}
        disabled={isSending}
        className="w-full py-3 bg-teal-500 text-white rounded-xl font-black text-sm
          hover:bg-teal-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isSending
          ? <><span className="material-icons-round text-base animate-pulse">bolt</span>Generando...</>
          : <><span className="material-icons-round text-base">draw</span>Generar consentimiento</>
        }
      </button>
    </div>
  );
};

// ── Componente: Página de Aceptación (lado paciente, pública) ─────────────────
export const ConsentAcceptPage: React.FC<{ consentId: string }> = ({ consentId }) => {
  const [consent, setConsent] = useState<InformedConsent | null>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);
  const [signatureBase64, setSignatureBase64] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('informed_consents')
      .select('*')
      .eq('id', consentId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) setError('Consentimiento no encontrado o expirado.');
        else if (new Date(data.expires_at) < new Date()) setError('Este enlace ha expirado.');
        else if (data.status === 'ACCEPTED') { setDone(true); setConsent(data as unknown as InformedConsent); }
        else setConsent(data as unknown as InformedConsent);
        setLoading(false);
      });
  }, [consentId]);

  const handleAccept = async () => {
    if (!consent || !checked) return;
    setSubmitting(true);
    try {
      let ip = 'UNKNOWN';
      try {
        const r = await fetch('https://api.ipify.org?format=json');
        ip = (await r.json()).ip;
      } catch { /* silent */ }

      const { error } = await supabase.from('informed_consents').update({
        status: 'ACCEPTED',
        accepted_at: new Date().toISOString(),
        ip_address: ip,
        device_info: navigator.userAgent.substring(0, 200),
        patient_signature_b64: signatureBase64 || null,
        checkbox_checked: true,
      }).eq('id', consent.id);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: `patient:${consent.patientId}`,
        user_name: consent.patientName,
        action: 'CONSENT_ACCEPT',
        resource_id: consent.id,
        resource_type: 'consent',
        timestamp: new Date().toISOString(),
        ip_address: ip,
      });

      setDone(true);
    } catch (e) {
      setError('Error al guardar la aceptación. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="material-icons-round animate-spin text-teal-500 text-4xl">refresh</span>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mb-4">
        <span className="material-icons-round text-rose-500 text-3xl">error_outline</span>
      </div>
      <h2 className="font-black text-xl text-slate-800 mb-2">Documento no disponible</h2>
      <p className="text-slate-500 text-center max-w-sm">{error}</p>
    </div>
  );

  if (done) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-emerald-50">
      <div className="w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-emerald-500/30">
        <span className="material-icons-round text-white text-4xl">task_alt</span>
      </div>
      <h2 className="font-black text-2xl text-emerald-800 mb-2">Consentimiento Registrado</h2>
      <p className="text-emerald-600 text-center max-w-sm">
        Tu aceptación ha sido guardada con marca de tiempo y respaldo digital.
      </p>
      <p className="mt-4 text-xs text-emerald-500">Código: {consent?.verificationCode}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="bg-teal-500 rounded-3xl p-6 text-white mb-6 text-center">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="material-icons-round text-3xl">health_and_safety</span>
          </div>
          <h1 className="font-black text-2xl">Consentimiento Informado</h1>
          <p className="text-teal-100 text-sm mt-1">
            Hola {consent?.patientName}, por favor lee y firma este documento
          </p>
        </div>

        {/* Texto del consentimiento */}
        <div className="bg-white rounded-3xl border-2 border-slate-100 p-6 mb-4">
          <h2 className="font-black text-slate-800 mb-4">Documento de Consentimiento</h2>
          <div className="bg-slate-50 rounded-2xl p-4 max-h-64 overflow-y-auto">
            <pre className="text-sm text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">
              {consent?.consentText}
            </pre>
          </div>
        </div>

        {/* Firma del paciente */}
        <div className="bg-white rounded-3xl border-2 border-slate-100 p-6 mb-4">
          <h3 className="font-black text-slate-800 mb-3">Firma Digital</h3>
          <p className="text-xs text-slate-500 mb-3">
            Dibuja tu firma en el recuadro (con el dedo o mouse)
          </p>
          <SignatureCanvas onCapture={setSignatureBase64} />
        </div>

        {/* Checkbox y aceptación */}
        <div className="bg-white rounded-3xl border-2 border-slate-100 p-6 mb-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              className="mt-1 w-5 h-5 accent-teal-500"
            />
            <span className="text-sm text-slate-700 leading-relaxed">
              He leído y comprendo el consentimiento informado. Acepto voluntariamente
              y autorizo el inicio del tratamiento. Esta aceptación quedará registrada
              con fecha, hora y dirección IP como respaldo legal.
            </span>
          </label>
        </div>

        <button
          onClick={handleAccept}
          disabled={!checked || submitting}
          className="w-full py-4 bg-teal-500 text-white rounded-2xl font-black text-base
            hover:bg-teal-600 transition-all disabled:opacity-50 shadow-xl shadow-teal-500/20
            flex items-center justify-center gap-2"
        >
          {submitting
            ? <><span className="material-icons-round animate-spin">sync</span>Guardando...</>
            : <><span className="material-icons-round">verified</span>Firmar y Aceptar</>
          }
        </button>
        <p className="text-center text-xs text-slate-400 mt-4">
          Protegido por la Ley 20.584 — Derechos y Deberes del Paciente
        </p>
      </div>
    </div>
  );
};
