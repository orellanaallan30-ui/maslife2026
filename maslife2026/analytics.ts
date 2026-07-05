// analytics.ts — Medición para campañas (Meta Pixel + Google GA4 / Google Ads).
//
// Diseño clave: TODO es opcional y "no-op" si no hay IDs configurados. Los IDs se
// cargan desde variables de entorno de Vite (se ponen en Vercel), así la analítica
// se activa sin tocar código:
//   VITE_META_PIXEL_ID   → ID del píxel de Meta (Facebook/Instagram)
//   VITE_GA4_ID          → ID de medición GA4 (formato G-XXXXXXX)
//   VITE_GOOGLE_ADS_ID   → ID de Google Ads (formato AW-XXXXXXXXX) para conversiones
//
// Ningún evento puede romper la app: todo va envuelto en try/catch.

type Params = Record<string, unknown>;

const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;
const GA4_ID = import.meta.env.VITE_GA4_ID as string | undefined;
const ADS_ID = import.meta.env.VITE_GOOGLE_ADS_ID as string | undefined;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

let initialized = false;
let utms: Params = {};

// Captura UTMs del enlace del anuncio (utm_source, utm_medium, utm_campaign…) y los
// persiste, para atribuir después las reservas/registros a la campaña que los trajo.
function captureUTMs(): void {
  try {
    const q = new URLSearchParams(window.location.search);
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    const found: Params = {};
    keys.forEach(k => { const v = q.get(k); if (v) found[k] = v; });
    if (Object.keys(found).length) {
      localStorage.setItem('maslife_utms', JSON.stringify(found));
    }
    const stored = localStorage.getItem('maslife_utms');
    utms = stored ? JSON.parse(stored) : {};
  } catch { utms = {}; }
}

function loadMetaPixel(id: string): void {
  /* eslint-disable */
  // Snippet oficial de Meta Pixel.
  (function (f: any, b: any, e: string, v: string) {
    if (f.fbq) return;
    const n: any = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    const t = b.createElement(e); t.async = true; t.src = v;
    const s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  window.fbq!('init', id);
  window.fbq!('track', 'PageView');
}

function loadGoogleTag(): void {
  const primary = GA4_ID || ADS_ID;
  if (!primary) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${primary}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer!.push(arguments); };
  window.gtag('js', new Date());
  if (GA4_ID) window.gtag('config', GA4_ID);
  if (ADS_ID) window.gtag('config', ADS_ID);
}

/** Inicializa la analítica una sola vez (llamar al arrancar la app). No-op sin IDs. */
export function initAnalytics(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  try {
    captureUTMs();
    if (META_PIXEL_ID) loadMetaPixel(META_PIXEL_ID);
    if (GA4_ID || ADS_ID) loadGoogleTag();
  } catch { /* la analítica nunca debe romper la app */ }
}

// Envía un evento a Meta y a Google (los que estén configurados). Nunca lanza.
function track(metaEvent: string, gaEvent: string, params: Params = {}): void {
  try {
    if (window.fbq) window.fbq('track', metaEvent, params);
    if (window.gtag) window.gtag('event', gaEvent, { ...utms, ...params });
  } catch { /* silencioso — es solo medición */ }
}

// ── Eventos de conversión del embudo (los que optimizan las campañas) ──
export const trackViewProfile = (slug?: string) =>
  track('ViewContent', 'view_profile', { content_type: 'professional', content_ids: slug ? [slug] : [] });

export const trackStartBooking = (value?: number) =>
  track('InitiateCheckout', 'begin_checkout', value ? { value, currency: 'CLP' } : {});

export const trackBookingConfirmed = (value?: number) =>
  track('Purchase', 'booking_confirmed', value ? { value, currency: 'CLP' } : {});

export const trackProRegistration = () =>
  track('CompleteRegistration', 'pro_signup', {});

export const trackSubscriptionClick = () =>
  track('Subscribe', 'subscription_click', {});
