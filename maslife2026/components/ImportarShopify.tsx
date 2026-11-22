import React, { useState } from 'react';
import { productosDesdeCsv, type ProductoShopify, type CategoriaTienda } from '../lib/csvShopify';

// Tarjeta del panel admin: importa los productos del CSV que exporta Shopify
// (Productos → Exportar). Se revisan aquí (categoría, costo, stock, registro
// sanitario) y se crean como BORRADOR; las fotos las copia el servidor.

type AdminFetch = (method: string, body?: object, action?: string) => Promise<Response>;
type Fila = ProductoShopify & { incluir: boolean; registro: string };

const CATEGORIAS: Array<{ id: CategoriaTienda; label: string }> = [
  { id: 'suplementos', label: 'Suplementos' }, { id: 'rehabilitacion', label: 'Rehabilitación' },
  { id: 'salud', label: 'Salud' }, { id: 'bienestar', label: 'Bienestar' },
];
const TANDA = 10; // productos por envío (el servidor acepta hasta 20)
const clp = (n: number | null) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-CL')}`);
const input = 'rounded-lg border-2 border-slate-200 px-2 py-1 text-sm outline-none focus:border-teal-500';

export const ImportarShopify: React.FC<{ adminFetch: AdminFetch; alTerminar: () => void }> = ({ adminFetch, alTerminar }) => {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState('');
  const [progreso, setProgreso] = useState('');
  const [resultado, setResultado] = useState<Array<{ nombre: string; ok: boolean; error?: string; fotos: number; fotosFallidas: number }> | null>(null);

  const leer = (file: File) => {
    setError(''); setResultado(null);
    if (file.size > 10 * 1024 * 1024) { setError('El archivo pesa más de 10 MB.'); return; }
    const lector = new FileReader();
    lector.onload = () => {
      const { productos, error: e } = productosDesdeCsv(String(lector.result || ''));
      if (e) { setError(e); setFilas(null); return; }
      setFilas(productos.map(p => ({ ...p, incluir: p.activo, registro: '' })));
    };
    lector.onerror = () => setError('No se pudo leer el archivo.');
    lector.readAsText(file, 'utf-8');
  };

  const cambiar = (i: number, c: Partial<Fila>) => setFilas(prev => prev!.map((f, j) => (j === i ? { ...f, ...c } : f)));
  const elegidas = (filas || []).filter(f => f.incluir);
  const faltaCosto = elegidas.filter(f => !(f.costo && f.costo > 0));

  const importar = async () => {
    if (!elegidas.length || faltaCosto.length) return;
    const todos: NonNullable<typeof resultado> = [];
    for (let i = 0; i < elegidas.length; i += TANDA) {
      setProgreso(`Importando ${Math.min(i + TANDA, elegidas.length)} de ${elegidas.length}… (copiando fotos)`);
      const tanda = elegidas.slice(i, i + TANDA).map(f => ({
        nombre: f.nombre, descripcion: f.descripcion, categoria: f.categoria, costo: f.costo, stock: f.stock,
        registro: f.registro.trim(), imagenes: f.imagenes,
      }));
      try {
        const r = await adminFetch('POST', { productos: tanda }, 'shop-import-csv');
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
        todos.push(...j.resultados);
      } catch (e: any) {
        tanda.forEach(t => todos.push({ nombre: t.nombre, ok: false, error: e?.message || 'Error de red', fotos: 0, fotosFallidas: 0 }));
      }
    }
    setProgreso(''); setResultado(todos); setFilas(null);
    alTerminar();
  };

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 lg:p-6">
      <h3 className="font-black text-slate-800">Importar desde Shopify (CSV)</h3>
      <p className="mt-1 text-xs text-slate-500">
        En Shopify: Productos → Exportar → CSV. Revisa costo, stock, categoría y registro sanitario antes de importar.
        Todo queda en borrador; las fotos se copian a tu tienda.
      </p>
      <label className="mt-3 inline-block cursor-pointer rounded-xl bg-slate-800 px-4 py-2 text-xs font-black uppercase tracking-widest text-white">
        Elegir archivo CSV
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) leer(f); }} />
      </label>
      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

      {filas && (
        <div className="mt-4">
          <p className="text-sm text-slate-600">
            {filas.length} productos en el archivo · {elegidas.length} seleccionados
            {faltaCosto.length > 0 && <span className="font-bold text-red-600"> · {faltaCosto.length} sin costo (complétalo para importar)</span>}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-widest text-slate-400">
                <tr><th className="p-2">Importar</th><th className="p-2">Producto</th><th className="p-2">Categoría</th><th className="p-2">Costo</th><th className="p-2">Stock</th><th className="p-2">Registro sanitario</th><th className="p-2">Precio Shopify</th></tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  const sinCosto = f.incluir && !(f.costo && f.costo > 0);
                  return (
                    <tr key={f.handle} className="border-t border-slate-100 align-top">
                      <td className="p-2"><input type="checkbox" checked={f.incluir} onChange={e => cambiar(i, { incluir: e.target.checked })} className="accent-teal-500" aria-label={`Importar ${f.nombre}`} /></td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          {f.imagenes[0] && <img src={f.imagenes[0]} alt="" className="h-10 w-10 rounded-lg object-cover" loading="lazy" />}
                          <span className="font-bold text-slate-800">{f.nombre}{!f.activo && <span className="ml-1 text-xs text-slate-400">(inactivo en Shopify)</span>}</span>
                        </div>
                      </td>
                      <td className="p-2">
                        <select className={input} value={f.categoria} onChange={e => cambiar(i, { categoria: e.target.value as CategoriaTienda })}>
                          {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </td>
                      <td className="p-2">
                        <input type="number" min={1} className={`${input} w-24 ${sinCosto ? 'border-red-400' : ''}`} value={f.costo ?? ''} placeholder="Costo"
                          onChange={e => cambiar(i, { costo: e.target.value ? Number(e.target.value) : null })} />
                      </td>
                      <td className="p-2"><input type="number" min={0} className={`${input} w-20`} value={f.stock} onChange={e => cambiar(i, { stock: Math.max(0, Number(e.target.value) || 0) })} /></td>
                      <td className="p-2"><input className={`${input} w-40`} value={f.registro} placeholder={f.categoria === 'suplementos' ? 'De la etiqueta' : 'Si aplica'} onChange={e => cambiar(i, { registro: e.target.value })} /></td>
                      <td className="p-2 text-slate-400">{clp(f.precioShopify)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={importar} disabled={!elegidas.length || faltaCosto.length > 0 || !!progreso}
              className="rounded-xl bg-teal-500 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">
              Importar {elegidas.length} como borrador
            </button>
            <button onClick={() => setFilas(null)} className="text-xs font-bold text-slate-500 underline">Cancelar</button>
            {progreso && <span className="text-sm text-slate-500">{progreso}</span>}
          </div>
          <p className="mt-2 text-xs text-slate-400">El precio de venta se calcula con tu fórmula (costo, margen y comisión); el de Shopify se muestra solo como referencia.</p>
        </div>
      )}

      {resultado && (
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
          <p className="font-bold text-slate-800">
            Importados {resultado.filter(r => r.ok).length} de {resultado.length}. Revísalos abajo en Productos y apruébalos para publicarlos.
          </p>
          <ul className="mt-2 space-y-1">
            {resultado.filter(r => !r.ok || r.fotosFallidas > 0).map((r, i) => (
              <li key={i} className={r.ok ? 'text-amber-700' : 'text-red-700'}>
                {r.nombre}: {r.ok ? `${r.fotosFallidas} foto(s) no se pudieron copiar` : r.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
