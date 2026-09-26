// Genera, a partir del index.html de la landing, la versión de cada página por
// ciudad/especialidad: misma app y mismo diseño, con su propio título, descripción,
// canonical y datos estructurados para Google. Lo usa scripts/generar-paginas-seo.mjs
// después del build y lo prueba __tests__/paginasSeo.test.ts.

const SITIO = 'https://clinicamaslife.cl';

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Reemplaza exactamente una coincidencia; si no hay o hay varias, falla (mejor romper el build que publicar datos equivocados). */
function reemplazarUna(html, patron, reemplazo, nombre) {
  const coincidencias = html.match(new RegExp(patron.source, patron.flags.includes('g') ? patron.flags : patron.flags + 'g'));
  const n = coincidencias ? coincidencias.length : 0;
  if (n !== 1) throw new Error(`[paginas-seo] "${nombre}": se esperaba 1 coincidencia y hay ${n}`);
  // Siempre como función: con un string, JS interpreta "$$", "$1"… y altera el texto (p. ej. priceRange "$$").
  return html.replace(patron, typeof reemplazo === 'function' ? reemplazo : () => reemplazo);
}

/**
 * @param {string} html index.html de la landing (ya construido)
 * @param {{slug:string,title:string,description:string,keywords?:string,ogTitle?:string,ogDescription?:string,geoPlacename?:string,geoPosition?:string,jsonld:object}} p
 * @returns {string}
 */
export function aplicarSeo(html, p) {
  const url = `${SITIO}/${p.slug}`;
  const ogTitle = p.ogTitle || p.title;
  const ogDesc = p.ogDescription || p.description;
  const meta = (atributo, clave, valor, h) =>
    reemplazarUna(h, new RegExp(`(<meta\\s+${atributo}="${clave}"\\s+content=")[^"]*(")`), (_, a, b) => a + attr(valor) + b, clave);

  let h = html;
  h = reemplazarUna(h, /<title>[^<]*<\/title>/, `<title>${attr(p.title)}</title>`, 'title');
  h = meta('name', 'description', p.description, h);
  if (p.keywords) h = meta('name', 'keywords', p.keywords, h);
  h = reemplazarUna(h, /(<link\s+rel="canonical"\s+href=")[^"]*(")/, (_, a, b) => a + url + b, 'canonical');
  h = meta('property', 'og:url', url, h);
  h = meta('property', 'og:title', ogTitle, h);
  h = meta('property', 'og:description', ogDesc, h);
  h = meta('name', 'twitter:title', ogTitle, h);
  h = meta('name', 'twitter:description', ogDesc, h);
  if (p.geoPlacename) h = meta('name', 'geo.placename', p.geoPlacename, h);
  if (p.geoPosition) h = meta('name', 'geo.position', p.geoPosition, h);
  // "<" escapado para que ningún texto pueda cerrar el <script>.
  const ld = JSON.stringify(p.jsonld, null, 2).replace(/</g, '\\u003c');
  h = reemplazarUna(h, /<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">\n${ld}\n    </script>`, 'ld+json');
  return h;
}
