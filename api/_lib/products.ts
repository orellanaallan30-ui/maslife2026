// Catálogo de productos digitales propios. El precio vive SOLO aquí (servidor):
// el cliente nunca lo envía ni lo puede cambiar.

export interface Product {
  slug: string;
  name: string;
  price: number;      // CLP, entero
  filePath: string;   // ruta dentro del bucket privado `ebook-files`
  fileName: string;   // nombre con el que se descarga
  active: boolean;
}

const BASE: Omit<Product, 'active'>[] = [
  {
    slug: 'programa-lumbar-4-semanas',
    name: 'Programa de ejercicios para el dolor lumbar · 4 semanas',
    price: 9990,
    filePath: 'programa-lumbar-4-semanas.pdf',
    fileName: 'Programa-lumbar-4-semanas.pdf',
  },
];

/**
 * La venta se habilita con la variable de entorno EBOOK_PROGRAMA_LUMBAR_ACTIVO=1.
 * Debe encenderse solo cuando un kinesiólogo haya aprobado el contenido por escrito.
 */
export function getProduct(slug: string): Product | null {
  const p = BASE.find(b => b.slug === slug);
  if (!p) return null;
  return { ...p, active: process.env.EBOOK_PROGRAMA_LUMBAR_ACTIVO === '1' };
}
