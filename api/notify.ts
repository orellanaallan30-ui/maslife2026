import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

function verifyAdminJwt(token: string, secret: string): boolean {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return false;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() > decoded.exp) return false;
    const expected = createHmac('sha256', secret).update(payload).digest('base64url');
    const a = Buffer.from(sig); const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch { return false; }
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

const ipCounts = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(headers: VercelRequest['headers'], max: number, windowMs: number): boolean {
  const forwarded = headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : (forwarded || 'unknown')).split(',')[0].trim();
  const now = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    ipCounts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

// Email del remitente/organizador se toma del campo `to` (email del profesional)
// para que los RSVP del paciente lleguen directamente al profesional, no a un buzón sin configurar.
const FALLBACK_ORGANIZER = 'notificaciones@clinicamaslife.cl';

// Genera una invitación iCalendar (.ics) tiempo flotante (sin TZ) con ORGANIZER + ATTENDEE,
// para que Gmail/Outlook la muestren como invitación interactiva y la agenden automáticamente.
function generateIcs(p: {
  date: string; time: string; duration: number;
  summary: string; description: string; uid: string;
  organizerName: string; organizerEmail?: string;
  attendeeName: string; attendeeEmail: string;
}): string {
  const { date, time, duration, summary, description, uid, organizerName, attendeeName, attendeeEmail } = p;
  const [yyyy, mm, dd] = date.split('-');
  const [hh, min] = time.split(':');
  const startDt = `${yyyy}${mm}${dd}T${hh}${min}00`;

  // Aritmética pura — sin new Date() para evitar conversión UTC que desplaza la hora
  const startMinutes = parseInt(hh) * 60 + parseInt(min);
  const endTotalMinutes = startMinutes + duration;
  const endH = String(Math.floor(endTotalMinutes / 60) % 24).padStart(2, '0');
  const endM = String(endTotalMinutes % 60).padStart(2, '0');
  const endDt = `${yyyy}${mm}${dd}T${endH}${endM}00`;

  const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  // RFC 5545: escapar \ primero, luego , y ; y newlines
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, c => `\\${c}`).replace(/\n/g, '\\n');
  // CN (nombre) no debe contener comas/dobles comillas sin escapar
  const escCn = (s: string) => (s || '').replace(/[\\;,:"]/g, ' ').trim();

  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Clinica Maslife//AgendaMaslife//ES',
    'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${startDt}`,
    `DTEND:${endDt}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    `ORGANIZER;CN=${escCn(organizerName)}:mailto:${p.organizerEmail || FALLBACK_ORGANIZER}`,
    `ATTENDEE;CN=${escCn(attendeeName)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendeeEmail}`,
    'SEQUENCE:0',
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(summary)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

// Escapa entidades HTML para evitar inyección de HTML/scripts en los correos
// (los nombres, servicios, etc. provienen de input del usuario sin confianza)
function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Elimina saltos de línea para evitar header injection en asuntos de correo
function cleanLine(str: unknown): string {
  return String(str ?? '').replace(/[\r\n]+/g, ' ').trim();
}

// ── Tokens de marca para los correos ─────────────────────────────────────────
// Paleta alineada al frontend, con una distinción que en pantalla no hace falta
// pero en correo sí: el turquesa de marca sirve para rellenos, no para texto.
const BRAND_TEAL = '#00a89e';       // filetes, botones, bordes de acento
const BRAND_TEAL_DEEP = '#007e77';  // bordes y estados
// #00a89e sobre blanco da ~2,6:1 de contraste y no se lee como texto. Este tono
// ronda 4,9:1 y es el que se usa para kickers y enlaces.
const BRAND_TEAL_INK = '#00695f';

const INK = '#0f172a';        // titulares
const INK_BODY = '#334155';   // párrafos
// Antes las etiquetas iban en #94a3b8 (2,6:1). "Paciente", "Fecha" y "Hora" son
// información clínica, no decoración: tienen que leerse.
const INK_MUTED = '#5b6b7f';

const SURFACE = '#ffffff';
const SURFACE_PAGE = '#eef2f6';  // marco exterior
const SURFACE_SOFT = '#f6f8fa';  // pie
const SURFACE_TEAL = '#f0fdfa';
const BORDER = '#e2e8f0';

const EMAIL_W = 600;

// Tipografía: una sola familia para todo el correo.
//
// Antes los títulos iban en Georgia y el cuerpo en sans. La idea era un serif
// elegante, pero la fuente display de la marca es Fraunces y NINGÚN cliente de
// correo carga fuentes web: Georgia era el sustituto de un sustituto, con el
// coste visual de la mezcla y sin la marca a cambio. A ojo no lee como
// editorial, lee como una fuente que no cargó.
//
// 'Segoe UI' es imprescindible en el stack: ante una familia desconocida el
// motor Word de Outlook cae a Times New Roman, así que sin ella había riesgo de
// serif involuntario incluso en el cuerpo.
const FONT_SANS = `'Manrope','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif`;

const ROW_LABEL = `padding:9px 12px 9px 0;color:${INK_MUTED};font-size:11px;text-transform:uppercase;letter-spacing:1px;white-space:nowrap;vertical-align:middle;width:38%;font-family:${FONT_SANS};`;
const ROW_VALUE = `padding:9px 0;color:${INK};font-weight:bold;text-align:right;vertical-align:middle;font-family:${FONT_SANS};`;
// font-family explícito: Outlook no hereda la fuente de forma fiable dentro de
// tablas anidadas.
const INFO_BOX = `background-color:${SURFACE_TEAL};border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid ${BRAND_TEAL};font-family:${FONT_SANS};`;

// El logo se sirve desde public/ en una URL estable — los archivos de assets/ los
// empaqueta Vite con un hash y no sirven para un correo.
//
// Va sobre PLACA BLANCA, con el margen horneado en el propio PNG. Antes iba
// montado sobre un degradado turquesa, y ahí estaba el choque de marca: el logo
// es naranja y cian, y encima del verde de la plataforma leían como dos empresas
// distintas. Sobre blanco cada uno conserva lo suyo.
//
// Va SIEMPRE con `alt`: Outlook y Gmail bloquean las imágenes de remitentes
// desconocidos, y sin eso la cabecera llega decapitada.
const LOGO_URL = `${(process.env.PUBLIC_BASE_URL || 'https://clinicamaslife.cl').replace(/\/$/, '')}/logo-email.png`;
// El PNG mide 344×204. Mostrado a 172×102 queda a densidad 2× exacta: nítido en
// pantallas retina sin regenerar el archivo. A los 210px anteriores estaba a
// 1,64× y los biseles se veían blandos.
const LOGO_W = 172;
const LOGO_H = 102;

// Solo se aceptan enlaces http(s) en un href. El enlace de calificación se
// construye con un slug que llega en el cuerpo de la petición: sin esto, unas
// comillas rompen el atributo e inyectan HTML en un correo dirigido a un
// paciente.
function safeUrl(u: unknown): string {
  const s = String(u ?? '').trim();
  return /^https?:\/\//i.test(s) ? escapeHtml(s) : '#';
}

// Botón de acción que sobrevive a Outlook: el color va en `bgcolor` además de en
// CSS, y el padding se declara en el <td> (mso-padding-alt) y en el <a>, porque
// el motor Word ignora el padding de un <a> suelto y dejaba un rectángulo sin
// área táctil. Pierde las esquinas redondeadas en Outlook y nada más — no vale
// la pena una capa de VML por eso.
function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;border-collapse:separate;">
      <tr>
        <td align="center" bgcolor="${BRAND_TEAL}" style="background-color:${BRAND_TEAL};border-radius:12px;mso-padding-alt:14px 32px;">
          <a href="${safeUrl(href)}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:${FONT_SANS};font-size:15px;line-height:20px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px;mso-text-raise:2px;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`;
}

// Postgres devuelve la columna `time` como "11:00:00" y en el correo se leía
// "Hora 11:00:00". Se recorta aquí, que es donde se arma el mensaje.
const soloHoraMinuto = (t: unknown) => String(t ?? '').slice(0, 5);

// Lo que incluye el plan y las condiciones comerciales. Copiado literalmente de
// la sección Tarifas de la landing (pages/ProLanding.tsx) para que el correo y
// la web no puedan contradecirse: si allí cambia el precio o la comisión, esto
// hay que cambiarlo con ello.
const BENEFICIOS_PLAN = [
  'Agenda online 24/7',
  'Perfil en el buscador',
  'Cobros con MercadoPago a tu cuenta',
  'Fichas clínicas por especialidad',
  'Informes PDF',
  'Asistente IA',
  'Confirmaciones automáticas',
  'Sincronización con Google Calendar',
  'Rutinas y planes enviables al paciente',
];

const SELLOS_PLAN: Array<{ t: string; d: string }> = [
  { t: 'Sin permanencia', d: 'Cancelas cuando quieras' },
  { t: '2% por cobro online', d: 'Lo que cobras en consulta no paga comisión' },
  { t: 'Un solo plan', d: 'Sin módulos que se cobran aparte' },
];

/** "2026-09-27" → "27 de septiembre de 2026". Cadena vacía si no hay fecha válida. */
function fechaLarga(v: unknown): string {
  const s = String(v ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  // Mediodía para que el cambio de huso no desplace el día.
  return new Date(`${s}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Piezas para correos por franjas ──────────────────────────────────────────
// El correo rico se construye con bandas de ancho completo, no con imágenes: en
// Outlook y Gmail las fotos vienen bloqueadas por defecto, así que una banda
// hecha de fotografía llega vacía a mucha gente. Con tipografía y color se ve
// igual siempre.

/**
 * Banda de beneficios: título y lista de píldoras.
 * Cada píldora es una tabla porque el motor Word de Outlook no respeta el
 * padding de un <span>, y quedarían pegadas al borde.
 */
function bandaBeneficios(titulo: string, items: string[]): string {
  const pildoras = items.map(t => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;margin:0 6px 8px 0;border-collapse:separate;">
      <tr><td bgcolor="${SURFACE}" style="background-color:${SURFACE};border:1px solid ${BORDER};border-radius:999px;padding:7px 14px;font-family:${FONT_SANS};font-size:13px;line-height:18px;color:${INK_BODY};white-space:nowrap;">${escapeHtml(t)}</td></tr>
    </table>`).join('');
  return `        <tr>
          <td class="ml-pad" bgcolor="${SURFACE_TEAL}" style="background-color:${SURFACE_TEAL};border-top:1px solid ${BORDER};padding:26px 32px 22px;">
            <div style="font-family:${FONT_SANS};font-size:16px;line-height:1.35;font-weight:800;color:${INK};letter-spacing:-0.2px;margin:0 0 14px;">${escapeHtml(titulo)}</div>
            ${pildoras}
          </td>
        </tr>`;
}

/**
 * Fila de sellos de confianza: tres columnas de texto, sin iconos.
 * En móvil las celdas se apilan por la media query `.ml-sello`.
 */
function bandaSellos(sellos: Array<{ t: string; d: string }>): string {
  const celdas = sellos.map(s => `
    <td class="ml-sello" align="center" width="33%" style="padding:6px 10px;vertical-align:top;">
      <div style="font-family:${FONT_SANS};font-size:13px;line-height:18px;font-weight:800;color:${INK};">${escapeHtml(s.t)}</div>
      <div style="font-family:${FONT_SANS};font-size:12px;line-height:17px;color:${INK_MUTED};padding-top:3px;">${escapeHtml(s.d)}</div>
    </td>`).join('');
  return `        <tr>
          <td class="ml-pad" bgcolor="${SURFACE}" style="background-color:${SURFACE};border-top:1px solid ${BORDER};padding:22px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${celdas}</tr></table>
          </td>
        </tr>`;
}

/**
 * Tabla de importes con filas alternas y total destacado, al estilo de un
 * comprobante. El total va con borde superior y no con negrita sola, porque
 * algunos clientes aplanan los pesos tipográficos.
 */
function tablaImportes(filas: Array<{ l: string; v: string }>, total?: { l: string; v: string }): string {
  const cuerpo = filas.map((f, i) => `
    <tr>
      <td bgcolor="${i % 2 ? SURFACE : SURFACE_SOFT}" style="background-color:${i % 2 ? SURFACE : SURFACE_SOFT};font-family:${FONT_SANS};font-size:14px;line-height:20px;color:${INK_BODY};padding:11px 14px;">${escapeHtml(f.l)}</td>
      <td bgcolor="${i % 2 ? SURFACE : SURFACE_SOFT}" align="right" style="background-color:${i % 2 ? SURFACE : SURFACE_SOFT};font-family:${FONT_SANS};font-size:14px;line-height:20px;color:${INK};font-weight:700;padding:11px 14px;word-break:break-word;">${escapeHtml(f.v)}</td>
    </tr>`).join('');
  const pie = total ? `
    <tr>
      <td style="font-family:${FONT_SANS};font-size:15px;line-height:21px;color:${INK};font-weight:800;padding:13px 14px;border-top:2px solid ${BORDER};">${escapeHtml(total.l)}</td>
      <td align="right" style="font-family:${FONT_SANS};font-size:15px;line-height:21px;color:${INK};font-weight:800;padding:13px 14px;border-top:2px solid ${BORDER};">${escapeHtml(total.v)}</td>
    </tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BORDER};border-radius:12px;margin:18px 0;">${cuerpo}${pie}</table>`;
}

// ── Plantilla de marca MasLife para TODOS los correos ────────────────────────
// Devuelve un documento HTML completo, no un fragmento. Hace falta para tres
// cosas que un <div> suelto no permite: color-scheme, las media queries de modo
// oscuro y el bloque condicional de Outlook. Ninguna de las plantillas anida el
// resultado dentro de más HTML — todas lo pasan tal cual a Resend.
//
// El layout es de tablas, no de divs, porque el motor Word de Outlook ignora
// `max-width` en un div y el correo se estiraba a todo el ancho de la ventana.
// Un atributo `width` en una tabla lo respeta siempre.
function emailShell(opts: {
  kicker?: string;
  title: string;
  subtitle?: string;
  bodyHtml: string;
  /** Texto de vista previa en la bandeja. Sin esto arrancaba con el alt del logo. */
  preheader?: string;
  /** Línea legal o de baja bajo el pie. HTML de confianza, no de usuario. */
  footerExtra?: string;
  /**
   * Bandas a ancho completo entre la tarjeta y el pie: `<tr>` sueltos, con su
   * propio fondo. Es lo que permite el correo por franjas sin que la tarjeta
   * blanca tenga que contenerlo todo. HTML de confianza, no de usuario.
   */
  bandas?: string;
}): string {
  // El año iba escrito a mano. Se calcula en hora de Chile porque Vercel corre
  // en UTC: el 31 de diciembre a las 21:00 en Santiago ya es 1 de enero en UTC.
  // Y va DENTRO de la función, no como constante de módulo: un lambda tibio que
  // sobreviva al cambio de año seguiría emitiendo el año viejo durante días.
  const year = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', year: 'numeric' }).format(new Date());
  const preheader = opts.preheader || opts.subtitle || opts.title;
  // Empuja el cuerpo fuera de la vista previa de la bandeja.
  const relleno = '&#8199;&#65279;&#847; '.repeat(30);

  return `<!DOCTYPE html>
<html lang="es" dir="ltr" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(opts.title)}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style>
  body,table,td,p,h1,a,li{font-family:'Segoe UI',Arial,sans-serif !important;}
  table{border-collapse:collapse !important;}
  td{mso-line-height-rule:exactly;}
</style>
<![endif]-->
<style>
  :root{color-scheme:light dark;supported-color-schemes:light dark;}
  body,table,td,p,a,h1{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
  a{color:${BRAND_TEAL_INK};}
  @media only screen and (max-width:620px){
    .ml-wrap{width:100% !important;max-width:100% !important;}
    .ml-pad{padding-left:20px !important;padding-right:20px !important;}
    .ml-h1{font-size:21px !important;}
  }
  /* Los sellos se apilan solo en pantallas realmente estrechas. El corte va por
     debajo de los 600px del propio correo: si compartiera el de arriba, un
     cliente con el panel de lectura a 600px ya los vería apilados. */
  @media only screen and (max-width:479px){
    .ml-sello{display:block !important;width:100% !important;padding-bottom:14px !important;}
  }
  /* Modo oscuro: el correo se mantiene CLARO a propósito y solo se oscurece el
     marco. La placa del logo se fija en blanco porque el PNG lleva el blanco
     horneado —si el cliente oscurece la celda queda un rectángulo flotando— y
     la tarjeta también, porque los cuerpos de las plantillas traen sus colores
     en línea y desde aquí no se pueden reasignar. */
  @media (prefers-color-scheme: dark){
    .ml-page{background-color:#0b1220 !important;}
    .ml-plate,.ml-card,.ml-shell{background-color:${SURFACE} !important;}
    .ml-foot{background-color:${SURFACE_SOFT} !important;}
    .ml-foot-ink{color:${INK} !important;}
    .ml-foot-muted{color:${INK_MUTED} !important;}
  }
  /* Outlook.com y Outlook Android no soportan la media query: reescriben el DOM
     añadiendo este atributo. */
  [data-ogsc] .ml-page{background-color:#0b1220 !important;}
  [data-ogsc] .ml-plate,[data-ogsc] .ml-card,[data-ogsc] .ml-shell{background-color:${SURFACE} !important;}
  [data-ogsc] .ml-foot{background-color:${SURFACE_SOFT} !important;}
  [data-ogsc] .ml-foot-ink{color:${INK} !important;}
  [data-ogsc] .ml-foot-muted{color:${INK_MUTED} !important;}
</style>
</head>
<body class="ml-page" style="margin:0;padding:0;width:100%;background-color:${SURFACE_PAGE};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}${relleno}</div>
<table role="presentation" class="ml-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SURFACE_PAGE}" style="background-color:${SURFACE_PAGE};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" class="ml-wrap ml-shell" width="${EMAIL_W}" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="${SURFACE}" style="width:${EMAIL_W}px;max-width:${EMAIL_W}px;background-color:${SURFACE};border:1px solid ${BORDER};border-radius:16px;">

        <tr><td height="4" bgcolor="${BRAND_TEAL}" style="height:4px;line-height:4px;font-size:0;background-color:${BRAND_TEAL};border-radius:15px 15px 0 0;">&nbsp;</td></tr>

        <tr>
          <td class="ml-plate ml-pad" align="center" bgcolor="${SURFACE}" style="background-color:${SURFACE};padding:26px 32px 18px;">
            <img src="${LOGO_URL}" width="${LOGO_W}" height="${LOGO_H}" alt="Clínica Mas Life · Agenda Online"
                 style="display:block;margin:0 auto;width:${LOGO_W}px;height:${LOGO_H}px;max-width:60%;border:0;background-color:${SURFACE};font-family:${FONT_SANS};font-size:19px;line-height:26px;font-weight:800;color:${BRAND_TEAL_INK};text-decoration:none;">
            <div style="font-family:${FONT_SANS};color:${INK_MUTED};font-size:11px;line-height:16px;letter-spacing:2px;text-transform:uppercase;padding-top:10px;">clinicamaslife.cl</div>
          </td>
        </tr>
        <tr><td style="padding:0 32px;"><div style="height:1px;line-height:1px;font-size:0;background-color:${BORDER};">&nbsp;</div></td></tr>

        <tr>
          <td class="ml-card ml-pad" bgcolor="${SURFACE}" style="background-color:${SURFACE};padding:30px 32px 34px;font-family:${FONT_SANS};font-size:15px;line-height:1.65;color:${INK_BODY};">
            ${opts.kicker ? `<div style="font-family:${FONT_SANS};text-align:center;color:${BRAND_TEAL_INK};font-size:11px;line-height:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">${escapeHtml(opts.kicker)}</div>` : ''}
            <h1 class="ml-h1" style="font-family:${FONT_SANS};color:${INK};font-size:24px;line-height:1.28;font-weight:800;letter-spacing:-0.2px;margin:0 0 ${opts.subtitle ? '8px' : '22px'};text-align:center;">${escapeHtml(opts.title)}</h1>
            ${opts.subtitle ? `<p style="font-family:${FONT_SANS};color:${INK_MUTED};font-size:13px;line-height:1.55;text-align:center;margin:0 0 24px;">${escapeHtml(opts.subtitle)}</p>` : ''}
            ${opts.bodyHtml}
          </td>
        </tr>
${opts.bandas || ''}

        <tr>
          <td class="ml-foot ml-pad" align="center" bgcolor="${SURFACE_SOFT}" style="background-color:${SURFACE_SOFT};border-top:1px solid ${BORDER};padding:22px 32px 24px;border-radius:0 0 15px 15px;">
            <div class="ml-foot-ink" style="font-family:${FONT_SANS};font-size:15px;line-height:22px;font-weight:800;color:${INK};letter-spacing:-0.2px;">Clínica Mas Life</div>
            <div class="ml-foot-muted" style="font-family:${FONT_SANS};font-size:12px;line-height:18px;color:${INK_MUTED};padding-top:4px;">Agenda online para profesionales de la salud</div>
            ${opts.footerExtra ? `<div class="ml-foot-muted" style="font-family:${FONT_SANS};font-size:11px;line-height:17px;color:${INK_MUTED};padding-top:10px;">${opts.footerExtra}</div>` : ''}
            <div class="ml-foot-muted" style="font-family:${FONT_SANS};font-size:11px;line-height:17px;color:${INK_MUTED};padding-top:10px;">© ${year} Clínica Mas Life · Todos los derechos reservados.</div>
          </td>
        </tr>

      </table>
      <div style="font-family:${FONT_SANS};font-size:11px;line-height:16px;color:${INK_MUTED};padding:14px 8px 0;max-width:${EMAIL_W}px;">Correo automático de <a href="https://clinicamaslife.cl" style="color:${BRAND_TEAL_INK};text-decoration:underline;">clinicamaslife.cl</a></div>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// value se escapa como HTML; los labels son literales de confianza
function tableRow(label: string, value: string) {
  return `<tr><td style="${ROW_LABEL}">${label}</td><td style="${ROW_VALUE}">${escapeHtml(value)}</td></tr>`;
}

function professionalNewBookingHtml(p: { professionalName: string; patientName: string; serviceName: string; date: string; time: string; type: string }) {
  return emailShell({
    kicker: 'Nueva cita',
    title: 'Nueva cita agendada',
    bodyHtml: `
      <p style="color:#334155;font-size:15px;margin:0 0 8px;">Hola <strong>${escapeHtml(p.professionalName || 'Profesional')}</strong>,</p>
      <p style="color:#64748b;font-size:14px;margin:0 0 4px;">Tienes una nueva cita agendada:</p>
      <div style="${INFO_BOX}">
        <table style="width:100%;border-collapse:collapse;">
          ${tableRow('Paciente', p.patientName)}
          ${tableRow('Servicio', p.serviceName || 'General')}
          ${tableRow('Fecha', p.date)}
          ${tableRow('Hora', soloHoraMinuto(p.time))}
          ${tableRow('Modalidad', p.type || 'Presencial')}
        </table>
      </div>`,
  });
}

function patientConfirmationHtml(p: { patientName: string; doctorName: string; serviceName: string; date: string; time: string; type: string; price?: number }) {
  const paidRow = p.price && p.price > 0
    ? tableRow('Pagado', `$${Number(p.price).toLocaleString('es-CL')}`)
    : '';
  return emailShell({
    kicker: 'Cita confirmada',
    title: '¡Tu cita está confirmada!',
    subtitle: 'Tu hora quedó reservada exitosamente',
    bodyHtml: `
      <p style="color:#334155;font-size:15px;margin:0 0 8px;">Hola <strong>${escapeHtml(p.patientName)}</strong>,</p>
      <p style="color:#64748b;font-size:14px;margin:0 0 4px;">Aquí están los detalles de tu cita:</p>
      <div style="${INFO_BOX}">
        <table style="width:100%;border-collapse:collapse;">
          ${tableRow('Profesional', p.doctorName)}
          ${tableRow('Servicio', p.serviceName || 'Consulta')}
          ${tableRow('Fecha', p.date)}
          ${tableRow('Hora', soloHoraMinuto(p.time))}
          ${tableRow('Modalidad', p.type || 'Presencial')}
          ${paidRow}
        </table>
      </div>
      <p style="color:#64748b;font-size:13px;margin:0 0 6px;">Adjuntamos un archivo de calendario (.ics) para agregar la cita a Google Calendar, Apple Calendar u Outlook con un clic.</p>
      <p style="color:#64748b;font-size:13px;margin:0;">Si necesitas cancelar o reagendar, comunícate directamente con el profesional.</p>`,
  });
}

function paymentReceiptHtml(p: { patientName: string; doctorName: string; serviceName: string; date: string; time: string; transactionRef?: string; price?: number }) {
  const priceStr = p.price ? `$${p.price.toLocaleString('es-CL')}` : '—';
  return emailShell({
    kicker: 'Comprobante',
    title: 'Comprobante de pago',
    subtitle: 'Tu pago ha sido confirmado',
    bodyHtml: `
      <p style="color:#334155;font-size:15px;margin:0 0 8px;">Hola <strong>${escapeHtml(p.patientName)}</strong>,</p>
      <div style="${INFO_BOX}">
        <table style="width:100%;border-collapse:collapse;">
          ${tableRow('Paciente', p.patientName)}
          ${tableRow('Profesional', p.doctorName)}
          ${tableRow('Servicio', p.serviceName || 'Consulta')}
          ${tableRow('Fecha', p.date)}
          ${tableRow('Hora', soloHoraMinuto(p.time))}
          ${p.transactionRef ? tableRow('Referencia', p.transactionRef) : ''}
          ${tableRow('Monto Pagado', priceStr)}
        </table>
      </div>
      <p style="color:#64748b;font-size:13px;margin:0;">Guarda este comprobante como respaldo de tu pago.</p>`,
  });
}

async function sendEmail(
  apiKey: string, from: string, to: string, subject: string, html: string,
  icsContent?: string,
  // Adjunto genérico (ej. PDF de una rutina de ejercicios) — independiente del
  // adjunto .ics de invitación de calendario, ambos pueden coexistir.
  attachment?: { filename: string; contentBase64: string; contentType: string }
) {
  const body: Record<string, unknown> = { from, to: [to], subject, html };
  const attachments: Array<{ filename: string; content: string; content_type: string }> = [];
  if (icsContent) {
    attachments.push({
      filename: 'cita.ics',
      content: Buffer.from(icsContent).toString('base64'),
      // content_type de invitación: hace que Gmail/Outlook muestren el evento
      // de forma interactiva y lo agreguen al calendario automáticamente
      content_type: 'text/calendar; method=REQUEST; charset=UTF-8'
    });
  }
  if (attachment) {
    attachments.push({
      filename: attachment.filename,
      content: attachment.contentBase64,
      content_type: attachment.contentType,
    });
  }
  if (attachments.length) body.attachments = attachments;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}

function exerciseRoutineHtml(p: { professionalName: string; patientName: string; routineTitle: string; items: Array<{ nameEs: string; sets: number | null; reps: string; restSeconds?: number | null }> }): string {
  const rows = p.items.map(it => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;font-weight:700;">${escapeHtml(it.nameEs)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#475569;font-size:13px;text-align:right;white-space:nowrap;">
        ${it.sets ? `${it.sets} × ` : ''}${escapeHtml(it.reps || '—')}${it.restSeconds ? `<br><span style="color:#94a3b8;font-size:11px;">Descanso: ${it.restSeconds}s</span>` : ''}
      </td>
    </tr>`).join('');
  return emailShell({
    kicker: 'Rutina de ejercicios',
    title: p.routineTitle,
    subtitle: `De parte de ${p.professionalName}`,
    bodyHtml: `
      <p style="color:#334155;font-size:15px;margin:0 0 16px;">Hola <strong>${escapeHtml(p.patientName)}</strong>,</p>
      <p style="color:#475569;font-size:14px;margin:0 0 20px;line-height:1.6;">Tu kinesiólogo/a te envió la siguiente rutina de ejercicios. Encontrarás el detalle completo con imágenes en el PDF adjunto.</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;">Si tienes dolor o molestias al realizar algún ejercicio, detente y consulta con tu profesional.</p>`,
  });
}

function mealPlanHtml(p: { professionalName: string; patientName: string; planTitle: string; rows: Array<{ meal: string; food: string; quantity: string; kcal: string }> }): string {
  const rows = p.rows.map(r => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;font-weight:700;white-space:nowrap;">${escapeHtml(r.meal || '—')}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:13px;">${escapeHtml(r.food || '—')}${r.quantity ? `<br><span style="color:#94a3b8;font-size:11px;">${escapeHtml(r.quantity)}</span>` : ''}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#059669;font-size:13px;font-weight:700;text-align:right;white-space:nowrap;">${r.kcal ? `${escapeHtml(r.kcal)} kcal` : ''}</td>
    </tr>`).join('');
  return emailShell({
    kicker: 'Plan alimentario',
    title: p.planTitle,
    subtitle: `De parte de ${p.professionalName}`,
    bodyHtml: `
      <p style="color:#334155;font-size:15px;margin:0 0 16px;">Hola <strong>${escapeHtml(p.patientName)}</strong>,</p>
      <p style="color:#475569;font-size:14px;margin:0 0 20px;line-height:1.6;">Tu nutricionista te envió tu plan alimentario. Encontrarás el detalle completo en el PDF adjunto.</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;">Ante cualquier duda o malestar, contacta directamente a tu profesional.</p>`,
  });
}

