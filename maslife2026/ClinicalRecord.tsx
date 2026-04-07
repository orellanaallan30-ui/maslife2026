import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useClinic } from '../ClinicContext';
import { Patient, SessionLog, Vitals } from '../types';

const ClinicalRecord: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { patients, setPatients, templates, setTemplates } = useClinic();

  const patient = patients.find(p => p.id === id);

  // Estados SOAP
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');

  // Estados de vitales
  const [vitals, setVitals] = useState<Vitals>({
    heartRate: 0,
    systolic: 0,
    diastolic: 0,
    temperature: 0,
    oxygenSaturation: 0,
    respiratoryRate: 0,
    weight: 0,
    height: 0,
    bmi: 0,
    glucose: 0
  });

  // Estados de bitácora
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [newLogNote, setNewLogNote] = useState('');
  const [newLogCodigo, setNewLogCodigo] = useState(''); // NUEVO: Código de atención

  // Estados de objetivos
  const [therapeuticGoals, setTherapeuticGoals] = useState('');

  useEffect(() => {
    if (patient) {
      setVitals(patient.vitals || {
        heartRate: 0,
        systolic: 0,
        diastolic: 0,
        temperature: 0,
        oxygenSaturation: 0,
        respiratoryRate: 0,
        weight: 0,
        height: 0,
        bmi: 0,
        glucose: 0
      });
      setSessionLogs(patient.sessionLogs || []);
    }
  }, [patient]);

  const handleSaveSOAP = () => {
    if (!patient) return;

    const updatedPatient: Patient = {
      ...patient,
      vitals,
      sessionLogs,
      // Guardar notas SOAP en customFields
      customFields: [
        ...patient.customFields.filter(f => !['Subjetivo', 'Objetivo', 'Evaluación', 'Plan'].includes(f.label)),
        { label: 'Subjetivo', value: subjective },
        { label: 'Objetivo', value: objective },
        { label: 'Evaluación', value: assessment },
        { label: 'Plan', value: plan }
      ]
    };

    setPatients(prev => prev.map(p => p.id === patient.id ? updatedPatient : p));
    alert('Ficha clínica guardada correctamente');
  };

  const handleAddSessionLog = () => {
    if (!newLogNote.trim()) return;

    const newLog: SessionLog = {
      id: `log-${Date.now()}`,
      date: new Date().toISOString(),
      note: newLogNote,
      codigoAtencion: newLogCodigo.trim() || undefined // NUEVO
    };

    setSessionLogs([...sessionLogs, newLog]);
    setNewLogNote('');
    setNewLogCodigo(''); // NUEVO: Reset
  };

  const handleEditLogCodigo = (logId: string, newCodigo: string) => {
    setSessionLogs(prev => prev.map(log =>
      log.id === logId ? { ...log, codigoAtencion: newCodigo } : log
    ));
  };

  // NUEVO: Función de exportación a PDF formal
  const exportToPDF = () => {
    if (!patient) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ficha Clínica - ${patient.name}</title>
  <style>
    @media print {
      @page { margin: 2cm; }
      body { margin: 0; padding: 0; }
    }
    
    body {
      font-family: 'Arial', sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #000;
      background: #fff;
      line-height: 1.6;
    }
    
    .header {
      text-align: center;
      border-bottom: 3px solid #00a89e;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    
    .header h1 {
      margin: 0;
      color: #00a89e;
      font-size: 24px;
      font-weight: bold;
    }
    
    .header p {
      margin: 5px 0;
      font-size: 12px;
      color: #666;
    }
    
    .section {
      margin-bottom: 20px;
      page-break-inside: avoid;
    }
    
    .section-title {
      font-size: 16px;
      font-weight: bold;
      color: #00a89e;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 1px solid #e0e0e0;
    }
    
    .patient-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 20px;
    }
    
    .info-item {
      padding: 5px;
    }
    
    .info-label {
      font-weight: bold;
      color: #333;
      display: inline;
    }
    
    .info-value {
      color: #666;
      display: inline;
      margin-left: 5px;
    }
    
    .vitals-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 15px;
    }
    
    .vital-item {
      border: 1px solid #e0e0e0;
      padding: 8px;
      border-radius: 4px;
    }
    
    .vital-label {
      font-size: 11px;
      color: #666;
      display: block;
      margin-bottom: 3px;
    }
    
    .vital-value {
      font-size: 14px;
      font-weight: bold;
      color: #000;
    }
    
    .soap-section {
      margin-bottom: 15px;
      padding: 10px;
      background: #f9f9f9;
      border-left: 3px solid #00a89e;
    }
    
    .soap-label {
      font-weight: bold;
      color: #00a89e;
      margin-bottom: 5px;
    }
    
    .soap-content {
      color: #333;
      white-space: pre-wrap;
    }
    
    .session-log {
      margin-bottom: 10px;
      padding: 10px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
    }
    
    .log-date {
      font-weight: bold;
      color: #00a89e;
      font-size: 12px;
    }
    
    .log-codigo {
      font-size: 11px;
      color: #666;
      font-style: italic;
      margin-top: 3px;
    }
    
    .log-note {
      margin-top: 5px;
      color: #333;
    }
    
    .footer {
      margin-top: 30px;
      text-align: center;
      font-size: 11px;
      color: #999;
      border-top: 1px solid #e0e0e0;
      padding-top: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>FICHA CLÍNICA</h1>
    <p>Clínica Mas Life | www.clinicamaslife.cl</p>
    <p>Fecha de emisión: ${new Date().toLocaleDateString('es-CL')}</p>
  </div>

  <div class="section">
    <div class="section-title">DATOS DEL PACIENTE</div>
    <div class="patient-info">
      <div class="info-item">
        <span class="info-label">Nombre:</span>
        <span class="info-value">${patient.name}</span>
      </div>
      <div class="info-item">
        <span class="info-label">RUT:</span>
        <span class="info-value">${patient.rut}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Edad:</span>
        <span class="info-value">${patient.age} años</span>
      </div>
      <div class="info-item">
        <span class="info-label">Género:</span>
        <span class="info-value">${patient.gender}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Previsión:</span>
        <span class="info-value">${patient.prevision}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Teléfono:</span>
        <span class="info-value">${patient.phone}</span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">SIGNOS VITALES</div>
    <div class="vitals-grid">
      <div class="vital-item">
        <span class="vital-label">Frecuencia Cardíaca</span>
        <div class="vital-value">${vitals.heartRate} lpm</div>
      </div>
      <div class="vital-item">
        <span class="vital-label">Presión Arterial</span>
        <div class="vital-value">${vitals.systolic}/${vitals.diastolic} mmHg</div>
      </div>
      <div class="vital-item">
        <span class="vital-label">Temperatura</span>
        <div class="vital-value">${vitals.temperature}°C</div>
      </div>
      <div class="vital-item">
        <span class="vital-label">Saturación O₂</span>
        <div class="vital-value">${vitals.oxygenSaturation}%</div>
      </div>
      <div class="vital-item">
        <span class="vital-label">Frecuencia Respiratoria</span>
        <div class="vital-value">${vitals.respiratoryRate || 0} rpm</div>
      </div>
      <div class="vital-item">
        <span class="vital-label">Peso</span>
        <div class="vital-value">${vitals.weight || 0} kg</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">NOTAS SOAP</div>
    ${subjective ? `<div class="soap-section"><div class="soap-label">S - Subjetivo</div><div class="soap-content">${subjective}</div></div>` : ''}
    ${objective ? `<div class="soap-section"><div class="soap-label">O - Objetivo</div><div class="soap-content">${objective}</div></div>` : ''}
    ${assessment ? `<div class="soap-section"><div class="soap-label">A - Evaluación</div><div class="soap-content">${assessment}</div></div>` : ''}
    ${plan ? `<div class="soap-section"><div class="soap-label">P - Plan</div><div class="soap-content">${plan}</div></div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">BITÁCORA DE SESIONES</div>
    ${sessionLogs.map(log => `
      <div class="session-log">
        <div class="log-date">${new Date(log.date).toLocaleDateString('es-CL')} - ${new Date(log.date).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</div>
        ${log.codigoAtencion ? `<div class="log-codigo">Código de atención: ${log.codigoAtencion}</div>` : ''}
        <div class="log-note">${log.note}</div>
      </div>
    `).join('')}
  </div>

  ${therapeuticGoals ? `
  <div class="section">
    <div class="section-title">OBJETIVOS TERAPÉUTICOS</div>
    <div class="soap-content">${therapeuticGoals}</div>
  </div>
  ` : ''}

  <div class="footer">
    <p>Documento generado por Clínica Mas Life | Sistema de gestión clínica</p>
    <p>Este documento contiene información confidencial del paciente</p>
  </div>
</body>
</html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  if (!patient) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <span className="material-icons-round text-6xl text-slate-300">person_off</span>
          <p className="mt-4 text-lg text-slate-600">Paciente no encontrado</p>
          <button onClick={() => navigate('/pro/patients')} className="mt-4 px-6 py-2 bg-teal-500 text-white rounded-xl">
            Volver a lista de pacientes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Header compacto */}
      <div className="bg-white border-b border-slate-200 p-5 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/pro/patients')} className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center">
              <span className="material-icons-round">arrow_back</span>
            </button>
            <div>
              <h1 className="text-2xl font-black">Ficha Clínica</h1>
              <p className="text-sm text-slate-600">{patient.name} • {patient.rut}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={exportToPDF} className="px-6 py-2 bg-slate-800 text-white rounded-xl font-black text-xs uppercase hover:bg-slate-700 flex items-center gap-2">
              <span className="material-icons-round text-sm">print</span>
              Exportar PDF
            </button>
            <button onClick={handleSaveSOAP} className="px-6 py-2 bg-teal-500 text-white rounded-xl font-black text-xs uppercase hover:bg-teal-600 flex items-center gap-2">
              <span className="material-icons-round text-sm">save</span>
              Guardar
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Signos Vitales - COMPACTO */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200">
            <h3 className="text-lg font-black mb-3 flex items-center gap-2">
              <span className="material-icons-round text-teal-500">favorite</span>
              Signos Vitales
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Frecuencia Cardíaca (lpm)</label>
                <input type="number" value={vitals.heartRate} onChange={e => setVitals({...vitals, heartRate: +e.target.value})} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Presión Arterial (mmHg)</label>
                <div className="flex gap-1">
                  <input type="number" value={vitals.systolic} onChange={e => setVitals({...vitals, systolic: +e.target.value})} placeholder="Sistólica" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                  <input type="number" value={vitals.diastolic} onChange={e => setVitals({...vitals, diastolic: +e.target.value})} placeholder="Diastólica" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Temperatura (°C)</label>
                <input type="number" step="0.1" value={vitals.temperature} onChange={e => setVitals({...vitals, temperature: +e.target.value})} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Saturación O₂ (%)</label>
                <input type="number" value={vitals.oxygenSaturation} onChange={e => setVitals({...vitals, oxygenSaturation: +e.target.value})} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
            </div>
          </div>

          {/* Objetivos Terapéuticos - COMPACTO */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200">
            <h3 className="text-lg font-black mb-3 flex items-center gap-2">
              <span className="material-icons-round text-teal-500">flag</span>
              Objetivos del Tratamiento
            </h3>
            <textarea
              value={therapeuticGoals}
              onChange={e => setTherapeuticGoals(e.target.value)}
              placeholder="Describe los objetivos terapéuticos..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 resize-none text-sm"
              rows={4}
            />
          </div>
        </div>

        {/* Notas SOAP */}
        <div className="mt-3 bg-white rounded-2xl p-5 border border-slate-200">
          <h3 className="text-lg font-black mb-3 flex items-center gap-2">
            <span className="material-icons-round text-teal-500">description</span>
            Notas SOAP
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">S - Subjetivo</label>
              <textarea value={subjective} onChange={e => setSubjective(e.target.value)} placeholder="¿Qué dice el paciente?" className="w-full px-3 py-2 rounded-xl border border-slate-200 resize-none text-sm" rows={3} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">O - Objetivo</label>
              <textarea value={objective} onChange={e => setObjective(e.target.value)} placeholder="¿Qué observas?" className="w-full px-3 py-2 rounded-xl border border-slate-200 resize-none text-sm" rows={3} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">A - Evaluación</label>
              <textarea value={assessment} onChange={e => setAssessment(e.target.value)} placeholder="¿Cuál es tu evaluación?" className="w-full px-3 py-2 rounded-xl border border-slate-200 resize-none text-sm" rows={3} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">P - Plan</label>
              <textarea value={plan} onChange={e => setPlan(e.target.value)} placeholder="¿Cuál es el plan de tratamiento?" className="w-full px-3 py-2 rounded-xl border border-slate-200 resize-none text-sm" rows={3} />
            </div>
          </div>
        </div>

        {/* Bitácora de Sesiones con Código de Atención */}
        <div className="mt-3 bg-white rounded-2xl p-5 border border-slate-200">
          <h3 className="text-lg font-black mb-3 flex items-center gap-2">
            <span className="material-icons-round text-teal-500">history</span>
            Bitácora de Sesiones
          </h3>

          {/* Agregar nueva sesión */}
          <div className="mb-4 p-3 bg-slate-50 rounded-xl">
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Código de Atención (opcional)</label>
                <input
                  type="text"
                  value={newLogCodigo}
                  onChange={e => setNewLogCodigo(e.target.value)}
                  placeholder="Ej: 06 01 105"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Nota de sesión</label>
                <textarea
                  value={newLogNote}
                  onChange={e => setNewLogNote(e.target.value)}
                  placeholder="Describe lo realizado en esta sesión..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 resize-none text-sm"
                  rows={2}
                />
              </div>
              <button onClick={handleAddSessionLog} className="px-4 py-2 bg-teal-500 text-white rounded-xl font-black text-xs uppercase hover:bg-teal-600">
                Agregar Sesión
              </button>
            </div>
          </div>

          {/* Lista de sesiones */}
          <div className="space-y-2">
            {sessionLogs.map(log => (
              <div key={log.id} className="p-3 border border-slate-200 rounded-xl hover:bg-slate-50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-bold text-teal-600">
                      {new Date(log.date).toLocaleDateString('es-CL')} - {new Date(log.date).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <label className="text-xs text-slate-500">Código:</label>
                      <input
                        type="text"
                        value={log.codigoAtencion || ''}
                        onChange={e => handleEditLogCodigo(log.id, e.target.value)}
                        placeholder="Ej: 06 01 105"
                        className="px-2 py-1 text-xs border border-slate-200 rounded-lg font-mono w-32"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-sm text-slate-700">{log.note}</p>
              </div>
            ))}
            {sessionLogs.length === 0 && (
              <p className="text-center text-slate-400 py-8">No hay sesiones registradas aún</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClinicalRecord;
