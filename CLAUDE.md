# CLAUDE.md — Guía de trabajo: MasLife SaaS Médico

Proyecto: **clinicamaslife.cl** — Plataforma de gestión clínica para profesionales de salud en Chile.  
Stack: React 19 + Vite + TypeScript + Tailwind CSS + Supabase + Vercel Hobby  
Producción: rama `main` → Vercel auto-deploy → `clinicamaslife.cl`  
Rama de feature: `claude/analyze-test-coverage-48A8Z` → merge a `main` para deploy

---

## Estructura del proyecto

```
maslife2026/           ← Frontend React (Vite)
  pages/               ← 24 páginas (.tsx)
  components/          ← 5 componentes reutilizables
  ClinicContext.tsx    ← Estado global (pacientes, citas, transacciones)
  supabaseService.ts   ← ORM completo para Supabase
  types.ts             ← Interfaces TypeScript
  __tests__/           ← Tests unitarios (Vitest)

api/                   ← Serverless functions (Vercel)
  _lib/                ← Helpers compartidos (auth, booking, googleCalendar)
  *.ts                 ← Máximo 12 archivos (límite Vercel Hobby)
```

---

## Las 8 reglas que NUNCA deben romperse

### 1. Nunca error silencioso en persistencia
```typescript
// ❌ PROHIBIDO — causa pérdida silenciosa de datos
savePatient(p, proId).catch(() => {});

// ✅ CORRECTO — notificar al usuario si falla
savePatient(p, proId).catch(err => {
  console.error('[savePatient]', err?.message);
  addNotification(`⚠️ ${p.name} NO se guardó. Intenta de nuevo.`, 'appointment');
});
```

### 2. Nunca h-screen overflow-hidden en contenedores padre de páginas
```tsx
// ❌ PROHIBIDO — mata el scroll de todas las páginas hijas
<div className="h-screen overflow-hidden flex flex-col">

// ✅ CORRECTO — permite scroll interno en cada página
<div className="flex flex-col">          {/* padre */}
  <main className="flex-1 min-h-0 overflow-y-auto">  {/* hijo scrollable */}
```
Este patrón ha roto el registro móvil, fichas clínicas y agenda en múltiples ocasiones.

### 3. El monto de pago siempre en el servidor
```typescript
// ❌ PROHIBIDO — el cliente nunca debe enviar el precio
fetch('/api/process-payment', { body: JSON.stringify({ amount: 15000 }) })

// ✅ CORRECTO — el servidor calcula el precio desde la BD
// El cliente solo envía: professionalId + serviceName + fecha/hora
// /api/process-payment lee el precio desde professionals.services[]
```

### 4. Máximo 12 funciones serverless en /api/
```bash
ls api/*.ts | grep -v "_lib" | wc -l   # debe ser ≤ 12
```
Vercel Hobby tiene límite de 12 funciones. La 13+ rompe el deploy silenciosamente.  
Funciones actuales (12): admin-auth, ai-agent, book-appointment, clinical-agent,
google-calendar-sync, google-oauth, mp-oauth, mp-payments, mp-webhook, notify,
process-payment, web-search.

### 5. booking_source correcto en citas manuales
```typescript
// ✅ SIEMPRE en citas creadas por el profesional desde el panel
bookingSource: 'presencial'

// releaseStaleHolds() elimina citas con booking_source='web' + status='Pendiente'
// después de 5 minutos. Las citas 'presencial' están protegidas.
```

### 6. Merge de Supabase preserva datos locales no sincronizados
```typescript
// ✅ CORRECTO — en loadProData() de ClinicContext.tsx
setPatients(prev => {
  const supaIds = new Set(supaPatients.map(p => p.id));
  const localOnly = prev.filter(p => p.professionalId === proId && !supaIds.has(p.id));
  return [...supaPatients, ...localOnly]; // supabase es fuente de verdad + locales pendientes
});
```

### 7. CORS restringido en todos los endpoints API
```typescript
// ✅ CORRECTO
res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');

// ⚠️ EXCEPCIÓN — notify.ts permite '*' para webhooks externos (intencional, documentado)
```

### 8. Breakpoints: lg: es el único punto de quiebre principal
```tsx
// ❌ INCORRECTO — md: no es el breakpoint principal de este proyecto
<div className="md:grid-cols-3 md:flex-row">

// ✅ CORRECTO — lg: (≥1024px) es el breakpoint principal
<div className="grid-cols-1 lg:grid-cols-3 flex-col lg:flex-row">

// sm: y md: solo para ajustes tipográficos intermedios, no para layout
```

