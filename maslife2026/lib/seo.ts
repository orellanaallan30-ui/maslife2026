import { useEffect } from 'react';

// SEO en cliente para la SPA: Google ejecuta JS, así que mutar el <head> por ruta
// (título, descripción, canonical, OG) sí cuenta para indexación y para el aspecto
// del link al compartir. Al desmontar se restauran los valores por defecto de la
// home (los del index.html), que se capturan una sola vez al primer uso.

const SITE = 'https://clinicamaslife.cl';

let defaults: {
  title: string; description: string; canonical: string;
  ogTitle: string; ogDescription: string; ogUrl: string; ogImage: string;
} | null = null;

function metaEl(selector: string, create: () => HTMLElement): HTMLElement {
  let el = document.head.querySelector(selector) as HTMLElement | null;
  if (!el) { el = create(); document.head.appendChild(el); }
  return el;
}

function getSet(selector: string, attr: string, create: () => HTMLElement, value?: string): string {
  const el = metaEl(selector, create);
  const prev = el.getAttribute(attr) || '';
  if (value !== undefined) el.setAttribute(attr, value);
  return prev;
}

function applyMeta(m: { title: string; description: string; canonical: string; ogTitle: string; ogDescription: string; ogUrl: string; ogImage: string }) {
  document.title = m.title;
  getSet('meta[name="description"]', 'content', () => { const e = document.createElement('meta'); e.setAttribute('name', 'description'); return e; }, m.description);
  getSet('link[rel="canonical"]', 'href', () => { const e = document.createElement('link'); e.setAttribute('rel', 'canonical'); return e; }, m.canonical);
  getSet('meta[property="og:title"]', 'content', () => { const e = document.createElement('meta'); e.setAttribute('property', 'og:title'); return e; }, m.ogTitle);
  getSet('meta[property="og:description"]', 'content', () => { const e = document.createElement('meta'); e.setAttribute('property', 'og:description'); return e; }, m.ogDescription);
  getSet('meta[property="og:url"]', 'content', () => { const e = document.createElement('meta'); e.setAttribute('property', 'og:url'); return e; }, m.ogUrl);
  getSet('meta[property="og:image"]', 'content', () => { const e = document.createElement('meta'); e.setAttribute('property', 'og:image'); return e; }, m.ogImage);
}

function captureDefaults() {
  if (defaults) return;
  defaults = {
    title: document.title,
    description: (document.head.querySelector('meta[name="description"]') as HTMLMetaElement)?.content || '',
    canonical: (document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement)?.href || SITE + '/',
    ogTitle: (document.head.querySelector('meta[property="og:title"]') as HTMLMetaElement)?.content || '',
    ogDescription: (document.head.querySelector('meta[property="og:description"]') as HTMLMetaElement)?.content || '',
    ogUrl: (document.head.querySelector('meta[property="og:url"]') as HTMLMetaElement)?.content || SITE + '/',
    ogImage: (document.head.querySelector('meta[property="og:image"]') as HTMLMetaElement)?.content || SITE + '/og-card.svg',
  };
}

/**
 * Setea título/descripción/canonical/OG de la página. Se restaura al desmontar.
 * canonicalPath debe empezar con '/' (ej: '/unete', `/p/${slug}`).
 */
export function usePageMeta(opts: { title: string; description: string; canonicalPath: string; image?: string } | null) {
  useEffect(() => {
    if (!opts || !opts.title) return;
    captureDefaults();
    applyMeta({
      title: opts.title,
      description: opts.description,
      canonical: SITE + opts.canonicalPath,
      ogTitle: opts.title,
      ogDescription: opts.description,
      ogUrl: SITE + opts.canonicalPath,
      ogImage: opts.image || defaults!.ogImage,
    });
    return () => { if (defaults) applyMeta(defaults); };
    // Serializamos para no re-ejecutar por identidad del objeto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.title, opts?.description, opts?.canonicalPath, opts?.image]);
}

/** Inyecta un bloque JSON-LD (schema.org) propio de la página; se remueve al desmontar. */
export function useJsonLd(id: string, data: object | null) {
  useEffect(() => {
    if (!data) return;
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = `jsonld-${id}`;
    el.textContent = JSON.stringify(data);
    document.head.appendChild(el);
    return () => { document.getElementById(`jsonld-${id}`)?.remove(); };
  }, [id, JSON.stringify(data)]);
}
