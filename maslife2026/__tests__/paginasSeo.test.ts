import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { aplicarSeo } from '../seo/aplicarSeo.mjs';
import { ETIQUETAS_LANDING, esRutaLanding } from '../lib/paginasLanding';

const raiz = join(__dirname, '..');
const plantilla = readFileSync(join(raiz, 'index.html'), 'utf8');
const paginas: Array<{ slug: string; title: string; etiqueta: string; jsonld: object }> =
  JSON.parse(readFileSync(join(raiz, 'seo', 'paginas.json'), 'utf8'));

const ldDe = (html: string) => {
  const bloques = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return bloques.map(b => JSON.parse(b[1]));
};

describe('páginas por ciudad = landing oficial con SEO propio', () => {
  it('las rutas de la app y los datos de SEO listan las mismas páginas', () => {
    expect(Object.keys(ETIQUETAS_LANDING).sort()).toEqual(paginas.map(p => p.slug).sort());
    for (const p of paginas) expect(ETIQUETAS_LANDING[p.slug]).toBe(p.etiqueta);
  });

  it('cada página conserva la app de la landing y cambia título, canonical y datos estructurados', () => {
    for (const p of paginas) {
      const html = aplicarSeo(plantilla, p as never);
      expect(html).toContain('<div id="root"></div>');
      expect(html).toContain('src="/index.tsx"');
      expect(html).toContain(`<link rel="canonical" href="https://clinicamaslife.cl/${p.slug}">`);
      expect(html).toContain(`content="https://clinicamaslife.cl/${p.slug}"`);
      const ld = ldDe(html);
      expect(ld).toHaveLength(1);
      expect(ld[0]).toEqual(p.jsonld);
    }
  });

  it('no publica datos falsos: sin teléfono de relleno, sin Fonasa, sin FAQ que no se ve en la página', () => {
    for (const p of paginas) {
      const html = aplicarSeo(plantilla, p as never);
      const ld = JSON.stringify(ldDe(html));
      expect(ld).not.toMatch(/XXXX/);
      expect(ld).not.toMatch(/fonasa/i);
      expect(ld).not.toContain('FAQPage');
    }
  });

  it('escapa el texto para que no pueda romper el HTML', () => {
    const html = aplicarSeo(plantilla, { ...paginas[0], title: 'A "B" <C>', jsonld: { x: '</script><b>' } } as never);
    expect(html).toContain('<title>A &quot;B&quot; &lt;C&gt;</title>');
    expect(html).not.toContain('</script><b>');
  });

  it('reconoce las rutas de landing y rechaza otras', () => {
    expect(esRutaLanding('/')).toBe(true);
    expect(esRutaLanding('/kinesiologia-ovalle')).toBe(true);
    expect(esRutaLanding('/kinesiologia-ovalle/')).toBe(true);
    expect(esRutaLanding('/pro/login')).toBe(false);
    expect(esRutaLanding('/constructor')).toBe(false);
  });
});
