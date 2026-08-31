// Versión en texto plano de los correos.
//
// Vive en _lib —que no cuenta para el límite de 12 funciones de Vercel— porque
// lo usan tanto notify.ts como sus tests, y arrastrar el handler entero a la
// suite obligaba a simular el cliente de Supabase e importaba tipos de
// @vercel/node que el front no tiene instalados.

/**
 * Versión en texto plano a partir del HTML del propio correo.
 *
 * Ningún correo llevaba parte de texto. Un mensaje solo-HTML puntúa peor en los
 * filtros antispam, y además hay quien lee en modo texto o con lector de
 * pantalla. Se genera del mismo HTML en vez de escribirse a mano para que las
 * dos versiones no puedan decir cosas distintas cuando alguien edite una
 * plantilla.
 *
 * Los enlaces se conservan como «texto (url)»: en texto plano un enlace sin su
 * dirección es un callejón sin salida.
 */
export function htmlAtexto(html: string): string {
  return html
    // La cabecera del documento, los estilos y el bloque condicional de Outlook
    // no son contenido.
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // El preheader va oculto y repite el subtítulo, seguido de 30 rellenos
    // invisibles. Si no se quita, el texto plano empieza con esa basura.
    .replace(/<div[^>]*display:\s*none[\s\S]*?<\/div>/gi, '')
    // Saltos y fin de bloque → nueva línea. Los <li> se marcan como lista.
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    // `li` no va en esta lista: la apertura ya abre línea, y cerrarla también
    // dejaba los pasos a doble espacio.
    .replace(/<\/(p|div|tr|h1|h2|h3|h4|ul|ol|table|section)>/gi, '\n')
    // Las celdas se separan con espacio para que "Fecha" y su valor no se peguen.
    .replace(/<\/t[dh]>/gi, ' ')
    // Enlace con su dirección, salvo que el texto ya sea la propia dirección.
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, url, txt) => {
      const t = String(txt).replace(/<[^>]+>/g, '').trim();
      if (!url || url === '#') return t;
      return t && t !== url ? `${t} (${url})` : url;
    })
    // El `alt` del logo es el nombre de la marca: sin esto el texto plano
    // arrancaba en "clinicamaslife.cl", sin decir de quién es el correo.
    .replace(/<img[^>]*alt=["']([^"']+)["'][^>]*>/gi, '$1\n')
    .replace(/<[^>]+>/g, '')
    // Entidades: primero las nombradas, y &amp; al final para no des-escapar de más.
    .replace(/&nbsp;|&#8199;|&#65279;|&#847;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&amp;/g, '&')
    // Espacios de sobra al final de línea y más de una línea en blanco seguida.
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
