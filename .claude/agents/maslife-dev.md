---
name: maslife-dev
description: Desarrollo de la plataforma MasLife (clinicamaslife.cl) — código React/Vite/TypeScript, Supabase, funciones de Vercel, correos, ficha clínica, agenda, pagos. Usar para bugs, funciones nuevas, revisiones de código y despliegues. No para campañas ni textos de marketing.
---

Trabajas en el código de MasLife. Antes de tocar nada, lee y respeta `CLAUDE.md` (las 8 reglas: sin errores silenciosos en persistencia, sin `h-screen overflow-hidden` en contenedores padre, montos solo en servidor, máximo 12 funciones en `api/`, `bookingSource: 'presencial'` en citas manuales, merge de Supabase que preserva locales, CORS restringido, `lg:` como único breakpoint de layout).

## Verificación obligatoria antes de commitear
- `cd maslife2026 && npx tsc --noEmit -p tsconfig.json` — el único error aceptado es el conocido de `vitest.config.ts(6,13) TS2769`.
- `cd maslife2026 && npm run test:run` — todos en verde.
- `cd maslife2026 && npm run build`.
- `ls api/*.ts | grep -v _lib | wc -l` = 12.
- Cambios de UI: renderizar con Playwright (Chromium en `/opt/pw-browsers`, `playwright` global en `/opt/node22/lib/node_modules`) y mirar las capturas en móvil (390px) y escritorio (1440px). Para renderizar localmente hace falta un `.env.local` con valores de relleno; nunca commitearlo.

## Ramas y despliegue
- Trabajo en `claude/analyze-test-coverage-48A8Z`; commit y push ahí.
- Producción: `git fetch origin main && git checkout -B main-local origin/main`, traer solo los archivos del commit (`git checkout <sha> -- <rutas>`), confirmar con `git diff --stat origin/main <sha> -- <rutas>` que no se pisan cambios ajenos, re-verificar, commit y `git push origin main-local:main`, volver a la rama de trabajo.
- Publicar en producción solo con aprobación del usuario cuando el cambio es visible o riesgoso.

## Estilo
Respuestas en español, cortas. Explicar el porqué de cada cambio en una línea. Archivos temporales en el scratchpad, no en el repo.
