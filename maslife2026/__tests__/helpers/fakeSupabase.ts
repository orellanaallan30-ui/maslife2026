import { randomUUID } from 'crypto';

// Mini Supabase en memoria para probar la lógica de pedidos sin red.
// Soporta lo que usan api/_lib/orders.ts y api/notify.ts: insert, update, select,
// eq, is, maybeSingle, single y await directo. Las escrituras se aplican una sola
// vez, al ejecutar la consulta.
export type Tables = Record<string, any[]>;

export function makeFakeSupabase(
  tables: Tables,
  signUrl: (path: string) => { data: any; error: any } = p => ({ data: { signedUrl: `https://signed.example/${p}` }, error: null }),
) {
  const builder = (table: string) => {
    let op: 'select' | 'insert' | 'update' = 'select';
    let patch: any = null;
    let inserted: any = null;
    const filters: Array<(r: any) => boolean> = [];
    const run = () => {
      const rows = (tables[table] ||= []);
      if (op === 'insert') {
        const row = { id: randomUUID(), status: 'pendiente', currency: 'CLP', download_count: 0, max_downloads: 5, delivered_at: null, mp_payment_id: null, ...inserted };
        rows.push(row);
        return { data: [row], error: null };
      }
      const matched = rows.filter(r => filters.every(f => f(r)));
      if (op === 'update') matched.forEach(r => Object.assign(r, patch));
      return { data: matched, error: null };
    };
    const b: any = {
      select: () => b,
      insert: (v: any) => { op = 'insert'; inserted = v; return b; },
      update: (v: any) => { op = 'update'; patch = v; return b; },
      eq: (c: string, v: any) => { filters.push(r => r[c] === v); return b; },
      is: (c: string, v: any) => { filters.push(r => r[c] === v); return b; },
      maybeSingle: async () => { const r = run().data[0]; return { data: r ? { ...r } : null, error: null }; },
      single: async () => { const r = run().data[0]; return { data: r ? { ...r } : null, error: null }; },
      then: (res: any, rej?: any) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  return {
    from: builder,
    storage: { from: () => ({ createSignedUrl: async (path: string) => signUrl(path) }) },
  };
}
