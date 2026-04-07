# INSTRUCCIONES PARA MODIFICAR ClinicalRecord.tsx

## 1. COMPACTAR ESPACIOS

### Cambios en Signos Vitales (línea ~350):
```tsx
// ANTES:
<div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-lg">

// DESPUÉS:
<div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-lg">
```

### Cambios en Grid de Vitales:
```tsx
// ANTES:
<div className="grid grid-cols-2 md:grid-cols-4 gap-6">

// DESPUÉS:
<div className="grid grid-cols-2 md:grid-cols-5 gap-3">
```

### Cambios en Inputs de Vitales:
```tsx
// ANTES:
<input className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-lg">

// DESPUÉS:
<input className="w-full bg-slate-50 border-2 border-slate-200 rounded-lg px-3 py-2 text-base">
```

## 2. REDUCIR SECCIÓN OBJETIVOS TERAPÉUTICOS (línea ~450)

```tsx
// ANTES:
<div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-lg">

// DESPUÉS:
<div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-lg max-h-96 overflow-y-auto">
```

## 3. AGREGAR CÓDIGO DE ATENCIÓN EN BITÁCORA (línea ~600)

Encontrar la sección de `sessionLogs` y modificar:

```tsx
// AGREGAR al estado inicial:
const [sessionLogs, setSessionLogs] = useState<SessionLog[]>(safePatient.sessionLogs || [
  { id: 'sl1', date: '2024-05-10', note: 'Sesión de evaluación inicial.', codigoAtencion: '06 01 105' }
]);

// MODIFICAR el render de cada log:
{sessionLogs.map((log, i) => (
  <div key={log.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
    <div className="flex justify-between items-start mb-3">
      <div>
        <p className="text-xs font-black text-slate-500 uppercase tracking-wider">
          {new Date(log.date).toLocaleDateString('es-ES')}
        </p>
        {/* AGREGAR ESTA SECCIÓN: */}
        <div className="flex gap-3 items-center mt-2">
          <label className="text-xs font-bold text-slate-500">Código Atención:</label>
          <input
            type="text"
            value={log.codigoAtencion || '06 01 105'}
            onChange={(e) => {
              const updated = [...sessionLogs];
              updated[i] = { ...updated[i], codigoAtencion: e.target.value };
              setSessionLogs(updated);
              setIsDirtyTrue();
            }}
            placeholder="06 01 105"
            className="w-32 bg-white border-2 border-slate-200 rounded-lg px-3 py-1.5 font-mono text-sm focus:border-teal-500 transition-all"
          />
        </div>
      </div>
      {/* ... resto del código ... */}
    </div>
    <p className="text-sm text-slate-700 font-medium">{log.note}</p>
  </div>
))}
```

## 4. AGREGAR TIPO AL INTERFACE SessionLog (types.ts)

```tsx
// EN types.ts agregar:
export interface SessionLog {
  id: string;
  date: string;
  note: string;
  codigoAtencion?: string; // AGREGAR ESTA LÍNEA
}
```

## 5. FUNCIÓN DE EXPORTACIÓN PDF (agregar después de línea 250)

```tsx
const exportToPDF = () => {
  const doc = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Ficha Clínica - ${personalData.name}</title>
  <style>
    @page { margin: 2cm; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      max-width: 210mm;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #14b8a6;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 { color: #14b8a6; margin: 0; font-size: 28px; }
    .section { margin: 30px 0; }
    .section h2 {
      background: #f1f5f9;
      padding: 12px 16px;
      margin: 0 0 15px 0;
      border-left: 4px solid #14b8a6;
      font-size: 18px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 12px;
      text-align: left;
    }
    th {
      background: #f8fafc;
      font-weight: 700;
    }
    @media print {
      body { padding: 0; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Ficha Clínica</h1>
    <p><strong>${personalData.name}</strong></p>
    <p>RUT: ${personalData.rut} | Edad: ${personalData.age} años</p>
    <p>Generado: ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
  </div>

  <div class="section">
    <h2>Datos Personales</h2>
    <table>
      <tr><th>Previsión</th><td>${personalData.prevision}</td></tr>
      <tr><th>Diagnóstico</th><td>${personalData.diagnoses}</td></tr>
      <tr><th>Teléfono</th><td>${personalData.phone}</td></tr>
      <tr><th>Email</th><td>${personalData.email}</td></tr>
      <tr><th>Dirección</th><td>${personalData.address}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Signos Vitales</h2>
    <table>
      <tr>
        <th>FC</th><th>PA</th><th>SatO2</th><th>Temp</th><th>FR</th>
      </tr>
      <tr>
        <td>${vitals.heartRate} lpm</td>
        <td>${vitals.systolic}/${vitals.diastolic} mmHg</td>
        <td>${vitals.oxygenSaturation}%</td>
        <td>${vitals.temperature}°C</td>
        <td>${vitals.respiratoryRate || 'N/A'} rpm</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>Anamnesis</h2>
    <p>${anamnesis || 'No registrada'}</p>
  </div>

  <div class="section">
    <h2>Notas SOAP</h2>
    <p><strong>Subjetivo:</strong> ${soap.subjective || 'N/A'}</p>
    <p><strong>Objetivo:</strong> ${soap.objective || 'N/A'}</p>
    <p><strong>Evaluación:</strong> ${soap.assessment || 'N/A'}</p>
    <p><strong>Plan:</strong> ${soap.plan || 'N/A'}</p>
  </div>

  <div class="section">
    <h2>Bitácora de Sesiones</h2>
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Código Atención</th>
          <th>Notas</th>
        </tr>
      </thead>
      <tbody>
        ${sessionLogs.map(log => `
          <tr>
            <td>${new Date(log.date).toLocaleDateString('es-CL')}</td>
            <td><strong>${log.codigoAtencion || 'N/A'}</strong></td>
            <td>${log.note}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>Objetivos Terapéuticos</h2>
    <table>
      <thead>
        <tr>
          <th>Objetivo</th>
          <th>Progreso</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${goals.map(g => `
          <tr>
            <td><strong>${g.name}</strong><br><small>${g.description}</small></td>
            <td>${g.progress}%</td>
            <td>${g.status}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
    <p>Plataforma Maslife · clinicamaslife.cl</p>
  </div>
</body>
</html>
  `.trim();

  const blob = new Blob([doc], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ficha-clinica-${personalData.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.html`;
  a.click();
  URL.revokeObjectURL(url);
};
```

## 6. AGREGAR BOTÓN DE EXPORTACIÓN (en la sección de botones superiores)

```tsx
// Encontrar la sección con botones de acción y agregar:
<button
  onClick={exportToPDF}
  className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-emerald-600 transition-all shadow-lg flex items-center gap-2"
>
  <span className="material-icons-round text-sm">download</span>
  Exportar PDF
</button>
```

## RESUMEN DE CAMBIOS

✅ Reducir padding de p-8 a p-5 en todos los recuadros principales
✅ Reducir gap de gap-6 a gap-3 en grids
✅ Cambiar rounded-3xl a rounded-2xl para elementos internos
✅ Agregar codigoAtencion editable en bitácora
✅ Agregar función exportToPDF() completa
✅ Agregar botón de exportación
✅ Actualizar interface SessionLog en types.ts

Estos cambios mantendrán toda la funcionalidad mientras reducen el espacio visual y agregan las características solicitadas.