---

## Flujos críticos — no modificar sin plan previo

### Flujo de pago con MercadoPago
```
PatientProfile.startCheckoutPro()
  → POST /api/process-payment  (inserta cita como 'Pendiente', devuelve mp_init_point)
  → Redirect a MercadoPago
  → Paciente paga
  → MP redirige a /pro/:slug?mp_return=true
  → mp_return useEffect en PatientProfile
    → POST /api/book-appointment {action:'confirm', appointmentId, paymentId}
    → GET verificación contra MP API
    → POST /api/notify (profesional + paciente)
```

### Flujo de reserva sin pago
```
PatientProfile.finalizeBookingFree()
  → POST /api/book-appointment {action:'book', ...}
  → POST /api/notify (profesional + paciente si tiene email)
```

### Notificaciones email
```
/api/notify recibe: { to (email pro), patientEmail?, professionalName, patientName,
                      serviceName, date, time, type, duration, isReceipt? }
→ Envía SIEMPRE al profesional
→ Envía al paciente SI patientEmail está presente
→ Adjunta .ics calendar invite (excepto comprobantes de pago)
Requiere: RESEND_API_KEY en Vercel env vars
```

### Sincronización Google Calendar
```
supabaseService.saveAppointment()
  → syncToGoogleCalendar('upsert'|'delete', app)
  → /api/google-calendar-sync (requiere sesión Supabase activa del profesional)
Solo funciona cuando el profesional está autenticado (no para reservas anónimas de pacientes)
```

### Persistencia de datos (ClinicContext)
```
addPatient() → setPatients (React state) + localStorage + savePatient(Supabase) async
addAppointment() → setAppointments + localStorage + saveAppointment(Supabase) async
Ambos notifican si Supabase falla (no silencioso)
loadProData() en useEffect([loggedPro.id]) → merge Supabase + locales no sincronizados
```

### Auth admin
```
Token HMAC-SHA256, 8h TTL, verificación timing-safe
Login: POST /api/admin-auth {username, password}
Validación: GET /api/admin-auth (header: Authorization: Bearer <token>)
```

---

## Checklist pre-commit obligatorio

Antes de hacer `git commit` en cambios que afecten páginas, API o servicios:

```
[ ] cd maslife2026 && npm run lint           → sin errores TypeScript
[ ] cd maslife2026 && npm run test:run       → todos los tests pasan
[ ] ls api/*.ts | grep -v "_lib" | wc -l    → resultado ≤ 12
[ ] No hay .catch(() => {}) nuevos en save*/delete*/update* de Supabase
[ ] No se introdujo h-screen overflow-hidden en contenedores padre
[ ] Precios/montos solo se calculan en el servidor (nunca en el cliente)
[ ] Nuevas citas manuales usan bookingSource: 'presencial'
[ ] CORS sigue siendo 'https://clinicamaslife.cl' en endpoints nuevos
```

---

## Variables de entorno requeridas (Vercel)

| Variable | Uso |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave pública Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave admin para API serverless |
| `RESEND_API_KEY` | Envío de emails (notificaciones + .ics) |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD` + `ADMIN_JWT_SECRET` | Panel admin |
| `CLINIC_AUTH_CODE` | Código de acceso al registro de profesionales |
| `MERCADOPAGO_ACCESS_TOKEN` | Token plataforma MP |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | OAuth Google Calendar |
| `EMAIL_FROM` | Remitente de emails (default: notificaciones@clinicamaslife.cl) |

---

## Comandos frecuentes

```bash
# Desarrollo local
cd maslife2026 && npm run dev

# Verificar TypeScript
cd maslife2026 && npm run lint

# Tests
cd maslife2026 && npm run test:run

# Build de producción
cd maslife2026 && npm run build

# Deploy: merge a main y push
git checkout main-local && git merge claude/analyze-test-coverage-48A8Z --no-edit
git push -u origin main-local:main

# Auditoría de calidad completa pre-deploy
# /maslife-guard --pre-deploy
```

---

## Skill disponibles

| Skill | Uso |
|---|---|
| `/maslife-guard` | Auditoría de calidad pre-deploy (patrones peligrosos, TS, tests) |
| `/maslife-guard --fix` | Auditoría + auto-corrección de críticos |
| `/maslife-guard --pre-deploy` | Auditoría completa + build |
| `/ui-review` | Auditoría UI/UX mobile + desktop |
| `/ui-review --fix` | Auditoría UI + auto-corrección |
