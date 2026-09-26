import { describe, it, expect } from 'vitest';
import { extraerJSON, normalizarInforme, informeATexto, limpiarInformeAntiguo } from '../lib/informePostural';

const respuesta = {
  resumen: 'Postura con **cabeza adelantada** y leve desnivel de hombros. Sin signos de alarma.',
  hallazgos: [
    { zona: 'Cervical', titulo: 'Cabeza adelantada', detalle: 'La oreja queda por delante del hombro en las dos vistas laterales.', severidad: 'atencion' },
    { zona: 'Hombros', titulo: 'Hombro derecho más bajo', detalle: 'Diferencia leve en la vista anterior.', severidad: 'rara' },
  ],
  recomendaciones: ['Ejercicios de control cervical', '# Fortalecer escapulares'],
  limitaciones: 'Foto sin pies visibles.',
  relacion_clinica: 'El **desnivel pélvico** es coherente con la lumbalgia derecha referida.',
  precauciones: ['Artrodesis lumbar previa: evitar flexión cargada', 'x', 'y', 'z'],
};

describe('informe postural', () => {
  it('lee JSON puro, con cerco y con texto alrededor', () => {
    const j = JSON.stringify(respuesta);
    expect(extraerJSON(j)).toBeTruthy();
    expect(extraerJSON('```json\n' + j + '\n```')).toBeTruthy();
    expect(extraerJSON('Aquí va:\n' + j + '\nFin')).toBeTruthy();
    expect(extraerJSON('sin json')).toBeNull();
    expect(extraerJSON('{roto')).toBeNull();
  });

  it('normaliza: limpia markdown, corrige severidades y mapea hallazgos', () => {
    const r = normalizarInforme(extraerJSON(JSON.stringify(respuesta)), 'Postural')!;
    expect(r.resumen).not.toContain('**');
    expect(r.metricas).toHaveLength(2);
    expect(r.metricas[0]).toMatchObject({ nombre: 'Cabeza adelantada', zona: 'Cervical', severidad: 'atencion' });
    expect(r.metricas[1].severidad).toBe('atencion'); // "rara" no es válida
    expect(r.recomendaciones).toEqual(['Ejercicios de control cervical', 'Fortalecer escapulares']);
    expect(r.relacion_clinica).toBe('El desnivel pélvico es coherente con la lumbalgia derecha referida.');
    expect(r.precauciones).toHaveLength(3);
  });

  it('rechaza un informe vacío', () => {
    expect(normalizarInforme({ foo: 1 })).toBeNull();
    expect(normalizarInforme(null)).toBeNull();
  });

  it('el texto guardado no lleva símbolos de markdown ni JSON', () => {
    const t = informeATexto(normalizarInforme(extraerJSON(JSON.stringify(respuesta)), 'Postural')!);
    expect(t).toMatch(/^INFORME POSTURAL/);
    expect(t).toContain('RESUMEN');
    expect(t).toContain('RELACIÓN CON LA FICHA');
    expect(t).toContain('PRECAUCIONES');
    expect(t).not.toMatch(/\*\*|#|\{/);
  });

  it('limpia informes antiguos en markdown', () => {
    const viejo = '# INFORME KINESIOLÓGICO\n\n**Tipo de estudio:** fotos\n--\n## 1. HALLAZGOS\n- **Hombros** asimétricos\n- Pelvis no valorable\n\n```json\n{"metricas":[]}\n```';
    const b = limpiarInformeAntiguo(viejo);
    const plano = JSON.stringify(b);
    expect(plano).not.toMatch(/\*\*|#|metricas|--/);
    expect(b[0]).toEqual({ tipo: 'titulo', texto: 'INFORME KINESIOLÓGICO' });
    expect(b.find(x => x.tipo === 'lista')).toEqual({ tipo: 'lista', items: ['Hombros asimétricos', 'Pelvis no valorable'] });
  });
});
