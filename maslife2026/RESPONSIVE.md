# Convención Responsive — Clínica Mas Life

> Regla única para que **un fix móvil nunca rompa escritorio** (ni al revés).

## La regla de oro: mobile-first con `lg:` como único quiebre de layout

```
clase-base   →  MÓVIL      (< 1024px)   ← siempre se escribe primero
lg:clase     →  ESCRITORIO (≥ 1024px)
```

- **La clase sin prefijo SIEMPRE describe el móvil.** Diseña móvil primero, luego agrega `lg:` para escritorio.
- **El cambio de columnas/grids ocurre SOLO en `lg:`.** Nunca uses `md:` para pasar de 1 a varias columnas.
- `sm:` / `md:` solo para ajustes finos progresivos (tamaño de fuente, gap), **nunca** para el cambio estructural de layout.

## El error que causaba los conflictos

❌ **Padre e hijo en breakpoints distintos:**
```tsx
<div className="flex flex-col lg:flex-row">   {/* cambia a 1024px */}
  <div className="md:flex-1">                 {/* se activa a 768px ← DESAJUSTE */}
```
Entre 768–1024px el hijo recibe `flex-1` pero el padre aún es columna. Resultado: layout roto en tablet/escritorio chico.

✅ **Padre e hijo en el mismo breakpoint:**
```tsx
<div className="flex flex-col lg:flex-row">
  <div className="lg:flex-1">                 {/* coincide con el padre */}
```

## Tamaños de referencia

| Elemento | Móvil (base) | Escritorio (`lg:`) |
|----------|--------------|--------------------|
| Título hero | `text-[clamp(2.9rem,10vw,5.5rem)]` | `lg:text-[clamp(4rem,6vw,7.5rem)]` |
| H2 sección | `text-2xl` / `clamp(2rem,5vw,3.4rem)` | crece solo con clamp |
| Body | `text-base` | `lg:text-xl` |
| Badge | `text-[.6rem]` | `lg:text-xs` |
| Padding lateral | `px-[6vw]` (unificado en todo el sitio) | igual |
| Grids | `grid-cols-1` o `grid-cols-2` | `lg:grid-cols-3` / `lg:grid-cols-4` |

## Checklist antes de cada deploy

- [ ] ¿Cada `lg:flex-row` tiene hijos con `lg:` (no `md:`)?
- [ ] ¿El título hero se lee bien en 390px y no se desborda en 1920px?
- [ ] ¿Los grids colapsan a 1 columna en móvil?
- [ ] ¿El logo/nav caben en su altura (no se desbordan)?
- [ ] ¿`npm run build` sin errores?

## Nota sobre verificación visual

El sitio usa **Tailwind por CDN** (`cdn.tailwindcss.com` en `index.html`), no compilado por Vite.
Para revisar visualmente: `npm run dev` y usa el modo responsive de DevTools (390px, 1280px, 1920px).
