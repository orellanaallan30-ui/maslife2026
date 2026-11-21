import { describe, it, expect } from 'vitest';
import { cleanSuggestion } from '../../api/_lib/sugerencias';

describe('temas propuestos para próximas guías', () => {
  it('limpia espacios y acepta un tema válido sin correo', () => {
    expect(cleanSuggestion({ tema: '  dolor de   rodilla\nal subir escaleras ', slug: 'programa-lumbar-4-semanas', origen: 'pagina' }))
      .toEqual({ tema: 'dolor de rodilla al subir escaleras', email: null, product_slug: 'programa-lumbar-4-semanas', origen: 'pagina' });
  });

  it('guarda el correo solo si es válido', () => {
    expect(cleanSuggestion({ tema: 'cuello', email: 'Ana@Mail.cl' })?.email).toBe('ana@mail.cl');
    expect(cleanSuggestion({ tema: 'cuello', email: 'no-es-correo' })?.email).toBeNull();
  });

  it('rechaza temas vacíos o demasiado largos', () => {
    expect(cleanSuggestion({ tema: 'ab' })).toBeNull();
    expect(cleanSuggestion({ tema: 'x'.repeat(401) })).toBeNull();
    expect(cleanSuggestion(null)).toBeNull();
  });

  it('descarta slug u origen con formato extraño', () => {
    const s = cleanSuggestion({ tema: 'hombro', slug: "x'; drop", origen: 'otro' });
    expect(s?.product_slug).toBeNull();
    expect(s?.origen).toBeNull();
  });
});
