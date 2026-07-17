---
name: maslife-guard
description: Auditoría de calidad pre-deploy para MasLife — verifica TypeScript, tests, límite de funciones API, y los patrones peligrosos documentados en las 8 reglas de CLAUDE.md. Usar antes de hacer merge a main o cuando el usuario pida "revisar antes de desplegar" / "auditoría de calidad".
---

# maslife-guard

Auditoría mecánica de calidad para el proyecto MasLife (`clinicamaslife.cl`), antes de
desplegar a producción. Reproduce el "Checklist pre-commit obligatorio" de
`CLAUDE.md` más una verificación de los patrones prohibidos por las 8 reglas del
proyecto.

## Argumentos

- Sin argumentos: solo audita y reporta hallazgos (no modifica nada).
- `--fix`: además de auditar, corrige automáticamente los hallazgos críticos que
  sean seguros de corregir mecánicamente (ver "Qué se corrige con --fix" abajo).
- `--pre-deploy`: además de la auditoría, corre `npm run build` como verificación
  final antes de un deploy.

## Pasos

Ejecuta desde `maslife2026/` (`cd maslife2026` si no estás ahí ya):

1. **TypeScript**: `npm run lint` — reporta errores reales, pero ignora el error
   preexistente y conocido de `vitest.config.ts` (conflicto de tipos entre la
   versión de Vite de `vitest` y la del proyecto — no es un bug real, no se
   puede arreglar sin actualizar dependencias).
2. **Tests**: `npm run test:run` — deben pasar 64/64 (o el número vigente).
3. **Límite de funciones API** (Vercel Hobby = máx. 12): `ls ../api/*.ts | grep -v _lib | wc -l`.
   Si el resultado es 13 o más, es un hallazgo **crítico** — el deploy rompe en
   silencio.
4. **Regla #1 — errores silenciosos en persistencia**: grep de
   `.catch(() => {})` / `.catch(()=>{})` en todo `pages/**/*.tsx`, `components/**/*.tsx`,
   `ClinicContext.tsx`, `supabaseService.ts`. Para cada match, lee el contexto:
   si protege una llamada real a `save*/delete*/update*` de Supabase (no una
   lectura GET ni un email de notificación fire-and-forget), es un hallazgo
   **crítico** — puede perder datos del paciente/profesional sin avisar.
5. **Regla #2 — `h-screen overflow-hidden` en contenedores padre**: grep de
   `h-screen` en `App.tsx` y páginas. Si aparece combinado con `overflow-hidden`
   en un contenedor que envuelve rutas/páginas completas (no un loader o estado
   de error aislado de pantalla completa), es **crítico** — mata el scroll de
   las páginas hijas. Nota: `App.tsx` ya tiene una red de seguridad centralizada
   (líneas ~525 y ~161, `overflow-y-auto`) que resuelve la mayoría de los casos;
   verifica que siga intacta.
6. **Regla #8 — `lg:` como único breakpoint de layout**: grep de
   `md:grid-cols`, `md:flex-row`, `md:flex-col` en `pages/**/*.tsx` y
   `components/**/*.tsx`. Cualquier resultado es un hallazgo **alto** — el
   layout cambia en un rango de viewport no contemplado por la regla.
7. **Regla #3 — precio calculado en el cliente**: grep de patrones como
   `amount:` o `price:` con un valor numérico literal en llamadas `fetch` a
   `/api/process-payment` o similar. Si el cliente envía el monto en vez de que
   el servidor lo calcule desde `professionals.services[]`, es **crítico**.
8. **Regla #5 — `booking_source` en citas manuales**: si tocaste código de
   creación de citas desde el panel del profesional, verifica que use
   `bookingSource: 'presencial'` (no `'web'`).
9. **Regla #7 — CORS**: en cualquier endpoint nuevo bajo `api/*.ts`, confirma
   `Access-Control-Allow-Origin: 'https://clinicamaslife.cl'` (excepción
   documentada: `notify.ts` usa `'*'` a propósito, para webhooks externos).

## Qué se corrige con `--fix`

Solo lo mecánicamente seguro, sin cambiar comportamiento intencional:
- Reemplazo directo de `.catch(() => {})` vacío por un `.catch(err => { console.error(...); addNotification(...) })` siguiendo el patrón ya usado en `ClinicContext.tsx` (`notifyWriteError`) — **solo** si protege una escritura real de Supabase.
- Migración mecánica de `md:grid-cols-N`/`md:flex-row`/`md:flex-col` a `lg:` (eliminando el paso intermedio si ya existe un `lg:` en la misma cadena de clases).

Lo demás (h-screen/overflow-hidden, límite de funciones API, precio en cliente)
requiere criterio humano o un cambio más profundo — repórtalo pero no lo
apliques automáticamente sin confirmar con el usuario.

## Salida

Reporta en español, agrupado por regla, cada hallazgo con archivo:línea y
severidad (crítico/alto/medio). Si todo pasa, dilo explícitamente ("Sin
hallazgos — listo para deploy") en vez de quedarte en silencio.

Con `--pre-deploy`, corre `npm run build` al final y reporta si compila limpio.
