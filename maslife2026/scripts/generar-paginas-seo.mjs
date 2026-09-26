// Después de `vite build`: crea dist/<slug>/index.html para cada página por
// ciudad/especialidad de seo/paginas.json. Todas cargan la misma landing (mismo
// diseño); solo cambian los datos para Google. Si algo no calza, falla el build
// para no publicar páginas con datos equivocados.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { aplicarSeo } from '../seo/aplicarSeo.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');
const plantilla = readFileSync(join(dist, 'index.html'), 'utf8');
const paginas = JSON.parse(readFileSync(join(raiz, 'seo', 'paginas.json'), 'utf8'));

for (const p of paginas) {
  mkdirSync(join(dist, p.slug), { recursive: true });
  writeFileSync(join(dist, p.slug, 'index.html'), aplicarSeo(plantilla, p));
}
console.log(`[paginas-seo] ${paginas.length} páginas generadas con la landing oficial`);
