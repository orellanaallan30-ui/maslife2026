import { describe, it, expect } from 'vitest';

// Tests de la versión en texto plano de los correos.
//
// Contexto: ningún correo llevaba parte de texto, lo que penaliza en los filtros
// antispam y deja fuera a quien lee en modo texto o con lector de pantalla. En
// vez de escribir once versiones a mano —que se desincronizarían a la primera
// edición— se deriva del propio HTML.
//
// Lo que se protege aquí es justamente lo que puede salir mal al derivarla: que
// se cuele CSS, que el preheader oculto aparezca como basura al principio, o que
// las entidades lleguen sin decodificar a la bandeja del paciente.

import { htmlAtexto } from '../../api/_lib/emailText';

describe('htmlAtexto', () => {
  it('descarta la cabecera del documento y las hojas de estilo', () => {
    const t = htmlAtexto(`<!DOCTYPE html><html><head><title>X</title>
      <style>.a{background-color:#fff;font-family:Arial}</style></head>
      <body><p>Hola</p></body></html>`);
    expect(t).toBe('Hola');
  });

  it('elimina el preheader oculto y su relleno invisible', () => {
    // Es el div display:none de emailShell: repite el subtítulo y lo sigue de 30
    // rellenos invisibles. Sin quitarlo, el correo en texto empieza con basura.
    const relleno = '&#8199;&#65279;&#847; '.repeat(30);
    const t = htmlAtexto(
      `<div style="display:none;font-size:1px;mso-hide:all;">Tu hora quedó reservada${relleno}</div><p>Contenido</p>`
    );
    expect(t).toBe('Contenido');
  });

  it('conserva el nombre de la marca desde el alt del logo', () => {
    const t = htmlAtexto('<img src="x.png" alt="Clínica Mas Life · Agenda Online"><p>Hola</p>');
    expect(t.startsWith('Clínica Mas Life · Agenda Online')).toBe(true);
  });

  it('acompaña cada enlace de su dirección', () => {
    const t = htmlAtexto('<a href="https://ejemplo.cl/r?x=1">Dejar mi calificación</a>');
    expect(t).toBe('Dejar mi calificación (https://ejemplo.cl/r?x=1)');
  });

  it('no repite la dirección cuando el texto del enlace ya es la dirección', () => {
    expect(htmlAtexto('<a href="https://clinicamaslife.cl">https://clinicamaslife.cl</a>'))
      .toBe('https://clinicamaslife.cl');
  });

  it('deja solo el texto cuando el enlace fue neutralizado a "#"', () => {
    // safeUrl convierte en "#" cualquier href que no sea http(s).
    expect(htmlAtexto('<a href="#">Ir a mi panel</a>')).toBe('Ir a mi panel');
  });

  it('decodifica las entidades en vez de mostrarlas crudas', () => {
    const t = htmlAtexto('<p>De parte de Nicolás O&#x27;Brien &amp; equipo, &quot;bienvenida&quot;</p>');
    expect(t).toBe('De parte de Nicolás O\'Brien & equipo, "bienvenida"');
    expect(t).not.toMatch(/&[a-z#0-9]+;/i);
  });

  it('separa etiqueta y valor de cada fila de datos', () => {
    const t = htmlAtexto('<table><tr><td>Fecha</td><td>2026-09-04</td></tr></table>');
    expect(t).toBe('Fecha 2026-09-04');
  });

  it('convierte las listas en viñetas legibles', () => {
    expect(htmlAtexto('<ol><li>Completa tu perfil</li><li>Agrega tus servicios</li></ol>'))
      .toBe('- Completa tu perfil\n- Agrega tus servicios');
  });

  it('respeta los saltos de línea escritos por el profesional', () => {
    expect(htmlAtexto('<div>Primera<br>Segunda</div>')).toBe('Primera\nSegunda');
  });

  it('no deja más de una línea en blanco seguida', () => {
    expect(htmlAtexto('<p>A</p><div></div><div></div><p>B</p>')).toBe('A\n\nB');
  });

  it('no deja ninguna etiqueta suelta', () => {
    const t = htmlAtexto('<table role="presentation"><tr><td style="x:y">Hola<br/></td></tr></table>');
    expect(t).not.toMatch(/<[a-z/][^>]*>/i);
  });
});
