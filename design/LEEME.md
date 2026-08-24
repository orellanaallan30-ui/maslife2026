# Landing de profesionales — Agenda +Life

Diseño para `clinicamaslife.cl/unete`, la página donde los profesionales de
salud conocen la plataforma, revisan las tarifas y crean su cuenta.

---

## Qué contiene este paquete

| Archivo | Qué es |
|---|---|
| `landing-profesionales-agenda-life.html` | **El lienzo completo.** Ábrelo con doble clic en cualquier navegador: se ve el diseño y puedes exportar PNG/PDF. |
| `Main.dc.html` | Artboard 1 — Hero |
| `Beneficios.dc.html` | Artboard 2 — Beneficios y "cómo funciona" |
| `Tarifas.dc.html` | Artboard 3 — **Tarifas (sección nueva)** |
| `Acceso.dc.html` | Artboard 4 — Registro y login |
| `FAQ.dc.html` | Artboard 5 — Preguntas frecuentes y cierre |
| `canvas.json` | Posición de los artboards y las notas del lienzo |

Los `.dc.html` son las fuentes editables: de ahí se regenera el lienzo y de ahí
se traslada el diseño al código real (`ProLanding.tsx`).

**Versión online (editable y siempre actualizada):**
https://claude.ai/code/artifact/f8079434-7e73-4058-a34b-c5d89da52be8

---

## Identidad visual

Son los valores exactos que ya usa la landing en producción, no una
aproximación — así el diseño es comparable 1:1 con lo que está publicado.

| Elemento | Valor |
|---|---|
| Azul de marca | `#003366` |
| Naranjo de acción (CTA) | `#FF6B00` |
| Texto principal | `#111827` |
| Texto secundario | `#6B7280` |
| Bordes | `#E5E7EB` |
| Fondo de tarjetas | `#F8FAFC` |
| Tipografía | Inter |

Regla de color: **el naranjo es solo para acciones** (botones que el
profesional debe pulsar). El azul es marca y estructura. Si el naranjo aparece
en todas partes, deja de señalar dónde hacer clic.

---

## Tres decisiones que conviene que revises

### 1. Se agregó una sección de Tarifas

Hoy el precio de **$24.990/mes** aparece únicamente dentro de una respuesta del
FAQ. Un profesional que entra específicamente a "ver cuánto cuesta" no lo
encuentra sin abrir un acordeón.

La nueva sección muestra el plan, qué incluye, y resuelve las tres dudas de
dinero que frenan una suscripción:

- **¿A quién le llega la plata de mis pacientes?** → directo a tu MercadoPago;
  la plataforma no retiene tu dinero.
- **¿Me amarro?** → sin permanencia, cancelas desde el panel.
- **¿De quién son las fichas?** → tuyas, exportables, cifradas (Ley 21.719).

### 2. Se retiró la frase "Más de 30 profesionales ya utilizan Agenda +Life"

La base de datos tiene **3 profesionales** registrados.

Además de ser publicidad engañosa —lo fiscaliza el SERNAC—, es
contraproducente: el profesional se registra, entra al buscador, ve tres
nombres y siente que le mintieron justo en el momento en que debía empezar a
confiar.

Se reemplazó por ganchos que **sí son verdaderos** y funcionan igual de bien:
*sin tarjeta de crédito*, *sin permanencia*, *cancelas cuando quieras*, y el
respaldo de Clínica +Life.

Cuando tengas volumen real, se puede volver a poner una cifra.

### 3. El registro y el login llevan la marca "+Life"

Hoy están en color teal y dicen **"Agenda Maslife"**. El profesional hace clic
en un botón naranjo de "Agenda +Life"… y aterriza en otra marca, con otro
color. Ocurre justo en el punto de mayor compromiso del embudo.

En el diseño ambos van en azul/naranjo con "+Life", para que el recorrido se
sienta continuo.

---

## Pendiente: dos datos tuyos

En la sección de Tarifas quedaron dos marcadores. No los inventé porque
dependen de tu tarifa real:

- `[TU PRECIO POR SESIÓN]`
- `[N] sesiones` — cuántas sesiones cubren los $24.990 del plan

El argumento es simple y potente: *"si tu consulta vale X, el plan se paga con
las primeras N sesiones del mes; lo demás es ganancia"*. Necesita tus números
para funcionar.

---

## Alcance de un cambio de marca (importante)

El diseño usa **"Agenda +Life"** en la landing, el registro y el login.

Pero el nombre **"Agenda Maslife"** aparece en ~45 lugares de 20 archivos del
sistema, incluyendo:

- Los **consentimientos informados** que firman los pacientes, cuyo texto dice
  que autorizan registrar sus datos clínicos *"en el sistema Agenda Maslife,
  conforme a la Ley 20.584"*.
- Los **membretes de los PDF clínicos**.
- Los **correos** que reciben pacientes y profesionales.

Renombrar todo eso **no es un cambio de diseño**: toca documentos legales ya
firmados y por firmar. Merece una decisión aparte y, probablemente, revisión
legal.

Mientras tanto, la consecuencia asumida es que un profesional que se registra
en "+Life" recibirá correos y verá un panel que aún dicen "Agenda Maslife".

---

## Siguiente paso

Revisa el lienzo y ajusta lo que quieras. Cuando esté aprobado, el diseño se
traslada al código (`maslife2026/pages/ProLanding.tsx`, `ProfessionalRegistration.tsx`
y `ProfessionalLogin.tsx`) con la verificación habitual: TypeScript sin errores,
93 tests, build, y el límite de 12 funciones serverless de Vercel.
