---
name: ui-review
description: Auditoría profesional de diseño UI/UX de MasLife (mobile + desktop) — consistencia de marca, patrones estructurales, accesibilidad y sistema de color/tipografía. Usar cuando el usuario pida "auditoría de diseño", "revisión UI/UX", o quiera evaluar la consistencia visual de la plataforma antes de escalar o mostrarla a terceros.
---

# ui-review

Auditoría de diseño UI/UX de la plataforma MasLife, en la línea de la que se hizo
en la sesión que originó este skill (ver el historial de commits con mensaje
"Auditoría de diseño P0/P1/P2..." para ejemplos reales de alcance y formato).

## Argumentos

- Sin argumentos: solo audita y entrega un informe (no modifica nada).
- `--fix`: después de auditar, aplica las correcciones de los hallazgos que sean
  seguras de corregir mecánicamente (ver abajo), empezando por los más críticos.

## Enfoque

Lanza 2-3 agentes `Explore` de solo lectura EN PARALELO (un único mensaje, varias
llamadas a la herramienta `Agent`), cada uno con un eje distinto para evitar
solapamiento:

1. **Marca y consistencia visual**: uso de la paleta de marca (`primary`/`teal`)
   vs. la paleta default de Tailwind (`emerald`/`rose`/`amber`/`sky`) sin
   criterio semántico; tokens de `tailwind.config.js` declarados pero sin uso
   real (código muerto); radios (`rounded-[...]`) y sombras (`shadow-[...]`)
   arbitrarias repetidas sin nombrar como tokens del theme; nombre de marca
   inconsistente en texto/alt de imágenes visible al usuario (recuerda: este
   proyecto tiene DOS marcas reales — "Clínica Mas Life" para la landing
   pública/marketing, "Agenda Maslife" para el panel profesional/agenda y el
   flujo de reserva del paciente — no asumas que es un error unificar a una
   sola sin confirmar con el usuario primero).

2. **Patrones estructurales prohibidos** (las 8 reglas de `CLAUDE.md`): grep
   exhaustivo de `h-screen` + `overflow-hidden` en contenedores padre de
   páginas; `md:grid-cols`/`md:flex-row`/`md:flex-col` usados para layout en
   vez de `lg:` (Regla #8); `.catch(() => {})` vacíos en operaciones
   save/delete/update de Supabase (Regla #1).

3. **Accesibilidad y UX de flujos críticos**: `aria-label` en botones ícono-solo
   (especialmente filas de acciones en tablas/paneles admin); `htmlFor`/`id` en
   labels de formularios de alto tráfico (registro, booking, consentimiento);
   controles interactivos visibles solo con `:hover` (inutilizables en tablet
   táctil — común en consultas clínicas); tamaños de touch target bajo 24px;
   contraste de texto secundario (`text-slate-300`/`text-slate-400` u
   equivalentes); estados de carga/disabled en botones de acciones críticas
   (pago, firma, guardar ficha, acciones admin) para evitar doble-submit.

Cada agente reporta hallazgos con archivo:línea real, severidad
(crítico/alto/medio/bajo) y recomendación concreta — nunca inventar hallazgos
sin verificar el código exacto.

## Síntesis

Consolida los reportes en un documento con: resumen ejecutivo (3-4 hallazgos más
importantes), sección de fortalezas ya existentes (para no dar una imagen solo
negativa — el patrón correcto casi siempre ya existe en algún lugar del código,
solo falta aplicarlo parejo), hallazgos por severidad, y una hoja de ruta
priorizada en tandas (P0 = riesgo legal/datos, P1 = estructural/estabilidad,
P2 = sistema de diseño/accesibilidad, P3 = housekeeping menor).

Publica el informe como un Artifact HTML (cargar el skill `artifact-design`
antes de escribir el HTML) — organizado por severidad, con fragmentos de código
como evidencia, fácil de compartir con el equipo.

## Qué se corrige con `--fix`

Solo las correcciones puntuales y verificables, nunca un rediseño:
- `disabled` real + estado de carga en botones de acciones críticas que ya
  tienen el patrón correcto en otro lugar del mismo archivo (replicar, no
  inventar un patrón nuevo).
- `aria-label` en botones ícono-solo, usando el mismo texto que ya tienen en
  `title` si existe.
- `htmlFor`/`id` en labels que son hermanos de su input (no los que ya envuelven
  su input — esos ya son accesibles de forma implícita).
- Nombrar como tokens del theme (`tailwind.config.js`) los valores arbitrarios
  de `rounded-[...]`/`shadow-[...]` que se repiten 2+ veces exactamente iguales
  — sin cambiar el resultado visual. Los valores realmente únicos (una sola
  aparición) se dejan como están.
- Migración `md:` → `lg:` en clases de layout (grid-cols, flex-direction),
  eliminando el paso intermedio si ya hay un `lg:` en la cadena.

Los cambios de sistema de color (redefinir qué significa cada color), rediseño
de layout, o decisiones de qué marca usar en qué pantalla requieren confirmar
con el usuario antes de aplicar — no son mecánicos.

## Verificación tras aplicar --fix

`npm run lint && npm run test:run && npm run build` desde `maslife2026/`, más
revisión visual de las pantallas tocadas en 768px y 1024px si el cambio afecta
breakpoints o radios/sombras.