function ratingRequestHtml(p: { professionalName: string; patientName: string; serviceName: string; date: string; reviewLink: string }): string {
  const dateFormatted = p.date ? new Date(p.date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return emailShell({
    kicker: 'Tu opinión',
    title: '¿Cómo fue tu atención?',
    subtitle: 'Tu opinión ayuda a otros pacientes',
    bodyHtml: `
      <p style="color:#334155;font-size:15px;margin:0 0 16px;">Hola <strong>${escapeHtml(p.patientName)}</strong>,</p>
      <p style="color:#475569;font-size:15px;margin:0 0 24px;line-height:1.6;">
        Tu sesión de <strong>${escapeHtml(p.serviceName)}</strong>${dateFormatted ? ` del ${dateFormatted}` : ''} con
        <strong>${escapeHtml(p.professionalName)}</strong> ha finalizado. Nos gustaría saber cómo fue tu experiencia.
      </p>
      <div style="text-align:center;margin:0 0 24px;font-size:32px;letter-spacing:4px;color:#f59e0b;">★★★★★</div>
      <div style="text-align:center;margin:0 0 24px;">
        ${ctaButton(p.reviewLink, 'Dejar mi calificación →')}
      </div>
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">Tu RUT solo se usa para verificar que fuiste atendido/a. No se publica.</p>`,
  });
}

function charlaBlastHtml(nombre: string, asunto: string, mensaje: string): string {
  return emailShell({
    kicker: 'Charlas de salud',
    title: asunto,
    bodyHtml: `
      <p style="color:#334155;font-size:16px;margin:0 0 20px;">Hola <strong>${escapeHtml(nombre)}</strong>,</p>
      <div style="color:${INK_BODY};font-size:15px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(mensaje)}</div>`,
    footerExtra: 'Recibiste este mensaje porque te inscribiste a las charlas gratuitas de Clínica Mas Life.<br>Para no recibir más comunicaciones, responde este email solicitando darte de baja.',
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS restringido al sitio (las llamadas legítimas son same-origin). Antes había
  // un segundo header con '*' que lo pisaba y convertía este endpoint en un relay
  // de correo abierto (phishing con la marca vía Resend).
  res.setHeader('Access-Control-Allow-Origin', 'https://clinicamaslife.cl');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate-limit GLOBAL por IP, antes de CUALQUIER acción (antes solo cubría el flujo
  // principal; rating-request/pro-welcome/reward-referral se lo saltaban). Frena el
  // abuso del endpoint como relay de correo.
  if (!checkRateLimit(req.headers, 20, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en una hora.' });
  }

  // Reward referral: acredita $1.000 al referidor, UNA sola vez por referido y solo
  // si el referido realmente fue referido por ese referidor. Antes: sin validación
  // ni idempotencia → cualquiera con 2 UUIDs inflaba el crédito en bucle.
  if (req.body?.action === 'reward-referral') {
    const { referrer_id, referred_id } = req.body || {};
    if (!referrer_id || !referred_id) {
      return res.status(400).json({ error: 'referrer_id y referred_id requeridos' });
    }
    if (referrer_id === referred_id) return res.status(400).json({ error: 'Referido inválido' });

    const { data: referred } = await supabase.from('professionals')
      .select('id, referred_by, referral_reward_claimed').eq('id', referred_id).single();
    const { data: referrer } = await supabase.from('professionals').select('id').eq('id', referrer_id).single();
    if (!referrer || !referred) return res.status(404).json({ error: 'Profesional no encontrado' });
    // El referido debe declarar a ESTE referidor y no haber sido recompensado antes.
    if ((referred as any).referred_by !== referrer_id) {
      return res.status(403).json({ error: 'El referido no corresponde a este referidor' });
    }
    // Idempotencia atómica: marca claimed pasando de false→true; si 0 filas, ya se pagó.
    const { data: claimedRows } = await supabase.from('professionals')
      .update({ referral_reward_claimed: true })
      .eq('id', referred_id).eq('referral_reward_claimed', false)
      .select('id');
    if (!claimedRows || claimedRows.length === 0) {
      return res.status(200).json({ rewarded: false, reason: 'ya recompensado' });
    }

    // Recompensa SOLO al referidor: $1.000 de descuento en su próxima facturación.
    // El referido nuevo recibe únicamente los 30 días de prueba estándar
    // (sin días extra), según la política vigente.
    await supabase.rpc('increment_referral_credit', { pro_id: referrer_id, amount: 1000 })
      .then(async ({ error }) => {
        if (error) {
          // Fallback if RPC doesn't exist: manual increment
          const { data: pro } = await supabase.from('professionals').select('referral_credit_clp').eq('id', referrer_id).single();
          await supabase.from('professionals').update({ referral_credit_clp: ((pro as any)?.referral_credit_clp || 0) + 1000 }).eq('id', referrer_id);
        }
      });

    return res.status(200).json({ rewarded: true });
  }

  // Submit review: server-side RUT verification against appointments
  if (req.body?.action === 'submit-review') {
    const { professional_id, patient_rut, patient_name, rating, comment } = req.body || {};

    if (!professional_id || !patient_rut || !patient_name || !rating) {
      return res.status(400).json({ error: 'Campos requeridos: professional_id, patient_rut, patient_name, rating' });
    }
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Calificación inválida (1-5)' });
    }

    const { data: pro } = await supabase
      .from('professionals')
      .select('reviews_enabled')
      .eq('id', professional_id)
      .single();
    if (!pro?.reviews_enabled) {
      return res.status(403).json({ error: 'Este profesional no acepta calificaciones.' });
    }

    const normalizedRut = String(patient_rut).replace(/\./g, '').replace(/-/g, '').toLowerCase().trim();
    // Validar formato RUT chileno (7-8 dígitos + dígito verificador). Esto, además de
    // ser correcto, impide inyección de operadores PostgREST (comas/puntos) en el filtro.
    if (!/^\d{7,8}[0-9k]$/.test(normalizedRut)) {
      return res.status(400).json({ error: 'RUT inválido.' });
    }
    // Traer los RUT de las citas del profesional y comparar NORMALIZADO en JS (los
    // pacientes web guardan el rut sin puntos/guiones; el profesional puede haberlo
    // guardado con formato). Nunca se interpola el valor del usuario en el filtro.
    const { data: appointments } = await supabase
      .from('appointments')
      .select('patient_rut')
      .eq('professional_id', professional_id)
      .in('status', ['Confirmado', 'Completado'])
      .not('patient_rut', 'is', null);

    const isVerified = !!(appointments || []).some(a =>
      String(a.patient_rut).replace(/[.\-\s]/g, '').toLowerCase() === normalizedRut
    );

    if (!isVerified) {
      return res.status(403).json({
        error: 'Solo pueden calificar pacientes que fueron atendidos por este profesional.',
        code: 'NOT_A_PATIENT'
      });
    }

    const { error: insertErr } = await supabase
      .from('professional_reviews')
      .upsert({
        professional_id,
        patient_rut: normalizedRut,
        patient_name: String(patient_name).trim().slice(0, 80),
        rating: Math.round(rating),
        comment: comment ? String(comment).trim().slice(0, 500) : null,
        is_verified: true,
      }, { onConflict: 'professional_id,patient_rut' });

    if (insertErr) {
      console.error('[submit-review]', insertErr.message);
      return res.status(500).json({ error: 'No se pudo guardar la reseña.' });
    }

    return res.status(200).json({ submitted: true });
  }

  // ── Envío de rutina de ejercicios (kinesiología) por email, con PDF adjunto ─
  // El cliente genera el PDF (jsPDF) y lo manda como base64 — este endpoint solo
  // arma el correo y lo despacha, no genera el PDF.
  if (req.body?.action === 'exercise-routine') {
    if (!checkRateLimit(req.headers, 20, 60 * 60 * 1000))
      return res.status(429).json({ error: 'Demasiados envíos. Intenta más tarde.' });

    const { patientEmail, patientName, professionalName, routineTitle, items, pdfBase64 } = req.body || {};

    if (!patientEmail || !EMAIL_RE.test(String(patientEmail)))
      return res.status(400).json({ error: 'Email inválido' });
    if (!patientName || !professionalName || !Array.isArray(items) || !items.length)
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    if (!pdfBase64 || typeof pdfBase64 !== 'string')
      return res.status(400).json({ error: 'Falta el PDF de la rutina' });

    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });
    const FROM = process.env.EMAIL_FROM || 'notificaciones@clinicamaslife.cl';

    const safeItems = items.slice(0, 60).map((it: Record<string, unknown>) => ({
      nameEs: cleanLine(it?.nameEs).slice(0, 120),
      sets: typeof it?.sets === 'number' ? it.sets : null,
      reps: cleanLine(it?.reps).slice(0, 40),
      restSeconds: typeof it?.restSeconds === 'number' ? it.restSeconds : null,
    }));

    const subject = `Tu rutina de ejercicios — ${cleanLine(routineTitle) || 'Agenda Maslife'}`;
    try {
      await sendEmail(RESEND_KEY, FROM, String(patientEmail), subject,
        exerciseRoutineHtml({
          professionalName: String(professionalName),
          patientName: String(patientName),
          routineTitle: String(routineTitle || 'Rutina de ejercicios'),
          items: safeItems,
        }),
        undefined,
        { filename: 'rutina-de-ejercicios.pdf', contentBase64: String(pdfBase64), contentType: 'application/pdf' }
      );
    } catch (e: any) {
      console.error('[exercise-routine]', e?.message);
      return res.status(502).json({ error: 'No se pudo enviar el correo.' });
    }
    return res.status(200).json({ ok: true });
  }

  // ── Plan alimentario (nutrición): PDF adjunto al paciente ──────────────────
  if (req.body?.action === 'meal-plan') {
    if (!checkRateLimit(req.headers, 20, 60 * 60 * 1000))
      return res.status(429).json({ error: 'Demasiados envíos. Intenta más tarde.' });

    const { patientEmail, patientName, professionalName, planTitle, rows, pdfBase64 } = req.body || {};

    if (!patientEmail || !EMAIL_RE.test(String(patientEmail)))
      return res.status(400).json({ error: 'Email inválido' });
    if (!patientName || !professionalName || !Array.isArray(rows) || !rows.length)
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    if (!pdfBase64 || typeof pdfBase64 !== 'string')
      return res.status(400).json({ error: 'Falta el PDF del plan' });

    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });
    const FROM = process.env.EMAIL_FROM || 'notificaciones@clinicamaslife.cl';

    const safeRows = rows.slice(0, 40).map((r: Record<string, unknown>) => ({
      meal: cleanLine(r?.meal).slice(0, 60),
      food: cleanLine(r?.food).slice(0, 200),
      quantity: cleanLine(r?.quantity).slice(0, 60),
      kcal: cleanLine(r?.kcal).slice(0, 12),
    }));

    const subject = `Tu plan alimentario — ${cleanLine(planTitle) || 'Agenda Maslife'}`;
    try {
      await sendEmail(RESEND_KEY, FROM, String(patientEmail), subject,
        mealPlanHtml({
          professionalName: String(professionalName),
          patientName: String(patientName),
          planTitle: String(planTitle || 'Plan alimentario'),
          rows: safeRows,
        }),
        undefined,
        { filename: 'plan-alimentario.pdf', contentBase64: String(pdfBase64), contentType: 'application/pdf' }
      );
    } catch (e: any) {
      console.error('[meal-plan]', e?.message);
      return res.status(502).json({ error: 'No se pudo enviar el correo.' });
    }
    return res.status(200).json({ ok: true });
  }

  // ── Solicitud de calificación post-atención ────────────────────────────────
  if (req.body?.action === 'rating-request') {
    const { patientEmail, patientName, professionalName, professionalId, proSlug, serviceName, date } = req.body || {};

    if (!patientEmail || !EMAIL_RE.test(String(patientEmail)))
      return res.status(400).json({ error: 'Email inválido' });
    if (!professionalId || !patientName || !professionalName)
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });

    const { data: pro } = await supabase
      .from('professionals')
      .select('reviews_enabled')
      .eq('id', professionalId)
      .single();
    if (!pro?.reviews_enabled)
      return res.status(403).json({ error: 'Este profesional no acepta calificaciones.' });

    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });
    const FROM = process.env.EMAIL_FROM || 'notificaciones@clinicamaslife.cl';

    // El slug llega en el cuerpo de la petición y acaba dentro de un href. Se
    // acota a lo que puede ser un slug real; cualquier otra cosa cae al id, que
    // ya viene validado contra la base.
    const slugSeguro = /^[a-z0-9-]{1,80}$/i.test(String(proSlug || '')) ? String(proSlug) : '';
    const reviewLink = `https://clinicamaslife.cl/p/${slugSeguro || professionalId}?review=1&name=${encodeURIComponent(String(patientName))}`;
    const subject = cleanLine(`¿Cómo fue tu atención con ${professionalName}?`);
    await sendEmail(RESEND_KEY, FROM, String(patientEmail), subject,
      ratingRequestHtml({
        professionalName: String(professionalName),
        patientName: String(patientName),
        serviceName: String(serviceName || 'Consulta'),
        date: String(date || ''),
        reviewLink,
      })
    );
    return res.status(200).json({ ok: true });
  }

  // ── Aviso al administrador: nuevo mensaje de soporte de un profesional ──────
  // Solo envía al ADMIN_EMAIL fijo (no a destinatarios arbitrarios), así que no se
  // puede abusar para spam a terceros. No bloquea si el correo no está configurado.
  if (req.body?.action === 'admin-feedback') {
    const RESEND_KEY = process.env.RESEND_API_KEY;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    if (!RESEND_KEY || !ADMIN_EMAIL) return res.status(200).json({ ok: false, skipped: true });
    const FROM = (process.env.EMAIL_FROM || 'Clínica Maslife <notificaciones@clinicamaslife.cl>').trim();
    const { fbType, subject, message, professionalName, professionalEmail } = req.body || {};
    const tipo = fbType === 'problem' ? 'Problema' : 'Sugerencia';
    const html = emailShell({
      kicker: 'Soporte',
      title: `${tipo} — nuevo mensaje`,
      bodyHtml: `
        <p style="color:#334155;font-size:15px;margin:0 0 8px;"><strong>De:</strong> ${escapeHtml(String(professionalName || '—'))} (${escapeHtml(String(professionalEmail || '—'))})</p>
        ${subject ? `<p style="color:#334155;font-size:15px;margin:0 0 12px;"><strong>Asunto:</strong> ${escapeHtml(String(subject))}</p>` : ''}
        <div style="white-space:pre-wrap;background:#f8fafc;color:#334155;font-size:14px;line-height:1.6;padding:16px;border-radius:12px;border-left:4px solid ${BRAND_TEAL};">${escapeHtml(String(message || ''))}</div>
        <p style="color:#94a3b8;font-size:13px;margin:18px 0 0;">Revísalo y márcalo como resuelto en el panel admin → Soporte.</p>`,
    });
    await sendEmail(RESEND_KEY, FROM, ADMIN_EMAIL, `[MasLife Soporte] ${tipo}${subject ? ': ' + subject : ''}`, html).catch(() => null);
    return res.status(200).json({ ok: true });
  }

  // ── Correo de bienvenida a un profesional recién registrado (nuestro Resend) ─
  if (req.body?.action === 'pro-welcome') {
    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(200).json({ ok: false, skipped: true });
    const FROM = (process.env.EMAIL_FROM || 'Clínica Maslife <notificaciones@clinicamaslife.cl>').trim();
    const { to, professionalName, trialEndDate } = req.body || {};
    if (!to || !EMAIL_RE.test(String(to))) return res.status(400).json({ error: 'Email inválido' });
    const finPrueba = fechaLarga(trialEndDate);
    const html = emailShell({
      kicker: 'Bienvenida',
      title: `¡Bienvenido/a a Clínica Mas Life, ${String(professionalName || '')}!`,
      subtitle: 'Tu cuenta ya está activa y tu prueba de 30 días empezó hoy',
      preheader: finPrueba
        ? `Tienes acceso completo hasta el ${finPrueba}, sin tarjeta.`
        : 'Tienes 30 días de acceso completo, sin tarjeta.',
      bodyHtml: `
        <p style="font-family:${FONT_SANS};color:${INK_BODY};font-size:15px;line-height:1.65;margin:0 0 16px;">Ya puedes usar la plataforma completa durante <strong>30 días</strong>, sin ingresar ningún medio de pago${finPrueba ? ` — tu prueba va hasta el <strong>${escapeHtml(finPrueba)}</strong>` : ''}.</p>
        <p style="font-family:${FONT_SANS};color:${INK_BODY};font-size:14px;line-height:1.65;margin:0 0 8px;">Tres pasos para empezar a recibir pacientes:</p>
        <ol style="font-family:${FONT_SANS};color:${INK_BODY};font-size:14px;line-height:1.8;margin:0 0 8px;padding-left:20px;">
          <li>Completa tu perfil (foto, especialidad y ciudad).</li>
          <li>Agrega tus servicios con precio y duración.</li>
          <li>Comparte tu link de reservas.</li>
        </ol>
        <div style="text-align:center;margin:24px 0 8px;">
          ${ctaButton('https://clinicamaslife.cl/pro/dashboard', 'Ir a mi panel →')}
        </div>
        <p style="font-family:${FONT_SANS};color:${INK_MUTED};font-size:12px;text-align:center;margin:16px 0 0;">Si no creaste esta cuenta, ignora este correo.</p>`,
      bandas: bandaBeneficios('Todo esto está incluido', BENEFICIOS_PLAN) + bandaSellos(SELLOS_PLAN),
    });
    const enviado = await sendEmail(RESEND_KEY, FROM, String(to), '¡Tu cuenta en Clínica Mas Life está lista!', html)
      .catch(e => { console.error('[notify] pro-welcome no se pudo enviar:', e?.message); return null; });
    return res.status(200).json({ ok: !!enviado });
  }

  // ── Suscripción activada ──────────────────────────────────────────────────
  // Hasta ahora el profesional pagaba y no recibía nada: el webhook de
  // MercadoPago actualizaba la base y solo dejaba un log. Este es el
  // comprobante de ese cobro.
  //
  // Los importes NO se escriben aquí: llegan de la respuesta de MercadoPago
  // (auto_recurring), que es lo que realmente se le cobró. Si el precio del plan
  // cambiara, un literal en el código mentiría sobre el cargo real.
  if (req.body?.action === 'pro-subscription-active') {
    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(200).json({ ok: false, skipped: true });
    const FROM = (process.env.EMAIL_FROM || 'Clínica Maslife <notificaciones@clinicamaslife.cl>').trim();
    const { professionalId, amount, currency, nextPaymentDate, subscriptionId } = req.body || {};
    if (!professionalId) return res.status(400).json({ error: 'professionalId requerido' });

    // El destinatario NO se acepta del cuerpo de la petición. Este endpoint es
    // alcanzable desde fuera, y dejar elegir el "para" convertiría un correo que
    // dice "se te cobró $X" en una herramienta de phishing con nuestra marca.
    // Se resuelve contra la base, y solo se envía si la suscripción está
    // realmente activa: así el correo no puede afirmar algo que no ocurrió.
    const { data: pro, error: proError } = await supabase
      .from('professionals')
      .select('name, email, subscription_status')
      .eq('id', professionalId)
      .maybeSingle();
    if (proError) {
      console.error('[notify] pro-subscription-active: no se pudo leer el profesional:', proError.message);
      return res.status(500).json({ error: 'No se pudo verificar la suscripción.' });
    }
    if (!pro) return res.status(404).json({ error: 'Profesional no encontrado' });
    if ((pro as any).subscription_status !== 'active') {
      return res.status(409).json({ error: 'La suscripción no figura activa.' });
    }
    const to = String((pro as any).email || '');
    const professionalName = String((pro as any).name || '');
    if (!EMAIL_RE.test(to)) return res.status(400).json({ error: 'El profesional no tiene un email válido.' });

    const monto = Number(amount) > 0
      ? `$${Number(amount).toLocaleString('es-CL')}${currency && String(currency) !== 'CLP' ? ` ${escapeHtml(String(currency))}` : ''}`
      : '';
    const proximo = fechaLarga(nextPaymentDate);

    const filas: Array<{ l: string; v: string }> = [{ l: 'Plan', v: 'Pro — mensual' }];
    if (monto) filas.push({ l: 'Cargo mensual', v: `${monto} · IVA incluido` });
    if (proximo) filas.push({ l: 'Próximo cobro', v: proximo });
    if (subscriptionId) filas.push({ l: 'N.º de suscripción', v: String(subscriptionId) });

    const html = emailShell({
      kicker: 'Suscripción activa',
      title: 'Tu plan Pro está activo',
      subtitle: monto ? `Se activó el cobro mensual de ${monto}` : 'Se activó tu cobro mensual',
      preheader: proximo ? `Tu próximo cobro es el ${proximo}.` : 'Tu suscripción quedó activa.',
      bodyHtml: `
        <p style="font-family:${FONT_SANS};color:${INK_BODY};font-size:15px;line-height:1.65;margin:0 0 8px;">Hola <strong>${escapeHtml(String(professionalName || 'Profesional'))}</strong>,</p>
        <p style="font-family:${FONT_SANS};color:${INK_BODY};font-size:15px;line-height:1.65;margin:0 0 4px;">Tu suscripción quedó activa y tu perfil sigue publicado, sin interrupciones. Guarda este correo como comprobante.</p>
        ${tablaImportes(filas, monto ? { l: 'Total cobrado', v: monto } : undefined)}
        <p style="font-family:${FONT_SANS};color:${INK_MUTED};font-size:13px;line-height:1.6;margin:0 0 4px;">El cobro se renueva solo cada mes. Puedes cancelarlo cuando quieras desde MercadoPago o desde Ajustes, sin costos de salida.</p>
        <div style="text-align:center;margin:24px 0 8px;">
          ${ctaButton('https://clinicamaslife.cl/pro/dashboard', 'Ir a mi panel →')}
        </div>`,
      bandas: bandaBeneficios('Lo que tienes activo', BENEFICIOS_PLAN) + bandaSellos(SELLOS_PLAN),
      footerExtra: 'Recibes este correo porque activaste la suscripción del plan Pro.',
    });
    const enviado = await sendEmail(RESEND_KEY, FROM, String(to), 'Tu plan Pro está activo — Clínica Mas Life', html)
      .catch(e => { console.error('[notify] pro-subscription-active no se pudo enviar:', e?.message); return null; });
    return res.status(200).json({ ok: !!enviado });
  }

  // ── Envío masivo a inscritos en charlas (solo admin) ──────────────────────
  if (req.body?.action === 'charla-blast') {
    // El token admin se firma con la service-role key (ver admin-auth.ts).
    const ADMIN_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ADMIN_JWT_SECRET;
    if (!ADMIN_SECRET) return res.status(500).json({ error: 'Configuración incompleta' });
    const authHeader = (req.headers.authorization as string | undefined) || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!verifyAdminJwt(token, ADMIN_SECRET)) return res.status(401).json({ error: 'No autorizado' });

    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });

    const { charlaId, asunto, mensaje } = req.body;
    if (!asunto?.trim() || !mensaje?.trim()) return res.status(400).json({ error: 'asunto y mensaje son requeridos' });

    // Fetch registrations (charla específica o todas)
    let query = supabase.from('charla_registrations').select('nombre, email').neq('email', '');
    if (charlaId) query = query.eq('charla_id', charlaId);
    const { data: regs, error: fetchErr } = await query;
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!regs || regs.length === 0) return res.status(200).json({ sent: 0, message: 'Sin destinatarios' });

    // Eliminar duplicados por email
    const seen = new Set<string>();
    const unique = (regs as { nombre: string; email: string }[]).filter(r => {
      if (!EMAIL_RE.test(r.email) || seen.has(r.email.toLowerCase())) return false;
      seen.add(r.email.toLowerCase()); return true;
    });

    const FROM = (process.env.EMAIL_FROM || 'Clínica Maslife <notificaciones@clinicamaslife.cl>').trim();
    const cleanAsunto = cleanLine(asunto);

    // Resend batch: máx 100 por request
    let sent = 0;
    const chunk = 100;
    for (let i = 0; i < unique.length; i += chunk) {
      const batch = unique.slice(i, i + chunk).map(r => ({
        from: FROM,
        to: [r.email],
        subject: cleanAsunto,
        html: charlaBlastHtml(r.nombre, cleanAsunto, mensaje),
      }));
      const batchRes = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (batchRes.ok) sent += batch.length;
    }

    return res.status(200).json({ sent, total: unique.length });
  }

  // ── Mensaje masivo a profesionales (solo admin) ───────────────────────────
  if (req.body?.action === 'pro-blast') {
    const ADMIN_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ADMIN_JWT_SECRET;
    if (!ADMIN_SECRET) return res.status(500).json({ error: 'Configuración incompleta' });
    const authHeader = (req.headers.authorization as string | undefined) || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!verifyAdminJwt(token, ADMIN_SECRET)) return res.status(401).json({ error: 'No autorizado' });

    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });

    const { asunto, mensaje, professionalIds } = req.body;
    if (!asunto?.trim() || !mensaje?.trim()) return res.status(400).json({ error: 'asunto y mensaje son requeridos' });

    // Destinatarios: todos, o los IDs seleccionados
    let query = supabase.from('professionals').select('name, email').neq('email', '');
    if (Array.isArray(professionalIds) && professionalIds.length) query = query.in('id', professionalIds);
    const { data: pros, error: fetchErr } = await query;
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!pros || pros.length === 0) return res.status(200).json({ sent: 0, message: 'Sin destinatarios' });

    const seen = new Set<string>();
    const unique = (pros as { name: string; email: string }[]).filter(r => {
      if (!EMAIL_RE.test(r.email) || seen.has(r.email.toLowerCase())) return false;
      seen.add(r.email.toLowerCase()); return true;
    });

    const FROM = (process.env.EMAIL_FROM || 'Clínica Maslife <notificaciones@clinicamaslife.cl>').trim();
    const cleanAsunto = cleanLine(asunto);
    let sent = 0;
    const chunk = 100;
    for (let i = 0; i < unique.length; i += chunk) {
      const batch = unique.slice(i, i + chunk).map(r => ({
        from: FROM,
        to: [r.email],
        subject: cleanAsunto,
        html: charlaBlastHtml(r.name, cleanAsunto, mensaje),
      }));
      const batchRes = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (batchRes.ok) sent += batch.length;
    }
    return res.status(200).json({ sent, total: unique.length });
  }

  // Rama de diagnóstico: registrar errores del cliente (p. ej. fallos del Brick
  // de MercadoPago) en los logs del servidor sin necesidad de un endpoint extra.
  if (req.body?.clientError) {
    try {
      console.error('[client-error]', JSON.stringify(req.body).slice(0, 2000));
    } catch {
      console.error('[client-error] cuerpo no parseable');
    }
    return res.status(200).json({ logged: true });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });

  const { to: toRaw, professionalId, professionalName, patientName, serviceName, date, time, type, patientEmail, isReceipt, transactionRef, price, duration } = req.body;

  // El perfil público ya no expone el email del profesional (Ley 21.719):
  // el cliente envía professionalId y el email se resuelve aquí con service role.
  let to = typeof toRaw === 'string' ? toRaw : '';
  const PRO_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!EMAIL_RE.test(to) && typeof professionalId === 'string' && PRO_UUID_RE.test(professionalId)) {
    const { data: proRow } = await supabase
      .from('professionals').select('email').eq('id', professionalId).maybeSingle();
    if (proRow?.email) to = proRow.email as string;
  }

  if (!to || !patientName) return res.status(400).json({ error: 'Faltan campos requeridos' });

  if (!EMAIL_RE.test(to)) return res.status(400).json({ error: 'Email de destinatario inválido' });
  if (patientEmail && !EMAIL_RE.test(patientEmail)) return res.status(400).json({ error: 'Email de paciente inválido' });

  // Limpia saltos de línea/espacios accidentales en la variable de entorno
  const FROM = (process.env.EMAIL_FROM || 'Clínica Maslife <notificaciones@clinicamaslife.cl>').trim();

  // Generar invitación .ics solo para confirmaciones (no comprobantes de pago),
  // y solo si el date tiene formato YYYY-MM-DD. Cada destinatario recibe su propia
  // invitación (él mismo como ATTENDEE), compartiendo el mismo UID del evento.
  const canInvite = !isReceipt && date && time && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const appDuration = typeof duration === 'number' && duration > 0 ? duration : 60;
  const eventUid = `${Date.now()}-${Math.random().toString(36).slice(2)}@clinicamaslife.cl`;
  const icsSummary = `Atención: ${serviceName || 'Consulta'} – ${professionalName}`;
  const icsDescription = `Paciente: ${patientName}\nProfesional: ${professionalName}\nServicio: ${serviceName || 'Consulta'}\nModalidad: ${type || 'Presencial'}\n\nClínica Maslife – clinicamaslife.cl`;

  // `to` is the professional's email — use it as ORGANIZER so RSVPs reach the doctor directly
  const buildInvite = (attendeeName: string, attendeeEmail: string) => generateIcs({
    date, time, duration: appDuration,
    summary: icsSummary,
    description: icsDescription,
    uid: eventUid,
    organizerName: professionalName || 'Clínica Maslife',
    organizerEmail: EMAIL_RE.test(to) ? to : FALLBACK_ORGANIZER,
    attendeeName,
    attendeeEmail,
  });

  try {
    const sends: Promise<any>[] = [];

    const subjName = cleanLine(patientName);
    const subjService = cleanLine(serviceName);

    if (isReceipt) {
      sends.push(sendEmail(RESEND_API_KEY, FROM, to,
        `Pago confirmado – ${subjName}`,
        paymentReceiptHtml({ patientName, doctorName: professionalName, serviceName, date, time, transactionRef, price })
      ));
    } else {
      sends.push(sendEmail(RESEND_API_KEY, FROM, to,
        `Nueva cita agendada – ${subjName}`,
        professionalNewBookingHtml({ professionalName, patientName, serviceName, date, time, type }),
        canInvite ? buildInvite(professionalName || 'Profesional', to) : undefined
      ));
    }

    if (patientEmail) {
      if (isReceipt) {
        sends.push(sendEmail(RESEND_API_KEY, FROM, patientEmail,
          `Comprobante de pago – ${subjService}`,
          paymentReceiptHtml({ patientName, doctorName: professionalName, serviceName, date, time, transactionRef, price })
        ));
      } else {
        sends.push(sendEmail(RESEND_API_KEY, FROM, patientEmail,
          `Tu cita ha sido confirmada – ${subjService}`,
          patientConfirmationHtml({ patientName, doctorName: professionalName, serviceName, date, time, type, price }),
          canInvite ? buildInvite(patientName, patientEmail) : undefined
        ));
      }
    }

    const results = await Promise.all(sends);
    return res.status(200).json({ success: true, ids: results.map(r => r.id) });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
