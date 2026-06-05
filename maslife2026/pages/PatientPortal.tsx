import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

interface PortalData {
  patient: {
    name: string;
    rut: string;
    birthDate: string;
    gender: string;
    prevision: string;
    allergies: string[];
    diagnoses: string;
    medicalHistory: string;
    soap: Record<string, string> | null;
    lastVisit: string;
  };
  professionalName: string;
  professionalSpecialty: string;
  expiresAt: string;
}

const PatientPortal: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setError('Enlace inválido.'); setLoading(false); return; }
    supabase.rpc('get_patient_by_token', { p_token: token })
      .then(({ data: res, error: err }) => {
        if (err || !res) { setError('No se pudo cargar la información.'); return; }
        if (res.error) { setError(res.error); return; }
        setData(res as PortalData);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-sm w-full text-center space-y-4">
          <span className="material-icons-round text-5xl text-rose-400">link_off</span>
          <h1 className="text-xl font-black text-slate-900">Enlace no disponible</h1>
          <p className="text-sm text-slate-500">{error}</p>
          <p className="text-xs text-slate-400">Si crees que esto es un error, contacta a tu profesional de salud.</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { patient, professionalName, professionalSpecialty, expiresAt } = data;
  const soap = patient.soap || {};
  const expiryDate = new Date(expiresAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

  const soapLabels: Record<string, string> = {
    subjective: 'Subjetivo — Lo que reportas',
    objective: 'Objetivo — Hallazgos clínicos',
    assessment: 'Evaluación — Diagnóstico',
    plan: 'Plan — Tratamiento',
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <span className="material-icons-round text-primary text-lg">local_hospital</span>
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">Clínica Mas Life</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Portal de Paciente — Solo Lectura</p>
          </div>
        </div>
        <span className="text-[10px] text-slate-400">Acceso válido hasta {expiryDate}</span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        {/* Aviso */}
        <div className="bg-sky-50 border border-sky-200 rounded-2xl px-5 py-3 flex items-center gap-3">
          <span className="material-icons-round text-sky-500 text-lg">info</span>
          <p className="text-xs text-sky-700 font-medium">
            Este es tu registro clínico compartido por <strong>{professionalName}</strong> ({professionalSpecialty}). Es de solo lectura — conforme a la Ley 20.584.
          </p>
        </div>

        {/* Datos personales */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-4">
          <h2 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Datos del Paciente</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre" value={patient.name} />
            <Field label="RUT" value={patient.rut} />
            <Field label="Fecha de nacimiento" value={patient.birthDate ? new Date(patient.birthDate).toLocaleDateString('es-CL') : '—'} />
            <Field label="Género" value={patient.gender || '—'} />
            <Field label="Previsión" value={patient.prevision || '—'} />
            {patient.lastVisit && <Field label="Última visita" value={new Date(patient.lastVisit).toLocaleDateString('es-CL')} />}
          </div>
          {patient.allergies?.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Alergias</p>
              <div className="flex flex-wrap gap-2">
                {patient.allergies.map((a, i) => (
                  <span key={i} className="px-3 py-1 bg-rose-50 border border-rose-200 text-rose-700 rounded-full text-xs font-bold">{a}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Diagnóstico */}
        {patient.diagnoses && (
          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-3">
            <h2 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Diagnóstico</h2>
            <p className="text-sm text-slate-700 leading-relaxed">{patient.diagnoses}</p>
          </section>
        )}

        {/* Nota SOAP */}
        {Object.values(soap).some(v => v?.trim()) && (
          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-4">
            <h2 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Nota Clínica (SOAP)</h2>
            <div className="grid grid-cols-1 gap-4">
              {(['subjective', 'objective', 'assessment', 'plan'] as const).map(key =>
                soap[key]?.trim() ? (
                  <div key={key} className="space-y-1">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{soapLabels[key]}</p>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{soap[key]}</p>
                  </div>
                ) : null
              )}
            </div>
          </section>
        )}

        {/* Antecedentes */}
        {patient.medicalHistory?.trim() && (
          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-3">
            <h2 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Antecedentes Médicos</h2>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{patient.medicalHistory}</p>
          </section>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 py-4">
          Documento generado por Clínica Mas Life · <a href="/privacidad" className="underline hover:text-slate-600">Política de Privacidad</a> · Ley 20.584
        </p>
      </main>
    </div>
  );
};

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
    <p className="text-sm font-semibold text-slate-800">{value}</p>
  </div>
);

export default PatientPortal;
