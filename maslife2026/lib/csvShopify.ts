// Lectura del CSV que exporta Shopify (Productos → Exportar) para importar los
// productos a la tienda propia. Se procesa en el navegador; el servidor vuelve a
// validar todo antes de guardar.

export type CategoriaTienda = 'salud' | 'suplementos' | 'rehabilitacion' | 'bienestar';

export interface ProductoShopify {
  handle: string;
  nombre: string;
  descripcion: string;
  categoria: CategoriaTienda;
  sku: string;
  precioShopify: number | null; // solo de referencia: el precio sale de la fórmula
  costo: number | null;         // "Cost per item"; sin costo no se puede importar
  stock: number;
  imagenes: string[];
  activo: boolean;
}

/** Lector CSV (RFC 4180): comillas, comas, comillas dobles y saltos de línea dentro de campos. */
export function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; } else entreComillas = false;
      } else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some(v => v !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some(v => v !== '')) filas.push(fila);
  return filas;
}

const num = (v: string | undefined): number | null => {
  const s = String(v ?? '').trim().replace(/\$/g, '');
  if (!s) return null;
  // Shopify exporta con punto decimal ("13990.00"); se aceptan también miles con punto.
  const n = Number(/^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s.replace(/,/g, '.'));
  return Number.isFinite(n) ? n : null;
};

/** Sugiere la categoría según el tipo y las etiquetas de Shopify (Rodrigo la puede cambiar). */
export function sugerirCategoria(tipo: string, etiquetas: string, nombre: string): CategoriaTienda {
  const t = `${tipo} ${etiquetas} ${nombre}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/suplement|vitamin|capsul|colageno|magnesio|omega|proteina|whey|creatina|probiotic|zinc|melatonin/.test(t)) return 'suplementos';
  if (/rodiller|tobiller|faja|banda|ortes|ortop|rehabil|muñequer|munequer|soporte|kinesio|masajeador|compresion/.test(t)) return 'rehabilitacion';
  if (/salud|termometro|presion|oximetr|primeros auxilios/.test(t)) return 'salud';
  return 'bienestar';
}

/**
 * Agrupa las filas por Handle (Shopify usa varias filas por producto: variantes e
 * imágenes) y toma la primera variante. Devuelve los productos listos para revisar.
 */
export function productosDesdeCsv(texto: string): { productos: ProductoShopify[]; error?: string } {
  const filas = leerCsv(texto);
  if (filas.length < 2) return { productos: [], error: 'El archivo está vacío.' };
  const cab = filas[0].map(h => h.trim());
  const col = (nombre: string) => cab.indexOf(nombre);
  const iHandle = col('Handle');
  if (iHandle < 0 || col('Title') < 0) {
    return { productos: [], error: 'No parece un CSV de productos de Shopify (faltan las columnas Handle y Title).' };
  }
  const get = (f: string[], nombre: string) => { const i = col(nombre); return i >= 0 ? (f[i] ?? '').trim() : ''; };

  const porHandle = new Map<string, ProductoShopify & { tipo: string; tags: string }>();
  const orden: string[] = [];
  for (const f of filas.slice(1)) {
    const handle = f[iHandle]?.trim();
    if (!handle) continue;
    let p = porHandle.get(handle);
    if (!p) {
      p = {
        handle, nombre: '', descripcion: '', categoria: 'bienestar', sku: '', precioShopify: null, costo: null,
        stock: 0, imagenes: [], activo: true, tipo: '', tags: '',
      };
      porHandle.set(handle, p);
      orden.push(handle);
    }
    // Los datos del producto vienen en la primera fila con título; las siguientes traen variantes o imágenes.
    if (!p.nombre && get(f, 'Title')) {
      p.nombre = get(f, 'Title');
      p.descripcion = get(f, 'Body (HTML)');
      p.tipo = get(f, 'Type') || get(f, 'Product Category');
      p.tags = get(f, 'Tags');
      const estado = get(f, 'Status').toLowerCase();
      p.activo = !estado || estado === 'active';
    }
    if (!p.sku && get(f, 'Variant SKU')) p.sku = get(f, 'Variant SKU');
    if (p.precioShopify === null) p.precioShopify = num(get(f, 'Variant Price'));
    if (p.costo === null) p.costo = num(get(f, 'Cost per item'));
    const stock = num(get(f, 'Variant Inventory Qty'));
    if (stock !== null && p.stock === 0) p.stock = Math.max(0, Math.round(stock));
    for (const nombreCol of ['Image Src', 'Variant Image']) {
      const img = get(f, nombreCol);
      if (img && /^https:\/\//.test(img) && !p.imagenes.includes(img)) p.imagenes.push(img);
    }
  }
  const productos = orden.map(h => porHandle.get(h)!).filter(p => p.nombre).map(({ tipo, tags, ...p }) => ({
    ...p,
    costo: p.costo !== null && p.costo > 0 ? Math.round(p.costo) : null,
    precioShopify: p.precioShopify !== null && p.precioShopify > 0 ? Math.round(p.precioShopify) : null,
    categoria: sugerirCategoria(tipo, tags, p.nombre),
    imagenes: p.imagenes.slice(0, 8),
  }));
  if (productos.length === 0) return { productos, error: 'No encontré productos en el archivo.' };
  return { productos };
}
