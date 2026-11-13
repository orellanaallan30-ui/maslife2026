// Bloque "Centro" en los Ajustes del profesional: aceptar una invitación, abrir el
// panel del centro que administra, o crear su propio centro (AgendaMas).

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCenter } from '../../CenterContext';
import { centerApi } from '../../centerService';
import { campo, etiqueta, botonPrimario, botonSecundario } from './Modal';
import { toast } from '../../lib/toast';
import { PRODUCT_NAME } from '../../brand';

const CentroEnAjustes: React.FC = () => {
  const { memberships, invites, puedeGestionar, active, reload, selectCenter } = useCenter();
  const navigate = useNavigate();
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState({ name: '', city: '', address: '', phone: '' });
  const [ocupado, setOcupado] = useState(false);

  if (memberships === null) return null;
  const activas = memberships.filter(m => m.status === 'active');

  const responder = async (centerId: string, accept: boolean) => {
    setOcupado(true);
    try { await centerApi.respondInvite(centerId, accept); await reload(); toast.success(accept ? 'Ahora eres parte del centro' : 'Invitación rechazada'); }
    catch (err) { toast.error((err as Error).message); }
    finally { setOcupado(false); }
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    try {
      const { centerId } = await centerApi.create(form);
      await reload(); selectCenter(centerId);
      toast.success('Centro creado');
      navigate('/centro/equipo');
    } catch (err) { toast.error((err as Error).message); }
    finally { setOcupado(false); }
  };

  const salir = async (centerId: string, memberId: string, nombre: string) => {
    if (!window.confirm(`¿Salir de ${nombre}? Su recepción dejará de ver tu agenda.`)) return;
    setOcupado(true);
    try { await centerApi.removeMember(centerId, memberId); await reload(); toast.success('Saliste del centro'); }
    catch (err) { toast.error((err as Error).message); }
    finally { setOcupado(false); }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 lg:p-8 space-y-4">
      <div>
        <h2 className="text-base font-black text-slate-900">Centro · {PRODUCT_NAME}</h2>
        <p className="text-sm text-slate-500 mt-1">Trabaja con recepción y boxes: una recepcionista agenda para todos los profesionales del centro y se lleva el control de horas de box.</p>
      </div>

      {invites.map(m => (
        <div key={m.memberId} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-black text-slate-900">{m.center.name} te invitó a su equipo</p>
          <p className="text-sm text-slate-600">Si aceptas, su recepción podrá ver y gestionar todas tus citas (agendar, reagendar, liberar) y los datos de contacto de tus pacientes. Nunca verá tus fichas clínicas. Puedes salir cuando quieras.</p>
          <div className="flex gap-2">
            <button type="button" className={botonPrimario} disabled={ocupado} onClick={() => responder(m.center.id, true)}>Aceptar</button>
            <button type="button" className={botonSecundario} disabled={ocupado} onClick={() => responder(m.center.id, false)}>Rechazar</button>
          </div>
        </div>
      ))}

      {activas.map(m => (
        <div key={m.memberId} className="flex flex-col lg:flex-row lg:items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-slate-900 truncate">{m.center.name}</p>
            <p className="text-xs font-semibold text-slate-500">{m.center.esDueno ? 'Eres el dueño' : m.role === 'admin' ? 'Administras este centro' : m.role === 'recepcion' ? 'Recepción' : 'Atiendes en este centro'}</p>
          </div>
          {(m.role === 'admin' || m.role === 'recepcion') && (
            <button type="button" className={botonPrimario} onClick={() => { selectCenter(m.center.id); navigate('/centro/recepcion'); }}>
              <span className="material-icons-round text-base">event_available</span>Abrir panel del centro
            </button>
          )}
          {!m.center.esDueno && (
            <button type="button" className={botonSecundario} disabled={ocupado} onClick={() => salir(m.center.id, m.memberId, m.center.name)}>Salir del centro</button>
          )}
        </div>
      ))}

      {!creando && (
        <button type="button" className={botonSecundario} onClick={() => setCreando(true)}>
          <span className="material-icons-round text-base">add_business</span>{puedeGestionar && active ? 'Crear otro centro' : 'Crear mi centro'}
        </button>
      )}

      {creando && (
        <form onSubmit={crear} className="border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className={etiqueta} htmlFor="cc-nombre">Nombre del centro</label>
              <input id="cc-nombre" className={campo} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej: Centro Kinésico Ovalle" autoFocus />
            </div>
            <div>
              <label className={etiqueta} htmlFor="cc-ciudad">Ciudad</label>
              <input id="cc-ciudad" className={campo} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <label className={etiqueta} htmlFor="cc-dir">Dirección</label>
              <input id="cc-dir" className={campo} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label className={etiqueta} htmlFor="cc-tel">Teléfono</label>
              <input id="cc-tel" type="tel" className={campo} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-slate-500">Quedarás como administrador y como profesional del centro. Después podrás agregar recepción, invitar profesionales y crear boxes.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className={botonSecundario} onClick={() => setCreando(false)}>Cancelar</button>
            <button type="submit" className={botonPrimario} disabled={ocupado || form.name.trim().length < 3}>{ocupado ? 'Creando…' : 'Crear centro'}</button>
          </div>
        </form>
      )}
    </section>
  );
};

export default CentroEnAjustes;
