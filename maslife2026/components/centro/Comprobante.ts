// Comprobante interno de pago (recepción): se abre en una ventana aparte y se imprime.
// No es una boleta electrónica (SII): lo dice el propio documento.

import { pesos, nombreMedio, fechaLarga } from '../../centerService';

export interface DatosComprobante {
  centro: { name: string; address?: string; city?: string; phone?: string };
  numero: string;          // id del cobro (se muestran los primeros 8 caracteres)
  fechaPago: string;       // ISO
  paciente: string;
  profesional: string;
  servicio: string;
  citaFecha?: string | null;
  citaHora?: string;
  monto: number;
  medio: string;
  referencia?: string;
  nota?: string;
  recibidoPor?: string;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function imprimirComprobante(d: DatosComprobante): boolean {
  const w = window.open('', '_blank', 'width=480,height=720');
  if (!w) return false;
  const fecha = new Date(d.fechaPago);
  const cuando = `${fecha.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}, ${fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
  const fila = (k: string, v: string) => v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : '';
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${esc(d.numero.slice(0, 8))}</title>
<style>
  *{box-sizing:border-box} body{font-family:Manrope,system-ui,-apple-system,Segoe UI,sans-serif;color:#0F172A;margin:0;padding:28px;background:#fff}
  .c{max-width:380px;margin:0 auto;border:1px solid #E2E8F0;border-radius:18px;padding:24px}
  h1{font-size:18px;margin:0 0 2px} .m{color:#475569;font-size:12px;margin:0}
  .t{margin:18px 0 6px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#4F46E5}
  table{width:100%;border-collapse:collapse;font-size:13px} th{text-align:left;color:#475569;font-weight:600;padding:5px 0;width:42%;vertical-align:top} td{font-weight:700;padding:5px 0}
  .total{margin-top:14px;padding:14px;border-radius:14px;background:#EEF2FF;display:flex;justify-content:space-between;align-items:center}
  .total span{font-size:12px;font-weight:700;color:#3730A3} .total b{font-size:22px}
  .l{margin-top:16px;font-size:11px;color:#64748B;line-height:1.5}
  .b{margin:18px auto 0;display:block;font:700 14px Manrope,sans-serif;color:#fff;background:#4F46E5;border:0;border-radius:12px;padding:10px 18px;cursor:pointer}
  @media print{body{padding:0}.c{border:0}.b{display:none}}
</style></head><body><div class="c">
  <h1>${esc(d.centro.name)}</h1>
  <p class="m">${esc([d.centro.address, d.centro.city].filter(Boolean).join(', '))}${d.centro.phone ? ` · ${esc(d.centro.phone)}` : ''}</p>
  <p class="t">Comprobante de pago N.º ${esc(d.numero.slice(0, 8).toUpperCase())}</p>
  <table>
    ${fila('Fecha de pago', cuando)}
    ${fila('Paciente', d.paciente)}
    ${fila('Profesional', d.profesional)}
    ${fila('Servicio', d.servicio || 'Consulta')}
    ${fila('Cita', d.citaFecha ? `${fechaLarga(d.citaFecha)} ${d.citaHora || ''}` : '')}
    ${fila('Medio de pago', nombreMedio(d.medio))}
    ${fila('Referencia', d.referencia || '')}
    ${fila('Nota', d.nota || '')}
    ${fila('Recibido por', d.recibidoPor || '')}
  </table>
  <div class="total"><span>Total pagado</span><b>${esc(pesos(d.monto))}</b></div>
  <p class="l">Comprobante interno de pago. No reemplaza la boleta electrónica.</p>
  <button class="b" onclick="window.print()">Imprimir</button>
</div></body></html>`);
  w.document.close();
  w.focus();
  return true;
}
