import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { PublicVerificationResult } from '../types_clinical';
import { auditService } from '../auditService';

// ── Componente: Verificador Público de Documentos ──────────────────────────────
// Esta página es 100% pública — no requiere login.
// Solo muestra datos NO sensibles. Sin RUT, sin contenido clínico.
const DocumentVerifier: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const [result, setResult] = useState<PublicVerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) { setError('Código no especificado.'); setLoading(false); return; }
    verify(code);
  }, [code]);

  const verify = async (verificationCode: string) => {
    try {
      // Llama a la función Postgres que devuelve datos seguros (sin info sensible)
      const { data, error } = await supabase.rpc('verify_document_public', {
        p_code: verificationCode
      });

      if (error) throw error;

      if (!data || !data.isValid) {
        setResult({ isValid: false } as PublicVerificationResult);
      } else {
        setResult(data as PublicVerificationResult);
      }

      // Registrar intento de verificación (sin datos sensibles)
      auditService.log({
        userId: 'public',
        userName: 'Verificación Pública',
        action: 'DOCUMENT_VERIFY',
        resourceId: verificationCode,
        resourceType: 'document',
        details: { valid: data?.isValid || false },
      });
    } catch (e) {
      setError('No se pudo verificar el documento. Intenta más tarde.');
    } finally {
      setLoading(false);
    }
  };

  // ── Estados UI ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
      <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      <p className="font-bold text-slate-500">Verificando autenticidad del documento...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8">
      <div className="bg-white rounded-3xl border-2 border-rose-100 p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="material-icons-round text-rose-500 text-3xl">wifi_off</span>
        </div>
        <h2 className="font-black text-xl text-slate-800 mb-2">Error de conexión</h2>
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 flex flex-col items-center">
      {/* Branding */}
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-teal-500 w-10 h-10 rounded-xl flex items-center justify-center">
          <span className="material-icons-round text-white text-xl">medical_services</span>
        </div>
        <span className="font-black text-xl text-slate-800">AgendaMaslife</span>
      </div>

      <div className="w-full max-w-md">
        {result?.isValid ? (
          // ── DOCUMENTO VÁLIDO ──────────────────────────────────────────────
          <div className="bg-white rounded-3xl border-2 border-emerald-200 overflow-hidden shadow-xl">
            {/* Badge superior */}
            <div className="bg-emerald-500 px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <span className="material-icons-round text-white text-xl">verified</span>
              </div>
              <div>
                <p className="font-black text-white text-lg">Documento Auténtico</p>
                <p className="text-emerald-100 text-xs">Verificado en la plataforma AgendaMaslife</p>
              </div>
            </div>

            <div className="p-6 flex flex-col gap-4">
              {/* Tipo de documento */}
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-xs font-black text-slate-500 uppercase mb-1">Tipo de Documento</p>
                <p className="font-bold text-slate-800">{result.documentType}</p>
              </div>

              {/* Grid de datos */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-xs font-black text-slate-500 uppercase mb-1">Profesional</p>
                  <p className="font-bold text-slate-800 text-sm">{result.issuerName}</p>
                  <p className="text-xs text-slate-500">{result.issuerSpecialty}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-xs font-black text-slate-500 uppercase mb-1">Paciente</p>
                  <p className="font-bold text-slate-800 text-sm">
                    Iniciales: {result.patientInitials}
                  </p>
                  <p className="text-xs text-slate-500 italic">Datos protegidos</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-xs font-black text-slate-500 uppercase mb-1">Fecha de Atención</p>
                  <p className="font-bold text-slate-800 text-sm">{result.sessionDate}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-xs font-black text-slate-500 uppercase mb-1">Emitido</p>
                  <p className="font-bold text-slate-800 text-sm">{result.generatedAt}</p>
                </div>
              </div>

              {/* Integridad del hash */}
              <div className={`rounded-2xl p-4 flex items-center gap-3
                ${result.hashMatch ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
                <span className={`material-icons-round text-xl
                  ${result.hashMatch ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {result.hashMatch ? 'security' : 'warning'}
                </span>
                <div>
                  <p className={`text-sm font-black ${result.hashMatch ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {result.hashMatch ? 'Integridad verificada' : 'Hash no disponible'}
                  </p>
                  <p className={`text-xs ${result.hashMatch ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {result.hashMatch
                      ? 'El documento no ha sido modificado desde su firma'
                      : 'No se pudo verificar la integridad del contenido'}
                  </p>
                </div>
              </div>

              {/* Código de verificación */}
              <div className="border-t-2 border-dashed border-slate-100 pt-4 text-center">
                <p className="text-xs text-slate-400 mb-1">Código de verificación</p>
                <p className="font-mono font-black text-slate-600 tracking-widest">{code}</p>
                <p className="text-xs text-slate-400 mt-2">
                  Esta verificación fue registrada con marca de tiempo en el log de auditoría
                </p>
              </div>
            </div>
          </div>
        ) : (
          // ── DOCUMENTO NO ENCONTRADO / INVÁLIDO ───────────────────────────
          <div className="bg-white rounded-3xl border-2 border-rose-200 overflow-hidden shadow-xl">
            <div className="bg-rose-500 px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <span className="material-icons-round text-white text-xl">gpp_bad</span>
              </div>
              <div>
                <p className="font-black text-white text-lg">Documento No Verificado</p>
                <p className="text-rose-100 text-xs">No se encontró en nuestra base de datos</p>
              </div>
            </div>
            <div className="p-6 text-center">
              <p className="text-slate-600 text-sm mb-4">
                El código <span className="font-mono font-black text-slate-800">{code}</span> no
                corresponde a ningún documento válido o activo en AgendaMaslife.
              </p>
              <div className="bg-rose-50 rounded-2xl p-4 text-left">
                <p className="text-xs font-black text-rose-700 mb-2">Posibles causas:</p>
                <ul className="text-xs text-rose-600 space-y-1 list-disc list-inside">
                  <li>El código fue ingresado incorrectamente</li>
                  <li>El documento fue generado en otro sistema</li>
                  <li>El documento no ha sido firmado digitalmente</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Footer legal */}
        <p className="text-center text-xs text-slate-400 mt-6 max-w-sm">
          Sistema de verificación de AgendaMaslife. Los datos clínicos no se muestran públicamente
          en cumplimiento de la Ley 20.584 y la Ley 19.628 de Protección de Datos Personales.
        </p>
      </div>
    </div>
  );
};

export default DocumentVerifier;
