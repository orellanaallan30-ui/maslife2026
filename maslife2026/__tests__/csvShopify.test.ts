import { describe, it, expect } from 'vitest';
import { leerCsv, productosDesdeCsv, sugerirCategoria } from '../lib/csvShopify';

const CAB = 'Handle,Title,Body (HTML),Vendor,Type,Tags,Status,Variant SKU,Variant Price,Variant Inventory Qty,Cost per item,Image Src';

describe('lector CSV', () => {
  it('maneja comillas, comas y saltos de línea dentro de un campo', () => {
    const filas = leerCsv('a,b\r\n"hola, ""mundo""","línea 1\nlínea 2"\n');
    expect(filas).toEqual([['a', 'b'], ['hola, "mundo"', 'línea 1\nlínea 2']]);
  });

  it('ignora el BOM y las filas vacías', () => {
    expect(leerCsv('﻿x,y\n\n1,2')).toEqual([['x', 'y'], ['1', '2']]);
  });
});

describe('productos desde el CSV de Shopify', () => {
  it('agrupa por Handle, toma la primera variante y junta las imágenes', () => {
    const csv = [
      CAB,
      'magnesio,Magnesio 120 cápsulas,"<p>Alta absorción, 2 al día</p>",Marca,Suplementos,vitaminas,active,MAG-1,19990.00,12,8000.00,https://cdn.shopify.com/a.jpg',
      'magnesio,,,,,,,,,,,https://cdn.shopify.com/b.jpg',
      'rodillera,Rodillera ortopédica,Soporte,Marca,,,active,ROD-M,24990,3,,https://cdn.shopify.com/c.jpg',
      'borrador,Producto viejo,,,,,draft,,9990,0,4000,',
    ].join('\n');
    const { productos, error } = productosDesdeCsv(csv);
    expect(error).toBeUndefined();
    expect(productos).toHaveLength(3);
    expect(productos[0]).toMatchObject({
      handle: 'magnesio', nombre: 'Magnesio 120 cápsulas', sku: 'MAG-1', precioShopify: 19990, costo: 8000,
      stock: 12, categoria: 'suplementos', activo: true,
      imagenes: ['https://cdn.shopify.com/a.jpg', 'https://cdn.shopify.com/b.jpg'],
    });
    expect(productos[0].descripcion).toBe('<p>Alta absorción, 2 al día</p>');
    // Sin "Cost per item": queda marcado para completar antes de importar.
    expect(productos[1]).toMatchObject({ nombre: 'Rodillera ortopédica', costo: null, categoria: 'rehabilitacion', stock: 3 });
    expect(productos[2]).toMatchObject({ activo: false });
  });

  it('rechaza archivos que no son de Shopify', () => {
    expect(productosDesdeCsv('nombre,precio\nA,1').error).toMatch(/Shopify/);
    expect(productosDesdeCsv('').error).toBeTruthy();
  });

  it('sugiere categorías', () => {
    expect(sugerirCategoria('', 'colágeno', '')).toBe('suplementos');
    expect(sugerirCategoria('Ortesis', '', '')).toBe('rehabilitacion');
    expect(sugerirCategoria('', '', 'Aceite de lavanda')).toBe('bienestar');
  });
});
